import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { familyGames, syncFamily, mergeLibraries } from '../server/family.ts';
import { selectCandidates, validatePicks } from '../server/selection.ts';
import { DEFAULT_FILTERS, EMPTY_STATE } from '../lib/model.ts';
import type { Game, Snapshot } from '../lib/model.ts';
import { readState, saveState } from '../server/store.ts';
import { handle } from '../server/api.ts';
import { buildPrompt } from '../server/codex.ts';

const viewer = '76561198000000001',
    lender = '76561198000000002';
const token =
    'test.' +
    Buffer.from(JSON.stringify({ sub: viewer })).toString('base64url') +
    '.signature';
const game = (appId: number, owned: boolean): Game => ({
    appId,
    name: 'Juego ' + appId,
    owned,
    shared: !owned,
    playtimeMinutes: 30,
    recentMinutes: null,
});
const response = {
    response: {
        owner_steamid: viewer,
        apps: [
            {
                appid: 1,
                name: 'Propio y prestable',
                owner_steamids: [viewer, lender],
                rt_playtime: 120,
                exclude_reason: 0,
                app_type: 1,
            },
            {
                appid: 2,
                name: 'Compartido',
                owner_steamids: [lender],
                rt_playtime: 15,
                exclude_reason: 0,
                app_type: 1,
            },
            {
                appid: 3,
                name: 'Privado',
                owner_steamids: [lender],
                exclude_reason: 4,
                app_type: 1,
            },
            {
                appid: 4,
                name: 'Herramienta',
                owner_steamids: [lender],
                exclude_reason: 0,
                app_type: 2,
            },
        ],
    },
};
const pick = (appId: number) => ({
    appId,
    reason: 'Afinidad orientativa',
    whyNow: 'Lo buscas ahora',
    caveat: 'Comprueba si hay una copia libre en Steam.',
});

void test('family data separates ownership, excludes unavailable apps and checks the playtime owner', () => {
    const parsed = familyGames(response, viewer);
    assert.equal(parsed.excludedCount, 2);
    assert.deepEqual(
        parsed.games.map((g) => [
            g.appId,
            g.owned,
            g.shared,
            g.playtimeMinutes,
        ]),
        [
            [1, true, false, 120],
            [2, false, true, 15],
        ],
    );
    assert.throws(() => familyGames(response, lender), /tu cuenta/);
    assert.throws(() => familyGames({ response: {} }, viewer), /completa/);
    assert.throws(
        () =>
            familyGames(
                {
                    response: {
                        owner_steamid: viewer,
                        apps: [
                            response.response.apps[0],
                            response.response.apps[0],
                        ],
                    },
                },
                viewer,
            ),
        /duplicado/,
    );
    assert.deepEqual(
        familyGames({ response: { owner_steamid: viewer, apps: [] } }, viewer)
            .games,
        [],
    );
});

void test('shared games are library recommendations, never discoveries or an ownership signal', () => {
    const own = { ...game(1, true), playtimeMinutes: 600 };
    const family = familyGames(response, viewer).games;
    const games = mergeLibraries([own], family, viewer);
    assert.equal(games.length, 2);
    assert.equal(games.find((g) => g.appId === 1)?.playtimeMinutes, 600);
    assert.deepEqual(games.find((g) => g.appId === 1)?.ownerSteamIds, [
        viewer,
        lender,
    ]);
    const state = { ...structuredClone(EMPTY_STATE), games };
    const candidates = selectCandidates(
        state,
        [
            { ...game(2, false), shared: false },
            { ...game(9, false), shared: false },
        ],
        DEFAULT_FILTERS,
    );
    assert.equal(candidates.find((g) => g.appId === 2)?.shared, true);
    const output = {
        message: 'Puedes jugar al prestado',
        owned: [pick(2)],
        discoveries: [pick(9)],
    };
    assert.equal(validatePicks(output, candidates).owned[0].game.owned, false);
    assert.throws(() =>
        validatePicks({ ...output, discoveries: [pick(2)] }, candidates),
    );
    const prompt = buildPrompt(
        state,
        candidates,
        DEFAULT_FILTERS,
        'Algo compartido',
    );
    assert.ok(prompt.includes('shared=true'));
    assert.ok(!prompt.includes(lender));
});

void test('session mismatch is rejected before requests and API failures do not expose the token', async () => {
    let requests = 0;
    const fail: typeof fetch = async () => {
        requests++;
        return new Response('Unauthorized ' + token, { status: 401 });
    };
    await assert.rejects(syncFamily(lender, token, '', fail), /otra cuenta/);
    assert.equal(requests, 0);
    await assert.rejects(
        syncFamily(viewer, token, '', fail),
        (error) =>
            error instanceof Error &&
            /caducado/.test(error.message) &&
            !error.message.includes(token),
    );
});

