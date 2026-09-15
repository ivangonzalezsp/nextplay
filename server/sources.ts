import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { AppError, atomicJson, config, dataDir, readJson } from './store.ts';
import { openDatabase, overlaySteamTags } from './database.ts';
import { parseProfile } from './selection.ts';
import { log, logError } from '../lib/log.ts';
import type { Game, IgdbSearchResult, Profile, State } from '../lib/model.ts';
import {
    affinityScore,
    buildTasteProfile,
    tasteEvidence,
} from '../lib/tastes.ts';

export const DAY = 86_400_000;
type Cache = {
    metadata: Record<string, Partial<Game>>;
    reviews: Record<string, NonNullable<Game['reviews']>>;
    reviewsRefreshAfter?: number;
};
const emptyCache: Cache = { metadata: {}, reviews: {} };
export const getCache = () =>
    readJson(join(dataDir(), 'cache.json'), emptyCache);
export const saveCache = (cache: Cache) =>
    atomicJson(join(dataDir(), 'cache.json'), cache);

function withPersistedSteamTags(games: Game[]) {
    let db;
    try {
        db = openDatabase(join(dataDir(), 'library.sqlite'), true);
        return overlaySteamTags(db, games);
    } catch {
        return games;
    } finally {
        db?.close();
    }
}
type Fetcher = typeof fetch;
type SteamGame = {
    appid: number;
    name: string;
    playtime_forever?: number;
    img_icon_url?: string;
    playtime_2weeks?: number;
};
type SteamResponse = {
    response?: {
        success?: number;
        steamid?: string;
        game_count?: number;
        games?: SteamGame[];
        players?: {
            steamid: string;
            personaname: string;
            avatarfull?: string;
        }[];
    };
};
type IgdbGame = {
    id: number;
    name: string;
    url?: string;
    summary?: string;
    cover?: { url?: string };
    genres?: { id: number; name: string }[];
    game_modes?: number[];
    similar_games?: number[];
    first_release_date?: number;
    game_type?: number;
    platforms?: { name: string }[];
};
type IgdbLink = { uid: string; game: number; url?: string };
export function steamAppLink(link: IgdbLink) {
    try {
        const url = new URL(link.url ?? '');
        const match = url.pathname.match(/^\/app\/(\d+)(?:\/|$)/);
        return (
            ['https:', 'http:'].includes(url.protocol) &&
            url.hostname === 'store.steampowered.com' &&
            !url.username &&
            !url.password &&
            !url.port &&
            !!match &&
            match[1] === String(link.uid) &&
            Number(link.uid) > 0
        );
    } catch {
        return false;
    }
}
type Duration = { game_id: number; count?: number; hastily?: number };
export async function json<T>(
    url: string | URL,
    init: RequestInit = {},
    fetcher: Fetcher = fetch,
    authMessage?: string,
): Promise<T> {
    const parsedUrl = new URL(url.toString());
    const source = {
        host: parsedUrl.hostname,
        path: parsedUrl.pathname,
        method: init.method ?? 'GET',
    };
    const started = Date.now();
    log('server', 'source:request', source);
    let response: Response;
    try {
        response = await fetcher(url, {
            ...init,
            redirect: 'error',
            signal: AbortSignal.timeout(20_000),
        });
    } catch (e) {
        logError('server', 'source:network-error', e, {
            ...source,
            ms: Date.now() - started,
        });
        throw new AppError(
            'No se ha podido conectar con una fuente de datos. Se conservan los datos anteriores.',
            502,
        );
    }
    if (!response.ok) {
        log('server', 'source:response-error', {
            ...source,
            status: response.status,
            ms: Date.now() - started,
        });
        if ([401, 403].includes(response.status))
            throw new AppError(
                authMessage ||
                    'Una fuente rechazó las credenciales. Revisa la clave de Steam o las credenciales de Twitch/IGDB.',
                502,
            );
        throw new AppError(
            response.status === 429
                ? 'La fuente ha alcanzado su límite de consultas. Espera un momento y vuelve a intentarlo.'
                : 'Una fuente de datos no está disponible. Inténtalo de nuevo más tarde.',
            502,
        );
    }
    try {
        const result = await response.json();
        log('server', 'source:response', {
            ...source,
            status: response.status,
            ms: Date.now() - started,
        });
        return result;
    } catch (e) {
        logError('server', 'source:invalid-response', e, {
            ...source,
            status: response.status,
            ms: Date.now() - started,
        });
        throw new AppError(
            'La fuente devolvió datos que no se pueden leer.',
            502,
        );
    }
}
const natural = (v: unknown): v is number =>
    typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
