import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  DEFAULT_FILTERS,
  EMPTY_STATE,
  sortLibraryGames,
} from '../lib/model.ts';
import type { Game } from '../lib/model.ts';
import { openDatabase, replaceGames } from '../server/database.ts';
import { catalogGame, queryGames } from '../server/library.ts';
import { buildPrompt, runProcess } from '../server/codex.ts';
import { selectCandidates, validatePicks } from '../server/selection.ts';
import { readState, saveState } from '../server/store.ts';

void test('SQLite and the real MCP transport search and paginate the full personal/family catalog', async () => {
  const root = resolve(tmpdir());
  const dir = await mkdtemp(join(root, 'nextplay-library-'));
  const previous = process.env.NEXTPLAY_DATA_DIR;
  process.env.NEXTPLAY_DATA_DIR = dir;
  const client = new Client({ name: 'nextplay-test', version: '1.0.0' });
  const state = {
    ...structuredClone(EMPTY_STATE),
    games: Array.from(
      { length: 145 },
      (_, i): Game => ({
        appId: i + 1,
        name: `Juego ${String(i + 1).padStart(3, '0')}`,
        owned: i < 80,
        shared: i >= 80,
        ownerSteamIds: ['76561198000000002'],
        playtimeMinutes: i === 144 ? null : 0,
        recentMinutes: 0,
        genres: [{ id: 12, name: 'RPG' }],
        ...(i === 0
          ? {
              steamTags: [{ id: 19, name: 'Acción', englishName: 'Action' }],
              steamTagsCheckedAt: 123,
            }
          : i >= 80
            ? {
                steamTags: [
                  { id: 3834, name: 'Exploración', englishName: 'Exploration' },
                ],
              }
            : {}),
        gameModes: [1],
        durationHours: 10,
        summary: i === 144 ? 'Puzles de constelaciones' : 'Explora con calma',
      }),
    ),
    preferences: { '100': { status: 'ignored' as const, favorite: false } },
  };
  try {
    // Invalid legacy input must never silently initialize an empty library.
    await writeFile(join(dir, 'state.json'), 'broken');
    await assert.rejects(readState(), /conservado/);
    assert.equal(await readFile(join(dir, 'state.json'), 'utf8'), 'broken');
    await writeFile(join(dir, 'state.json'), JSON.stringify(state));
    assert.deepEqual((await readState()).games, state.games);
    await saveState(state);
    assert.deepEqual(await readState(), state);
    const discoveries = Array.from({ length: 25 }, (_, i) => ({
      ...state.games[0],
      appId: 200 + i,
      owned: false,
      shared: false,
      steamTags: undefined,
      steamTagsCheckedAt: undefined,
    }));
    const candidates = selectCandidates(state, discoveries, DEFAULT_FILTERS);
    assert.equal(candidates.length, 169);
    const prompt = JSON.parse(
      buildPrompt(state, candidates, DEFAULT_FILTERS, '').split(
        'DATOS_JSON:\n',
      )[1],
    );
    assert.equal(prompt.catalog.total, 169);
    assert.equal(prompt.candidates.length, 8);
    const path = join(dir, 'catalog.sqlite');
    const writer = openDatabase(path);
    replaceGames(
      writer,
      candidates.map((game) => catalogGame(game, state)),
    );
    assert.deepEqual(catalogGame(state.games[0], state).steamTags, [
      { id: 19, name: 'Acción', englishName: 'Action' },
    ]);
    assert.equal(catalogGame(state.games[0], state).steamTagsCheckedAt, 123);
    writer.close();
    const db = openDatabase(path, true);
    try {
      assert.throws(() => db.exec('DELETE FROM games'), /readonly/);
      const ids: number[] = [];
      let offset: number | null = 0;
      do {
        const page = queryGames(db, { offset, limit: 17, source: 'library' });
        assert.equal(page.total, 144);
        ids.push(...page.games.map((game: Game) => game.appId));
        offset = page.nextOffset;
      } while (offset !== null);
      assert.equal(new Set(ids).size, 144);
      assert.ok(ids.includes(145));
      assert.ok(!ids.includes(100));
      assert.equal(queryGames(db, { source: 'discoveries' }).total, 25);
      assert.equal(
        queryGames(db, { query: 'CONSTELACIÓN' }).games[0].appId,
        145,
      );
      assert.equal(queryGames(db, { query: 'acción' }).games[0].appId, 1);
      assert.equal(queryGames(db, { query: 'ACTION' }).games[0].appId, 1);
      assert.equal(queryGames(db, { tag: 'acción' }).total, 1);
      assert.equal(queryGames(db, { tag: 'action' }).total, 1);
      assert.equal(queryGames(db, { tag: 'act' }).total, 0);
      assert.equal(queryGames(db, { tagIds: [19, 999] }).total, 1);
      assert.equal(
        queryGames(db, { tagIds: [19], source: 'discoveries' }).total,
        0,
      );
      const tagged = queryGames(db, {
        tag: 'exploracion',
        source: 'shared',
        offset: 60,
        limit: 3,
      });
      assert.equal(tagged.total, 64); // Ignored game 100 remains excluded.
      assert.equal(tagged.games.length, 3);
      assert.equal(tagged.nextOffset, 63);
      assert.equal(
        queryGames(db, { tagIds: [3834], offset: 63, limit: 3 }).nextOffset,
        null,
      );
      assert.equal(queryGames(db, { tag: "' OR 1=1 --" }).total, 0);
      assert.equal(queryGames(db, { query: "' OR 1=1 --" }).total, 0);
      assert.equal(queryGames(db, { offset: 900 }).nextOffset, null);
      assert.equal(queryGames(db, { gameMode: 'coop' }).total, 0);
      assert.equal(queryGames(db, { maxHours: 1 }).total, 0);
      assert.equal(queryGames(db, { appIds: [145], unplayed: true }).total, 0);
      assert.equal(
        queryGames(db, { genre: 'rpg', owner: 'Familiar', source: 'shared' })
          .total,
        64,
      );
      for (const input of [
        { limit: 51 },
        { offset: -1 },
        { offset: 0.5 },
        { sql: 'DELETE FROM games' },
      ])
        assert.throws(() => queryGames(db, input));
    } finally {
      db.close();
    }
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [resolve('scripts/library-mcp.ts'), path],
        env: { NODE_ENV: 'test' },
        stderr: 'pipe',
      }),
    );
    assert.deepEqual(
      (await client.listTools()).tools.map((tool) => tool.name),
      ['query_games'],
    );
    const result = await client.callTool({
      name: 'query_games',
      arguments: { query: 'constelaciones', source: 'shared' },
    });
    const page = JSON.parse((result.content as { text: string }[])[0].text);
    assert.equal(page.total, 1);
    assert.equal(page.games[0].appId, 145);
    assert.ok(!JSON.stringify(page).includes('76561198000000002'));
    const pick = {
      appId: 145,
      reason: 'Puzles',
      whyNow: 'Biblioteca familiar',
      caveat: 'Disponibilidad sin comprobar',
    };
    assert.equal(
      validatePicks(
        { message: 'Propuesta', owned: [pick], discoveries: [] },
        candidates,
      ).owned[0].appId,
      145,
    );
    assert.throws(() =>
      validatePicks(
        { message: 'Propuesta', owned: [], discoveries: [pick] },
        candidates,
      ),
    );
    const invalid = await client.callTool({
      name: 'query_games',
      arguments: { offset: -1 },
    });
    assert.equal(invalid.isError, true);
  } finally {
    await client.close();
    if (previous === undefined) delete process.env.NEXTPLAY_DATA_DIR;
    else process.env.NEXTPLAY_DATA_DIR = previous;
    if (dir.startsWith(join(root, 'nextplay-library-')))
      await rm(dir, { recursive: true, force: true });
  }
});

