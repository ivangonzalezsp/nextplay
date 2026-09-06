import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DEFAULT_FILTERS, EMPTY_STATE } from '../lib/model.ts';
import type { Game, Snapshot } from '../lib/model.ts';
import { saveState, readState } from '../server/store.ts';
import { handle } from '../server/api.ts';

// Explicit live check: uses Codex quota, fictional fixtures and an isolated data directory.
const root = resolve(tmpdir());
const dir = await mkdtemp(join(root, 'nextplay-live-'));
const oldDir = process.env.NEXTPLAY_DATA_DIR,
  oldPython = process.env.NEXTPLAY_PYTHON,
  originalFetch = globalThis.fetch;
process.env.NEXTPLAY_DATA_DIR = dir;
process.env.NEXTPLAY_PYTHON = join(dir, 'python-disabled');
const game = (appId: number, durationHours: number): Game => ({
  appId,
  name: 'Juego de prueba ' + appId,
  owned: true,
  playtimeMinutes: 0,
  recentMinutes: 0,
  genres: [{ id: 1, name: 'Aventura' }],
  gameModes: [1],
  durationHours,
  summary:
    'Datos ficticios de prueba: exploración y puzles, sin modo competitivo.',
});
try {
  await saveState({
    ...structuredClone(EMPTY_STATE),
    profile: {
      name: 'Prueba aislada',
      steamId: '76561198000000001',
      url: 'https://steamcommunity.com/profiles/76561198000000001/',
    },
    syncedAt: Date.now(),
    games: [game(1001, 2), game(1002, 8), game(1003, 30)],
    preferences: {
      '1001': { favorite: true, status: 'pending' },
      '1003': { favorite: false, status: 'ignored' },
    },
  });
  // Only the data sources use Node fetch; Codex uses its official executable separately.
  globalThis.fetch = async (input) =>
    (input instanceof Request ? input.url : input.toString()).includes(
      '/appreviews/',
    )
      ? Response.json({
          success: 1,
          query_summary: { total_positive: 90, total_reviews: 100 },
        })
      : new Response('External data disabled for this test', { status: 503 });
  for (const mode of ['today', 'next'] as const) {
    const response = await handle(
      new Request('http://127.0.0.1:3000/api/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://127.0.0.1:3000',
        },
        body: JSON.stringify({
          filters: {
            ...DEFAULT_FILTERS,
            mode,
            hours: mode === 'next' ? 3 : null,
          },
          text:
            mode === 'today'
              ? 'Recomienda uno de los juegos disponibles para explorar sin competir.'
              : 'Mantén lo de explorar sin competir; ahora quiero una historia de hasta 3 horas.',
        }),
      }),
    );
    const next = (await response.json()) as Snapshot & { error?: string };
    assert.equal(response.status, 200, next.error);
    const result = next.conversation.at(-1)!.result;
    assert.ok(
      result.owned.length > 0,
      'Expected an eligible owned recommendation',
    );
    assert.ok(result.owned.every((p) => p.appId !== 1003));
    if (mode === 'next') assert.ok(result.owned.every((p) => p.appId === 1001));
    console.log(mode + ': propuesta válida, exclusiones y límites respetados.');
  }
  const restarted = await readState();
  assert.equal(restarted.conversation.length, 2);
  assert.equal(restarted.preferences['1001'].favorite, true);
  assert.equal(restarted.filters.mode, 'next');
  console.log(
    'Conversación y preferencias conservadas después de releer el estado.',
  );
} finally {
  if (oldPython === undefined) delete process.env.NEXTPLAY_PYTHON;
  else process.env.NEXTPLAY_PYTHON = oldPython;
  globalThis.fetch = originalFetch;
  if (oldDir === undefined) delete process.env.NEXTPLAY_DATA_DIR;
  else process.env.NEXTPLAY_DATA_DIR = oldDir;
  if (dir.startsWith(join(root, 'nextplay-live-')))
    await rm(dir, { recursive: true, force: true });
}
