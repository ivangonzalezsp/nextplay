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
  parsePreference,
  parseProfile,
  selectCandidates,
  validatePicks,
} from './selection.ts';
import { askCodex, buildPrompt, codexStatus } from './codex.ts';
import type { Game, Snapshot, State } from '../lib/model.ts';
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
    setup: {
      steam: !!c.steam,
      family: !!c.familyToken,
      igdb: !!c.clientId && !!c.clientSecret,
      ...(await codexStatus()),
    },
    warnings,
  };
}
export async function handle(request: Request): Promise<Response> {
  const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Referrer-Policy': 'no-referrer',
  };
  try {
    verifyRequest(request);
    const path = new URL(request.url).pathname;
    if (path === '/api/state' && request.method === 'GET')
      return Response.json(await snapshot(await readState()), { headers });
    const payload = await body(request);
    const result = await exclusive(async () => {
      const state = await readState();
      if (path === '/api/state' && request.method === 'PATCH') {
        if (
          typeof payload.appId !== 'number' ||
          !Number.isSafeInteger(payload.appId) ||
          !state.games.some((g) => g.appId === payload.appId)
        )
          throw new AppError(
            'Ese juego no pertenece a la biblioteca sincronizada.',
          );
        state.preferences[String(payload.appId)] = parsePreference(
          payload.preference,
        );
        state.conversation = []; // Past picks no longer reflect these explicit corrections.
        await saveState(state);
        return snapshot(state);
      }
      if (path === '/api/conversation/reset' && request.method === 'POST') {
        state.filters = parseFilters(payload.filters);
        state.conversation = [];
        await saveState(state);
        return snapshot(state);
      }
      if (path === '/api/steam/sync' && request.method === 'POST') {
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
          try {
            const refreshed = await refreshLibraries(next, c, {
              own: false,
              family: true,
            });
            next = refreshed.state;
            warnings.push(...refreshed.warnings);
          } catch (e) {
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
        const enriched = await enrich(next.games, cache, payload.force);
        next.games = enriched.games;
        if (payload.force) cache.reviewsRefreshAfter = Date.now();
        await saveCache(cache);
        await saveState(next);
        return snapshot(next, [...warnings, ...enriched.warnings]);
      }
      if (path === '/api/steam/family/sync' && request.method === 'POST') {
        const refreshed = await refreshLibraries(state, await config(), {
          own: false,
          family: true,
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
        return snapshot(next, [...refreshed.warnings, ...enriched.warnings]);
      }
      if (path === '/api/recommendations' && request.method === 'POST') {
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
        // Refresh an expired library only on a user request; failed refreshes keep the snapshot.
        if (state.syncedAt && Date.now() - state.syncedAt >= DAY) {
          try {
            const fresh = await refreshLibraries(state, c, {
              own: true,
              family: false,
            });
            Object.assign(state, fresh.state);
            warnings.push(...fresh.warnings);
          } catch {
            warnings.push(
              'No se ha podido refrescar Steam. Se usa la última biblioteca guardada, que puede estar desactualizada.',
            );
          }
        }
        if (
          c.familyToken &&
          (!state.family || Date.now() - state.family.syncedAt >= DAY)
        ) {
          try {
            const fresh = await refreshLibraries(state, c, {
              own: false,
              family: true,
            });
            Object.assign(state, fresh.state);
            warnings.push(...fresh.warnings);
          } catch (e) {
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
        const enriched = await enrich(state.games, cache);
        state.games = enriched.games;
        warnings.push(...enriched.warnings);
        let discoveries: Game[] = [];
        if (c.clientId && c.clientSecret) {
          try {
            discoveries = await discover(state, cache);
          } catch {
            warnings.push(
              'No se han podido buscar nuevos descubrimientos. La selección continúa con tu biblioteca.',
            );
          }
        }
        const candidates = selectCandidates(
          state,
          discoveries,
          filters,
          payload.text,
        );
        // Four bounded requests at a time; avoid hammering Steam or serial timeout chains.
        for (let i = 0; i < candidates.length; i += 4) {
          const batch = await Promise.allSettled(
            candidates.slice(i, i + 4).map((g) => review(g, cache)),
          );
          let failed = false;
          for (let j = 0; j < batch.length; j++) {
            const r = batch[j];
            if (r.status === 'fulfilled') candidates[i + j] = r.value;
            else failed = true;
          }
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
        const out = candidates.length
          ? validatePicks(
              await askCodex(
                buildPrompt(state, candidates, filters, payload.text),
              ),
              candidates,
            )
          : {
              message:
                'No hay juegos con datos suficientes que cumplan estos filtros. Prueba otro género, quita el límite de duración o incluye juegos terminados.',
              owned: [],
              discoveries: [],
            };
        const result = {
          ...out,
          at: Date.now(),
          warnings: [...new Set(warnings)],
        };
        const next: State = {
          ...state,
          filters,
          conversation: [
            ...state.conversation,
            { text: payload.text.trim(), filters, result },
          ],
        };
        await saveState(next);
        return snapshot(next, warnings);
      }
      throw new AppError('Esta operación no existe.', 404);
    });
    return Response.json(result, { headers });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof AppError
            ? e.message
            : 'No se ha podido completar la operación. Tus datos anteriores están guardados.',
      },
      { status: e instanceof AppError ? e.status : 500, headers },
    );
  }
}
