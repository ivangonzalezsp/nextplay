import {
    inLibrary,
    STATUS_LABELS,
    steamTagKey,
    type Game,
    type GameStatus,
    type State,
} from './model.ts';

export const STATS_STATUS_ORDER: GameStatus[] = [
    'pending',
    'playing',
    'paused',
    'completed',
    'abandoned',
    'ignored',
];

const PLAYTIME_BANDS = [
    { label: '< 2 h', maxMinutes: 120 },
    { label: '2–10 h', maxMinutes: 600 },
    { label: '10–25 h', maxMinutes: 1500 },
    { label: '25–50 h', maxMinutes: 3000 },
    { label: '50–100 h', maxMinutes: 6000 },
    { label: '100+ h', maxMinutes: Infinity },
];

export function libraryStats(state: Pick<State, 'games' | 'preferences'>) {
    const games = state.games.filter(inLibrary);
    const statusCounts = Object.fromEntries(
        STATS_STATUS_ORDER.map((status) => [status, 0]),
    ) as Record<GameStatus, number>;
    const playtimeBands = PLAYTIME_BANDS.map((band) => ({ ...band, count: 0 }));
    const genres = new Map<
        number,
        { name: string; count: number; minutes: number; games: Game[] }
    >();
    const tags = new Map<
        string,
        { name: string; count: number; minutes: number; games: Game[] }
    >();
    const playedGames: Game[] = [];
    let totalMinutes = 0;
    let knownTimeCount = 0;
    let genreCoverage = 0;
    let tagCoverage = 0;

    for (const game of games) {
        statusCounts[state.preferences[game.appId]?.status ?? 'pending']++;

        const minutes = game.playtimeMinutes;
        const playedMinutes =
            minutes !== null && Number.isFinite(minutes) && minutes > 0
                ? minutes
                : 0;
        if (minutes !== null && Number.isFinite(minutes) && minutes >= 0) {
            knownTimeCount++;
            totalMinutes += minutes;
            if (minutes > 0) {
                playedGames.push(game);
                playtimeBands.find((band) => minutes < band.maxMinutes)!
                    .count++;
            }
        }

        const seenGenres = new Set<number>();
        for (const genre of game.genres ?? []) {
            if (!genre.name.trim() || seenGenres.has(genre.id)) continue;
            seenGenres.add(genre.id);
            const current = genres.get(genre.id) ?? {
                name: genre.name,
                count: 0,
                minutes: 0,
                games: [],
            };
            current.count++;
            current.minutes += playedMinutes;
            if (playedMinutes) current.games.push(game);
            genres.set(genre.id, current);
        }
        if (seenGenres.size) genreCoverage++;

        const seenTags = new Set<string>();
        for (const tag of (game.steamTags ?? []).slice(0, 4)) {
            if (!tag.name.trim()) continue;
            const key = steamTagKey(tag);
            if (seenTags.has(key)) continue;
            seenTags.add(key);
            const current = tags.get(key) ?? {
                name: tag.name,
                count: 0,
                minutes: 0,
                games: [],
            };
            current.count++;
            current.minutes += playedMinutes;
            if (playedMinutes) current.games.push(game);
            tags.set(key, current);
        }
        if (seenTags.size) tagCoverage++;
    }

    const byPlaytime = (a: Game, b: Game) =>
        (b.playtimeMinutes ?? 0) - (a.playtimeMinutes ?? 0) ||
        a.name.localeCompare(b.name, 'es') ||
        a.appId - b.appId;
    playedGames.sort(byPlaytime);
    const topGames = playedGames.slice(0, 5);

    return {
        totalGames: games.length,
        totalMinutes,
        knownTimeCount,
        playedCount: playedGames.length,
        zeroTimeCount: knownTimeCount - playedGames.length,
        unknownTimeCount: games.length - knownTimeCount,
        genreCoverage,
        genreCount: genres.size,
        tagCoverage,
        tagCount: tags.size,
        topGenres: [...genres.values()]
            .sort(
                (a, b) =>
                    b.count - a.count || a.name.localeCompare(b.name, 'es'),
            )
            .slice(0, 8),
        topGenresByHours: [...genres.values()]
            .filter((genre) => genre.minutes > 0)
            .sort(
                (a, b) =>
                    b.minutes - a.minutes ||
                    b.count - a.count ||
                    a.name.localeCompare(b.name, 'es'),
            )
            .slice(0, 8)
            .map((genre) => ({
                ...genre,
                games: genre.games.sort(byPlaytime),
            })),
        topTags: [...tags.values()]
            .sort(
                (a, b) =>
                    b.count - a.count || a.name.localeCompare(b.name, 'es'),
            )
            .slice(0, 8),
        topTagsByHours: [...tags.values()]
            .filter((tag) => tag.minutes > 0)
            .sort(
                (a, b) =>
                    b.minutes - a.minutes ||
                    b.count - a.count ||
                    a.name.localeCompare(b.name, 'es'),
            )
            .slice(0, 8)
            .map((tag) => ({ ...tag, games: tag.games.sort(byPlaytime) })),
        playtimeBands,
        statuses: STATS_STATUS_ORDER.map((status) => ({
            status,
            label: STATUS_LABELS[status],
            count: statusCounts[status],
        })),
        topGames,
        topShare:
            totalMinutes > 0
                ? Math.round(
                      (100 *
                          topGames.reduce(
                              (total, game) =>
                                  total + (game.playtimeMinutes ?? 0),
                              0,
                          )) /
                          totalMinutes,
                  )
                : 0,
    };
}
