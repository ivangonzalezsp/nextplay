'use client';

import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import Tastes from './tastes';
import GameOpinion from './opinion';
import { TopBar } from '@/components/header/TopBar';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { AppSetup } from '@/components/settings/AppSetup';
import { QuickVibeBar } from '@/components/recommendations/QuickVibeBar';
import { HeroSpotlight } from '@/components/recommendations/HeroSpotlight';
import { GameCard } from '@/components/recommendations/GameCard';
import { CopilotBar } from '@/components/ai/CopilotBar';
import {
    AchievementProgress,
    LibraryView,
} from '@/components/library/LibraryView';
import type { AddGameInput } from '@/components/library/AddGameDialog';
import { PlayHistory } from '@/components/library/PlayHistory';

import {
    Gamepad2,
    Library,
    History,
    Sparkles,
    Clock3,
    Star,
    RefreshCw,
    SlidersHorizontal,
    MessageCircle,
    Check,
    Plus,
    RotateCcw,
    AlertCircle,
    LoaderCircle,
    Bookmark,
    ExternalLink,
    Flame,
    X,
    Play,
    ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

import {
    DEFAULT_FILTERS,
    DEFAULT_CODEX_SETTINGS,
    STATUS_LABELS,
    gameUrl,
    inLibrary,
    libraryLabel,
    sortLibraryGames,
    steamTagKey,
} from '@/lib/model';
import { filterSummary } from '@/lib/filters';
import { log, logError } from '@/lib/log';
import type {
    CodexSettings,
    Filters,
    Game,
    GameStatus,
    LibraryOrderBy,
    Preference,
    Recommendation,
    RecommendationEngine,
    RecommendationProgress,
    RecommendationStreamFrame,
    Snapshot,
} from '@/lib/model';

async function api(path: string, body?: unknown, method = 'POST') {
    const request = {
        method: body === undefined ? 'GET' : method,
        path: '/api/' + path,
        ...(body && typeof body === 'object' && !Array.isArray(body)
            ? { fields: Object.keys(body) }
            : {}),
    };
    const started = Date.now();
    log('browser', 'api:start', request);
    let response: Response;
    try {
        response = await fetch(
            request.path,
            body === undefined
                ? undefined
                : {
                      method,
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(body),
                  },
        );
    } catch (e) {
        logError('browser', 'api:network-error', e, {
            ...request,
            ms: Date.now() - started,
        });
        throw e;
    }
    let data;
    try {
        data = await response.json();
    } catch (e) {
        logError('browser', 'api:invalid-response', e, {
            ...request,
            status: response.status,
            ms: Date.now() - started,
        });
        throw e;
    }
    if (!response.ok) {
        const error = new Error(
            data.error || 'No se ha podido completar la solicitud.',
        );
        logError('browser', 'api:failed', error, {
            ...request,
            status: response.status,
            ms: Date.now() - started,
        });
        throw error;
    }
    log('browser', 'api:complete', {
        ...request,
        status: response.status,
        ms: Date.now() - started,
    });
    return data;
}

async function streamRecommendations(
    body: Record<string, unknown>,
    onProgress: (progress: RecommendationProgress) => void,
): Promise<Snapshot> {
    const path = '/api/recommendations/stream';
    const started = Date.now();
    log('browser', 'api:stream:start', {
        method: 'POST',
        path,
        fields: Object.keys(body),
    });
    let response: Response;
    try {
        response = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.body)
            throw new Error('Next Play no ha devuelto actividad de la IA.');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let result: Snapshot | null = null;
        const readFrame = (line: string) => {
            if (!line.trim()) return;
            const frame = JSON.parse(line) as RecommendationStreamFrame;
            if (frame.type === 'progress') {
                onProgress(frame);
            } else if (frame.type === 'error') {
                throw new Error(frame.error);
            } else if (frame.type === 'result') {
                result = frame.data;
            }
        };
        try {
            while (true) {
                const { done, value } = await reader.read();
                buffer += decoder.decode(value, { stream: !done });
                let newline: number;
                while ((newline = buffer.indexOf('\n')) >= 0) {
                    readFrame(buffer.slice(0, newline));
                    buffer = buffer.slice(newline + 1);
                }
                if (done) break;
            }
            readFrame(buffer);
        } finally {
            reader.releaseLock();
        }
        if (!result)
            throw new Error('La IA no ha devuelto una recomendación válida.');
        log('browser', 'api:stream:complete', {
            method: 'POST',
            path,
            status: response.status,
            ms: Date.now() - started,
        });
        return result as Snapshot;
    } catch (e) {
        logError('browser', 'api:stream:failed', e, {
            method: 'POST',
            path,
            ms: Date.now() - started,
        });
        throw e;
    }
}

function formatHours(value: number | null | undefined) {
    return value == null
        ? 'sin datos'
        : value.toLocaleString('es', { maximumFractionDigits: 1 }) + ' h';
}

