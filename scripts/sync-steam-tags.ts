import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import {
  backupDatabase,
  loadState,
  openDatabase,
  readSteamTagRecords,
  writeSteamTags,
  type SteamTagWrite,
} from '../server/database.ts';
import { dataDir } from '../server/store.ts';
import {
  createSteamTagClient,
  STEAM_TAG_SOURCE,
  SteamTagsError,
  type TagDictionaries,
} from '../server/steam-tags.ts';
import type { State } from '../lib/model.ts';

const BATCH_SIZE = 100;

function identity(state: State) {
  return JSON.stringify({
    appIds: state.games.map((game) => game.appId).toSorted((a, b) => a - b),
    preferences: Object.fromEntries(
      Object.keys(state.preferences)
        .toSorted()
        .map((appId) => [appId, state.preferences[appId]]),
    ),
    profile: state.profile?.steamId ?? null,
    syncedAt: state.syncedAt,
    family: state.family
      ? {
          groupId: state.family.groupId,
          members: state.family.members
            .map((member) => member.steamId)
            .toSorted(),
          syncedAt: state.family.syncedAt,
          excludedCount: state.family.excludedCount,
        }
      : null,
  });
}

function usage() {
  console.log('Uso: npm run sync:steam-tags [-- --force]');
}

function rateLimited(error: unknown) {
  return error instanceof SteamTagsError && error.status === 429;
}

async function main() {
  const force = process.argv.slice(2).includes('--force');
  if (process.argv.slice(2).some((arg) => arg !== '--force')) {
    usage();
    process.exitCode = 2;
    return;
  }
  const directory = dataDir();
  const databasePath = join(directory, 'library.sqlite');
  await mkdir(join(directory, 'backups'), { recursive: true });
  const backupPath = join(
    directory,
    'backups',
    `library-before-steam-tags-${Date.now()}-${randomUUID()}.sqlite`,
  );
  const db = openDatabase(databasePath);
  try {
    const before = loadState(db);
    if (!before)
      throw new Error('No hay una biblioteca sincronizada que actualizar.');
    const beforeIdentity = identity(before);
    backupDatabase(db, backupPath);
    const backup = openDatabase(backupPath, true);
    try {
      const saved = loadState(backup);
      if (!saved || identity(saved) !== beforeIdentity)
        throw new Error('La copia de seguridad no coincide con la biblioteca.');
    } finally {
      backup.close();
    }

    const appIds = [
      ...new Set(
        before.games.filter((game) => game.appId > 0).map((game) => game.appId),
      ),
    ];
    const records = readSteamTagRecords(db);
    const completed = new Set(
      [...records.values()]
        .filter((record) => record.checkedAt != null)
        .map((record) => record.appId),
    );
    const pending = force
      ? appIds
      : appIds.filter((appId) => !completed.has(appId));
    console.log(
      `steam-tags: objetivo=${appIds.length}, ya-comprobados=${force ? 0 : appIds.length - pending.length}, pendientes=${pending.length}, forzar=${force}`,
    );
    if (!pending.length) {
      console.log(`steam-tags: nada que actualizar; backup=${backupPath}`);
      return;
    }

    const client = createSteamTagClient();
    let dictionaries: TagDictionaries;
    try {
      dictionaries = await client.loadDictionaries();
      console.log('steam-tags: diccionarios ES/EN cargados');
    } catch (error) {
      console.log(
        `steam-tags: detenido; no se pudieron cargar los diccionarios (${(error as Error).message}); pendientes=${pending.length}; backup=${backupPath}`,
      );
      process.exitCode = 1;
      return;
    }

    let successful = 0;
    let empty = 0;
    let failed = 0;
    let processed = 0;
    let writes: SteamTagWrite[] = [];
    let stopReason: 'rate-limit' | 'interrumpido' | undefined;
    let interrupted = false;
    const stop = () => {
      interrupted = true;
      console.log(
        'steam-tags: se recibió una señal; se cerrará tras el AppID actual',
      );
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    const flush = () => {
      if (!writes.length) return;
      writeSteamTags(db, writes);
      writes = [];
    };
    try {
      for (const appId of pending) {
        if (interrupted) {
          stopReason = 'interrumpido';
          break;
        }
        const attemptedAt = Date.now();
        try {
          const tags = await client.fetchGameTags(appId, dictionaries);
          writes.push({
            appId,
            tags,
            checkedAt: attemptedAt,
            attemptedAt,
            source: STEAM_TAG_SOURCE,
          });
          if (tags.length) successful++;
          else empty++;
        } catch (error) {
          failed++;
          writes.push({
            appId,
            tags: [],
            checkedAt: null,
            attemptedAt,
            error: String((error as Error).message || error).slice(0, 500),
            source: STEAM_TAG_SOURCE,
          });
          if (rateLimited(error)) stopReason = 'rate-limit';
        }
        processed++;
        if (interrupted && !stopReason) stopReason = 'interrumpido';
        if (
          writes.length >= BATCH_SIZE ||
          processed === pending.length ||
          stopReason
        ) {
          flush();
          console.log(
            `steam-tags: progreso=${processed}/${pending.length}, con-etiquetas=${successful}, sin-etiquetas=${empty}, fallos=${failed}`,
          );
        }
        if (stopReason) break;
      }
      flush();
    } finally {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
    }
    const coverage = () => {
      const current = readSteamTagRecords(db);
      const checked = appIds.filter(
        (appId) => current.get(appId)?.checkedAt != null,
      );
      const withTags = checked.filter(
        (appId) => (current.get(appId)?.tags.length ?? 0) > 0,
      );
      const withoutTags = checked.filter(
        (appId) => current.get(appId)?.tags.length === 0,
      );
      const failures = appIds.filter((appId) => {
        const record = current.get(appId);
        return record?.checkedAt == null && !!record?.error;
      });
      return {
        checked: checked.length,
        withTags: withTags.length,
        withoutTags: withoutTags.length,
        failures: failures.length,
        pending: appIds.length - checked.length,
      };
    };
    if (stopReason) {
      const result = coverage();
      console.log(
        `steam-tags: detenido motivo=${stopReason}, comprobados=${result.checked}, con-etiquetas=${result.withTags}, sin-etiquetas=${result.withoutTags}, fallos=${result.failures}, pendientes=${result.pending}, backup=${backupPath}`,
      );
      process.exitCode = stopReason === 'interrumpido' ? 130 : 1;
      return;
    }
    const after = loadState(db);
    if (!after || identity(after) !== beforeIdentity)
      throw new Error(
        `La biblioteca cambió durante la importación. Se conserva la copia en ${backupPath}.`,
      );
    const result = coverage();
    console.log(
      `steam-tags: terminado total=${appIds.length}, comprobados=${result.checked}, con-etiquetas=${result.withTags}, sin-etiquetas=${result.withoutTags}, fallos=${result.failures}, pendientes=${result.pending}`,
    );
    console.log(`steam-tags: backup=${backupPath}; integridad=ok`);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(`steam-tags: error: ${(error as Error).message || error}`);
  process.exitCode = 1;
});
