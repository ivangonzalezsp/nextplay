'use client';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import Tastes from './tastes';
// Covers already use source thumbnails; this local Node app has no image optimizer.
/* oxlint-disable next/no-img-element */
import {
  ArrowUpRight,
  ArrowRight,
  Gamepad2,
  Library,
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
  DEFAULT_FILTERS,
  STATUS_LABELS,
  storeUrl,
  inLibrary,
  libraryLabel,
} from '@/lib/model';
import type {
  Filters,
  Game,
  GameStatus,
  Pick,
  Preference,
  Recommendation,
  Snapshot,
} from '@/lib/model';

async function api(path: string, body?: unknown, method = 'POST') {
  const response = await fetch(
    '/api/' + path,
    body === undefined
      ? undefined
      : {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || 'No se ha podido completar la solicitud.');
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
          onError={() => setFailed(true)}
        />
      ) : (
        <Gamepad2 aria-hidden="true" />
      )}
    </div>
  );
}
function GamePick({
  pick,
  main,
}: {
  pick: Pick & { game: Game };
  main?: boolean;
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
          <span>
            {game.durationHours
              ? '≈ ' + game.durationHours + ' h de historia'
              : 'Duración sin datos'}
          </span>
        </div>
        <p>{pick.reason}</p>
        <p>{pick.whyNow}</p>
        <p className="caveat">
          <strong>A tener en cuenta: </strong>
          {pick.caveat}
        </p>
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
  const [profileUrl, setProfileUrl] = useState(
    'https://steamcommunity.com/id/fineku/',
  );
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [libraryOwner, setLibraryOwner] = useState('');
  const [limit, setLimit] = useState(36);
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Recommendation | null>(null);
  const [tab, setTab] = useState('recommend');
  const activeFilters = useRef(filters);
  useEffect(() => {
    activeFilters.current = filters;
  }, [filters]);
  function accept(next: Snapshot) {
    setState(next);
    setResult(next.conversation.at(-1)?.result ?? null);
  }
  async function load() {
    const next: Snapshot = await api('state');
    accept(next);
    setFilters(next.filters);
    if (next.profile) setProfileUrl(next.profile.url);
  }
  useEffect(() => {
    void api('state')
      .then((next: Snapshot) => {
        accept(next);
        setFilters(next.filters);
        if (next.profile) setProfileUrl(next.profile.url);
      })
      .catch((e) => setError(e.message))
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
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: object) => {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {
        /* Ordinary browsers do not need WebMCP. */
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
        if (!input || typeof input !== 'object' || Object.keys(input).length)
          throw new Error('Este comando no acepta parámetros.');
        const next: Snapshot = await api('state');
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
        "Request recommendations using the current visible filters and a message; updates the visible results and saves the conversation. Consumes the local user's Codex quota.",
      inputSchema: {
        type: 'object',
        properties: { message: { type: 'string', maxLength: 2000 } },
        required: ['message'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input: unknown) {
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
    setBusy(name);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'No se ha podido completar la solicitud.',
      );
    } finally {
      setBusy('');
    }
  }
  async function sync() {
    await action('sync', async () => {
      accept(await api('steam/sync', { profileUrl, force: true }));
    });
  }
  async function recommend(message = text) {
    await action('recommend', async () => {
      accept(await api('recommendations', { filters, text: message }));
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
  async function reset() {
    await action('reset', async () => {
      accept(await api('conversation/reset', { filters }));
      setText('');
    });
  }
  const games = state?.games ?? [];
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
  const filtered = games.filter(
    (g) =>
      g.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
      (!libraryOwner ||
        (libraryOwner === 'own'
          ? g.owned
          : libraryOwner === 'shared'
            ? g.shared
            : g.ownerSteamIds?.includes(libraryOwner))),
  );
  const canRecommend = games.length > 0 && state?.setup.codex;
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
                  <TabsTrigger value="tastes">
                    <Star size={17} /> Tus gustos
                  </TabsTrigger>
                </TabsList>
                <span className="subtle-label">
                  Una elección que encaja contigo
                </span>
              </div>
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
              <TabsContent value="recommend">
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
                      <GamePick key={pick.appId} pick={pick} main={i === 0} />
                    ))}
                    {result.discoveries.length > 0 && (
                      <>
                        <div className="section-heading">
                          <h2>Fuera de tu radar</h2>
                          <span>Juegos que todavía no tienes</span>
                        </div>
                        <div className="discoveries">
                          {result.discoveries.map((pick) => (
                            <GamePick key={pick.appId} pick={pick} />
                          ))}
                        </div>
                      </>
                    )}
                    <p className="small-note">
                      Motivos y afinidad: valoración de IA. Duraciones estimadas
                      de IGDB; no indican cuánto dura una sesión.
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
                      <span className="status-dot" /> Codex · tu cuenta
                    </span>
                    <span>
                      {busy === 'recommend'
                        ? 'Puede tardar hasta dos minutos'
                        : 'Tus filtros se mantienen en cada consulta'}
                    </span>
                  </div>
                </section>
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
                    placeholder="Buscar un juego…"
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
                  {filtered.slice(0, limit).map((game) => {
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
                          <p className="small-note">
                            {game.playtimeMinutes === null
                              ? 'Horas no disponibles'
                              : (game.playtimeMinutes / 60).toLocaleString(
                                  'es',
                                  { maximumFractionDigits: 1 },
                                ) + ' h jugadas'}
                          </p>
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
                            <Select
                              value={pref.status}
                              onValueChange={(v) =>
                                preference(game, { status: v as GameStatus })
                              }
                              disabled={!!busy}
                              items={Object.entries(STATUS_LABELS).map(
                                ([value, label]) => ({ value, label }),
                              )}
                            >
                              <SelectTrigger
                                aria-label={'Estado de ' + game.name}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(STATUS_LABELS).map(
                                  ([key, label]) => (
                                    <SelectItem key={key} value={key}>
                                      {label}
                                    </SelectItem>
                                  ),
                                )}
                              </SelectContent>
                            </Select>
                          </div>
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
