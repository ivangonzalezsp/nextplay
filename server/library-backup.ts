import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { renameSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { backupDatabase, loadState, openDatabase } from './database.ts';
import { AppError, dataDir, readState, validState } from './store.ts';
import { parseFilters, parsePreference } from './selection.ts';
import { t } from './i18n.ts';
import { CODEX_EFFORTS, STATUS_LABELS } from '../lib/model.ts';

export const backupError = () =>
    new AppError(
        t(
            'La copia está dañada o no es compatible. La biblioteca actual se conserva.',
        ),
    );
const appId = z
    .number()
    .int()
    .safe()
    .refine((value) => value !== 0);
const number = z.number().finite();
const achievement = z.object({
    unlocked: number,
    total: number,
    at: number,
    achievements: z.array(
        z.object({
            apiName: z.string(),
            name: z.string(),
            description: z.string().optional(),
            hidden: z.boolean(),
            achieved: z.boolean(),
            unlockTime: number.optional(),
        }),
    ),
});
const game = z
    .object({
        appId,
        name: z.string(),
        owned: z.boolean(),
        playtimeMinutes: z.number().finite().nonnegative().nullable(),
        recentMinutes: z.number().finite().nonnegative().nullable(),
        shared: z.boolean().optional(),
        platform: z.string().optional(),
        cover: z.string().optional(),
        summary: z.string().optional(),
        ownerSteamIds: z.array(z.string()).optional(),
        igdbId: number.optional(),
        igdbUrl: z.string().optional(),
        steamTagsCheckedAt: number.optional(),
        steamAchievements: achievement.optional(),
        gameModes: z.array(number).optional(),
        similarIds: z.array(number).optional(),
        durationHours: number.nullable().optional(),
        durationSamples: number.optional(),
        hltb: z
            .object({
                id: number,
                mainHours: number.nullable(),
                extraHours: number.nullable(),
                completionHours: number.nullable(),
                at: number,
            })
            .optional(),
        releasedAt: number.optional(),
        released: z.boolean().optional(),
        isGame: z.boolean().optional(),
        metadataAt: number.optional(),
        reviews: z
            .object({ positive: number, total: number, at: number })
            .optional(),
        genres: z
            .array(z.object({ id: z.number(), name: z.string() }))
            .optional(),
        steamTags: z
            .array(
                z.object({
                    id: z.number().int().positive().optional(),
                    name: z.string(),
                    englishName: z.string().optional(),
                }),
            )
            .optional(),
    })
    .passthrough();
const pick = z.object({ appId, reason: z.string(), whyNow: z.string(), game });
const turn = z.object({
    text: z.string(),
    filters: z.unknown(),
    result: z.object({
        at: z.number().finite(),
        message: z.string(),
        warnings: z.array(z.string()),
        owned: z.array(pick),
        discoveries: z.array(pick),
        needsClarification: z.boolean().optional(),
    }),
    reference: game.optional(),
});

// Check the schema before reading data so uploaded triggers/views can never be activated.
export function validateBackup(path: string, expectedPath: string) {
    let db: ReturnType<typeof openDatabase> | undefined;
    let expected: ReturnType<typeof openDatabase> | undefined;
    try {
        db = openDatabase(path, true);
        expected = openDatabase(expectedPath);
        const schema = (database: typeof db) =>
            database!
                .prepare(
                    "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
                )
                .all()
                .map((row) => ({
                    ...row,
                    sql: String(row.sql).replace(/\s+/g, ' ').trim(),
                }));
        if (
            JSON.stringify(schema(db)) !== JSON.stringify(schema(expected)) ||
            Object.values(
                db.prepare('PRAGMA integrity_check').get() ?? {},
            )[0] !== 'ok'
        )
            throw backupError();
        const state = validState(loadState(db)!);
        z.object({
            profile: z
                .object({
                    steamId: z.string(),
                    name: z.string(),
                    url: z.string(),
                    avatar: z.string().optional(),
                })
                .nullable(),
            syncedAt: number.nullable(),
            family: z
                .object({
                    groupId: z.string(),
                    name: z.string(),
                    members: z.array(
                        z.object({ steamId: z.string(), name: z.string() }),
                    ),
                    syncedAt: number,
                    excludedCount: number,
                })
                .nullable()
                .optional(),
            tastes: z
                .object({
                    overrides: z.record(
                        z.enum(['auto', 'like', 'neutral', 'dislike']),
                    ),
                    ignoredHours: z.array(appId),
                    notes: z.string(),
                })
                .optional(),
            welcome: z
                .object({
                    reviewed: z.array(appId),
                    dismissed: z.boolean(),
                    completed: z.boolean(),
                })
                .optional(),
            engine: z.enum(['local', 'codex']).optional(),
            codex: z
                .object({
                    model: z.string().min(1),
                    effort: z.enum(CODEX_EFFORTS),
                })
                .optional(),
        })
            .passthrough()
            .parse(state);
        z.array(game).parse(state.games);
        z.array(game).optional().parse(state.shortlist);
        parseFilters(state.filters);
        z.record(z.unknown()).parse(state.preferences);
        for (const [key, value] of Object.entries(state.preferences)) {
            appId.parse(Number(key));
            parsePreference(value);
        }
        for (const entry of [...state.conversation, ...(state.history ?? [])]) {
            turn.parse(entry);
            parseFilters(entry.filters);
        }
        z.array(z.object({ id: z.string() }).passthrough())
            .optional()
            .parse(state.history);
        z.array(
            z.object({
                appId,
                name: z.string(),
                at: z.number().finite(),
                kind: z
                    .string()
                    .refine(
                        (value) =>
                            value === 'started' ||
                            Object.hasOwn(STATUS_LABELS, value),
                    ),
                from: z
                    .string()
                    .refine((value) => Object.hasOwn(STATUS_LABELS, value))
                    .optional(),
            }),
        )
            .optional()
            .parse(state.playHistory);
        const rows = db
            .prepare('SELECT app_id,position,data FROM games ORDER BY position')
            .all();
        if (
            rows.some(
                (row, index) =>
                    row.position !== index ||
                    JSON.parse(String(row.data)).appId !== row.app_id,
            )
        )
            throw backupError();
        for (const row of db.prepare('SELECT tags FROM steam_tags').all())
            game.shape.steamTags.parse(JSON.parse(String(row.tags)));
        for (const row of db
            .prepare('SELECT data FROM steam_achievements')
            .all())
            achievement.parse(JSON.parse(String(row.data)));
        return state;
    } catch {
        throw backupError();
    } finally {
        db?.close();
        expected?.close();
    }
}

export async function databaseCopy(path: string) {
    await readState();
    const db = openDatabase(join(dataDir(), 'library.sqlite'), true);
    try {
        backupDatabase(db, path);
    } finally {
        db.close();
    }
    return readFile(path);
}

export const checksum = (bytes: Uint8Array) =>
    createHash('sha256').update(bytes).digest('hex');

export async function activateBackup(
    incoming: string,
    source: 'drive' | 'zip',
) {
    await readState();
    const backups = join(dataDir(), 'backups');
    await mkdir(backups, { recursive: true });
    const recovery = join(
        backups,
        `before-${source}-${Date.now()}-${randomUUID()}.sqlite`,
    );
    const db = openDatabase(join(dataDir(), 'library.sqlite'), true);
    try {
        // A live WAL/another writer would make replacing just the main file unsafe.
        if (
            Object.values(db.prepare('PRAGMA journal_mode').get()!)[0] !==
            'delete'
        )
            throw backupError();
        backupDatabase(db, recovery);
    } finally {
        db.close();
    }
    const check = openDatabase(recovery, true);
    try {
        if (
            Object.values(check.prepare('PRAGMA integrity_check').get()!)[0] !==
            'ok'
        )
            throw backupError();
    } finally {
        check.close();
    }
    // No asynchronous gap: the original stays in place until atomic replacement succeeds.
    renameSync(incoming, join(dataDir(), 'library.sqlite'));
    return { restored: true };
}
