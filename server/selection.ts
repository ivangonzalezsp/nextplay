import { AppError } from './store.ts';
import { STATUS_LABELS, inLibrary, storyHours } from '../lib/model.ts';
import { AFFINITIES, affinityScore, buildTasteProfile } from '../lib/tastes.ts';
import type { TasteSettings } from '../lib/model.ts';
import type { Filters, Game, Preference, State, Pick } from '../lib/model.ts';

export function parseProfile(input: unknown) {
  if (typeof input !== 'string' || input.length > 300)
    throw new AppError('Introduce un enlace válido de tu perfil de Steam.');
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new AppError(
      'Usa el enlace completo: https://steamcommunity.com/id/tu-perfil/',
    );
  }
  const match = url.pathname.match(
    /^\/(id|profiles)\/([a-zA-Z0-9_-]{1,80})\/?$/,
  );
  if (
    url.hostname !== 'steamcommunity.com' ||
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    !match
  )
    throw new AppError('El enlace debe ser un perfil de steamcommunity.com.');
  if (match[1] === 'profiles' && !/^765\d{14}$/.test(match[2]))
    throw new AppError('El SteamID del enlace no es válido.');
  return {
    type: match[1],
    id: match[2],
    url: `https://steamcommunity.com/${match[1]}/${match[2]}/`,
  };
}
export function parseFilters(value: unknown): Filters {
  if (!value || typeof value !== 'object')
    throw new AppError('Faltan los filtros.');
  const f = value as Filters;
  const number = (v: unknown, max: number) =>
    v === null ||
    (typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= max);
  if (
    !['today', 'next'].includes(f.mode) ||
    !number(f.minutes, 1440) ||
    !number(f.hours, 1000) ||
    typeof f.genre !== 'string' ||
    f.genre.length > 100 ||
    typeof f.mood !== 'string' ||
    f.mood.length > 200 ||
    !['', 'single', 'coop', 'multi'].includes(f.gameMode) ||
    typeof f.replay !== 'boolean'
  )
    throw new AppError(
      'Revisa el tiempo, el modo y los filtros seleccionados.',
    );
  return {
    mode: f.mode,
    minutes: f.minutes,
    hours: f.hours,
    genre: f.genre.trim(),
    gameMode: f.gameMode,
    mood: f.mood.trim(),
    replay: f.replay,
  };
}
export function parsePreference(value: unknown): Preference {
  const p = value as Preference;
  if (
    !p ||
    typeof p.favorite !== 'boolean' ||
    !Object.hasOwn(STATUS_LABELS, p.status)
  )
    throw new AppError('El estado del juego no es válido.');
  return { favorite: p.favorite, status: p.status };
}
export function parseTastes(value: unknown, state: State): TasteSettings {
  const v = value as TasteSettings;
  if (
    !v ||
    typeof v !== 'object' ||
    !v.overrides ||
    typeof v.overrides !== 'object' ||
    Array.isArray(v.overrides) ||
    !Object.entries(v.overrides).every(
      ([id, choice]) =>
        AFFINITIES.some((a) => a.id === id) &&
        ['auto', 'like', 'neutral', 'dislike'].includes(choice),
    ) ||
    !Array.isArray(v.ignoredHours) ||
    v.ignoredHours.length > 5000 ||
    !v.ignoredHours.every(
      (id) =>
        Number.isSafeInteger(id) &&
        (state.games.some((g) => g.appId === id) ||
          state.tastes?.ignoredHours.includes(id)),
    ) ||
    typeof v.notes !== 'string' ||
    v.notes.length > 2000
  )
    throw new AppError(
      'Revisa las afinidades, los juegos excluidos y las notas (máximo 2000 caracteres).',
    );
  return {
    overrides: { ...v.overrides },
    ignoredHours: [...new Set(v.ignoredHours)],
    notes: v.notes.trim(),
  };
}
export function eligible(game: Game, pref: Preference | undefined, f: Filters) {
  if (
    pref?.status === 'ignored' ||
    (!f.replay && ['completed', 'abandoned'].includes(pref?.status ?? ''))
  )
    return false;
  if (game.isGame === false || game.released === false) return false;
  if (
    f.genre &&
    !game.genres?.some((g) => g.name.toLowerCase() === f.genre.toLowerCase())
  )
    return false;
  const modeIds: Record<string, number[]> = {
    single: [1],
    multi: [2, 3, 4, 5, 6],
    coop: [3],
  };
  if (
    f.gameMode &&
    !game.gameModes?.some((m) => modeIds[f.gameMode].includes(m))
  )
    return false;
  // Story length is not session length. A hard story cap requires known duration.
  if (
    f.mode === 'next' &&
    f.hours !== null &&
    (!storyHours(game) || storyHours(game)! > f.hours)
  )
    return false;
  return true;
}
export function selectCandidates(
  state: State,
  discoveries: Game[],
  filters: Filters,
  text = '',
): Game[] {
  const profile = buildTasteProfile(state);
  const mentioned = text.toLowerCase();
  const score = (g: Game) =>
    (mentioned.includes(g.name.toLowerCase()) ? 80 : 0) +
    (state.preferences[g.appId]?.favorite ? 40 : 0) +
    affinityScore(g, profile) +
    (g.recentMinutes &&
    state.syncedAt &&
    Date.now() - state.syncedAt < 86400000 &&
    !state.tastes?.ignoredHours.includes(g.appId)
      ? 1
      : 0) +
    ((g.playtimeMinutes ?? 0) === 0 ? 1 : 0);
  const library = new Map(state.games.map((g) => [g.appId, g]));
  const unique = new Map(
    [...state.games, ...discoveries.filter((g) => !library.has(g.appId))].map(
      (g) => [
        g.appId,
        {
          ...g,
          owned: library.get(g.appId)?.owned ?? false,
          shared: library.get(g.appId)?.shared === true,
        },
      ],
    ),
  );
  const sorted = [...unique.values()]
    .filter((g) => eligible(g, state.preferences[g.appId], filters))
    .toSorted((a, b) => score(b) - score(a) || a.appId - b.appId);
  // ponytail: bounded heuristic shortlist; add semantic retrieval only if large libraries lose relevant candidates.
  return [
    ...sorted.filter(inLibrary).slice(0, 40),
    ...sorted.filter((g) => !inLibrary(g)).slice(0, 20),
  ];
}
export function validatePicks(value: unknown, candidates: Game[]) {
  const v = value as { message: string; owned: Pick[]; discoveries: Pick[] };
  if (
    !v ||
    typeof v.message !== 'string' ||
    !v.message.trim() ||
    v.message.length > 3000 ||
    !Array.isArray(v.owned) ||
    !Array.isArray(v.discoveries) ||
    v.owned.length > 3 ||
    v.discoveries.length > 2
  )
    throw new AppError(
      'Codex no devolvió una recomendación válida. Puedes reintentar.',
      502,
    );
  const known = new Map(candidates.map((g) => [g.appId, g]));
  const used = new Set<number>();
  const validate = (p: Pick, owned: boolean) => {
    const game = known.get(p?.appId);
    if (
      !game ||
      inLibrary(game) !== owned ||
      used.has(p.appId) ||
      ![p.reason, p.whyNow, p.caveat].every(
        (t) => typeof t === 'string' && t.trim() && t.length <= 1500,
      )
    )
      throw new AppError(
        'La respuesta de Codex contiene juegos o datos no válidos. No se ha guardado; vuelve a intentarlo.',
        502,
      );
    used.add(p.appId);
    return {
      appId: p.appId,
      reason: p.reason,
      whyNow: p.whyNow,
      caveat: p.caveat,
      game,
    };
  };
  return {
    message: v.message,
    owned: v.owned.map((p) => validate(p, true)),
    discoveries: v.discoveries.map((p) => validate(p, false)),
  };
}
