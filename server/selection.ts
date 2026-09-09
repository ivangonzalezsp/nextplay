import { filterCandidates } from '../lib/filters.ts';
export { eligible } from '../lib/filters.ts';
import { AppError } from './store.ts';
import {
  CODEX_EFFORTS,
  STATUS_LABELS,
  codexEffortsForModel,
  inLibrary,
  releaseDateAt,
  storyHours,
} from '../lib/model.ts';
import { AFFINITIES, affinityScore, buildTasteProfile } from '../lib/tastes.ts';
import type {
  CodexEffort,
  CodexSettings,
  TasteSettings,
  TasteAffinity,
  Recommendation,
  RecommendationEngine,
} from '../lib/model.ts';
import type { Filters, Game, Preference, State, Pick } from '../lib/model.ts';

const codexModelPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/;

export function parseEngine(value: unknown): RecommendationEngine {
  if (value !== 'codex' && value !== 'local')
    throw new AppError('Elige Codex o el algoritmo local.');
  return value;
}

export function parseCodexSettings(
  value: unknown,
  fallback: CodexSettings,
): CodexSettings {
  const v = (value === undefined ? fallback : value) as {
    model?: unknown;
    effort?: unknown;
  };
  const model = typeof v?.model === 'string' ? v.model.trim() : '';
  const effort = v?.effort as CodexEffort;
  if (
    !codexModelPattern.test(model) ||
    !CODEX_EFFORTS.includes(effort) ||
    !codexEffortsForModel(model).includes(effort)
  )
    throw new AppError('El modelo o el esfuerzo de Codex no es válido.');
  return { model, effort };
}

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
  const minReleaseDate = f.minReleaseDate ?? null;
  const tags = f.tags ?? [];
  const sessionIntent = f.sessionIntent === undefined ? 'any' : f.sessionIntent;
  const validTag = (tag: unknown) => {
    if (typeof tag !== 'string' || tag.length < 4 || tag.length > 205)
      return false;
    if (tag.startsWith('id:')) {
      const id = Number(tag.slice(3));
      return Number.isSafeInteger(id) && id > 0;
    }
    return tag.startsWith('name:') && tag.slice(5).trim().length > 0;
  };
  const validMinReleaseDate =
    minReleaseDate === null ||
    (typeof minReleaseDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(minReleaseDate) &&
      releaseDateAt(minReleaseDate) !== null);
  if (
    !['today', 'next'].includes(f.mode) ||
    !['any', 'continue', 'start'].includes(sessionIntent) ||
    !number(f.minutes, 1440) ||
    !number(f.hours, 1000) ||
    !validMinReleaseDate ||
    !Array.isArray(tags) ||
    tags.length > 50 ||
    !tags.every(validTag) ||
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
    minReleaseDate,
    tags: [...new Set(tags)],
    genre: f.genre.trim(),
    gameMode: f.gameMode,
    mood: f.mood.trim(),
    replay: f.replay,
    sessionIntent,
  };
}
export function parsePreference(value: unknown): Preference {
  const p = value as Preference;
  if (
    !p ||
    typeof p.favorite !== 'boolean' ||
    !Object.hasOwn(STATUS_LABELS, p.status) ||
    (p.opinion !== undefined &&
      !['loved', 'liked', 'disliked'].includes(p.opinion)) ||
    (p.opinionReason !== undefined &&
      (typeof p.opinionReason !== 'string' || p.opinionReason.length > 500)) ||
    (!p.opinion && !!p.opinionReason?.trim())
  )
    throw new AppError('El estado del juego no es válido.');
  return {
    favorite: p.favorite,
    status: p.status,
    ...(p.opinion
      ? { opinion: p.opinion, opinionReason: p.opinionReason?.trim() ?? '' }
      : {}),
  };
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
function candidateWeights(
  g: Game,
  state: State,
  profile: TasteAffinity[],
  filters: Filters,
  text = '',
) {
  return {
    'mención directa': text.toLowerCase().includes(g.name.toLowerCase())
      ? 80
      : 0,
    favorito:
      state.preferences[g.appId]?.favorite &&
      state.preferences[g.appId]?.opinion !== 'disliked'
        ? 40
        : 0,
    afinidad: affinityScore(g, profile),
    'actividad reciente':
      g.recentMinutes &&
      state.syncedAt &&
      Date.now() - state.syncedAt < 86400000 &&
      !state.tastes?.ignoredHours.includes(g.appId)
        ? filters.mode === 'today'
          ? 4
          : 1
        : 0,
    'sin tiempo de juego registrado':
      g.playtimeMinutes === 0 ? (filters.mode === 'next' ? 4 : 1) : 0,
  };
}

export function selectCandidates(
  state: State,
  discoveries: Game[],
  filters: Filters,
  text = '',
): Game[] {
  const profile = buildTasteProfile(state);
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
  return filterCandidates(
    [...unique.values()]
      .map((game) => ({
        game,
        score: Object.values(
          candidateWeights(game, state, profile, filters, text),
        ).reduce((sum, weight) => sum + weight, 0),
      }))
      .toSorted((a, b) => b.score - a.score || a.game.appId - b.game.appId)
      .map(({ game }) => game),
    state.preferences,
    filters,
  );
}

export function recommendLocally(
  state: State,
  filters: Filters,
): Recommendation {
  const profile = buildTasteProfile(state);
  const discoveries = (state.history ?? []).flatMap((t) =>
    t.result.discoveries.map((p) => p.game),
  );
  const candidates = selectCandidates(state, discoveries, filters);
  const pick = (game: Game) => {
    const weights = candidateWeights(game, state, profile, filters);
    const score = Object.values(weights).reduce(
      (sum, weight) => sum + weight,
      0,
    );
    const points = (value: number) =>
      value.toLocaleString('es', { maximumFractionDigits: 1 });
    const reasons = Object.entries(weights)
      .filter(([, value]) => value !== 0)
      .map(
        ([label, value]) => `${label} ${value > 0 ? '+' : ''}${points(value)}`,
      );
    return {
      appId: game.appId,
      game,
      reason: `Puntuación: ${points(score)}. ${reasons.length ? reasons.join('; ') + '.' : 'Sin señales de afinidad suficientes; cumple tus filtros.'}`,
      whyNow:
        filters.mode === 'today'
          ? filters.sessionIntent === 'continue'
            ? state.preferences[game.appId]?.status === 'paused'
              ? 'Lo dejaste en pausa: puedes retomarlo hoy.'
              : 'Lo marcaste como Estoy jugando: puedes continuar hoy.'
            : weights['actividad reciente'] > 0
              ? 'Lo has jugado recientemente: puede ser una opción para retomar hoy.'
              : 'Una opción para hoy según tus gustos y filtros.'
          : filters.hours !== null
            ? `Historia estimada de ${points(storyHours(game)!)} h, dentro de tu límite de ${filters.hours} h.`
            : 'Una opción para varias sesiones según tus gustos y filtros.',
      caveat:
        filters.mode === 'today'
          ? `No hay datos de duración de sesión${filters.minutes !== null ? ` para asegurar que encaje en ${filters.minutes} minutos` : ''}.`
          : storyHours(game)
            ? 'La duración es una estimación total de la historia, no el tiempo que te queda.'
            : 'No se conoce la duración de la historia.',
    };
  };
  return {
    engine: 'local',
    message: candidates.length
      ? 'Selección local según tus favoritos y afinidades, sin consumir tokens.'
      : 'No hay juegos con datos suficientes que cumplan estos filtros. Prueba otro género, quita el límite de duración o incluye juegos terminados.',
    owned: candidates.filter(inLibrary).slice(0, 3).map(pick),
    discoveries: candidates
      .filter((g) => !inLibrary(g))
      .slice(0, 2)
      .map(pick),
    at: Date.now(),
    warnings: [
      'Se usan los datos guardados. Actualiza la biblioteca para refrescarlos; los descubrimientos proceden del historial.',
      ...(filters.mood || state.tastes?.notes
        ? [
            'El algoritmo local no interpreta el ánimo ni las notas en texto libre. Ajusta las afinidades en Tus gustos.',
          ]
        : []),
    ],
  };
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
