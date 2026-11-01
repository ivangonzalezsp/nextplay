import { createServer, type Server } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
    AppError,
    atomicJson,
    dataDir,
    exclusive,
    readJson,
    readState,
    userDir,
} from './store.ts';
import { backupDatabase, openDatabase } from './database.ts';
import { activateBackup, validateBackup } from './library-backup.ts';
import { canManage } from './local-access.ts';
import { t } from './i18n.ts';
import type { DriveBackup, DriveStatus } from '../lib/google-drive.ts';

const scope = 'https://www.googleapis.com/auth/drive.file';
const maxBytes = 256 * 1024 * 1024;
const api = 'https://www.googleapis.com/drive/v3/files';
const tokenUrl = 'https://oauth2.googleapis.com/token';
type Credentials = {
    clientId: string;
    clientSecret: string;
    refreshToken?: string;
};
const credentialsPath = () => join(userDir(), 'google-drive.json');
let pending:
    | { server: Server; timer: ReturnType<typeof setTimeout>; profile: string }
    | undefined;
let loginError = '';

function stopLogin() {
    if (pending) {
        clearTimeout(pending.timer);
        pending.server.close();
        pending = undefined;
    }
}

async function credentials() {
    return readJson<Credentials | null>(credentialsPath(), null);
}

async function status(request: Request): Promise<DriveStatus> {
    const local = canManage(request);
    const saved = local ? await credentials() : null;
    return {
        canManage: local,
        configured: !!saved,
        connected: !!saved?.refreshToken,
        pending: local && pending?.profile === credentialsPath(),
        ...(local && loginError ? { error: t(loginError) } : {}),
    };
}

async function token(params: Record<string, string>) {
    const response = await fetch(tokenUrl, {
        method: 'POST',
        body: new URLSearchParams(params),
        signal: AbortSignal.timeout(30_000),
        redirect: 'error',
    });
    if (!response.ok)
        throw new AppError(
            t(
                'No se pudo autorizar Google Drive. Vuelve a conectar tu cuenta.',
            ),
            502,
        );
    const result = await response.json();
    if (typeof result.access_token !== 'string' || !result.access_token)
        throw new AppError(t('Google devolvió una respuesta no válida.'), 502);
    return result as {
        access_token: string;
        refresh_token?: string;
        scope?: string;
    };
}

async function startLogin() {
    const saved = await credentials();
    if (!saved)
        throw new AppError(t('Configura primero el cliente OAuth de Google.'));
    stopLogin();
    loginError = '';
    const profile = credentialsPath();
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    let redirectUri = '';
    let consumed = false;
    const server = createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        if (
            req.method !== 'GET' ||
            url.pathname !== '/oauth2/callback' ||
            url.searchParams.get('state') !== state ||
            consumed
        ) {
            res.writeHead(400).end('Invalid OAuth callback.');
            return;
        }
        consumed = true;
        void (async () => {
            try {
                const code = url.searchParams.get('code');
                if (!code || url.searchParams.has('error'))
                    throw new Error('denied');
                const result = await token({
                    client_id: saved.clientId,
                    client_secret: saved.clientSecret,
                    code,
                    code_verifier: verifier,
                    redirect_uri: redirectUri,
                    grant_type: 'authorization_code',
                });
                if (
                    !result.refresh_token ||
                    (result.scope && !result.scope.split(' ').includes(scope))
                )
                    throw new Error('scope');
                await exclusive(async () => {
                    if (
                        pending?.server !== server ||
                        profile !== credentialsPath()
                    )
                        throw new Error('cancelled');
                    await atomicJson(profile, {
                        ...saved,
                        refreshToken: result.refresh_token,
                    });
                });
                res.writeHead(200, {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Cache-Control': 'no-store',
                    'Referrer-Policy': 'no-referrer',
                });
                res.end(
                    'Google Drive conectado. Puedes cerrar esta pestaña. / Google Drive connected. You can close this tab.',
                );
            } catch {
                if (pending?.server === server)
                    loginError =
                        'No se pudo autorizar Google Drive. Vuelve a conectar tu cuenta.';
                res.writeHead(400, {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Cache-Control': 'no-store',
                });
                res.end(
                    'No se pudo conectar. Vuelve a Next Play. / Connection failed. Return to Next Play.',
                );
            } finally {
                if (pending?.server === server) stopLogin();
            }
        })();
    });
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            server.removeListener('error', reject);
            resolve();
        });
    });
    server.unref();
    const address = server.address();
    if (!address || typeof address === 'string')
        throw new Error('OAuth listener unavailable');
    redirectUri = `http://127.0.0.1:${address.port}/oauth2/callback`;
    const timer = setTimeout(() => {
        loginError = 'La conexión con Google ha caducado. Inténtalo de nuevo.';
        stopLogin();
    }, 5 * 60_000);
    timer.unref();
    pending = { server, timer, profile };
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
        client_id: saved.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope,
        state,
        code_challenge: createHash('sha256')
            .update(verifier)
            .digest('base64url'),
        code_challenge_method: 'S256',
        access_type: 'offline',
        prompt: 'consent',
    }).toString();
    return { url: url.href };
}

