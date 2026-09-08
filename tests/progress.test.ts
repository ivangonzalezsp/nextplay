import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FILTERS, EMPTY_STATE } from '../lib/model.ts';
import type { Game } from '../lib/model.ts';
import {
  parseFilters,
  parsePreference,
  selectCandidates,
  recommendLocally,
  validatePicks,
} from '../server/selection.ts';
import { buildPrompt } from '../server/codex.ts';
import { openDatabase, storeState, loadState } from '../server/database.ts';

void test('explicit progress survives persistence and constrains both recommendation engines only today', () => {
  const state = structuredClone(EMPTY_STATE);
  state.games = [1, 2, 3, 4, 5, 6].map(
    (appId): Game => ({
      appId,
      name: `Juego ${appId}`,
      owned: appId !== 2,
      shared: appId === 2,
      playtimeMinutes: appId === 3 ? 100000 : 0,
      recentMinutes: 0,
    }),
  );
  state.preferences = {
    '1': parsePreference({ favorite: true, status: 'playing' }),
    '2': parsePreference({ favorite: false, status: 'paused' }),
    '4': parsePreference({ favorite: false, status: 'completed' }),
    '5': parsePreference({ favorite: false, status: 'ignored' }),
    '6': parsePreference({ favorite: false, status: 'abandoned' }),
  };
  const filters = parseFilters({
    ...DEFAULT_FILTERS,
    sessionIntent: 'continue',
    replay: true,
  });
  state.filters = filters;
  const db = openDatabase(':memory:');
  try {
    storeState(db, state);
    const saved = loadState(db)!;
    assert.deepEqual(saved.preferences, state.preferences);
    assert.deepEqual(saved.filters, filters);
    const discovery = { ...state.games[0], appId: 7, owned: false };
    saved.preferences['7'] = { favorite: false, status: 'playing' };
    const candidates = selectCandidates(saved, [discovery], filters);
    assert.deepEqual(
      candidates.map((g) => g.appId),
      [1, 2],
    );
    assert.deepEqual(
      recommendLocally(saved, filters).owned.map((p) => p.appId),
      [1, 2],
    );
    assert.deepEqual(recommendLocally(saved, filters).discoveries, []);
    assert.deepEqual(
      selectCandidates(saved, [], { ...filters, sessionIntent: 'start' }).map(
        (g) => g.appId,
      ),
      [3],
    );
    assert.deepEqual(
      selectCandidates(saved, [], { ...filters, mode: 'next' })
        .map((g) => g.appId)
        .sort(),
      [1, 2, 3, 4, 6],
    );
    const promptData = JSON.parse(
      buildPrompt(saved, candidates, filters, '').split('DATOS_JSON:\n')[1],
    );
    assert.equal(promptData.filters.sessionIntent, 'continue');
    assert.equal(promptData.candidates[0].preference.status, 'playing');
    const nextData = JSON.parse(
      buildPrompt(saved, candidates, { ...filters, mode: 'next' }, '').split(
        'DATOS_JSON:\n',
      )[1],
    );
    assert.equal(nextData.filters.sessionIntent, 'any');
    assert.throws(() =>
      validatePicks(
        {
          message: 'Propuesta',
          owned: [{ appId: 3, reason: 'r', whyNow: 'w', caveat: 'c' }],
          discoveries: [],
        },
        candidates,
      ),
    );
    // Old states/requests retain their previous behavior; hours never assign a status.
    const { sessionIntent, ...legacy } = DEFAULT_FILTERS;
    assert.equal(parseFilters(legacy).sessionIntent, 'any');
    assert.equal(saved.preferences['3'], undefined);
    assert.deepEqual(
      selectCandidates(saved, [], legacy).map((g) => g.appId),
      [1, 2, 3],
    );
    for (const invalid of [null, '', 'resume', 4])
      assert.throws(() =>
        parseFilters({ ...DEFAULT_FILTERS, sessionIntent: invalid }),
      );
  } finally {
    db.close();
  }
});
