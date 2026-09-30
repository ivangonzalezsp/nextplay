import { t as translateMessage } from './i18n.ts';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { z } from 'zod';
import type { Game, State } from '../lib/model.ts';
import { steamTagKey, storyHours } from '../lib/model.ts';
import { gameAffinities } from '../lib/tastes.ts';

export function catalogGame(game: Game, state: State) {
    const { ownerSteamIds, ...data } = game;
    return {
        ...data,
        owners: (ownerSteamIds ?? []).map((id) =>
            id === state.profile?.steamId
                ? translateMessage('Tu biblioteca')
                : (state.family?.members.find((member) => member.steamId === id)
                      ?.name ?? translateMessage('Familiar')),
        ),
        preference: state.preferences[game.appId] ?? {
            favorite: false,
            status: 'pending',
        },
        durationHours: storyHours(game) ?? null,
        durationSource: game.hltb?.mainHours
            ? 'HLTB'
            : game.durationHours
              ? 'IGDB'
              : null,
        affinities: gameAffinities(game),
    };
}

export function catalogIndex(candidates: Game[]) {
    const tags: NonNullable<Game['steamTags']> = [];
    const tagIndexes = new Map<string, number>();
    const index = {
        columns: ['appId', 'name', 'source', 'durationHours', 'tagIndexes'],
        tags,
        games: candidates.map((game) => [
            game.appId,
            game.name,
            game.owned ? 'owned' : game.shared ? 'shared' : 'discoveries',
            storyHours(game) ?? null,
            (game.steamTags ?? []).slice(0, 4).map((tag) => {
                const key = steamTagKey(tag);
                let position = tagIndexes.get(key);
                if (position === undefined) {
                    position = tags.length;
                    tagIndexes.set(key, position);
                    tags.push({
                        id: tag.id,
                        name: tag.name,
                        englishName: tag.englishName,
                    });
                }
                return position;
            }),
        ]),
        nextOffset: null as number | null,
    };
    // ponytail: character budget, not a token count; use model tokenization if needed.
    const maxCharacters = 160_000;
    if (JSON.stringify(index).length <= maxCharacters) return index;

    // Keep every title before sacrificing coverage for metadata.
    index.columns = index.columns.slice(0, 3);
    index.tags = [];
    index.games = index.games.map((row) => row.slice(0, 3));
    if (JSON.stringify(index).length <= maxCharacters) return index;

    const rows = index.games;
    index.games = [];
    let characters = JSON.stringify({
        ...index,
        nextOffset: candidates.length,
    }).length;
    for (const row of rows) {
        const size = JSON.stringify(row).length + (index.games.length ? 1 : 0);
        if (characters + size > maxCharacters) break;
        index.games.push(row);
        characters += size;
    }
    // Same order as query_games with source=all and sort=relevance.
    index.nextOffset = index.games.length;
    return index;
}

export const querySchema = z
    .object({
        query: z.string().max(200).default(''),
        source: z
            .enum(['all', 'library', 'owned', 'shared', 'discoveries'])
            .default('all'),
        genre: z.string().max(100).optional(),
        tag: z.string().max(100).optional(),
        tagIds: z
            .array(z.number().int().positive().safe())
            .min(1)
            .max(50)
            .optional(),
        owner: z.string().max(200).optional(),
        gameMode: z.enum(['single', 'coop', 'multi']).optional(),
        maxHours: z.number().min(1).max(1000).optional(),
        favorite: z.boolean().optional(),
        unplayed: z.boolean().optional(),
        appIds: z
            .array(
                z
                    .number()
                    .int()
                    .safe()
                    .refine((id) => id !== 0),
            )
            .min(1)
            .max(50)
            .optional(),
        sort: z
            .enum(['relevance', 'name', 'duration', 'playtime'])
            .default('relevance'),
        offset: z.number().int().nonnegative().safe().default(0),
        limit: z.number().int().min(1).max(50).default(20),
    })
    .strict();

