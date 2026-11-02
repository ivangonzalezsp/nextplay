import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Unzip, UnzipInflate, unzipSync, zipSync } from 'fflate';
import {
    MAX_BACKUP_BYTES,
    MAX_BACKUP_ZIP_BYTES,
    type BackupPreview,
} from '../lib/backups.ts';
import { AppError, dataDir, exclusive } from './store.ts';
import { canManage } from './local-access.ts';
import {
    activateBackup,
    backupError,
    checksum,
    databaseCopy,
    validateBackup,
} from './library-backup.ts';
import { t } from './i18n.ts';

type Staged = {
    token: string;
    folder: string;
    digest: string;
    expiresAt: number;
    timer: ReturnType<typeof setTimeout>;
};
let staged: Staged | undefined;
async function discard() {
    const previous = staged;
    staged = undefined;
    if (previous) {
        clearTimeout(previous.timer);
        await rm(previous.folder, { recursive: true, force: true });
    }
}

// Names are an allowlist, never extraction paths. Bound actual output as well as declared ZIP sizes.
export function unpackBackup(bytes: Uint8Array) {
    try {
        if (bytes.length > MAX_BACKUP_ZIP_BYTES || bytes.length < 22)
            throw backupError();
        const declared = new Set<string>();
        unzipSync(bytes, {
            filter: (file) => {
                const limit =
                    file.name === 'manifest.json' ? 4096 : MAX_BACKUP_BYTES;
                if (
                    !['manifest.json', 'library.sqlite'].includes(file.name) ||
                    declared.has(file.name) ||
                    file.originalSize > limit ||
                    ![0, 8].includes(file.compression)
                )
                    throw backupError();
                declared.add(file.name);
                return false;
            },
        });
        if (declared.size !== 2) throw backupError();
        const files = new Map<string, Buffer>();
        const seen = new Set<string>();
        const unzip = new Unzip((file) => {
            if (!declared.has(file.name) || seen.has(file.name))
                throw backupError();
            seen.add(file.name);
            let size = 0;
            const chunks: Uint8Array[] = [];
            const limit =
                file.name === 'manifest.json' ? 4096 : MAX_BACKUP_BYTES;
            file.ondata = (error, chunk, final) => {
                if (error) throw error;
                size += chunk.length;
                if (size > limit) throw backupError();
                chunks.push(chunk);
                if (final) files.set(file.name, Buffer.concat(chunks));
            };
            file.start();
        });
        unzip.register(UnzipInflate);
        for (let offset = 0; offset < bytes.length; offset += 16_384)
            unzip.push(
                bytes.subarray(offset, offset + 16_384),
                offset + 16_384 >= bytes.length,
            );
        if (files.size !== 2) throw backupError();
        const manifest = JSON.parse(
            files.get('manifest.json')!.toString('utf8'),
        );
        const database = files.get('library.sqlite')!;
        if (
            manifest.format !== 'nextplay-backup' ||
            manifest.version !== 1 ||
            typeof manifest.createdAt !== 'string' ||
            !Number.isFinite(Date.parse(manifest.createdAt)) ||
            manifest.sha256 !== checksum(database) ||
            manifest.bytes !== database.length ||
            database.subarray(0, 16).toString() !== 'SQLite format 3\0'
        )
            throw backupError();
        return { database, createdAt: manifest.createdAt as string };
    } catch {
        throw backupError();
    }
}

async function readUpload(request: Request) {
    if (Number(request.headers.get('content-length')) > MAX_BACKUP_ZIP_BYTES)
        throw backupError();
    const reader = request.body?.getReader();
    if (!reader) throw backupError();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > MAX_BACKUP_ZIP_BYTES) throw backupError();
            chunks.push(value);
        }
    } finally {
        await reader.cancel();
    }
    return Buffer.concat(chunks);
}