async function accessToken() {
    const saved = await credentials();
    if (!saved?.refreshToken)
        throw new AppError(t('Conecta primero tu cuenta de Google.'));
    return (
        await token({
            client_id: saved.clientId,
            client_secret: saved.clientSecret,
            refresh_token: saved.refreshToken,
            grant_type: 'refresh_token',
        })
    ).access_token;
}

async function driveFetch(
    url: string | URL,
    access: string,
    init: RequestInit = {},
) {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${access}`);
    const response = await fetch(url, {
        ...init,
        headers,
        signal: AbortSignal.timeout(120_000),
        redirect: 'error',
    });
    if (!response.ok)
        throw new AppError(
            t(
                'No se pudo completar la operación en Google Drive. Comprueba la conexión y los permisos.',
            ),
            502,
        );
    return response;
}

async function listBackups() {
    const access = await accessToken();
    const files: DriveBackup[] = [];
    let pageToken = '';
    do {
        const url = new URL(api);
        url.search = new URLSearchParams({
            q: "trashed = false and appProperties has { key='nextplayBackup' and value='1' }",
            fields: 'nextPageToken,files(id,name,createdTime,size)',
            orderBy: 'createdTime desc',
            pageSize: '100',
            ...(pageToken ? { pageToken } : {}),
        }).toString();
        const result = await (await driveFetch(url, access)).json();
        files.push(...result.files);
        pageToken = result.nextPageToken ?? '';
    } while (pageToken);
    return { files };
}

async function exportBackup() {
    const access = await accessToken();
    await readState();
    const folder = await mkdtemp(join(dataDir(), '.drive-export-'));
    try {
        const path = join(folder, 'library.sqlite');
        const db = openDatabase(join(dataDir(), 'library.sqlite'), true);
        try {
            backupDatabase(db, path);
        } finally {
            db.close();
        }
        const bytes = await readFile(path);
        if (bytes.length > maxBytes)
            throw new AppError(t('La copia supera el límite de 256 MB.'));
        const name = `NextPlay-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`;
        const response = await driveFetch(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name',
            access,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Upload-Content-Type': 'application/vnd.sqlite3',
                    'X-Upload-Content-Length': String(bytes.length),
                },
                body: JSON.stringify({
                    name,
                    appProperties: { nextplayBackup: '1' },
                }),
            },
        );
        const location = response.headers.get('location');
        if (
            !location ||
            new URL(location).origin !== 'https://www.googleapis.com'
        )
            throw new AppError(
                t('Google devolvió una respuesta no válida.'),
                502,
            );
        await driveFetch(location, access, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/vnd.sqlite3' },
            body: new Uint8Array(bytes),
        });
        return { name };
    } finally {
        await rm(folder, { recursive: true, force: true });
    }
}

async function downloadBackup(id: string, destination: string) {
    const access = await accessToken();
    const meta = await (
        await driveFetch(
            `${api}/${id}?fields=appProperties,size,trashed`,
            access,
        )
    ).json();
    if (meta.trashed || meta.appProperties?.nextplayBackup !== '1')
        throw new AppError(t('Selecciona una copia de Next Play.'));
    if (!Number.isFinite(Number(meta.size)) || Number(meta.size) > maxBytes)
        throw new AppError(t('La copia supera el límite de 256 MB.'));
    const response = await driveFetch(`${api}/${id}?alt=media`, access);
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body!.getReader();
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > maxBytes)
                throw new AppError(t('La copia supera el límite de 256 MB.'));
            chunks.push(value);
        }
    } finally {
        await reader.cancel();
    }
    await writeFile(destination, Buffer.concat(chunks));
}

async function restoreBackup(id: string) {
    await readState();
    const folder = await mkdtemp(join(dataDir(), '.drive-restore-'));
    const incoming = join(folder, 'library.sqlite');
    try {
        await downloadBackup(id, incoming);
        validateBackup(incoming, join(folder, 'expected.sqlite'));
        return await activateBackup(incoming, 'drive');
    } finally {
        await rm(folder, { recursive: true, force: true });
    }
}

export async function manageDrive(
    request: Request,
    payload: Record<string, unknown>,
) {
    const path = new URL(request.url).pathname;
    if (path === '/api/drive/status' && request.method === 'GET')
        return status(request);
    if (!canManage(request))
        throw new AppError(
            t('Gestiona Google Drive desde el PC donde se ejecuta Next Play.'),
            403,
        );
    if (path === '/api/drive/backups' && request.method === 'GET')
        return exclusive(listBackups);
    if (request.method !== 'POST')
        throw new AppError(t('Esta operación no existe.'), 404);
    return exclusive(async () => {
        if (path === '/api/drive/configure') {
            const value = payload.installed as
                Record<string, unknown> | undefined;
            if (
                Object.keys(payload).length !== 1 ||
                !value ||
                typeof value.client_id !== 'string' ||
                !/^[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$/.test(
                    value.client_id,
                ) ||
                typeof value.client_secret !== 'string' ||
                !value.client_secret ||
                value.client_secret.length > 500
            )
                throw new AppError(
                    t(
                        'Selecciona el JSON OAuth de una aplicación de escritorio de Google.',
                    ),
                );
            stopLogin();
            loginError = '';
            await atomicJson(credentialsPath(), {
                clientId: value.client_id,
                clientSecret: value.client_secret,
            });
            return status(request);
        }
        if (path === '/api/drive/restore') {
            if (
                Object.keys(payload).length !== 1 ||
                typeof payload.id !== 'string' ||
                !/^[a-zA-Z0-9_-]{1,200}$/.test(payload.id)
            )
                throw new AppError(t('Selecciona una copia de Next Play.'));
            return restoreBackup(payload.id);
        }
        if (Object.keys(payload).length)
            throw new AppError(t('Esta operación no acepta parámetros.'));
        if (path === '/api/drive/connect') return startLogin();
        if (path === '/api/drive/cancel') {
            stopLogin();
            loginError = '';
            return status(request);
        }
        if (path === '/api/drive/disconnect') {
            stopLogin();
            loginError = '';
            const saved = await credentials();
            if (saved) {
                // Remove this PC's token without revoking other Next Play installations.
                await atomicJson(credentialsPath(), {
                    clientId: saved.clientId,
                    clientSecret: saved.clientSecret,
                });
            }
            return status(request);
        }
        if (path === '/api/drive/export') return exportBackup();
        throw new AppError(t('Esta operación no existe.'), 404);
    });
}
