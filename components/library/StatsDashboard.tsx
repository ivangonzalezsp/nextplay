'use client';

import { useMemo } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    LabelList,
    Pie,
    PieChart,
    XAxis,
    YAxis,
} from 'recharts';
import {
    ChartNoAxesCombined,
    CheckCircle2,
    Clock3,
    Gamepad2,
    Layers3,
} from 'lucide-react';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
} from '@/components/ui/hover-card';
import type { GameStatus, Snapshot } from '@/lib/model';
import { libraryStats } from '@/lib/stats';

const number = new Intl.NumberFormat('es-ES');
const hours = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
const formatHours = (minutes: number) =>
    minutes > 0 && minutes < 3
        ? `${number.format(minutes)} min`
        : `${hours.format(minutes / 60)} h`;
const chartConfig = {
    count: { label: 'Juegos', color: 'var(--stats-teal)' },
} satisfies ChartConfig;
const bandColors = [
    'var(--stats-teal)',
    'var(--stats-blue)',
    'var(--stats-violet)',
    'var(--stats-amber)',
    'var(--stats-coral)',
    'var(--stats-mint)',
];
const statusColors: Record<GameStatus, string> = {
    pending: 'var(--stats-slate)',
    playing: 'var(--stats-teal)',
    paused: 'var(--stats-amber)',
    completed: 'var(--stats-violet)',
    abandoned: 'var(--stats-coral)',
    ignored: 'var(--stats-blue)',
};

