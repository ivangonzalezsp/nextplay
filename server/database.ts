import { DatabaseSync } from 'node:sqlite';
import type { Game, State } from '../lib/model.ts';
import type { SteamTag } from './steam-tags.ts';

export type SteamTagRecord = {
    appId: number;
    tags: SteamTag[];
    checkedAt: number | null;
    attemptedAt: number | null;
    error?: string;
    source: string;
};

export type SteamTagWrite = {
    appId: number;
    tags: SteamTag[];
    checkedAt: number | null;
    attemptedAt: number;
    error?: string;
    source: string;
};

export function backupDatabase(db: DatabaseSync, path: string) {
    db.prepare('VACUUM INTO ?').run(path);
}

export function openDatabase(path: string, readOnly = false) {
    const db = new DatabaseSync(path, { readOnly, timeout: 5000 });
    if (!readOnly) {
        try {
            db.exec(`
        CREATE TABLE IF NOT EXISTS games (
          app_id INTEGER PRIMARY KEY CHECK (app_id != 0),
          position INTEGER NOT NULL,
          data TEXT NOT NULL CHECK (json_valid(data))
        ) STRICT;
        CREATE INDEX IF NOT EXISTS idx_games_position ON games(position);
        CREATE TABLE IF NOT EXISTS app_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          data TEXT NOT NULL CHECK (json_valid(data))
        ) STRICT;
        CREATE TABLE IF NOT EXISTS steam_tags (
          app_id INTEGER PRIMARY KEY CHECK (app_id > 0),
          tags TEXT NOT NULL CHECK (json_valid(tags)),
          checked_at INTEGER,
          attempted_at INTEGER,
          error TEXT,
          source TEXT NOT NULL CHECK (length(source) > 0)
        ) STRICT;
      `);
        } catch (error) {
            db.close();
            throw error;
        }
    }
    return db;
}

export function replaceGames(db: DatabaseSync, games: Game[]) {
    db.exec('DELETE FROM games');
    const insert = db.prepare(
        'INSERT INTO games(app_id, position, data) VALUES (?, ?, ?)',
    );
    games.forEach((game, position) =>
        insert.run(game.appId, position, JSON.stringify(game)),
    );
}

export function needsManualGameMigration(db: DatabaseSync, games: Game[]) {
    return (
        games.some((game) => game.appId < 0) &&
        String(
            db
                .prepare("SELECT sql FROM sqlite_master WHERE name = 'games'")
                .get()?.sql,
        ).includes('CHECK (app_id > 0)')
    );
}

export function loadState(db: DatabaseSync): State | undefined {
    // Keep the state and library in the same read snapshot across processes.
    db.exec('BEGIN');
    try {
        const row = db.prepare('SELECT data FROM app_state WHERE id = 1').get();
        if (!row) return undefined;
        const games = db
            .prepare('SELECT data FROM games ORDER BY position')
            .all()
            .map((game) => JSON.parse(String(game.data)));
        return {
            ...JSON.parse(String(row.data)),
            games: overlaySteamTags(db, games),
        };
    } finally {
        db.exec('COMMIT');
    }
}

function validSteamTag(value: unknown): value is SteamTag {
    if (!value || typeof value !== 'object') return false;
    const tag = value as Record<string, unknown>;
    return (
        typeof tag.name === 'string' &&
        !!tag.name.trim() &&
        tag.name.length <= 200 &&
        (tag.id === undefined ||
            (typeof tag.id === 'number' &&
                Number.isSafeInteger(tag.id) &&
                tag.id > 0)) &&
        (tag.englishName === undefined ||
            (typeof tag.englishName === 'string' &&
                tag.englishName.length <= 200))
    );
}