void test('Codex progress processes pages incrementally without a cumulative output cap', async (t) => {
  const previous = process.env.NEXTPLAY_CODEX_BIN;
  process.env.NEXTPLAY_CODEX_BIN = process.execPath;
  const messages: unknown[][] = [];
  t.mock.method(console, 'info', (...args: unknown[]) => messages.push(args));
  try {
    const result = await runProcess(
      [
        '-e',
        `
      for (let i = 0; i < 70; i++) console.log(JSON.stringify({
        type: 'item.completed', item: { type: 'mcp_tool_call', tool: 'query_games',
          status: 'completed', arguments: { offset: i }, result: 'x'.repeat(20000) }
      }));
    `,
        '--',
        '--json',
      ],
      '',
      10000,
    );
    assert.equal(result, '');
    assert.equal(
      messages.filter(([message]) =>
        String(message).includes('codex:catalog:query'),
      ).length,
      70,
    );
  } finally {
    if (previous === undefined) delete process.env.NEXTPLAY_CODEX_BIN;
    else process.env.NEXTPLAY_CODEX_BIN = previous;
  }
});

void test('library sorting orders known values and keeps missing metadata last', () => {
  const game = (appId: number, more: Partial<Game> = {}): Game => ({
    appId,
    name: `Juego ${appId}`,
    owned: true,
    playtimeMinutes: 0,
    recentMinutes: 0,
    ...more,
  });
  const games = [
    game(1, {
      name: 'Beta',
      releasedAt: Date.UTC(2020, 0, 1),
      playtimeMinutes: 100,
      durationHours: 20,
    }),
    game(2, {
      name: 'Alfa',
      releasedAt: Date.UTC(2022, 0, 1),
      playtimeMinutes: 50,
      durationHours: 5,
    }),
    game(3, { name: 'Gamma', playtimeMinutes: null, durationHours: null }),
  ];
  assert.deepEqual(
    sortLibraryGames(games, 'release-newest').map((g) => g.appId),
    [2, 1, 3],
  );
  assert.deepEqual(
    sortLibraryGames(games, 'duration-shortest').map((g) => g.appId),
    [2, 1, 3],
  );
  assert.deepEqual(
    sortLibraryGames(games, 'favorite', {
      '2': { favorite: true, status: 'pending' },
    }).map((g) => g.appId),
    [2, 1, 3],
  );
});
