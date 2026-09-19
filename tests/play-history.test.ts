import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_STATE } from '../lib/model.ts';
import {
    eventsInYear,
    playEventLabel,
    playEventPhase,
    recordPreference,
    withoutSameDayRoundTrips,
} from '../lib/play-history.ts';
import { openDatabase, loadState, storeState } from '../server/database.ts';
import {
    gameColor,
    groupPlayPeriods,
    playPeriods,
    periodSpan,
} from '../lib/play-history.ts';
import type { PlayEvent } from '../lib/model.ts';

test('colored play periods pair each game independently and clip calendar ranges inclusively', () => {
    const at = (day: number, month = 8, year = 2026) =>
        new Date(year, month, day, 12).getTime();
    const event = (
        appId: number,
        kind: PlayEvent['kind'],
        day: number,
    ): PlayEvent => ({ appId, name: `Juego ${appId}`, kind, at: at(day) });
    const events = [
        event(1, 'started', 1),
        event(2, 'started', 6),
        event(1, 'completed', 5),
        event(2, 'paused', 12),
        event(2, 'playing', 14),
        event(3, 'completed', 15),
    ];
    const original = structuredClone(events);
    const periods = playPeriods(events);
    const groups = groupPlayPeriods(periods);
    assert.deepEqual(events, original);
    assert.equal(periods.length, 3); // No invented start for game 3.
    assert.deepEqual(
        groups.map((group) => group.map((period) => period.start.appId)),
        [[1], [2, 2]],
    );
    const from = new Date(2026, 8, 1),
        to = new Date(2026, 8, 30);
    assert.deepEqual(periodSpan(periods[0], from, to, at(20)), {
        start: 0,
        end: 4,
    });
    assert.deepEqual(periodSpan(periods[1], from, to, at(20)), {
        start: 5,
        end: 11,
    });
    assert.deepEqual(periodSpan(periods[2], from, to, at(20)), {
        start: 13,
        end: 19,
    });
    assert.deepEqual(
        periodSpan(
            periods[1],
            new Date(2026, 8, 7),
            new Date(2026, 8, 13),
            at(20),
        ),
        { start: 0, end: 5 },
    );
    assert.equal(
        periodSpan(
            periods[0],
            new Date(2026, 9, 1),
            new Date(2026, 9, 31),
            at(20),
        ),
        null,
    );
    const crossYear = {
        start: { ...events[0], at: at(31, 11, 2025) },
        end: { ...events[2], at: at(2, 0) },
    };
    assert.deepEqual(
        periodSpan(
            crossYear,
            new Date(2026, 0, 1),
            new Date(2026, 0, 31),
            at(20),
        ),
        { start: 0, end: 1 },
    );
    const leap = {
        start: { ...events[0], at: at(28, 1, 2024) },
        end: { ...events[2], at: at(1, 2, 2024) },
    };
    assert.deepEqual(
        periodSpan(leap, new Date(2024, 1, 1), new Date(2024, 1, 29), at(20)),
        { start: 27, end: 28 },
    );
    const sameDay = playPeriods([
        event(1, 'started', 1),
        event(1, 'abandoned', 1),
    ])[0];
    assert.deepEqual(periodSpan(sameDay, from, to, at(20)), {
        start: 0,
        end: 0,
    });
    assert.equal(
        playPeriods([event(1, 'started', 1), event(1, 'pending', 2)])[0].end
            ?.kind,
        'pending',
    );
    assert.equal(gameColor(1), gameColor(periods[0].start.appId));
    assert.notEqual(gameColor(1), gameColor(2));
});

