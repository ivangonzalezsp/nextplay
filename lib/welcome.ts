import { inLibrary, type Game, type State } from './model.ts';
import { editionKey, gameAffinities } from './tastes.ts';

export function selectWelcomeGames(state: State): Game[] {
    const reviewed = new Set(state.welcome?.reviewed ?? []);
    const editions = new Set(
        state.games
            .filter(
                (game) =>
                    reviewed.has(game.appId) ||
                    state.preferences[game.appId]?.opinion,
            )
            .map(editionKey),
    );
    const candidates = state.games
        .filter(
            (game) =>
                inLibrary(game) &&
                game.isGame !== false &&
                (game.playtimeMinutes ?? 0) >= 60 &&
                state.preferences[game.appId]?.status !== 'ignored' &&
                !editions.has(editionKey(game)),
        )
        .sort(
            (a, b) =>
                (b.playtimeMinutes ?? 0) - (a.playtimeMinutes ?? 0) ||
                a.appId - b.appId,
        );
    const selected: Game[] = [];
    const traits = new Set<string>();
    // ponytail: five examples, favor new affinities after the most-played game; no clustering needed.
    while (
        candidates.length &&
        selected.length < Math.max(0, 5 - reviewed.size)
    ) {
        const next = selected.length
            ? [...candidates].sort(
                  (a, b) =>
                      gameAffinities(b).filter((id) => !traits.has(id)).length -
                      gameAffinities(a).filter((id) => !traits.has(id)).length,
              )[0]
            : candidates[0];
        selected.push(next);
        for (const id of gameAffinities(next)) traits.add(id);
        const key = editionKey(next);
        for (let i = candidates.length - 1; i >= 0; i--)
            if (editionKey(candidates[i]) === key) candidates.splice(i, 1);
    }
    return selected;
}
