'use client';

import { translate as t } from '@/lib/i18n';
import { useLanguage } from '@/components/header/LanguageSelector';

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
    Square,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Sheet,
    SheetContent,
    SheetClose,
    SheetFooter,
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
import type {
    ConversationMode,
    Filters,
    RecommendationEngine,
    State,
} from '@/lib/model';

export function QuickVibeBar({
    filters,
    setFilters,
    filterCounts,
    genres,
    steamTags,
    tagLabels,
    onRecommend,
    onStop,
    onSurpriseMe,
    canRecommend,
    busy,
    engine,
    savedGamesCount,
    conversationMode,
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
    onStop: () => void;
    onSurpriseMe: () => void;
    canRecommend: boolean;
    busy: string;
    engine: RecommendationEngine;
    savedGamesCount: number;
    conversationMode: ConversationMode;
}) {
    useLanguage();
    const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);
    const [tagSearch, setTagSearch] = useState('');
    const [tagsMenuOpen, setTagsMenuOpen] = useState(false);

    const selectedTagKeys = filters.tags ?? [];
    const availableSteamTags = steamTags.filter(
        (tag) => !selectedTagKeys.includes(tag.value),
    );

    const activeFilterChips: { label: string; patch: Partial<Filters> }[] = [
        ...(filters.shortlistOnly
            ? [
                  {
                      label: t('Solo lista corta'),
                      patch: { shortlistOnly: false },
                  },
              ]
            : []),
        ...(filters.comfortZone
            ? [
                  {
                      label: t('Zona de confort activa'),
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
                              ? t('Continuar partida')
                              : t('Empezar nuevo'),
                      patch: { sessionIntent: 'any' as const },
                  },
              ]
            : []),
        ...(filters.mode === 'next' && filters.hours !== null
            ? [
                  {
                      label: `${t('Historia ≤ ')}${filters.hours}h`,
                      patch: { hours: null },
                  },
              ]
            : []),
        ...(filters.mode === 'today' && filters.minutes !== null
            ? [
                  {
                      label: `${filters.minutes}${t(' min sesión')}`,
                      patch: { minutes: null },
                  },
              ]
            : []),
        ...(filters.minReleaseDate
            ? [
                  {
                      label: `${t('Desde ')}${filters.minReleaseDate}`,
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
                              single: t('En solitario'),
                              coop: t('Cooperativo'),
                              multi: t('Multijugador'),
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
            ? [
                  {
                      label: t('Sin terminados/abandonados'),
                      patch: { replay: true },
                  },
              ]
            : []),
        ...(engine === 'codex' && filters.mood.trim()
            ? [
                  {
                      label: `${t('Ánimo: "')}${filters.mood}"`,
                      patch: { mood: '' },
                  },
              ]
            : []),
    ];

    const quickMoods = [
        {
            label: t('Relax / Desconectar'),
            mood: t('Algo tranquilo y relajante, sin prisas ni estrés'),
            icon: Smile,
        },
        {
            label: t('Historia profunda'),
            mood: t('Una gran historia absorbente con buena narrativa'),
            icon: BookOpen,
        },
        {
            label: t('Acción / Reto'),
            mood: t('Acción directa, dinámico y desafiante'),
            icon: Swords,
        },
        {
            label: t('Para cooperativo'),
            mood: t('Ideal para jugar en cooperativo'),
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
                        <span>{t('Para hoy')}</span>
                    </button>
                    <button
                        type="button"
                        className={`hud-mode-btn ${filters.mode === 'next' ? 'active' : ''}`}
                        onClick={() => setFilters({ ...filters, mode: 'next' })}
                    >
                        <Sparkles size={15} />
                        <span>{t('Próximo juego')}</span>
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
                        title={t(
                            'Elegir una partida al azar entre tus pendientes de alta afinidad',
                        )}
                    >
                        <Dices size={16} className="text-amber-400 mr-1.5" />
                        <span>{t('Sorpréndeme')}</span>
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        className="hud-filters-btn"
                        onClick={() => setFiltersSheetOpen(true)}
                    >
                        <SlidersHorizontal size={14} className="mr-1.5" />
                        <span>{t('Filtros')}</span>
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
                            className="hud-filters-sheet sm:max-w-md"
                        >
                            <SheetHeader>
                                <SheetTitle className="flex items-center gap-2">
                                    <SlidersHorizontal
                                        size={18}
                                        className="text-emerald-400"
                                    />
                                    <span>{t('Filtros de recomendación')}</span>
                                </SheetTitle>
                                <SheetDescription className="text-xs">
                                    {t(
                                        'Todos los criterios en un único lugar. ',
                                    )}
                                </SheetDescription>
                            </SheetHeader>

                            <div className="hud-filters-dialog-body space-y-4 py-4 overflow-y-auto max-h-[calc(100vh-140px)] pr-1">
                                {/* Mode intent */}
                                {filters.mode === 'today' && (
                                    <div className="hud-filter-field">
                                        <label className="text-xs font-semibold text-foreground mb-1 block">
                                            {t('¿Qué tipo de sesión buscas? ')}
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
                                                    label: t(
                                                        'Cualquiera (empezar o continuar)',
                                                    ),
                                                },
                                                {
                                                    value: 'continue',
                                                    label: t(
                                                        'Continuar partida en curso o pausa',
                                                    ),
                                                },
                                                {
                                                    value: 'start',
                                                    label: t(
                                                        'Empezar un juego pendiente',
                                                    ),
                                                },
                                            ]}
                                        >
                                            <SelectTrigger className="w-full bg-black/30">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="any">
                                                    {t(
                                                        'Cualquiera (empezar o continuar) ',
                                                    )}
                                                </SelectItem>
                                                <SelectItem value="continue">
                                                    {t(
                                                        'Continuar partida en curso o pausa ',
                                                    )}
                                                </SelectItem>
                                                <SelectItem value="start">
                                                    {t(
                                                        'Empezar un juego pendiente ',
                                                    )}
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}

                                {/* Genre */}
                                <div className="hud-filter-field">
                                    <label className="text-xs font-semibold text-foreground mb-1 block">
                                        {t('Género ')}
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
                                                label: t('Cualquier género'),
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
                                                {t('Cualquier género ')}
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
                                <div className="hud-filter-field">
                                    <label className="text-xs font-semibold text-foreground mb-1 block">
                                        {t('Modalidad ')}
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
                                                label: t('Sin preferencia'),
                                            },
                                            {
                                                value: 'single',
                                                label: t('En solitario'),
                                            },
                                            {
                                                value: 'coop',
                                                label: t('En cooperativo'),
                                            },
                                            {
                                                value: 'multi',
                                                label: t('Multijugador'),
                                            },
                                        ]}
                                    >
                                        <SelectTrigger className="w-full bg-black/30">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="">
                                                {t('Sin preferencia ')}
                                            </SelectItem>
                                            <SelectItem value="single">
                                                {t('En solitario ')}
                                            </SelectItem>
                                            <SelectItem value="coop">
                                                {t('En cooperativo ')}
                                            </SelectItem>
                                            <SelectItem value="multi">
                                                {t('Multijugador ')}
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Steam Tags Autocomplete */}
                                <div className="hud-filter-tags space-y-2">
                                    <label
                                        htmlFor="hud-tags-input"
                                        className="text-xs font-semibold text-foreground block"
                                    >
                                        {t('Etiquetas de Steam ')}
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
                                            placeholder={t(
                                                'Buscar una etiqueta…',
                                            )}
                                            autoComplete="off"
                                            showClear
                                        />
                                        <ComboboxContent>
                                            <ComboboxEmpty>
                                                {tagSearch.trim()
                                                    ? t(
                                                          'No hay etiquetas que coincidan.',
                                                      )
                                                    : t(
                                                          'Escribe para buscar etiquetas.',
                                                      )}
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
                                        {t(
                                            'Escribe para filtrar y selecciona una etiqueta o pulsa Enter. ',
                                        )}
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
                                                        aria-label={`${t('Quitar etiqueta ')}${tagLabels.get(key) ?? key}`}
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Min Release Date */}
                                <div className="hud-filter-field">
                                    <label
                                        htmlFor="hud-release-date"
                                        className="text-xs font-semibold text-foreground mb-1 block"
                                    >
                                        {t('Lanzamiento a partir de ')}
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
                                <div className="hud-filter-options space-y-2.5 pt-2 border-t border-border/50">
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
                                            {t(
                                                'Sácame de mi zona de confort (propuestas audaces) ',
                                            )}
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
                                            {t(
                                                'Incluir juegos ya terminados o abandonados ',
                                            )}
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
                                            {t('Solo mi lista corta ( ')}
                                            {savedGamesCount}{' '}
                                            {t('candidatos) ')}
                                        </span>
                                    </label>
                                </div>
                            </div>
                            <SheetFooter className="hud-filters-footer">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="hud-filters-clear w-full sm:w-auto"
                                    onClick={() => {
                                        setFilters(clearFilters(filters.mode));
                                        setTagSearch('');
                                    }}
                                >
                                    {t('Limpiar filtros ')}
                                </Button>
                                <SheetClose
                                    render={
                                        <Button className="hud-filters-done w-full sm:w-auto">
                                            {t('Listo ')}
                                        </Button>
                                    }
                                />
                            </SheetFooter>
                        </SheetContent>
                    </Sheet>
                </div>
            </div>

            {/* 2. DYNAMIC TIME PRESETS */}
            <div className="hud-preset-row">
                <span className="hud-row-label">
                    {filters.mode === 'today'
                        ? t('Tiempo hoy:')
                        : t('Duración max:')}
                </span>

                {filters.mode === 'today' ? (
                    <div className="hud-pill-selector">
                        {[
                            { label: '30m', val: 30 },
                            { label: '45m', val: 45 },
                            { label: '60m', val: 60 },
                            { label: '90m', val: 90 },
                            { label: '2h', val: 120 },
                            { label: t('Sin límite'), val: null },
                        ].map(({ label, val }) => (
                            <button
                                key={t(label)}
                                type="button"
                                className={`hud-chip ${filters.minutes === val ? 'active' : ''}`}
                                onClick={() =>
                                    setFilters({ ...filters, minutes: val })
                                }
                            >
                                {t(label)}
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="hud-pill-selector">
                        {[
                            { label: '≤ 10h', val: 10 },
                            { label: '≤ 20h', val: 20 },
                            { label: '≤ 40h', val: 40 },
                            { label: t('Sin límite'), val: null },
                        ].map(({ label, val }) => (
                            <button
                                key={t(label)}
                                type="button"
                                className={`hud-chip ${filters.hours === val ? 'active' : ''}`}
                                onClick={() =>
                                    setFilters({ ...filters, hours: val })
                                }
                            >
                                {t(label)}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* 3. QUICK VIBE PILLS */}
            {engine === 'codex' && (
                <div className="hud-preset-row">
                    <span className="hud-row-label">{t('Vibra:')}</span>
                    <div className="hud-pill-selector flex-wrap">
                        {quickMoods.map(({ label, mood, icon: Icon }) => (
                            <button
                                key={t(label)}
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
                                {t(label)}
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
                                        {t(label)}
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setFilters({
                                                    ...filters,
                                                    ...patch,
                                                })
                                            }
                                            aria-label={`${t('Quitar filtro ')}${label}`}
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
                                {t('Limpiar ')}
                            </button>
                        </div>
                    ) : (
                        <span className="text-xs text-muted-foreground">
                            {filterCounts
                                ? `${filterCounts.eligible}${t(' de ')}${filterCounts.total}${t(' juegos cumplen los criterios')}`
                                : t('Sin filtros restrictivos')}
                        </span>
                    )}
                </div>

                <Button
                    size="lg"
                    onClick={busy === 'recommend' ? onStop : onRecommend}
                    disabled={busy ? busy !== 'recommend' : !canRecommend}
                    className="hud-main-recommend-btn"
                >
                    {busy === 'recommend' ? (
                        <Square className="mr-2" size={16} />
                    ) : (
                        <Sparkles size={18} className="mr-2" />
                    )}
                    <span>
                        {busy === 'recommend'
                            ? t('Parar búsqueda')
                            : engine === 'codex' &&
                                conversationMode === 'guided'
                              ? t('Afinar con preguntas')
                              : t('Encuentra mi próximo juego')}
                    </span>
                    {busy !== 'recommend' && (
                        <ArrowRight size={17} className="ml-2 hud-btn-arrow" />
                    )}
                </Button>
            </div>
        </div>
    );
}