export function readSteamTagRecords(
    db: DatabaseSync,
): Map<number, SteamTagRecord> {
    const records = new Map<number, SteamTagRecord>();
    for (const row of db
        .prepare(
            'SELECT app_id, tags, checked_at, attempted_at, error, source FROM steam_tags',
        )
        .all()) {
        const appId = Number(row.app_id);
        let tags: unknown;
        try {
            tags = JSON.parse(String(row.tags));
        } catch {
            continue;
        }
        if (
            !Number.isSafeInteger(appId) ||
            appId <= 0 ||
            !Array.isArray(tags) ||
            !tags.every(validSteamTag)
        )
            continue;
        records.set(appId, {
            appId,
            tags,
            checkedAt:
                row.checked_at === null || row.checked_at === undefined
                    ? null
                    : Number(row.checked_at),
            attemptedAt:
                row.attempted_at === null || row.attempted_at === undefined
                    ? null
                    : Number(row.attempted_at),
            ...(typeof row.error === 'string' && row.error
                ? { error: row.error }
                : {}),
            source: String(row.source),
        });
    }
    return records;
}

export function overlaySteamTags<T extends Game>(
    db: DatabaseSync,
    games: T[],
): T[] {
    const records = readSteamTagRecords(db);
    return games.map((game) => {
        const record = records.get(game.appId);
        return record?.checkedAt != null
            ? ({
                  ...game,
                  steamTags: record.tags,
                  steamTagsCheckedAt: record.checkedAt,
              } as T)
            : game;
    });
}

export function writeSteamTags(db: DatabaseSync, writes: SteamTagWrite[]) {
    if (!writes.length) return;
    db.exec('BEGIN IMMEDIATE');
    try {
        const statement = db.prepare(`
      INSERT INTO steam_tags
        (app_id, tags, checked_at, attempted_at, error, source)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(app_id) DO UPDATE SET
        tags = CASE WHEN excluded.checked_at IS NULL THEN steam_tags.tags ELSE excluded.tags END,
        checked_at = CASE WHEN excluded.checked_at IS NULL THEN steam_tags.checked_at ELSE excluded.checked_at END,
        attempted_at = excluded.attempted_at,
        error = excluded.error,
        source = excluded.source
    `);
        for (const write of writes) {
            if (
                !Number.isSafeInteger(write.appId) ||
                write.appId <= 0 ||
                !Array.isArray(write.tags) ||
                !write.tags.every(validSteamTag) ||
                !Number.isSafeInteger(write.attemptedAt) ||
                write.attemptedAt <= 0 ||
                (write.checkedAt !== null &&
                    (!Number.isSafeInteger(write.checkedAt) ||
                        write.checkedAt <= 0))
            )
                throw new Error('Invalid Steam tags write.');
            statement.run(
                write.appId,
                JSON.stringify(write.tags),
                write.checkedAt,
                write.attemptedAt,
                write.error ?? null,
                write.source,
            );
        }
        db.exec('COMMIT');
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
}

export function storeState(
    db: DatabaseSync,
    state: State,
    onlyIfEmpty = false,
) {
    db.exec('BEGIN IMMEDIATE');
    try {
        if (
            !onlyIfEmpty ||
            !db.prepare('SELECT id FROM app_state WHERE id = 1').get()
        ) {
            const { games, ...rest } = state;
            if (needsManualGameMigration(db, games)) {
                // The full snapshot is reinserted below, in this same transaction.
                db.exec(`DROP TABLE games;
          CREATE TABLE games (
            app_id INTEGER PRIMARY KEY CHECK (app_id != 0),
            position INTEGER NOT NULL,
            data TEXT NOT NULL CHECK (json_valid(data))
          ) STRICT;
          CREATE INDEX idx_games_position ON games(position);`);
            }
            // ponytail: one local library; use incremental upserts if full snapshot writes become slow.
            replaceGames(db, games);
            db.prepare(
                'INSERT OR REPLACE INTO app_state(id, data) VALUES (1, ?)',
            ).run(JSON.stringify(rest));
        }
        db.exec('COMMIT');
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
}
