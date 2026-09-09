'use client';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import Tastes from './tastes';
import GameOpinion from './opinion';
// Covers already use source thumbnails; this local Node app has no image optimizer.
/* oxlint-disable next/no-img-element */
import {
  ArrowUpRight,
  ArrowRight,
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
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CODEX_MODELS,
  DEFAULT_FILTERS,
  DEFAULT_CODEX_SETTINGS,
  STATUS_LABELS,
  codexEffortsForModel,
  storeUrl,
  inLibrary,
  libraryLabel,
  sortLibraryGames,
  steamTagKey,
} from '@/lib/model';
import { clearFilters, filterSummary } from '@/lib/filters';
import { log, logError } from '@/lib/log';
import type {
  CodexSettings,
  Filters,
  Game,
  GameStatus,
  LibraryOrderBy,
  Pick,
  Preference,
  Recommendation,
  RecommendationEngine,
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
function Choice({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <label id={id + '-label'} htmlFor={id}>
        {label}
      </label>
      <Select
        value={value}
        onValueChange={(v) => onChange(v ?? '')}
        items={options}
      >
        <SelectTrigger
          id={id}
          aria-labelledby={id + '-label'}
          className="choice"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
function Cover({ game }: { game: Game }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="cover">
      {game.cover && !failed ? (
        <img
          src={game.cover}
          alt=""
          loading="lazy"
          onError={() => {
            log('browser', 'cover:failed', { appId: game.appId });
            setFailed(true);
          }}
        />
      ) : (
        <Gamepad2 aria-hidden="true" />
      )}
    </div>
  );
}
function GameTags({ game }: { game: Game }) {
  if (!game.steamTags?.length) return null;
  return (
    <div className="filter-tags" aria-label="Etiquetas Steam">
      {game.steamTags.map((tag) => (
        <span className="filter-tag" key={steamTagKey(tag)}>
          {tag.name}
        </span>
      ))}
    </div>
  );
}
function formatHours(value: number | null | undefined) {
  return value == null
    ? 'sin datos'
    : value.toLocaleString('es', { maximumFractionDigits: 1 }) + ' h';
}
function StatusControl({
  game,
  status = 'pending',
  onStatus,
  busy,
}: {
  game: Game;
  status?: GameStatus;
  onStatus: (status: GameStatus) => void;
  busy?: boolean;
}) {
  return (
    <Select
      value={status}
      onValueChange={(value) => {
        if (value) onStatus(value as GameStatus);
      }}
      disabled={busy}
      items={Object.entries(STATUS_LABELS).map(([value, label]) => ({
        value,
        label,
      }))}
    >
      <SelectTrigger aria-label={'Estado de ' + game.name}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(STATUS_LABELS).map(([value, label]) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function GamePick({
  pick,
  main,
  status,
  onStatus,
  opinionPreference,
  onOpinion,
  busy,
  saved,
  onSaved,
}: {
  pick: Pick & { game: Game };
  main?: boolean;
  opinionPreference?: Preference;
  onOpinion?: (change: Partial<Preference>) => void;
  status?: GameStatus;
  onStatus?: (status: GameStatus) => void;
  busy?: boolean;
  saved?: boolean;
  onSaved?: () => void;
}) {
  const { game } = pick;
  return (
    <article className={'game-pick ' + (main ? 'main-pick' : '')}>
      <Cover game={game} />
      <div className="pick-body">
        <div className="eyebrow">
          {main
            ? 'TU PRÓXIMA PARTIDA'
            : inLibrary(game)
              ? 'OTRA BUENA OPCIÓN'
              : 'POR DESCUBRIR'}
        </div>
        <h3>{game.name}</h3>
        <div className="game-meta">
          <span>{libraryLabel(game)}</span>
          {inLibrary(game) && game.playtimeMinutes !== null && (
            <span>
              {(game.playtimeMinutes / 60).toLocaleString('es', {
                maximumFractionDigits: 1,
              })}{' '}
              h jugadas
            </span>
          )}
          {game.durationHours != null && (
            <span>IGDB · ≈ {formatHours(game.durationHours)} de historia</span>
          )}
          {game.hltb && (
            <span>
              HLTB · Historia: {formatHours(game.hltb.mainHours)} · Historia y
              extras: {formatHours(game.hltb.extraHours)} · Completista:{' '}
              {formatHours(game.hltb.completionHours)}
            </span>
          )}
          {game.durationHours == null && !game.hltb && (
            <span>Duraciones sin datos</span>
          )}
        </div>
        <GameTags game={game} />
        {onSaved && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            aria-pressed={!!saved}
            onClick={onSaved}
          >
            {saved ? 'Quitar de lista corta' : 'Guardar en lista corta'}
          </Button>
        )}
        <p>{pick.reason}</p>
        <p>{pick.whyNow}</p>
        <p className="caveat">
          <strong>A tener en cuenta: </strong>
          {pick.caveat}
        </p>
        {onStatus && (
          <div
            className="pick-actions"
            aria-label={'Acciones para ' + game.name}
          >
            {inLibrary(game) && (
              <StatusControl
                game={game}
                status={status}
                onStatus={onStatus}
                busy={busy}
              />
            )}
            <Button
              variant={status === 'completed' ? 'secondary' : 'outline'}
              size="sm"
              disabled={busy}
              aria-pressed={status === 'completed'}
              onClick={() =>
                onStatus(status === 'completed' ? 'pending' : 'completed')
              }
            >
              <Check size={15} /> Ya jugado
            </Button>
            <Button
              variant={status === 'ignored' ? 'destructive' : 'outline'}
              size="sm"
              disabled={busy}
              aria-pressed={status === 'ignored'}
              onClick={() =>
                onStatus(status === 'ignored' ? 'pending' : 'ignored')
              }
            >
              <X size={15} /> No me interesa
            </Button>
          </div>
        )}
        {onOpinion && (
          <GameOpinion
            key={JSON.stringify(opinionPreference)}
            game={game}
            preference={opinionPreference}
            busy={busy}
            onSave={onOpinion}
          />
        )}
        {game.shared && (
          <p className="small-note">
            La disponibilidad de una copia libre se comprueba al abrir Steam.
          </p>
        )}
        <div className="pick-footer">
          <a
            className="store-link"
            href={storeUrl(game.appId)}
            target="_blank"
            rel="noreferrer"
          >
            Ver en Steam <ArrowUpRight size={16} />
          </a>
          {game.igdbUrl && (
            <a href={game.igdbUrl} target="_blank" rel="noreferrer">
              Datos de IGDB
            </a>
          )}
          {game.hltb && (
            <a
              href={'https://howlongtobeat.com/game/' + game.hltb.id}
              target="_blank"
              rel="noreferrer"
            >
              HowLongToBeat · {new Date(game.hltb.at).toLocaleDateString('es')}
            </a>
          )}
          {game.reviews && game.reviews.total > 0 && (
            <span>
              {Math.round((100 * game.reviews.positive) / game.reviews.total)}%
              positivas · {game.reviews.total.toLocaleString('es')} reseñas ·{' '}
              {new Date(game.reviews.at).toLocaleDateString('es')}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
export default function Home() {
  const [state, setState] = useState<Snapshot | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [codex, setCodex] = useState<CodexSettings>(DEFAULT_CODEX_SETTINGS);
  const [engine, setEngine] = useState<RecommendationEngine>('codex');
  const [profileUrl, setProfileUrl] = useState(
    'https://steamcommunity.com/id/fineku/',
  );
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [libraryOwner, setLibraryOwner] = useState('');
  const [libraryTag, setLibraryTag] = useState('');
  const [tagSearch, setTagSearch] = useState('');
  const [libraryOrderBy, setLibraryOrderBy] =
    useState<LibraryOrderBy>('original');
  const [limit, setLimit] = useState(36);
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Recommendation | null>(null);
  const [tab, setTab] = useState('recommend');
  const activeFilters = useRef(filters);
  const activeCodex = useRef(codex);
  const activeEngine = useRef(engine);
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
  function accept(next: Snapshot) {
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
  }
  async function load() {
    const next: Snapshot = await api('state');
    accept(next);
    setFilters(next.filters);
    setEngine(next.engine ?? 'codex');
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
        setEngine(next.engine ?? 'codex');
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
          .catch((e) => logError('browser', 'webmcp:register-failed', e));
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
        if (!input || typeof input !== 'object' || Object.keys(input).length)
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
          throw new Error('Indica un mensaje de hasta 2000 caracteres.');
        setBusy('recommend');
        setError('');
        try {
          const next: Snapshot = await api('recommendations', {
            filters: activeFilters.current,
            codex: activeCodex.current,
            engine: activeEngine.current,
            text: data.message,
          });
          flushSync(() => {
            accept(next);
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
      log('browser', 'action:complete', { name, ms: Date.now() - started });
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
  async function recommend(message = text, selectionFilters = filters) {
    await action('recommend', async () => {
      accept(
        await api('recommendations', {
          filters: selectionFilters,
          codex,
          engine,
          text: engine === 'local' ? '' : message,
        }),
      );
      setText('');
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
    await action('reset', async () => {
      accept(await api('conversation/reset', { filters }));
      setText('');
    });
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
  const tagLabels = new Map(steamTags.map((tag) => [tag.value, tag.label]));
  const selectedTagKeys = filters.tags ?? [];
  const filterCounts = state ? filterSummary(state, filters) : null;
  const activeFilterChips: { label: string; patch: Partial<Filters> }[] = [
    ...(filters.mode === 'next' && filters.hours !== null
      ? [
          {
            label: 'Historia ≤ ' + filters.hours + ' h',
            patch: { hours: null },
          },
        ]
      : []),
    ...(filters.mode === 'today' &&
    engine === 'codex' &&
    filters.minutes !== null
      ? [
          {
            label: 'Sesión: ' + filters.minutes + ' min (orientativo)',
            patch: { minutes: null },
          },
        ]
      : []),
    ...(filters.minReleaseDate
      ? [
          {
            label: 'Desde ' + filters.minReleaseDate,
            patch: { minReleaseDate: null },
          },
        ]
      : []),
    ...(filters.genre ? [{ label: filters.genre, patch: { genre: '' } }] : []),
    ...(filters.gameMode
      ? [
          {
            label: (
              {
                single: 'En solitario',
                coop: 'Cooperativo',
                multi: 'Multijugador',
              } as Record<string, string>
            )[filters.gameMode],
            patch: { gameMode: '' },
          },
        ]
      : []),
    ...selectedTagKeys.map((key) => ({
      label: tagLabels.get(key) ?? key,
      patch: { tags: selectedTagKeys.filter((tag) => tag !== key) },
    })),
    ...(!filters.replay
      ? [{ label: 'Excluir terminados y abandonados', patch: { replay: true } }]
      : []),
    ...(engine === 'codex' && filters.mood.trim()
      ? [
          {
            label: 'Busco: ' + filters.mood + ' (orientativo)',
            patch: { mood: '' },
          },
        ]
      : []),
  ];
  const tagSuggestions = steamTags.filter(
    (tag) => !selectedTagKeys.includes(tag.value),
  );
  function addTagFilter() {
    const query = tagSearch.trim().toLocaleLowerCase();
    if (!query) return;
    const exact = steamTags.find(
      (tag) =>
        tag.value === tagSearch.trim() ||
        tag.label.toLocaleLowerCase() === query,
    );
    const match =
      exact ??
      steamTags.find((tag) => tag.label.toLocaleLowerCase().includes(query));
    if (!match) return;
    if (!selectedTagKeys.includes(match.value))
      setFilters({ ...filters, tags: [...selectedTagKeys, match.value] });
    setTagSearch('');
  }
  const searchText = search.toLocaleLowerCase();
  const filtered = games.filter(
    (g) =>
      [
        g.name,
        ...(g.steamTags ?? []).flatMap((tag) => [
          tag.name,
          ...(tag.englishName ? [tag.englishName] : []),
        ]),
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(searchText) &&
      (!libraryTag ||
        (g.steamTags ?? []).some((tag) => steamTagKey(tag) === libraryTag)) &&
      (!libraryOwner ||
        (libraryOwner === 'own'
          ? g.owned
          : libraryOwner === 'shared'
            ? g.shared
            : g.ownerSteamIds?.includes(libraryOwner))),
  );
  const ordered = sortLibraryGames(
    filtered,
    libraryOrderBy,
    state?.preferences,
  );
  const modelOptions = [
    ...CODEX_MODELS,
    ...(CODEX_MODELS.some((m) => m.value === codex.model)
      ? []
      : [{ value: codex.model, label: codex.model + ' · configurado' }]),
  ];
  const effortOptions = codexEffortsForModel(codex.model).map((value) => ({
    value,
    label:
      value === 'low'
        ? 'Bajo · más rápido'
        : value === 'medium'
          ? 'Medio · equilibrado'
          : value === 'high'
            ? 'Alto · más razonado'
            : value === 'xhigh'
              ? 'Muy alto'
              : value === 'max'
                ? 'Máximo'
                : 'Ultra',
  }));
  const canRecommend =
    games.length > 0 && (engine === 'local' || state?.setup.codex);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Ir al contenido
      </a>
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Next Play, inicio">
          <span className="brand-icon">
            <Gamepad2 />
          </span>
          <span>
            next<span className="brand-light">play</span>
            <span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="local-badge">
          <span /> Tu espacio de juego
        </div>
        <div className="user-badge">
          {state?.profile?.avatar && <img src={state.profile.avatar} alt="" />}
          <span>{state?.profile?.name ?? 'fineku'}</span>
          <span className="local-label">LOCAL</span>
        </div>
      </header>
      <main id="main" className="workspace">
        <div className="page-heading">
          <div>
            <div className="eyebrow">MENOS ELEGIR. MÁS JUGAR.</div>
            <h1>¿Qué te apetece jugar?</h1>
            <p>
              Encuentra tu siguiente partida entre lo que tienes y lo que te
              falta por descubrir.
            </p>
          </div>
          <div className="session-note">
            <span className="status-dot" />A tu ritmo. A tu manera.
          </div>
        </div>
        {error && (
          <div className="notice error" role="alert">
            <AlertCircle size={18} />
            <span>{error}</span>
            <Button
              variant="ghost"
              onClick={() => {
                setError('');
                if (!state) void action('reload', load);
              }}
            >
              Cerrar
            </Button>
          </div>
        )}
        <div className="content-grid">
          <aside className="controls">
            <section className="panel">
              <div className="panel-title">
                <SlidersHorizontal size={18} />
                <h2>Tu próxima experiencia</h2>
              </div>
              <Tabs
                value={filters.mode}
                onValueChange={(v) =>
                  setFilters({ ...filters, mode: v as Filters['mode'] })
                }
              >
                <TabsList
                  className="mode-tabs"
                  aria-label="Tipo de recomendación"
                >
                  <TabsTrigger value="today">
                    <Clock3 size={16} /> Para hoy
                  </TabsTrigger>
                  <TabsTrigger value="next">
                    <Sparkles size={16} /> Próximo juego
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <p className="field-help">
                {filters.mode === 'today'
                  ? 'Un juego para el rato que tienes ahora.'
                  : 'Una nueva historia para varias sesiones.'}
              </p>
              <div className="field" aria-label="Resumen de filtros">
                <strong>
                  Filtros activos ·{' '}
                  {filters.mode === 'today' ? 'Para hoy' : 'Próximo juego'}
                </strong>
                <div className="filter-tags">
                  {activeFilterChips.map(({ label, patch }, index) => (
                    <span className="filter-tag" key={index}>
                      {label}
                      <button
                        type="button"
                        aria-label={'Quitar filtro: ' + label}
                        onClick={() => setFilters({ ...filters, ...patch })}
                      >
                        <X size={13} />
                      </button>
                    </span>
                  ))}
                </div>
                {!activeFilterChips.length && (
                  <p className="field-help">Sin filtros opcionales.</p>
                )}
                <Button
                  variant="ghost"
                  onClick={() => {
                    setFilters(clearFilters(filters.mode));
                    setTagSearch('');
                  }}
                >
                  Limpiar filtros
                </Button>
                {filterCounts && (
                  <p className="field-help" role="status">
                    <strong>
                      {filterCounts.eligible} de {filterCounts.total}
                    </strong>{' '}
                    juegos de tu biblioteca cumplen los filtros con los datos
                    guardados. {filterCounts.missing} excluidos por datos
                    necesarios sin completar, sin otro incumplimiento conocido.
                    {selectedTagKeys.length > 1 &&
                      (filterCounts.relaxedTags
                        ? ' Se incluyen juegos con cualquiera de las etiquetas: hay menos de 3 con todas.'
                        : ' Los candidatos tienen todas las etiquetas seleccionadas.')}
                  </p>
                )}
                <p className="field-help">
                  Los recuentos incluyen juegos propios y compartidos, sin
                  descubrimientos. Codex puede actualizar metadatos al
                  recomendar. «No me interesa» siempre se excluye.
                  {filters.mode === 'today' &&
                    (engine === 'codex'
                      ? ' Los minutos orientan a Codex; no excluyen juegos por duración total.'
                      : ' El motor local no filtra por minutos de sesión.')}
                  {engine === 'codex' &&
                    filters.mood.trim() &&
                    ' «Hoy busco» orienta a Codex y no modifica el recuento.'}
                </p>
              </div>
              {filters.mode === 'today' && (
                <>
                  <Choice
                    id="session-intent"
                    label="¿Continuar o empezar?"
                    value={filters.sessionIntent ?? 'any'}
                    onChange={(sessionIntent) =>
                      setFilters({
                        ...filters,
                        sessionIntent:
                          sessionIntent as Filters['sessionIntent'],
                      })
                    }
                    options={[
                      { value: 'any', label: 'Cualquiera' },
                      {
                        value: 'continue',
                        label: 'Continuar jugando o retomar una pausa',
                      },
                      { value: 'start', label: 'Empezar un pendiente' },
                    ]}
                  />
                  <p className="field-help">
                    Usa los estados que has marcado, sin deducirlos de tus
                    horas.
                  </p>
                </>
              )}
              <div className="field">
                <label htmlFor="time">
                  {filters.mode === 'today'
                    ? 'Tiempo para esta sesión'
                    : 'Duración máxima de la historia'}
                </label>
                <div className="number-field">
                  <Input
                    id="time"
                    type="number"
                    min="1"
                    max={filters.mode === 'today' ? 1440 : 1000}
                    placeholder="Sin límite"
                    value={
                      (filters.mode === 'today'
                        ? filters.minutes
                        : filters.hours) ?? ''
                    }
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        [filters.mode === 'today' ? 'minutes' : 'hours']: e
                          .target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  />
                  <span>{filters.mode === 'today' ? 'minutos' : 'horas'}</span>
                </div>
              </div>
              <div className="field">
                <label htmlFor="min-release-date">
                  Fecha mínima de lanzamiento
                </label>
                <Input
                  id="min-release-date"
                  type="date"
                  value={filters.minReleaseDate ?? ''}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      minReleaseDate: e.target.value || null,
                    })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="recommendation-tags">Etiquetas Steam</label>
                {!!selectedTagKeys.length && (
                  <div
                    className="filter-tags"
                    aria-label="Etiquetas seleccionadas"
                  >
                    {selectedTagKeys.map((key) => (
                      <span className="filter-tag" key={key}>
                        {tagLabels.get(key) ?? key}
                        <button
                          type="button"
                          aria-label={`Quitar ${tagLabels.get(key) ?? key}`}
                          onClick={() =>
                            setFilters({
                              ...filters,
                              tags: selectedTagKeys.filter(
                                (tag) => tag !== key,
                              ),
                            })
                          }
                        >
                          <X size={13} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <Input
                  id="recommendation-tags"
                  list="recommendation-tag-options"
                  value={tagSearch}
                  placeholder="Busca una etiqueta y pulsa Enter"
                  onChange={(e) => setTagSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTagFilter();
                    }
                  }}
                />
                <datalist id="recommendation-tag-options">
                  {tagSuggestions.map((tag) => (
                    <option key={tag.value} value={tag.label} />
                  ))}
                </datalist>
                <p className="field-help">
                  Con varias: primero juegos con todas; si no hay suficientes,
                  se incluyen los que tengan cualquiera.
                </p>
              </div>
              <Choice
                id="genre"
                label="Género"
                value={filters.genre}
                onChange={(genre) => setFilters({ ...filters, genre })}
                options={[
                  { value: '', label: 'Me dejo sorprender' },
                  ...genres.map((g) => ({ value: g, label: g })),
                ]}
              />
              <Choice
                id="game-mode"
                label="¿Con quién juegas?"
                value={filters.gameMode}
                onChange={(gameMode) => setFilters({ ...filters, gameMode })}
                options={[
                  { value: '', label: 'Sin preferencia' },
                  { value: 'single', label: 'En solitario' },
                  { value: 'coop', label: 'En cooperativo' },
                  { value: 'multi', label: 'Multijugador' },
                ]}
              />
              {engine === 'codex' && (
                <div className="field">
                  <label htmlFor="mood">Hoy busco…</label>
                  <Input
                    id="mood"
                    maxLength={200}
                    value={filters.mood}
                    placeholder="Algo tranquilo, una buena historia…"
                    onChange={(e) =>
                      setFilters({ ...filters, mood: e.target.value })
                    }
                  />
                </div>
              )}
              <label className="check-label" htmlFor="replay">
                <Checkbox
                  id="replay"
                  checked={filters.replay}
                  onCheckedChange={(v) =>
                    setFilters({ ...filters, replay: !!v })
                  }
                />{' '}
                Incluir terminados y abandonados
              </label>
              <label className="check-label" htmlFor="shortlist-only">
                <Checkbox
                  id="shortlist-only"
                  checked={!!filters.shortlistOnly}
                  onCheckedChange={(value) =>
                    setFilters({ ...filters, shortlistOnly: !!value })
                  }
                />
                Solo mi lista corta ({savedGames.length})
              </label>
              <Choice
                id="recommendation-engine"
                label="Cómo recomendar"
                value={engine}
                onChange={(value) => setEngine(value as RecommendationEngine)}
                options={[
                  { value: 'codex', label: 'Codex · IA' },
                  { value: 'local', label: 'Algoritmo local · sin tokens' },
                ]}
              />
              {engine === 'local' && (
                <p className="field-help">
                  Usa tus favoritos y los pesos de Tus gustos. Funciona con los
                  datos guardados, sin interpretar notas ni conversación.
                </p>
              )}
              {engine === 'codex' && (
                <>
                  <Choice
                    id="codex-model"
                    label="Modelo"
                    value={codex.model}
                    onChange={(model) => {
                      const efforts = codexEffortsForModel(model);
                      setCodex({
                        model,
                        effort: efforts.includes(codex.effort)
                          ? codex.effort
                          : 'medium',
                      });
                    }}
                    options={modelOptions}
                  />
                  <Choice
                    id="codex-effort"
                    label="Esfuerzo de razonamiento"
                    value={codex.effort}
                    onChange={(effort) =>
                      setCodex({
                        ...codex,
                        effort: effort as CodexSettings['effort'],
                      })
                    }
                    options={effortOptions}
                  />
                </>
              )}
              <Button
                className="recommend-button"
                disabled={!canRecommend || !!busy}
                onClick={() => recommend()}
              >
                {busy === 'recommend' ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <Sparkles size={18} />
                )}
                {busy === 'recommend'
                  ? 'Buscando tu próxima partida…'
                  : 'Encuentra mi próximo juego'}
                <ArrowRight size={17} />
              </Button>
              <p className="small-note">
                La afinidad y el ánimo son orientativos. Tus preferencias
                mandan.
              </p>
            </section>
            <section className="panel steam-panel">
              <div className="panel-title">
                <Library size={18} />
                <h2>Conecta tu biblioteca</h2>
              </div>
              <label className="sr-only" htmlFor="profile">
                Enlace público del perfil de Steam
              </label>
              <Input
                id="profile"
                value={profileUrl}
                onChange={(e) => setProfileUrl(e.target.value)}
                placeholder="Enlace público de Steam"
                maxLength={300}
              />
              <Button
                variant="outline"
                className="sync-button"
                disabled={!!busy}
                onClick={sync}
              >
                <RefreshCw
                  size={15}
                  className={busy === 'sync' ? 'spin' : ''}
                />
                {busy === 'sync'
                  ? 'Sincronizando…'
                  : state?.syncedAt
                    ? 'Actualizar biblioteca y datos'
                    : 'Sincronizar Steam'}
              </Button>
              <p className="small-note">
                {state?.syncedAt
                  ? 'Última lectura: ' +
                    new Date(state.syncedAt).toLocaleString('es')
                  : 'El perfil y los detalles de juegos deben ser públicos.'}
              </p>
            </section>
            <section className="panel steam-panel">
              <div className="panel-title">
                <Library size={18} />
                <h2>Steam Families</h2>
              </div>
              <p className="small-note">
                {state?.family
                  ? `${state.family.name} · ${state.family.members.length} miembros`
                  : 'Añade las bibliotecas compartidas contigo, aunque los perfiles sean privados.'}
              </p>
              <Button
                variant="outline"
                className="sync-button"
                disabled={!!busy || !state?.profile || !state.setup.family}
                onClick={() =>
                  action('family', async () => {
                    accept(await api('steam/family/sync', {}));
                  })
                }
              >
                <RefreshCw
                  size={15}
                  className={busy === 'family' ? 'spin' : ''}
                />
                {busy === 'family'
                  ? 'Importando bibliotecas…'
                  : state?.family
                    ? 'Actualizar Steam Families'
                    : 'Conectar Steam Families'}
              </Button>
              {state?.family && (
                <p className="small-note">
                  {games.filter((g) => g.shared).length.toLocaleString('es')}{' '}
                  juegos compartidos · Última lectura:{' '}
                  {new Date(state.family.syncedAt).toLocaleString('es')}
                  <br />
                  Steam ha excluido{' '}
                  {state.family.excludedCount.toLocaleString('es')} títulos no
                  prestables o ajenos al catálogo de juegos.
                </p>
              )}
              {state && !state.setup.family && (
                <p className="small-note">
                  Añade <code>STEAM_FAMILY_TOKEN</code> en{' '}
                  <code>.env.local</code> y pulsa Comprobar conexiones.{' '}
                  <a
                    href="https://store.steampowered.com/pointssummary/ajaxgetasyncconfig"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Obtener token en Steam ↗
                  </a>
                </p>
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={!!busy}
                onClick={() => action('reload', load)}
              >
                Comprobar conexiones
              </Button>
            </section>
            <div className="source-note">
              <span>CON DATOS DE</span>
              <a
                href="https://store.steampowered.com/"
                target="_blank"
                rel="noreferrer"
              >
                Steam
              </a>
              <span>+</span>
              <a href="https://www.igdb.com/" target="_blank" rel="noreferrer">
                IGDB
              </a>
              {state?.setup.hltb && (
                <>
                  <span>+</span>
                  <a
                    href="https://howlongtobeat.com/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    HLTB
                  </a>
                </>
              )}
            </div>
          </aside>
          <div className="main-column">
            <div className="library-stats">
              <div>
                <Library size={19} />
                <strong>{games.length || '—'}</strong>
                <span>en tu biblioteca</span>
              </div>
              <div>
                <Clock3 size={19} />
                <strong>{games.length ? pending : '—'}</strong>
                <span>pendientes</span>
              </div>
              <div>
                <Star size={19} />
                <strong>{games.length ? favorites : '—'}</strong>
                <span>favoritos</span>
              </div>
            </div>
            <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
              <div className="view-navigation">
                <TabsList variant="line" aria-label="Vista principal">
                  <TabsTrigger value="recommend">
                    <Sparkles size={17} /> Para ti
                  </TabsTrigger>
                  <TabsTrigger value="library">
                    <Library size={17} /> Tu biblioteca
                  </TabsTrigger>
                  <TabsTrigger value="shortlist">
                    <Plus size={17} /> Lista corta ({savedGames.length})
                  </TabsTrigger>
                  <TabsTrigger value="tastes">
                    <Star size={17} /> Tus gustos
                  </TabsTrigger>
                  <TabsTrigger value="history">
                    <History size={17} /> Historial
                  </TabsTrigger>
                </TabsList>
                <span className="subtle-label">
                  Una elección que encaja contigo
                </span>
              </div>
              <TabsContent value="shortlist">
                <div className="results">
                  <h2>Tus próximos candidatos</h2>
                  <p className="small-note">
                    Guarda juegos desde Para ti, el historial o la biblioteca.
                    Elegiremos entre ellos con el motor y los filtros actuales;
                    los juegos excluidos no se recomendarán.
                  </p>
                  <Button
                    disabled={!!busy || !savedGames.length || !state?.profile}
                    onClick={() => {
                      const nextFilters = { ...filters, shortlistOnly: true };
                      setFilters(nextFilters);
                      void recommend(
                        'Elige entre los juegos de mi lista corta.',
                        nextFilters,
                      );
                    }}
                  >
                    Elegir entre estos juegos
                  </Button>
                  {!savedGames.length && (
                    <p>
                      Tu lista está vacía. Pulsa «Guardar en lista corta» en
                      cualquier juego.
                    </p>
                  )}
                  <div className="library-grid">
                    {savedGames.map((game) => (
                      <article className="library-card" key={game.appId}>
                        <Cover game={game} />
                        <div className="library-card-body">
                          <h3>{game.name}</h3>
                          <p className="small-note">
                            {libraryLabel(game)} ·{' '}
                            {
                              STATUS_LABELS[
                                state?.preferences[game.appId]?.status ??
                                  'pending'
                              ]
                            }
                          </p>
                          <GameTags game={game} />
                          <p className="small-note">
                            IGDB · {formatHours(game.durationHours)} de historia
                          </p>
                          <p className="small-note">
                            HLTB · Historia: {formatHours(game.hltb?.mainHours)}{' '}
                            · Historia y extras:{' '}
                            {formatHours(game.hltb?.extraHours)} · Completista:{' '}
                            {formatHours(game.hltb?.completionHours)}
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!!busy}
                            onClick={() => void shortlist(game)}
                          >
                            Quitar de lista corta
                          </Button>
                          <a
                            className="store-link"
                            href={storeUrl(game.appId)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Ver en Steam <ArrowUpRight size={16} />
                          </a>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="tastes">
                {state && (
                  <Tastes
                    key={JSON.stringify(state.tastes)}
                    state={state}
                    busy={!!busy}
                    onSave={(settings) =>
                      action('tastes', async () => {
                        accept(await api('tastes', settings, 'PATCH'));
                      })
                    }
                  />
                )}
              </TabsContent>
              <TabsContent value="history">
                <div className="results">
                  <p className="small-note">
                    Cada consulta conserva sus filtros y resultados originales,
                    incluso después de empezar otra búsqueda o cambiar tus
                    gustos.
                  </p>
                  {!state?.history?.length && (
                    <p>Aún no hay búsquedas guardadas.</p>
                  )}
                  {state?.history?.toReversed().map((entry) => (
                    <details className="panel saved-search" key={entry.id}>
                      <summary>
                        {entry.filters.mode === 'today'
                          ? 'Para hoy'
                          : 'Próximo juego'}
                        {' · '}
                        {new Date(entry.result.at).toLocaleString('es')}
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
                          entry.filters.sessionIntent === 'continue' &&
                          'Continuar jugando o retomar una pausa · '}
                        {entry.filters.mode === 'today' &&
                          entry.filters.sessionIntent === 'start' &&
                          'Empezar un pendiente · '}
                        {entry.filters.genre || 'Cualquier género'}
                        {entry.filters.shortlistOnly && ' · Solo lista corta'}
                        {entry.filters.minReleaseDate &&
                          ` · Lanzados desde ${new Date(`${entry.filters.minReleaseDate}T00:00:00`).toLocaleDateString('es')}`}
                        {(entry.filters.tags ?? []).length > 0 &&
                          ` · Etiquetas: ${(entry.filters.tags ?? [])
                            .map((tag) => tagLabels.get(tag) ?? tag)
                            .join(', ')}`}
                        {' · '}
                        {{
                          single: 'En solitario',
                          coop: 'Cooperativo',
                          multi: 'Multijugador',
                        }[entry.filters.gameMode] || 'Cualquier modalidad'}
                        {' · '}
                        {entry.filters.replay
                          ? 'Incluye terminados y abandonados'
                          : 'Sin terminados ni abandonados'}
                        {entry.filters.mood &&
                          ` · Hoy busco: ${entry.filters.mood}`}
                      </p>
                      {entry.text && (
                        <p>
                          <strong>{entry.text}</strong>
                        </p>
                      )}
                      <p>{entry.result.message}</p>
                      <div className="results">
                        {[
                          ...entry.result.owned,
                          ...entry.result.discoveries,
                        ].map((pick) => (
                          <GamePick
                            key={pick.appId}
                            pick={pick}
                            saved={savedIds.has(pick.appId)}
                            onSaved={() => void shortlist(pick.game)}
                            status={state.preferences[pick.appId]?.status}
                            opinionPreference={state?.preferences[pick.appId]}
                            onOpinion={(change) => {
                              void preference(pick.game, change);
                            }}
                            busy={!!busy}
                            onStatus={(status) => {
                              void preference(pick.game, { status });
                            }}
                          />
                        ))}
                      </div>
                      {entry.result.warnings.map((warning) => (
                        <p className="small-note" key={warning}>
                          {warning}
                        </p>
                      ))}
                    </details>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="recommend">
                <section aria-labelledby="in-progress-title">
                  <div className="section-heading">
                    <h2 id="in-progress-title">Tus juegos en curso</h2>
                    <span>{inProgress.length} jugando o en pausa</span>
                  </div>
                  {!inProgress.length && (
                    <p className="small-note">
                      Marca «Estoy jugando» o «En pausa» en tu biblioteca o en
                      una recomendación para verlos aquí.
                    </p>
                  )}
                  <div className="library-grid">
                    {inProgress.map((game) => (
                      <article className="library-card" key={game.appId}>
                        <Cover game={game} />
                        <div className="library-card-body">
                          <h3>{game.name}</h3>
                          <p className="small-note">{libraryLabel(game)}</p>
                          <GameTags game={game} />
                          <p className="small-note">
                            HLTB · Historia: {formatHours(game.hltb?.mainHours)}{' '}
                            · IGDB: {formatHours(game.durationHours)}
                          </p>
                          <StatusControl
                            game={game}
                            status={state?.preferences[game.appId]?.status}
                            busy={!!busy}
                            onStatus={(status) => {
                              void preference(game, { status });
                            }}
                          />
                          <a
                            className="store-link"
                            href={storeUrl(game.appId)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Ver en Steam <ArrowUpRight size={16} />
                          </a>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
                {loading ? (
                  <div className="empty-state">
                    <LoaderCircle className="spin" />
                    <h2>Abriendo tu espacio…</h2>
                  </div>
                ) : !result ? (
                  <section className="empty-state">
                    <span className="empty-symbol">
                      <Gamepad2 size={42} />
                    </span>
                    <div className="eyebrow">
                      TU SIGUIENTE FAVORITO ESTÁ POR LLEGAR
                    </div>
                    <h2>
                      {games.length
                        ? 'Vamos a encontrar algo para ti.'
                        : 'Tu biblioteca es el punto de partida.'}
                    </h2>
                    <p>
                      {games.length
                        ? 'Ajusta el tiempo, cuéntanos qué te apetece y deja que tus juegos te sorprendan.'
                        : 'Conecta Steam para recuperar tus juegos. Después elegiremos una partida según tus gustos y el momento.'}
                    </p>
                    <div className="steps">
                      <span>
                        <b>01</b> Tu biblioteca
                      </span>
                      <ArrowRight size={15} />
                      <span>
                        <b>02</b> Tus ganas
                      </span>
                      <ArrowRight size={15} />
                      <span>
                        <b>03</b> A jugar
                      </span>
                    </div>
                  </section>
                ) : (
                  <div className="results">
                    <div className="result-intro">
                      <p>{result.message}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!!busy}
                        onClick={reset}
                      >
                        <RotateCcw size={15} /> Nueva búsqueda
                      </Button>
                    </div>
                    {result.owned.map((pick, i) => (
                      <GamePick
                        key={pick.appId}
                        pick={pick}
                        saved={savedIds.has(pick.appId)}
                        onSaved={() => void shortlist(pick.game)}
                        main={i === 0}
                        status={state?.preferences[pick.appId]?.status}
                        opinionPreference={state?.preferences[pick.appId]}
                        onOpinion={(change) => {
                          void preference(pick.game, change);
                        }}
                        busy={!!busy}
                        onStatus={(status) => {
                          void preference(pick.game, { status });
                        }}
                      />
                    ))}
                    {result.discoveries.length > 0 && (
                      <>
                        <div className="section-heading">
                          <h2>Fuera de tu radar</h2>
                          <span>Juegos que todavía no tienes</span>
                        </div>
                        <div className="discoveries">
                          {result.discoveries.map((pick) => (
                            <GamePick
                              key={pick.appId}
                              pick={pick}
                              saved={savedIds.has(pick.appId)}
                              onSaved={() => void shortlist(pick.game)}
                              status={state?.preferences[pick.appId]?.status}
                              opinionPreference={state?.preferences[pick.appId]}
                              onOpinion={(change) => {
                                void preference(pick.game, change);
                              }}
                              busy={!!busy}
                              onStatus={(status) => {
                                void preference(pick.game, { status });
                              }}
                            />
                          ))}
                        </div>
                      </>
                    )}
                    <p className="small-note">
                      {result.engine === 'local'
                        ? 'Motivos y afinidad: puntuación del algoritmo local.'
                        : 'Motivos y afinidad: valoración de IA.'}{' '}
                      Duraciones estimadas de IGDB y HowLongToBeat; no indican
                      cuánto dura una sesión.
                    </p>
                  </div>
                )}
                {state &&
                  (!state.setup.steam ||
                    !state.setup.igdb ||
                    !state.setup.codex) && (
                    <section className="setup-panel">
                      <div className="panel-title">
                        <span className="setup-icon">
                          <Plus size={17} />
                        </span>
                        <h2>Prepara tus conexiones</h2>
                      </div>
                      <p>
                        Guarda las credenciales en <code>.env.local</code>, en
                        la carpeta del proyecto, y vuelve a comprobarlas. Solo
                        las usa el servidor de tu PC.
                      </p>
                      <ul>
                        <li className={state.setup.codex ? 'ready' : ''}>
                          {state.setup.codex ? (
                            <Check size={16} />
                          ) : (
                            <AlertCircle size={16} />
                          )}
                          <span>
                            Codex ·{' '}
                            {state.setup.codex
                              ? 'Conectado con ChatGPT'
                              : state.setup.codexMessage}
                          </span>
                        </li>
                        <li className={state.setup.steam ? 'ready' : ''}>
                          {state.setup.steam ? (
                            <Check size={16} />
                          ) : (
                            <Plus size={16} />
                          )}
                          <span>
                            Steam ·{' '}
                            {state.setup.steam ? (
                              'Clave configurada'
                            ) : (
                              <>
                                <code>STEAM_API_KEY</code> ·{' '}
                                <a
                                  href="https://steamcommunity.com/dev/apikey"
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Obtener clave ↗
                                </a>
                              </>
                            )}
                          </span>
                        </li>
                        <li className={state.setup.igdb ? 'ready' : ''}>
                          {state.setup.igdb ? (
                            <Check size={16} />
                          ) : (
                            <Plus size={16} />
                          )}
                          <span>
                            IGDB ·{' '}
                            {state.setup.igdb ? (
                              'Credenciales configuradas'
                            ) : (
                              <>
                                <code>TWITCH_CLIENT_ID</code> y{' '}
                                <code>TWITCH_CLIENT_SECRET</code> ·{' '}
                                <a
                                  href="https://dev.twitch.tv/console/apps"
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Registrar aplicación ↗
                                </a>
                              </>
                            )}
                          </span>
                        </li>
                      </ul>
                      <p className="small-note">
                        En Twitch: tipo Confidential y URL http://localhost.
                        Codex utiliza tu cupo actual, sin clave de OpenAI.
                      </p>
                      <Button
                        variant="outline"
                        disabled={!!busy}
                        onClick={() => action('reload', load)}
                      >
                        <RefreshCw size={15} /> Comprobar conexiones
                      </Button>
                    </section>
                  )}
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
                {engine === 'codex' && (
                  <section className="conversation">
                    <div className="panel-title">
                      <MessageCircle size={18} />
                      <h2>Vamos afinando</h2>
                    </div>
                    <p>
                      Cuéntanos qué buscas o qué cambiarías de las propuestas.
                    </p>
                    {state && state.conversation.length > 0 && (
                      <details className="history">
                        <summary>
                          Conversación · {state.conversation.length} consultas
                        </summary>
                        {state.conversation.map((t, i) => (
                          <div key={i}>
                            <strong>
                              {t.text ||
                                (t.filters.mode === 'today'
                                  ? 'Una partida para hoy'
                                  : 'Mi próximo juego')}
                            </strong>
                            <p>{t.result.message}</p>
                          </div>
                        ))}
                      </details>
                    )}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void recommend();
                      }}
                    >
                      <label className="sr-only" htmlFor="message">
                        Mensaje para afinar la recomendación
                      </label>
                      <Textarea
                        id="message"
                        maxLength={2000}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Por ejemplo: hoy prefiero explorar sin prisas, nada competitivo…"
                      />
                      <Button
                        type="submit"
                        disabled={!canRecommend || !!busy}
                        aria-label="Enviar mensaje"
                      >
                        <ArrowRight size={20} />
                      </Button>
                    </form>
                    <div className="chat-footnote">
                      <span>
                        <span className="status-dot" /> Codex · {codex.model} ·{' '}
                        {codex.effort}
                      </span>
                      <span>
                        {busy === 'recommend'
                          ? 'Puede tardar hasta dos minutos'
                          : 'Tus filtros se mantienen en cada consulta'}
                      </span>
                    </div>
                  </section>
                )}
              </TabsContent>
              <TabsContent value="library">
                <Choice
                  id="library-owner"
                  label="Biblioteca"
                  value={libraryOwner}
                  onChange={(value) => {
                    setLibraryOwner(value);
                    setLimit(36);
                  }}
                  options={[
                    { value: '', label: 'Todas mis bibliotecas' },
                    { value: 'own', label: 'Mis juegos propios' },
                    { value: 'shared', label: 'Solo juegos compartidos' },
                    ...(state?.family?.members ?? [])
                      .filter((m) => m.steamId !== state?.profile?.steamId)
                      .map((m) => ({
                        value: m.steamId,
                        label: 'Biblioteca de ' + m.name,
                      })),
                  ]}
                />
                <Choice
                  id="library-tag"
                  label="Etiqueta Steam"
                  value={libraryTag}
                  onChange={(value) => {
                    setLibraryTag(value);
                    setLimit(36);
                  }}
                  options={[
                    { value: '', label: 'Todas las etiquetas' },
                    ...steamTags,
                  ]}
                />
                <Choice
                  id="library-order"
                  label="Ordenar por"
                  value={libraryOrderBy}
                  onChange={(value) => {
                    setLibraryOrderBy(value as LibraryOrderBy);
                    setLimit(36);
                  }}
                  options={[
                    { value: 'original', label: 'Orden original' },
                    { value: 'name', label: 'Nombre (A-Z)' },
                    {
                      value: 'release-newest',
                      label: 'Lanzamiento: más recientes',
                    },
                    {
                      value: 'release-oldest',
                      label: 'Lanzamiento: más antiguos',
                    },
                    { value: 'playtime-most', label: 'Más horas jugadas' },
                    { value: 'playtime-least', label: 'Menos horas jugadas' },
                    { value: 'recent-most', label: 'Más actividad reciente' },
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
                />
                <div className="library-toolbar">
                  <h2>
                    Tus juegos <span>{filtered.length}</span>
                  </h2>
                  <label className="sr-only" htmlFor="search">
                    Buscar en tu biblioteca
                  </label>
                  <Input
                    id="search"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setLimit(36);
                    }}
                    placeholder="Buscar un juego o etiqueta…"
                  />
                </div>
                <p className="small-note">
                  Marca tus favoritos y corrige el estado de tus juegos. Las
                  horas no deciden por ti.
                </p>
                {!filtered.length && (
                  <div className="empty-state">
                    <Library size={35} />
                    <h2>
                      {games.length
                        ? 'No hay juegos que coincidan con esta búsqueda y biblioteca.'
                        : 'Tu biblioteca aparecerá aquí.'}
                    </h2>
                  </div>
                )}
                <div className="library-grid">
                  {ordered.slice(0, limit).map((game) => {
                    const pref = state?.preferences[game.appId] ?? {
                      status: 'pending',
                      favorite: false,
                    };
                    return (
                      <article className="library-card" key={game.appId}>
                        <Cover game={game} />
                        <div className="library-card-body">
                          <h3>{game.name}</h3>
                          <p className="small-note">{libraryLabel(game)}</p>
                          <GameTags game={game} />
                          <p className="small-note">
                            {game.playtimeMinutes === null
                              ? 'Horas no disponibles'
                              : (game.playtimeMinutes / 60).toLocaleString(
                                  'es',
                                  { maximumFractionDigits: 1 },
                                ) + ' h jugadas'}
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!!busy}
                            aria-pressed={savedIds.has(game.appId)}
                            onClick={() => void shortlist(game)}
                          >
                            {savedIds.has(game.appId)
                              ? 'Quitar de lista corta'
                              : 'Guardar en lista corta'}
                          </Button>
                          <div className="preference-controls">
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={!!busy}
                              aria-label={'Favorito: ' + game.name}
                              aria-pressed={pref.favorite}
                              onClick={() =>
                                preference(game, { favorite: !pref.favorite })
                              }
                              className={pref.favorite ? 'favorite' : ''}
                            >
                              <Star
                                size={17}
                                fill={pref.favorite ? 'currentColor' : 'none'}
                              />
                            </Button>
                            <StatusControl
                              game={game}
                              status={pref.status}
                              busy={!!busy}
                              onStatus={(status) => {
                                void preference(game, { status });
                              }}
                            />
                          </div>
                          <GameOpinion
                            key={JSON.stringify(pref)}
                            game={game}
                            preference={pref}
                            busy={!!busy}
                            onSave={(change) => {
                              void preference(game, change);
                            }}
                          />
                        </div>
                      </article>
                    );
                  })}
                </div>
                {filtered.length > limit && (
                  <Button
                    variant="outline"
                    className="load-more"
                    onClick={() => setLimit(limit + 36)}
                  >
                    Mostrar más juegos
                  </Button>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
      <footer className="footer">
        <span>
          nextplay. <span>Un juego para cada momento.</span>
        </span>
        <span>Hecho para disfrutar de tu biblioteca.</span>
      </footer>
    </div>
  );
}
