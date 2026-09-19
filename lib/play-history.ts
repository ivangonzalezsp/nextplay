import {
    STATUS_LABELS,
    type Game,
    type GameStatus,
    type PlayEvent,
    type Preference,
    type State,
} from './model.ts';

export const playEventPhase = (event: PlayEvent) =>
    (
        ({
            started: 'start',
            playing: 'start',
            paused: 'end',
            completed: 'end',
            abandoned: 'end',
            pending: 'neutral',
            ignored: 'neutral',
        }) as const
    )[event.kind];

// Stable pseudo-random hue: a game keeps its color across views and reloads.
export const gameColor = (appId: number) =>
    `hsl(${(Math.imul(appId, 137) >>> 0) % 360} 65% 55%)`;

export type PlayPeriod = { start: PlayEvent; end?: PlayEvent };
export function playPeriods(events: PlayEvent[]): PlayPeriod[] {
    const periods: PlayPeriod[] = [];
    const active = new Map<number, PlayPeriod>();
    for (const event of [...events].sort((a, b) => a.at - b.at)) {
        const previous = active.get(event.appId);
        if (playEventPhase(event) === 'start') {
            if (!previous) {
                const period = { start: event };
                periods.push(period);
                active.set(event.appId, period);
            }
        } else if (previous) {
            // Any departure from playing stops the line, including a reset to pending.
            previous.end = event;
            active.delete(event.appId);
        }
    }
    return periods;
}

export function groupPlayPeriods(periods: PlayPeriod[]) {
    const groups = new Map<number, PlayPeriod[]>();
    for (const period of periods) {
        const group = groups.get(period.start.appId);
        if (group) group.push(period);
        else groups.set(period.start.appId, [period]);
    }
    return [...groups.values()];
}

const calendarDay = (date: Date) =>
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
export function periodSpan(
    period: PlayPeriod,
    from: Date,
    to: Date,
    now: number,
) {
    const first = calendarDay(from);
    const last = calendarDay(to);
    const start = Math.max(first, calendarDay(new Date(period.start.at)));
    const end = Math.min(last, calendarDay(new Date(period.end?.at ?? now)));
    return start <= end ? { start: start - first, end: end - first } : null;
}

export const dateInputValue = (at: number) => {
    const date = new Date(at);
    return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export function calendarDateAt(value: unknown) {
    const match =
        typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(0);
    date.setHours(12, 0, 0, 0);
    date.setFullYear(year, month - 1, day);
    return date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
        ? date.getTime()
        : null;
}

export const playEventLabel = (event: PlayEvent) =>
    event.kind === 'started'
        ? 'Empezado'
        : event.kind === 'playing' && event.from === 'paused'
          ? 'Reanudado'
          : STATUS_LABELS[event.kind];

const statusOfEvent = (event: PlayEvent): GameStatus =>
    event.kind === 'started' ? 'playing' : event.kind;

export function withoutSameDayRoundTrips(events: PlayEvent[]) {
    const sorted = [...events].sort((a, b) => a.at - b.at);
    const groups = new Map<string, PlayEvent[]>();
    for (const event of sorted) {
        const key = `${event.appId}:${dateInputValue(event.at)}`;
        const group = groups.get(key);
        if (group) group.push(event);
        else groups.set(key, [event]);
    }
    const retained = new Set<PlayEvent>();
    for (const group of groups.values()) {
        const compacted: PlayEvent[] = [];
        for (const event of group) {
            const previous = compacted.at(-1);
            if (
                previous &&
                statusOfEvent(event) === (previous.from ?? 'pending')
            )
                compacted.pop();
            else compacted.push(event);
        }
        for (const event of compacted) retained.add(event);
    }
    return sorted.filter((event) => {
        return retained.has(event);
    });
}

export function recordPreference(
    state: State,
    game: Pick<Game, 'appId' | 'name' | 'cover'>,
    preference: Preference,
    at = Date.now(),
) {
    const previous = state.preferences[game.appId]?.status ?? 'pending';
    if (previous !== preference.status) {
        const kind =
            previous === 'pending' && preference.status === 'playing'
                ? 'started'
                : preference.status;
        const candidate: PlayEvent = {
            appId: game.appId,
            name: game.name,
            ...(game.cover ? { cover: game.cover } : {}),
            kind,
            from: previous,
            at,
        };
        const history = state.playHistory ?? [];
        const sameDay = history.filter(
            (event) =>
                event.appId === game.appId &&
                dateInputValue(event.at) === dateInputValue(at),
        );
        const compacted = withoutSameDayRoundTrips([...sameDay, candidate]);
        const retained = new Set(compacted);
        state.playHistory = history.filter(
            (event) =>
                event.appId !== game.appId ||
                dateInputValue(event.at) !== dateInputValue(at) ||
                retained.has(event),
        );
        if (retained.has(candidate)) state.playHistory.push(candidate);
    }
    state.preferences[game.appId] = preference;
}

export function eventsInYear(
    events: NonNullable<State['playHistory']>,
    year: number,
) {
    return events
        .filter((event) => new Date(event.at).getFullYear() === year)
        .sort((a, b) => b.at - a.at);
}
