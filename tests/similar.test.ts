import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_STATE, DEFAULT_FILTERS } from '../lib/model.ts';
import type { Game } from '../lib/model.ts';
import { buildPrompt } from '../server/codex.ts';
import { selectCandidates, validatePicks } from '../server/selection.ts';

void test('an ignored/completed reference provides facts without becoming an eligible recommendation', () => {
  const reference: Game = {
    appId: 1,
    name: 'Referencia',
    owned: true,
    playtimeMinutes: 90,
    recentMinutes: 0,
    summary: 'Exploración',
    steamTags: [{ name: 'Aventura' }],
  };
  const other: Game = { ...reference, appId: 2, name: 'Otro' };
  const filters = { ...DEFAULT_FILTERS, genre: 'RPG' };
  for (const status of ['ignored', 'completed'] as const) {
    const state = {
      ...structuredClone(EMPTY_STATE),
      games: [reference, other],
      preferences: { '1': { favorite: false, status } },
    };
    const candidates = selectCandidates(state, [], filters).filter(
      (game) => game.appId !== reference.appId,
    );
    const prompt = buildPrompt(
      state,
      candidates,
      filters,
      'Conservar exploración; menos combate',
      reference,
    );
    const data = JSON.parse(prompt.split('DATOS_JSON:\n')[1]);
    assert.equal(data.reference.game.appId, 1);
    assert.equal(data.reference.game.name, 'Referencia');
    assert.match(data.reference.purpose, /nunca recomendar/);
    assert.equal(data.filters.genre, 'RPG');
    assert.equal(data.text, 'Conservar exploración; menos combate');
    assert.ok(!data.candidates.some((game: Game) => game.appId === 1));
    assert.throws(
      () =>
        validatePicks(
          {
            message: 'Opciones',
            owned: [{ appId: 1, reason: 'x', whyNow: 'x', caveat: 'x' }],
            discoveries: [],
          },
          candidates,
        ),
      /juegos o datos no válidos/,
    );
  }
});
