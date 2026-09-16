import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  backupDatabase,
  loadState,
  openDatabase,
  readSteamTagRecords,
  writeSteamTags,
  type SteamTagWrite,
} from './database.ts';
import { dataDir } from './store.ts';
import {
  createSteamTagClient,
  STEAM_TAG_SOURCE,
  SteamTagsError,
  type TagDictionaries,
} from './steam-tags.ts';
import type { State } from '../lib/model.ts';

const BATCH_SIZE = 100;

export type SteamTagsSyncResult = {
  total: number;
  checked: number;
  withTags: number;
  withoutTags: number;
  failures: number;
  pending: number;
  backupPath: string;
  stopReason?: 'rate-limit' | 'interrumpido';
};

type SteamTagsSyncOptions = {
  force?: boolean;
  client?: ReturnType<typeof createSteamTagClient>;
  shouldStop?: () => boolean;
  onLog?: (message: string) => void;
};

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

function rateLimited(error: unknown) {
  return error instanceof SteamTagsError && error.status === 429;
}

export async function syncSteamTags(
  options: SteamTagsSyncOptions = {},
): Promise<SteamTagsSyncResult> {
  const force = options.force === true;
  const log = options.onLog ?? (() => {});
  const shouldStop = options.shouldStop ?? (() => false);
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
    log(
      `steam-tags: objetivo=${appIds.length}, ya-comprobados=${force ? 0 : appIds.length - pending.length}, pendientes=${pending.length}, forzar=${force}`,
    );

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
    const result = (): SteamTagsSyncResult => ({
      total: appIds.length,
      ...coverage(),
      backupPath,
    });

    if (!pending.length) {
      log(`steam-tags: nada que actualizar; backup=${backupPath}`);
      return result();
    }

    const client = options.client ?? createSteamTagClient();
    let dictionaries: TagDictionaries;
    try {
      dictionaries = await client.loadDictionaries();
      log('steam-tags: diccionarios ES/EN cargados');
    } catch (error) {
      log(
        `steam-tags: detenido; no se pudieron cargar los diccionarios (${(error as Error).message}); pendientes=${pending.length}; backup=${backupPath}`,
      );
      throw error;
    }

    let successful = 0;
    let empty = 0;
    let failed = 0;
    let processed = 0;
    let writes: SteamTagWrite[] = [];
    let stopReason: SteamTagsSyncResult['stopReason'];
    const flush = () => {
      if (!writes.length) return;
      writeSteamTags(db, writes);
      writes = [];
    };
    for (const appId of pending) {
      if (shouldStop()) {
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
      if (shouldStop() && !stopReason) stopReason = 'interrumpido';
      if (
        writes.length >= BATCH_SIZE ||
        processed === pending.length ||
        stopReason
      ) {
        flush();
        log(
          `steam-tags: progreso=${processed}/${pending.length}, con-etiquetas=${successful}, sin-etiquetas=${empty}, fallos=${failed}`,
        );
      }
      if (stopReason) break;
    }
    flush();
    if (stopReason) {
      const current = result();
      log(
        `steam-tags: detenido motivo=${stopReason}, comprobados=${current.checked}, con-etiquetas=${current.withTags}, sin-etiquetas=${current.withoutTags}, fallos=${current.failures}, pendientes=${current.pending}, backup=${backupPath}`,
      );
      return { ...current, stopReason };
    }

    const after = loadState(db);
    if (!after || identity(after) !== beforeIdentity)
      throw new Error(
        `La biblioteca cambió durante la importación. Se conserva la copia en ${backupPath}.`,
      );
    const current = result();
    log(
      `steam-tags: terminado total=${appIds.length}, comprobados=${current.checked}, con-etiquetas=${current.withTags}, sin-etiquetas=${current.withoutTags}, fallos=${current.failures}, pendientes=${current.pending}`,
    );
    log(`steam-tags: backup=${backupPath}; integridad=ok`);
    return current;
  } finally {
    db.close();
  }
}
