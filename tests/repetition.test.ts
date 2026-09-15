import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FILTERS, EMPTY_STATE } from '../lib/model.ts';
import type { Game, HistoryEntry, State } from '../lib/model.ts';
import { buildPrompt } from '../server/codex.ts';
import {
    recentRecommendationPenalties,
    recommendLocally,
    selectCandidates,
} from '../server/selection.ts';

void test('recent suggestions lose priority without exclusions; explicit requests and hard filters prevail', () => {
    const games: Game[] = Array.from({ length: 8 }, (_, i) => ({
        appId: i + 1,
        name: `Candidate ${i + 1}`,
        owned: true,
        playtimeMinutes: 0,
        recentMinutes: 0,
    }));
    const state: State = {
        ...structuredClone(EMPTY_STATE),
        games,
        history: [],
    };
    const first = recommendLocally(state, DEFAULT_FILTERS);
    state.history!.push({
        id: 'first',
        text: '',
        filters: DEFAULT_FILTERS,
        result: first,
    });
    assert.deepEqual(
        recommendLocally(state, DEFAULT_FILTERS).owned.map((p) => p.appId),
        [4, 5, 6],
    );
    assert.equal(
        selectCandidates(state, [], DEFAULT_FILTERS, 'Quiero Candidate 1')[0]
            .appId,
        1,
    );
    state.preferences[1] = { favorite: false, status: 'ignored' };
    assert.ok(
        !selectCandidates(
            state,
            [],
            DEFAULT_FILTERS,
            'Quiero Candidate 1',
        ).some((g) => g.appId === 1),
    );
    assert.equal(
        selectCandidates(state, [], {
            ...DEFAULT_FILTERS,
            mode: 'next',
            hours: 5,
        }).length,
        0,
    );
    state.games = games.slice(1, 3);
    assert.equal(recommendLocally(state, DEFAULT_FILTERS).owned.length, 2);

    const turn = (id: number): HistoryEntry => ({
        id: String(id),
        text: '',
        filters: DEFAULT_FILTERS,
        result: {
            ...first,
            owned: [{ ...first.owned[0], appId: id }],
            discoveries: [],
        },
    });
    state.history = [1, 2, 3, 4, 5, 6].map(turn);
    assert.deepEqual(
        [...recentRecommendationPenalties(state)],
        [
            [6, 30],
            [5, 24],
            [4, 18],
            [3, 12],
            [2, 6],
        ],
    );
    const data = JSON.parse(
        buildPrompt(state, games, DEFAULT_FILTERS, '').split(
            'DATOS_JSON:\n',
        )[1],
    );
    assert.deepEqual(
        data.recentRecommendations,
        [6, 5, 4, 3, 2].map((appId, i) => ({ appId, penalty: 30 - 6 * i })),
    );
});