test('play history records transitions, survives storage and groups by local year', () => {
    const state = structuredClone(EMPTY_STATE);
    const game = {
        appId: 1,
        name: 'Juego de prueba',
        cover: '/test-cover.jpg',
    };
    const start = new Date(2025, 11, 31, 23, 59).getTime();
    const pause = new Date(2026, 0, 1, 0, 1).getTime();
    const resume = new Date(2026, 0, 2, 0, 1).getTime();
    const end = new Date(2026, 0, 3, 0, 1).getTime();
    recordPreference(
        state,
        game,
        { status: 'playing', favorite: false },
        start,
    );
    recordPreference(
        state,
        game,
        { status: 'playing', favorite: true },
        start + 1,
    );
    recordPreference(state, game, { status: 'paused', favorite: true }, pause);
    recordPreference(
        state,
        game,
        { status: 'playing', favorite: true },
        resume,
    );
    recordPreference(state, game, { status: 'completed', favorite: true }, end);
    recordPreference(
        state,
        game,
        { status: 'completed', favorite: true, opinion: 'loved' },
        end + 1,
    );
    assert.deepEqual(
        state.playHistory?.map((event) => event.kind),
        ['started', 'paused', 'playing', 'completed'],
    );
    assert.equal(state.playHistory?.[0].cover, game.cover);
    assert.deepEqual(state.playHistory?.map(playEventLabel), [
        'Empezado',
        'En pausa',
        'Reanudado',
        'Terminado',
    ]);
    assert.deepEqual(
        state.playHistory?.map((event) => event.from),
        ['pending', 'playing', 'paused', 'playing'],
    );
    assert.equal(eventsInYear(state.playHistory!, 2025)[0].at, start);
    assert.equal(eventsInYear(state.playHistory!, 2026)[0].at, end);
    recordPreference(
        state,
        game,
        { status: 'pending', favorite: true },
        end + 2,
    );
    recordPreference(
        state,
        game,
        { status: 'playing', favorite: true },
        end + 24 * 60 * 60 * 1000,
    );
    assert.equal(state.playHistory?.length, 6);
    const direct = { appId: 2, name: 'Final sin inicio conocido' };
    recordPreference(
        state,
        direct,
        { status: 'completed', favorite: false },
        end + 4,
    );
    assert.equal(state.playHistory?.length, 7);
    recordPreference(
        state,
        game,
        { status: 'abandoned', favorite: true },
        end + 5,
    );
    recordPreference(
        state,
        game,
        { status: 'ignored', favorite: true },
        end + 6,
    );
    recordPreference(
        state,
        game,
        { status: 'ignored', favorite: false },
        end + 7,
    );
    assert.deepEqual(state.playHistory?.slice(-2).map(playEventLabel), [
        'Abandonado',
        'No me interesa',
    ]);
    assert.equal(playEventLabel(state.playHistory![4]), 'Pendiente');
    assert.equal(
        playEventLabel({
            appId: 1,
            name: 'Legacy',
            kind: 'started',
            at: start,
        }),
        'Empezado',
    );
    assert.deepEqual(state.playHistory?.map(playEventPhase), [
        'start',
        'end',
        'start',
        'end',
        'neutral',
        'start',
        'end',
        'end',
        'neutral',
    ]);
    const db = openDatabase(':memory:');
    try {
        storeState(db, state);
        assert.deepEqual(loadState(db)?.playHistory, state.playHistory);
        assert.deepEqual(
            eventsInYear(state.playHistory!, 2026).map((event) => event.at),
            [
                end + 24 * 60 * 60 * 1000,
                end + 6,
                end + 5,
                end + 4,
                end + 2,
                end,
                resume,
                pause,
            ],
        );
        storeState(db, structuredClone(EMPTY_STATE));
        assert.equal(loadState(db)?.playHistory, undefined);
    } finally {
        db.close();
    }
});

test('same-day round trips do not become saved or visible play spans', () => {
    const game = { appId: 1, name: 'Juego de prueba' };
    const day = (day: number) => new Date(2026, 8, day, 12).getTime();
    const legacy = [
        {
            ...game,
            kind: 'started' as const,
            from: 'pending' as const,
            at: day(18),
        },
        {
            ...game,
            kind: 'paused' as const,
            from: 'playing' as const,
            at: day(19),
        },
        {
            ...game,
            kind: 'playing' as const,
            from: 'paused' as const,
            at: day(19) + 1,
        },
    ];
    assert.deepEqual(withoutSameDayRoundTrips(legacy), [legacy[0]]);

    const state = structuredClone(EMPTY_STATE);
    recordPreference(
        state,
        game,
        { status: 'playing', favorite: false },
        day(18),
    );
    recordPreference(
        state,
        game,
        { status: 'paused', favorite: false },
        day(19),
    );
    recordPreference(
        state,
        game,
        { status: 'playing', favorite: false },
        day(19) + 1,
    );
    assert.equal(state.preferences[game.appId].status, 'playing');
    assert.deepEqual(state.playHistory, [legacy[0]]);
});
