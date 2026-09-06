import { AppError, config, exclusive, readState, saveState } from './store.ts';
import {
  DAY,
  discover,
  enrich,
  getCache,
  review,
  saveCache,
  syncSteam,
} from './sources.ts';
import {
  parseFilters,
  parseCodexSettings,
  parsePreference,
  parseProfile,
  parseTastes,
  selectCandidates,
  validatePicks,
} from './selection.ts';
import { askCodex, buildPrompt, codexStatus } from './codex.ts';
import { DEFAULT_CODEX_SETTINGS } from '../lib/model.ts';
import type { Game, Snapshot, State } from '../lib/model.ts';
import { buildTasteProfile } from '../lib/tastes.ts';
import { inLibrary } from '../lib/model.ts';
import { log, logError } from '../lib/log.ts';
import {
  expireHltbCache,
  getHltbCache,
  hltbAvailable,
  refreshHltb,
  withHltb,
} from './hltb.ts';
import {
  mergeLibraries,
  refreshLibraries,
  retainedFamilyGames,
} from './family.ts';

const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
export function verifyRequest(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get('host');
  if (!localHosts.has(url.hostname) || (host && host !== url.host))
    throw new AppError('Acceso permitido únicamente desde este PC.', 403);
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
  return {
    ...state,
    tasteProfile: buildTasteProfile(state),
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
export async function handle(request: Request): Promise<Response> {
  const started = Date.now();
  const path = new URL(request.url).pathname;
  const requestInfo = { method: request.method, path };
  const phase = (event: string, details?: Record<string, unknown>) =>
    log('server', event, { path, ...details });
  const complete = (response: Response) => {
    log('server', 'request:complete', {
      ...requestInfo,
      status: response.status,
      ms: Date.now() - started,
    });
    return response;
  };
  log('server', 'request:start', requestInfo);
  const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Referrer-Policy': 'no-referrer',
  };
  try {
    phase('request:validate');
    verifyRequest(request);
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
      if (path === '/api/tastes' && request.method === 'PATCH') {
        phase('tastes:update:start');
        state.tastes = parseTastes(payload, state);
        state.conversation = [];
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
            ![
              ...(state.conversation.at(-1)?.result.owned ?? []),
              ...(state.conversation.at(-1)?.result.discoveries ?? []),
            ].some((p) => p.appId === payload.appId))
        )
          throw new AppError(
            'Ese juego no pertenece a la biblioteca sincronizada.',
          );
        state.preferences[String(payload.appId)] = parsePreference(
          payload.preference,
        );
        state.conversation = []; // Past picks no longer reflect these explicit corrections.
        await saveState(state);
        const next = await snapshot(state);
        phase('preference:update:complete', { appId: payload.appId });
        return next;
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
            fresh.games,
            retainedFamilyGames(state),
            fresh.profile.steamId,
          ),
          syncedAt: Date.now(),
          conversation: [],
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
            logError('server', 'steam:family:refresh:error', e, { path });
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
          conversation: [],
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
        if (!state.profile)
          throw new AppError(
            'Conecta tu perfil de Steam antes de pedir recomendaciones.',
          );
        if (state.conversation.length >= 20)
          throw new AppError(
            'Esta conversación tiene 20 consultas. Inicia una nueva búsqueda para continuar.',
            409,
          );
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
        phase('recommendations:enrich:start', { games: state.games.length });
        const enriched = await enrich(state.games, cache);
        state.games = enriched.games;
        warnings.push(...enriched.warnings);
        phase('recommendations:enrich:complete', {
          games: state.games.length,
          warnings: enriched.warnings.length,
        });
        let discoveries: Game[] = [];
        if (c.clientId && c.clientSecret) {
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
        phase('recommendations:hltb:availability', { available: hasHltb });
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
        const candidates = selectCandidates(
          state,
          discoveries,
          filters,
          payload.text,
        );
        phase('recommendations:candidates', {
          total: candidates.length,
          owned: candidates.filter(inLibrary).length,
          discoveries: candidates.filter((g) => !inLibrary(g)).length,
        });
        // Four bounded requests at a time; avoid hammering Steam or serial timeout chains.
        for (let i = 0; i < candidates.length; i += 4) {
          phase('recommendations:reviews:batch:start', {
            offset: i,
            count: Math.min(4, candidates.length - i),
          });
          const batch = await Promise.allSettled(
            candidates.slice(i, i + 4).map((g) => review(g, cache)),
          );
          let failed = false;
          for (let j = 0; j < batch.length; j++) {
            const r = batch[j];
            if (r.status === 'fulfilled') candidates[i + j] = r.value;
            else failed = true;
          }
          phase('recommendations:reviews:batch:complete', {
            offset: i,
            failed,
          });
          if (failed) {
            warnings.push(
              'Algunas valoraciones no se han actualizado; las disponibles muestran su fecha de consulta.',
            );
            for (let k = i; k < candidates.length; k++)
              if (cache.reviews[candidates[k].appId])
                candidates[k] = {
                  ...candidates[k],
                  reviews: cache.reviews[candidates[k].appId],
                };
            break;
          }
        }
        await saveCache(cache);
        let out;
        if (candidates.length) {
          phase('recommendations:codex:start', {
            candidates: candidates.length,
            model: codex.model,
            effort: codex.effort,
          });
          const raw = await askCodex(
            buildPrompt(state, candidates, filters, payload.text),
            codex,
          );
          phase('recommendations:codex:response');
          out = validatePicks(raw, candidates);
          phase('recommendations:codex:validated', {
            owned: out.owned.length,
            discoveries: out.discoveries.length,
          });
        } else {
          phase('recommendations:codex:skipped');
          out = {
            message:
              'No hay juegos con datos suficientes que cumplan estos filtros. Prueba otro género, quita el límite de duración o incluye juegos terminados.',
            owned: [],
            discoveries: [],
          };
        }
        const recommendation = {
          ...out,
          at: Date.now(),
          warnings: [...new Set(warnings)],
        };
        const next: State = {
          ...state,
          filters,
          codex,
          conversation: [
            ...state.conversation,
            { text: payload.text.trim(), filters, result: recommendation },
          ],
        };
        await saveState(next);
        const nextSnapshot = await snapshot(next, warnings);
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
