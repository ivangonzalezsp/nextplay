import { STATUS_LABELS, type Game, type PlayEvent, type Preference, type State } from './model.ts';

export const playEventPhase = (event: PlayEvent) => ({
  started: 'start', playing: 'start', paused: 'end', completed: 'end',
  abandoned: 'end', pending: 'neutral', ignored: 'neutral',
} as const)[event.kind];

// Stable pseudo-random hue: a game keeps its color across views and reloads.
export const gameColor = (appId: number) => `hsl(${(Math.imul(appId, 137) >>> 0) % 360} 65% 55%)`;

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

const calendarDay = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
export function periodSpan(period: PlayPeriod, from: Date, to: Date, now: number) {
  const first = calendarDay(from);
  const last = calendarDay(to);
  const start = Math.max(first, calendarDay(new Date(period.start.at)));
  const end = Math.min(last, calendarDay(new Date(period.end?.at ?? now)));
  return start <= end ? { start: start - first, end: end - first } : null;
}

export const playEventLabel = (event: PlayEvent) =>
  event.kind === 'started' ? 'Empezado'
    : event.kind === 'playing' && event.from === 'paused' ? 'Reanudado'
      : STATUS_LABELS[event.kind];

export function recordPreference(state: State, game: Pick<Game, 'appId' | 'name' | 'cover'>, preference: Preference, at = Date.now()) {
  const previous = state.preferences[game.appId]?.status ?? 'pending';
  if (previous !== preference.status) {
    const kind = previous === 'pending' && preference.status === 'playing' ? 'started' : preference.status;
    (state.playHistory ??= []).push({ appId: game.appId, name: game.name, ...(game.cover ? { cover: game.cover } : {}), kind, from: previous, at });
  }
  state.preferences[game.appId] = preference;
}

export function eventsInYear(events: NonNullable<State['playHistory']>, year: number) {
  return events.filter((event) => new Date(event.at).getFullYear() === year)
    .sort((a, b) => b.at - a.at);
}
