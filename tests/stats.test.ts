import assert from 'node:assert/strict';
import test from 'node:test';
import type { Game, Preference } from '../lib/model.ts';
import {
    libraryStats,
    STATS_PERIODS,
    statsPeriodStart,
    type StatsPeriod,
} from '../lib/stats.ts';

const game = (appId: number, changes: Partial<Game> = {}): Game => ({
    appId,
    name: `Juego ${appId}`,
    owned: true,
    playtimeMinutes: null,
    recentMinutes: null,
    ...changes,
});

void test('stats periods include boundaries and ongoing playthroughs, excluding undated and future activity', () => {
    const now = new Date(2026, 9, 6, 12).getTime();
    for (const period of Object.keys(STATS_PERIODS) as StatsPeriod[]) {
        if (period === 'all') continue;
        const from = statsPeriodStart(period, now);
        const state = {
            games: [1, 2, 3, 4, 5, 6].map((id) =>
                game(id, {
                    playtimeMinutes: 60,
                    genres: [{ id: 1, name: 'Rol' }],
                    steamTags: [{ id: 1, name: 'Rol' }],
                }),
            ),
            preferences: {
                1: { favorite: false, status: 'completed' as const },
            },
            playHistory: [
                {
                    appId: 1,
                    name: 'Boundary',
                    kind: 'completed' as const,
                    at: from,
                },
                {
                    appId: 2,
                    name: 'Old',
                    kind: 'completed' as const,
                    at: from - 1,
                },
                {
                    appId: 3,
                    name: 'Ongoing',
                    kind: 'started' as const,
                    at: from - 1000,
                },
                {
                    appId: 4,
                    name: 'Future',
                    kind: 'started' as const,
                    at: now + 1,
                },
                {
                    appId: 6,
                    name: 'Ended',
                    kind: 'started' as const,
                    at: from - 2000,
                },
                {
                    appId: 6,
                    name: 'Ended',
                    kind: 'paused' as const,
                    at: from - 1,
                },
            ],
        };
        const before = structuredClone(state);
        const stats = libraryStats(state, 'es', period, now);
        assert.equal(stats.totalGames, 2, period);
        assert.equal(stats.totalMinutes, 120, period);
        assert.deepEqual(
            stats.topGames.map(({ appId }) => appId),
            [1, 3],
        );
        assert.equal(stats.topGenres[0].count, 2);
        assert.equal(stats.topTagsByHours[0].minutes, 120);
        assert.equal(
            stats.statuses.find(({ status }) => status === 'completed')?.count,
            1,
        );
        assert.deepEqual(state, before);
        assert.equal(libraryStats(state, 'es', 'all', now).totalGames, 6);
    }
    assert.equal(
        libraryStats({ games: [game(1)], preferences: {} }, 'es', 'week', now)
            .totalGames,
        0,
    );
});

void test('stats periods subtract calendar months and years with month-end clamping', () => {
    const now = new Date(2026, 9, 6, 12).getTime();
    for (const [period, expected] of [
        ['week', new Date(2026, 8, 29, 12)],
        ['month', new Date(2026, 8, 6, 12)],
        ['3months', new Date(2026, 6, 6, 12)],
        ['6months', new Date(2026, 3, 6, 12)],
        ['year', new Date(2025, 9, 6, 12)],
        ['3years', new Date(2023, 9, 6, 12)],
    ] as const)
        assert.equal(statsPeriodStart(period, now), expected.getTime());
    assert.equal(
        statsPeriodStart('month', new Date(2026, 2, 31, 12).getTime()),
        new Date(2026, 1, 28, 12).getTime(),
    );
    assert.equal(
        statsPeriodStart('year', new Date(2024, 1, 29, 12).getTime()),
        new Date(2023, 1, 28, 12).getTime(),
    );
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
