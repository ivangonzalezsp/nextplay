import { buildTasteProfile } from '../lib/tastes.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FILTERS, EMPTY_STATE } from '../lib/model.ts';
import type { Game, State } from '../lib/model.ts';
import {
  comfortSelection,
  parseFilters,
  recommendLocally,
  selectCandidates,
} from '../server/selection.ts';
import { buildPrompt } from '../server/codex.ts';
const game = (
  appId: number,
  tags: number[],
  more: Partial<Game> = {},
): Game => ({
  appId,
  name: `Game ${appId}`,
  owned: true,
  playtimeMinutes: 0,
  recentMinutes: 0,
  durationHours: 5,
  steamTags: tags.map((id) => ({ id, name: String(id) })),
  ...more,
});
const state = (games: Game[]): State => ({
  ...EMPTY_STATE,
  games,
  preferences: {},
  tastes: {
    overrides: { narrative: 'like', survival: 'dislike' },
    ignoredHours: [],
    notes: '',
  },
});
const filters = { ...DEFAULT_FILTERS, comfortZone: true };
void test('comfort mode chooses distinct evidence-backed picks across the full eligible library', () => {
  const s = state([
    game(1, [1742]),
    ...Array.from({ length: 90 }, (_, i) => game(i + 10, [])),
    game(200, [1742, 9]),
    game(2, [1742, 1662]),
  ]);
  const out = recommendLocally(s, filters);
  assert.deepEqual(
    out.owned.map((p) => p.appId),
    [1, 200],
  );
  assert.match(out.owned[0].reason, /Opción afín/);
  assert.match(out.owned[1].reason, /Opción distinta.*Steam: 9/);
  assert.match(out.owned[1].reason, /no demuestra/);
  assert.equal(recommendLocally(s, DEFAULT_FILTERS).owned.length, 3);
  const prompt = buildPrompt(s, selectCandidates(s, [], filters), filters, '');
  const data = JSON.parse(prompt.split('DATOS_JSON:\n')[1]);
  assert.deepEqual(data.comfortZone.games, [1, 200]);
  assert.equal(
    JSON.parse(
      buildPrompt(s, s.games, DEFAULT_FILTERS, '').split('DATOS_JSON:\n')[1],
    ).comfortZone,
    undefined,
  );
});
void test('comfort respects exclusion, story cap, genre, mode and selected tags before selection', () => {
  const base = game(1, [1742], {
    genres: [{ id: 1, name: 'RPG' }],
    gameModes: [1],
  });
  for (const change of [
    { durationHours: 30 },
    { durationHours: null },
    { genres: [] },
    { gameModes: [3] },
    { steamTags: [{ id: 9, name: 'Strategy' }] },
  ]) {
    const s = state([base, { ...base, ...change, appId: 2 }]);
    const out = recommendLocally(s, {
      ...filters,
      mode: 'next',
      hours: 10,
      genre: 'RPG',
      gameMode: 'single',
      tags: ['id:1742'],
    });
    assert.deepEqual(
      out.owned.map((p) => p.appId),
      [1],
    );
  }
  for (const status of ['ignored', 'completed', 'abandoned'] as const) {
    const s = state([base, game(2, [1742, 9])]);
    s.preferences['2'] = { favorite: true, status };
    assert.deepEqual(
      recommendLocally(s, filters).owned.map((p) => p.appId),
      [1],
    );
  }
});
void test('missing signals and lack of contrast are reported honestly, malformed mode rejected', () => {
  const s = state([game(1, [1742]), game(2, [])]);
  assert.match(recommendLocally(s, filters).message, /no una alternativa/);
  assert.deepEqual(
    comfortSelection(state([game(2, [])]), [game(2, [])]).games,
    [],
  );
  s.tastes!.overrides = {};
  assert.equal(recommendLocally(s, filters).owned.length, 0);
  assert.throws(() =>
    parseFilters({ ...DEFAULT_FILTERS, comfortZone: 'true' }),
  );
  assert.equal(parseFilters(filters).comfortZone, true);
  assert.deepEqual(parseFilters(DEFAULT_FILTERS), DEFAULT_FILTERS);
});

void test('contrast works when all nine inferred affinities are positive and dislikes remain soft', () => {
  // History represents every trait, with a much stronger narrative preference.
  const history = [
    game(900, [122, 29482, 9, 255534, 1716, 1695, 1742, 1662, 3859], {
      playtimeMinutes: 60,
    }),
    ...Array.from({ length: 5 }, (_, i) =>
      game(901 + i, [1742], { playtimeMinutes: 6000 }),
    ),
  ];
  const s = state([game(1, [1742]), game(2, [1742, 9, 1662]), ...history]);
  s.tastes!.overrides = {};
  for (const g of history)
    s.preferences[g.appId] = { favorite: false, status: 'completed' };
  const profile = buildTasteProfile(s);
  assert.equal(profile.length, 9);
  assert(profile.every((a) => a.inferred > 0));
  assert.deepEqual(
    recommendLocally(s, filters).owned.map((p) => p.appId),
    [1, 2],
  );
  s.tastes!.overrides = { survival: 'dislike' };
  const out = recommendLocally(s, filters);
  assert.deepEqual(
    out.owned.map((p) => p.appId),
    [1, 2],
  );
  assert.match(out.owned[1].reason, /menos representado/);
  assert.match(out.owned[1].reason, /Steam: 9/);
  assert.doesNotMatch(out.owned[1].reason, /Steam: 1662/);
});

void test('negative opinion evidence is not presented as an appealing contrast', () => {
  const s = state([
    game(1, [1742]),
    game(2, [1742, 9]),
    game(99, [9], { playtimeMinutes: 1000 }),
  ]);
  s.preferences[99] = {
    status: 'completed',
    favorite: false,
    opinion: 'disliked',
  };
  assert(buildTasteProfile(s).some((a) => a.inferred < 0));
  assert.deepEqual(
    recommendLocally(s, filters).owned.map((p) => p.appId),
    [1],
  );
});
