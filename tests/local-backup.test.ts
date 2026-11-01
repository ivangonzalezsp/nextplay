import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import {
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    rm,
    writeFile,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { IncomingMessage } from 'node:http';
import { unzipSync, zipSync } from 'fflate';
import { EMPTY_STATE, type State } from '../lib/model.ts';
import { MAX_BACKUP_ZIP_BYTES, type BackupPreview } from '../lib/backups.ts';
import { attestLocalPeer } from '../server/local-access.ts';
import { handle } from '../server/api.ts';
import { readState, saveState } from '../server/store.ts';
import { checksum } from '../server/library-backup.ts';
import { unpackBackup } from '../server/local-backup.ts';
import { openDatabase, storeState } from '../server/database.ts';

function request(
    action: string,
    body: Uint8Array | Record<string, unknown>,
    local = true,
) {
    const incoming = {
        headers: {},
        socket: { remoteAddress: local ? '127.0.0.1' : '192.168.1.5' },
    } as unknown as IncomingMessage;
    attestLocalPeer(incoming);
    return new Request('http://127.0.0.1:3012/api/backups/' + action, {
        method: 'POST',
        headers: {
            ...(incoming.headers as Record<string, string>),
            'Content-Type':
                body instanceof Uint8Array
                    ? 'application/zip'
                    : 'application/json',
        },
        body:
            body instanceof Uint8Array
                ? new Uint8Array(body)
                : JSON.stringify(body),
    });
}
async function isolated(t: TestContext) {
    const base = resolve('work/local-backup-tests');
    await mkdir(base, { recursive: true });
    const folder = await mkdtemp(join(base, 'profile-'));
    const previousEnv = { ...process.env };
    process.env.NEXTPLAY_DATA_DIR = folder;
    process.env.NEXTPLAY_USER_DIR = folder;
    t.after(async () => {
        process.env = previousEnv;
        await rm(folder, { recursive: true, force: true });
    });
    const state: State = {
        ...structuredClone(EMPTY_STATE),
        games: [
            {
                appId: -42,
                name: 'Manual',
                owned: true,
                playtimeMinutes: null,
                recentMinutes: null,
            },
        ],
        preferences: { '-42': { status: 'completed', favorite: true } },
        playHistory: [{ appId: -42, name: 'Manual', kind: 'completed', at: 2 }],
        history: [
            {
                id: 'saved',
                text: 'Recommendation',
                filters: structuredClone(EMPTY_STATE.filters),
                result: {
                    at: 1,
                    message: 'Saved',
                    owned: [],
                    discoveries: [],
                    warnings: [],
                },
            },
        ],
    };
    await saveState(state);
    await writeFile(
        join(folder, 'settings.json'),
        '{"secret":"never-export-this"}',
    );
    return { folder, state: await readState() };
}
const exportZip = async () => {
    const response = await handle(request('export', {}));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'application/zip');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(
        response.headers.get('Cross-Origin-Resource-Policy'),
        'same-origin',
    );
    assert.match(
        response.headers.get('Content-Disposition')!,
        /NextPlay-.*\.zip/,
    );
    return new Uint8Array(await response.arrayBuffer());
};
async function previewZip(bytes: Uint8Array) {
    const response = await handle(request('validate', bytes));
    assert.equal(
        response.status,
        200,
        JSON.stringify(await response.clone().json()),
    );
    return (await response.json()) as BackupPreview;
}

void test('local ZIP: preview, cancellation, changed-library guard and lossless restore with recovery', async (t) => {
    const { folder, state } = await isolated(t);
    const original = await readFile(join(folder, 'library.sqlite'));
    const bytes = await exportZip();
    const files = unzipSync(bytes);
    assert.deepEqual(Object.keys(files).sort(), [
        'library.sqlite',
        'manifest.json',
    ]);
    assert.equal(
        Buffer.from(files['library.sqlite']).includes(
            Buffer.from('never-export-this'),
        ),
        false,
    );
    const preview = await previewZip(bytes);
    assert.deepEqual(
        {
            games: preview.games,
            preferences: preview.preferences,
            history: preview.recommendations,
            events: preview.playEvents,
        },
        { games: 1, preferences: 1, history: 1, events: 1 },
    );
    assert.deepEqual(await readFile(join(folder, 'library.sqlite')), original);
    assert.equal(
        (await handle(request('restore', { token: 'forged' }))).status,
        409,
    );
    assert.equal(
        (await handle(request('cancel', { token: preview.token }))).status,
        200,
    );
    assert.equal(
        (await handle(request('restore', { token: preview.token }))).status,
        409,
    );
    const expired = await previewZip(bytes);
    const originalNow = Date.now;
    Date.now = () => originalNow() + 16 * 60_000;
    try {
        assert.equal(
            (await handle(request('restore', { token: expired.token }))).status,
            409,
        );
    } finally {
        Date.now = originalNow;
    }
    const stale = await previewZip(bytes);
    const current = {
        ...state,
        preferences: { '-42': { status: 'playing' as const, favorite: false } },
    };
    await saveState(current);
    const conflict = await handle(request('restore', { token: stale.token }));
    assert.equal(conflict.status, 409);
    assert.deepEqual(await readState(), current);
    const ready = await previewZip(bytes);
    assert.equal(
        (await handle(request('restore', { token: ready.token }))).status,
        200,
    );
    assert.deepEqual(await readState(), state);
    assert.equal(
        await readFile(join(folder, 'settings.json'), 'utf8'),
        '{"secret":"never-export-this"}',
    );
    const recoveryFiles = await readdir(join(folder, 'backups'));
    assert.equal(recoveryFiles.length, 1);
    const recovery = openDatabase(
        join(folder, 'backups', recoveryFiles[0]),
        true,
    );
    try {
        assert.equal(
            Object.values(recovery.prepare('PRAGMA integrity_check').get()!)[0],
            'ok',
        );
        assert.equal(
            JSON.parse(
                String(
                    recovery.prepare('SELECT data FROM app_state').get()!.data,
                ),
            ).preferences['-42'].status,
            'playing',
        );
    } finally {
        recovery.close();
    }
    assert.equal(
        (await readdir(folder)).some((name) => name.startsWith('.zip-')),
        false,
    );
});

