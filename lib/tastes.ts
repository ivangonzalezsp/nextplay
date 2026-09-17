import type {
    Game,
    Opinion,
    State,
    TasteAffinity,
    TasteSettings,
} from './model.ts';
import { storyHours } from './model.ts';

export const EMPTY_TASTES: TasteSettings = {
    overrides: {},
    ignoredHours: [],
    notes: '',
};
// ponytail: fourteen editable affinities; extend these rules when a concrete taste is missing.
// Steam IDs keep the matches stable across translations; names cover tags without IDs.
export const AFFINITIES = [
    {
        id: 'progression',
        label: 'Progresión y desarrollo de personajes',
        description:
            'Valora mejorar personajes, desbloquear habilidades, conseguir equipo y notar una evolución clara.',
        tagIds: [122, 4231, 21725, 17305, 4474, 4434, 10695, 1754],
        pattern:
            /\b(?:rpg|mmorpg|crpg|jrpg)\b|role.playing|character progression|skill trees?|loot|craft.*gear/i,
    },
    {
        id: 'challenge',
        label: 'Desafío y dominio mecánico',
        description:
            'Disfruta aprender patrones, dominar controles y superar combates o pruebas exigentes.',
        tagIds: [29482, 4026, 3877],
        pattern:
            /^difficult$|precision.platformer|souls.like|challenging.*(combat|enemies|boss)|precise timing|stamina management|punishing combat/i,
    },
    {
        id: 'action',
        label: 'Acción y combate directo',
        description:
            'Se centra en el ritmo, los reflejos y el combate directo.',
        tagIds: [19, 3993, 1774, 1646, 1743],
        pattern: /action|combat|shooter|hack.and.slash|fighting|beat.*em.up/i,
    },
    {
        id: 'tactics',
        label: 'Estrategia y decisiones tácticas',
        description:
            'Le atrae planificar turnos, posiciones, recursos y decisiones con consecuencias.',
        tagIds: [
            9, 1708, 1741, 1677, 4325, 21725, 17305, 1676, 4364, 3813, 1670,
            14139, 1723,
        ],
        pattern: /strategy|tactical|tactics|turn.based|\b(?:rts|4x)\b/i,
    },
    {
        id: 'automation',
        label: 'Construcción, gestión y automatización',
        description:
            'Le gusta construir, gestionar recursos, optimizar procesos y hacer que los sistemas funcionen solos.',
        tagIds: [255534, 1643, 7332, 12472, 4328, 220585, 8945, 16689],
        pattern:
            /^(?:(?:resource |time )?management|building)$|\b(?:automation|automate[ds]?|automating|factory|production lines?|logistics|colony sim|(?:city|base).build(?:er|ing)?|building infrastructure)\b/i,
    },
    {
        id: 'synergies',
        label: 'Partidas variables y combinaciones',
        description:
            'Busca partidas que cambian entre intentos mediante cartas, objetos, builds o combinaciones.',
        tagIds: [1716, 3959, 42804, 454187, 32322, 1091588],
        pattern:
            /rogue[ -]?(?:like|lite)|deck.build|synerg|items.*powerful combinations/i,
    },
    {
        id: 'puzzles',
        label: 'Puzles y resolución de problemas',
        description:
            'Prefiere resolver problemas, usar la lógica, experimentar y encontrar soluciones.',
        tagIds: [1664, 3968, 6129],
        pattern:
            /puzzl|\blogic\b|physics|problem.solving|brain.teaser|point.and.click|quiz|trivia/i,
    },
    {
        id: 'exploration',
        label: 'Exploración y libertad',
        description:
            'Disfruta descubrir mapas, secretos, rutas alternativas y libertad para avanzar.',
        tagIds: [1695, 3834, 3810, 1628],
        pattern: /open.world|explor|interconnected world|sandbox|freedom/i,
    },
    {
        id: 'narrative',
        label: 'Historias y decisiones narrativas',
        description:
            'Valora historias, personajes, diálogos y decisiones que enriquecen la experiencia.',
        tagIds: [1742, 7702, 6426, 11014, 3799, 9592],
        pattern:
            /narrative|story.driven|story.rich|branching|dialogue|visual.novel|interactive.fiction|choices.*(story|consequences|matter)/i,
    },
    {
        id: 'atmosphere',
        label: 'Atmósfera e inmersión',
        description:
            'Valora el tono, la ambientación, la música y la sensación de estar dentro del mundo.',
        tagIds: [4166, 1756, 9204, 1654],
        pattern: /atmospher|immersive|soundtrack|relax|psychological/i,
    },
    {
        id: 'horror',
        label: 'Terror y miedo',
        description:
            'Detecta afinidad por el terror, el suspense, la tensión y las amenazas sobrenaturales.',
        tagIds: [1667, 3978, 1721, 7432, 1659, 4064],
        pattern: /horror|thriller|lovecraft|zomb|paranormal|haunt|fear/i,
    },
    {
        id: 'replayability',
        label: 'Variedad y rejugabilidad',
        description:
            'Valora la variedad entre partidas, la generación procedural y los motivos para volver.',
        tagIds: [4711, 5125],
        pattern: /replay|procedural|randomly generated|run.based/i,
    },
    {
        id: 'survival',
        label: 'Supervivencia',
        description:
            'Prefiere administrar recursos, resistir amenazas y mantenerse con vida en entornos hostiles.',
        tagIds: [1662, 3978, 1100689],
        pattern: /survival|survive|surviving/i,
    },
    {
        id: 'social',
        label: 'Multijugador y cooperación',
        description:
            'Disfruta cooperar, competir o compartir una experiencia multijugador con otras personas.',
        tagIds: [3859, 1685, 3843, 3841, 7368, 4508, 128, 1754, 17770],
        pattern: /co.op|cooperative|multiplayer/i,
    },
];
export function gameAffinitySignals(game: Game) {
    return AFFINITIES.flatMap((a) => {
        const tags = (game.steamTags ?? [])
            .slice(0, 4)
            .filter(
                (tag) =>
                    (tag.id !== undefined && a.tagIds.includes(tag.id)) ||
                    a.pattern.test(tag.englishName ?? tag.name),
            );
        const genres = (game.genres ?? []).filter((g) =>
            a.pattern.test(g.name),
        );
        const social =
            a.id === 'social' &&
            game.gameModes?.some((m) => [2, 3, 4, 5, 6].includes(m));
        // Correlated tags/genres describe one trait, not independent votes.
        const strength = tags.length
            ? 1
            : genres.length
              ? 0.75
              : social
                ? 0.5
                : a.pattern.test(game.summary ?? '')
                  ? 0.25
                  : 0;
        const sources = tags.length
            ? [...new Set(tags.map((t) => 'Steam: ' + t.name))]
            : genres.length
              ? genres.map((g) => 'IGDB: ' + g.name)
              : social
                ? ['Modos de IGDB']
                : ['Descripción de IGDB'];
        return strength ? [{ id: a.id, strength, sources }] : [];
    });
}
export function gameAffinities(game: Game) {
    return gameAffinitySignals(game).map((a) => a.id);
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
        {
            game: Game;
            weight: number;
            favorite: boolean;
            opinion?: Opinion;
            opinionReason?: string;
        }
    >();
    const games = new Map(state.games.map((game) => [game.appId, game]));
    for (const turn of [...state.conversation, ...(state.history ?? [])])
        for (const pick of [...turn.result.owned, ...turn.result.discoveries])
            if (
                state.preferences[pick.appId]?.opinion &&
                !games.has(pick.appId)
            )
                games.set(pick.appId, pick.game);
    for (const game of games.values()) {
        const pref = state.preferences[game.appId];
        if (
            game.isGame === false ||
            pref?.status === 'ignored' ||
            (pref?.status === 'abandoned' && !pref.opinion)
        )
            continue;
        const favorite = pref?.favorite === true;
        const hours = ignored.has(game.appId)
            ? 0
            : (game.playtimeMinutes ?? 0) / 60;
        if (!pref?.opinion && !favorite && hours < 1) continue;
        const duration = storyHours(game);
        // A short game's history can matter without hundreds of hours; this does not imply completion.
        const weight = pref?.opinion
            ? { loved: 3, liked: 2, disliked: -3 }[pref.opinion]
            : favorite
              ? 2
              : Math.max(
                    hoursWeight(hours),
                    duration && duration > 0
                        ? 0.8 * Math.min(1, hours / duration)
                        : 0,
                );
        const key = editionKey(game) || 'app:' + game.appId;
        const old = groups.get(key);
        if (
            !old ||
            Number(!!pref?.opinion) > Number(!!old.opinion) ||
            (!!pref?.opinion === !!old.opinion &&
                Math.abs(old.weight) < Math.abs(weight))
        )
            groups.set(key, {
                game,
                weight,
                favorite,
                opinion: pref?.opinion,
                opinionReason: pref?.opinionReason,
            });
    }
    // Equal IGDB IDs also represent a single source of evidence.
    const unique = new Map<
        string,
        {
            game: Game;
            weight: number;
            favorite: boolean;
            opinion?: Opinion;
            opinionReason?: string;
        }
    >();
    for (const entry of [...groups.values()].sort(
        (a, b) =>
            Number(!!b.opinion) - Number(!!a.opinion) ||
            Math.abs(b.weight) - Math.abs(a.weight),
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
        traits: gameAffinitySignals(e.game),
    }));
    // Missing metadata is unknown, not disinterest. Unplayed library additions do not dilute tastes.
    const total = evidence.reduce(
        (sum, e) =>
            sum +
            (e.game.steamTags?.length ||
            e.game.genres?.length ||
            e.game.gameModes?.length ||
            e.game.summary?.trim()
                ? Math.abs(e.weight)
                : 0),
        0,
    );
    return AFFINITIES.map((a) => {
        const entries = evidence
            .flatMap((e) => {
                const signal = e.traits.find((t) => t.id === a.id);
                return signal
                    ? [
                          {
                              ...e,
                              signal,
                              contribution: e.weight * signal.strength,
                          },
                      ]
                    : [];
            })
            .sort(
                (a, b) =>
                    Math.abs(b.contribution) - Math.abs(a.contribution) ||
                    a.game.appId - b.game.appId,
            );
        return {
            id: a.id,
            label: a.label,
            description: a.description,
            // Weighted share of the whole history, damped by three games' worth of evidence.
            inferred:
                Math.round(
                    (entries.reduce((n, e) => n + e.contribution, 0) /
                        (total + 3)) *
                        100,
                ) / 100,
            choice: state.tastes?.overrides[a.id] ?? 'auto',
            evidenceCount: entries.length,
            evidence: entries.slice(0, 5).map((e) => ({
                appId: e.game.appId,
                name: e.game.name,
                hours: Math.round((e.game.playtimeMinutes ?? 0) / 6) / 10,
                favorite: e.favorite,
                opinion: e.opinion,
                opinionReason: e.opinionReason,
                sources: e.signal.sources,
            })),
        };
    });
}
export function affinityScore(game: Game, profile: TasteAffinity[]) {
    const traits = new Map(
        gameAffinitySignals(game).map((a) => [a.id, a.strength]),
    );
    const matches = profile.filter((a) => traits.has(a.id));
    const explicit = matches.map(
        (a) =>
            (a.choice === 'like' ? 1 : a.choice === 'dislike' ? -1 : 0) *
            traits.get(a.id)!,
    );
    // Bound the entire contribution so numerous tags cannot outweigh a favorite or a direct request.
    return (
        16 *
            (explicit.reduce<number>((n, v) => n + v, 0) /
                Math.max(1, explicit.filter(Boolean).length)) +
        6 *
            (matches.reduce(
                (n, a) =>
                    n +
                    (a.choice === 'auto' ? a.inferred * traits.get(a.id)! : 0),
                0,
            ) /
                Math.max(1, matches.length))
    );
}
