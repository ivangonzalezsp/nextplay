import { AppError } from './store.ts';
import { json, syncSteam, DAY } from './sources.ts';
import type { Game, State } from '../lib/model.ts';

const steamId = (value: unknown): value is string =>
  typeof value === 'string' && /^765\d{14}$/.test(value);
const natural = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
type SharedApp = {
  appid: number;
  name: string;
  owner_steamids: string[];
  exclude_reason?: number;
  app_type?: number;
  rt_playtime?: number;
  img_icon_hash?: string;
};
type SharedResponse = {
  response?: { owner_steamid?: string; apps?: SharedApp[] };
};
type GroupResponse = {
  response?: {
    family_groupid?: string;
    is_not_member_of_any_group?: boolean;
    family_group?: { name?: string; members?: { steamid: string }[] };
  };
};
type FamilyResult = {
  games: Game[];
  family: State['family'];
  warnings: string[];
};

export function familyGames(value: unknown, viewerId: string) {
  const data = (value as SharedResponse)?.response;
  if (!data || data.owner_steamid !== viewerId || !Array.isArray(data.apps))
    throw new AppError(
      'Steam no devolvió una biblioteca familiar completa para tu cuenta. Se conserva la anterior.',
      502,
    );
  const games: Game[] = [];
  let excludedCount = 0;
  const seen = new Set<number>();
  for (const app of data.apps) {
    if (
      !app ||
      !natural(app.appid) ||
      !app.appid ||
      seen.has(app.appid) ||
      typeof app.name !== 'string' ||
      !app.name.trim() ||
      !Array.isArray(app.owner_steamids) ||
      !app.owner_steamids.length ||
      !app.owner_steamids.every(steamId)
    )
      throw new AppError(
        'Steam devolvió un juego familiar incompleto o duplicado. Se conserva la biblioteca anterior.',
        502,
      );
    seen.add(app.appid);
    if (
      (app.exclude_reason !== undefined && app.exclude_reason !== 0) ||
      (app.app_type !== undefined && app.app_type !== 1)
    ) {
      excludedCount++;
      continue;
    }
    const owned = app.owner_steamids.includes(viewerId);
    games.push({
      appId: app.appid,
      name: app.name.slice(0, 300),
      owned,
      shared: !owned,
      ownerSteamIds: [...new Set(app.owner_steamids)],
      // rt_playtime belongs to response.owner_steamid, never to a lender.
      playtimeMinutes: natural(app.rt_playtime) ? app.rt_playtime : null,
      recentMinutes: null,
      ...(typeof app.img_icon_hash === 'string' &&
      /^[a-f0-9]{40}$/.test(app.img_icon_hash)
        ? {
            cover: `https://media.steampowered.com/steamcommunity/public/images/apps/${app.appid}/${app.img_icon_hash}.jpg`,
          }
        : {}),
    });
  }
  return { games, excludedCount };
}

