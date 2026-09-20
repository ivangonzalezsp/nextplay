import {
  AppError,
  config,
  dataDir,
  exclusive,
  readState,
  saveState,
} from './store.ts';
import { isMaintenance } from './store.ts';
import { appStatus, manageApp } from './desktop.ts';
import { appVersion } from './updates.ts';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import {
  DAY,
  discover,
  enrich,
  getCache,
  getIgdbGame,
  searchIgdb,
  review,
  saveCache,
  syncSteam,
} from './sources.ts';
import {
  parseFilters,
  parseEngine,
  recommendLocally,
  comfortSelection,
  parseCodexSettings,
  parsePreference,
  parseProfile,
  parseTastes,
  selectCandidates,
  validatePicks,
  updateShortlist,
} from './selection.ts';
import { askCodex, buildPrompt, codexStatus } from './codex.ts';
import {
  DEFAULT_CODEX_SETTINGS,
  tracksSteamAchievements,
} from '../lib/model.ts';
import { openDatabase, writeSteamAchievements } from './database.ts';
import { syncSteamTags } from './steam-tags-sync.ts';
import { SteamTagsError } from './steam-tags.ts';
import {
  ACHIEVEMENTS_INTERVAL,
  fetchSteamAchievements,
} from './steam-achievements.ts';
import type {
  Game,
  RecommendationProgress,
  RecommendationStreamFrame,
  Snapshot,
  State,
  Turn,
} from '../lib/model.ts';
import { buildTasteProfile } from '../lib/tastes.ts';
import {
  calendarDateAt,
  dateInputValue,
  recordPreference,
} from '../lib/play-history.ts';
import { inLibrary } from '../lib/model.ts';
import { log, logError } from '../lib/log.ts';
import {
  expireHltbCache,
  getHltbCache,
  hltbAvailable,
  pendingHltb,
  refreshHltb,
  withHltb,
} from './hltb.ts';
import {
  mergeLibraries,
  refreshLibraries,
  retainedFamilyGames,
} from './family.ts';

