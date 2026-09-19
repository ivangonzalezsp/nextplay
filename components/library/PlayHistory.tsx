'use client';

import { useState } from 'react';
import { es } from 'date-fns/locale';
import {
    CalendarDays,
    List,
    Play,
    Check,
    Pause,
    X,
    Clock,
    Ban,
    Gamepad2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { gameUrl, type PlayEvent, type State } from '@/lib/model';
import {
    calendarDateAt,
    dateInputValue,
    eventsInYear,
    playEventLabel,
    playEventPhase,
    gameColor,
    groupPlayPeriods,
    playPeriods,
    periodSpan,
    withoutSameDayRoundTrips,
    type PlayPeriod,
} from '@/lib/play-history';

const months = Array.from({ length: 12 }, (_, month) =>
    new Date(2024, month).toLocaleDateString('es', { month: 'long' }),
);

function EventLabel({ event }: { event: PlayEvent }) {
    const Icon = {
        started: Play,
        playing: Play,
        completed: Check,
        paused: Pause,
        abandoned: X,
        pending: Clock,
        ignored: Ban,
    }[event.kind];
    const phase = playEventPhase(event);
    return (
        <span
            className="inline-block rounded border-l-2 bg-muted px-1.5 py-1 text-xs font-medium [overflow-wrap:anywhere]"
            style={{ borderColor: gameColor(event.appId) }}
        >
            <Icon size={12} className="mr-1 inline" />
            {phase !== 'neutral' && `${phase === 'start' ? 'Start' : 'End'} · `}
            {playEventLabel(event)}
        </span>
    );
}

function EventCover({ src }: { src?: string }) {
    const [failedSrc, setFailedSrc] = useState<string>();
    return (
        <div className="flex aspect-[2/3] w-full items-center justify-center overflow-hidden rounded-md bg-muted">
            {src && failedSrc !== src ? (
                <img
                    src={src}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                    onError={() => setFailedSrc(src)}
                />
            ) : (
                <Gamepad2
                    className="w-1/2 max-w-8 text-muted-foreground"
                    aria-hidden="true"
                />
            )}
        </div>
    );
}

function dateFromInput(value: string) {
    return new Date(calendarDateAt(value) ?? Date.now());
}

function EventDateEditor({
    value,
    maxDate,
    label,
    busy,
    onChange,
}: {
    value: string;
    maxDate: Date;
    label: string;
    busy: boolean;
    onChange: (date: string) => Promise<void>;
}) {
    const selected = dateFromInput(value);
    const [open, setOpen] = useState(false);
    const [month, setMonth] = useState(
        () => new Date(selected.getFullYear(), selected.getMonth(), 1),
    );
    const dateLabel = selected.toLocaleDateString('es', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });

    return (
        <Popover
            open={open}
            onOpenChange={(nextOpen) => {
                if (nextOpen)
                    setMonth(
                        new Date(
                            selected.getFullYear(),
                            selected.getMonth(),
                            1,
                        ),
                    );
                setOpen(nextOpen);
            }}
        >
            <PopoverTrigger
                render={
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        aria-label={label}
                    >
                        <CalendarDays size={14} /> {dateLabel}
                    </Button>
                }
            />
            <PopoverContent align="end" className="w-auto p-0">
                <Calendar
                    mode="single"
                    locale={es}
                    month={month}
                    selected={selected}
                    onMonthChange={setMonth}
                    onSelect={(date) => {
                        if (!date) return;
                        const nextValue = dateInputValue(date.getTime());
                        if (nextValue === value) return;
                        setOpen(false);
                        void onChange(nextValue);
                    }}
                    disabled={{ after: maxDate }}
                    labels={{
                        labelPrevious: () => 'Mes anterior',
                        labelNext: () => 'Próximo mes',
                    }}
                    initialFocus
                />
            </PopoverContent>
        </Popover>
    );
}

