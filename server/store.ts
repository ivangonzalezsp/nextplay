import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseEnv } from 'node:util';
import { EMPTY_STATE } from '../lib/model.ts';
import type { State } from '../lib/model.ts';

export const dataDir = () => resolve(process.env.NEXTPLAY_DATA_DIR || 'data');
export class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export async function config() {
  let local: Record<string, string | undefined> = {};
  try {
    local = parseEnv(await readFile(resolve('.env.local'), 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
      throw new AppError('No se puede leer .env.local.', 500);
  }
  const get = (key: string) => (local[key] || process.env[key] || '').trim();
  return {
    steam: get('STEAM_API_KEY'),
    clientId: get('TWITCH_CLIENT_ID'),
    clientSecret: get('TWITCH_CLIENT_SECRET'),
    model: get('NEXTPLAY_CODEX_MODEL') || 'gpt-5.6-luna',
  };
}
export async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT')
      return structuredClone(fallback);
    throw new AppError(
      'No se pueden leer los datos locales. Se han conservado los archivos originales; revisa data antes de continuar.',
      500,
    );
  }
}
export async function atomicJson(path: string, value: unknown) {
  await mkdir(resolve(path, '..'), { recursive: true });
  const temp = path + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(temp, JSON.stringify(value), {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    await rename(temp, path);
  } finally {
    await unlink(temp).catch(() => {});
  }
}
export async function readState(): Promise<State> {
  const state = await readJson(join(dataDir(), 'state.json'), EMPTY_STATE);
  if (
    state?.version !== 1 ||
    !Array.isArray(state.games) ||
    !Array.isArray(state.conversation) ||
    !state.preferences ||
    !state.filters
  )
    throw new AppError(
      'El formato de data/state.json no es compatible. El archivo se ha conservado.',
      500,
    );
  return state;
}
export const saveState = (state: State) =>
  atomicJson(join(dataDir(), 'state.json'), state);

// ponytail: one local user; reject concurrent mutations instead of adding a job queue.
let busy = false;
export async function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  if (busy)
    throw new AppError(
      'Hay una operación en curso. Espera a que termine e inténtalo de nuevo.',
      409,
    );
  busy = true;
  try {
    return await fn();
  } finally {
    busy = false;
  }
}
