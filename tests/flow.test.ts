import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DEFAULT_FILTERS, EMPTY_STATE } from '../lib/model.ts';
import type { Game, State } from '../lib/model.ts';
import {
  eligible,
  parseFilters,
  parsePreference,
  parseProfile,
  selectCandidates,
  validatePicks,
} from '../server/selection.ts';
import {
  ownedGames,
  syncSteam,
  metadata,
  review,
  steamAppLink,
} from '../server/sources.ts';
import {
  atomicJson,
  exclusive,
  readState,
  saveState,
} from '../server/store.ts';
import { parseCodexSettings } from '../server/selection.ts';
import { verifyRequest, handle } from '../server/api.ts';
import { buildPrompt } from '../server/codex.ts';

const game = (appId: number, more: Partial<Game> = {}): Game => ({
  appId,
  name: 'Juego ' + appId,
  owned: true,
  playtimeMinutes: 0,
  recentMinutes: 0,
  genres: [{ id: 12, name: 'RPG' }],
  gameModes: [1],
  durationHours: 30,
  ...more,
});
const profile = {
  steamId: '76561198000000001',
  name: 'Jugador',
  url: 'https://steamcommunity.com/profiles/76561198000000001/',
};
const state = (): State => ({
  ...structuredClone(EMPTY_STATE),
  profile,
  games: [
    game(1),
    game(2),
    game(3),
    game(4),
    game(5, { playtimeMinutes: 100000 }),
  ],
  preferences: {
    '1': { favorite: true, status: 'pending' },
    '2': { favorite: false, status: 'completed' },
    '3': { favorite: false, status: 'ignored' },
    '4': { favorite: false, status: 'abandoned' },
  },
});
const pick = (appId: number) => ({
  appId,
  reason: 'Afinidad orientativa por tus preferencias.',
  whyNow: 'Encaja en lo que buscas.',
  caveat: 'No hay datos de duración de una sesión.',
});

void test('Steam external identifiers require a matching app URL, not a package or stale ID', () => {
  const link = {
    uid: '400',
    game: 71,
    url: 'https://store.steampowered.com/app/400/Portal/',
  };
  assert.equal(steamAppLink(link), true);
  for (const invalid of [
    { ...link, uid: '52003' },
    { ...link, url: undefined },
    { ...link, url: 'https://store.steampowered.com/sub/400/' },
    { ...link, url: 'https://store.steampowered.com.evil.test/app/400/' },
  ])
    assert.equal(steamAppLink(invalid), false);
});

void test('missing IGDB type stays unknown, durations require valid contributions', () => {
  const types = new Set([0]);
  const partial = metadata({ id: 1, name: 'Sin tipo' }, undefined, types);
  assert.equal(partial.isGame, undefined);
  assert.equal(partial.durationHours, null);
  const known = metadata(
    { id: 1, name: 'Juego', game_type: 0 },
    { game_id: 1, count: 4, hastily: 7200 },
    types,
  );
  assert.equal(known.isGame, true);
  assert.equal(known.durationHours, 2);
  assert.equal(
    metadata(
      { id: 1, name: 'Juego' },
      { game_id: 1, count: 0, hastily: 7200 },
      types,
    ).durationHours,
    null,
  );
});

