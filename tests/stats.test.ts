import assert from 'node:assert/strict';
import test from 'node:test';
import type { Game, Preference } from '../lib/model.ts';
import { libraryStats } from '../lib/stats.ts';

const game = (appId: number, changes: Partial<Game> = {}): Game => ({
    appId,
    name: `Juego ${appId}`,
    owned: true,
    playtimeMinutes: null,
    recentMinutes: null,
    ...changes,
});

void test('library stats use recorded profile time and keep unknown, zero and shared games distinct', () => {
    const preferences: Record<string, Preference> = {
        1: { favorite: false, status: 'playing' },
        '-3': { favorite: false, status: 'completed' },
    };
    const stats = libraryStats({
        games: [
            game(1, {
                playtimeMinutes: 120,
                genres: [
                    { id: 1, name: 'Acción' },
                    { id: 2, name: 'Rol' },
                ],
                steamTags: [
                    { id: 10, name: 'Acción' },
                    { id: 20, name: 'Cooperativo' },
                    { id: 20, name: 'Cooperativo' },
                    { id: 40, name: 'Puzles' },
                    { id: 50, name: 'Oculta' },
                ],
            }),
            game(2, {
                owned: false,
                shared: true,
                playtimeMinutes: 0,
                genres: [{ id: 1, name: 'Acción' }],
                steamTags: [{ id: 10, name: 'Acción' }],
            }),
            game(-3, { genres: [{ id: 3, name: 'Aventura' }] }),
            game(4, {
                playtimeMinutes: 1500,
                genres: [
                    { id: 1, name: 'Acción' },
                    { id: 1, name: 'Acción' },
                    { id: 2, name: 'Rol' },
                ],
                steamTags: [
                    { id: 10, name: 'Acción' },
                    { id: 30, name: 'Rol' },
                    { id: 10, name: 'Acción' },
                    { id: 20, name: 'Cooperativo' },
                    { id: 50, name: 'Oculta' },
                ],
            }),
            game(5, {
                owned: false,
                playtimeMinutes: 9999,
                genres: [{ id: 4, name: 'Otro' }],
            }),
        ],
        preferences,
    });

    assert.equal(stats.totalGames, 4);
    assert.equal(stats.totalMinutes, 1620);
    assert.equal(stats.knownTimeCount, 3);
    assert.equal(stats.playedCount, 2);
    assert.equal(stats.zeroTimeCount, 1);
    assert.equal(stats.unknownTimeCount, 1);
    assert.deepEqual(
        stats.playtimeBands.map((band) => band.count),
        [0, 1, 0, 1, 0, 0],
    );
    assert.deepEqual(
        stats.topGenres.map(({ name, count }) => [name, count]),
        [
            ['Acción', 3],
            ['Rol', 2],
            ['Aventura', 1],
        ],
    );
    assert.deepEqual(
        stats.topGenresByHours.map(({ name, minutes }) => [name, minutes]),
        [
            ['Acción', 1620],
            ['Rol', 1620],
        ],
    );
    assert.deepEqual(
        stats.topGenresByHours[0].games.map(({ appId }) => appId),
        [4, 1],
    );
    assert.equal(stats.tagCoverage, 3);
    assert.equal(stats.tagCount, 4);
    assert.deepEqual(
        stats.topTags.map(({ name, count }) => [name, count]),
        [
            ['Acción', 3],
            ['Cooperativo', 2],
            ['Puzles', 1],
            ['Rol', 1],
        ],
    );
    assert.deepEqual(
        stats.topTagsByHours.map(({ name, minutes }) => [name, minutes]),
        [
            ['Acción', 1620],
            ['Cooperativo', 1620],
            ['Rol', 1500],
            ['Puzles', 120],
        ],
    );
    assert.deepEqual(
        stats.topTagsByHours[0].games.map(({ appId }) => appId),
        [4, 1],
    );
    assert.equal(
        stats.statuses.find(({ status }) => status === 'pending')?.count,
        2,
    );
    assert.equal(
        stats.statuses.find(({ status }) => status === 'completed')?.count,
        1,
    );
    assert.deepEqual(
        stats.topGames.map((item) => item.appId),
        [4, 1],
    );

    const shared = libraryStats({
        games: [
            game(6, {
                owned: false,
                shared: true,
                playtimeMinutes: 90,
                genres: [{ id: 2, name: 'Rol' }],
                steamTags: [{ id: 10, name: 'Acción' }],
            }),
        ],
        preferences: {},
    });
    assert.equal(shared.totalMinutes, 90);
    assert.equal(shared.topGenresByHours[0]?.minutes, 90);
    assert.equal(shared.topTagsByHours[0]?.minutes, 90);
    assert.deepEqual(
        shared.topTagsByHours[0]?.games.map(({ appId }) => appId),
        [6],
    );
});
