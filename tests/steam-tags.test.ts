import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    backupDatabase,
    loadState,
    openDatabase,
    readSteamTagRecords,
    storeState,
    writeSteamTags,
} from '../server/database.ts';
import { EMPTY_STATE, type Game } from '../lib/model.ts';
import {
    createSteamTagClient,
    createTagDictionaries,
    parseHoverTags,
    retryAfterMilliseconds,
    SteamTagsError,
} from '../server/steam-tags.ts';

void test('parsea todos los app_tag del hover real, entidades y diccionarios por ID', () => {
    const dictionaries = createTagDictionaries(
        [
            { tagid: 1664, name: 'Puzzle' },
            { tagid: 5923, name: 'Dark Humor' },
            { tagid: 19995, name: 'Dark Comedy' },
            { tagid: 10, name: 'Action' },
            { tagid: 11, name: 'Action' },
        ],
        [
            { tagid: 1664, name: 'Puzles' },
            { tagid: 5923, name: 'Humor negro' },
            { tagid: 19995, name: 'Humor negro' },
        ],
    );
    const html = `
    <div id="hover_app_400" class="hover_app">
      <div class="hover_body"><div class="hover_tag_row">
        <div class="app_tag">Puzzle</div><div class="app_tag">Puzzle</div>
        <div class="app_tag">Dark Humor</div><div class="app_tag">Dark Comedy</div>
        <div class="app_tag">Action</div>
        <div class="app_tag">A &amp; B &ndash; &#x27; &#169;</div>
      </div></div>
    </div>`;
    assert.deepEqual(parseHoverTags(html, 400, dictionaries), [
        { id: 1664, name: 'Puzles', englishName: 'Puzzle' },
        { id: 5923, name: 'Humor negro', englishName: 'Dark Humor' },
        { id: 19995, name: 'Humor negro', englishName: 'Dark Comedy' },
        { name: 'Action', englishName: 'Action' },
        { name: "A & B – ' ©", englishName: "A & B – ' ©" },
    ]);
});

void test('respeta Retry-After y falla con 429 persistente sin recortar el backoff', async () => {
    assert.equal(retryAfterMilliseconds('3'), 3000);
    assert.equal(retryAfterMilliseconds('-1'), undefined);
    assert.equal(
        retryAfterMilliseconds(new Date(120_000).toUTCString(), 0),
        120_000,
    );
    const sleeps: number[] = [];
    let calls = 0;
    const client = createSteamTagClient({
        intervalMs: 0,
        maxAttempts: 2,
        sleep: async (milliseconds) => {
            sleeps.push(milliseconds);
        },
        fetcher: async () => {
            calls++;
            return new Response('', {
                status: 429,
                headers: { 'retry-after': '17' },
            });
        },
    });
    await assert.rejects(
        client.fetchGameTags(400),
        (error: unknown) =>
            error instanceof SteamTagsError && error.status === 429,
    );
    assert.equal(calls, 2);
    assert.deepEqual(sleeps, [17_000]);
});

void test('conserva tags al fallar, deja el AppID pendiente y respalda la copia SQLite', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nextplay-steam-tags-'));
    const path = join(directory, 'library.sqlite');
    const backupPath = join(directory, 'backup.sqlite');
    const games: Game[] = [
        {
            appId: 400,
            name: 'Portal',
            owned: true,
            playtimeMinutes: 0,
            recentMinutes: 0,
        },
        {
            appId: 401,
            name: 'Pendiente',
            owned: true,
            playtimeMinutes: 0,
            recentMinutes: 0,
        },
    ];
    const db = openDatabase(path);
    try {
        storeState(db, { ...structuredClone(EMPTY_STATE), games });
        writeSteamTags(db, [
            {
                appId: 400,
                tags: [{ id: 1664, name: 'Puzles', englishName: 'Puzzle' }],
                checkedAt: 123,
                attemptedAt: 123,
                source: 'test',
            },
        ]);
        writeSteamTags(db, [
            {
                appId: 400,
                tags: [],
                checkedAt: null,
                attemptedAt: 456,
                error: 'Steam ha limitado la consulta.',
                source: 'test',
            },
            {
                appId: 401,
                tags: [],
                checkedAt: null,
                attemptedAt: 456,
                error: 'interrumpido',
                source: 'test',
            },
        ]);
        const records = readSteamTagRecords(db);
        assert.deepEqual(records.get(400)?.tags, [
            { id: 1664, name: 'Puzles', englishName: 'Puzzle' },
        ]);
        assert.equal(records.get(400)?.checkedAt, 123);
        assert.equal(records.get(400)?.error, 'Steam ha limitado la consulta.');
        assert.equal(records.get(401)?.checkedAt, null);
        storeState(db, {
            ...structuredClone(EMPTY_STATE),
            games: games.map((game) => ({
                ...game,
                steamTags: undefined,
                steamTagsCheckedAt: undefined,
            })),
        });
        assert.deepEqual(loadState(db)?.games[0].steamTags, [
            { id: 1664, name: 'Puzles', englishName: 'Puzzle' },
        ]);
        assert.deepEqual(
            games
                .map((game) => game.appId)
                .filter((appId) => records.get(appId)?.checkedAt != null),
            [400],
        );

        backupDatabase(db, backupPath);
        const backup = openDatabase(backupPath, true);
        try {
            assert.deepEqual(loadState(backup)?.games[0].steamTags, [
                { id: 1664, name: 'Puzles', englishName: 'Puzzle' },
            ]);
            assert.equal(readSteamTagRecords(backup).get(401)?.checkedAt, null);
        } finally {
            backup.close();
        }
    } finally {
        db.close();
        await rm(directory, { recursive: true, force: true });
    }
});
