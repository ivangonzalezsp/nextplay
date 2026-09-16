import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseEnv } from 'node:util';
import { EMPTY_STATE } from '../lib/model.ts';
import type { State } from '../lib/model.ts';
import {
    backupDatabase,
    loadState,
    needsManualGameMigration,
    openDatabase,
    storeState,
} from './database.ts';

export const dataDir = () => resolve(process.env.NEXTPLAY_DATA_DIR || 'data');
export const userDir = () =>
    resolve(process.env.NEXTPLAY_USER_DIR || dataDir());
export const connectionKeys = [
    'STEAM_API_KEY',
    'STEAM_FAMILY_TOKEN',
    'TWITCH_CLIENT_ID',
    'TWITCH_CLIENT_SECRET',
] as const;
export type ConnectionKey = (typeof connectionKeys)[number];
export type UserSettings = {
    connections?: Partial<Record<ConnectionKey, string | null>>;
    onboardingComplete?: boolean;
    lan?: boolean;
    startup?: boolean;
};
export const settingsPath = () => join(userDir(), 'settings.json');
export const userSettings = () => readJson<UserSettings>(settingsPath(), {});

export function validateConnections(payload: Record<string, unknown>) {
    const connections: NonNullable<UserSettings['connections']> = {};
    for (const [key, value] of Object.entries(payload)) {
        if (!connectionKeys.includes(key as ConnectionKey))
            throw new AppError('Esta conexión no se puede configurar.', 400);
        if (
            value !== null &&
            (typeof value !== 'string' ||
                !value.trim() ||
                value.length > (key === 'STEAM_FAMILY_TOKEN' ? 8192 : 256) ||
                /[\s\p{Cc}]/u.test(value))
        )
            throw new AppError(
                'La clave no puede estar vacía ni contener espacios o saltos de línea.',
                400,
            );
        if (
            key === 'STEAM_API_KEY' &&
            value !== null &&
            !/^[a-f\d]{32}$/i.test(String(value))
        )
            throw new AppError(
                'La clave de Steam debe tener 32 caracteres hexadecimales.',
                400,
            );
        connections[key as ConnectionKey] = value as string | null;
    }
    return connections;
}
export async function saveConnections(payload: Record<string, unknown>) {
    const changes = validateConnections(payload);
    const settings = await userSettings();
    await atomicJson(settingsPath(), {
        ...settings,
        connections: { ...settings.connections, ...changes },
    });
}
export class AppError extends Error {
    status: number;
    constructor(message: string, status = 400) {
        super(message);
        this.status = status;
    }
}
export async function config() {
    const settings = await userSettings();
    let local: Record<string, string | undefined> = {};
    try {
        if (!process.env.NEXTPLAY_INSTALLED)
            local = parseEnv(await readFile(resolve('.env.local'), 'utf8'));
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
            throw new AppError('No se puede leer .env.local.', 500);
    }
    const get = (key: string) =>
        (Object.hasOwn(settings.connections ?? {}, key)
            ? (settings.connections?.[key as ConnectionKey] ?? '')
            : local[key] || process.env[key] || ''
        ).trim();
    return {
        steam: get('STEAM_API_KEY'),
        familyToken: get('STEAM_FAMILY_TOKEN'),
        python: get('NEXTPLAY_PYTHON'),
        clientId: get('TWITCH_CLIENT_ID'),
        clientSecret: get('TWITCH_CLIENT_SECRET'),
        model: get('NEXTPLAY_CODEX_MODEL') || 'gpt-5.6-luna',
    };
}
export async function readJson<T>(path: string, fallback: T): Promise<T> {
    try {
        return JSON.parse(
            (await readFile(path, 'utf8')).replace(/^\uFEFF/, ''),
        );
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT')
            return structuredClone(fallback);
        throw new AppError(
            'No se pueden leer los datos locales. Se han conservado los archivos originales; revisa data antes de continuar.',
            500,
        );
    }
}
export async function atomicJson(path: string, value: unknown) {
    await mkdir(resolve(path, '..'), { recursive: true });
    const temp = path + '.' + randomUUID() + '.tmp';
    try {
        await writeFile(temp, JSON.stringify(value), {
            encoding: 'utf8',
            mode: 0o600,
            flag: 'wx',
        });
        await rename(temp, path);
    } finally {
        await unlink(temp).catch(() => {});
    }
}
export async function readState(): Promise<State> {
    await mkdir(dataDir(), { recursive: true });
    const db = openDatabase(join(dataDir(), 'library.sqlite'));
    try {
        const saved = loadState(db);
        if (saved) return validState(saved);
        // One-time migration. Keep the original JSON as a recovery copy.
        const legacy = validState(
            await readJson(join(dataDir(), 'state.json'), EMPTY_STATE),
        );
        storeState(db, legacy, true);
        return validState(loadState(db)!);
    } finally {
        db.close();
    }
}
export function validState(state: State): State {
    if (
        state?.version !== 1 ||
        !Array.isArray(state.games) ||
        !Array.isArray(state.conversation) ||
        (state.shortlist !== undefined &&
            (!Array.isArray(state.shortlist) ||
                !state.shortlist.every(
                    (game) =>
                        game &&
                        Number.isSafeInteger(game.appId) &&
                        game.appId !== 0,
                ))) ||
        (state.history !== undefined && !Array.isArray(state.history)) ||
        !state.preferences ||
        !state.filters
    )
        throw new AppError(
            'El formato de los datos locales no es compatible. Los originales se han conservado.',
            500,
        );
    // Preserve the existing conversation on upgrade, before any action can reset it.
    state.history ??= state.conversation.map((turn, i) => ({
        ...turn,
        id: `legacy-${turn.result.at}-${i}`,
    }));
    return state;
}
export async function saveState(state: State) {
    validState(state);
    await mkdir(dataDir(), { recursive: true });
    const db = openDatabase(join(dataDir(), 'library.sqlite'));
    try {
        if (needsManualGameMigration(db, state.games))
            backupDatabase(
                db,
                join(
                    dataDir(),
                    `library.before-manual-games.${randomUUID()}.sqlite`,
                ),
            );
        storeState(db, state);
    } finally {
        db.close();
    }
}

// ponytail: one local user; reject concurrent mutations instead of adding a job queue.
let busy = false;
let maintenance = false;
export const isBusy = () => busy;
export const isMaintenance = () => maintenance;
export const enterMaintenance = () => {
    maintenance = true;
};
export async function exclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (busy || maintenance)
        throw new AppError(
            'Hay una operación en curso. Espera a que termine e inténtalo de nuevo.',
            409,
        );
    busy = true;
    try {
        return await fn();
    } finally {
        busy = false;
    }
}
