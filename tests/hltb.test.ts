import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_FILTERS, EMPTY_STATE, storyHours } from '../lib/model.ts';
import type { Game } from '../lib/model.ts';
import { atomicJson, saveState } from '../server/store.ts';
import { handle } from '../server/api.ts';
import {
    expireHltbCache,
    getHltbCache,
    pendingHltb,
    refreshHltb,
    validateHltb,
    withHltb,
} from '../server/hltb.ts';
import { eligible } from '../server/selection.ts';
import { buildPrompt } from '../server/codex.ts';

const portal: Game = {
    appId: 400,
    name: 'Portal',
    owned: true,
    playtimeMinutes: 0,
    recentMinutes: 0,
    durationHours: 10,
};
const duration = {
    id: 7230,
    mainHours: 3.12,
    extraHours: 5.26,
    completionHours: 10.52,
};

void test('HLTB validates identities and durations; story filters and Codex use the same source', () => {
    const result = validateHltb([{ appId: 400, data: duration }], [portal]);
    const game = { ...portal, hltb: result[0].data! };
    assert.equal(storyHours(game), 3.12);
    assert.equal(
        eligible(game, undefined, {
            ...DEFAULT_FILTERS,
            mode: 'next',
            hours: 4,
        }),
        true,
    );
    assert.equal(
        eligible(portal, undefined, {
            ...DEFAULT_FILTERS,
            mode: 'next',
            hours: 4,
        }),
        false,
    );
    assert.equal(
        eligible(game, undefined, {
            ...DEFAULT_FILTERS,
            mode: 'today',
            minutes: 15,
            hours: 1,
        }),
        true,
    );
    assert.equal(
        storyHours({ ...game, hltb: { ...game.hltb, mainHours: null } }),
        10,
    );
    const prompt = JSON.parse(
        buildPrompt(EMPTY_STATE, [game], DEFAULT_FILTERS, '').split(
            'DATOS_JSON:\n',
        )[1],
    );
    assert.equal(prompt.candidates[0].durationHours, 3.12);
    assert.equal(prompt.candidates[0].durationSource, 'HLTB');
    const nextPrompt = JSON.parse(
        buildPrompt(
            EMPTY_STATE,
            [game],
            { ...DEFAULT_FILTERS, mode: 'next', hours: 4 },
            '',
        ).split('DATOS_JSON:\n')[1],
    );
    assert.equal(nextPrompt.filters.minutes, null);
    assert.equal(nextPrompt.filters.hours, 4);
    for (const invalid of [
        [],
        [{ appId: 999, data: duration }],
        [{ appId: 400, data: { ...duration, mainHours: -2 } }],
        [{ appId: 400, data: { ...duration, mainHours: '3' } }],
        [{ appId: 400, data: { ...duration, id: 0 } }],
    ])
        assert.throws(() => validateHltb(invalid, [portal]));
    assert.throws(() =>
        validateHltb(
            [
                { appId: 400, data: duration },
                { appId: 400, data: duration },
            ],
            [portal, { ...portal, appId: 620 }],
        ),
    );
});

void test('HLTB cache bounds work, survives failures and missing matches, and supports manual expiration', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nextplay-hltb-test-'));
    const previous = process.env.NEXTPLAY_DATA_DIR;
    process.env.NEXTPLAY_DATA_DIR = dir;
    try {
        const cache = await getHltbCache();
        assert.deepEqual(
            await refreshHltb([portal], cache, false, async () => [
                { appId: 400, data: duration },
            ]),
            [],
        );
        assert.equal(withHltb([portal], cache)[0].hltb?.id, 7230);
        assert.deepEqual(
            await refreshHltb([portal], cache, false, async () => {
                throw new Error('Fresh cache must not call Python');
            }),
            [],
        );
        const stored = structuredClone(cache);
        assert.equal(
            (
                await refreshHltb([portal], cache, true, async () => {
                    throw new Error('403');
                })
            ).length,
            1,
        );
        assert.deepEqual(cache, stored);
        assert.equal(
            (
                await refreshHltb([portal], cache, true, async () => [
                    { appId: 999, data: duration },
                ])
            ).length,
            1,
        );
        assert.deepEqual(await getHltbCache(), stored);
        await refreshHltb([portal], cache, true, async () => [
            { appId: 400, data: null },
        ]);
        assert.deepEqual(cache['400'].data, stored['400'].data);
        await expireHltbCache();
        assert.equal((await getHltbCache())['400'].checkedAt, 0);
        let count = 0;
        const games = Array.from({ length: 12 }, (_, i) => ({
            ...portal,
            appId: 1000 + i,
        }));
        await refreshHltb(games, cache, false, async (batch) => {
            count = batch.length;
            return batch.map((g) => ({ appId: g.appId, data: null }));
        });
        assert.equal(count, 8);
        assert.deepEqual(
            pendingHltb(games, cache).map((game) => game.appId),
            games.slice(8).map((game) => game.appId),
        );
        assert.deepEqual(
            await refreshHltb(games.slice(0, 8), cache, false, async () => {
                assert.fail('Negative results must be cached');
            }),
            [],
        );
    } finally {
        if (previous === undefined) delete process.env.NEXTPLAY_DATA_DIR;
        else process.env.NEXTPLAY_DATA_DIR = previous;
        await rm(dir, { recursive: true, force: true });
    }
});

void test('state snapshots expose cached HLTB durations to the library', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nextplay-hltb-state-'));
    const previousDataDir = process.env.NEXTPLAY_DATA_DIR;
    const previousUserDir = process.env.NEXTPLAY_USER_DIR;
    process.env.NEXTPLAY_DATA_DIR = dir;
    process.env.NEXTPLAY_USER_DIR = dir;
    try {
        await atomicJson(join(dir, 'hltb.json'), {
            '400': { checkedAt: Date.now(), data: duration },
        });
        await saveState({
            ...structuredClone(EMPTY_STATE),
            games: [portal],
        });
        const response = await handle(
            new Request('http://127.0.0.1:3000/api/state', {
                method: 'GET',
            }),
        );
        assert.equal(response.status, 200);
        const snapshot = (await response.json()) as { games: Game[] };
        assert.equal(snapshot.games[0].hltb?.mainHours, 3.12);
    } finally {
        if (previousDataDir === undefined) delete process.env.NEXTPLAY_DATA_DIR;
        else process.env.NEXTPLAY_DATA_DIR = previousDataDir;
        if (previousUserDir === undefined) delete process.env.NEXTPLAY_USER_DIR;
        else process.env.NEXTPLAY_USER_DIR = previousUserDir;
        await rm(dir, { recursive: true, force: true });
    }
});