export function StatsDashboard({ state }: { state: Snapshot }) {
    const stats = useMemo(() => libraryStats(state), [state]);
    const completed =
        stats.statuses.find(({ status }) => status === 'completed')?.count ?? 0;
    const visibleStatuses = stats.statuses
        .filter(({ count }) => count > 0)
        .map((status) => ({ ...status, fill: statusColors[status.status] }));
    const playtimeBands = stats.playtimeBands.map((band, index) => ({
        ...band,
        fill: bandColors[index],
    }));
    const metrics = [
        { label: 'En tu biblioteca', value: stats.totalGames, Icon: Gamepad2 },
        { label: 'Con horas jugadas', value: stats.playedCount, Icon: Clock3 },
        { label: 'Marcados terminados', value: completed, Icon: CheckCircle2 },
        {
            label: 'Géneros identificados',
            value: stats.genreCount,
            Icon: Layers3,
        },
    ];
    const rankings = [
        {
            title: 'Etiquetas más presentes',
            kicker: 'ETIQUETAS DE STEAM',
            badge: `${number.format(stats.tagCount)} etiquetas`,
            note: `Las cuatro etiquetas principales por juego, como en Biblioteca. ${number.format(stats.tagCoverage)} de ${number.format(stats.totalGames)} juegos tienen etiquetas.`,
            empty: 'Aún no hay etiquetas de Steam cargadas.',
            items: stats.topTags,
            metric: 'count' as const,
        },
        {
            title: 'Tus horas por etiqueta',
            kicker: 'ETIQUETAS DE STEAM',
            note: 'Tus horas jugadas en juegos con cada etiqueta. Pasa el cursor por una barra para ver qué juegos aportan horas. Un juego puede figurar en varias; no sumes las barras.',
            empty: 'No hay horas jugadas en juegos con etiquetas.',
            items: stats.topTagsByHours,
            metric: 'minutes' as const,
        },
        {
            title: 'Géneros más presentes',
            kicker: 'GÉNEROS DE IGDB',
            badge: `${number.format(stats.genreCoverage)} con datos`,
            note: 'Cada juego puede aparecer en varios géneros de IGDB.',
            empty: 'No hay géneros identificados todavía.',
            items: stats.topGenres,
            metric: 'count' as const,
        },
        {
            title: 'Tus horas por género',
            kicker: 'GÉNEROS DE IGDB',
            note: 'Tus horas jugadas en juegos de cada género. Pasa el cursor por una barra para ver qué juegos aportan horas. Un juego puede figurar en varios; no sumes las barras.',
            empty: 'No hay horas jugadas en juegos con géneros identificados.',
            items: stats.topGenresByHours,
            metric: 'minutes' as const,
        },
    ];

    if (!stats.totalGames)
        return (
            <section className="stats-empty">
                <ChartNoAxesCombined size={32} />
                <h2>Aún no hay estadísticas</h2>
                <p>Añade juegos o conecta Steam para ver tu biblioteca aquí.</p>
            </section>
        );

    return (
        <div className="stats-dashboard">
            <section className="stats-hero" aria-labelledby="stats-heading">
                <div className="stats-hero-copy">
                    <span className="stats-kicker">
                        <ChartNoAxesCombined size={15} /> RESUMEN DE BIBLIOTECA
                    </span>
                    <h2 id="stats-heading">Tu biblioteca en cifras</h2>
                    <p>
                        Tus horas jugadas, etiquetas, géneros y estado de tus
                        juegos.
                    </p>
                </div>
                <div className="stats-hero-total">
                    <span>TUS HORAS JUGADAS</span>
                    <strong>{formatHours(stats.totalMinutes)}</strong>
                    <small>
                        en {number.format(stats.playedCount)} juegos con tiempo
                        jugado
                    </small>
                </div>
            </section>

            <div className="stats-metrics">
                {metrics.map(({ label, value, Icon }) => (
                    <article className="stats-metric" key={label}>
                        <Icon aria-hidden="true" />
                        <span>{label}</span>
                        <strong>{number.format(value)}</strong>
                    </article>
                ))}
            </div>

            <div className="stats-panels">
                <section className="stats-panel stats-panel-playtime">
                    <div className="stats-panel-heading">
                        <div>
                            <span className="stats-panel-kicker">
                                TIEMPO DE JUEGO
                            </span>
                            <h3>Juegos por horas acumuladas</h3>
                        </div>
                        <span className="stats-panel-badge">
                            {number.format(stats.playedCount)} juegos
                        </span>
                    </div>
                    {stats.playedCount ? (
                        <>
                            <ChartContainer
                                config={chartConfig}
                                className="stats-playtime-chart"
                                aria-hidden="true"
                            >
                                <BarChart
                                    data={playtimeBands}
                                    margin={{
                                        top: 28,
                                        right: 8,
                                        left: 8,
                                        bottom: 0,
                                    }}
                                >
                                    <CartesianGrid
                                        vertical={false}
                                        stroke="var(--border)"
                                        strokeDasharray="3 5"
                                    />
                                    <XAxis
                                        dataKey="label"
                                        axisLine={false}
                                        tickLine={false}
                                        tickMargin={11}
                                        interval={0}
                                        tick={{
                                            fill: 'var(--foreground)',
                                            opacity: 0.72,
                                        }}
                                    />
                                    <YAxis hide />
                                    <Bar
                                        dataKey="count"
                                        radius={[8, 8, 0, 0]}
                                        maxBarSize={48}
                                        isAnimationActive={false}
                                    >
                                        <LabelList
                                            dataKey="count"
                                            position="top"
                                            fill="var(--foreground)"
                                            formatter={(value) =>
                                                number.format(Number(value))
                                            }
                                        />
                                    </Bar>
                                </BarChart>
                            </ChartContainer>
                            <p className="sr-only">
                                {stats.playtimeBands
                                    .map(
                                        (band) =>
                                            `${band.label}: ${band.count} juegos`,
                                    )
                                    .join('; ')}
                            </p>
                        </>
                    ) : (
                        <p className="stats-no-data">
                            Aún no hay juegos con tiempo jugado registrado.
                        </p>
                    )}
                    <p className="stats-panel-note">
                        {number.format(stats.zeroTimeCount)} con 0 minutos ·{' '}
                        {number.format(stats.unknownTimeCount)} sin dato de
                        tiempo. Los rangos muestran juegos ya empezados.
                    </p>
                </section>

                <section className="stats-panel stats-panel-status">
                    <div className="stats-panel-heading">
                        <div>
                            <span className="stats-panel-kicker">
                                ESTADO ACTUAL
                            </span>
                            <h3>Tu biblioteca hoy</h3>
                        </div>
                    </div>
                    <div className="stats-status-body">
                        <div className="stats-donut">
                            <ChartContainer
                                config={chartConfig}
                                className="stats-donut-chart"
                                initialDimension={{ width: 220, height: 220 }}
                                aria-hidden="true"
                            >
                                <PieChart>
                                    <Pie
                                        data={visibleStatuses}
                                        dataKey="count"
                                        nameKey="label"
                                        innerRadius={67}
                                        outerRadius={91}
                                        paddingAngle={2}
                                        stroke="none"
                                        isAnimationActive={false}
                                    />
                                </PieChart>
                            </ChartContainer>
                            <div className="stats-donut-center">
                                <strong>
                                    {number.format(stats.totalGames)}
                                </strong>
                                <span>juegos</span>
                            </div>
                        </div>
                        <ul className="stats-status-list">
                            {visibleStatuses.map(({ status, label, count }) => (
                                <li key={status}>
                                    <span
                                        className="stats-status-dot"
                                        style={{
                                            background: statusColors[status],
                                        }}
                                        aria-hidden="true"
                                    />
                                    <span>{label}</span>
                                    <strong>{number.format(count)}</strong>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <p className="stats-panel-note">
                        Los estados son los que has marcado; las horas no
                        indican que un juego esté terminado.
                    </p>
                </section>

                {rankings.map(
                    ({ title, kicker, badge, note, empty, items, metric }) => (
                        <section className="stats-panel" key={title}>
                            <div className="stats-panel-heading">
                                <div>
                                    <span className="stats-panel-kicker">
                                        {kicker}
                                    </span>
                                    <h3>{title}</h3>
                                </div>
                                {badge && (
                                    <span className="stats-panel-badge">
                                        {badge}
                                    </span>
                                )}
                            </div>
                            {items.length ? (
                                <ol className="stats-ranking-list">
                                    {items.map((item, index) => (
                                        <li key={`${item.name}-${index}`}>
                                            <HoverCard>
                                                <HoverCardTrigger
                                                    render={
                                                        <button
                                                            type="button"
                                                            className="stats-ranking-trigger"
                                                            aria-label={`Ver juegos que aportan horas a ${item.name}`}
                                                        />
                                                    }
                                                    delay={150}
                                                >
                                                    <div className="stats-ranking-label">
                                                        <span title={item.name}>
                                                            {item.name}
                                                        </span>
                                                        <strong>
                                                            {metric === 'count'
                                                                ? number.format(
                                                                      item.count,
                                                                  )
                                                                : formatHours(
                                                                      item.minutes,
                                                                  )}
                                                        </strong>
                                                    </div>
                                                    <div
                                                        className="stats-ranking-track"
                                                        aria-hidden="true"
                                                    >
                                                        <span
                                                            style={{
                                                                width: `${(100 * item[metric]) / items[0][metric]}%`,
                                                                background:
                                                                    bandColors[
                                                                        index %
                                                                            bandColors.length
                                                                    ],
                                                            }}
                                                        />
                                                    </div>
                                                </HoverCardTrigger>
                                                <HoverCardContent
                                                    side="right"
                                                    align="start"
                                                    className="stats-contributors-card"
                                                >
                                                    <strong>{item.name}</strong>
                                                    <p>
                                                        {number.format(
                                                            item.games.length,
                                                        )}{' '}
                                                        juegos aportan{' '}
                                                        {formatHours(
                                                            item.minutes,
                                                        )}
                                                    </p>
                                                    {item.games.length ? (
                                                        <ol>
                                                            {item.games.map(
                                                                (game) => (
                                                                    <li
                                                                        key={
                                                                            game.appId
                                                                        }
                                                                    >
                                                                        <span>
                                                                            {
                                                                                game.name
                                                                            }
                                                                        </span>
                                                                        <strong>
                                                                            {formatHours(
                                                                                game.playtimeMinutes ??
                                                                                    0,
                                                                            )}
                                                                        </strong>
                                                                    </li>
                                                                ),
                                                            )}
                                                        </ol>
                                                    ) : (
                                                        <p>
                                                            Ningún juego tiene
                                                            horas registradas.
                                                        </p>
                                                    )}
                                                </HoverCardContent>
                                            </HoverCard>
                                        </li>
                                    ))}
                                </ol>
                            ) : (
                                <p className="stats-no-data">{empty}</p>
                            )}
                            <p className="stats-panel-note">{note}</p>
                        </section>
                    ),
                )}

                <section className="stats-panel stats-panel-top">
                    <div className="stats-panel-heading">
                        <div>
                            <span className="stats-panel-kicker">
                                TUS MÁS JUGADOS
                            </span>
                            <h3>Donde más tiempo has pasado</h3>
                        </div>
                        {!!stats.topGames.length && (
                            <span className="stats-panel-badge">
                                Top {stats.topGames.length} · {stats.topShare} %
                                de horas
                            </span>
                        )}
                    </div>
                    {stats.topGames.length ? (
                        <ol className="stats-top-list">
                            {stats.topGames.map((game, index) => (
                                <li key={game.appId}>
                                    <span className="stats-rank">
                                        {String(index + 1).padStart(2, '0')}
                                    </span>
                                    <div
                                        className="stats-game-cover"
                                        style={
                                            game.cover
                                                ? {
                                                      backgroundImage: `url(${JSON.stringify(game.cover)})`,
                                                  }
                                                : undefined
                                        }
                                        aria-hidden="true"
                                    />
                                    <div className="stats-game-info">
                                        <span title={game.name}>
                                            {game.name}
                                        </span>
                                        <div
                                            className="stats-game-track"
                                            aria-hidden="true"
                                        >
                                            <span
                                                style={{
                                                    width: `${
                                                        (100 *
                                                            (game.playtimeMinutes ??
                                                                0)) /
                                                        (stats.topGames[0]
                                                            .playtimeMinutes ??
                                                            1)
                                                    }%`,
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <strong>
                                        {formatHours(game.playtimeMinutes ?? 0)}
                                    </strong>
                                </li>
                            ))}
                        </ol>
                    ) : (
                        <p className="stats-no-data">
                            Cuando haya tiempo de juego registrado, tus juegos
                            más jugados aparecerán aquí.
                        </p>
                    )}
                    <p className="stats-panel-note">
                        El porcentaje indica la parte del tiempo total que
                        concentran estos juegos.
                    </p>
                </section>
            </div>

            <p className="stats-source-note">
                Son tus horas acumuladas en Steam: también en juegos compartidos
                se cuenta el tiempo de tu perfil, no el del propietario. Los
                juegos sin tiempo registrado no suman horas. Los estados son tus
                marcas; los géneros proceden de IGDB y las etiquetas de Steam de
                los metadatos sincronizados.
            </p>
        </div>
    );
}
