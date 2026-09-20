'use client';

import { useEffect, useRef, useState } from 'react';
import {
    Search,
    LayoutGrid,
    List,
    Star,
    Bookmark,
    Sparkles,
    ExternalLink,
    Clock,
    Check,
    X,
    Gamepad2,
    Play,
    Trophy,
    RefreshCw,
    Trash2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from '@/components/ui/select';
import {
    Combobox,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
} from '@/components/ui/combobox';
import GameOpinion from '@/app/opinion';
import { AddGameDialog, type AddGameInput } from './AddGameDialog';
import {
    STATUS_LABELS,
    gameUrl,
    inLibrary,
    libraryLabel,
    steamLaunchUrl,
    steamTagKey,
    tracksSteamAchievements,
    type Game,
    type GameStatus,
    type LibraryOrderBy,
    type Preference,
    type Snapshot,
} from '@/lib/model';

function formatHours(value: number | null | undefined) {
    return value == null
        ? 'sin datos'
        : value.toLocaleString('es', { maximumFractionDigits: 1 }) + ' h';
}

function HltbBreakdown({ game }: { game: Game }) {
    if (!game.hltb) return null;
    return (
        <details className="mb-2 text-xs text-muted-foreground">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-emerald-300">
                <Clock size={11} aria-hidden="true" />
                HLTB: {formatHours(game.hltb.mainHours)}
            </summary>
            <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 pl-4">
                <dt>Historia principal</dt>
                <dd>{formatHours(game.hltb.mainHours)}</dd>
                <dt>Historia + extras</dt>
                <dd>{formatHours(game.hltb.extraHours)}</dd>
                <dt>Completista</dt>
                <dd>{formatHours(game.hltb.completionHours)}</dd>
            </dl>
        </details>
    );
}

export function AchievementProgress({
    game,
    busy,
    onRefresh,
}: {
    game: Game;
    busy: boolean;
    onRefresh?: (game: Game) => Promise<void>;
}) {
    const data = game.steamAchievements;
    const percent = data?.total
        ? Math.round((data.unlocked / data.total) * 100)
        : 0;
    return (
        <details className="mt-2 border-t border-border/30 pt-2 text-xs">
            <summary className="flex cursor-pointer items-center gap-1.5 text-amber-300">
                <Trophy size={13} />
                {data
                    ? `${data.unlocked}/${data.total} logros · ${percent}%`
                    : 'Cargar progreso de logros'}
            </summary>
            <div className="mt-2 space-y-2 text-muted-foreground">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    disabled={busy || !onRefresh}
                    onClick={() => onRefresh && void onRefresh(game)}
                    title="Actualizar ahora la lista de logros"
                >
                    <RefreshCw
                        size={12}
                        className={busy ? 'mr-1 animate-spin' : 'mr-1'}
                    />
                    Actualizar logros
                </Button>
                {data && (
                    <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
                        {data.achievements.map((achievement) => (
                            <div
                                key={achievement.apiName}
                                className={
                                    achievement.achieved
                                        ? 'text-foreground'
                                        : ''
                                }
                            >
                                <span className="mr-1">
                                    {achievement.achieved ? '✓' : '○'}
                                </span>
                                {achievement.hidden && !achievement.achieved
                                    ? 'Logro oculto'
                                    : achievement.name}
                                {achievement.description &&
                                    (achievement.achieved ||
                                        !achievement.hidden) && (
                                        <span className="block pl-4 text-[10px] text-muted-foreground">
                                            {achievement.description}
                                        </span>
                                    )}
                            </div>
                        ))}
                        {!data.total && (
                            <p>Este juego no tiene logros en Steam.</p>
                        )}
                    </div>
                )}
            </div>
        </details>
    );
}

export function LibraryView({
    state,
    games,
    orderedGames,
    totalFiltered,
    limit,
    setLimit,
    search,
    setSearch,
    libraryOwner,
    setLibraryOwner,
    libraryTag,
    setLibraryTag,
    libraryOrderBy,
    setLibraryOrderBy,
    steamTags,
    savedIds,
    onShortlist,
    onPreference,
    onSimilar,
    onAdd,
    onRemove,
    onRefreshAchievements,
    busy,
}: {
    state: Snapshot | null;
    games: Game[];
    orderedGames: Game[];
    totalFiltered: number;
    limit: number;
    setLimit: (limit: number) => void;
    search: string;
    setSearch: (search: string) => void;
    libraryOwner: string;
    setLibraryOwner: (owner: string) => void;
    libraryTag: string;
    setLibraryTag: (tag: string) => void;
    libraryOrderBy: LibraryOrderBy;
    setLibraryOrderBy: (order: LibraryOrderBy) => void;
    steamTags: { value: string; label: string }[];
    savedIds: Set<number>;
    onShortlist: (game: Game) => void;
    onPreference: (game: Game, change: Partial<Preference>) => void;
    onSimilar: (game: Game) => void;
    onAdd: (input: AddGameInput) => Promise<void>;
    onRemove: (game: Game) => Promise<void>;
    onRefreshAchievements?: (game: Game) => Promise<void>;
    busy: string;
}) {
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [quickFilter, setQuickFilter] = useState<
        'all' | 'favorites' | 'playing' | 'pending' | 'shared' | 'short'
    >('all');
    const loadMoreRef = useRef<HTMLDivElement>(null);
    const selectedLibraryTag =
        steamTags.find((tag) => tag.value === libraryTag) ?? null;
    const confirmRemove = (game: Game) => {
        if (
            game.appId < 0 &&
            window.confirm(
                `¿Borrar «${game.name}» de tu biblioteca? También se eliminarán su estado, lista corta y actividad.`,
            )
        )
            void onRemove(game);
    };

    // Filter based on quick chip selection
    const visibleGames = orderedGames.filter((g) => {
        const pref = state?.preferences[g.appId];
        if (quickFilter === 'favorites') return pref?.favorite;
        if (quickFilter === 'playing')
            return ['playing', 'paused'].includes(pref?.status ?? '');
        if (quickFilter === 'pending')
            return !pref?.status || pref.status === 'pending';
        if (quickFilter === 'shared') return g.shared;
        if (quickFilter === 'short') {
            const hours = g.hltb?.mainHours ?? g.durationHours;
            return (
                hours !== null && hours !== undefined && hours > 0 && hours <= 5
            );
        }
        return true;
    });

    useEffect(() => {
        const sentinel = loadMoreRef.current;
        if (!sentinel || visibleGames.length <= limit) return;
        const observer = new IntersectionObserver(([entry]) => {
            if (entry?.isIntersecting)
                setLimit(Math.min(limit + 36, visibleGames.length));
        });
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [limit, setLimit, visibleGames.length]);

    return (
        <div className="hud-library-view">
            {/* 1. TOP TOOLBAR WITH SEARCH, QUICK FILTERS & VIEW SWITCHER */}
            <div className="hud-library-toolbar">
                {/* Search input with icon */}
                <div className="hud-library-search-box">
                    <Search size={16} className="hud-search-icon" />
                    <Input
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setLimit(36);
                        }}
                        placeholder="Buscar por título, desarrollador o etiqueta…"
                        className="hud-search-input"
                    />
                    {search && (
                        <button
                            type="button"
                            className="hud-search-clear"
                            onClick={() => setSearch('')}
                            aria-label="Borrar búsqueda"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

                <div className="hud-library-toolbar-actions">
                    <AddGameDialog
                        igdbReady={!!state?.setup.igdb}
                        busy={!!busy || !state}
                        onAdd={async (input) => {
                            await onAdd(input);
                            setQuickFilter('all');
                        }}
                    />
                    {/* View Mode Toggle */}
                    <div className="hud-view-switcher">
                        <button
                            type="button"
                            className={`hud-view-mode-btn ${viewMode === 'grid' ? 'active' : ''}`}
                            onClick={() => setViewMode('grid')}
                            title="Vista de cuadrícula (pósters)"
                            aria-label="Vista cuadrícula"
                        >
                            <LayoutGrid size={16} />
                        </button>
                        <button
                            type="button"
                            className={`hud-view-mode-btn ${viewMode === 'list' ? 'active' : ''}`}
                            onClick={() => setViewMode('list')}
                            title="Vista de lista detallada"
                            aria-label="Vista lista"
                        >
                            <List size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {/* 2. SECONDARY FILTER ROW: QUICK CHIPS + DROPDOWNS */}
            <div className="hud-library-filter-strip">
                {/* Quick Chips */}
                <div className="hud-library-chips">
                    {[
                        { id: 'all', label: 'Todos' },
                        { id: 'favorites', label: '⭐ Favoritos' },
                        { id: 'playing', label: '🎮 En curso' },
                        { id: 'pending', label: '⏳ Pendientes' },
                        { id: 'shared', label: '👥 Compartidos' },
                        { id: 'short', label: '⚡ Cortos (< 5h)' },
                    ].map((chip) => (
                        <button
                            key={chip.id}
                            type="button"
                            className={`hud-lib-chip ${quickFilter === chip.id ? 'active' : ''}`}
                            onClick={() =>
                                setQuickFilter(chip.id as typeof quickFilter)
                            }
                        >
                            {chip.label}
                        </button>
                    ))}
                </div>

                {/* Select Dropdowns */}
                <div className="hud-library-selects">
                    {/* Owner selector */}
                    <Select
                        value={libraryOwner}
                        onValueChange={(val) => {
                            setLibraryOwner(val ?? '');
                            setLimit(36);
                        }}
                        items={[
                            { value: '', label: 'Todas las bibliotecas' },
                            { value: 'own', label: 'Mis juegos propios' },
                            { value: 'shared', label: 'Solo compartidos' },
                            ...(state?.family?.members ?? [])
                                .filter(
                                    (m) =>
                                        m.steamId !== state?.profile?.steamId,
                                )
                                .map((m) => ({
                                    value: m.steamId,
                                    label: `Biblioteca de ${m.name}`,
                                })),
                        ]}
                    >
                        <SelectTrigger className="h-8 text-xs bg-black/40 min-w-[140px]">
                            <SelectValue placeholder="Biblioteca" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="">
                                Todas las bibliotecas
                            </SelectItem>
                            <SelectItem value="own">
                                Mis juegos propios
                            </SelectItem>
                            <SelectItem value="shared">
                                Solo compartidos
                            </SelectItem>
                            {(state?.family?.members ?? [])
                                .filter(
                                    (m) =>
                                        m.steamId !== state?.profile?.steamId,
                                )
                                .map((m) => (
                                    <SelectItem
                                        key={m.steamId}
                                        value={m.steamId}
                                    >
                                        Biblioteca de {m.name}
                                    </SelectItem>
                                ))}
                        </SelectContent>
                    </Select>

                    {/* Tags selector */}
                    <Combobox<(typeof steamTags)[number]>
                        value={selectedLibraryTag}
                        items={steamTags}
                        autoHighlight
                        itemToStringLabel={(tag) => tag.label}
                        isItemEqualToValue={(a, b) => a.value === b.value}
                        onValueChange={(tag) => {
                            setLibraryTag(tag?.value ?? '');
                            setLimit(36);
                        }}
                    >
                        <ComboboxInput
                            id="library-tag-filter"
                            className="min-w-[140px] bg-black/40 text-xs"
                            placeholder="Etiqueta"
                            autoComplete="off"
                            showClear
                        />
                        <ComboboxContent>
                            <ComboboxEmpty>
                                No se encontraron etiquetas.
                            </ComboboxEmpty>
                            <ComboboxList>
                                {(tag: (typeof steamTags)[number]) => (
                                    <ComboboxItem key={tag.value} value={tag}>
                                        {tag.label}
                                    </ComboboxItem>
                                )}
                            </ComboboxList>
                        </ComboboxContent>
                    </Combobox>

                    {/* Order by selector */}
                    <Select
                        value={libraryOrderBy}
                        onValueChange={(val) => {
                            setLibraryOrderBy(val as LibraryOrderBy);
                            setLimit(36);
                        }}
                        items={[
                            { value: 'original', label: 'Orden original' },
                            { value: 'name', label: 'Nombre (A-Z)' },
                            {
                                value: 'playtime-most',
                                label: 'Más horas jugadas',
                            },
                            {
                                value: 'playtime-least',
                                label: 'Menos horas jugadas',
                            },
                            {
                                value: 'recent-most',
                                label: 'Más actividad reciente',
                            },
                            {
                                value: 'release-newest',
                                label: 'Lanzamiento: más recientes',
                            },
                            {
                                value: 'release-oldest',
                                label: 'Lanzamiento: más antiguos',
                            },
                            {
                                value: 'duration-shortest',
                                label: 'Duración: más cortos',
                            },
                            {
                                value: 'duration-longest',
                                label: 'Duración: más largos',
                            },
                            { value: 'favorite', label: 'Favoritos primero' },
                        ]}
                    >
                        <SelectTrigger className="h-8 text-xs bg-black/40 min-w-[140px]">
                            <SelectValue placeholder="Ordenar por" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="original">
                                Orden original
                            </SelectItem>
                            <SelectItem value="name">Nombre (A-Z)</SelectItem>
                            <SelectItem value="playtime-most">
                                Más horas jugadas
                            </SelectItem>
                            <SelectItem value="playtime-least">
                                Menos horas jugadas
                            </SelectItem>
                            <SelectItem value="recent-most">
                                Más actividad reciente
                            </SelectItem>
                            <SelectItem value="release-newest">
                                Lanzamiento: más recientes
                            </SelectItem>
                            <SelectItem value="release-oldest">
                                Lanzamiento: más antiguos
                            </SelectItem>
                            <SelectItem value="duration-shortest">
                                Duración: más cortos
                            </SelectItem>
                            <SelectItem value="duration-longest">
                                Duración: más largos
                            </SelectItem>
                            <SelectItem value="favorite">
                                Favoritos primero
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Results Count Summary */}
            <div className="hud-library-count-row">
                <span>
                    Mostrando{' '}
                    <strong>{Math.min(limit, visibleGames.length)}</strong> de{' '}
                    <strong>{visibleGames.length}</strong> juegos{' '}
                    {visibleGames.length !== games.length &&
                        `(de un catálogo de ${games.length})`}
                </span>
            </div>

            {/* 3. CONTENT RENDER: GRID OR LIST */}
            {visibleGames.length === 0 ? (
                <div className="hud-empty-library">
                    <Gamepad2
                        size={40}
                        className="text-muted-foreground mb-3"
                    />
                    <h3 className="text-base font-semibold">
                        {games.length === 0
                            ? 'Tu biblioteca está vacía'
                            : 'No se encontraron juegos'}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 mb-4">
                        {games.length === 0
                            ? 'Conecta tu cuenta de Steam en Ajustes o añade tus primeros juegos manualmente.'
                            : 'Prueba a cambiar los filtros o el texto de búsqueda.'}
                    </p>
                    {games.length === 0 && (
                        <AddGameDialog
                            igdbReady={!!state?.setup.igdb}
                            busy={!!busy || !state}
                            onAdd={async (input) => {
                                await onAdd(input);
                                setQuickFilter('all');
                            }}
                        />
                    )}
                </div>
            ) : viewMode === 'grid' ? (
                <div className="hud-library-grid">
                    {visibleGames.slice(0, limit).map((game) => {
                        const pref = state?.preferences[game.appId] ?? {
                            status: 'pending',
                            favorite: false,
                        };
                        const isSaved = savedIds.has(game.appId);

                        return (
                            <article
                                key={game.appId}
                                className="hud-library-card"
                            >
                                {/* Poster Cover */}
                                <div className="hud-lib-cover-wrap">
                                    {game.cover ? (
                                        <img
                                            src={game.cover}
                                            alt={game.name}
                                            className="hud-lib-cover"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="hud-lib-fallback">
                                            <Gamepad2
                                                size={24}
                                                className="text-muted-foreground"
                                            />
                                        </div>
                                    )}

                                    {/* Top Overlay Badges */}
                                    <div className="hud-lib-overlay-top">
                                        <span className="hud-lib-origin-pill">
                                            {libraryLabel(game)}
                                        </span>
                                        <button
                                            type="button"
                                            className={`hud-lib-fav-btn ${pref.favorite ? 'active' : ''}`}
                                            onClick={() =>
                                                onPreference(game, {
                                                    favorite: !pref.favorite,
                                                })
                                            }
                                            aria-label="Marcar favorito"
                                        >
                                            <Star
                                                size={14}
                                                className={
                                                    pref.favorite
                                                        ? 'fill-current'
                                                        : ''
                                                }
                                            />
                                        </button>
                                    </div>

                                    {(game.hltb?.mainHours ||
                                        game.steamTags?.length) && (
                                        <div className="hud-cover-bottom">
                                            {game.hltb?.mainHours && (
                                                <div className="hud-lib-duration-pill">
                                                    <Clock
                                                        size={10}
                                                        className="mr-1 text-emerald-400"
                                                    />
                                                    <span>
                                                        {formatHours(
                                                            game.hltb.mainHours,
                                                        )}
                                                    </span>
                                                </div>
                                            )}
                                            {!!game.steamTags?.length && (
                                                <div
                                                    className="hud-cover-tags"
                                                    aria-label="Etiquetas"
                                                >
                                                    {game.steamTags
                                                        .slice(0, 4)
                                                        .map((tag) => (
                                                            <span
                                                                key={steamTagKey(
                                                                    tag,
                                                                )}
                                                                className="hud-tag-pill small"
                                                            >
                                                                {tag.name}
                                                            </span>
                                                        ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Details */}
                                <div className="hud-lib-details">
                                    <h4
                                        className="hud-lib-title"
                                        title={game.name}
                                    >
                                        {game.name}
                                    </h4>

                                    <div className="hud-lib-meta-row">
                                        <span>
                                            {game.playtimeMinutes === null
                                                ? 'Sin horas'
                                                : `${(
                                                      game.playtimeMinutes / 60
                                                  ).toLocaleString('es', {
                                                      maximumFractionDigits: 1,
                                                  })}h jugadas`}
                                        </span>
                                        <span
                                            className="hud-status-badge"
                                            data-status={pref.status}
                                        >
                                            {STATUS_LABELS[pref.status]}
                                        </span>
                                    </div>
                                    <HltbBreakdown game={game} />

                                    {/* Actions Bar */}
                                    <div className="hud-lib-actions">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className={`h-7 w-7 ${isSaved ? 'text-amber-400' : 'text-muted-foreground'}`}
                                            onClick={() => onShortlist(game)}
                                            title={
                                                isSaved
                                                    ? 'Quitar de lista corta'
                                                    : 'Añadir a lista corta'
                                            }
                                        >
                                            <Bookmark
                                                size={13}
                                                className={
                                                    isSaved
                                                        ? 'fill-current'
                                                        : ''
                                                }
                                            />
                                        </Button>

                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-[11px] text-muted-foreground hover:text-foreground"
                                            onClick={() => onSimilar(game)}
                                            title="Buscar algo similar"
                                        >
                                            <Sparkles
                                                size={11}
                                                className="mr-1 text-cyan-400"
                                            />
                                            Similar
                                        </Button>

                                        {game.appId > 0 && (
                                            <a
                                                href={steamLaunchUrl(
                                                    game.appId,
                                                )}
                                                className="hud-steam-launch-link ml-auto"
                                                aria-label="Jugar en Steam"
                                                title="Jugar en Steam"
                                            >
                                                <Play
                                                    size={13}
                                                    aria-hidden="true"
                                                />
                                            </a>
                                        )}
                                        <a
                                            href={gameUrl(game)}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="hud-lib-steam-link"
                                            aria-label={
                                                game.appId > 0
                                                    ? `Ver tienda de ${game.name}`
                                                    : `Ver en IGDB: ${game.name}`
                                            }
                                            title={
                                                game.appId > 0
                                                    ? 'Ver tienda'
                                                    : 'Ver en IGDB'
                                            }
                                        >
                                            <ExternalLink size={12} />
                                        </a>
                                        {game.appId < 0 && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-destructive/80 hover:text-destructive"
                                                disabled={!!busy}
                                                onClick={() =>
                                                    confirmRemove(game)
                                                }
                                                title="Borrar de mi biblioteca"
                                                aria-label={`Borrar ${game.name} de mi biblioteca`}
                                            >
                                                <Trash2 size={13} />
                                            </Button>
                                        )}
                                    </div>

                                    {/* Status Dropdown */}
                                    <div className="mt-2 pt-2 border-t border-border/30">
                                        <Select
                                            value={pref.status}
                                            onValueChange={(val) =>
                                                val &&
                                                onPreference(game, {
                                                    status: val as GameStatus,
                                                })
                                            }
                                            items={Object.entries(
                                                STATUS_LABELS,
                                            ).map(([v, l]) => ({
                                                value: v,
                                                label: l,
                                            }))}
                                        >
                                            <SelectTrigger className="h-7 text-[11px] bg-black/40">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {Object.entries(
                                                    STATUS_LABELS,
                                                ).map(([value, label]) => (
                                                    <SelectItem
                                                        key={value}
                                                        value={value}
                                                        className="text-xs"
                                                    >
                                                        {label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <GameOpinion
                                        key={JSON.stringify(pref)}
                                        game={game}
                                        preference={pref}
                                        busy={!!busy}
                                        onSave={(change) =>
                                            onPreference(game, change)
                                        }
                                    />
                                    {tracksSteamAchievements(pref.status) &&
                                        game.appId > 0 && (
                                            <AchievementProgress
                                                game={game}
                                                busy={
                                                    busy ===
                                                    `achievements-${game.appId}`
                                                }
                                                onRefresh={
                                                    onRefreshAchievements
                                                }
                                            />
                                        )}
                                </div>
                            </article>
                        );
                    })}
                </div>
            ) : (
                /* List Mode View */
                <div className="hud-library-table-container">
                    <table className="hud-library-table">
                        <thead>
                            <tr>
                                <th className="w-10"></th>
                                <th>Juego</th>
                                <th>Biblioteca</th>
                                <th>Horas jugadas</th>
                                <th>Duración HLTB</th>
                                <th>Estado</th>
                                <th className="text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleGames.slice(0, limit).map((game) => {
                                const pref = state?.preferences[game.appId] ?? {
                                    status: 'pending',
                                    favorite: false,
                                };
                                const isSaved = savedIds.has(game.appId);

                                return (
                                    <tr key={game.appId}>
                                        <td className="text-center">
                                            <button
                                                type="button"
                                                className={`hud-lib-fav-btn inline ${pref.favorite ? 'active' : ''}`}
                                                onClick={() =>
                                                    onPreference(game, {
                                                        favorite:
                                                            !pref.favorite,
                                                    })
                                                }
                                                aria-label="Favorito"
                                            >
                                                <Star
                                                    size={14}
                                                    className={
                                                        pref.favorite
                                                            ? 'fill-current'
                                                            : ''
                                                    }
                                                />
                                            </button>
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-2.5">
                                                {game.cover ? (
                                                    <img
                                                        src={game.cover}
                                                        alt=""
                                                        className="w-10 h-6 object-cover rounded"
                                                        loading="lazy"
                                                    />
                                                ) : (
                                                    <div className="w-10 h-6 bg-black/40 rounded flex items-center justify-center">
                                                        <Gamepad2
                                                            size={12}
                                                            className="text-muted-foreground"
                                                        />
                                                    </div>
                                                )}
                                                <div>
                                                    <span className="font-semibold text-foreground text-xs">
                                                        {game.name}
                                                    </span>
                                                    {tracksSteamAchievements(
                                                        pref.status,
                                                    ) &&
                                                        game.appId > 0 && (
                                                            <span className="ml-2 text-[10px] text-amber-300">
                                                                <Trophy
                                                                    size={10}
                                                                    className="mr-0.5 inline"
                                                                />
                                                                {game.steamAchievements
                                                                    ? `${game.steamAchievements.unlocked}/${game.steamAchievements.total}`
                                                                    : 'logros pendientes'}
                                                            </span>
                                                        )}
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <span className="hud-lib-origin-pill text-[10px]">
                                                {libraryLabel(game)}
                                            </span>
                                        </td>
                                        <td className="text-xs text-muted-foreground">
                                            {game.playtimeMinutes === null
                                                ? '—'
                                                : `${(
                                                      game.playtimeMinutes / 60
                                                  ).toLocaleString('es', {
                                                      maximumFractionDigits: 1,
                                                  })} h`}
                                        </td>
                                        <td className="text-xs text-muted-foreground">
                                            {game.hltb ? (
                                                <HltbBreakdown game={game} />
                                            ) : (
                                                '—'
                                            )}
                                        </td>
                                        <td>
                                            <span
                                                className="hud-status-badge"
                                                data-status={pref.status}
                                            >
                                                {STATUS_LABELS[pref.status]}
                                            </span>
                                        </td>
                                        <td className="text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className={`h-7 w-7 ${isSaved ? 'text-amber-400' : 'text-muted-foreground'}`}
                                                    onClick={() =>
                                                        onShortlist(game)
                                                    }
                                                    title={
                                                        isSaved
                                                            ? 'Quitar de lista corta'
                                                            : 'Añadir a lista corta'
                                                    }
                                                >
                                                    <Bookmark
                                                        size={13}
                                                        className={
                                                            isSaved
                                                                ? 'fill-current'
                                                                : ''
                                                        }
                                                    />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 text-[11px]"
                                                    onClick={() =>
                                                        onSimilar(game)
                                                    }
                                                >
                                                    Similar
                                                </Button>
                                                {game.appId > 0 && (
                                                    <a
                                                        href={steamLaunchUrl(
                                                            game.appId,
                                                        )}
                                                        className="hud-steam-launch-link"
                                                        aria-label="Jugar en Steam"
                                                        title="Jugar en Steam"
                                                    >
                                                        <Play
                                                            size={13}
                                                            aria-hidden="true"
                                                        />
                                                    </a>
                                                )}
                                                <a
                                                    href={gameUrl(game)}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="hud-lib-steam-link"
                                                    aria-label={
                                                        game.appId > 0
                                                            ? `Ver tienda de ${game.name}`
                                                            : `Ver en IGDB: ${game.name}`
                                                    }
                                                    title={
                                                        game.appId > 0
                                                            ? 'Ver tienda'
                                                            : 'Ver en IGDB'
                                                    }
                                                >
                                                    <ExternalLink size={12} />
                                                </a>
                                                {game.appId < 0 && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 text-destructive/80 hover:text-destructive"
                                                        disabled={!!busy}
                                                        onClick={() =>
                                                            confirmRemove(game)
                                                        }
                                                        title="Borrar de mi biblioteca"
                                                        aria-label={`Borrar ${game.name} de mi biblioteca`}
                                                    >
                                                        <Trash2 size={13} />
                                                    </Button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* 4. INFINITE SCROLL SENTINEL */}
            {visibleGames.length > limit && (
                <div
                    ref={loadMoreRef}
                    className="flex justify-center mt-6 min-h-8"
                    aria-live="polite"
                >
                    <span className="text-xs text-muted-foreground">
                        Cargando más juegos…
                    </span>
                </div>
            )}
        </div>
    );
}
