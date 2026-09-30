import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EMPTY_STATE, type Game } from '../lib/model.ts';
import { selectWelcomeGames } from '../lib/welcome.ts';
import { applyWelcome } from '../server/welcome.ts';
import { handle } from '../server/api.ts';
import { readState, saveState } from '../server/store.ts';
import { buildTasteProfile } from '../lib/tastes.ts';
import { eligible } from '../lib/filters.ts';

const game = (
    appId: number,
    name: string,
    hours: number,
    tag = 'Action',
): Game => ({
    appId,
    name,
    owned: true,
    playtimeMinutes: hours * 60,
    recentMinutes: 0,
    steamTags: [{ name: tag }],
});

void test('welcome selects played library games with variety, without rated editions or reviewed games', () => {
    const state = structuredClone(EMPTY_STATE);
    state.games = [
        game(1, 'Action A', 500),
        game(2, 'Action B', 400),
        game(3, 'Portal', 3, 'Puzzle'),
        game(4, 'Action A Definitive Edition', 100),
        game(5, 'Ignored', 100),
        game(6, 'Unplayed', 0),
        game(7, 'Discovery', 80),
        game(8, 'Tool', 100),
        { ...game(-1, 'Manual', 2, 'Strategy'), owned: false, shared: true },
    ];
    state.games[6].owned = false;
    state.games[7].isGame = false;
    state.preferences['5'] = { status: 'ignored', favorite: false };
    assert.deepEqual(
        selectWelcomeGames(state).map((g) => g.appId),
        [1, 3, -1, 2],
    );
    assert.equal(
        state.preferences['1'],
        undefined,
        'hours do not create opinions or completion',
    );
    state.preferences['4'] = {
        status: 'pending',
        favorite: false,
        opinion: 'loved',
    };
    state.welcome = { reviewed: [3], dismissed: true, completed: false };
    assert.deepEqual(
        selectWelcomeGames(state).map((g) => g.appId),
        [2, -1],
    );
    state.welcome.reviewed = [3, 4, 6, 7];
    assert.equal(
        selectWelcomeGames(state).length,
        1,
        'resume keeps the five-game limit',
    );
    state.welcome.reviewed.push(2);
    assert.deepEqual(selectWelcomeGames(state), []);
});

void test('invalid welcome answers do not partially mutate preferences or tastes', () => {
    const state = structuredClone(EMPTY_STATE);
    state.games = [game(1, 'One', 30)];
    const before = structuredClone(state);
    for (const payload of [
        { appId: 999, preference: { status: 'completed' } },
        { appId: 1, preference: { favorite: true } },
        {
            appId: 1,
            preference: { status: 'completed' },
            overrides: { narrative: 'invalid' },
        },
        { appId: 1, preference: { opinionReason: 'No opinion' } },
        {
            appId: 1,
            preference: { opinion: 'liked', opinionReason: 'x'.repeat(501) },
        },
        { completed: 'yes' },
        { unknown: true },
        { overrides: [] },
        { preference: {} },
    ]) {
        assert.throws(() => applyWelcome(state, payload));
        assert.deepEqual(state, before);
    }
});

void test('welcome API persists answers, resume and completion without inventing dates or erasing other data', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nextplay-welcome-'));
    const previous = {
        data: process.env.NEXTPLAY_DATA_DIR,
        user: process.env.NEXTPLAY_USER_DIR,
        binary: process.env.NEXTPLAY_CODEX_BIN,
    };
    process.env.NEXTPLAY_DATA_DIR = dir;
    process.env.NEXTPLAY_USER_DIR = dir;
    process.env.NEXTPLAY_CODEX_BIN = join(dir, 'missing-codex');
    try {
        const state = structuredClone(EMPTY_STATE);
        state.games = [game(1, 'One', 30, 'Story Rich'), game(2, 'Two', 20)];
        state.preferences['1'] = { favorite: true, status: 'pending' };
        state.tastes = {
            overrides: { automation: 'like' },
            ignoredHours: [2],
            notes: 'Keep me',
        };
        state.playHistory = [
            { appId: 2, name: 'Two', kind: 'started', at: 1000 },
        ];
        await saveState(state);
        const call = (payload: Record<string, unknown>) =>
            handle(
                new Request('http://localhost:3000/api/welcome', {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        Origin: 'http://localhost:3000',
                    },
                    body: JSON.stringify(payload),
                }),
            );
        assert.equal(
            (
                await call({
                    appId: 1,
                    preference: {
                        status: 'completed',
                        opinion: 'loved',
                        opinionReason: 'Its story',
                    },
                })
            ).status,
            200,
        );
        assert.equal(
            (await call({ overrides: { narrative: 'like' }, dismissed: true }))
                .status,
            200,
        );
        let saved = await readState();
        assert.deepEqual(saved.preferences['1'], {
            favorite: true,
            status: 'completed',
            opinion: 'loved',
            opinionReason: 'Its story',
        });
        assert.deepEqual(saved.playHistory, state.playHistory);
        assert.deepEqual(saved.conversation, state.conversation);
        assert.deepEqual(saved.tastes, {
            ...state.tastes,
            overrides: { automation: 'like', narrative: 'like' },
        });
        assert.deepEqual(saved.welcome, {
            reviewed: [1],
            dismissed: true,
            completed: false,
        });
        assert.deepEqual(
            selectWelcomeGames(saved).map((g) => g.appId),
            [2],
        );
        assert.equal(
            eligible(saved.games[0], saved.preferences['1'], saved.filters),
            false,
        );
        assert(
            buildTasteProfile(saved).find((a) => a.id === 'narrative')!
                .inferred > 0,
        );
        assert.equal(
            (await call({ appId: 2 })).status,
            200,
            'skip is remembered without changing status',
        );
        assert.equal(
            (await call({ completed: true, dismissed: false })).status,
            200,
        );
        saved = await readState();
        assert.equal(saved.welcome?.completed, true);
        assert.equal(saved.preferences['2'], undefined);
        assert.equal(
            (
                await call({
                    appId: 1,
                    preference: { opinion: null, opinionReason: null },
                })
            ).status,
            200,
        );
        saved = await readState();
        assert.equal(saved.preferences['1'].opinion, undefined);
        assert.equal(saved.preferences['1'].favorite, true);
        assert.deepEqual(saved.playHistory, state.playHistory);
        assert.equal(
            (await call({ appId: 1, preference: { status: 'invalid' } }))
                .status,
            400,
        );
        assert.deepEqual(await readState(), saved);
    } finally {
        for (const [key, value] of Object.entries({
            NEXTPLAY_DATA_DIR: previous.data,
            NEXTPLAY_USER_DIR: previous.user,
            NEXTPLAY_CODEX_BIN: previous.binary,
        })) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        await rm(dir, { recursive: true, force: true });
    }
});