void test('local ZIP: damaged files, traversal, bombs, incompatible data and denied access never replace the library', async (t) => {
    const { folder, state } = await isolated(t);
    const bytes = await exportZip();
    const original = await readFile(join(folder, 'library.sqlite'));
    const files = unzipSync(bytes);
    const manifest = JSON.parse(Buffer.from(files['manifest.json']).toString());
    const unauthorized = request('validate', bytes, false);
    assert.equal((await handle(unauthorized)).status, 403);
    assert.equal(unauthorized.bodyUsed, false);
    const crossSite = request('validate', bytes);
    crossSite.headers.set('Origin', 'https://attacker.invalid');
    assert.equal((await handle(crossSite)).status, 403);
    const tooLarge = request('validate', bytes);
    tooLarge.headers.set('Content-Length', String(MAX_BACKUP_ZIP_BYTES + 1));
    assert.equal((await handle(tooLarge)).status, 400);
    const malformed = [
        new Uint8Array([1, 2, 3]),
        bytes.subarray(0, bytes.length - 10),
        zipSync({ 'library.sqlite': files['library.sqlite'] }),
        zipSync({ ...files, '../escape': new Uint8Array([1]) }),
        zipSync({
            ...files,
            'manifest.json': Buffer.from(
                JSON.stringify({ ...manifest, version: 99 }),
            ),
        }),
        zipSync({
            ...files,
            'manifest.json': Buffer.from(
                JSON.stringify({ ...manifest, sha256: 'bad' }),
            ),
        }),
        zipSync({ ...files, 'library.sqlite': new Uint8Array([1, 2, 3]) }),
    ];
    for (const invalid of malformed) {
        const response = await handle(request('validate', invalid));
        assert.equal(response.status, 400);
        assert.deepEqual(
            await readFile(join(folder, 'library.sqlite')),
            original,
        );
    }
    // A small declared size must not bypass the actual decompression limit.
    const bomb = Buffer.from(
        zipSync({
            'manifest.json': Buffer.alloc(100_000, 65),
            'library.sqlite': files['library.sqlite'],
        }),
    );
    bomb.writeUInt32LE(10, 22);
    for (let offset = 0; offset < bomb.length - 46; offset++)
        if (
            bomb.readUInt32LE(offset) === 0x02014b50 &&
            bomb.subarray(offset + 46, offset + 59).toString() ===
                'manifest.json'
        )
            bomb.writeUInt32LE(10, offset + 24);
    assert.throws(() => unpackBackup(bomb), /dañada/);
    const duplicate = Buffer.from(
        zipSync({ ...files, 'manifest.jsox': files['manifest.json'] }),
    );
    const find = Buffer.from('manifest.jsox');
    for (
        let offset = duplicate.indexOf(find);
        offset >= 0;
        offset = duplicate.indexOf(find, offset + 1)
    )
        duplicate.write('manifest.json', offset);
    assert.throws(() => unpackBackup(duplicate), /dañada/);
    const invalidDb = join(folder, 'invalid.sqlite');
    const db = openDatabase(invalidDb);
    try {
        storeState(db, {
            ...state,
            preferences: {
                '-42': { status: 'bogus' as never, favorite: true },
            },
        });
    } finally {
        db.close();
    }
    const database = await readFile(invalidDb);
    const invalidData = zipSync({
        'library.sqlite': database,
        'manifest.json': Buffer.from(
            JSON.stringify({
                ...manifest,
                bytes: database.length,
                sha256: checksum(database),
            }),
        ),
    });
    assert.equal((await handle(request('validate', invalidData))).status, 400);
    const brokenDatabase = Buffer.alloc(512);
    brokenDatabase.write('SQLite format 3\0');
    const brokenSqlite = zipSync({
        'library.sqlite': brokenDatabase,
        'manifest.json': Buffer.from(
            JSON.stringify({
                ...manifest,
                bytes: brokenDatabase.length,
                sha256: checksum(brokenDatabase),
            }),
        ),
    });
    assert.equal((await handle(request('validate', brokenSqlite))).status, 400);
    const ready = await previewZip(bytes);
    // Simulate inability to create the recovery directory: activation must never start.
    await writeFile(join(folder, 'backups'), 'blocked');
    assert.equal(
        (await handle(request('restore', { token: ready.token }))).status,
        500,
    );
    assert.deepEqual(await readFile(join(folder, 'library.sqlite')), original);
    assert.deepEqual(await readState(), state);
});
