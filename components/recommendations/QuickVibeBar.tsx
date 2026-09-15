'use client';

import { useState } from 'react';
import {
    Clock3,
    Sparkles,
    Dices,
    SlidersHorizontal,
    X,
    Compass,
    Smile,
    Swords,
    Users,
    BookOpen,
    ArrowRight,
    LoaderCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet';
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
import { clearFilters } from '@/lib/filters';
import type { Filters, RecommendationEngine, State } from '@/lib/model';

export function QuickVibeBar({
    filters,
    setFilters,
    filterCounts,
    genres,
    steamTags,
    tagLabels,
    onRecommend,
    onSurpriseMe,
    canRecommend,
    busy,
    engine,
    savedGamesCount,
}: {
    filters: Filters;
    setFilters: (filters: Filters) => void;
    filterCounts: {
        eligible: number;
        total: number;
        missing: number;
        relaxedTags?: boolean;
    } | null;
    genres: string[];
    steamTags: { value: string; label: string }[];
    tagLabels: Map<string, string>;
    onRecommend: () => void;
    onSurpriseMe: () => void;
    canRecommend: boolean;
    busy: string;
    engine: RecommendationEngine;
    savedGamesCount: number;
}) {
    const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);
    const [tagSearch, setTagSearch] = useState('');
    const [tagsMenuOpen, setTagsMenuOpen] = useState(false);

    const selectedTagKeys = filters.tags ?? [];
    const availableSteamTags = steamTags.filter(
        (tag) => !selectedTagKeys.includes(tag.value),
    );

    const activeFilterChips: { label: string; patch: Partial<Filters> }[] = [
        ...(filters.shortlistOnly
            ? [{ label: 'Solo lista corta', patch: { shortlistOnly: false } }]
            : []),
        ...(filters.comfortZone
            ? [
                  {
                      label: 'Zona de confort activa',
                      patch: { comfortZone: false },
                  },
              ]
            : []),
        ...(filters.mode === 'today' &&
        filters.sessionIntent &&
        filters.sessionIntent !== 'any'
            ? [
                  {
                      label:
                          filters.sessionIntent === 'continue'
                              ? 'Continuar partida'
                              : 'Empezar nuevo',
                      patch: { sessionIntent: 'any' as const },
                  },
              ]
            : []),
        ...(filters.mode === 'next' && filters.hours !== null
            ? [
                  {
                      label: `Historia ≤ ${filters.hours}h`,
                      patch: { hours: null },
                  },
              ]
            : []),
        ...(filters.mode === 'today' && filters.minutes !== null
            ? [
                  {
                      label: `${filters.minutes} min sesión`,
                      patch: { minutes: null },
                  },
              ]
            : []),
        ...(filters.minReleaseDate
            ? [
                  {
                      label: `Desde ${filters.minReleaseDate}`,
                      patch: { minReleaseDate: null },
                  },
              ]
            : []),
        ...(filters.genre
            ? [{ label: filters.genre, patch: { genre: '' } }]
            : []),
        ...(filters.gameMode
            ? [
                  {
                      label:
                          {
                              single: 'En solitario',
                              coop: 'Cooperativo',
                              multi: 'Multijugador',
                          }[filters.gameMode] ?? filters.gameMode,
                      patch: { gameMode: '' },
                  },
              ]
            : []),
        ...selectedTagKeys.map((key) => ({
            label: tagLabels.get(key) ?? key,
            patch: { tags: selectedTagKeys.filter((tag) => tag !== key) },
        })),
        ...(!filters.replay
            ? [{ label: 'Sin terminados/abandonados', patch: { replay: true } }]
            : []),
        ...(engine === 'codex' && filters.mood.trim()
            ? [{ label: `Ánimo: "${filters.mood}"`, patch: { mood: '' } }]
            : []),
    ];

    const quickMoods = [
        {
            label: 'Relax / Desconectar',
            mood: 'Algo tranquilo y relajante, sin prisas ni estrés',
            icon: Smile,
        },
        {
            label: 'Historia profunda',
            mood: 'Una gran historia absorbente con buena narrativa',
            icon: BookOpen,
        },
        {
            label: 'Acción / Reto',
            mood: 'Acción directa, dinámico y desafiante',
            icon: Swords,
        },
        {
            label: 'Para cooperativo',
            mood: 'Ideal para jugar en cooperativo',
            icon: Users,
        },
    ];

    function addTagFilter(tag: (typeof steamTags)[number]) {
        if (!selectedTagKeys.includes(tag.value)) {
            setFilters({ ...filters, tags: [...selectedTagKeys, tag.value] });
        }
        setTagSearch('');
    }

    return (
        <div className="hud-quick-vibe-container">
            {/* 1. TOP MODE SWITCHER + ROULETTE + ADVANCED FILTERS */}
            <div className="hud-controls-header">
                <div className="hud-mode-segmented">
                    <button
                        type="button"
                        className={`hud-mode-btn ${filters.mode === 'today' ? 'active' : ''}`}
                        onClick={() =>
                            setFilters({ ...filters, mode: 'today' })
                        }
                    >
                        <Clock3 size={15} />
                        <span>Para hoy</span>
                    </button>
                    <button
                        type="button"
                        className={`hud-mode-btn ${filters.mode === 'next' ? 'active' : ''}`}
                        onClick={() => setFilters({ ...filters, mode: 'next' })}
                    >
                        <Sparkles size={15} />
                        <span>Próximo juego</span>
                    </button>
                </div>

                <div className="hud-header-tools">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onSurpriseMe}
                        disabled={!canRecommend || !!busy}
                        className="hud-roulette-btn"
                        title="Elegir una partida al azar entre tus pendientes de alta afinidad"
                    >
                        <Dices size={16} className="text-amber-400 mr-1.5" />
                        <span>Sorpréndeme</span>
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        className="hud-filters-btn"
                        onClick={() => setFiltersSheetOpen(true)}
                    >
                        <SlidersHorizontal size={14} className="mr-1.5" />
                        <span>Filtros</span>
                        {activeFilterChips.length > 0 && (
                            <span className="hud-filter-count-badge">
                                {activeFilterChips.length}
                            </span>
                        )}
                    </Button>

                    <Sheet
                        open={filtersSheetOpen}
                        onOpenChange={setFiltersSheetOpen}
                    >
                        <SheetContent
                            side="right"
                            className="hud-filters-sheet p-6 sm:max-w-md"
                        >
                            <SheetHeader>
                                <SheetTitle className="flex items-center gap-2">
                                    <SlidersHorizontal
                                        size={18}
                                        className="text-emerald-400"
                                    />
                                    <span>Filtros de Recomendación</span>
                                </SheetTitle>
                                <SheetDescription className="text-xs">
                                    Ajusta los criterios de selección para tu
                                    biblioteca.
                                </SheetDescription>
                            </SheetHeader>

                            <div className="space-y-4 py-4 overflow-y-auto max-h-[calc(100vh-140px)] pr-1">
                                {/* Mode intent */}
                                {filters.mode === 'today' && (
                                    <div>
                                        <label className="text-xs font-semibold text-foreground mb-1 block">
                                            ¿Qué tipo de sesión buscas?
                                        </label>
                                        <Select
                                            value={
                                                filters.sessionIntent ?? 'any'
                                            }
                                            onValueChange={(val) =>
                                                setFilters({
                                                    ...filters,
                                                    sessionIntent:
                                                        val as Filters['sessionIntent'],
                                                })
                                            }
                                            items={[
                                                {
                                                    value: 'any',
                                                    label: 'Cualquiera (empezar o continuar)',
                                                },
                                                {
                                                    value: 'continue',
                                                    label: 'Continuar partida en curso o pausa',
                                                },
                                                {
                                                    value: 'start',
                                                    label: 'Empezar un juego pendiente',
                                                },
                                            ]}
                                        >
                                            <SelectTrigger className="w-full bg-black/30">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="any">
                                                    Cualquiera (empezar o
                                                    continuar)
                                                </SelectItem>
                                                <SelectItem value="continue">
                                                    Continuar partida en curso o
                                                    pausa
                                                </SelectItem>
                                                <SelectItem value="start">
                                                    Empezar un juego pendiente
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}

                                {/* Genre */}
                                <div>
                                    <label className="text-xs font-semibold text-foreground mb-1 block">
                                        Género
                                    </label>
                                    <Select
                                        value={filters.genre}
                                        onValueChange={(val) =>
                                            setFilters({
                                                ...filters,
                                                genre: val ?? '',
                                            })
                                        }
                                        items={[
                                            {
                                                value: '',
                                                label: 'Cualquier género',
                                            },
                                            ...genres.map((g) => ({
                                                value: g,
                                                label: g,
                                            })),
                                        ]}
                                    >
                                        <SelectTrigger className="w-full bg-black/30">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="">
                                                Cualquier género
                                            </SelectItem>
                                            {genres.map((g) => (
                                                <SelectItem key={g} value={g}>
                                                    {g}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Game Mode */}
                                <div>
                                    <label className="text-xs font-semibold text-foreground mb-1 block">
                                        Modalidad
                                    </label>
                                    <Select
                                        value={filters.gameMode}
                                        onValueChange={(val) =>
                                            setFilters({
                                                ...filters,
                                                gameMode: val ?? '',
                                            })
                                        }
                                        items={[
                                            {
                                                value: '',
                                                label: 'Sin preferencia',
                                            },
                                            {
                                                value: 'single',
                                                label: 'En solitario',
                                            },
                                            {
                                                value: 'coop',
                                                label: 'En cooperativo',
                                            },
                                            {
                                                value: 'multi',
                                                label: 'Multijugador',
                                            },
                                        ]}
                                    >
                                        <SelectTrigger className="w-full bg-black/30">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="">
                                                Sin preferencia
                                            </SelectItem>
                                            <SelectItem value="single">
                                                En solitario
                                            </SelectItem>
                                            <SelectItem value="coop">
                                                En cooperativo
                                            </SelectItem>
                                            <SelectItem value="multi">
                                                Multijugador
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Steam Tags Autocomplete */}
                                <div className="space-y-2">
                                    <label
                                        htmlFor="hud-tags-input"
                                        className="text-xs font-semibold text-foreground block"
                                    >
                                        Etiquetas de Steam
                                    </label>
                                    <Combobox<(typeof steamTags)[number]>
                                        items={availableSteamTags}
                                        value={null}
                                        inputValue={tagSearch}
                                        open={tagsMenuOpen}
                                        autoHighlight
                                        onOpenChange={setTagsMenuOpen}
                                        itemToStringLabel={(tag) => tag.label}
                                        onValueChange={(tag) => {
                                            if (tag) addTagFilter(tag);
                                        }}
                                        onInputValueChange={(
                                            value,
                                            details,
                                        ) => {
                                            setTagSearch(value);
                                            if (
                                                details.reason ===
                                                    'input-change' ||
                                                details.reason ===
                                                    'input-clear' ||
                                                details.reason === 'clear-press'
                                            ) {
                                                setTagsMenuOpen(true);
                                            }
                                        }}
                                    >
                                        <ComboboxInput
                                            id="hud-tags-input"
                                            placeholder="Buscar una etiqueta…"
                                            autoComplete="off"
                                            showClear
                                        />
                                        <ComboboxContent>
                                            <ComboboxEmpty>
                                                {tagSearch.trim()
                                                    ? 'No hay etiquetas que coincidan.'
                                                    : 'Escribe para buscar etiquetas.'}
                                            </ComboboxEmpty>
                                            <ComboboxList>
                                                {(
                                                    tag: (typeof steamTags)[number],
                                                ) => (
                                                    <ComboboxItem
                                                        key={tag.value}
                                                        value={tag}
                                                    >
                                                        {tag.label}
                                                    </ComboboxItem>
                                                )}
                                            </ComboboxList>
                                        </ComboboxContent>
                                    </Combobox>
                                    <p className="text-[11px] text-muted-foreground">
                                        Escribe para filtrar y selecciona una
                                        etiqueta o pulsa Enter.
                                    </p>

                                    {selectedTagKeys.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {selectedTagKeys.map((key) => (
                                                <span
                                                    key={key}
                                                    className="hud-filter-tag"
                                                >
                                                    {tagLabels.get(key) ?? key}
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setFilters({
                                                                ...filters,
                                                                tags: selectedTagKeys.filter(
                                                                    (t) =>
                                                                        t !==
                                                                        key,
                                                                ),
                                                            })
                                                        }
                                                        aria-label={`Quitar etiqueta ${tagLabels.get(key) ?? key}`}
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Min Release Date */}
                                <div>
                                    <label
                                        htmlFor="hud-release-date"
                                        className="text-xs font-semibold text-foreground mb-1 block"
                                    >
                                        Lanzamiento a partir de
                                    </label>
                                    <Input
                                        id="hud-release-date"
                                        type="date"
                                        value={filters.minReleaseDate ?? ''}
                                        onChange={(e) =>
                                            setFilters({
                                                ...filters,
                                                minReleaseDate:
                                                    e.target.value || null,
                                            })
                                        }
                                        className="bg-black/30"
                                    />
                                </div>

                                {/* Checkboxes */}
                                <div className="space-y-2.5 pt-2 border-t border-border/50">
                                    <label className="flex items-center gap-2 text-xs cursor-pointer text-foreground">
                                        <Checkbox
                                            checked={!!filters.comfortZone}
                                            onCheckedChange={(v) =>
                                                setFilters({
                                                    ...filters,
                                                    comfortZone: !!v,
                                                })
                                            }
                                        />
                                        <span>
                                            Sácame de mi zona de confort
                                            (propuestas audaces)
                                        </span>
                                    </label>

                                    <label className="flex items-center gap-2 text-xs cursor-pointer text-foreground">
                                        <Checkbox
                                            checked={filters.replay}
                                            onCheckedChange={(v) =>
                                                setFilters({
                                                    ...filters,
                                                    replay: !!v,
                                                })
                                            }
                                        />
                                        <span>
                                            Incluir juegos ya terminados o
                                            abandonados
                                        </span>
                                    </label>

                                    <label className="flex items-center gap-2 text-xs cursor-pointer text-foreground">
                                        <Checkbox
                                            checked={!!filters.shortlistOnly}
                                            onCheckedChange={(v) =>
                                                setFilters({
                                                    ...filters,
                                                    shortlistOnly: !!v,
                                                })
                                            }
                                        />
                                        <span>
                                            Solo mi lista corta (
                                            {savedGamesCount} candidatos)
                                        </span>
                                    </label>
                                </div>

                                {/* Clear filters */}
                                <div className="pt-3">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="w-full text-muted-foreground hover:text-foreground"
                                        onClick={() => {
                                            setFilters(
                                                clearFilters(filters.mode),
                                            );
                                            setTagSearch('');
                                        }}
                                    >
                                        Limpiar todos los filtros
                                    </Button>
                                </div>
                            </div>
                        </SheetContent>
                    </Sheet>
                </div>
            </div>

            {/* 2. DYNAMIC TIME PRESETS */}
            <div className="hud-preset-row">
                <span className="hud-row-label">
                    {filters.mode === 'today' ? 'Tiempo hoy:' : 'Duración max:'}
                </span>

                {filters.mode === 'today' ? (
                    <div className="hud-pill-selector">
                        {[
                            { label: '30m', val: 30 },
                            { label: '45m', val: 45 },
                            { label: '60m', val: 60 },
                            { label: '90m', val: 90 },
                            { label: '2h', val: 120 },
                            { label: 'Sin límite', val: null },
                        ].map(({ label, val }) => (
                            <button
                                key={label}
                                type="button"
                                className={`hud-chip ${filters.minutes === val ? 'active' : ''}`}
                                onClick={() =>
                                    setFilters({ ...filters, minutes: val })
                                }
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="hud-pill-selector">
                        {[
                            { label: '≤ 10h', val: 10 },
                            { label: '≤ 20h', val: 20 },
                            { label: '≤ 40h', val: 40 },
                            { label: 'Sin límite', val: null },
                        ].map(({ label, val }) => (
                            <button
                                key={label}
                                type="button"
                                className={`hud-chip ${filters.hours === val ? 'active' : ''}`}
                                onClick={() =>
                                    setFilters({ ...filters, hours: val })
                                }
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* 3. QUICK VIBE PILLS */}
            {engine === 'codex' && (
                <div className="hud-preset-row">
                    <span className="hud-row-label">Vibra:</span>
                    <div className="hud-pill-selector flex-wrap">
                        {quickMoods.map(({ label, mood, icon: Icon }) => (
                            <button
                                key={label}
                                type="button"
                                className={`hud-chip vibe ${filters.mood === mood ? 'active' : ''}`}
                                onClick={() =>
                                    setFilters({
                                        ...filters,
                                        mood: filters.mood === mood ? '' : mood,
                                    })
                                }
                            >
                                <Icon size={12} className="mr-1" />
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* 4. ACTIVE FILTER CHIPS & STATS & CTA */}
            <div className="hud-cta-strip">
                <div className="hud-active-chips-area">
                    {activeFilterChips.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                            {activeFilterChips.map(
                                ({ label, patch }, index) => (
                                    <span
                                        key={index}
                                        className="hud-filter-tag active"
                                    >
                                        {label}
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setFilters({
                                                    ...filters,
                                                    ...patch,
                                                })
                                            }
                                            aria-label={`Quitar filtro ${label}`}
                                        >
                                            <X size={11} />
                                        </button>
                                    </span>
                                ),
                            )}
                            <button
                                type="button"
                                className="text-xs text-muted-foreground hover:text-foreground underline ml-1"
                                onClick={() =>
                                    setFilters(clearFilters(filters.mode))
                                }
                            >
                                Limpiar
                            </button>
                        </div>
                    ) : (
                        <span className="text-xs text-muted-foreground">
                            {filterCounts
                                ? `${filterCounts.eligible} de ${filterCounts.total} juegos cumplen los criterios`
                                : 'Sin filtros restrictivos'}
                        </span>
                    )}
                </div>

                <Button
                    size="lg"
                    onClick={onRecommend}
                    disabled={!canRecommend || !!busy}
                    className="hud-main-recommend-btn"
                >
                    {busy === 'recommend' ? (
                        <LoaderCircle className="spin mr-2" size={18} />
                    ) : (
                        <Sparkles size={18} className="mr-2" />
                    )}
                    <span>
                        {busy === 'recommend'
                            ? 'Buscando tu próxima partida…'
                            : 'Encuentra mi próximo juego'}
                    </span>
                    <ArrowRight size={17} className="ml-2 hud-btn-arrow" />
                </Button>
            </div>
        </div>
    );
}
