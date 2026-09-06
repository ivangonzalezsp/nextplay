import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { EMPTY_STATE, DEFAULT_FILTERS } from '../lib/model.ts';
import type { Game, State } from '../lib/model.ts';
import {
  EMPTY_TASTES,
  buildTasteProfile,
  affinityScore,
  hoursWeight,
  tasteEvidence,
  gameAffinities,
} from '../lib/tastes.ts';
import { parseTastes, selectCandidates } from '../server/selection.ts';
import { buildPrompt } from '../server/codex.ts';
import { handle } from '../server/api.ts';
import { readState, saveState } from '../server/store.ts';

const game = (
  id: number,
  hours = 50,
  summary = 'Build a factory and automate production.',
): Game => ({
  appId: id,
  name: 'Game ' + id,
  owned: true,
  playtimeMinutes: hours * 60,
  recentMinutes: 0,
  summary,
});
const state = (games: Game[]): State => ({
  ...structuredClone(EMPTY_STATE),
  games,
});

void test('hours diminish, independent games reinforce affinity, editions and ignored hours do not duplicate it', () => {
  assert(
    hoursWeight(500) - hoursWeight(300) < hoursWeight(50) - hoursWeight(5),
  );
  const s = state([game(1, 500)]);
  const weight = (s: State) =>
    buildTasteProfile(s).find((a) => a.id === 'automation')!.inferred;
  assert(weight(state([game(1), game(2), game(3)])) > weight(s));
  s.games.push({ ...game(2, 500), name: 'Game 1: Complete Edition' });
  assert.equal(tasteEvidence(s).length, 1);
  s.tastes = { ...EMPTY_TASTES, ignoredHours: [1, 2] };
  assert.equal(weight(s), 0);
  s.preferences['1'] = { favorite: true, status: 'pending' };
  assert(
    weight(s) > 0,
    'explicit favorite still counts when hours are excluded',
  );
  s.preferences['1'].status = 'ignored';
  assert.equal(weight(s), 0);
  assert.equal(weight(state([game(4, 0)])), 0);
  assert.equal(weight(state([{ ...game(4), summary: undefined }])), 0);
  assert.equal(
    weight(
      state([
        game(4, 50, 'A sequel to Automata, featuring automatic weapons.'),
      ]),
    ),
    0,
  );
  assert(
    !gameAffinities(
      game(5, 50, 'Combat relies on resource management for ammo.'),
    ).includes('automation'),
  );
  assert(
    gameAffinities(game(6, 50, 'A multiplayer roguelike.')).includes(
      'synergies',
    ),
  );
});
void test('corrections change shortlist, remain soft, and never beat favorites or hard exclusions', () => {
  const s = state(
    Array.from({ length: 42 }, (_, i) =>
      game(i + 1, 0, 'Turn-based strategy and tactical combat.'),
    ),
  );
  const factory = game(100, 0);
  s.games.push(factory);
  s.tastes = {
    ...EMPTY_TASTES,
    overrides: { automation: 'like', tactics: 'dislike' },
  };
  const candidates = selectCandidates(s, [], DEFAULT_FILTERS);
  assert.equal(candidates[0].appId, 100);
  assert(
    candidates.some((g) => g.appId === 1),
    'dislike is not exclusion',
  );
  const profile = buildTasteProfile(s);
  assert(affinityScore(factory, profile) > 0);
  s.tastes.overrides.automation = 'neutral';
  assert.equal(affinityScore(factory, buildTasteProfile(s)), 0);
  s.preferences['1'] = { favorite: true, status: 'pending' };
  assert.equal(selectCandidates(s, [], DEFAULT_FILTERS)[0].appId, 1);
  s.preferences['100'] = { favorite: true, status: 'ignored' };
  assert(
    !selectCandidates(s, [], DEFAULT_FILTERS, 'Game 100').some(
      (g) => g.appId === 100,
    ),
  );
  assert.equal(
    selectCandidates(s, [], { ...DEFAULT_FILTERS, mode: 'next', hours: 1 })
      .length,
    0,
  );
  assert.throws(() =>
    parseTastes({ ...EMPTY_TASTES, overrides: { unknown: 'like' } }, s),
  );
  assert.throws(() =>
    parseTastes({ ...EMPTY_TASTES, ignoredHours: [9999] }, s),
  );
});
void test('API corrections survive reload and new searches, reach Codex, and invalid updates preserve disk', async () => {
  const root = resolve(tmpdir());
  const dir = await mkdtemp(join(root, 'nextplay-tastes-'));
  const oldDir = process.env.NEXTPLAY_DATA_DIR,
    oldBinary = process.env.NEXTPLAY_CODEX_BIN;
  process.env.NEXTPLAY_DATA_DIR = dir;
  process.env.NEXTPLAY_CODEX_BIN = join(dir, 'missing.exe');
  try {
    await saveState(state([game(1), game(2)]));
    const call = (path: string, method: string, body: unknown) =>
      handle(
        new Request('http://localhost:3000/api/' + path, {
          method,
          headers: {
            'Content-Type': 'application/json',
            Origin: 'http://localhost:3000',
          },
          body: JSON.stringify(body),
        }),
      );
    const settings = {
      overrides: { automation: 'like' },
      ignoredHours: [1],
      notes: 'Jugaba con mis amigos; ahora prefiero automatizar.',
    };
    const response = await call('tastes', 'PATCH', settings);
    assert.equal(response.status, 200);
    const saved = await readState();
    assert.deepEqual(saved.tastes, settings);
    const prompt = buildPrompt(
      saved,
      saved.games,
      DEFAULT_FILTERS,
      'Una partida tranquila',
    );
    const data = JSON.parse(prompt.split('DATOS_JSON:\n')[1]);
    assert.equal(data.tasteNotes, settings.notes);
    assert.deepEqual(data.ignoredHours, [1]);
    assert.equal(
      data.tasteProfile.find((a: { id: string }) => a.id === 'automation')
        .choice,
      'like',
    );
    assert(
      !data.tasteProfile
        .flatMap((a: { evidence: { appId: number }[] }) => a.evidence)
        .some((e: { appId: number }) => e.appId === 1),
    );
    assert.equal(
      (await call('conversation/reset', 'POST', { filters: DEFAULT_FILTERS }))
        .status,
      200,
    );
    assert.deepEqual((await readState()).tastes, settings);
    const before = await readFile(join(dir, 'state.json'), 'utf8');
    assert.equal(
      (await call('tastes', 'PATCH', { ...settings, notes: 'x'.repeat(2001) }))
        .status,
      400,
    );
    assert.equal(await readFile(join(dir, 'state.json'), 'utf8'), before);
  } finally {
    if (oldDir === undefined) delete process.env.NEXTPLAY_DATA_DIR;
    else process.env.NEXTPLAY_DATA_DIR = oldDir;
    if (oldBinary === undefined) delete process.env.NEXTPLAY_CODEX_BIN;
    else process.env.NEXTPLAY_CODEX_BIN = oldBinary;
    if (dir.startsWith(join(root, 'nextplay-tastes-')))
      await rm(dir, { recursive: true, force: true });
  }
});
