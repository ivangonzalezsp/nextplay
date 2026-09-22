import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
    EMPTY_STATE,
    DEFAULT_FILTERS,
    gameUrl,
    libraryLabel,
    steamLaunchUrl,
    type Game,
    type Snapshot,
} from '../lib/model.ts';
import { handle } from '../server/api.ts';
import {
    loadState,
    openDatabase,
    replaceGames,
    storeState,
} from '../server/database.ts';
import { readState, saveState } from '../server/store.ts';
import { catalogGame, queryGames } from '../server/library.ts';
import { refreshLibraries } from '../server/family.ts';
import { enrich, review } from '../server/sources.ts';
import { refreshHltb } from '../server/hltb.ts';
import { buildPrompt } from '../server/codex.ts';
import { validatePicks } from '../server/selection.ts';

void test('Steam launch URLs only accept positive AppIDs', () => {
    assert.equal(steamLaunchUrl(132), 'steam://run/132');
    assert.equal(steamLaunchUrl(0), undefined);
    assert.equal(steamLaunchUrl(-42), undefined);
});

void test('manual games: IGDB search, migration, persistence, feedback, recommendations and Steam sync', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nextplay-manual-'));
    const previousCwd = process.cwd();
    const previousDir = process.env.NEXTPLAY_DATA_DIR;
    const previousBin = process.env.NEXTPLAY_CODEX_BIN;
    const originalFetch = globalThis.fetch;
    process.chdir(dir);
    process.env.NEXTPLAY_DATA_DIR = dir;
    process.env.NEXTPLAY_CODEX_BIN = join(dir, 'missing-codex.exe');
    const raw = {
        id: 132,
        name: 'Warcraft III: Reign of Chaos',
        url: 'https://www.igdb.com/games/warcraft-iii-reign-of-chaos',
        cover: { url: '//images.igdb.com/igdb/image/upload/t_thumb/test.jpg' },
        genres: [{ id: 9, name: 'Strategy' }],
        game_modes: [1, 2],
        game_type: 0,
        first_release_date: 1025481600,
        platforms: [{ name: 'PC (Microsoft Windows)' }],
    };
    const steamGame: Game = {
        appId: 132,
        name: 'Steam game',
        owned: true,
        playtimeMinutes: 120,
        recentMinutes: 0,
    };
    const viewer = '76561198000000001';
    let failing = false;
    let missing = false;
    let videoLookupEnabled = false;
    let networkCalls = 0;
    const queries: string[] = [];
    const call = (path: string, body?: object, method = 'POST') =>
        handle(
            new Request(
                `http://localhost:3000/api/${path}`,
                body === undefined
                    ? undefined
                    : {
                          method,
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(body),
                      },
            ),
        );
    const input = { igdbId: raw.id, platform: 'Battle.net', status: 'playing' };
    try {
        await writeFile(
            join(dir, '.env.local'),
            'TWITCH_CLIENT_ID=test\nTWITCH_CLIENT_SECRET=test\nSTEAM_API_KEY=test\n',
        );
        globalThis.fetch = async (url, init) => {
            networkCalls++;
            const path = new URL(url instanceof Request ? url.url : url)
                .pathname;
            if (path === '/oauth2/token')
                return Response.json({
                    access_token: 'test',
                    expires_in: 3600,
                });
            if (path.startsWith('/v4/')) {
                if (failing) return new Response('', { status: 503 });
                assert.ok(typeof init?.body === 'string');
                const query = init.body;
                queries.push(query);
                if (path === '/v4/games')
                    return Response.json(missing ? [] : [raw]);
                if (path === '/v4/game_types')
                    return Response.json([{ id: 0, type: 'Main Game' }]);
                if (path === '/v4/external_game_sources')
                    return Response.json([{ id: 1, name: 'Steam' }]);
                if (path === '/v4/external_games') {
                    assert.ok(
                        !query.includes('"-'),
                        'manual IDs must never go to Steam mapping',
                    );
                    return Response.json(
                        videoLookupEnabled
                            ? [
                                  {
                                      uid: '132',
                                      game: raw.id,
                                      url: 'https://store.steampowered.com/app/132/',
                                  },
                              ]
                            : [],
                    );
                }
                if (path === '/v4/game_videos')
                    return Response.json([
                        { game: raw.id, video_id: 'dQw4w9WgXcQ' },
                    ]);
                if (path === '/v4/game_time_to_beats')
                    return Response.json([
                        { game_id: 132, count: 10, hastily: 72000 },
                    ]);
            }
            if (path.includes('GetPlayerSummaries'))
                return Response.json({
                    response: {
                        players: [{ steamid: viewer, personaname: 'Test' }],
                    },
                });
            if (path.includes('GetOwnedGames'))
                return Response.json({
                    response: {
                        game_count: 1,
                        games: [
                            {
                                appid: 132,
                                name: steamGame.name,
                                playtime_forever: 120,
                            },
                        ],
                    },
                });
            if (path.includes('GetRecentlyPlayedGames'))
                return Response.json({ response: { games: [] } });
            if (path.includes('GetFamilyGroupForUser'))
                return Response.json({
                    response: { is_not_member_of_any_group: true },
                });
            throw new Error(`Unexpected request: ${path}`);
        };

        // Start with the original positive-only table to exercise an actual upgrade.
        const legacy = new DatabaseSync(join(dir, 'library.sqlite'));
        legacy.exec(
            'CREATE TABLE games (app_id INTEGER PRIMARY KEY CHECK (app_id > 0), position INTEGER NOT NULL, data TEXT NOT NULL CHECK (json_valid(data))) STRICT;',
        );
        legacy.close();
        const before = {
            ...structuredClone(EMPTY_STATE),
            games: [steamGame],
            preferences: {
                '132': {
                    favorite: true,
                    status: 'pending' as const,
                    opinion: 'loved' as const,
                },
            },
        };
        await saveState(before);
        const originalState = await readState();
        assert.equal((await call('igdb/search?q=x')).status, 400);
        const found = await call('igdb/search?q=Warcraft');
        assert.equal(found.status, 200);
        const result = (await found.json()).games[0];
        assert.equal(result.id, 132);
        assert.deepEqual(result.platforms, ['PC (Microsoft Windows)']);
        assert.match(result.cover, /t_cover_big/);
        assert.equal((await call('igdb/video?appId=-1')).status, 400);
        videoLookupEnabled = true;
        const video = await call('igdb/video?appId=132');
        assert.equal(video.status, 200);
        assert.deepEqual(await video.json(), { videoId: 'dQw4w9WgXcQ' });
        const callsAfterVideo = networkCalls;
        assert.deepEqual(await (await call('igdb/video?appId=132')).json(), {
            videoId: 'dQw4w9WgXcQ',
        });
        assert.equal(networkCalls, callsAfterVideo, 'video lookup is cached');
        await call(`igdb/search?q=${encodeURIComponent('A"; limit 500;')}`);
        assert.ok(
            queries.includes(
                'search "A\\\"; limit 500;"; fields name,cover.url,first_release_date,platforms.name; limit 12;',
            ),
        );
        assert.deepEqual(
            await readState(),
            originalState,
            'search must not change the library',
        );

        for (const invalid of [
            { igdbId: 0 },
            { igdbId: '132' },
            { platform: '' },
            { platform: 'Steam' },
            { platform: 'x'.repeat(81) },
            { status: 'invalid' },
            { status: ['playing'] },
        ]) {
            assert.equal(
                (await call('library/games', { ...input, ...invalid })).status,
                400,
            );
        }
        missing = true;
        assert.equal((await call('library/games', input)).status, 404);
        missing = false;
        assert.deepEqual(await readState(), originalState);

        const addedResponse = await call('library/games', {
            ...input,
            name: 'Untrusted name',
            owned: false,
            appId: 132,
        });
        assert.equal(addedResponse.status, 200);
        const added = (await addedResponse.json()) as Snapshot;
        const manual = added.games.find((game) => game.appId < 0)!;
        assert.equal(manual.appId, -1);
        assert.equal(manual.name, raw.name);
        assert.equal(manual.igdbId, 132);
        assert.equal(manual.platform, 'Battle.net');
        assert.equal(manual.owned, true);
        assert.equal(manual.playtimeMinutes, null);
        assert.equal(manual.durationHours, 20);
        assert.equal(added.playHistory?.[0].kind, 'started');
        assert.equal(added.playHistory?.[0].appId, -1);
        assert.deepEqual(added.preferences['132'], before.preferences['132']);
        assert.equal(libraryLabel(manual), 'Battle.net');
        assert.equal(gameUrl(manual), raw.url);
        assert.equal(
            gameUrl(steamGame),
            'https://store.steampowered.com/app/132/',
        );
        const backups = (await readdir(dir)).filter((name) =>
            name.startsWith('library.before-manual-games.'),
        );
        assert.equal(backups.length, 1);
        const backup = openDatabase(join(dir, backups[0]), true);
        try {
            assert.deepEqual(loadState(backup), originalState);
        } finally {
            backup.close();
        }
        const beforeDuplicate = await readState();
        assert.equal(
            (
                await call('library/games', {
                    ...input,
                    platform: ' battle.NET ',
                    status: 'completed',
                })
            ).status,
            409,
        );
        assert.deepEqual(await readState(), beforeDuplicate);
        failing = true;
        assert.equal(
            (await call('library/games', { ...input, platform: 'GOG' })).status,
            502,
        );
        assert.deepEqual(await readState(), beforeDuplicate);
        failing = false;

        // The same title on another platform has independent status and identity.
        assert.equal(
            (
                await call('library/games', {
                    ...input,
                    platform: 'PC',
                    status: 'pending',
                })
            ).status,
            200,
        );
        assert.equal(
            (await call('shortlist', { appId: -1, saved: true }, 'PATCH'))
                .status,
            200,
        );
        assert.equal((await readState()).shortlist?.[0].appId, -1);
        assert.equal(
            (
                await call(
                    'state',
                    {
                        appId: -1,
                        preference: { favorite: true, status: 'completed' },
                    },
                    'PATCH',
                )
            ).status,
            200,
        );
        const next = await readState();
        assert.equal(next.preferences['-2'].status, 'pending');
        assert.equal(next.playHistory?.at(-1)?.kind, 'completed');

        const callsBeforeLocal = networkCalls;
        const localResponse = await call('recommendations', {
            engine: 'local',
            text: '',
            filters: DEFAULT_FILTERS,
        });
        assert.equal(
            localResponse.status,
            200,
            'manual library works without a connected Steam profile',
        );
        const local = (await localResponse.json()) as Snapshot;
        const picks = local.conversation.at(-1)!.result;
        assert.ok(picks.owned.some((pick) => pick.appId === -2));
        assert.ok(!picks.owned.some((pick) => pick.appId === -1));
        assert.equal(networkCalls, callsBeforeLocal);
        validatePicks(picks, local.games);
        assert.match(
            buildPrompt(local, local.games, DEFAULT_FILTERS, ''),
            /appId negativo/,
        );
        const catalog = openDatabase(':memory:');
        try {
            replaceGames(
                catalog,
                local.games.map((game) => catalogGame(game, local)),
            );
            assert.equal(
                queryGames(catalog, { appIds: [-2] }).games[0].platform,
                'PC',
            );
        } finally {
            catalog.close();
        }

        await review(manual, { metadata: {}, reviews: {} });
        await refreshHltb([manual], {}, true, async () => {
            throw new Error('Manual game sent to Steam HLTB matching');
        });
        assert.equal(networkCalls, callsBeforeLocal);
        queries.length = 0;
        const enriched = await enrich(
            [manual],
            { metadata: {}, reviews: {} },
            true,
        );
        assert.equal(enriched.warnings.length, 0);
        assert.equal(enriched.games[0].appId, -1);
        assert.equal(enriched.games[0].platform, 'Battle.net');
        assert.ok(queries.some((query) => query.includes('where id = (132)')));
        assert.ok(!queries.some((query) => query.includes('uid =')));

        const preserved = (await readState()).games.filter(
            (game) => game.appId < 0,
        );
        assert.equal(
            (
                await call('steam/sync', {
                    profileUrl: `https://steamcommunity.com/profiles/${viewer}/`,
                    force: true,
                })
            ).status,
            200,
        );
        const synced = await readState();
        assert.deepEqual(
            synced.games
                .filter((game) => game.appId < 0)
                .map(({ metadataAt: _metadataAt, ...game }) => game),
            preserved.map(({ metadataAt: _metadataAt, ...game }) => game),
        );
        assert.deepEqual(synced.preferences, local.preferences);
        const refreshed = await refreshLibraries(
            synced,
            { steam: 'test', familyToken: '' },
            { own: true, family: false },
        );
        assert.equal(
            refreshed.state.games.filter((game) => game.appId < 0).length,
            2,
        );
        const familyToken = `test.${Buffer.from(JSON.stringify({ sub: viewer })).toString('base64url')}.test`;
        const familyRefreshed = await refreshLibraries(
            synced,
            { steam: 'test', familyToken },
            { own: false, family: true },
        );
        assert.equal(
            familyRefreshed.state.games.filter((game) => game.appId < 0).length,
            2,
        );
        assert.equal(
            familyRefreshed.state.games.find((game) => game.appId < 0)
                ?.ownerSteamIds,
            undefined,
        );

        // A failed snapshot write also rolls back the schema migration.
        const rollback = openDatabase(':memory:');
        try {
            rollback.exec(
                'DROP TABLE games; CREATE TABLE games (app_id INTEGER PRIMARY KEY CHECK (app_id > 0), position INTEGER NOT NULL, data TEXT NOT NULL CHECK (json_valid(data))) STRICT;',
            );
            storeState(rollback, originalState);
            assert.throws(() =>
                storeState(rollback, { ...next, games: [manual, manual] }),
            );
            assert.deepEqual(loadState(rollback), originalState);
            assert.match(
                String(
                    rollback
                        .prepare(
                            "SELECT sql FROM sqlite_master WHERE name = 'games'",
                        )
                        .get()?.sql,
                ),
                /app_id > 0/,
            );
        } finally {
            rollback.close();
        }

        const beforeDelete = await readState();
        assert.equal(
            (await call('library/games', { appId: -1 }, 'DELETE')).status,
            200,
        );
        const deleted = await readState();
        assert.ok(!deleted.games.some((game) => game.appId === -1));
        assert.ok(deleted.games.some((game) => game.appId === -2));
        assert.equal(deleted.preferences['-1'], undefined);
        assert.ok(!deleted.shortlist?.some((game) => game.appId === -1));
        assert.ok(!deleted.playHistory?.some((event) => event.appId === -1));
        assert.equal(
            (await call('library/games', { appId: 1 }, 'DELETE')).status,
            400,
        );
        assert.deepEqual(
            (await readState()).games,
            deleted.games,
            'Deleting a manual game must not alter Steam games.',
        );
        assert.ok(beforeDelete.games.some((game) => game.appId === -1));
    } finally {
        globalThis.fetch = originalFetch;
        process.chdir(previousCwd);
        if (previousDir === undefined) delete process.env.NEXTPLAY_DATA_DIR;
        else process.env.NEXTPLAY_DATA_DIR = previousDir;
        if (previousBin === undefined) delete process.env.NEXTPLAY_CODEX_BIN;
        else process.env.NEXTPLAY_CODEX_BIN = previousBin;
        await rm(dir, { recursive: true, force: true });
    }
});
