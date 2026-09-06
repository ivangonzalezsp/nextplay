import type { Game, State, TasteAffinity, TasteSettings } from './model.ts';

export const EMPTY_TASTES: TasteSettings = {
  overrides: {},
  ignoredHours: [],
  notes: '',
};
// ponytail: transparent rules over IGDB descriptions; add structured tags if metadata coverage proves insufficient.
export const AFFINITIES = [
  {
    id: 'progression',
    label: 'Progresión y desarrollo de personajes',
    pattern:
      /role.playing|character progression|skill trees?|loot|craft.*gear/i,
  },
  {
    id: 'challenge',
    label: 'Combate exigente y dominio mecánico',
    pattern:
      /souls.like|challenging.*(combat|enemies|boss)|precise timing|stamina management|punishing combat/i,
  },
  {
    id: 'tactics',
    label: 'Estrategia y decisiones tácticas',
    pattern: /strategy|tactical|turn.based/i,
  },
  {
    id: 'automation',
    label: 'Construcción, gestión y automatización',
    pattern:
      /\b(?:automation|automate[ds]?|automating|factory|production lines?|logistics|colony sim|city.build|base.build|building infrastructure)\b/i,
  },
  {
    id: 'synergies',
    label: 'Partidas variables y combinaciones',
    pattern:
      /rogue[ -]?(?:like|lite)|deck.build|synerg|items.*powerful combinations/i,
  },
  {
    id: 'exploration',
    label: 'Exploración y libertad',
    pattern: /open.world|explor|interconnected world|sandbox|freedom/i,
  },
  {
    id: 'narrative',
    label: 'Historias y decisiones narrativas',
    pattern:
      /narrative|story.driven|branching|dialogue|choices.*(story|consequences)/i,
  },
  {
    id: 'survival',
    label: 'Supervivencia',
    pattern: /survival|survive|surviving/i,
  },
  {
    id: 'social',
    label: 'Multijugador y cooperación',
    pattern: /co.op|cooperative|multiplayer/i,
  },
];
export function gameAffinities(game: Game) {
  const text = [
    ...(game.genres ?? []).map((g) => g.name),
    game.summary ?? '',
  ].join(' ');
  return AFFINITIES.filter(
    (a) =>
      a.pattern.test(text) ||
      (a.id === 'social' &&
        game.gameModes?.some((m) => [2, 3, 4, 5, 6].includes(m))),
  ).map((a) => a.id);
}
export const hoursWeight = (hours: number) =>
  Math.min(1, Math.log1p(Math.max(0, hours)) / Math.log1p(500));
export function editionKey(game: Game) {
  return game.name
    .toLowerCase()
    .replace(/[™®]/g, '')
    .replace(
      /\b(game of the year|goty|complete|definitive|enhanced|legendary|anniversary|remastered|remaster|classic|prepare to die)\b/g,
      '',
    )
    .replace(/\bedition\b/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}
export function tasteEvidence(state: State) {
  const ignored = new Set(state.tastes?.ignoredHours ?? []);
  const groups = new Map<
    string,
    { game: Game; weight: number; favorite: boolean }
  >();
  for (const game of state.games) {
    const pref = state.preferences[game.appId];
    if (
      game.isGame === false ||
      pref?.status === 'ignored' ||
      pref?.status === 'abandoned'
    )
      continue;
    const favorite = pref?.favorite === true;
    const hours = ignored.has(game.appId)
      ? 0
      : (game.playtimeMinutes ?? 0) / 60;
    if (!favorite && hours < 1) continue;
    const weight = favorite ? 2 : hoursWeight(hours);
    const key = editionKey(game) || 'app:' + game.appId;
    const old = groups.get(key);
    if (!old || old.weight < weight)
      groups.set(key, { game, weight, favorite });
  }
  // Equal IGDB IDs also represent a single source of evidence.
  const unique = new Map<
    string,
    { game: Game; weight: number; favorite: boolean }
  >();
  for (const entry of [...groups.values()].sort(
    (a, b) => b.weight - a.weight,
  )) {
    const key = entry.game.igdbId
      ? 'igdb:' + entry.game.igdbId
      : 'name:' + editionKey(entry.game);
    if (!unique.has(key)) unique.set(key, entry);
  }
  return [...unique.values()];
}
export function buildTasteProfile(state: State): TasteAffinity[] {
  const evidence = tasteEvidence(state).map((e) => ({
    ...e,
    traits: gameAffinities(e.game),
  }));
  return AFFINITIES.map((a) => {
    const entries = evidence
      .filter((e) => e.traits.includes(a.id))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5);
    return {
      id: a.id,
      label: a.label,
      inferred:
        Math.round(
          Math.min(1, entries.reduce((n, e) => n + e.weight, 0) / 5) * 100,
        ) / 100,
      choice: state.tastes?.overrides[a.id] ?? 'auto',
      evidence: entries.map((e) => ({
        appId: e.game.appId,
        name: e.game.name,
        hours: Math.round((e.game.playtimeMinutes ?? 0) / 6) / 10,
        favorite: e.favorite,
      })),
    };
  });
}
export function affinityScore(game: Game, profile: TasteAffinity[]) {
  const traits = new Set(gameAffinities(game));
  const matches = profile.filter((a) => traits.has(a.id));
  const explicit = matches.map((a) =>
    a.choice === 'like' ? 1 : a.choice === 'dislike' ? -1 : 0,
  );
  // Bound the entire contribution so numerous tags cannot outweigh a favorite or a direct request.
  return (
    16 *
      (explicit.reduce<number>((n, v) => n + v, 0) /
        Math.max(1, explicit.filter(Boolean).length)) +
    6 *
      (matches.reduce((n, a) => n + (a.choice === 'auto' ? a.inferred : 0), 0) /
        Math.max(1, matches.length))
  );
}
