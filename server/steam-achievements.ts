import { AppError } from './store.ts';
import { json } from './sources.ts';
import type { Game } from '../lib/model.ts';

type PlayerAchievement = {
  apiname?: string;
  achieved?: number;
  unlocktime?: number;
};
type SchemaAchievement = {
  name?: string;
  displayName?: string;
  description?: string;
  hidden?: number;
};
type PlayerResponse = { playerstats?: { achievements?: PlayerAchievement[] } };
type SchemaResponse = {
  game?: { availableGameStats?: { achievements?: SchemaAchievement[] } };
};

export const ACHIEVEMENTS_INTERVAL = 6 * 60 * 60 * 1000;

export async function fetchSteamAchievements(
  steamId: string,
  apiKey: string,
  appId: number,
): Promise<NonNullable<Game['steamAchievements']>> {
  if (!apiKey)
    throw new AppError(
      'Falta la clave de Steam para actualizar los logros.',
      503,
    );
  const endpoint = (method: string) => {
    const url = new URL(
      `https://api.steampowered.com/ISteamUserStats/${method}`,
    );
    url.search = new URLSearchParams({
      key: apiKey,
      steamid: steamId,
      appid: String(appId),
      l: 'spanish',
    }).toString();
    return url;
  };
  const schema = await json<SchemaResponse>(endpoint('GetSchemaForGame/v2/'));
  const source = schema.game?.availableGameStats?.achievements;
  if (!Array.isArray(source))
    return { unlocked: 0, total: 0, at: Date.now(), achievements: [] };

  const player = await json<PlayerResponse>(
    endpoint('GetPlayerAchievements/v1/'),
  );
  const unlocked = new Map<string, PlayerAchievement>();
  for (const achievement of player.playerstats?.achievements ?? []) {
    if (typeof achievement.apiname === 'string')
      unlocked.set(achievement.apiname, achievement);
  }
  const achievements = source.flatMap((achievement) => {
    if (typeof achievement.name !== 'string' || !achievement.name) return [];
    const playerAchievement = unlocked.get(achievement.name);
    const achieved = playerAchievement?.achieved === 1;
    return [
      {
        apiName: achievement.name,
        name:
          typeof achievement.displayName === 'string' &&
          achievement.displayName.trim()
            ? achievement.displayName.trim()
            : achievement.name,
        ...(typeof achievement.description === 'string' &&
        achievement.description.trim()
          ? { description: achievement.description.trim() }
          : {}),
        hidden: achievement.hidden === 1,
        achieved,
        ...(achieved &&
        Number.isSafeInteger(playerAchievement?.unlocktime) &&
        playerAchievement.unlocktime! > 0
          ? { unlockTime: playerAchievement.unlocktime! * 1000 }
          : {}),
      },
    ];
  });
  return {
    unlocked: achievements.filter((achievement) => achievement.achieved).length,
    total: achievements.length,
    at: Date.now(),
    achievements,
  };
}