void test('API sync preserves preferences and private members, handles expired sessions and removes confirmed lost access', async () => {
    const root = resolve(tmpdir()),
        dir = await mkdtemp(join(root, 'nextplay-family-test-'));
    const previousCwd = process.cwd(),
        previousDir = process.env.NEXTPLAY_DATA_DIR,
        previousBinary = process.env.NEXTPLAY_CODEX_BIN,
        originalFetch = globalThis.fetch;
    process.chdir(dir);
    process.env.NEXTPLAY_DATA_DIR = dir;
    process.env.NEXTPLAY_CODEX_BIN = join(dir, 'absent-codex.exe');
    let mode = 'ok';
    try {
        await writeFile(
            join(dir, '.env.local'),
            'STEAM_API_KEY=test-key\nSTEAM_FAMILY_TOKEN=' + token + '\n',
        );
        await saveState({
            ...structuredClone(EMPTY_STATE),
            profile: {
                steamId: viewer,
                name: 'Yo',
                url: `https://steamcommunity.com/profiles/${viewer}/`,
            },
            syncedAt: Date.now(),
            games: [game(1, true)],
            preferences: { '2': { favorite: true, status: 'pending' } },
        });
        globalThis.fetch = async (input) => {
            const url = new URL(input instanceof Request ? input.url : input);
            if (url.pathname.includes('IFamilyGroupsService')) {
                if (mode === 'expired')
                    return new Response('Secret ' + token, { status: 401 });
                assert.equal(url.searchParams.get('access_token'), token);
                if (url.pathname.includes('GetFamilyGroupForUser'))
                    return Response.json({
                        response:
                            mode === 'left'
                                ? { is_not_member_of_any_group: true }
                                : {
                                      family_groupid: '42',
                                      family_group: {
                                          name: 'Familia',
                                          members: [
                                              { steamid: viewer },
                                              { steamid: lender },
                                          ],
                                      },
                                  },
                    });
                return Response.json(response);
            }
            if (url.pathname.includes('GetPlayerSummaries'))
                return Response.json({
                    response: {
                        players: [
                            { steamid: viewer, personaname: 'Yo' },
                            { steamid: lender, personaname: 'Perfil privado' },
                        ],
                    },
                });
            if (url.pathname.includes('GetOwnedGames')) {
                assert.equal(url.searchParams.get('steamid'), viewer);
                return Response.json({
                    response: {
                        game_count: 1,
                        games: [
                            {
                                appid: 1,
                                name: 'Juego propio',
                                playtime_forever: 600,
                            },
                        ],
                    },
                });
            }
            if (url.pathname.includes('GetRecentlyPlayedGames'))
                return Response.json({ response: { games: [] } });
            throw new Error('Unexpected source');
        };
        const call = (path: string, body: object = {}) =>
            handle(
                new Request('http://localhost:3000/api/' + path, {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        origin: 'http://localhost:3000',
                    },
                    body: JSON.stringify(body),
                }),
            );
        const synced = await call('steam/family/sync');
        assert.equal(synced.status, 200);
        const snapshot = (await synced.json()) as Snapshot;
        assert.equal(snapshot.family?.members.length, 2);
        assert.equal(snapshot.games.length, 2);
        assert.equal(snapshot.setup.family, true);
        assert.ok(!JSON.stringify(snapshot).includes(token));
        assert.equal((await readState()).preferences['2'].favorite, true);
        const old = await readFile(join(dir, 'library.sqlite'));
        mode = 'expired';
        assert.equal((await call('steam/family/sync')).status, 502);
        assert.deepEqual(await readFile(join(dir, 'library.sqlite')), old);
        const personal = await call('steam/sync', {
            profileUrl: `https://steamcommunity.com/profiles/${viewer}/`,
            force: true,
        });
        assert.equal(personal.status, 200);
        assert.equal(
            (await readState()).games.find((g) => g.appId === 2)?.shared,
            true,
        );
        mode = 'left';
        assert.equal((await call('steam/family/sync')).status, 200);
        const left = await readState();
        assert.equal(left.family, null);
        assert.deepEqual(
            left.games.map((g) => g.appId),
            [1],
        );
        assert.equal(left.preferences['2'].favorite, true);
    } finally {
        globalThis.fetch = originalFetch;
        process.chdir(previousCwd);
        if (previousDir === undefined) delete process.env.NEXTPLAY_DATA_DIR;
        else process.env.NEXTPLAY_DATA_DIR = previousDir;
        if (previousBinary === undefined) delete process.env.NEXTPLAY_CODEX_BIN;
        else process.env.NEXTPLAY_CODEX_BIN = previousBinary;
        if (dir.startsWith(join(root, 'nextplay-family-test-')))
            await rm(dir, { recursive: true, force: true });
    }
});
