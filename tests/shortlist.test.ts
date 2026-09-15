import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FILTERS, EMPTY_STATE } from '../lib/model.ts';
import type { Game, State } from '../lib/model.ts';
import {
    updateShortlist,
    selectCandidates,
    recommendLocally,
    parseFilters,
    validatePicks,
} from '../server/selection.ts';
import { openDatabase, storeState, loadState } from '../server/database.ts';
import { buildPrompt } from '../server/codex.ts';

void test('shortlist persists candidates independently and both engines restrict selection with existing exclusions', () => {
    const game = (appId: number, more: Partial<Game> = {}): Game => ({
        appId,
        name: `Game ${appId}`,
        owned: true,
        playtimeMinutes: 0,
        recentMinutes: 0,
        durationHours: 5,
        genres: [{ id: 1, name: 'RPG' }],
        ...more,
    });
    const discovery = game(900, { owned: false });
    const pick = {
        appId: 900,
        game: discovery,
        reason: 'Reason',
        whyNow: 'Now',
        caveat: 'Caveat',
    };
    const state: State = {
        ...structuredClone(EMPTY_STATE),
        games: Array.from({ length: 70 }, (_, i) => game(i + 1)),
        history: [
            {
                id: 'history',
                text: '',
                filters: DEFAULT_FILTERS,
                result: {
                    message: 'Saved search',
                    owned: [],
                    discoveries: [pick],
                    at: 1,
                    warnings: [],
                },
            },
        ],
    };
    for (const game of state.games) updateShortlist(state, game.appId, true);
    updateShortlist(state, 900, true);
    updateShortlist(state, 900, true);
    assert.equal(state.shortlist?.length, 71);
    assert.throws(() => updateShortlist(state, 999, true));
    assert.throws(() => updateShortlist(state, 1, 'true'));
    assert.throws(() =>
        parseFilters({ ...DEFAULT_FILTERS, shortlistOnly: 'yes' }),
    );
    updateShortlist(state, 70, false);
    state.preferences = {
        '1': { favorite: true, status: 'ignored' },
        '2': { favorite: false, status: 'completed' },
    };
    state.games[2].durationHours = 30;
    state.games[3].genres = [{ id: 2, name: 'Action' }];
    state.history = [];
    const db = openDatabase(':memory:');
    try {
        storeState(db, state);
        const restored = loadState(db)!;
        assert.deepEqual(restored.shortlist, state.shortlist);
        const filters = parseFilters({
            ...DEFAULT_FILTERS,
            shortlistOnly: true,
            mode: 'next',
            hours: 10,
            genre: 'RPG',
        });
        const candidates = selectCandidates(
            restored,
            [game(999, { owned: false })],
            filters,
        );
        const ids = candidates.map((game) => game.appId);
        for (const excluded of [1, 2, 3, 4, 70, 999])
            assert.equal(ids.includes(excluded), false);
        assert.equal(ids.includes(900), true);
        restored.shortlist!.push(
            game(901, {
                owned: false,
                shared: true,
                ownerSteamIds: ['former-owner'],
            }),
        );
        const expiredLoan = selectCandidates(restored, [], filters).find(
            (game) => game.appId === 901,
        )!;
        assert.equal(expiredLoan.shared, false);
        assert.equal(expiredLoan.owned, false);
        assert.deepEqual(expiredLoan.ownerSteamIds, []);
        updateShortlist(restored, 901, false);
        const local = recommendLocally(restored, filters);
        assert.equal(local.discoveries[0]?.appId, 900);
        assert.ok(
            [...local.owned, ...local.discoveries].every((pick) =>
                ids.includes(pick.appId),
            ),
        );
        assert.match(
            buildPrompt(restored, candidates, filters, ''),
            /"shortlistOnly":true/,
        );
        assert.throws(() =>
            validatePicks(
                {
                    message: 'Outside',
                    owned: [{ ...pick, appId: 70 }],
                    discoveries: [],
                },
                candidates,
            ),
        );
        restored.shortlist = [];
        assert.deepEqual(selectCandidates(restored, [discovery], filters), []);
        assert.ok(
            selectCandidates(restored, [], DEFAULT_FILTERS).some(
                (game) => game.appId === 70,
            ),
        );
    } finally {
        db.close();
    }
});
