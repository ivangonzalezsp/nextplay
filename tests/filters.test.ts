import test from 'node:test';
import assert from 'node:assert/strict';
import { clearFilters, filterSummary } from '../lib/filters.ts';
import { EMPTY_STATE, DEFAULT_FILTERS, inLibrary } from '../lib/model.ts';
import type { Game, State } from '../lib/model.ts';
import { selectCandidates } from '../server/selection.ts';

const game = (appId: number, extra: Partial<Game> = {}): Game => ({
  appId,
  name: `Game ${appId}`,
  owned: true,
  playtimeMinutes: 0,
  recentMinutes: 0,
  genres: [{ id: 12, name: 'RPG' }],
  gameModes: [1],
  durationHours: 10,
  releasedAt: Date.UTC(2024, 0, 1),
  steamTags: [
    { id: 1, name: 'One' },
    { id: 2, name: 'Two' },
  ],
  ...extra,
});

test('filter overview matches the candidate selector including Steam Families and tag fallback', () => {
  for (const strictCount of [0, 1, 2, 3, 4]) {
    const state: State = {
      ...structuredClone(EMPTY_STATE),
      games: [
        ...Array.from({ length: strictCount }, (_, i) => game(i + 1)),
        game(10, { steamTags: [{ id: 1, name: 'One' }] }),
        game(11, {
          owned: false,
          shared: true,
          steamTags: [{ id: 2, name: 'Two' }],
        }),
        game(12, { owned: false }),
        game(13, { durationHours: null }),
        game(14, { genres: undefined }),
        game(15, { releasedAt: undefined }),
        game(16, { gameModes: undefined }),
        game(17, { steamTags: undefined }),
        game(18, {
          durationHours: 100,
          hltb: {
            id: 1,
            mainHours: 2,
            extraHours: null,
            completionHours: null,
            at: 0,
          },
        }),
      ],
      preferences: { 10: { status: 'completed', favorite: false } },
    };
    for (const mode of ['today', 'next'] as const) {
      for (const replay of [true, false]) {
        for (const tags of [[], ['id:1'], ['id:1', 'id:2']]) {
          const filters = {
            ...DEFAULT_FILTERS,
            mode,
            replay,
            tags,
            hours: 12,
            genre: 'RPG',
            minReleaseDate: '2020-01-01',
            gameMode: 'single',
          };
          assert.equal(
            filterSummary(state, filters).eligible,
            selectCandidates(
              state,
              [game(50, { owned: false })],
              filters,
            ).filter(inLibrary).length,
          );
          assert.equal(
            filterSummary(state, filters).total,
            state.games.filter(inLibrary).length,
          );
        }
      }
    }
  }
  const state = {
    ...structuredClone(EMPTY_STATE),
    games: [game(1), game(2, { steamTags: [{ id: 1, name: 'One' }] })],
  };
  assert.deepEqual(
    filterSummary(state, { ...DEFAULT_FILTERS, tags: ['id:1', 'id:2'] }),
    { total: 2, eligible: 2, missing: 0, relaxedTags: true },
  );
});

test('missing-data count excludes known mismatches and distinguishes story time from session time', () => {
  const state: State = {
    ...structuredClone(EMPTY_STATE),
    games: [
      game(1, { durationHours: null }),
      game(2, { durationHours: null, genres: [{ id: 1, name: 'Action' }] }),
      game(3, { durationHours: null }),
      game(4, { durationHours: null, owned: false }),
      game(5, { durationHours: 20 }),
      game(6, { durationHours: null, steamTags: [{ id: 1, name: 'One' }] }),
      game(7, { steamTags: [] }),
    ],
    preferences: { 3: { status: 'ignored', favorite: false } },
  };
  const filters = {
    ...DEFAULT_FILTERS,
    mode: 'next' as const,
    hours: 12,
    genre: 'RPG',
    tags: ['id:1', 'id:2'],
  };
  assert.equal(filterSummary(state, filters).missing, 3);
  assert.equal(
    filterSummary(state, { ...filters, mode: 'today', tags: [] }).missing,
    0,
  );
  assert.equal(
    filterSummary(state, { ...filters, hours: null, tags: [] }).missing,
    0,
  );
  assert.equal(filterSummary(state, filters).eligible, 0);
});

test('clear filters retains the selected mode and removes optional constraints without restoring 60 minutes', () => {
  for (const mode of ['today', 'next'] as const) {
    assert.deepEqual(clearFilters(mode), {
      ...DEFAULT_FILTERS,
      mode,
      minutes: null,
      hours: null,
      tags: [],
      replay: true,
    });
  }
});
