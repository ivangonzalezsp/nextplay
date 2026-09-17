import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { AppError, atomicJson, readJson, userDir } from './store.ts';

export const releaseRepo = 'ivangonzalezsp/nextplay-releases';
export const appVersion = () => process.env.NEXTPLAY_VERSION || '0.3.0';
export type Release = {
    version: string;
    installer: string;
    checksums: string;
    notesUrl: string;
};
type UpdateCache = { checkedAt?: number; release?: Release; error?: string };
export function newerVersion(candidate: string, current: string) {
    if (!/^\d+\.\d+\.\d+$/.test(candidate) || !/^\d+\.\d+\.\d+$/.test(current))
        return false;
    const a = candidate.split('.').map(Number),
        b = current.split('.').map(Number);
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
    return false;
}
function currentCache(cache: UpdateCache) {
    return cache.release && !newerVersion(cache.release.version, appVersion())
        ? { ...cache, release: undefined }
        : cache;
}
export function parseRelease(value: unknown): Release {
    const r = value as {
        tag_name?: string;
        draft?: boolean;
        prerelease?: boolean;
        assets?: { name: string; browser_download_url: string }[];
    };
    if (
        !r ||
        typeof r.tag_name !== 'string' ||
        !/^v\d+\.\d+\.\d+$/.test(r.tag_name) ||
        r.draft ||
        r.prerelease ||
        !Array.isArray(r.assets)
    )
        throw new AppError(
            'La publicación no tiene un formato compatible.',
            502,
        );
    const version = r.tag_name.slice(1);
    const base = `https://github.com/${releaseRepo}/releases/download/${r.tag_name}/`;
    const asset = (name: string) => {
        const matches = r.assets!.filter(
            (a) => a?.name === name && a.browser_download_url === base + name,
        );
        if (matches.length !== 1)
            throw new AppError(
                'La publicación no contiene un instalador verificable.',
                502,
            );
        return matches[0].browser_download_url;
    };
    return {
        version,
        installer: asset(`NextPlay-Setup-${version}-x64.exe`),
        checksums: asset('SHA256SUMS.txt'),
        notesUrl: `https://github.com/${releaseRepo}/releases/tag/${r.tag_name}`,
    };
}
export async function publicDownload(
    url: string,
    timeout = 30_000,
): Promise<Response> {
    const allowed = new Set([
        'api.github.com',
        'github.com',
        'release-assets.githubusercontent.com',
        'objects.githubusercontent.com',
    ]);
    const signal = AbortSignal.timeout(timeout);
    for (let i = 0; i < 5; i++) {
        const parsed = new URL(url);
        if (
            parsed.protocol !== 'https:' ||
            parsed.username ||
            parsed.password ||
            parsed.port ||
            !allowed.has(parsed.hostname)
        )
            throw new AppError('Destino de actualización no permitido.', 502);
        const response = await fetch(url, {
            redirect: 'manual',
            signal,
            headers: {
                'User-Agent': 'NextPlay-Updater',
                Accept: 'application/octet-stream',
            },
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            await response.body?.cancel();
            const location = response.headers.get('location');
            if (!location) break;
            url = new URL(location, url).href;
            continue;
        }
        return response;
    }
    throw new AppError('No se ha podido descargar la actualización.', 502);
}
async function limitedText(response: Response, maximum: number) {
    if (!response.ok || !response.body)
        throw new AppError('No se ha podido consultar la publicación.', 502);
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        size += chunk.byteLength;
        if (size > maximum)
            throw new AppError(
                'La publicación supera el tamaño permitido.',
                502,
            );
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
}
let checking: Promise<UpdateCache> | undefined;
export async function updateStatus() {
    const cache = currentCache(
        await readJson<UpdateCache>(join(userDir(), 'update-check.json'), {}),
    );
    const due = !cache.checkedAt || Date.now() - cache.checkedAt >= 86_400_000;
    if (due) void checkUpdates().catch(() => {});
    return { ...cache, checking: due || !!checking };
}
export async function checkUpdates(force = false): Promise<UpdateCache> {
    const path = join(userDir(), 'update-check.json');
    const cache = currentCache(await readJson<UpdateCache>(path, {}));
    if (!force && cache.checkedAt && Date.now() - cache.checkedAt < 86_400_000)
        return cache;
    if (checking) return checking;
    checking = (async () => {
        let next: UpdateCache = { checkedAt: Date.now() };
        try {
            const response = await fetch(
                `https://api.github.com/repos/${releaseRepo}/releases/latest`,
                {
                    headers: {
                        Accept: 'application/vnd.github+json',
                        'User-Agent': 'NextPlay-Updater',
                    },
                    redirect: 'error',
                    signal: AbortSignal.timeout(20_000),
                },
            );
            if (response.status !== 404) {
                const release = parseRelease(
                    JSON.parse(await limitedText(response, 256_000)),
                );
                if (newerVersion(release.version, appVersion()))
                    next.release = release;
            }
        } catch {
            next = {
                ...next,
                error: 'No se han podido buscar actualizaciones. Puedes volver a intentarlo; la aplicación sigue disponible.',
            };
        }
        await atomicJson(path, next);
        return next;
    })();
    try {
        return await checking;
    } finally {
        checking = undefined;
    }
}
export async function downloadVerified(
    response: Response,
    destination: string,
    expectedHash: string,
    maxBytes = 1_500_000_000,
) {
    if (!response.ok || !response.body || !/^[a-f\d]{64}$/i.test(expectedHash))
        throw new AppError('El instalador no se puede verificar.', 502);
    const temp = destination + '.' + randomUUID() + '.partial';
    const file = await open(temp, 'wx');
    const hash = createHash('sha256');
    let size = 0;
    try {
        for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
            size += chunk.byteLength;
            if (size > maxBytes)
                throw new AppError(
                    'El instalador supera el tamaño permitido.',
                    502,
                );
            hash.update(chunk);
            let offset = 0;
            while (offset < chunk.byteLength)
                offset += (
                    await file.write(chunk, offset, chunk.byteLength - offset)
                ).bytesWritten;
        }
        if (!size || hash.digest('hex') !== expectedHash.toLowerCase())
            throw new AppError(
                'La descarga está incompleta o ha sido alterada. Vuelve a intentarlo.',
                502,
            );
        await file.sync();
        await file.close();
        await rename(temp, destination);
    } finally {
        await file.close().catch(() => {});
        await rm(temp, { force: true });
    }
}
export async function prepareUpdate() {
    const { release, error } = await checkUpdates(true);
    if (!release)
        throw new AppError(
            error || 'Ya tienes la última versión disponible.',
            409,
        );
    // Construct URLs again; persisted metadata is never an executable/download authority.
    const name = `NextPlay-Setup-${release.version}-x64.exe`;
    const base = `https://github.com/${releaseRepo}/releases/download/v${release.version}/`;
    const sums = await limitedText(
        await publicDownload(base + 'SHA256SUMS.txt'),
        16_000,
    );
    const matches = sums
        .split(/\r?\n/)
        .map((line) => /^([a-f\d]{64})\s+\*?([^\s]+)$/i.exec(line))
        .filter((match) => match?.[2] === name);
    if (matches.length !== 1)
        throw new AppError('Falta la comprobación del instalador.', 502);
    const digest = matches[0]![1].toLowerCase();
    const folder = join(userDir(), 'updates');
    await mkdir(folder, { recursive: true });
    const installer = join(folder, name);
    await downloadVerified(
        await publicDownload(base + name, 600_000),
        installer,
        digest,
    );
    return { installer, digest, version: release.version };
}
