import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DEFAULT_FILTERS, EMPTY_STATE } from '../lib/model.ts';
import type { Game, Opinion, State } from '../lib/model.ts';
import {
  affinityScore,
  buildTasteProfile,
  tasteEvidence,
} from '../lib/tastes.ts';
import { parsePreference } from '../server/selection.ts';
import { handle } from '../server/api.ts';
import { buildPrompt } from '../server/codex.ts';
import { readState, saveState } from '../server/store.ts';

void test('explicit opinions persist, override hours, reach both engines and can be removed safely', async () => {
  const game: Game = {
    appId: 1,
    name: 'Factory',
    owned: true,
    playtimeMinutes: 0,
    recentMinutes: 0,
    steamTags: [{ id: 255534, name: 'Automatización' }],
  };
  const state: State = { ...structuredClone(EMPTY_STATE), games: [game] };
  const weight = () =>
    buildTasteProfile(state).find((a) => a.id === 'automation')!.inferred;
  state.preferences['1'] = { favorite: false, status: 'completed' };
  assert.equal(weight(), 0, 'completion alone does not imply enjoyment');
  state.preferences['1'].status = 'abandoned';
  assert.equal(weight(), 0, 'abandoning alone does not imply dislike');
  state.preferences['1'].opinion = 'liked';
  const liked = weight();
  assert(liked > 0, 'abandoned but enjoyed is positive evidence');
  state.preferences['1'].opinion = 'loved';
  assert(weight() > liked);
  state.preferences['1'] = {
    favorite: true,
    status: 'completed',
    opinion: 'disliked',
    opinionReason: 'Demasiada repetición.',
  };
  game.playtimeMinutes = 60000;
  assert(weight() < 0, 'explicit dislike overrides long playtime and favorite');
  assert(
    affinityScore(game, buildTasteProfile(state)) < 0,
    'local algorithm receives negative affinity',
  );
  state.games.push({ ...game, appId: 2, name: 'Factory: Complete Edition' });
  assert.equal(tasteEvidence(state).length, 1);
  assert(
    weight() < 0,
    'an unrated duplicate edition cannot erase an explicit dislike',
  );
  for (const bad of [null, 'unknown', 1, {}, []])
    assert.throws(() =>
      parsePreference({ favorite: false, status: 'completed', opinion: bad }),
    );
  assert.throws(() =>
    parsePreference({
      favorite: false,
      status: 'completed',
      opinionReason: 'Orphan reason',
    }),
  );
  assert.throws(() =>
    parsePreference({
      favorite: false,
      status: 'completed',
      opinion: 'liked',
      opinionReason: 'x'.repeat(501),
    }),
  );

  const root = resolve(tmpdir());
  const dir = await mkdtemp(join(root, 'nextplay-opinions-'));
  const oldDir = process.env.NEXTPLAY_DATA_DIR,
    oldBin = process.env.NEXTPLAY_CODEX_BIN;
  process.env.NEXTPLAY_DATA_DIR = dir;
  process.env.NEXTPLAY_CODEX_BIN = join(dir, 'missing.exe');
  try {
    await saveState(state);
    const update = (opinion?: Opinion, opinionReason?: unknown) =>
      handle(
        new Request('http://localhost:3000/api/state', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Origin: 'http://localhost:3000',
          },
          body: JSON.stringify({
            appId: 1,
            preference: {
              favorite: false,
              status: 'abandoned',
              opinion,
              opinionReason,
            },
          }),
        }),
      );
    assert.equal(
      (await update('loved', '  Buenas ideas, pero demasiado largo.  ')).status,
      200,
    );
    const saved = await readState();
    assert.equal(
      saved.preferences['1'].opinionReason,
      'Buenas ideas, pero demasiado largo.',
    );
    assert.equal(saved.preferences['1'].opinion, 'loved');
    const payload = JSON.parse(
      buildPrompt(saved, saved.games, DEFAULT_FILTERS, '').split(
        'DATOS_JSON:\n',
      )[1],
    );
    assert.equal(payload.preferences[0].opinion, 'loved');
    assert.equal(
      payload.preferences[0].opinionReason,
      saved.preferences['1'].opinionReason,
    );
    assert(
      payload.tasteProfile.find((a: { id: string }) => a.id === 'automation')
        .inferred > 0,
    );
    assert.equal((await update('liked', 42)).status, 400);
    assert.deepEqual(
      (await readState()).preferences,
      saved.preferences,
      'invalid updates preserve saved opinion',
    );
    assert.equal((await update()).status, 200);
    assert.deepEqual((await readState()).preferences['1'], {
      favorite: false,
      status: 'abandoned',
    });
  } finally {
    if (oldDir === undefined) delete process.env.NEXTPLAY_DATA_DIR;
    else process.env.NEXTPLAY_DATA_DIR = oldDir;
    if (oldBin === undefined) delete process.env.NEXTPLAY_CODEX_BIN;
    else process.env.NEXTPLAY_CODEX_BIN = oldBin;
    if (dir.startsWith(join(root, 'nextplay-opinions-')))
      await rm(dir, { recursive: true, force: true });
  }
});