export function queryGames(db: DatabaseSync, input: unknown) {
    const q = querySchema.parse(input);
    db.function('fold', { deterministic: true }, (value) =>
        String(value ?? '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase(),
    );
    const where: string[] = [];
    const params: SQLInputValue[] = [];
    const add = (sql: string, ...values: SQLInputValue[]) => {
        where.push(sql);
        params.push(...values);
    };
    const field = (name: string) => `json_extract(data, '$.${name}')`;
    const tagNames = `(SELECT group_concat(coalesce(json_extract(value, '$.name'), '') || ' ' || coalesce(json_extract(value, '$.englishName'), ''), ' ') FROM json_each(data, '$.steamTags'))`;
    const owned = `coalesce(${field('owned')}, 0) = 1`;
    const shared = `coalesce(${field('shared')}, 0) = 1`;
    if (q.source === 'library') add(`(${owned} OR ${shared})`);
    if (q.source === 'owned') add(owned);
    if (q.source === 'shared') add(`(NOT (${owned}) AND ${shared})`);
    if (q.source === 'discoveries') add(`NOT (${owned} OR ${shared})`);
    if (q.query.trim())
        add(
            `instr(fold(coalesce(${field('name')}, '') || ' ' || coalesce(${field('summary')}, '') || ' ' || coalesce(${field('genres')}, '') || ' ' || coalesce(${tagNames}, '')), fold(?)) > 0`,
            q.query.trim(),
        );
    if (q.genre)
        add(
            "EXISTS (SELECT 1 FROM json_each(data, '$.genres') WHERE fold(json_extract(value, '$.name')) = fold(?))",
            q.genre,
        );
    if (q.tag)
        add(
            `EXISTS (SELECT 1 FROM json_each(data, '$.steamTags') WHERE fold(json_extract(value, '$.name')) = fold(?) OR fold(json_extract(value, '$.englishName')) = fold(?))`,
            q.tag,
            q.tag,
        );
    if (q.tagIds)
        add(
            `EXISTS (SELECT 1 FROM json_each(data, '$.steamTags') WHERE json_extract(value, '$.id') IN (${q.tagIds.map(() => '?').join(',')}))`,
            ...q.tagIds,
        );
    if (q.owner)
        add(
            "EXISTS (SELECT 1 FROM json_each(data, '$.owners') WHERE instr(fold(value), fold(?)) > 0)",
            q.owner,
        );
    if (q.gameMode) {
        const modes = { single: '1', coop: '3', multi: '2,3,4,5,6' };
        add(
            `EXISTS (SELECT 1 FROM json_each(data, '$.gameModes') WHERE value IN (${modes[q.gameMode]}))`,
        );
    }
    if (q.maxHours !== undefined)
        add(
            `${field('durationHours')} > 0 AND ${field('durationHours')} <= ?`,
            q.maxHours,
        );
    if (q.favorite !== undefined)
        add(
            `coalesce(${field('preference.favorite')}, 0) = ?`,
            Number(q.favorite),
        );
    if (q.unplayed !== undefined)
        add(`${field('playtimeMinutes')} ${q.unplayed ? '=' : '>'} 0`);
    if (q.appIds)
        add(`app_id IN (${q.appIds.map(() => '?').join(',')})`, ...q.appIds);
    const clause = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const orders = {
        relevance: 'position',
        name: `${field('name')} COLLATE NOCASE, app_id`,
        duration: `${field('durationHours')} IS NULL, ${field('durationHours')}, app_id`,
        playtime: `${field('playtimeMinutes')} DESC, app_id`,
    };
    const total = Number(
        db
            .prepare('SELECT count(*) AS total FROM games' + clause)
            .get(...params)!.total,
    );
    const games = db
        .prepare(
            'SELECT data FROM games' +
                clause +
                ` ORDER BY ${orders[q.sort]} LIMIT ? OFFSET ?`,
        )
        .all(...params, q.limit, q.offset)
        .map((row) => JSON.parse(String(row.data)));
    return {
        total,
        offset: q.offset,
        limit: q.limit,
        nextOffset:
            q.offset + games.length < total ? q.offset + games.length : null,
        games,
    };
}
