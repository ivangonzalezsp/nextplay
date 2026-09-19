import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { EMPTY_STATE } from '../lib/model.ts';
import { handle } from '../server/api.ts';
import { readState, saveConnections, saveState } from '../server/store.ts';
import { fetchSteamAchievements } from '../server/steam-achievements.ts';

void test('Steam achievements combine the schema with the player progress', async () => {
    const originalFetch = globalThis.fetch;
    const calls: URL[] = [];
    globalThis.fetch = async (input) => {
        const url = new URL(
            input instanceof Request ? input.url : input.toString(),
        );
        calls.push(url);
        if (url.pathname.endsWith('GetSchemaForGame/v2/'))
            return Response.json({
                game: {
                    availableGameStats: {
                        achievements: [
                            {
                                name: 'FIRST',
                                displayName: 'Primer paso',
                                description: 'Empieza la aventura',
                                hidden: 0,
                            },
                            {
                                name: 'SECRET',
                                displayName: 'Secreto',
                                hidden: 1,
                            },
                        ],
                    },
                },
            });
        return Response.json({
            playerstats: {
                achievements: [
                    {
                        apiname: 'FIRST',
                        achieved: 1,
                        unlocktime: 1_700_000_000,
                    },
                    { apiname: 'SECRET', achieved: 0 },
                ],
            },
        });
    };
    try {
        const result = await fetchSteamAchievements(
            '76561198000000000',
            'a'.repeat(32),
            123,
        );
        assert.equal(result.unlocked, 1);
        assert.equal(result.total, 2);
        assert.deepEqual(result.achievements[0], {
            apiName: 'FIRST',
            name: 'Primer paso',
            description: 'Empieza la aventura',
            hidden: false,
            achieved: true,
            unlockTime: 1_700_000_000_000,
        });
        assert.equal(result.achievements[1].hidden, true);
        assert.equal(calls.length, 2);
        assert.equal(calls[0].searchParams.get('appid'), '123');
        assert.equal(
            calls[1].pathname.endsWith('GetPlayerAchievements/v1/'),
            true,
        );
    } finally {
        globalThis.fetch = originalFetch;
    }
});

void test('Steam achievements sync accepts completed games', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nextplay-achievements-'));
    const previousDataDir = process.env.NEXTPLAY_DATA_DIR;
    const previousUserDir = process.env.NEXTPLAY_USER_DIR;
    const previousCodexBin = process.env.NEXTPLAY_CODEX_BIN;
    const originalFetch = globalThis.fetch;
    process.env.NEXTPLAY_DATA_DIR = dir;
    process.env.NEXTPLAY_USER_DIR = dir;
    process.env.NEXTPLAY_CODEX_BIN = join(dir, 'missing-codex.exe');
    try {
        await saveConnections({ STEAM_API_KEY: 'a'.repeat(32) });
        await saveState({
            ...structuredClone(EMPTY_STATE),
            profile: {
                steamId: '76561198000000000',
                name: 'Jugador',
                url: 'https://steamcommunity.com/profiles/76561198000000000/',
            },
            games: [
                {
                    appId: 123,
                    name: 'Juego terminado',
                    owned: true,
                    playtimeMinutes: 60,
                    recentMinutes: 0,
                },
            ],
            preferences: {
                '123': { favorite: false, status: 'completed' },
            },
        });
        globalThis.fetch = async (input) => {
            const url = new URL(
                input instanceof Request ? input.url : input.toString(),
            );
            if (url.pathname.endsWith('GetSchemaForGame/v2/'))
                return Response.json({
                    game: {
                        availableGameStats: {
                            achievements: [
                                {
                                    name: 'COMPLETE',
                                    displayName: 'Final',
                                    hidden: 0,
                                },
                            ],
                        },
                    },
                });
            return Response.json({
                playerstats: {
                    achievements: [
                        { apiname: 'COMPLETE', achieved: 1, unlocktime: 1 },
                    ],
                },
            });
        };
        const response = await handle(
            new Request('http://localhost:3000/api/steam/achievements/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ appId: 123, force: true }),
            }),
        );
        assert.equal(response.status, 200);
        assert.equal(
            (await readState()).games[0].steamAchievements?.unlocked,
            1,
        );
    } finally {
        globalThis.fetch = originalFetch;
        if (previousDataDir === undefined) delete process.env.NEXTPLAY_DATA_DIR;
        else process.env.NEXTPLAY_DATA_DIR = previousDataDir;
        if (previousUserDir === undefined) delete process.env.NEXTPLAY_USER_DIR;
        else process.env.NEXTPLAY_USER_DIR = previousUserDir;
        if (previousCodexBin === undefined)
            delete process.env.NEXTPLAY_CODEX_BIN;
        else process.env.NEXTPLAY_CODEX_BIN = previousCodexBin;
        await rm(dir, { recursive: true, force: true });
    }
});
