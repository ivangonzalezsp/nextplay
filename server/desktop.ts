import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify, parseEnv } from 'node:util';
import { access, cp, mkdir, readFile, rm } from 'node:fs/promises';
import { renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { networkInterfaces } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { AppStatus } from '../lib/desktop.ts';
import {
    AppError,
    atomicJson,
    config,
    connectionKeys,
    dataDir,
    enterMaintenance,
    exclusive,
    readJson,
    readState,
    saveConnections,
    settingsPath,
    userDir,
    userSettings,
    validateConnections,
    validState,
    type UserSettings,
} from './store.ts';
import { canManage } from './local-access.ts';
import {
    codexBinary,
    codexEnv,
    codexStatus,
    trackCodexProcess,
} from './codex.ts';
import {
    appVersion,
    checkUpdates,
    prepareUpdate,
    updateStatus,
} from './updates.ts';
import {
    backupDatabase,
    loadState,
    openDatabase,
    storeState,
} from './database.ts';

const execute = promisify(execFile);
let loginChild: ChildProcess | undefined;
let login: AppStatus['login'] = { state: 'idle', message: '' };
function requireInstalled() {
    if (process.env.NEXTPLAY_INSTALLED !== '1')
        throw new AppError(
            'Esta opción está disponible en la versión instalada de Next Play.',
            409,
        );
}
export async function cancelLogin() {
    const child = loginChild;
    login = { state: 'idle', message: 'Conexión cancelada.' };
    if (child && child.exitCode === null && child.signalCode === null) {
        await new Promise<void>((done, fail) => {
            const timer = setTimeout(
                () =>
                    fail(
                        new AppError(
                            'No se ha podido cerrar el inicio de sesión. Cierra Next Play y vuelve a abrirla.',
                            409,
                        ),
                    ),
                5000,
            );
            child.once('close', () => {
                clearTimeout(timer);
                done();
            });
            child.kill();
        });
    }
    if (loginChild === child) loginChild = undefined;
}
async function startLogin() {
    if (loginChild) return;
    await mkdir(userDir(), { recursive: true });
    const binary = await codexBinary();
    login = {
        state: 'pending',
        message: 'Completa el inicio de sesión en la ventana del navegador.',
    };
    const child = trackCodexProcess(
        spawn(binary, ['login'], {
            cwd: userDir(),
            env: codexEnv(),
            windowsHide: true,
            shell: false,
            stdio: 'ignore',
        }),
    );
    loginChild = child;
    const timer = setTimeout(async () => {
        if (loginChild !== child) return;
        await cancelLogin().catch(() => {});
        login = {
            state: 'error',
            message:
                'El inicio de sesión ha caducado. Vuelve a conectar ChatGPT.',
        };
    }, 300_000);
    child.once('error', () => {
        clearTimeout(timer);
        if (loginChild !== child) return;
        loginChild = undefined;
        login = {
            state: 'error',
            message: 'No se ha podido abrir el inicio de sesión de ChatGPT.',
        };
    });
    child.once('close', async (code) => {
        clearTimeout(timer);
        if (loginChild !== child || login.state !== 'pending') return;
        const status = code === 0 ? await codexStatus() : null;
        if (loginChild !== child) return;
        loginChild = undefined;
        login = status?.codex
            ? { state: 'complete', message: 'ChatGPT conectado.' }
            : {
                  state: 'error',
                  message:
                      'No se ha completado la conexión. Puedes volver a intentarlo.',
              };
    });
}
async function integration(action: string, enabled?: boolean) {
    requireInstalled();
    try {
        const { stdout } = await execute(
            'powershell.exe',
            [
                '-NoProfile',
                '-STA',
                '-ExecutionPolicy',
                'Bypass',
                '-File',
                resolve('scripts/windows-integration.ps1'),
                '-Action',
                action,
                ...(enabled === undefined
                    ? []
                    : ['-Enabled', enabled ? 'yes' : 'no']),
                '-Port',
                process.env.NEXTPLAY_PORT || '3001',
            ],
            { windowsHide: true, timeout: 180_000, maxBuffer: 32_000 },
        );
        return stdout.trim();
    } catch {
        throw new AppError(
            'No se ha completado el cambio en Windows. Comprueba el permiso solicitado y vuelve a intentarlo.',
            409,
        );
    }
}
export async function appStatus(request: Request): Promise<AppStatus> {
    const installed = process.env.NEXTPLAY_INSTALLED === '1';
    const settings = await userSettings();
    const c = await config();
    const update = installed ? await updateStatus() : { checking: false };
    const port = Number(process.env.NEXTPLAY_PORT || 3001);
    const urls =
        installed && settings.lan
            ? Object.values(networkInterfaces())
                  .flat()
                  .filter(
                      (n) =>
                          n &&
                          !n.internal &&
                          n.family === 'IPv4' &&
                          /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
                              n.address,
                          ),
                  )
                  .map((n) => `http://${n!.address}:${port}`)
            : [];
    const last = installed
        ? await readJson<{ error?: string }>(
              join(userDir(), 'last-update.json'),
              {},
          )
        : {};
    return {
        installed,
        canManage: canManage(request),
        version: appVersion(),
        onboardingComplete: !!settings.onboardingComplete,
        lan: !!settings.lan,
        startup: !!settings.startup,
        urls,
        connections: {
            STEAM_API_KEY: !!c.steam,
            STEAM_FAMILY_TOKEN: !!c.familyToken,
            TWITCH_CLIENT_ID: !!c.clientId,
            TWITCH_CLIENT_SECRET: !!c.clientSecret,
        },
        login: { ...login },
        update: {
            checking: update.checking,
            checkedAt: update.checkedAt,
            version: update.release?.version,
            notesUrl: update.release?.notesUrl,
            error: last.error || update.error,
        },
    };
}
async function requestExit(
    action: 'exit' | 'restart' | 'update',
    extra: Record<string, unknown> = {},
) {
    requireInstalled();
    await cancelLogin();
    await atomicJson(join(userDir(), 'control.json'), {
        action,
        token: process.env.NEXTPLAY_SESSION_TOKEN,
        ...extra,
    });
    enterMaintenance();
    // The API response must reach the browser before the supervisor takes over.
    setTimeout(() => process.exit(0), 1000).unref();
    return {
        restarting: action !== 'exit',
        message:
            action === 'update'
                ? 'Instalando la actualización. Next Play volverá a abrirse automáticamente.'
                : 'Cambio guardado.',
    };
}
export async function importInstallation(source: string) {
    const state = await readState();
    const settings = await userSettings();
    if (
        state.profile ||
        state.games.length ||
        state.conversation.length ||
        state.history?.length ||
        state.playHistory?.length ||
        Object.keys(state.preferences).length ||
        settings.onboardingComplete ||
        Object.keys(settings.connections ?? {}).length
    )
        throw new AppError(
            'La importación solo está disponible en una instalación nueva, antes de configurar tus cuentas.',
            409,
        );
    const original = resolve(source);
    const manifest = await readJson<{ name?: string }>(
        join(original, 'package.json'),
        {},
    );
    if (
        manifest.name !== 'what-should-i-play-next' ||
        original === resolve(userDir())
    )
        throw new AppError(
            'Selecciona la carpeta de tu instalación anterior de Next Play.',
            400,
        );
    const stage = join(userDir(), '.import-' + randomUUID());
    const stagedData = join(stage, 'data');
    const previousData = join(userDir(), '.before-import-' + randomUUID());
    await mkdir(stagedData, { recursive: true });
    let moved = false,
        activated = false;
    try {
        const sourceDb = join(original, 'data/library.sqlite');
        let exists = true;
        try {
            await access(sourceDb);
        } catch {
            exists = false;
        }
        if (exists) {
            const db = openDatabase(sourceDb, true);
            try {
                if (
                    Object.values(
                        db.prepare('PRAGMA integrity_check').get() ?? {},
                    )[0] !== 'ok'
                )
                    throw new AppError(
                        'La biblioteca anterior está dañada. Se han conservado los originales.',
                    );
                validState(loadState(db)!);
                backupDatabase(db, join(stagedData, 'library.sqlite'));
            } finally {
                db.close();
            }
        } else {
            const old = validState(
                JSON.parse(
                    await readFile(join(original, 'data/state.json'), 'utf8'),
                ),
            );
            const db = openDatabase(join(stagedData, 'library.sqlite'));
            try {
                storeState(db, old);
            } finally {
                db.close();
            }
        }
        for (const file of ['cache.json', 'hltb.json']) {
            const value = await readJson<Record<string, unknown> | null>(
                join(original, 'data', file),
                null,
            );
            if (value !== null) {
                if (typeof value !== 'object' || Array.isArray(value))
                    throw new AppError(
                        'Una caché anterior tiene un formato inválido.',
                    );
                await atomicJson(join(stagedData, file), value);
            }
        }
        let env: Record<string, string | undefined> = {};
        try {
            env = parseEnv(
                await readFile(join(original, '.env.local'), 'utf8'),
            );
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        }
        const oldSettings = await readJson<UserSettings>(
            join(original, 'data/settings.json'),
            {},
        );
        const connections: UserSettings['connections'] = {};
        for (const key of connectionKeys) {
            const value = Object.hasOwn(oldSettings.connections ?? {}, key)
                ? oldSettings.connections![key]
                : env[key];
            if (value !== undefined) connections[key] = value;
        }
        validateConnections(connections);
        // No asynchronous gap in the directory swap: HTTP readers cannot create an empty library between renames.
        renameSync(dataDir(), previousData);
        moved = true;
        renameSync(stagedData, dataDir());
        activated = true;
        await atomicJson(settingsPath(), {
            ...settings,
            connections,
            onboardingComplete: true,
        });
        // Retain the empty pre-import directory as a recovery copy; never move/delete the source.
        return { imported: true };
    } catch (error) {
        if (activated) renameSync(dataDir(), stagedData);
        if (moved) renameSync(previousData, dataDir());
        throw error;
    } finally {
        await rm(stage, { recursive: true, force: true });
    }
}
export async function manageApp(
    request: Request,
    payload: Record<string, unknown>,
) {
    if (!canManage(request))
        throw new AppError(
            'Gestiona las conexiones y la aplicación desde el PC donde está instalada.',
            403,
        );
    const path = new URL(request.url).pathname;
    if (path === '/api/connections' && request.method === 'PATCH') {
        return exclusive(async () => {
            await saveConnections(payload);
            return appStatus(request);
        });
    }
    if (path === '/api/app/settings' && request.method === 'PATCH') {
        return exclusive(async () => {
            for (const [key, value] of Object.entries(payload))
                if (
                    !['lan', 'startup', 'onboardingComplete'].includes(key) ||
                    typeof value !== 'boolean'
                )
                    throw new AppError('Ajuste no válido.');
            const settings = await userSettings();
            if ('lan' in payload && payload.lan !== !!settings.lan)
                await integration('Firewall', payload.lan as boolean);
            if ('startup' in payload && payload.startup !== !!settings.startup)
                await integration('Startup', payload.startup as boolean);
            await atomicJson(settingsPath(), { ...settings, ...payload });
            if ('lan' in payload && payload.lan !== !!settings.lan)
                return requestExit('restart');
            return appStatus(request);
        });
    }
    if (request.method !== 'POST' || Object.keys(payload).length)
        throw new AppError('Esta operación no acepta parámetros.', 400);
    if (path === '/api/app/login') {
        return exclusive(async () => {
            await startLogin();
            return appStatus(request);
        });
    }
    if (path === '/api/app/login/cancel') {
        await cancelLogin();
        return appStatus(request);
    }
    if (path === '/api/app/updates/check') {
        requireInstalled();
        await checkUpdates(true);
        return appStatus(request);
    }
    if (path === '/api/app/update') {
        requireInstalled();
        return exclusive(async () => {
            if (loginChild)
                throw new AppError(
                    'Termina o cancela primero el inicio de sesión.',
                    409,
                );
            const update = await prepareUpdate();
            await mkdir(join(userDir(), 'updates'), { recursive: true });
            await cp(
                resolve('scripts/windows-update.ps1'),
                join(userDir(), 'updates/windows-update.ps1'),
            );
            return requestExit('update', update);
        });
    }
    if (path === '/api/app/import') {
        return exclusive(async () => {
            const folder = await integration('ImportFolder');
            if (!folder) throw new AppError('Importación cancelada.');
            return importInstallation(folder);
        });
    }
    if (path === '/api/app/exit') return exclusive(() => requestExit('exit'));
    if (path === '/api/app/restart')
        return exclusive(() => requestExit('restart'));
    throw new AppError('Esta operación no existe.', 404);
}
