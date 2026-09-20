import { execFile } from 'node:child_process';
import { join, resolve, isAbsolute } from 'node:path';
import { access } from 'node:fs/promises';
import { AppError, atomicJson, config, dataDir, readJson } from './store.ts';
import { log, logError } from '../lib/log.ts';
import type { Game } from '../lib/model.ts';

type Cache = Record<string, { checkedAt: number; data: Game['hltb'] | null }>;
const WEEK = 7 * 86400000;
const cachePath = () => join(dataDir(), 'hltb.json');
export const getHltbCache = () => readJson<Cache>(cachePath(), {});
export async function expireHltbCache() {
    const cache = await getHltbCache();
    for (const entry of Object.values(cache)) entry.checkedAt = 0;
    await atomicJson(cachePath(), cache);
}
export const withHltb = (games: Game[], cache: Cache) =>
    games.map((g) => ({
        ...g,
        ...(cache[g.appId]?.data ? { hltb: cache[g.appId].data! } : {}),
    }));
async function pythonPath() {
    const custom = (await config()).python;
    if (custom && !isAbsolute(custom))
        throw new AppError('NEXTPLAY_PYTHON debe ser una ruta absoluta.', 503);
    return (
        custom ||
        resolve(
            '.venv-hltb',
            process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
        )
    );
}
export async function hltbAvailable() {
    try {
        await access(await pythonPath());
        return true;
    } catch {
        return false;
    }
}
export function pendingHltb(games: Game[], cache: Cache) {
    const now = Date.now();
    return games.filter(
        (game) =>
            game.appId > 0 &&
            !cache[game.appId]?.data?.mainHours &&
            now - (cache[game.appId]?.checkedAt ?? 0) >= WEEK,
    );
}
export function validateHltb(value: unknown, games: Game[]) {
    if (!Array.isArray(value) || value.length !== games.length)
        throw new AppError('Respuesta incompleta de HowLongToBeat.', 502);
    const used = new Set<number>();
    return value.map((row) => {
        if (
            !row ||
            !games.some((g) => g.appId === row.appId) ||
            used.has(row.appId)
        )
            throw new AppError(
                'Identificador no válido de HowLongToBeat.',
                502,
            );
        used.add(row.appId);
        const d = row.data;
        if (
            d !== null &&
            (!d ||
                !Number.isSafeInteger(d.id) ||
                d.id <= 0 ||
                !['mainHours', 'extraHours', 'completionHours'].every(
                    (k) =>
                        d[k] === null ||
                        (typeof d[k] === 'number' &&
                            Number.isFinite(d[k]) &&
                            d[k] > 0 &&
                            d[k] <= 100000),
                ))
        )
            throw new AppError('Duraciones no válidas de HowLongToBeat.', 502);
        return {
            appId: row.appId as number,
            checkedAt: Date.now(),
            data:
                d === null
                    ? null
                    : ({
                          id: d.id,
                          mainHours: d.mainHours,
                          extraHours: d.extraHours,
                          completionHours: d.completionHours,
                          at: Date.now(),
                      } as Game['hltb']),
        };
    });
}
async function runPython(games: Game[]): Promise<unknown> {
    const binary = await pythonPath();
    const env = {
        NODE_ENV: process.env.NODE_ENV,
        ...Object.fromEntries(
            Object.entries(process.env).filter(([key]) =>
                [
                    'SYSTEMROOT',
                    'WINDIR',
                    'TEMP',
                    'TMP',
                    'PATH',
                    'LOCALAPPDATA',
                ].includes(key.toUpperCase()),
            ),
        ),
    };
    return new Promise((resolveResult, reject) => {
        const child = execFile(
            binary,
            ['-I', '-X', 'utf8', resolve('scripts/hltb.py')],
            {
                shell: false,
                windowsHide: true,
                timeout: 60000,
                maxBuffer: 128000,
                env,
            },
            (error, stdout) => {
                if (error)
                    return reject(
                        new AppError(
                            'No se pudo consultar HowLongToBeat. Se conservan los datos anteriores y las duraciones de IGDB.',
                            502,
                        ),
                    );
                try {
                    resolveResult(JSON.parse(stdout));
                } catch {
                    reject(
                        new AppError(
                            'HowLongToBeat devolvió datos ilegibles.',
                            502,
                        ),
                    );
                }
            },
        );
        child.stdin?.on('error', () => {});
        child.stdin?.end(
            JSON.stringify(
                games.map((g) => ({ appId: g.appId, name: g.name })),
            ),
        );
    });
}
export async function refreshHltb(
    games: Game[],
    cache: Cache,
    force = false,
    runner = runPython,
) {
    const missing = (force
        ? games.filter((game) => game.appId > 0)
        : pendingHltb(games, cache)
    ).slice(0, 8);
    if (!missing.length) {
        log('server', 'hltb:refresh:skipped', { games: games.length });
        return [];
    }
    const started = Date.now();
    log('server', 'hltb:refresh:work', {
        games: missing.length,
        force,
    });
    try {
        const rows = validateHltb(await runner(missing), missing);
        const next = { ...cache };
        for (const row of rows) {
            // A missing match does not erase a previously verified duration.
            next[row.appId] = {
                checkedAt: row.checkedAt,
                data: row.data ?? cache[row.appId]?.data ?? null,
            };
        }
        await atomicJson(cachePath(), next);
        Object.assign(cache, next);
        log('server', 'hltb:refresh:stored', {
            games: rows.length,
            ms: Date.now() - started,
        });
        return rows.some((r) => r.data === null)
            ? [
                  'No se encontró una correspondencia inequívoca en HLTB para algunos candidatos; se mantiene IGDB o la última lectura válida.',
              ]
            : [];
    } catch (e) {
        logError('server', 'hltb:refresh:failed', e, {
            games: missing.length,
            ms: Date.now() - started,
        });
        return [
            e instanceof AppError
                ? e.message
                : 'HowLongToBeat no está disponible. Se conservan los datos anteriores.',
        ];
    }
}