async function exportZip() {
    await mkdir(dataDir(), { recursive: true });
    const folder = await mkdtemp(join(dataDir(), '.zip-export-'));
    try {
        const database = await databaseCopy(join(folder, 'library.sqlite'));
        if (database.length > MAX_BACKUP_BYTES) throw backupError();
        validateBackup(
            join(folder, 'library.sqlite'),
            join(folder, 'expected.sqlite'),
        );
        const createdAt = new Date().toISOString();
        const bytes = zipSync({
            'manifest.json': Buffer.from(
                JSON.stringify({
                    format: 'nextplay-backup',
                    version: 1,
                    createdAt,
                    bytes: database.length,
                    sha256: checksum(database),
                }),
            ),
            'library.sqlite': new Uint8Array(database),
        });
        return new Response(new Uint8Array(bytes), {
            headers: {
                'Content-Type': 'application/zip',
                'Cache-Control': 'no-store',
                'X-Content-Type-Options': 'nosniff',
                'Content-Disposition': `attachment; filename="NextPlay-${createdAt.replace(/[:.]/g, '-')}.zip"`,
            },
        });
    } finally {
        await rm(folder, { recursive: true, force: true });
    }
}

async function preview(request: Request): Promise<BackupPreview> {
    const { database, createdAt } = unpackBackup(await readUpload(request));
    await mkdir(dataDir(), { recursive: true });
    const folder = await mkdtemp(join(dataDir(), '.zip-import-'));
    try {
        const incoming = join(folder, 'library.sqlite');
        await writeFile(incoming, database, { flag: 'wx', mode: 0o600 });
        const state = validateBackup(incoming, join(folder, 'expected.sqlite'));
        const current = await databaseCopy(join(folder, 'current.sqlite'));
        await discard();
        const token = randomUUID();
        const timer = setTimeout(() => {
            void exclusive(discard).catch(() => {});
        }, 15 * 60_000);
        timer.unref();
        staged = {
            folder,
            token,
            timer,
            expiresAt: Date.now() + 15 * 60_000,
            digest: checksum(current),
        };
        return {
            token,
            createdAt,
            games: state.games.length,
            preferences: Object.keys(state.preferences).length,
            recommendations: state.history?.length ?? 0,
            playEvents: state.playHistory?.length ?? 0,
        };
    } catch (error) {
        await rm(folder, { recursive: true, force: true });
        throw error;
    }
}

export async function manageLocalBackup(
    request: Request,
    payload: Record<string, unknown> = {},
) {
    if (!canManage(request))
        throw new AppError(
            t('Gestiona las copias desde el PC donde se ejecuta Next Play.'),
            403,
        );
    if (request.method !== 'POST')
        throw new AppError(t('Esta operación no existe.'), 404);
    const path = new URL(request.url).pathname;
    return exclusive(async () => {
        if (path === '/api/backups/export' && !Object.keys(payload).length)
            return exportZip();
        if (path === '/api/backups/validate') {
            if (request.headers.get('content-type') !== 'application/zip')
                throw new AppError(t('Selecciona un ZIP de Next Play.'), 415);
            return Response.json(await preview(request));
        }
        if (!['/api/backups/restore', '/api/backups/cancel'].includes(path))
            throw new AppError(t('Esta operación no existe.'), 404);
        if (staged && Date.now() >= staged.expiresAt) await discard();
        if (
            Object.keys(payload).length !== 1 ||
            typeof payload.token !== 'string' ||
            payload.token !== staged?.token
        )
            throw new AppError(
                t('La copia validada ha caducado. Selecciona de nuevo el ZIP.'),
                409,
            );
        if (path.endsWith('/cancel')) {
            await discard();
            return Response.json({ cancelled: true });
        }
        const candidate = staged!;
        staged = undefined;
        clearTimeout(candidate.timer);
        try {
            const current = await databaseCopy(
                join(candidate.folder, 'latest.sqlite'),
            );
            if (checksum(current) !== candidate.digest)
                throw new AppError(
                    t(
                        'La biblioteca ha cambiado desde la validación. Selecciona de nuevo el ZIP para revisarlo.',
                    ),
                    409,
                );
            const incoming = join(candidate.folder, 'library.sqlite');
            validateBackup(incoming, join(candidate.folder, 'expected.sqlite'));
            return Response.json(await activateBackup(incoming, 'zip'));
        } finally {
            await rm(candidate.folder, { recursive: true, force: true });
        }
    });
}