function safeUrl(value: unknown, hosts: string[]) {
    if (typeof value !== 'string') return undefined;
    try {
        const u = new URL(value.startsWith('//') ? 'https:' + value : value);
        return u.protocol === 'https:' && hosts.includes(u.hostname)
            ? u.href
            : undefined;
    } catch {
        return undefined;
    }
}
export function ownedGames(response: unknown): Game[] {
    const data = (response as SteamResponse)?.response;
    if (!data || !natural(data.game_count))
        throw new AppError(
            'Steam no permite leer tu biblioteca. Pon el perfil y los detalles de juegos en Público; después vuelve a sincronizar.',
            422,
        );
    if (data.game_count === 0 && (!data.games || data.games.length === 0))
        return [];
    if (!Array.isArray(data.games) || data.games.length !== data.game_count)
        throw new AppError(
            'Steam devolvió una biblioteca incompleta. Se conserva la última lectura.',
            502,
        );
    const games: Game[] = data.games.map((g) => {
        if (
            !natural(g.appid) ||
            g.appid === 0 ||
            typeof g.name !== 'string' ||
            !g.name.trim()
        )
            throw new AppError(
                'Steam devolvió un juego con datos incompletos.',
                502,
            );
        return {
            appId: g.appid,
            name: g.name.slice(0, 300),
            owned: true,
            playtimeMinutes: natural(g.playtime_forever)
                ? g.playtime_forever
                : null,
            recentMinutes: null,
            cover:
                typeof g.img_icon_url === 'string' &&
                /^[a-f0-9]{40}$/.test(g.img_icon_url)
                    ? `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
                    : undefined,
        };
    });
    if (new Set(games.map((g) => g.appId)).size !== games.length)
        throw new AppError(
            'Steam devolvió una biblioteca duplicada. Inténtalo de nuevo.',
            502,
        );
    return games;
}
export async function syncSteam(
    profileUrl: string,
    apiKey: string,
    fetcher: Fetcher = fetch,
): Promise<{ profile: Profile; games: Game[]; warnings: string[] }> {
    const parsed = parseProfile(profileUrl);
    if (!apiKey)
        throw new AppError(
            'Falta STEAM_API_KEY en .env.local. Añádela en tu PC y vuelve a sincronizar.',
            503,
        );
    const steam = async (method: string, params: Record<string, string>) => {
        const url = new URL('https://api.steampowered.com/' + method);
        url.search = new URLSearchParams({ key: apiKey, ...params }).toString();
        return json<SteamResponse>(url, {}, fetcher);
    };
    let steamId = parsed.id;
    if (parsed.type === 'id') {
        const resolved = await steam('ISteamUser/ResolveVanityURL/v1/', {
            vanityurl: parsed.id,
        });
        const resolvedId = resolved?.response?.steamid;
        if (
            resolved?.response?.success !== 1 ||
            !resolvedId ||
            !/^765\d{14}$/.test(resolvedId)
        )
            throw new AppError('No se ha encontrado ese perfil de Steam.', 404);
        steamId = resolvedId;
    }
    const [playerResult, libraryResult] = await Promise.allSettled([
        steam('ISteamUser/GetPlayerSummaries/v2/', { steamids: steamId }),
        steam('IPlayerService/GetOwnedGames/v1/', {
            steamid: steamId,
            include_appinfo: 'true',
            include_played_free_games: 'true',
        }),
    ]);
    if (playerResult.status === 'rejected') throw playerResult.reason;
    if (libraryResult.status === 'rejected') throw libraryResult.reason;
    const p = playerResult.value?.response?.players?.[0];
    if (!p || p.steamid !== steamId || typeof p.personaname !== 'string')
        throw new AppError('Steam no devolvió el perfil solicitado.', 502);
    const games = ownedGames(libraryResult.value);
    const warnings: string[] = [];
    try {
        const recent = (
            await steam('IPlayerService/GetRecentlyPlayedGames/v1/', {
                steamid: steamId,
            })
        )?.response?.games;
        if (Array.isArray(recent))
            for (const game of games) {
                const row = recent.find((r) => r.appid === game.appId);
                game.recentMinutes =
                    row && natural(row.playtime_2weeks)
                        ? row.playtime_2weeks
                        : 0;
            }
        else warnings.push('Steam no ha facilitado la actividad reciente.');
    } catch {
        warnings.push('No se ha podido actualizar la actividad reciente.');
    }
    return {
        profile: {
            steamId,
            name: p.personaname.slice(0, 200),
            url: `https://steamcommunity.com/profiles/${steamId}/`,
            avatar: safeUrl(p.avatarfull, [
                'avatars.steamstatic.com',
                'avatars.akamai.steamstatic.com',
                'avatars.fastly.steamstatic.com',
            ]),
        },
        games,
        warnings,
    };
}

let token:
    | { value: string; until: number; clientId: string; secret: string }
    | undefined;
let lastRequest = 0;
async function igdb<T = IgdbGame>(
    endpoint: string,
    body: string,
): Promise<T[]> {
    const c = await config();
    if (!c.clientId || !c.clientSecret)
        throw new AppError('Faltan las credenciales de Twitch/IGDB.', 503);
    if (
        !token ||
        token.until < Date.now() ||
        token.clientId !== c.clientId ||
        token.secret !== c.clientSecret
    ) {
        const t = await json<{ access_token: string; expires_in: number }>(
            'https://id.twitch.tv/oauth2/token',
            {
                method: 'POST',
                body: new URLSearchParams({
                    client_id: c.clientId,
                    client_secret: c.clientSecret,
                    grant_type: 'client_credentials',
                }),
            },
        );
        if (typeof t.access_token !== 'string' || !natural(t.expires_in))
            throw new AppError(
                'Twitch no devolvió un acceso válido a IGDB.',
                502,
            );
        token = {
            value: t.access_token,
            until: Date.now() + (t.expires_in - 60) * 1000,
            clientId: c.clientId,
            secret: c.clientSecret,
        };
    }
    await delay(Math.max(0, 270 - (Date.now() - lastRequest)));
    lastRequest = Date.now();
    const rows = await json<T[]>('https://api.igdb.com/v4/' + endpoint, {
        method: 'POST',
        headers: {
            'Client-ID': c.clientId,
            Authorization: 'Bearer ' + token.value,
            'Content-Type': 'text/plain',
        },
        body,
    });
    if (!Array.isArray(rows))
        throw new AppError('IGDB devolvió un formato inesperado.', 502);
    return rows;
}
const ids = (list: number[]) =>
    [...new Set(list)].filter((n) => natural(n) && n > 0).join(',');
const fields =
    'name,url,summary,cover.url,genres.name,game_modes,similar_games,first_release_date,game_type,platforms';
let dictionaries:
    { source: number; gameTypes: Set<number>; until: number } | undefined;
async function dictionary() {
    if (!dictionaries || dictionaries.until < Date.now()) {
        const sources = await igdb<{ id: number; name: string }>(
            'external_game_sources',
            'fields name; limit 500;',
        );
        const types = await igdb<{ id: number; type: string }>(
            'game_types',
            'fields type; limit 100;',
        );
        const source = sources.find(
            (s) => String(s.name).toLowerCase() === 'steam',
        )?.id;
        if (!natural(source))
            throw new AppError(
                'No se ha encontrado la correspondencia de Steam en IGDB.',
                502,
            );
        const gameTypes = new Set(
            types
                .filter(
                    (t) =>
                        natural(t.id) &&
                        [
                            'maingame',
                            'standaloneexpansion',
                            'expandedgame',
                            'remake',
                            'remaster',
                            'port',
                        ].includes(
                            String(t.type)
                                .toLowerCase()
                                .replace(/[^a-z]/g, ''),
                        ),
                )
                .map((t) => t.id),
        );
        if (!gameTypes.size)
            throw new AppError(
                'IGDB no ha facilitado los tipos de juegos. Se conservan los metadatos anteriores.',
                502,
            );
        dictionaries = { source, gameTypes, until: Date.now() + DAY };
    }
    return dictionaries;
}
export function metadata(
    raw: IgdbGame,
    duration: Duration | undefined,
    gameTypes: Set<number>,
): Partial<Game> {
    const cover = safeUrl(raw.cover?.url, ['images.igdb.com'])?.replace(
        '/t_thumb/',
        '/t_cover_big/',
    );
    return {
        igdbId: raw.id,
        igdbUrl: safeUrl(raw.url, ['www.igdb.com', 'igdb.com']),
        summary:
            typeof raw.summary === 'string'
                ? raw.summary.slice(0, 1500)
                : undefined,
        ...(cover ? { cover } : {}),
        genres: Array.isArray(raw.genres)
            ? raw.genres
                  .filter((g) => natural(g.id) && typeof g.name === 'string')
                  .map((g) => ({ id: g.id, name: g.name }))
            : [],
        gameModes: Array.isArray(raw.game_modes)
            ? raw.game_modes.filter(natural)
            : [],
        similarIds: Array.isArray(raw.similar_games)
            ? raw.similar_games.filter(natural)
            : [],
        durationHours:
            natural(duration?.count) &&
            duration.count > 0 &&
            natural(duration?.hastily) &&
            duration.hastily > 0
                ? Math.round(duration.hastily / 360) / 10
                : null,
        durationSamples: natural(duration?.count) ? duration.count : 0,
        isGame: natural(raw.game_type)
            ? gameTypes.has(raw.game_type)
            : undefined,
        releasedAt: natural(raw.first_release_date)
            ? raw.first_release_date * 1000
            : undefined,
        released: natural(raw.first_release_date)
            ? raw.first_release_date * 1000 <= Date.now()
            : undefined,
        metadataAt: Date.now(),
    };
}
export async function searchIgdb(query: string): Promise<IgdbSearchResult[]> {
    const rows = await igdb(
        'games',
        `search ${JSON.stringify(query)}; fields name,cover.url,first_release_date,platforms.name; limit 12;`,
    );
    return rows
        .filter(
            (raw) =>
                natural(raw.id) &&
                raw.id > 0 &&
                typeof raw.name === 'string' &&
                raw.name.trim(),
        )
        .map((raw) => ({
            id: raw.id,
            name: raw.name.slice(0, 300),
            cover: metadata(raw, undefined, new Set()).cover,
            releasedAt: natural(raw.first_release_date)
                ? raw.first_release_date * 1000
                : undefined,
            platforms: (raw.platforms ?? [])
                .filter((platform) => typeof platform.name === 'string')
                .map((platform) => platform.name),
        }));
}

export async function getIgdbGame(id: number) {
    const [raw] = await igdb(
        'games',
        `fields ${fields}; where id = ${id}; limit 1;`,
    );
    if (
        !raw ||
        raw.id !== id ||
        typeof raw.name !== 'string' ||
        !raw.name.trim()
    )
        throw new AppError(
            'No se ha encontrado ese juego en IGDB. Vuelve a buscarlo.',
            404,
        );
    const d = await dictionary();
    const [duration] = await igdb<Duration>(
        'game_time_to_beats',
        `fields game_id,hastily,count; where game_id = ${id}; limit 1;`,
    );
    return {
        ...metadata(raw, duration, d.gameTypes),
        name: raw.name.slice(0, 300),
    };
}

export async function enrich(games: Game[], cache: Cache, force = false) {
    const c = await config();
    if (!c.clientId || !c.clientSecret)
        return {
            games: withPersistedSteamTags(
                games.map((g) => ({ ...g, ...cache.metadata[g.appId] })),
            ),
            warnings: [
                'IGDB no está configurado: faltan géneros, duraciones y descubrimientos nuevos.',
            ],
        };
    const warnings: string[] = [];
    const missing = games.filter(
        (g) =>
            force ||
            Date.now() -
                (cache.metadata[g.appId]?.metadataAt ?? g.metadataAt ?? 0) >=
                7 * DAY,
    );
    try {
        if (missing.length) {
            const d = await dictionary();
            for (let i = 0; i < missing.length; i += 100) {
                const batch = missing.slice(i, i + 100);
                const steam = batch.filter((g) => g.appId > 0);
                const links = steam.length
                    ? await igdb<IgdbLink>(
                          'external_games',
                          `fields uid,game,url; where external_game_source = ${d.source} & uid = (${steam.map((g) => '"' + g.appId + '"').join(',')}); limit 500;`,
                      )
                    : [];
                const gameIds = ids([
                    ...links.map((x) => x.game),
                    ...batch
                        .filter((g) => g.appId < 0)
                        .flatMap((g) => (g.igdbId ? [g.igdbId] : [])),
                ]);
                const records = gameIds
                    ? await igdb(
                          'games',
                          `fields ${fields}; where id = (${gameIds}); limit 500;`,
                      )
                    : [];
                const durations = gameIds
                    ? await igdb<Duration>(
                          'game_time_to_beats',
                          `fields game_id,hastily,count; where game_id = (${gameIds}); limit 500;`,
                      )
                    : [];
                for (const game of batch) {
                    const matches =
                        game.appId < 0
                            ? [game.igdbId]
                            : [
                                  ...new Set(
                                      links
                                          .filter(
                                              (x) =>
                                                  steamAppLink(x) &&
                                                  String(x.uid) ===
                                                      String(game.appId),
                                          )
                                          .map((x) => x.game),
                                  ),
                              ];
                    const raw =
                        matches.length === 1
                            ? records.find((r) => r.id === matches[0])
                            : undefined;
                    if (raw)
                        cache.metadata[game.appId] = metadata(
                            raw,
                            durations.find((x) => x.game_id === raw.id),
                            d.gameTypes,
                        );
                    else if (!cache.metadata[game.appId]?.igdbId)
                        cache.metadata[game.appId] = { metadataAt: Date.now() };
                }
            }
        }
    } catch (e) {
        warnings.push(
            (e as Error).message +
                ' Los metadatos disponibles pueden estar incompletos o desactualizados.',
        );
    }
    return {
        games: withPersistedSteamTags(
            games.map((g) => ({ ...g, ...cache.metadata[g.appId] })),
        ),
        warnings,
    };
}
export async function discover(state: State, cache: Cache): Promise<Game[]> {
    const d = await dictionary();
    const profile = buildTasteProfile(state);
    const seeds = tasteEvidence(state)
        .sort(
            (a, b) =>
                Number(b.favorite) * 40 +
                affinityScore(b.game, profile) +
                b.weight -
                (Number(a.favorite) * 40 +
                    affinityScore(a.game, profile) +
                    a.weight),
        )
        .slice(0, 12)
        .map((e) => e.game);
    const related = ids(seeds.flatMap((g) => g.similarIds ?? []).slice(0, 100));
    const genres = ids(
        seeds.flatMap((g) => (g.genres ?? []).map((x) => x.id)).slice(0, 20),
    );
    if (!related && !genres) return [];
    const now = Math.floor(Date.now() / 1000);
    const raw = await igdb(
        'games',
        `fields ${fields}; where (${[related && `id = (${related})`, genres && `genres = (${genres})`].filter(Boolean).join(' | ')}) & platforms = (6) & first_release_date <= ${now}; sort total_rating_count desc; limit 100;`,
    );
    if (!raw.length) return [];
    const links = await igdb<IgdbLink>(
        'external_games',
        `fields uid,game,url; where external_game_source = ${d.source} & game = (${ids(raw.map((g) => g.id))}); limit 500;`,
    );
    const own = new Set(state.games.map((g) => g.appId));
    const ownIgdb = new Set(state.games.map((g) => g.igdbId));
    const games: Game[] = [];
    for (const link of links) {
        if (!steamAppLink(link)) continue;
        const appId = Number(link.uid),
            g = raw.find((r) => r.id === link.game);
        if (
            !g ||
            !natural(g.game_type) ||
            !d.gameTypes.has(g.game_type) ||
            typeof g.name !== 'string' ||
            own.has(appId) ||
            ownIgdb.has(g.id) ||
            !natural(appId) ||
            !appId
        )
            continue;
        // The app ID must resolve uniquely; enrich performs the reverse-ID check.
        games.push({
            appId,
            igdbId: g.id,
            name: String(g.name).slice(0, 300),
            owned: false,
            playtimeMinutes: null,
            recentMinutes: null,
        });
    }
    const enriched = await enrich(
        [...new Map(games.map((g) => [g.appId, g])).values()],
        cache,
    );
    if (enriched.warnings.length)
        throw new AppError(enriched.warnings.join(' '), 502);
    return enriched.games.filter(
        (g) =>
            cache.metadata[g.appId]?.igdbId ===
                games.find((original) => original.appId === g.appId)?.igdbId &&
            g.isGame &&
            g.released,
    );
}
export async function review(
    game: Game,
    cache: Cache,
    force = false,
): Promise<Game> {
    if (game.appId < 0) return game;
    const old = cache.reviews[game.appId];
    if (
        !force &&
        old &&
        old.at >= (cache.reviewsRefreshAfter ?? 0) &&
        Date.now() - old.at < DAY
    )
        return { ...game, reviews: old };
    const url = new URL(
        `https://store.steampowered.com/appreviews/${game.appId}`,
    );
    url.search = new URLSearchParams({
        json: '1',
        language: 'all',
        purchase_type: 'all',
        num_per_page: '0',
    }).toString();
    const result = await json<{
        success: number;
        query_summary?: { total_positive: number; total_reviews: number };
    }>(url);
    const s = result?.query_summary;
    if (
        result?.success !== 1 ||
        !natural(s?.total_positive) ||
        !natural(s?.total_reviews) ||
        s.total_positive > s.total_reviews
    )
        throw new AppError(
            'No se han podido actualizar las valoraciones de Steam.',
            502,
        );
    cache.reviews[game.appId] = {
        positive: s.total_positive,
        total: s.total_reviews,
        at: Date.now(),
    };
    return { ...game, reviews: cache.reviews[game.appId] };
}
