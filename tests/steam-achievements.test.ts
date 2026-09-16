import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchSteamAchievements } from '../server/steam-achievements.ts';

void test('Steam achievements combine the schema with the player progress', async () => {
  const originalFetch = globalThis.fetch;
  const calls: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.pathname.endsWith('GetSchemaForGame/v2/'))
      return Response.json({
        game: {
          availableGameStats: {
            achievements: [
              {
                name: 'FIRST',
                displayName: 'Primer paso',
                description: 'Empieza la aventura',
                hidden: 0,
              },
              { name: 'SECRET', displayName: 'Secreto', hidden: 1 },
            ],
          },
        },
      });
    return Response.json({
      playerstats: {
        achievements: [
          { apiname: 'FIRST', achieved: 1, unlocktime: 1_700_000_000 },
          { apiname: 'SECRET', achieved: 0 },
        ],
      },
    });
  };
  try {
    const result = await fetchSteamAchievements(
      '76561198000000000',
      'a'.repeat(32),
      123,
    );
    assert.equal(result.unlocked, 1);
    assert.equal(result.total, 2);
    assert.deepEqual(result.achievements[0], {
      apiName: 'FIRST',
      name: 'Primer paso',
      description: 'Empieza la aventura',
      hidden: false,
      achieved: true,
      unlockTime: 1_700_000_000_000,
    });
    assert.equal(result.achievements[1].hidden, true);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].searchParams.get('appid'), '123');
    assert.equal(calls[1].pathname.endsWith('GetPlayerAchievements/v1/'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