void test('Steam URL and preferences are validated at the boundary', () => {
  assert.equal(
    parseProfile('https://steamcommunity.com/id/fineku/').id,
    'fineku',
  );
  assert.equal(parseProfile(profile.url).type, 'profiles');
  for (const url of [
    'https://steamcommunity.com.attacker.test/id/a',
    'https://user:pass@steamcommunity.com/id/a',
    'file:///id/a',
    'https://steamcommunity.com:8888/id/a',
    'https://steamcommunity.com/profiles/nope/',
  ])
    assert.throws(() => parseProfile(url));
  assert.throws(() => parsePreference({ favorite: 'yes', status: 'pending' }));
  assert.throws(() => parsePreference({ favorite: true, status: '__proto__' }));
  assert.throws(() => parseFilters({ ...DEFAULT_FILTERS, minutes: -1 }));
  assert.throws(() =>
    parseFilters({ ...DEFAULT_FILTERS, gameMode: 'unknown' }),
  );
});
void test('Codex model and effort are validated at the boundary', () => {
  const fallback = { model: 'gpt-5.6-luna', effort: 'medium' as const };
  assert.deepEqual(parseCodexSettings(undefined, fallback), fallback);
  assert.deepEqual(
    parseCodexSettings({ model: ' gpt-5.5 ', effort: 'high' }, fallback),
    { model: 'gpt-5.5', effort: 'high' },
  );
  assert.throws(() =>
    parseCodexSettings({ model: 'gpt-5.5', effort: 'max' }, fallback),
  );
  assert.throws(() =>
    parseCodexSettings({ model: 'gpt-5.5;bad', effort: 'high' }, fallback),
  );
});
void test('inaccessible, empty and malformed libraries are different', () => {
  assert.throws(() => ownedGames({ response: {} }), /no permite leer/);
  assert.deepEqual(ownedGames({ response: { game_count: 0 } }), []);
  assert.throws(
    () =>
      ownedGames({
        response: { game_count: 2, games: [{ appid: 1, name: 'X' }] },
      }),
    /incompleta/,
  );
  assert.throws(
    () =>
      ownedGames({
        response: {
          game_count: 2,
          games: [
            { appid: 1, name: 'X' },
            { appid: 1, name: 'X' },
          ],
        },
      }),
    /duplicada/,
  );
  assert.equal(
    ownedGames({
      response: { game_count: 1, games: [{ appid: 1, name: 'X' }] },
    })[0].playtimeMinutes,
    null,
  );
});
void test('Steam sync resolves vanity, reads library and tolerates unavailable recent activity', async () => {
  const seen: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const u = new URL(input instanceof Request ? input.url : input);
    seen.push(u.pathname);
    assert.equal(u.hostname, 'api.steampowered.com');
    if (u.pathname.includes('ResolveVanity'))
      return Response.json({
        response: { success: 1, steamid: profile.steamId },
      });
    if (u.pathname.includes('GetPlayerSummaries'))
      return Response.json({
        response: {
          players: [{ steamid: profile.steamId, personaname: 'Jugador' }],
        },
      });
    if (u.pathname.includes('GetOwnedGames'))
      return Response.json({
        response: {
          game_count: 1,
          games: [{ appid: 1, name: 'Juego', playtime_forever: 120 }],
        },
      });
    return new Response('Unavailable', { status: 503 });
  };
  const result = await syncSteam(
    'https://steamcommunity.com/id/fineku/',
    'test-key',
    fetcher,
  );
  assert.equal(result.games[0].playtimeMinutes, 120);
  assert.equal(result.profile.steamId, profile.steamId);
  assert.equal(result.warnings.length, 1);
  assert.equal(seen.length, 4);
  await assert.rejects(syncSteam(profile.url, '', fetcher), /STEAM_API_KEY/);
  await assert.rejects(
    syncSteam(profile.url, 'test-key', async () => {
      throw new Error('Network');
    }),
    /conectar/,
  );
});
void test('exclusions win, ownership is authoritative and favorites outrank hours', () => {
  const s = state();
  const result = selectCandidates(
    s,
    [game(1, { owned: false }), game(9, { owned: false })],
    DEFAULT_FILTERS,
  );
  assert.deepEqual(
    result.filter((g) => g.owned).map((g) => g.appId),
    [1, 5],
  );
  assert.deepEqual(
    result.filter((g) => !g.owned).map((g) => g.appId),
    [9],
  );
  const replay = selectCandidates(s, [], { ...DEFAULT_FILTERS, replay: true });
  assert.ok(replay.some((g) => g.appId === 2));
  assert.ok(replay.some((g) => g.appId === 4));
  assert.ok(!replay.some((g) => g.appId === 3));
  assert.equal(s.preferences['2'].status, 'completed');
});
void test('today uses session minutes, next uses known story hours and metadata filters are strict', () => {
  assert.equal(
    eligible(game(1, { durationHours: 100 }), undefined, {
      ...DEFAULT_FILTERS,
      minutes: 30,
    }),
    true,
  );
  assert.equal(
    eligible(game(1, { durationHours: 100 }), undefined, {
      ...DEFAULT_FILTERS,
      mode: 'next',
      hours: 10,
    }),
    false,
  );
  assert.equal(
    eligible(game(1, { durationHours: null }), undefined, {
      ...DEFAULT_FILTERS,
      mode: 'next',
      hours: 10,
    }),
    false,
  );
  assert.equal(
    eligible(game(1, { gameModes: [] }), undefined, {
      ...DEFAULT_FILTERS,
      gameMode: 'coop',
    }),
    false,
  );
  assert.equal(
    eligible(game(1, { genres: undefined }), undefined, {
      ...DEFAULT_FILTERS,
      genre: 'RPG',
    }),
    false,
  );
  assert.equal(
    eligible(game(1, { isGame: false }), undefined, DEFAULT_FILTERS),
    false,
  );
});
void test('Codex output rejects invented IDs, duplicates, wrong ownership and missing reasons', () => {
  const candidates = [game(1), game(9, { owned: false })];
  const valid = {
    message: 'Propuestas',
    owned: [pick(1)],
    discoveries: [pick(9)],
  };
  assert.equal(validatePicks(valid, candidates).owned[0].game.name, 'Juego 1');
  for (const wrong of [
    { ...valid, owned: [pick(777)] },
    { ...valid, owned: [pick(9)] },
    { ...valid, owned: [pick(1), pick(1)] },
    { ...valid, owned: [{ ...pick(1), reason: '' }] },
  ])
    assert.throws(() => validatePicks(wrong, candidates));
  assert.equal(
    validatePicks(
      { message: 'Sin coincidencias', owned: [], discoveries: [] },
      [],
    ).owned.length,
    0,
  );
});
void test('conversation corrections and selected filters reach the next prompt', () => {
  const s = state();
  s.conversation.push({
    text: 'Menos difícil',
    filters: DEFAULT_FILTERS,
    result: {
      message: 'Buscaremos algo tranquilo.',
      owned: [],
      discoveries: [],
      warnings: [],
      at: 1,
    },
  });
  const prompt = buildPrompt(
    s,
    [game(1)],
    { ...DEFAULT_FILTERS, gameMode: 'single' },
    'Ahora de otro género',
  );
  assert.ok(prompt.includes('Menos difícil'));
  assert.ok(prompt.includes('Ahora de otro género'));
  assert.ok(prompt.includes('"gameMode":"single"'));
  assert.ok(!prompt.includes('test-key'));
});
void test('localhost endpoint rejects cross-origin, DNS rebinding, form posts and oversized bodies', async () => {
  const request = (url: string, headers: Record<string, string>) =>
    new Request(url, { method: 'POST', headers, body: '{}' });
  assert.doesNotThrow(() =>
    verifyRequest(
      request('http://127.0.0.1:3000/api/state', {
        origin: 'http://127.0.0.1:3000',
        'content-type': 'application/json',
      }),
    ),
  );
  assert.throws(() =>
    verifyRequest(
      request('http://evil.test:3000/api/state', {
        'content-type': 'application/json',
      }),
    ),
  );
  assert.throws(() =>
    verifyRequest(
      request('http://localhost:3000/api/state', {
        origin: 'http://evil.test',
        'content-type': 'application/json',
      }),
    ),
  );
  assert.throws(() =>
    verifyRequest(
      request('http://localhost:3000/api/state', {
        'content-type': 'text/plain',
      }),
    ),
  );
  const response = await handle(
    new Request('http://localhost:3000/api/steam/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profileUrl: 'x'.repeat(17000) }),
    }),
  );
  assert.equal(response.status, 413);
});
void test('atomic state survives restart and failures without losing preferences', async () => {
  const tempRoot = resolve(tmpdir());
  const dir = await mkdtemp(join(tempRoot, 'nextplay-test-'));
  const previous = process.env.NEXTPLAY_DATA_DIR;
  process.env.NEXTPLAY_DATA_DIR = dir;
  try {
    const s = state();
    await saveState(s);
    const first = await readState();
    first.preferences['1'].status = 'completed';
    await saveState(first);
    const restarted = await readState();
    assert.equal(restarted.preferences['1'].favorite, true);
    assert.equal(restarted.preferences['1'].status, 'completed');
    const path = join(dir, 'state.json');
    const before = await readFile(path, 'utf8');
    await assert.rejects(
      exclusive(async () => {
        await exclusive(async () => {});
      }),
      /operación en curso/,
    );
    assert.equal(await readFile(path, 'utf8'), before);
    assert.equal(
      (await readdir(dir)).filter((f) => f.endsWith('.tmp')).length,
      0,
    );
    await writeFile(path, 'corrupted');
    await assert.rejects(readState(), /conservado/);
    assert.equal(await readFile(path, 'utf8'), 'corrupted');
    await atomicJson(path, s);
    assert.equal((await readState()).games.length, 5);
  } finally {
    if (previous === undefined) delete process.env.NEXTPLAY_DATA_DIR;
    else process.env.NEXTPLAY_DATA_DIR = previous;
    if (dir.startsWith(join(tempRoot, 'nextplay-test-')))
      await rm(dir, { recursive: true, force: true });
  }
});

void test('manual review refresh preserves the last valid data when Steam fails', async () => {
  const at = Date.now() - 1000;
  const cache = {
    metadata: {},
    reviews: { '1': { positive: 90, total: 100, at } },
    reviewsRefreshAfter: 0,
  };
  assert.equal((await review(game(1), cache)).reviews?.at, at);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('Unavailable', { status: 503 });
  cache.reviewsRefreshAfter = Date.now();
  try {
    await assert.rejects(review(game(1), cache), /disponible/);
    assert.equal(cache.reviews['1'].at, at);
    assert.equal(cache.reviews['1'].positive, 90);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