export default function Home() {
    const [state, setState] = useState<Snapshot | null>(null);
    const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
    const [codex, setCodex] = useState<CodexSettings>(DEFAULT_CODEX_SETTINGS);
    const [engine, setEngine] = useState<RecommendationEngine>('local');
    const [profileUrl, setProfileUrl] = useState('');
    const [text, setText] = useState('');
    const [reference, setReference] = useState<Game | null>(null);
    const [search, setSearch] = useState('');
    const [libraryOwner, setLibraryOwner] = useState('');
    const [libraryTag, setLibraryTag] = useState('');
    const [tagSearch, setTagSearch] = useState('');
    const [libraryOrderBy, setLibraryOrderBy] =
        useState<LibraryOrderBy>('original');
    const [limit, setLimit] = useState(36);
    const [busy, setBusy] = useState('');
    const [loading, setLoading] = useState(true);
    const [activity, setActivity] = useState<RecommendationProgress[]>([]);
    const [error, setError] = useState('');
    const [result, setResult] = useState<Recommendation | null>(null);
    const [tab, setTab] = useState('recommend');
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [setupOpen, setSetupOpen] = useState(false);

    const activeFilters = useRef(filters);
    const activeCodex = useRef(codex);
    const activeEngine = useRef(engine);
    const recommendationsRef = useRef<HTMLDivElement>(null);

    function addActivity(progress: RecommendationProgress) {
        setActivity((current) => {
            const last = current.at(-1);
            if (
                last?.event === progress.event &&
                progress.event !== 'recommendations:codex:reasoning'
            )
                return [...current.slice(0, -1), progress];
            return [...current, progress].slice(-12);
        });
    }

    useEffect(() => {
        activeEngine.current = engine;
    }, [engine]);

    useEffect(() => {
        activeFilters.current = filters;
        log('browser', 'filters:changed', filters);
    }, [filters]);

    useEffect(() => {
        activeCodex.current = codex;
        log('browser', 'codex:changed', codex);
    }, [codex]);

    useEffect(() => {
        log('browser', 'view:changed', { tab });
    }, [tab]);

    function accept(next: Snapshot, scrollToResults = false) {
        log('browser', 'state:accepted', {
            games: next.games.length,
            conversation: next.conversation.length,
            warnings: next.warnings.length,
            setup: {
                steam: next.setup.steam,
                family: next.setup.family,
                igdb: next.setup.igdb,
                hltb: next.setup.hltb,
                codex: next.setup.codex,
            },
        });
        setState(next);
        setResult(next.conversation.at(-1)?.result ?? null);
        if (next.codex) setCodex(next.codex);
        if (scrollToResults)
            requestAnimationFrame(() =>
                recommendationsRef.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                }),
            );
    }

    async function load() {
        const next: Snapshot = await api('state');
        accept(next);
        setFilters(next.filters);
        setEngine(next.setup.codex ? (next.engine ?? 'codex') : 'local');
        setCodex(
            next.codex ?? {
                model: next.setup.codexModel,
                effort: next.setup.codexEffort,
            },
        );
        if (next.profile) setProfileUrl(next.profile.url);
    }

    useEffect(() => {
        log('browser', 'app:mounted');
        void api('state')
            .then((next: Snapshot) => {
                accept(next);
                setFilters(next.filters);
                setEngine(
                    next.setup.codex ? (next.engine ?? 'codex') : 'local',
                );
                setCodex(
                    next.codex ?? {
                        model: next.setup.codexModel,
                        effort: next.setup.codexEffort,
                    },
                );
                if (next.profile) setProfileUrl(next.profile.url);
            })
            .catch((e) => {
                logError('browser', 'app:load-failed', e);
                setError(e.message);
            })
            .finally(() => setLoading(false));
    }, []);

    // WebMCP registration
    useEffect(() => {
        const context = (
            document as Document & {
                modelContext?: {
                    registerTool: (
                        tool: object,
                        options: { signal: AbortSignal },
                    ) => void | Promise<void>;
                };
            }
        ).modelContext;
        if (!context?.registerTool) {
            log('browser', 'webmcp:unavailable');
            return;
        }
        log('browser', 'webmcp:register:start');
        const lifecycle = new AbortController();
        const register = (tool: object) => {
            try {
                void Promise.resolve(
                    context.registerTool(tool, { signal: lifecycle.signal }),
                )
                    .then(() => log('browser', 'webmcp:register:complete'))
                    .catch((e) =>
                        logError('browser', 'webmcp:register-failed', e),
                    );
            } catch (e) {
                logError('browser', 'webmcp:register-failed', e);
            }
        };
        register({
            name: 'get_library_summary',
            description:
                'Read the synced Steam profile, game count and current on-screen recommendation filters. Does not expose credentials.',
            inputSchema: {
                type: 'object',
                properties: {},
                additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            async execute(input: unknown) {
                log('browser', 'webmcp:tool:start', {
                    name: 'get_library_summary',
                });
                if (
                    !input ||
                    typeof input !== 'object' ||
                    Object.keys(input).length
                )
                    throw new Error('Este comando no acepta parámetros.');
                const next: Snapshot = await api('state');
                log('browser', 'webmcp:tool:complete', {
                    name: 'get_library_summary',
                    games: next.games.length,
                });
                return {
                    profile: next.profile?.name ?? null,
                    games: next.games.length,
                    filters: activeFilters.current,
                    configured: next.setup,
                };
            },
        });
        register({
            name: 'request_game_recommendations',
            description:
                'Request recommendations using the visible filters and engine; saves results in history. Codex consumes quota and interprets messages. The local algorithm uses saved tastes and filters without tokens and ignores free text.',
            inputSchema: {
                type: 'object',
                properties: { message: { type: 'string', maxLength: 2000 } },
                required: ['message'],
                additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: true },
            async execute(input: unknown) {
                log('browser', 'webmcp:tool:start', {
                    name: 'request_game_recommendations',
                });
                const data = input as { message?: unknown };
                if (
                    !data ||
                    typeof data.message !== 'string' ||
                    data.message.length > 2000 ||
                    Object.keys(data).some((k) => k !== 'message')
                )
                    throw new Error(
                        'Indica un mensaje de hasta 2000 caracteres.',
                    );
                setBusy('recommend');
                setActivity([]);
                setError('');
                try {
                    const next = await streamRecommendations(
                        {
                            filters: activeFilters.current,
                            codex: activeCodex.current,
                            engine: activeEngine.current,
                            text: data.message,
                        },
                        addActivity,
                    );
                    flushSync(() => {
                        accept(next, true);
                        setText('');
                        setTab('recommend');
                    });
                    return next.conversation.at(-1)?.result;
                } catch (e) {
                    setError((e as Error).message);
                    throw e;
                } finally {
                    setBusy('');
                }
            },
        });
        return () => lifecycle.abort();
    }, []);

    async function action(name: string, fn: () => Promise<void>) {
        const started = Date.now();
        log('browser', 'action:start', { name });
        setBusy(name);
        setError('');
        try {
            await fn();
            log('browser', 'action:complete', {
                name,
                ms: Date.now() - started,
            });
        } catch (e) {
            logError('browser', 'action:failed', e, {
                name,
                ms: Date.now() - started,
            });
            setError(
                e instanceof Error
                    ? e.message
                    : 'No se ha podido completar la solicitud.',
            );
        } finally {
            setBusy('');
            log('browser', 'action:end', { name, ms: Date.now() - started });
        }
    }

    async function sync() {
        await action('sync', async () => {
            accept(await api('steam/sync', { profileUrl, force: true }));
        });
    }

    async function syncTags() {
        await action('tags', async () => {
            accept(await api('steam/tags/sync', { force: false }));
        });
    }

    async function recommend(message = text, selectionFilters = filters) {
        if (reference && engine !== 'codex') return;
        setActivity([]);
        await action('recommend', async () => {
            accept(
                await streamRecommendations(
                    {
                        filters: selectionFilters,
                        codex,
                        engine,
                        ...(reference
                            ? { referenceAppId: reference.appId }
                            : {}),
                        text: engine === 'local' ? '' : message,
                    },
                    addActivity,
                ),
                true,
            );
            setText('');
            setReference(null);
            setTab('recommend');
        });
    }

    async function preference(game: Game, change: Partial<Preference>) {
        await action('pref-' + game.appId, async () => {
            accept(
                await api(
                    'state',
                    {
                        appId: game.appId,
                        preference: {
                            ...(state?.preferences[game.appId] ?? {
                                favorite: false,
                                status: 'pending',
                            }),
                            ...change,
                        },
                    },
                    'PATCH',
                ),
            );
        });
    }

    async function refreshAchievements(game: Game) {
        await action('achievements-' + game.appId, async () => {
            accept(
                await api('steam/achievements/sync', {
                    appId: game.appId,
                    force: true,
                }),
            );
        });
    }

    const activeAchievementGames = (state?.games ?? [])
        .filter((game) =>
            ['playing', 'paused'].includes(
                state?.preferences[game.appId]?.status ?? '',
            ),
        )
        .map((game) => game.appId)
        .join(',');
    const achievementSyncKey = useRef('');
    useEffect(() => {
        if (!state?.profile || !activeAchievementGames) return;
        const sync = () => {
            void api('steam/achievements/sync', {})
                .then((next: Snapshot) => accept(next))
                .catch((e) =>
                    logError('browser', 'achievements:sync-failed', e),
                );
        };
        if (achievementSyncKey.current !== activeAchievementGames) {
            achievementSyncKey.current = activeAchievementGames;
            sync();
        }
        const timer = window.setInterval(sync, 6 * 60 * 60 * 1000);
        return () => window.clearInterval(timer);
    }, [activeAchievementGames, state?.profile?.steamId]);

    async function playHistoryDate(index: number, date: string) {
        await action('play-date-' + index, async () => {
            accept(await api('play-history', { index, date }, 'PATCH'));
        });
    }

    async function addGame(input: AddGameInput) {
        setBusy('add-game');
        try {
            const next: Snapshot = await api('library/games', input);
            accept(next);
            setSearch(
                next.games.find(
                    (game) =>
                        game.igdbId === input.igdbId &&
                        game.platform === input.platform,
                )?.name ?? '',
            );
            setLibraryOwner('');
            setLibraryTag('');
            setLimit(36);
        } finally {
            setBusy('');
        }
    }

    async function removeGame(game: Game) {
        await action('remove-' + game.appId, async () => {
            accept(await api('library/games', { appId: game.appId }, 'DELETE'));
            setLimit(36);
        });
    }

    async function shortlist(game: Game) {
        await action('shortlist-' + game.appId, async () => {
            accept(
                await api(
                    'shortlist',
                    {
                        appId: game.appId,
                        saved: !state?.shortlist?.some(
                            (saved) => saved.appId === game.appId,
                        ),
                    },
                    'PATCH',
                ),
            );
        });
    }

    async function reset() {
        setActivity([]);
        await action('reset', async () => {
            accept(await api('conversation/reset', { filters }));
            setText('');
            setReference(null);
        });
    }

    function similar(game: Game) {
        setReference(game);
        setText(
            `Busco algo como ${game.name}, pero…\nQuiero conservar: \nQuiero cambiar: `,
        );
        setTab('recommend');
        requestAnimationFrame(() =>
            document.getElementById('copilot-input')?.focus(),
        );
    }

    // Quick Roulette / Surprise Me action
    function surpriseMe() {
        const updatedFilters = { ...filters, comfortZone: true };
        setFilters(updatedFilters);
        void recommend(
            '¡Elige un juego sorpresa de mi biblioteca para jugar ahora mismo!',
            updatedFilters,
        );
    }

    const games = state?.games ?? [];
    const inProgress = games.filter(
        (game) =>
            inLibrary(game) &&
            ['playing', 'paused'].includes(
                state?.preferences[game.appId]?.status ?? '',
            ),
    );
    const savedIds = new Set(state?.shortlist?.map((game) => game.appId));
    const libraryById = new Map(games.map((game) => [game.appId, game]));
    const savedGames = (state?.shortlist ?? []).map(
        (game) =>
            libraryById.get(game.appId) ?? {
                ...game,
                owned: false,
                shared: false,
                ownerSteamIds: [],
            },
    );
    const favorites = games.filter(
        (g) => state?.preferences[g.appId]?.favorite,
    ).length;
    const pending = games.filter(
        (g) =>
            !state?.preferences[g.appId]?.status ||
            state.preferences[g.appId].status === 'pending',
    ).length;

    const genres = [
        ...new Set(games.flatMap((g) => (g.genres ?? []).map((x) => x.name))),
    ].sort();

    const steamTags = [
        ...new Map(
            games
                .flatMap((g) => g.steamTags ?? [])
                .filter((tag) => tag.name.trim())
                .map((tag) => [
                    steamTagKey(tag),
                    {
                        value: steamTagKey(tag),
                        label:
                            tag.englishName && tag.englishName !== tag.name
                                ? `${tag.name} · ${tag.englishName}`
                                : tag.name,
                    },
                ]),
        ).values(),
    ].sort((a, b) => a.label.localeCompare(b.label, 'es'));
    const libraryTagKeys = new Set(
        games.flatMap((g) => (g.steamTags ?? []).slice(0, 4)).map(steamTagKey),
    );
    const librarySteamTags = steamTags.filter((tag) =>
        libraryTagKeys.has(tag.value),
    );

    const tagLabels = new Map(steamTags.map((tag) => [tag.value, tag.label]));

    const filterCounts = state
        ? filterSummary(state, filters, reference?.appId)
        : null;

    const searchText = search.toLocaleLowerCase();
    const filtered = games.filter((g) => {
        const visibleTags = (g.steamTags ?? []).slice(0, 4);
        return (
            [
                g.name,
                ...visibleTags.flatMap((tag) => [
                    tag.name,
                    ...(tag.englishName ? [tag.englishName] : []),
                ]),
            ]
                .join(' ')
                .toLocaleLowerCase()
                .includes(searchText) &&
            (!libraryTag ||
                visibleTags.some((tag) => steamTagKey(tag) === libraryTag)) &&
            (!libraryOwner ||
                (libraryOwner === 'own'
                    ? g.owned
                    : libraryOwner === 'shared'
                      ? g.shared
                      : g.ownerSteamIds?.includes(libraryOwner)))
        );
    });

    const ordered = sortLibraryGames(
        filtered,
        libraryOrderBy,
        state?.preferences,
    );

    const canRecommend =
        games.length > 0 && (engine === 'local' || !!state?.setup.codex);

    return (
        <div className="app-shell">
            <a className="skip-link" href="#main">
                Ir al contenido
            </a>

            {/* 1. HUD TOPBAR WITH LIVE INDICATORS & SETTINGS TRIGGER */}
            <TopBar
                state={state}
                engine={engine}
                onOpenSettings={() => setSettingsOpen(true)}
                onSync={sync}
                busy={busy}
            />

            {/* 2. SETTINGS MODAL (Decouples tech configs) */}
            <SettingsModal
                open={settingsOpen}
                onOpenChange={setSettingsOpen}
                state={state}
                profileUrl={profileUrl}
                setProfileUrl={setProfileUrl}
                onSync={sync}
                onTagsSync={syncTags}
                onFamilySync={async () => {
                    await action('family', async () => {
                        accept(await api('steam/family/sync', {}));
                    });
                }}
                onReload={async () => {
                    await action('reload', load);
                }}
                engine={engine}
                setEngine={setEngine}
                codex={codex}
                setCodex={setCodex}
                busy={busy}
                onSetup={() => {
                    setSettingsOpen(false);
                    setSetupOpen(true);
                }}
            />
            <AppSetup
                open={setupOpen}
                onOpenChange={setSetupOpen}
                state={state}
                onReload={load}
            />

            <main id="main" className="workspace">
                {/* Hero Title & Stats Bar */}
                <div className="page-heading">
                    <div>
                        <div className="eyebrow">
                            CONSOLA NEXT PLAY · TU ESPACIO DE JUEGO
                        </div>
                        <h1>¿Qué te apetece jugar hoy?</h1>
                        <p>
                            Menos tiempo eligiendo, más tiempo disfrutando de tu
                            catálogo.
                        </p>
                    </div>

                    {/* Quick HUD Stats Pills */}
                    <div className="flex items-center gap-3">
                        <div className="hud-pill">
                            <Library size={14} className="text-emerald-400" />
                            <span>
                                <strong>{games.length}</strong> biblioteca
                            </span>
                        </div>
                        <div className="hud-pill">
                            <Clock3 size={14} className="text-amber-400" />
                            <span>
                                <strong>{pending}</strong> pendientes
                            </span>
                        </div>
                        <div className="hud-pill">
                            <Star size={14} className="text-yellow-400" />
                            <span>
                                <strong>{favorites}</strong> favoritos
                            </span>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="notice error" role="alert">
                        <AlertCircle size={18} />
                        <span>{error}</span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setError('');
                                if (!state) void action('reload', load);
                            }}
                        >
                            Cerrar
                        </Button>
                    </div>
                )}

                {/* 3. MAIN NAVIGATION TABS */}
                <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
                    <div className="view-navigation">
                        <TabsList variant="line" aria-label="Vista principal">
                            <TabsTrigger value="recommend">
                                <Sparkles size={16} /> Para ti
                            </TabsTrigger>
                            <TabsTrigger value="library">
                                <Library size={16} /> Tu biblioteca (
                                {games.length})
                            </TabsTrigger>
                            <TabsTrigger value="shortlist">
                                <Bookmark size={16} /> Lista corta (
                                {savedGames.length})
                            </TabsTrigger>
                            <TabsTrigger value="tastes">
                                <Star size={16} /> Tus gustos
                            </TabsTrigger>
                            <TabsTrigger value="history">
                                <History size={16} /> Historial
                            </TabsTrigger>
                            <TabsTrigger value="year">
                                <Gamepad2 size={16} /> Mi año
                            </TabsTrigger>
                        </TabsList>
                        <span className="subtle-label">
                            Experiencia Console & Steam Deck HUD
                        </span>
                    </div>

                    {/* =================================================================== */}
                    {/* TAB 1: PARA TI (RECOMMENDATIONS & DISCOVERY)                       */}
                    {/* =================================================================== */}
                    <TabsContent value="recommend" className="space-y-6">
                        {/* Quick Vibe & Mode Selector */}
                        <QuickVibeBar
                            filters={filters}
                            setFilters={setFilters}
                            filterCounts={filterCounts}
                            genres={genres}
                            steamTags={steamTags}
                            tagLabels={tagLabels}
                            onRecommend={() => recommend()}
                            onSurpriseMe={surpriseMe}
                            canRecommend={canRecommend}
                            busy={busy}
                            engine={engine}
                            savedGamesCount={savedGames.length}
                        />

                        {/* Copilot Bar for instant refinement */}
                        <CopilotBar
                            text={text}
                            setText={setText}
                            reference={reference}
                            setReference={setReference}
                            engine={engine}
                            setEngine={setEngine}
                            codex={codex}
                            state={state}
                            busy={busy}
                            activity={activity}
                            canRecommend={canRecommend}
                            onRecommend={(msg) => recommend(msg ?? text)}
                            onReset={reset}
                        />

                        {/* In Progress Shelf (if any) */}
                        {inProgress.length > 0 && (
                            <section
                                aria-labelledby="in-progress-heading"
                                className="hud-shelf-section"
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <h3
                                        id="in-progress-heading"
                                        className="text-sm font-bold text-foreground flex items-center gap-2"
                                    >
                                        <Play
                                            size={15}
                                            className="text-emerald-400 fill-current"
                                        />
                                        <span>
                                            Tus juegos en curso (
                                            {inProgress.length})
                                        </span>
                                    </h3>
                                    <span className="text-xs text-muted-foreground">
                                        Marca "Estoy jugando" o "En pausa" para
                                        tenerlos a mano
                                    </span>
                                </div>

                                <div className="hud-bento-grid">
                                    {inProgress.map((game) => (
                                        <article
                                            key={game.appId}
                                            className="hud-game-card"
                                        >
                                            <div className="hud-card-cover-wrapper">
                                                {game.cover ? (
                                                    <img
                                                        src={game.cover}
                                                        alt=""
                                                        className="hud-card-cover"
                                                        loading="lazy"
                                                    />
                                                ) : (
                                                    <div className="hud-card-cover-fallback">
                                                        <Gamepad2
                                                            size={28}
                                                            className="text-muted-foreground"
                                                        />
                                                    </div>
                                                )}
                                                <div className="hud-card-overlay-badges">
                                                    <span className="hud-meta-badge source">
                                                        {libraryLabel(game)}
                                                    </span>
                                                    <span
                                                        className="hud-status-badge"
                                                        data-status={
                                                            state?.preferences[
                                                                game.appId
                                                            ]?.status
                                                        }
                                                    >
                                                        {
                                                            STATUS_LABELS[
                                                                state
                                                                    ?.preferences[
                                                                    game.appId
                                                                ]?.status ??
                                                                    'playing'
                                                            ]
                                                        }
                                                    </span>
                                                </div>
                                                {game.steamTags &&
                                                    game.steamTags.length >
                                                        0 && (
                                                        <div className="hud-cover-bottom">
                                                            <div
                                                                className="hud-cover-tags"
                                                                aria-label="Etiquetas"
                                                            >
                                                                {game.steamTags
                                                                    .slice(0, 4)
                                                                    .map(
                                                                        (
                                                                            tag,
                                                                        ) => (
                                                                            <span
                                                                                key={steamTagKey(
                                                                                    tag,
                                                                                )}
                                                                                className="hud-tag-pill small"
                                                                            >
                                                                                {
                                                                                    tag.name
                                                                                }
                                                                            </span>
                                                                        ),
                                                                    )}
                                                            </div>
                                                        </div>
                                                    )}
                                            </div>
                                            <div className="hud-card-body">
                                                <h4 className="hud-card-title">
                                                    {game.name}
                                                </h4>
                                                <div className="hud-card-actions">
                                                    <a
                                                        href={gameUrl(game)}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="hud-card-steam-link"
                                                    >
                                                        <span>
                                                            {game.appId > 0
                                                                ? 'Abrir Steam'
                                                                : 'Ver en IGDB'}
                                                        </span>
                                                        <ExternalLink
                                                            size={12}
                                                        />
                                                    </a>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 text-xs ml-auto"
                                                        onClick={() =>
                                                            preference(game, {
                                                                status:
                                                                    state
                                                                        ?.preferences[
                                                                        game
                                                                            .appId
                                                                    ]
                                                                        ?.status ===
                                                                    'playing'
                                                                        ? 'paused'
                                                                        : 'playing',
                                                            })
                                                        }
                                                    >
                                                        {state?.preferences[
                                                            game.appId
                                                        ]?.status === 'playing'
                                                            ? 'Pausar'
                                                            : 'Reanudar'}
                                                    </Button>
                                                </div>
                                                {game.appId > 0 && (
                                                    <AchievementProgress
                                                        game={game}
                                                        busy={
                                                            busy ===
                                                            `achievements-${game.appId}`
                                                        }
                                                        onRefresh={
                                                            refreshAchievements
                                                        }
                                                    />
                                                )}
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Recommendations Output */}
                        {loading ? (
                            <div className="empty-state">
                                <LoaderCircle className="spin" size={36} />
                                <h2>Abriendo tu espacio de juego…</h2>
                            </div>
                        ) : !result ? (
                            <section className="empty-state">
                                <span className="empty-symbol">
                                    <Gamepad2
                                        size={46}
                                        className="text-emerald-400"
                                    />
                                </span>
                                <div className="eyebrow">
                                    TU PRÓXIMA PARTIDA TE ESTÁ ESPERANDO
                                </div>
                                <h2>
                                    {games.length
                                        ? '¿Listo para encontrar tu siguiente aventura?'
                                        : 'Añade juegos a tu biblioteca para comenzar.'}
                                </h2>
                                <p>
                                    {games.length
                                        ? 'Ajusta el tiempo arriba, pulsa "Encuentra mi próximo juego" o déjate sorprender con la ruleta.'
                                        : 'Usa Añadir un juego en Tu biblioteca o conecta Steam desde Ajustes y Conexiones.'}
                                </p>
                                <div className="steps">
                                    <span>
                                        <b>01</b> Biblioteca
                                    </span>
                                    <ArrowRight size={15} />
                                    <span>
                                        <b>02</b> Tiempo y Vibra
                                    </span>
                                    <ArrowRight size={15} />
                                    <span>
                                        <b>03</b> ¡A jugar!
                                    </span>
                                </div>
                            </section>
                        ) : (
                            <div
                                id="recommendations-output"
                                ref={recommendationsRef}
                                className="hud-results-container space-y-6"
                            >
                                {/* Result header banner */}
                                <div className="hud-card-subpanel flex items-center justify-between flex-wrap gap-3">
                                    <p className="text-sm text-foreground flex-1">
                                        {result.message}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={!canRecommend || !!busy}
                                            onClick={() =>
                                                recommend(
                                                    'Tráeme otras opciones que encajen con mis filtros y preferencias.',
                                                )
                                            }
                                        >
                                            <RefreshCw
                                                size={13}
                                                className="mr-1.5"
                                            />
                                            Tráeme otras opciones
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={!!busy}
                                            onClick={reset}
                                        >
                                            <RotateCcw
                                                size={13}
                                                className="mr-1.5"
                                            />
                                            Nueva búsqueda
                                        </Button>
                                    </div>
                                </div>

                                {/* 1. HERO SPOTLIGHT FOR TOP PICK */}
                                {result.owned.length > 0 && (
                                    <HeroSpotlight
                                        pick={result.owned[0]}
                                        status={
                                            state?.preferences[
                                                result.owned[0].appId
                                            ]?.status
                                        }
                                        onStatus={(status) =>
                                            void preference(
                                                result.owned[0].game,
                                                { status },
                                            )
                                        }
                                        opinionPreference={
                                            state?.preferences[
                                                result.owned[0].appId
                                            ]
                                        }
                                        onOpinion={(change) =>
                                            void preference(
                                                result.owned[0].game,
                                                change,
                                            )
                                        }
                                        onSimilar={similar}
                                        busy={!!busy}
                                        saved={savedIds.has(
                                            result.owned[0].appId,
                                        )}
                                        onSaved={() =>
                                            void shortlist(result.owned[0].game)
                                        }
                                        favorite={
                                            state?.preferences[
                                                result.owned[0].appId
                                            ]?.favorite
                                        }
                                        onFavorite={() =>
                                            preference(result.owned[0].game, {
                                                favorite:
                                                    !state?.preferences[
                                                        result.owned[0].appId
                                                    ]?.favorite,
                                            })
                                        }
                                    />
                                )}

                                {/* 2. SECONDARY PICKS IN BENTO GRID */}
                                {result.owned.length > 1 && (
                                    <div>
                                        <div className="section-heading">
                                            <h3 className="text-base font-bold text-foreground">
                                                Otras buenas opciones de tu
                                                biblioteca
                                            </h3>
                                            <span className="text-xs text-muted-foreground">
                                                Seleccionadas según tus gustos y
                                                el tiempo disponible
                                            </span>
                                        </div>

                                        <div className="hud-bento-grid">
                                            {result.owned
                                                .slice(1)
                                                .map((pick) => (
                                                    <GameCard
                                                        key={pick.appId}
                                                        pick={pick}
                                                        status={
                                                            state?.preferences[
                                                                pick.appId
                                                            ]?.status
                                                        }
                                                        onStatus={(status) =>
                                                            void preference(
                                                                pick.game,
                                                                { status },
                                                            )
                                                        }
                                                        opinionPreference={
                                                            state?.preferences[
                                                                pick.appId
                                                            ]
                                                        }
                                                        onOpinion={(change) =>
                                                            void preference(
                                                                pick.game,
                                                                change,
                                                            )
                                                        }
                                                        onSimilar={similar}
                                                        busy={!!busy}
                                                        saved={savedIds.has(
                                                            pick.appId,
                                                        )}
                                                        onSaved={() =>
                                                            void shortlist(
                                                                pick.game,
                                                            )
                                                        }
                                                        favorite={
                                                            state?.preferences[
                                                                pick.appId
                                                            ]?.favorite
                                                        }
                                                        onFavorite={() =>
                                                            preference(
                                                                pick.game,
                                                                {
                                                                    favorite:
                                                                        !state
                                                                            ?.preferences[
                                                                            pick
                                                                                .appId
                                                                        ]
                                                                            ?.favorite,
                                                                },
                                                            )
                                                        }
                                                    />
                                                ))}
                                        </div>
                                    </div>
                                )}

                                {/* 3. DISCOVERIES FROM IGDB (Fuera de tu radar) */}
                                {result.discoveries.length > 0 && (
                                    <div>
                                        <div className="section-heading">
                                            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                                                <Sparkles
                                                    size={16}
                                                    className="text-cyan-400"
                                                />
                                                <span>Fuera de tu radar</span>
                                            </h3>
                                            <span className="text-xs text-muted-foreground">
                                                Juegos recomendados que aún no
                                                tienes en tu biblioteca
                                            </span>
                                        </div>

                                        <div className="hud-bento-grid">
                                            {result.discoveries.map((pick) => (
                                                <GameCard
                                                    key={pick.appId}
                                                    pick={pick}
                                                    isDiscovery
                                                    status={
                                                        state?.preferences[
                                                            pick.appId
                                                        ]?.status
                                                    }
                                                    onStatus={(status) =>
                                                        void preference(
                                                            pick.game,
                                                            { status },
                                                        )
                                                    }
                                                    opinionPreference={
                                                        state?.preferences[
                                                            pick.appId
                                                        ]
                                                    }
                                                    onOpinion={(change) =>
                                                        void preference(
                                                            pick.game,
                                                            change,
                                                        )
                                                    }
                                                    onSimilar={similar}
                                                    busy={!!busy}
                                                    saved={savedIds.has(
                                                        pick.appId,
                                                    )}
                                                    onSaved={() =>
                                                        void shortlist(
                                                            pick.game,
                                                        )
                                                    }
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Warnings */}
                                {[
                                    ...new Set([
                                        ...(state?.warnings ?? []),
                                        ...(result?.warnings ?? []),
                                    ]),
                                ].map((w) => (
                                    <div className="notice" key={w}>
                                        <AlertCircle size={16} />
                                        <span>{w}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </TabsContent>

                    {/* =================================================================== */}
                    {/* TAB 2: TU BIBLIOTECA (LIBRARY EXPLORER)                             */}
                    {/* =================================================================== */}
                    <TabsContent value="library">
                        <LibraryView
                            state={state}
                            games={games}
                            orderedGames={ordered}
                            totalFiltered={filtered.length}
                            limit={limit}
                            setLimit={setLimit}
                            search={search}
                            setSearch={setSearch}
                            libraryOwner={libraryOwner}
                            setLibraryOwner={setLibraryOwner}
                            libraryTag={libraryTag}
                            setLibraryTag={setLibraryTag}
                            libraryOrderBy={libraryOrderBy}
                            setLibraryOrderBy={setLibraryOrderBy}
                            steamTags={librarySteamTags}
                            savedIds={savedIds}
                            onShortlist={shortlist}
                            onPreference={preference}
                            onSimilar={similar}
                            onAdd={addGame}
                            onRemove={removeGame}
                            onRefreshAchievements={refreshAchievements}
                            busy={busy}
                        />
                    </TabsContent>

                    {/* =================================================================== */}
                    {/* TAB 3: LISTA CORTA (SHORTLIST)                                      */}
                    {/* =================================================================== */}
                    <TabsContent value="shortlist">
                        <div className="hud-shelf-section space-y-4">
                            <div className="flex items-center justify-between flex-wrap gap-3">
                                <div>
                                    <h3 className="text-base font-bold text-foreground">
                                        Tus próximos candidatos (
                                        {savedGames.length})
                                    </h3>
                                    <p className="text-xs text-muted-foreground">
                                        Juegos guardados para decidir entre
                                        ellos cuando quieras.
                                    </p>
                                </div>
                                <Button
                                    disabled={
                                        !!busy ||
                                        !savedGames.length ||
                                        !games.length
                                    }
                                    onClick={() => {
                                        const nextFilters = {
                                            ...filters,
                                            shortlistOnly: true,
                                        };
                                        setFilters(nextFilters);
                                        void recommend(
                                            'Elige entre los juegos de mi lista corta.',
                                            nextFilters,
                                        );
                                    }}
                                    className="bg-emerald-500 hover:bg-emerald-600 text-black font-semibold"
                                >
                                    <Sparkles size={15} className="mr-1.5" />
                                    Elegir entre estos juegos
                                </Button>
                            </div>

                            {!savedGames.length ? (
                                <div className="empty-state">
                                    <Bookmark
                                        size={36}
                                        className="text-muted-foreground mb-2"
                                    />
                                    <h3 className="text-sm font-semibold">
                                        Tu lista corta está vacía
                                    </h3>
                                    <p className="text-xs text-muted-foreground">
                                        Guarda juegos con el icono de marcador
                                        desde "Para ti" o "Tu biblioteca".
                                    </p>
                                </div>
                            ) : (
                                <div className="hud-bento-grid">
                                    {savedGames.map((game) => (
                                        <article
                                            key={game.appId}
                                            className="hud-game-card"
                                        >
                                            <div className="hud-card-cover-wrapper">
                                                {game.cover ? (
                                                    <img
                                                        src={game.cover}
                                                        alt=""
                                                        className="hud-card-cover"
                                                        loading="lazy"
                                                    />
                                                ) : (
                                                    <div className="hud-card-cover-fallback">
                                                        <Gamepad2
                                                            size={24}
                                                            className="text-muted-foreground"
                                                        />
                                                    </div>
                                                )}
                                                <div className="hud-card-overlay-badges">
                                                    <span className="hud-meta-badge source">
                                                        {libraryLabel(game)}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="hud-card-body">
                                                <h4 className="hud-card-title">
                                                    {game.name}
                                                </h4>
                                                <div className="text-xs text-muted-foreground space-y-1 mb-2">
                                                    {game.hltb?.mainHours && (
                                                        <div>
                                                            HLTB:{' '}
                                                            {formatHours(
                                                                game.hltb
                                                                    .mainHours,
                                                            )}{' '}
                                                            de historia
                                                        </div>
                                                    )}
                                                    {game.durationHours && (
                                                        <div>
                                                            IGDB: ≈{' '}
                                                            {formatHours(
                                                                game.durationHours,
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="hud-card-actions">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-7 text-xs text-amber-400 border-amber-500/30"
                                                        onClick={() =>
                                                            void shortlist(game)
                                                        }
                                                    >
                                                        <Bookmark
                                                            size={12}
                                                            className="mr-1 fill-current"
                                                        />
                                                        Quitar
                                                    </Button>
                                                    <a
                                                        href={gameUrl(game)}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="hud-card-steam-link ml-auto"
                                                    >
                                                        <span>
                                                            {game.appId > 0
                                                                ? 'Steam'
                                                                : 'IGDB'}
                                                        </span>
                                                        <ExternalLink
                                                            size={12}
                                                        />
                                                    </a>
                                                </div>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            )}
                        </div>
                    </TabsContent>

                    {/* =================================================================== */}
                    {/* TAB 4: TUS GUSTOS (TASTES & WEIGHTS)                                */}
                    {/* =================================================================== */}
                    <TabsContent value="tastes">
                        {state && (
                            <Tastes
                                key={JSON.stringify(state.tastes)}
                                state={state}
                                busy={!!busy}
                                onSave={(settings) =>
                                    action('tastes', async () => {
                                        accept(
                                            await api(
                                                'tastes',
                                                settings,
                                                'PATCH',
                                            ),
                                        );
                                    })
                                }
                            />
                        )}
                    </TabsContent>

                    {/* =================================================================== */}
                    {/* TAB 5: HISTORIAL (SAVED SEARCHES)                                   */}
                    {/* =================================================================== */}
                    <TabsContent value="history">
                        <div className="results space-y-4">
                            <p className="small-note">
                                Cada consulta conserva sus filtros y resultados
                                originales, incluso después de empezar otra
                                búsqueda.
                            </p>
                            {!state?.history?.length && (
                                <p>Aún no hay búsquedas guardadas.</p>
                            )}
                            {state?.history?.toReversed().map((entry) => (
                                <details
                                    className="panel saved-search"
                                    key={entry.id}
                                >
                                    <summary>
                                        {entry.filters.mode === 'today'
                                            ? 'Para hoy'
                                            : 'Próximo juego'}
                                        {' · '}
                                        {new Date(
                                            entry.result.at,
                                        ).toLocaleString('es')}
                                        {' · '}
                                        {entry.result.engine === 'local'
                                            ? 'Algoritmo local'
                                            : 'Codex'}
                                    </summary>
                                    <p className="small-note">
                                        {entry.filters.mode === 'today'
                                            ? entry.filters.minutes === null
                                                ? 'Sesión sin límite'
                                                : `${entry.filters.minutes} min de sesión`
                                            : entry.filters.hours === null
                                              ? 'Historia sin límite'
                                              : `Historia de hasta ${entry.filters.hours} h`}
                                        {' · '}
                                        {entry.filters.mode === 'today' &&
                                            entry.filters.sessionIntent ===
                                                'continue' &&
                                            'Continuar partida o retomar · '}
                                        {entry.filters.mode === 'today' &&
                                            entry.filters.sessionIntent ===
                                                'start' &&
                                            'Empezar un pendiente · '}
                                        {entry.filters.genre ||
                                            'Cualquier género'}
                                        {entry.filters.shortlistOnly &&
                                            ' · Solo lista corta'}
                                        {entry.filters.comfortZone &&
                                            ' · Zona de confort'}
                                        {entry.filters.minReleaseDate &&
                                            ` · Desde ${new Date(`${entry.filters.minReleaseDate}T00:00:00`).toLocaleDateString('es')}`}
                                        {(entry.filters.tags ?? []).length >
                                            0 &&
                                            ` · Etiquetas: ${(
                                                entry.filters.tags ?? []
                                            )
                                                .map(
                                                    (tag) =>
                                                        tagLabels.get(tag) ??
                                                        tag,
                                                )
                                                .join(', ')}`}
                                    </p>
                                    {entry.text && (
                                        <p>
                                            <strong>{entry.text}</strong>
                                        </p>
                                    )}
                                    <p>{entry.result.message}</p>
                                    <div className="hud-bento-grid mt-4">
                                        {[
                                            ...entry.result.owned,
                                            ...entry.result.discoveries,
                                        ].map((pick) => (
                                            <GameCard
                                                key={pick.appId}
                                                pick={pick}
                                                saved={savedIds.has(pick.appId)}
                                                onSaved={() =>
                                                    void shortlist(pick.game)
                                                }
                                                onSimilar={similar}
                                                status={
                                                    state.preferences[
                                                        pick.appId
                                                    ]?.status
                                                }
                                                opinionPreference={
                                                    state?.preferences[
                                                        pick.appId
                                                    ]
                                                }
                                                onOpinion={(change) =>
                                                    void preference(
                                                        pick.game,
                                                        change,
                                                    )
                                                }
                                                busy={!!busy}
                                                onStatus={(status) =>
                                                    void preference(pick.game, {
                                                        status,
                                                    })
                                                }
                                                favorite={
                                                    state?.preferences[
                                                        pick.appId
                                                    ]?.favorite
                                                }
                                                onFavorite={() =>
                                                    preference(pick.game, {
                                                        favorite:
                                                            !state?.preferences[
                                                                pick.appId
                                                            ]?.favorite,
                                                    })
                                                }
                                            />
                                        ))}
                                    </div>
                                </details>
                            ))}
                        </div>
                    </TabsContent>
                    <TabsContent value="year">
                        {state && (
                            <PlayHistory
                                state={state}
                                busy={!!busy}
                                onDateChange={playHistoryDate}
                            />
                        )}
                    </TabsContent>
                </Tabs>
            </main>

            {/* FOOTER */}
            <footer className="footer">
                <span>
                    nextplay. <span>Un juego para cada momento.</span>
                </span>
                <span>
                    HUD Console Edition · Diseñado para disfrutar de tu
                    biblioteca.
                </span>
            </footer>
        </div>
    );
}
