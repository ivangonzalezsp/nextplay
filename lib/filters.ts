import {
    DEFAULT_FILTERS,
    inLibrary,
    releaseDateAt,
    steamTagKey,
    storyHours,
} from './model.ts';
import type { Filters, Game, Preference, State } from './model.ts';

export function eligible(game: Game, pref: Preference | undefined, f: Filters) {
    if (
        pref?.status === 'ignored' ||
        (!f.replay && ['completed', 'abandoned'].includes(pref?.status ?? ''))
    )
        return false;
    if (f.mode === 'today') {
        if (
            f.sessionIntent === 'continue' &&
            (!inLibrary(game) ||
                !['playing', 'paused'].includes(pref?.status ?? ''))
        )
            return false;
        if (
            f.sessionIntent === 'start' &&
            (pref?.status ?? 'pending') !== 'pending'
        )
            return false;
    }
    if (game.isGame === false || game.released === false) return false;
    if (
        f.minReleaseDate &&
        (game.releasedAt == null ||
            (releaseDateAt(f.minReleaseDate) ?? Infinity) > game.releasedAt)
    )
        return false;
    if (
        f.genre &&
        !game.genres?.some(
            (g) => g.name.toLowerCase() === f.genre.toLowerCase(),
        )
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
function hasSteamTag(game: Game, key: string) {
    return (
        game.steamTags?.some(
            (tag) =>
                steamTagKey(tag) === key ||
                (key.startsWith('name:') && key.slice(5) === tag.englishName),
        ) ?? false
    );
}
function matchesTags(game: Game, tags: string[], all: boolean) {
    if (!tags.length) return true;
    return all
        ? tags.every((tag) => hasSteamTag(game, tag))
        : tags.some((tag) => hasSteamTag(game, tag));
}
export function filterCandidates(
    games: Game[],
    preferences: State['preferences'],
    filters: Filters,
): Game[] {
    const strict = games.filter(
        (g) =>
            eligible(g, preferences[g.appId], filters) &&
            matchesTags(g, filters.tags ?? [], true),
    );
    const tags = filters.tags ?? [];
    if (!tags.length) return strict;
    const any = games.filter(
        (g) =>
            eligible(g, preferences[g.appId], filters) &&
            matchesTags(g, filters.tags ?? [], false),
    );
    const choose = (library: boolean) => {
        const strictBucket = strict.filter(
            (game) => inLibrary(game) === library,
        );
        const anyBucket = any.filter((game) => inLibrary(game) === library);
        if (
            strictBucket.length >= (library ? 3 : 2) ||
            strictBucket.length === anyBucket.length
        )
            return strictBucket;
        const strictIds = new Set(strictBucket.map((game) => game.appId));
        return [
            ...strictBucket,
            ...anyBucket.filter((game) => !strictIds.has(game.appId)),
        ];
    };
    const selectedIds = new Set(
        [...choose(true), ...choose(false)].map((game) => game.appId),
    );
    const strictIds = new Set(strict.map((game) => game.appId));
    return [
        ...strict.filter((game) => selectedIds.has(game.appId)),
        ...any.filter(
            (game) => selectedIds.has(game.appId) && !strictIds.has(game.appId),
        ),
    ];
}

export function clearFilters(mode: Filters['mode']): Filters {
    return {
        ...DEFAULT_FILTERS,
        mode,
        minutes: null,
        hours: null,
        tags: [],
    };
}

export function filterSummary(
    state: State,
    filters: Filters,
    excludedAppId?: number,
) {
    const library = [
        ...new Map(
            state.games.filter(inLibrary).map((g) => [g.appId, g]),
        ).values(),
    ];
    const considered = library.filter(
        (game) =>
            game.appId !== excludedAppId &&
            (!filters.shortlistOnly ||
                state.shortlist?.some((saved) => saved.appId === game.appId)),
    );
    const matching = filterCandidates(considered, state.preferences, filters);
    const selected = new Set(matching.map((g) => g.appId));
    const strictCount = considered.filter(
        (game) =>
            eligible(game, state.preferences[game.appId], filters) &&
            matchesTags(game, filters.tags ?? [], true),
    ).length;
    const relaxedTags = !!filters.tags?.length && matching.length > strictCount;
    const missing = considered.filter((game) => {
        if (selected.has(game.appId)) return false;
        // Only count games that have no known mismatch: missing data is the blocker.
        const withoutMissing = {
            ...filters,
            minReleaseDate:
                game.releasedAt == null ? null : filters.minReleaseDate,
            genre: game.genres?.length ? filters.genre : '',
            gameMode: game.gameModes?.length ? filters.gameMode : '',
            hours: storyHours(game) ? filters.hours : null,
        };
        const missingRequired =
            (!!filters.minReleaseDate && game.releasedAt == null) ||
            (!!filters.genre && !game.genres?.length) ||
            (!!filters.gameMode && !game.gameModes?.length) ||
            (filters.mode === 'next' &&
                filters.hours !== null &&
                !storyHours(game)) ||
            (!!filters.tags?.length && !game.steamTags?.length);
        return (
            missingRequired &&
            eligible(game, state.preferences[game.appId], withoutMissing) &&
            (!game.steamTags?.length ||
                matchesTags(game, filters.tags ?? [], strictCount >= 3))
        );
    });
    return {
        total: library.length,
        eligible: matching.length,
        missing: missing.length,
        relaxedTags,
    };
}