export function PlayHistory({
    state,
    busy,
    onDateChange,
}: {
    state: State;
    busy: boolean;
    onDateChange: (index: number, date: string) => Promise<void>;
}) {
    const events = state.playHistory ?? [];
    const eventUrl = (event: PlayEvent) =>
        gameUrl(
            state.games.find((game) => game.appId === event.appId) ?? event,
        );
    const covers = new Map(
        [
            ...[...(state.history ?? []), ...state.conversation].flatMap(
                (turn) =>
                    [...turn.result.owned, ...turn.result.discoveries].map(
                        (pick) => pick.game,
                    ),
            ),
            ...(state.shortlist ?? []),
            ...state.games,
        ]
            .filter((game) => game.cover)
            .map((game) => [game.appId, game.cover]),
    );
    const [now] = useState(() => Date.now());
    const currentYear = new Date(now).getFullYear();
    const [year, setYear] = useState(currentYear);
    const [view, setView] = useState<'timeline' | 'calendar'>('timeline');
    const earliestYear = Math.min(
        currentYear,
        ...events.map((event) => new Date(event.at).getFullYear()),
    );
    const years = Array.from(
        { length: currentYear - earliestYear + 1 },
        (_, index) => currentYear - index,
    );
    const visibleEvents = withoutSameDayRoundTrips(events);
    const selected = eventsInYear(visibleEvents, year);
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);
    const yearDays =
        (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
    const periods = playPeriods(visibleEvents).filter((period) =>
        periodSpan(period, yearStart, yearEnd, now),
    );
    const periodGroups = groupPlayPeriods(periods);
    const dateLabel = (at: number) =>
        new Date(at).toLocaleDateString('es', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
    const periodRangeLabel = (period: PlayPeriod) =>
        `Start ${dateLabel(period.start.at)} · ${period.end ? `${playEventLabel(period.end)} ${dateLabel(period.end.at)}` : 'En curso'}`;
    const periodDescription = (period: PlayPeriod) =>
        `${period.start.name}: ${periodRangeLabel(period)}${period.end ? '' : ' hasta hoy'}`;
    const maxDate = new Date(calendarDateAt(dateInputValue(now))!);
    const count = (kind: PlayEvent['kind']) =>
        new Set(
            selected
                .filter((event) => event.kind === kind)
                .map((event) => event.appId),
        ).size;

    return (
        <section className="space-y-6" aria-label="Mi año de juegos">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-semibold">Mi año</h2>
                    <p className="text-sm text-muted-foreground">
                        {count('started')} juegos empezados ·{' '}
                        {count('completed')} terminados
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="play-year" className="text-sm">
                        Año
                    </label>
                    <select
                        id="play-year"
                        value={year}
                        onChange={(event) =>
                            setYear(Number(event.target.value))
                        }
                        className="rounded-md border border-input bg-background px-3 py-2"
                    >
                        {years.map((value) => (
                            <option key={value} value={value}>
                                {value}
                            </option>
                        ))}
                    </select>
                    <Button
                        variant={view === 'timeline' ? 'default' : 'outline'}
                        aria-pressed={view === 'timeline'}
                        onClick={() => setView('timeline')}
                    >
                        <List size={16} /> Timeline
                    </Button>
                    <Button
                        variant={view === 'calendar' ? 'default' : 'outline'}
                        aria-pressed={view === 'calendar'}
                        onClick={() => setView('calendar')}
                    >
                        <CalendarDays size={16} /> Calendario
                    </Button>
                </div>
            </div>
            <p className="text-sm text-muted-foreground">
                Cada cambio de estado queda registrado: inicios, pausas,
                reanudaciones, finales y abandonos, también al volver a
                Pendiente o marcar No me interesa. Puedes corregir la fecha de
                cada evento desde la lista de cambios.
            </p>
            <p className="text-sm text-muted-foreground">
                Un color por juego. Cada juego aparece en una sola línea y cada
                Start-End conserva su propio tramo; al reanudar comienza otro
                tramo del mismo color. Los tramos abiertos llegan hasta hoy. Sin
                un inicio registrado no se dibuja un tramo.
            </p>
            <p className="text-sm text-muted-foreground">
                Las idas y vueltas que regresan al estado inicial el mismo día
                se consideran un clic accidental y no crean un tramo.
            </p>
            {selected.length === 0 && periods.length === 0 && (
                <p className="rounded-xl border border-border p-6">
                    Todavía no hay actividad registrada en {year}.
                </p>
            )}
            {view === 'timeline' ? (
                <div className="space-y-6">
                    <div
                        className="overflow-x-auto rounded-xl border border-border bg-card p-4"
                        role="region"
                        aria-label={`Tramos de juego de ${year}`}
                        tabIndex={0}
                    >
                        <div className="min-w-[640px] space-y-4">
                            <div className="ml-52 grid grid-cols-12 text-xs text-muted-foreground">
                                {months.map((month) => (
                                    <span key={month}>{month.slice(0, 3)}</span>
                                ))}
                            </div>
                            {periodGroups.map((group) => {
                                const first = group[0];
                                const color = gameColor(first.start.appId);
                                const description = group
                                    .map(periodDescription)
                                    .join(' · ');
                                return (
                                    <div
                                        key={first.start.appId}
                                        className="flex items-center gap-4"
                                    >
                                        <a
                                            href={eventUrl(first.start)}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex w-48 shrink-0 items-center gap-2 hover:underline"
                                        >
                                            <span className="w-9 shrink-0">
                                                <EventCover
                                                    src={
                                                        covers.get(
                                                            first.start.appId,
                                                        ) ?? first.start.cover
                                                    }
                                                />
                                            </span>
                                            <span className="text-sm">
                                                {first.start.name}
                                            </span>
                                        </a>
                                        <div className="min-w-0 flex-1">
                                            <p className="mb-2 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                                {group.map(
                                                    (period, periodIndex) => (
                                                        <span
                                                            key={`${period.start.at}-${periodIndex}`}
                                                        >
                                                            {periodRangeLabel(
                                                                period,
                                                            )}
                                                        </span>
                                                    ),
                                                )}
                                            </p>
                                            <div
                                                className="relative h-5 rounded bg-muted/40"
                                                aria-label={description}
                                                title={description}
                                            >
                                                {group.map(
                                                    (period, periodIndex) => {
                                                        const span = periodSpan(
                                                            period,
                                                            yearStart,
                                                            yearEnd,
                                                            now,
                                                        )!;
                                                        return (
                                                            <Popover
                                                                key={`${period.start.at}-${periodIndex}`}
                                                            >
                                                                <PopoverTrigger
                                                                    type="button"
                                                                    aria-label={periodDescription(
                                                                        period,
                                                                    )}
                                                                    className="absolute top-2 h-1 cursor-pointer rounded-full border-0 p-0 opacity-70 focus-visible:-top-0.5 focus-visible:h-2 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                                    style={{
                                                                        left: `${(span.start / yearDays) * 100}%`,
                                                                        width: `${((span.end - span.start + 1) / yearDays) * 100}%`,
                                                                        backgroundColor:
                                                                            color,
                                                                    }}
                                                                >
                                                                    <span
                                                                        aria-hidden="true"
                                                                        className="absolute -left-0.5 -top-0.5 h-2 w-2 rounded-full"
                                                                        style={{
                                                                            backgroundColor:
                                                                                color,
                                                                        }}
                                                                    />
                                                                    <span
                                                                        aria-hidden="true"
                                                                        className={`absolute -right-0.5 -top-0.5 h-2 w-2 border ${period.end ? 'rounded-sm' : 'rounded-full bg-card'}`}
                                                                        style={{
                                                                            borderColor:
                                                                                color,
                                                                            ...(period.end
                                                                                ? {
                                                                                      backgroundColor:
                                                                                          color,
                                                                                  }
                                                                                : {}),
                                                                        }}
                                                                    />
                                                                </PopoverTrigger>
                                                                <PopoverContent
                                                                    side="top"
                                                                    align="start"
                                                                    className="w-64 max-w-[calc(100vw-2rem)] border border-border bg-card p-0 text-card-foreground shadow-xl"
                                                                >
                                                                    <div
                                                                        className="space-y-3 border-l-2 p-3"
                                                                        style={{
                                                                            borderColor:
                                                                                color,
                                                                        }}
                                                                    >
                                                                        <div className="flex items-start justify-between gap-3">
                                                                            <div>
                                                                                <p className="font-semibold">
                                                                                    {
                                                                                        first
                                                                                            .start
                                                                                            .name
                                                                                    }
                                                                                </p>
                                                                                <p className="text-[11px] text-muted-foreground">
                                                                                    Fragmento{' '}
                                                                                    {periodIndex +
                                                                                        1}{' '}
                                                                                    de{' '}
                                                                                    {
                                                                                        group.length
                                                                                    }
                                                                                </p>
                                                                            </div>
                                                                            <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-wide">
                                                                                {period.end
                                                                                    ? playEventLabel(
                                                                                          period.end,
                                                                                      )
                                                                                    : 'En curso'}
                                                                            </span>
                                                                        </div>
                                                                        <div className="grid grid-cols-2 gap-3 text-xs">
                                                                            <div>
                                                                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                                                                    Start
                                                                                </p>
                                                                                <p className="font-medium">
                                                                                    {dateLabel(
                                                                                        period
                                                                                            .start
                                                                                            .at,
                                                                                    )}
                                                                                </p>
                                                                            </div>
                                                                            <div>
                                                                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                                                                    {period.end
                                                                                        ? 'End'
                                                                                        : 'Hasta hoy'}
                                                                                </p>
                                                                                <p className="font-medium">
                                                                                    {period.end
                                                                                        ? dateLabel(
                                                                                              period
                                                                                                  .end
                                                                                                  .at,
                                                                                          )
                                                                                        : 'En curso'}
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </PopoverContent>
                                                            </Popover>
                                                        );
                                                    },
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <details>
                        <summary className="cursor-pointer text-sm">
                            Todos los cambios de estado ({selected.length})
                        </summary>
                        <ol className="ml-2 mt-4 space-y-4 border-l border-border pl-6">
                            {selected.map((event, index) => {
                                const eventIndex = events.indexOf(event);
                                const currentDate = dateInputValue(event.at);
                                return (
                                    <li
                                        key={`${event.at}-${index}`}
                                        className="relative rounded-xl border border-l-4 bg-card p-4"
                                        style={{
                                            borderColor: gameColor(event.appId),
                                        }}
                                    >
                                        <span
                                            className="absolute -left-8 top-6 h-3 w-3 rounded-full"
                                            style={{
                                                backgroundColor: gameColor(
                                                    event.appId,
                                                ),
                                            }}
                                        />
                                        <div className="flex items-start gap-4">
                                            <a
                                                className="w-20 shrink-0 sm:w-24"
                                                href={eventUrl(event)}
                                                target="_blank"
                                                rel="noreferrer"
                                                aria-label={`Ver ${event.name}`}
                                            >
                                                <EventCover
                                                    src={
                                                        covers.get(
                                                            event.appId,
                                                        ) ?? event.cover
                                                    }
                                                />
                                            </a>
                                            <div className="min-w-0 flex-1 space-y-2">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <a
                                                        className="font-semibold hover:underline"
                                                        href={eventUrl(event)}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                    >
                                                        {event.name}
                                                    </a>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <time
                                                            className="text-sm text-muted-foreground"
                                                            dateTime={new Date(
                                                                event.at,
                                                            ).toISOString()}
                                                        >
                                                            {new Date(
                                                                event.at,
                                                            ).toLocaleDateString(
                                                                'es',
                                                                {
                                                                    day: 'numeric',
                                                                    month: 'long',
                                                                    year: 'numeric',
                                                                },
                                                            )}
                                                        </time>
                                                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                                            <span>
                                                                Editar fecha
                                                            </span>
                                                            <EventDateEditor
                                                                value={
                                                                    currentDate
                                                                }
                                                                maxDate={
                                                                    maxDate
                                                                }
                                                                busy={busy}
                                                                label={`Fecha de ${playEventLabel(event)} para ${event.name}`}
                                                                onChange={(
                                                                    date,
                                                                ) =>
                                                                    onDateChange(
                                                                        eventIndex,
                                                                        date,
                                                                    )
                                                                }
                                                            />
                                                        </span>
                                                    </div>
                                                </div>
                                                <EventLabel event={event} />
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ol>
                    </details>
                </div>
            ) : (
                <div className="grid gap-6 xl:grid-cols-2">
                    {months.map((monthName, month) => {
                        const offset =
                            (new Date(year, month, 1).getDay() + 6) % 7;
                        const days = new Date(year, month + 1, 0).getDate();
                        const monthEvents = selected.filter(
                            (event) => new Date(event.at).getMonth() === month,
                        );
                        return (
                            <section
                                key={month}
                                className="min-w-0 rounded-xl border border-border bg-card p-3"
                                aria-label={`${monthName} ${year}`}
                            >
                                <h3 className="mb-3 text-lg font-semibold capitalize">
                                    {monthName}
                                </h3>
                                <div className="grid grid-cols-7 gap-1">
                                    {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(
                                        (day) => (
                                            <span
                                                key={day}
                                                className="text-center text-xs text-muted-foreground"
                                            >
                                                {day}
                                            </span>
                                        ),
                                    )}
                                </div>
                                {Array.from(
                                    { length: Math.ceil((offset + days) / 7) },
                                    (_, week) => {
                                        const firstDay = week * 7 - offset + 1;
                                        const weekStart = new Date(
                                            year,
                                            month,
                                            Math.max(1, firstDay),
                                        );
                                        const weekEnd = new Date(
                                            year,
                                            month,
                                            Math.min(days, firstDay + 6),
                                        );
                                        return (
                                            <div key={week} className="mb-2">
                                                <div className="grid grid-cols-7 gap-1">
                                                    {Array.from(
                                                        { length: 7 },
                                                        (_, column) => {
                                                            const day =
                                                                firstDay +
                                                                column;
                                                            if (
                                                                day < 1 ||
                                                                day > days
                                                            )
                                                                return (
                                                                    <div
                                                                        key={
                                                                            column
                                                                        }
                                                                    />
                                                                );
                                                            const dayEvents =
                                                                monthEvents.filter(
                                                                    (event) =>
                                                                        new Date(
                                                                            event.at,
                                                                        ).getDate() ===
                                                                        day,
                                                                );
                                                            return (
                                                                <div
                                                                    key={day}
                                                                    className={`min-h-16 min-w-0 rounded-md border p-1 ${dayEvents.length ? 'border-primary/40 bg-primary/10' : 'border-border'}`}
                                                                >
                                                                    <span className="text-xs text-muted-foreground">
                                                                        {day}
                                                                    </span>
                                                                    {dayEvents.map(
                                                                        (
                                                                            event,
                                                                            eventIndex,
                                                                        ) => (
                                                                            <a
                                                                                key={
                                                                                    eventIndex
                                                                                }
                                                                                href={eventUrl(
                                                                                    event,
                                                                                )}
                                                                                target="_blank"
                                                                                rel="noreferrer"
                                                                                className="mt-1 block break-words rounded border border-t-4 bg-background p-1 text-xs hover:underline"
                                                                                style={{
                                                                                    borderColor:
                                                                                        gameColor(
                                                                                            event.appId,
                                                                                        ),
                                                                                }}
                                                                                title={`${event.name} · ${playEventLabel(event)}`}
                                                                            >
                                                                                <EventCover
                                                                                    src={
                                                                                        covers.get(
                                                                                            event.appId,
                                                                                        ) ??
                                                                                        event.cover
                                                                                    }
                                                                                />
                                                                                <EventLabel
                                                                                    event={
                                                                                        event
                                                                                    }
                                                                                />
                                                                                <span className="block">
                                                                                    {
                                                                                        event.name
                                                                                    }
                                                                                </span>
                                                                            </a>
                                                                        ),
                                                                    )}
                                                                </div>
                                                            );
                                                        },
                                                    )}
                                                </div>
                                                <div className="mt-1 space-y-1">
                                                    {periodGroups.map(
                                                        (group) => {
                                                            const visible =
                                                                group.flatMap(
                                                                    (
                                                                        period,
                                                                    ) => {
                                                                        const span =
                                                                            periodSpan(
                                                                                period,
                                                                                weekStart,
                                                                                weekEnd,
                                                                                now,
                                                                            );
                                                                        return span
                                                                            ? [
                                                                                  {
                                                                                      period,
                                                                                      span,
                                                                                  },
                                                                              ]
                                                                            : [];
                                                                    },
                                                                );
                                                            if (!visible.length)
                                                                return null;
                                                            const leading =
                                                                Math.max(
                                                                    0,
                                                                    1 -
                                                                        firstDay,
                                                                );
                                                            const description =
                                                                visible
                                                                    .map(
                                                                        ({
                                                                            period,
                                                                        }) =>
                                                                            periodDescription(
                                                                                period,
                                                                            ),
                                                                    )
                                                                    .join(
                                                                        ' · ',
                                                                    );
                                                            return (
                                                                <div
                                                                    key={
                                                                        group[0]
                                                                            .start
                                                                            .appId
                                                                    }
                                                                    className="grid grid-cols-7"
                                                                    aria-label={
                                                                        description
                                                                    }
                                                                >
                                                                    {visible.map(
                                                                        (
                                                                            {
                                                                                period,
                                                                                span,
                                                                            },
                                                                            index,
                                                                        ) => (
                                                                            <div
                                                                                key={`${period.start.at}-${index}`}
                                                                                className="min-w-0 border-t-2 px-1 text-xs"
                                                                                style={{
                                                                                    gridColumn: `${leading + span.start + 1} / ${leading + span.end + 2}`,
                                                                                    gridRow: 1,
                                                                                    borderColor:
                                                                                        gameColor(
                                                                                            group[0]
                                                                                                .start
                                                                                                .appId,
                                                                                        ),
                                                                                }}
                                                                                title={periodDescription(
                                                                                    period,
                                                                                )}
                                                                                aria-label={periodDescription(
                                                                                    period,
                                                                                )}
                                                                            >
                                                                                <span className="block truncate">
                                                                                    {index ===
                                                                                    0
                                                                                        ? group[0]
                                                                                              .start
                                                                                              .name
                                                                                        : ''}
                                                                                </span>
                                                                            </div>
                                                                        ),
                                                                    )}
                                                                </div>
                                                            );
                                                        },
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    },
                                )}
                            </section>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