export async function syncFamily(
  viewerId: string,
  token: string,
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<FamilyResult> {
  if (!token)
    throw new AppError(
      'Añade STEAM_FAMILY_TOKEN en .env.local para conectar Steam Families.',
      503,
    );
  let account: unknown;
  try {
    account = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString(),
    ).sub;
  } catch {
    throw new AppError(
      'STEAM_FAMILY_TOKEN no contiene un token de sesión válido de Steam.',
      401,
    );
  }
  if (!steamId(account) || account !== viewerId)
    throw new AppError(
      'El token familiar corresponde a otra cuenta. Usa la sesión del perfil conectado.',
      403,
    );
  const get = <T>(method: string, params: Record<string, string>) => {
    const url = new URL(
      'https://api.steampowered.com/IFamilyGroupsService/' + method + '/v1/',
    );
    url.search = new URLSearchParams({
      access_token: token,
      ...params,
    }).toString();
    return json<T>(
      url,
      {},
      fetcher,
      'La sesión de Steam Families ha caducado o no está autorizada. Renueva STEAM_FAMILY_TOKEN; se conserva la última biblioteca familiar.',
    );
  };
  const group = (
    await get<GroupResponse>('GetFamilyGroupForUser', {
      include_family_group_response: 'true',
    })
  ).response;
  if (group?.is_not_member_of_any_group === true)
    return {
      games: [],
      family: null,
      warnings: [
        'Steam indica que ya no perteneces a un grupo familiar. Se han retirado los juegos prestados; tus preferencias se conservan.',
      ],
    };
  if (
    !group?.family_groupid ||
    !/^\d+$/.test(group.family_groupid) ||
    !Array.isArray(group.family_group?.members) ||
    !group.family_group.members.some((m) => m.steamid === viewerId) ||
    !group.family_group.members.every((m) => steamId(m.steamid))
  )
    throw new AppError(
      'Steam no devolvió los miembros de tu grupo familiar. Se conserva la biblioteca anterior.',
      502,
    );
  const parsed = familyGames(
    await get<SharedResponse>('GetSharedLibraryApps', {
      family_groupid: group.family_groupid,
      steamid: viewerId,
      include_own: 'true',
      include_excluded: 'true',
      include_non_games: 'false',
      language: 'spanish',
    }),
    viewerId,
  );
  const members = group.family_group.members.map((m) => ({
    steamId: m.steamid,
    name:
      m.steamid === viewerId
        ? 'Tu biblioteca'
        : 'Miembro · ' + m.steamid.slice(-4),
  }));
  const warnings: string[] = [];
  if (apiKey) {
    try {
      const url = new URL(
        'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/',
      );
      url.search = new URLSearchParams({
        key: apiKey,
        steamids: members.map((m) => m.steamId).join(','),
      }).toString();
      const people = await json<{
        response?: { players?: { steamid: string; personaname: string }[] };
      }>(url, {}, fetcher);
      for (const member of members) {
        const person = people.response?.players?.find(
          (p) => p.steamid === member.steamId,
        );
        if (typeof person?.personaname === 'string')
          member.name = person.personaname.slice(0, 200);
      }
    } catch {
      warnings.push(
        'No se han podido actualizar los nombres de los miembros. Sus juegos siguen disponibles.',
      );
    }
  }
  return {
    games: parsed.games,
    family: {
      groupId: group.family_groupid,
      name:
        typeof group.family_group.name === 'string'
          ? group.family_group.name.slice(0, 200)
          : 'Tu grupo de Steam',
      members,
      syncedAt: Date.now(),
      excludedCount: parsed.excludedCount,
    },
    warnings,
  };
}

export function mergeLibraries(own: Game[], family: Game[], viewerId: string) {
  const all = new Map<number, Game>();
  for (const game of family) all.set(game.appId, { ...game });
  for (const game of own.filter((g) => g.owned)) {
    const shared = all.get(game.appId);
    all.set(game.appId, {
      ...game,
      owned: true,
      shared: false,
      ownerSteamIds: [...new Set([viewerId, ...(shared?.ownerSteamIds ?? [])])],
    });
  }
  return [...all.values()];
}

export const retainedFamilyGames = (state: State): Game[] =>
  state.games
    .filter(
      (g) =>
        g.shared ||
        g.ownerSteamIds?.some((id) => id !== state.profile?.steamId),
    )
    .map((g) => ({ ...g, owned: false, shared: true }));

// A single refresh path prevents personal-library updates from dropping shared games.
export async function refreshLibraries(
  state: State,
  credentials: { steam: string; familyToken: string },
  options: { own: boolean; family: boolean },
  fetcher: typeof fetch = fetch,
) {
  if (!state.profile) throw new AppError('Conecta primero tu perfil de Steam.');
  const next = { ...state };
  const warnings: string[] = [];
  let own = state.games.filter((g) => g.owned),
    familyGames = retainedFamilyGames(state);
  if (options.own) {
    const fresh = await syncSteam(
      state.profile.url,
      credentials.steam,
      fetcher,
    );
    own = fresh.games;
    next.profile = fresh.profile;
    next.syncedAt = Date.now();
    warnings.push(...fresh.warnings);
    // Preserve lender information on games also owned by this user.
    familyGames = retainedFamilyGames(state);
  }
  if (options.family) {
    const fresh = await syncFamily(
      state.profile.steamId,
      credentials.familyToken,
      credentials.steam,
      fetcher,
    );
    familyGames = fresh.games;
    next.family = fresh.family;
    warnings.push(...fresh.warnings);
  } else if (
    next.family &&
    (!credentials.familyToken || Date.now() - next.family.syncedAt >= DAY)
  ) {
    warnings.push(
      'Se usa la última biblioteca familiar guardada. Actualiza Steam Families para comprobar el acceso actual.',
    );
  }
  next.games = mergeLibraries(own, familyGames, state.profile.steamId);
  return { state: next, warnings };
}