const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
const responseHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
};
type ProgressListener = (progress: RecommendationProgress) => void;
const publicProgressKeys = new Set([
  'available',
  'candidates',
  'count',
  'discoveries',
  'eligible',
  'failed',
  'games',
  'kind',
  'library',
  'offset',
  'owned',
  'status',
  'summary',
  'tool',
  'total',
  'warnings',
]);
function publicProgress(progress: RecommendationProgress) {
  const details = progress.details
    ? Object.fromEntries(
        Object.entries(progress.details).filter(([key]) =>
          publicProgressKeys.has(key),
        ),
      )
    : undefined;
  return {
    event: progress.event,
    ...(details && Object.keys(details).length ? { details } : {}),
  } satisfies RecommendationProgress;
}
export function streamRecommendations(request: Request): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (frame: RecommendationStreamFrame) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(frame) + '\n'));
        } catch {
          /* The browser may have closed the stream. */
        }
      };
      const close = () => {
        try {
          controller.close();
        } catch {
          /* The stream may already be closed. */
        }
      };
      let inner: Request;
      try {
        inner = new Request(
          new URL('/api/recommendations', request.url),
          request.clone(),
        );
      } catch {
        send({
          type: 'error',
          error: 'El contenido de la solicitud no es válido.',
        });
        close();
        return;
      }
      void handle(
        inner,
        (progress) => send({ type: 'progress', ...publicProgress(progress) }),
        request.signal,
      )
        .then(async (response) => {
          let payload: unknown;
          try {
            payload = await response.json();
          } catch {
            send({
              type: 'error',
              error: 'La respuesta de Next Play no es válida.',
              status: response.status,
            });
            return;
          }
          if (response.ok) {
            send({ type: 'result', data: payload as Snapshot });
            return;
          }
          send({
            type: 'error',
            error:
              payload &&
              typeof payload === 'object' &&
              'error' in payload &&
              typeof payload.error === 'string'
                ? payload.error
                : 'No se ha podido completar la recomendación.',
            status: response.status,
          });
        })
        .catch((error: unknown) =>
          send({
            type: 'error',
            error:
              error instanceof Error
                ? error.message
                : 'No se ha podido completar la recomendación.',
          }),
        )
        .finally(close);
    },
  });
  return new Response(stream, {
    headers: {
      ...responseHeaders,
      'Content-Type': 'application/x-ndjson; charset=utf-8',
    },
  });
}
function isPrivateIpv4(hostname: string) {
  const parts = hostname.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part)))
    return false;
  const [a, b, c, d] = parts.map(Number);
  if ([a, b, c, d].some((part) => part > 255)) return false;
  return (
    a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  );
}
export function verifyRequest(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get('host');
  if (
    (!localHosts.has(url.hostname) && !isPrivateIpv4(url.hostname)) ||
    (host && host !== url.host)
  )
    throw new AppError('Acceso permitido únicamente desde la red local.', 403);
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin)
    throw new AppError('Origen de solicitud no permitido.', 403);
  if (request.headers.get('sec-fetch-site') === 'cross-site')
    throw new AppError('Acceso desde otra web no permitido.', 403);
  if (
    request.method !== 'GET' &&
    request.headers.get('content-type')?.split(';')[0] !== 'application/json'
  )
    throw new AppError('Se requiere una solicitud JSON.', 415);
}
async function body(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get('content-length')) > 16000)
    throw new AppError('La solicitud es demasiado grande.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError('Falta el contenido de la solicitud.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16000) {
      await reader.cancel();
      throw new AppError('La solicitud es demasiado grande.', 413);
    }
    chunks.push(value);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error();
    return value;
  } catch {
    throw new AppError('El contenido de la solicitud no es válido.');
  }
}
async function snapshot(
  state: State,
  warnings: string[] = [],
): Promise<Snapshot> {
  const c = await config();
  const durations = await getHltbCache();
  const visible: State = {
    ...state,
    games: withHltb(state.games, durations),
    ...(state.shortlist
      ? { shortlist: withHltb(state.shortlist, durations) }
      : {}),
  };
  return {
    ...visible,
    tasteProfile: buildTasteProfile(visible),
    setup: {
      steam: !!c.steam,
      family: !!c.familyToken,
      igdb: !!c.clientId && !!c.clientSecret,
      hltb: await hltbAvailable(),
      codexModel: c.model,
      codexEffort: DEFAULT_CODEX_SETTINGS.effort,
      ...(await codexStatus()),
    },
    warnings,
  };
}
async function saveRecommendation(state: State, turn: Turn) {
  const next: State = {
    ...state,
    filters: turn.filters,
    engine: turn.result.engine ?? 'codex',
    conversation: [...state.conversation, turn],
    history: [...(state.history ?? []), { ...turn, id: randomUUID() }],
  };
  await saveState(next);
  return snapshot(next, turn.result.warnings);
}
export async function handle(
  request: Request,
  onProgress?: ProgressListener,
  signal: AbortSignal = request.signal,
): Promise<Response> {
  const started = Date.now();
  const path = new URL(request.url).pathname;
  if (path === '/api/recommendations/stream' && request.method === 'POST')
    return streamRecommendations(request);
  const requestInfo = { method: request.method, path };
  const publish = (progress: RecommendationProgress) => {
    try {
      onProgress?.(progress);
    } catch {
      /* Progress reporting must never fail the recommendation. */
    }
  };
  const ensureActive = () => {
    // ponytail: source refreshes finish at their await boundary; this guard avoids threading signals through every source.
    if (signal.aborted) throw new AppError('La búsqueda se ha detenido.', 499);
  };
  const phase = (event: string, details?: Record<string, unknown>) => {
    ensureActive();
    log('server', event, { path, ...details });
    publish({ event, ...(details ? { details } : {}) });
  };
  const notify = (event: string, details?: Record<string, unknown>) =>
    publish({ event, ...(details ? { details } : {}) });
  const complete = (response: Response) => {
    log('server', 'request:complete', {
      ...requestInfo,
      status: response.status,
      ms: Date.now() - started,
    });
    return response;
  };
  log('server', 'request:start', requestInfo);
  const headers = responseHeaders;
  try {
    phase('request:validate');
    verifyRequest(request);
    if (path === '/api/health' && request.method === 'GET')
      return complete(
        Response.json(
          {
            application: 'nextplay',
            version: appVersion(),
            instance: process.env.NEXTPLAY_INSTANCE,
          },
          { headers },
        ),
      );
    if (isMaintenance())
      throw new AppError(
        'Next Play se está reiniciando. Espera un momento.',
        503,
      );
    if (path === '/api/app' && request.method === 'GET')
      return complete(Response.json(await appStatus(request), { headers }));
    if (path === '/api/connections' || path.startsWith('/api/app/'))
      return complete(
        Response.json(await manageApp(request, await body(request)), {
          headers,
        }),
      );
    if (path === '/api/igdb/search' && request.method === 'GET') {
      const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
      if (
        query.length < 2 ||
        query.length > 100 ||
        query.split('').some((char) => char < ' ')
      )
        throw new AppError('Busca un título de entre 2 y 100 caracteres.');
      return complete(
        Response.json({ games: await searchIgdb(query) }, { headers }),
      );
    }
    if (path === '/api/state' && request.method === 'GET') {
      phase('state:read:start');
      const next = await snapshot(await readState());
      phase('state:read:complete', {
        games: next.games.length,
        conversation: next.conversation.length,
      });
      return complete(Response.json(next, { headers }));
    }
    phase('request:body:start');
    const payload = await body(request);
    phase('request:body:complete', { fields: Object.keys(payload) });
    const result = await exclusive(async () => {
      phase('operation:start');
      const state = await readState();
      phase('state:loaded', {
        games: state.games.length,
        conversation: state.conversation.length,
        hasProfile: !!state.profile,
      });
      if (path === '/api/library/games' && request.method === 'POST') {
        if (
          typeof payload.igdbId !== 'number' ||
          !Number.isSafeInteger(payload.igdbId) ||
          payload.igdbId <= 0
        )
          throw new AppError('Selecciona un juego de los resultados de IGDB.');
        if (
          typeof payload.platform !== 'string' ||
          !payload.platform.trim() ||
          payload.platform.trim().length > 80 ||
          payload.platform.split('').some((char) => char < ' ') ||
          payload.platform.trim().toLowerCase() === 'steam'
        )
          throw new AppError(
            'Indica una plataforma distinta de Steam (máximo 80 caracteres).',
          );
        const platform = payload.platform.trim();
        const preference = parsePreference({
          status: payload.status,
          favorite: false,
        });
        if (
          state.games.some(
            (game) =>
              game.appId < 0 &&
              game.igdbId === payload.igdbId &&
              game.platform?.toLowerCase() === platform.toLowerCase(),
          )
        )
          throw new AppError(
            'Ya tienes ese juego en esa plataforma. Puedes cambiar su estado en tu biblioteca.',
            409,
          );
        const game: Game = {
          ...(await getIgdbGame(payload.igdbId)),
          appId:
            state.games.reduce(
              (lowest, game) => Math.min(lowest, game.appId),
              0,
            ) - 1,
          platform,
          owned: true,
          playtimeMinutes: null,
          recentMinutes: null,
        };
        state.games.push(game);
        recordPreference(state, game, preference);
        await saveState(state);
        return snapshot(state);
      }
      if (path === '/api/library/games' && request.method === 'DELETE') {
        if (
          typeof payload.appId !== 'number' ||
          !Number.isSafeInteger(payload.appId) ||
          payload.appId >= 0
        )
          throw new AppError(
            'Solo se pueden borrar juegos añadidos manualmente.',
          );
        if (!state.games.some((game) => game.appId === payload.appId))
          throw new AppError(
            'Ese juego manual ya no está en tu biblioteca.',
            404,
          );
        state.games = state.games.filter(
          (game) => game.appId !== payload.appId,
        );
        state.shortlist = state.shortlist?.filter(
          (game) => game.appId !== payload.appId,
        );
        delete state.preferences[String(payload.appId)];
        state.playHistory = state.playHistory?.filter(
          (event) => event.appId !== payload.appId,
        );
        if (state.tastes)
          state.tastes.ignoredHours = state.tastes.ignoredHours.filter(
            (appId) => appId !== payload.appId,
          );
        await saveState(state);
        return snapshot(state);
      }
      if (path === '/api/tastes' && request.method === 'PATCH') {
        phase('tastes:update:start');
        state.tastes = parseTastes(payload, state);
        await saveState(state);
        const next = await snapshot(state);
        phase('tastes:update:complete');
        return next;
      }
      if (path === '/api/state' && request.method === 'PATCH') {
        phase('preference:update:start', { appId: payload.appId });
        if (
          typeof payload.appId !== 'number' ||
          !Number.isSafeInteger(payload.appId) ||
          (!state.games.some((g) => g.appId === payload.appId) &&
            ![...state.conversation, ...(state.history ?? [])].some((turn) =>
              [...turn.result.owned, ...turn.result.discoveries].some(
                (p) => p.appId === payload.appId,
              ),
            ))
        )
          throw new AppError(
            'Ese juego no pertenece a la biblioteca sincronizada.',
          );
        const game =
          state.games.find((g) => g.appId === payload.appId) ??
          [...state.conversation, ...(state.history ?? [])]
            .flatMap((turn) => [
              ...turn.result.owned,
              ...turn.result.discoveries,
            ])
            .find((pick) => pick.appId === payload.appId)!.game;
        recordPreference(state, game, parsePreference(payload.preference));
        await saveState(state);
        const next = await snapshot(state);
        phase('preference:update:complete', { appId: payload.appId });
        return next;
      }
      if (
        path === '/api/steam/achievements/sync' &&
        request.method === 'POST'
      ) {
        const force = payload.force === true;
        if (payload.force !== undefined && typeof payload.force !== 'boolean')
          throw new AppError(
            'La opción de actualización de logros no es válida.',
          );
        if (!state.profile)
          throw new AppError('Conecta primero tu perfil de Steam.', 422);
        const active = state.games.filter(
          (game) =>
            game.appId > 0 &&
            tracksSteamAchievements(state.preferences[game.appId]?.status),
        );
        let games = active;
        if (payload.appId !== undefined) {
          if (
            typeof payload.appId !== 'number' ||
            !Number.isSafeInteger(payload.appId) ||
            payload.appId <= 0
          )
            throw new AppError(
              'El juego para actualizar los logros no es válido.',
            );
          games = active.filter((game) => game.appId === payload.appId);
          if (!games.length)
            throw new AppError(
              'Los logros solo se siguen en juegos que estás jugando, tienes en pausa o has terminado.',
              422,
            );
        }
        const c = await config();
        const db = openDatabase(join(dataDir(), 'library.sqlite'));
        try {
          for (const game of games) {
            const cached = game.steamAchievements;
            if (
              !force &&
              cached &&
              Date.now() - cached.at < ACHIEVEMENTS_INTERVAL
            )
              continue;
            const data = await fetchSteamAchievements(
              state.profile.steamId,
              c.steam,
              game.appId,
            );
            writeSteamAchievements(db, game.appId, data);
          }
        } finally {
          db.close();
        }
        return snapshot(await readState());
      }
      if (path === '/api/steam/tags/sync' && request.method === 'POST') {
        phase('steam:tags:sync:start', { force: payload.force });
        if (payload.force !== undefined && typeof payload.force !== 'boolean')
          throw new AppError(
            'La opción de actualización de etiquetas no es válida.',
          );
        if (!state.games.some((game) => game.appId > 0))
          throw new AppError(
            'Sincroniza primero una biblioteca de Steam con juegos.',
            422,
          );
        let result;
        try {
          result = await syncSteamTags({
            force: payload.force === true,
            onLog: (message) => phase('steam:tags:sync:log', { message }),
          });
        } catch (error) {
          if (error instanceof SteamTagsError)
            throw new AppError(error.message, 502);
          throw error;
        }
        if (result.stopReason === 'rate-limit')
          throw new AppError(
            'Steam ha limitado la carga de etiquetas. Se han conservado los avances; inténtalo más tarde.',
            429,
          );
        if (result.stopReason === 'interrumpido')
          throw new AppError('La carga de etiquetas se ha interrumpido.', 409);
        phase('steam:tags:sync:complete', result);
        return snapshot(await readState());
      }
      if (path === '/api/hltb/sync' && request.method === 'POST') {
        if (
          payload.allMissing !== undefined &&
          typeof payload.allMissing !== 'boolean'
        )
          throw new AppError('La opción de búsqueda HLTB no es válida.');
        if (payload.allMissing === true) {
          if (!(await hltbAvailable()))
            throw new AppError(
              'HowLongToBeat no está disponible en este entorno.',
              503,
            );
          const durations = await getHltbCache();
          const candidates = pendingHltb(state.games, durations);
          const warnings = await refreshHltb(candidates, durations);
          const nextDurations = await getHltbCache();
          const remaining = pendingHltb(
            state.games,
            nextDurations,
          ).length;
          const progressed = remaining < candidates.length;
          phase('hltb:refresh:complete', {
            games: candidates.length - remaining,
            remaining,
          });
          return {
            ...(await snapshot(state, warnings)),
            hltbSync: {
              remaining,
              stopped: candidates.length > 0 && !progressed,
            },
          };
        }
        const appId = payload.appId;
        if (
          typeof appId !== 'number' ||
          !Number.isSafeInteger(appId) ||
          appId <= 0
        )
          throw new AppError('El juego para actualizar HLTB no es válido.');
        const game = state.games.find((candidate) => candidate.appId === appId);
        if (!game)
          throw new AppError(
            'Ese juego no pertenece a tu biblioteca de Steam.',
            404,
          );
        if (!(await hltbAvailable()))
          throw new AppError(
            'HowLongToBeat no está disponible en este entorno.',
            503,
          );
        phase('hltb:refresh:start', { appId });
        const durations = await getHltbCache();
        const warnings = await refreshHltb([game], durations, true);
        phase('hltb:refresh:complete', {
          appId,
          found: Boolean(durations[appId]?.data),
        });
        return snapshot(state, warnings);
      }
      if (path === '/api/play-history' && request.method === 'PATCH') {
        const events = state.playHistory ?? [];
        const at = calendarDateAt(payload.date);
        if (
          typeof payload.index !== 'number' ||
          !Number.isSafeInteger(payload.index) ||
          payload.index < 0 ||
          !events[payload.index] ||
          at === null ||
          dateInputValue(at) > dateInputValue(Date.now())
        )
          throw new AppError('La fecha del cambio de estado no es válida.');
        events[payload.index].at = at;
        await saveState(state);
        return snapshot(state);
      }
      if (path === '/api/shortlist' && request.method === 'PATCH') {
        updateShortlist(state, payload.appId, payload.saved);
        await saveState(state);
        return snapshot(state);
      }
      if (path === '/api/conversation/reset' && request.method === 'POST') {
        phase('conversation:reset:start');
        state.filters = parseFilters(payload.filters);
        state.conversation = [];
        await saveState(state);
        const next = await snapshot(state);
        phase('conversation:reset:complete');
        return next;
      }
      if (path === '/api/steam/sync' && request.method === 'POST') {
        phase('steam:sync:start', { force: payload.force });
        const parsed = parseProfile(payload.profileUrl);
        if (typeof payload.force !== 'boolean')
          throw new AppError('La opción de actualización no es válida.');
        if (
          !payload.force &&
          state.profile?.url === parsed.url &&
          state.syncedAt &&
          Date.now() - state.syncedAt < DAY
        )
          return snapshot(state);
        const c = await config();
        const fresh = await syncSteam(parsed.url, c.steam);
        phase('steam:sync:profile-complete', {
          games: fresh.games.length,
          warnings: fresh.warnings.length,
        });
        if (state.profile && state.profile.steamId !== fresh.profile.steamId)
          throw new AppError(
            'Esta app conserva un único perfil. Usa el perfil ya conectado para mantener sus preferencias.',
            409,
          );
        const cache = await getCache();
        const warnings = [...fresh.warnings];
        let next: State = {
          ...state,
          profile: fresh.profile,
          games: mergeLibraries(
            [...fresh.games, ...state.games.filter((game) => game.appId < 0)],
            retainedFamilyGames(state),
            fresh.profile.steamId,
          ),
          syncedAt: Date.now(),
        };
        if (c.familyToken) {
          phase('steam:family:refresh:start');
          try {
            const refreshed = await refreshLibraries(next, c, {
              own: false,
              family: true,
            });
            next = refreshed.state;
            warnings.push(...refreshed.warnings);
            phase('steam:family:refresh:complete', {
              games: next.games.length,
              warnings: refreshed.warnings.length,
            });
          } catch (e) {
            phase('steam:family:refresh:failed');
            logError('server', 'steam:family:refresh:error', e, {
              path,
            });
            warnings.push(
              e instanceof AppError
                ? e.message
                : 'No se ha actualizado Steam Families. Se conserva su última biblioteca.',
            );
          }
        } else if (next.family)
          warnings.push(
            'Falta el token de Steam Families. Se conserva su última biblioteca guardada.',
          );
        phase('steam:enrich:start', { games: next.games.length });
        const enriched = await enrich(next.games, cache, payload.force);
        next.games = enriched.games;
        phase('steam:enrich:complete', {
          games: enriched.games.length,
          warnings: enriched.warnings.length,
        });
        if (payload.force) {
          cache.reviewsRefreshAfter = Date.now();
          await expireHltbCache();
        }
        await saveCache(cache);
        await saveState(next);
        const result = await snapshot(next, [
          ...warnings,
          ...enriched.warnings,
        ]);
        phase('steam:sync:complete', {
          games: result.games.length,
          warnings: result.warnings.length,
        });
        return result;
      }
      if (path === '/api/steam/family/sync' && request.method === 'POST') {
        phase('steam:family:sync:start');
        const refreshed = await refreshLibraries(state, await config(), {
          own: false,
          family: true,
        });
        phase('steam:family:sync:library-complete', {
          games: refreshed.state.games.length,
          warnings: refreshed.warnings.length,
        });
        const cache = await getCache();
        const enriched = await enrich(refreshed.state.games, cache);
        const next = {
          ...refreshed.state,
          games: enriched.games,
        };
        await saveCache(cache);
        await saveState(next);
        const result = await snapshot(next, [
          ...refreshed.warnings,
          ...enriched.warnings,
        ]);
        phase('steam:family:sync:complete', {
          games: result.games.length,
          warnings: result.warnings.length,
        });
        return result;
      }
      if (path === '/api/recommendations' && request.method === 'POST') {
        phase('recommendations:start', {
          messageLength:
            typeof payload.text === 'string' ? payload.text.length : undefined,
        });
        const filters = parseFilters(payload.filters);
        if (typeof payload.text !== 'string' || payload.text.length > 2000)
          throw new AppError(
            'El mensaje no puede superar los 2000 caracteres.',
          );
        if (!state.profile && !state.games.some(inLibrary))
          throw new AppError(
            'Añade un juego o conecta tu perfil de Steam antes de pedir recomendaciones.',
          );
        const engine = parseEngine(
          payload.engine === undefined
            ? (state.engine ?? 'codex')
            : payload.engine,
        );
        const reference =
          payload.referenceAppId === undefined
            ? undefined
            : [
                ...state.games,
                ...(state.history ?? []).flatMap((turn) =>
                  [...turn.result.owned, ...turn.result.discoveries].map(
                    (pick) => pick.game,
                  ),
                ),
                ...state.conversation.flatMap((turn) =>
                  [...turn.result.owned, ...turn.result.discoveries].map(
                    (pick) => pick.game,
                  ),
                ),
              ].find((game) => game.appId === payload.referenceAppId);
        if (
          payload.referenceAppId !== undefined &&
          (!Number.isSafeInteger(payload.referenceAppId) || !reference)
        )
          throw new AppError(
            'El juego de referencia no está disponible. Vuelve a seleccionarlo.',
          );
        if (reference && engine !== 'codex')
          throw new AppError(
            'Algo como este necesita Codex para interpretar qué conservar o cambiar.',
          );
        if (engine === 'local') {
          phase('recommendations:local:start');
          state.games = withHltb(state.games, await getHltbCache());
          state.shortlist = withHltb(
            state.shortlist ?? [],
            await getHltbCache(),
          );
          const recommendation = recommendLocally(state, filters);
          if (payload.text.trim())
            recommendation.warnings.push(
              'El mensaje no se interpreta en modo local; usa los filtros y Tus gustos.',
            );
          ensureActive();
          const next = await saveRecommendation(state, {
            text: payload.text.trim(),
            filters,
            result: recommendation,
          });
          phase('recommendations:local:complete', {
            owned: recommendation.owned.length,
            discoveries: recommendation.discoveries.length,
          });
          return next;
        }
        const warnings: string[] = [];
        const c = await config();
        const codex = parseCodexSettings(
          payload.codex,
          parseCodexSettings(state.codex, {
            model: c.model,
            effort: DEFAULT_CODEX_SETTINGS.effort,
          }),
        );
        phase('recommendations:settings', {
          filters,
          model: codex.model,
          effort: codex.effort,
        });
        // Refresh an expired library only on a user request; failed refreshes keep the snapshot.
        if (state.syncedAt && Date.now() - state.syncedAt >= DAY) {
          phase('recommendations:library-refresh:start');
          try {
            const fresh = await refreshLibraries(state, c, {
              own: true,
              family: false,
            });
            Object.assign(state, fresh.state);
            warnings.push(...fresh.warnings);
            phase('recommendations:library-refresh:complete', {
              games: state.games.length,
              warnings: fresh.warnings.length,
            });
          } catch (e) {
            phase('recommendations:library-refresh:failed');
            logError('server', 'recommendations:library-refresh:error', e, {
              path,
            });
            warnings.push(
              'No se ha podido refrescar Steam. Se usa la última biblioteca guardada, que puede estar desactualizada.',
            );
          }
        }
        if (
          state.profile &&
          c.familyToken &&
          (!state.family || Date.now() - state.family.syncedAt >= DAY)
        ) {
          phase('recommendations:family-refresh:start');
          try {
            const fresh = await refreshLibraries(state, c, {
              own: false,
              family: true,
            });
            Object.assign(state, fresh.state);
            warnings.push(...fresh.warnings);
            phase('recommendations:family-refresh:complete', {
              games: state.games.length,
              warnings: fresh.warnings.length,
            });
          } catch (e) {
            phase('recommendations:family-refresh:failed');
            logError('server', 'recommendations:family-refresh:error', e, {
              path,
            });
            warnings.push(
              e instanceof AppError
                ? e.message
                : 'No se ha podido actualizar Steam Families. Se conserva su última biblioteca.',
            );
          }
        } else if (state.family && !c.familyToken)
          warnings.push(
            'Falta el token de Steam Families. Los juegos compartidos proceden de la última lectura guardada.',
          );
        const cache = await getCache();
        phase('recommendations:enrich:start', {
          games: state.games.length,
        });
        const enriched = await enrich(state.games, cache);
        state.games = enriched.games;
        warnings.push(...enriched.warnings);
        phase('recommendations:enrich:complete', {
          games: state.games.length,
          warnings: enriched.warnings.length,
        });
        let discoveries: Game[] = filters.shortlistOnly
          ? (state.shortlist ?? [])
          : [];
        if (!filters.shortlistOnly && c.clientId && c.clientSecret) {
          phase('recommendations:discover:start');
          try {
            discoveries = await discover(state, cache);
            phase('recommendations:discover:complete', {
              games: discoveries.length,
            });
          } catch (e) {
            phase('recommendations:discover:failed');
            logError('server', 'recommendations:discover:error', e, { path });
            warnings.push(
              'No se han podido buscar nuevos descubrimientos. La selección continúa con tu biblioteca.',
            );
          }
        }
        const durations = await getHltbCache();
        state.games = withHltb(state.games, durations);
        discoveries = withHltb(discoveries, durations);
        const hasHltb = await hltbAvailable();
        phase('recommendations:hltb:availability', {
          available: hasHltb,
        });
        if (hasHltb) {
          // Acquire missing durations before applying the final story cap.
          const preliminary = selectCandidates(
            state,
            discoveries,
            { ...filters, hours: null },
            payload.text,
          );
          const priority = [
            ...preliminary.filter(inLibrary).slice(0, 6),
            ...preliminary.filter((g) => !inLibrary(g)).slice(0, 2),
            ...preliminary,
          ];
          phase('recommendations:hltb:refresh:start', {
            games: new Set(priority.map((g) => g.appId)).size,
          });
          warnings.push(
            ...(await refreshHltb(
              [...new Map(priority.map((g) => [g.appId, g])).values()],
              durations,
            )),
          );
          phase('recommendations:hltb:refresh:complete');
          state.games = withHltb(state.games, durations);
          discoveries = withHltb(discoveries, durations);
        }
        let candidates = selectCandidates(
          state,
          discoveries,
          filters,
          payload.text,
          reference?.appId,
        );
        phase('recommendations:candidates', {
          total: candidates.length,
          owned: candidates.filter(inLibrary).length,
          discoveries: candidates.filter((g) => !inLibrary(g)).length,
        });
        // Bound external refresh work, not the catalog the AI can consult.
        const reviewCandidates = [
          ...candidates.filter(inLibrary).slice(0, 40),
          ...candidates.filter((g) => !inLibrary(g)).slice(0, 20),
        ];
        for (let i = 0; i < reviewCandidates.length; i += 4) {
          phase('recommendations:reviews:batch:start', {
            offset: i,
            count: Math.min(4, reviewCandidates.length - i),
          });
          const batch = await Promise.allSettled(
            reviewCandidates.slice(i, i + 4).map((g) => review(g, cache)),
          );
          const failed = batch.some((r) => r.status === 'rejected');
          phase('recommendations:reviews:batch:complete', {
            offset: i,
            failed,
          });
          if (failed) {
            warnings.push(
              'Algunas valoraciones no se han actualizado; las disponibles muestran su fecha de consulta.',
            );
            break;
          }
        }
        const withReviews = (g: Game) =>
          cache.reviews[g.appId]
            ? { ...g, reviews: cache.reviews[g.appId] }
            : g;
        candidates = candidates.map(withReviews);
        state.games = state.games.map(withReviews);
        await saveCache(cache);
        // Persist refreshed libraries even if the subsequent Codex request fails.
        await saveState(state);
        phase('recommendations:database:ready', {
          library: state.games.length,
          eligible: candidates.length,
        });
        const comfort = filters.comfortZone
          ? comfortSelection(state, candidates)
          : null;
        if (comfort) candidates = comfort.games;
        let out;
        if (candidates.length) {
          phase('recommendations:codex:start', {
            candidates: candidates.length,
            model: codex.model,
            effort: codex.effort,
          });
          const raw = await askCodex(
            buildPrompt(state, candidates, filters, payload.text, reference),
            codex,
            { state, candidates },
            (progress) => {
              if (progress.kind === 'reasoning')
                notify('recommendations:codex:reasoning', {
                  summary: progress.summary,
                });
              else if (progress.kind === 'catalog')
                notify('recommendations:codex:catalog-query');
              else notify('recommendations:codex:thinking');
            },
            signal,
          );
          phase('recommendations:codex:response');
          out = validatePicks(raw, candidates);
          if (comfort) {
            if (out.owned.length + out.discoveries.length !== candidates.length)
              throw new AppError(
                'Codex no devolvió las opciones de zona de confort. Reintenta la consulta.',
                502,
              );
            out.message = comfort.message;
            for (const pick of [...out.owned, ...out.discoveries])
              pick.reason = comfort.reasons[pick.appId];
          }
          phase('recommendations:codex:validated', {
            owned: out.owned.length,
            discoveries: out.discoveries.length,
          });
        } else {
          phase('recommendations:codex:skipped');
          out = {
            message:
              comfort?.message ??
              'No hay juegos con datos suficientes que cumplan estos filtros. Prueba otro género, quita el límite de duración o incluye juegos terminados.',
            owned: [],
            discoveries: [],
          };
        }
        const recommendation = {
          ...out,
          engine,
          at: Date.now(),
          warnings: [...new Set(warnings)],
        };
        ensureActive();
        const nextSnapshot = await saveRecommendation(
          { ...state, codex },
          {
            text: payload.text.trim(),
            filters,
            result: recommendation,
          },
        );
        phase('recommendations:complete', {
          owned: nextSnapshot.conversation.at(-1)?.result.owned.length ?? 0,
          discoveries:
            nextSnapshot.conversation.at(-1)?.result.discoveries.length ?? 0,
          warnings: nextSnapshot.warnings.length,
        });
        return nextSnapshot;
      }
      phase('operation:unknown');
      throw new AppError('Esta operación no existe.', 404);
    });
    return complete(Response.json(result, { headers }));
  } catch (e) {
    const status = e instanceof AppError ? e.status : 500;
    logError('server', 'request:failed', e, {
      ...requestInfo,
      status,
      ms: Date.now() - started,
    });
    return complete(
      Response.json(
        {
          error:
            e instanceof AppError
              ? e.message
              : 'No se ha podido completar la operación. Tus datos anteriores están guardados.',
        },
        { status, headers },
      ),
    );
  }
}
