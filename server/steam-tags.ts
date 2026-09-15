import { setTimeout as delay } from 'node:timers/promises';

export const STEAM_TAG_SOURCE = 'steam-apphoverpublic:english';
export const STEAM_TAG_INTERVAL_MS = 500;
const HOVER_HOST = 'store.steampowered.com';

export type SteamTag = {
    id?: number;
    name: string;
    englishName?: string;
};

type TagRow = { id: number; name: string };

export type TagDictionaries = {
    englishByName: Map<string, number[]>;
    englishById: Map<number, string>;
    spanishById: Map<number, string>;
};

export type SteamTagClientOptions = {
    fetcher?: typeof fetch;
    intervalMs?: number;
    timeoutMs?: number;
    maxAttempts?: number;
    sleep?: (milliseconds: number) => Promise<void>;
};

export class SteamTagsError extends Error {
    readonly status?: number;
    readonly retryable: boolean;

    constructor(
        message: string,
        options: { status?: number; retryable?: boolean } = {},
    ) {
        super(message);
        this.name = 'SteamTagsError';
        this.status = options.status;
        this.retryable = options.retryable ?? false;
    }
}

const entities: Record<string, string> = {
    amp: '&',
    apos: "'",
    copy: '©',
    gt: '>',
    hellip: '…',
    ldquo: '“',
    ldquor: '„',
    lsaquo: '‹',
    lsquo: '‘',
    nbsp: ' ',
    ndash: '–',
    mdash: '—',
    quot: '"',
    rdquo: '”',
    rdquor: '”',
    rsaquo: '›',
    rsquo: '’',
    lt: '<',
    reg: '®',
    trade: '™',
};

export function decodeHtml(value: string) {
    return value.replace(
        /&(#(?:x[\da-f]+|\d+)|[a-z][\da-z]+);?/gi,
        (match, raw: string) => {
            const entity = raw.toLowerCase();
            if (entity.startsWith('#x')) {
                const code = Number.parseInt(entity.slice(2), 16);
                return Number.isInteger(code) && code > 0 && code <= 0x10ffff
                    ? String.fromCodePoint(code)
                    : match;
            }
            if (entity.startsWith('#')) {
                const code = Number.parseInt(entity.slice(1), 10);
                return Number.isInteger(code) && code > 0 && code <= 0x10ffff
                    ? String.fromCodePoint(code)
                    : match;
            }
            return entities[entity] ?? match;
        },
    );
}

export function retryAfterMilliseconds(
    value: string | null | undefined,
    now = Date.now(),
) {
    const raw = value?.trim();
    if (!raw) return undefined;
    if (/^\d+(?:\.\d+)?$/.test(raw)) {
        const seconds = Number(raw);
        return Number.isFinite(seconds) ? seconds * 1000 : undefined;
    }
    if (!/^(?:[A-Za-z]{3,9},\s|[A-Za-z]{3}\s+[A-Za-z]{3}\s)/.test(raw))
        return undefined;
    const date = Date.parse(raw);
    return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

function key(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLocaleLowerCase('en');
}

function rows(value: unknown, language: string): TagRow[] {
    if (!Array.isArray(value))
        throw new SteamTagsError(
            `Steam devolvió un diccionario ${language} inválido.`,
        );
    const result: TagRow[] = [];
    for (const raw of value) {
        const row = raw as { tagid?: unknown; name?: unknown };
        if (
            typeof row?.tagid === 'number' &&
            Number.isSafeInteger(row.tagid) &&
            row.tagid > 0 &&
            typeof row.name === 'string' &&
            row.name.trim()
        )
            result.push({ id: row.tagid, name: row.name.trim().slice(0, 200) });
    }
    if (!result.length)
        throw new SteamTagsError(
            `Steam devolvió un diccionario ${language} vacío.`,
        );
    return result;
}

export function createTagDictionaries(
    englishValue: unknown,
    spanishValue: unknown,
): TagDictionaries {
    const english = rows(englishValue, 'inglés');
    const spanish = rows(spanishValue, 'español');
    const englishByName = new Map<string, number[]>();
    const englishById = new Map<number, string>();
    const spanishById = new Map<number, string>();
    for (const row of english) {
        const ids = englishByName.get(key(row.name)) ?? [];
        if (!ids.includes(row.id)) ids.push(row.id);
        englishByName.set(key(row.name), ids);
        englishById.set(row.id, row.name);
    }
    for (const row of spanish) spanishById.set(row.id, row.name);
    return { englishByName, englishById, spanishById };
}

function rootContent(html: string, appId: number) {
    const open = new RegExp(
        `<div\\b[^>]*\\bid\\s*=\\s*(["'])hover_app_${appId}\\1[^>]*>`,
        'i',
    ).exec(html);
    if (!open)
        throw new SteamTagsError('Steam no devolvió el contenedor del AppID.');
    let depth = 1;
    const tokens = /<\/?div\b[^>]*>/gi;
    tokens.lastIndex = open.index + open[0].length;
    let match: RegExpExecArray | null;
    while ((match = tokens.exec(html))) {
        if (match[0].startsWith('</')) depth--;
        else if (!/\/\s*>$/.test(match[0])) depth++;
        if (depth === 0)
            return html.slice(open.index + open[0].length, match.index);
    }
    throw new SteamTagsError('Steam devolvió un HTML incompleto.');
}

export function parseHoverTags(
    html: string,
    appId: number,
    dictionaries?: TagDictionaries,
): SteamTag[] {
    if (!Number.isSafeInteger(appId) || appId <= 0)
        throw new SteamTagsError('El AppID no es válido.');
    const content = rootContent(html, appId);
    const result: SteamTag[] = [];
    const seen = new Set<string>();
    const tags =
        /<div\b[^>]*\bclass\s*=\s*(?:"[^"]*\bapp_tag\b[^"]*"|'[^']*\bapp_tag\b[^']*')[^>]*>([\s\S]*?)<\/div\s*>/gi;
    let match: RegExpExecArray | null;
    while ((match = tags.exec(content))) {
        const name = decodeHtml(match[1].replace(/<[^>]*>/g, ' '))
            .replace(/\s+/g, ' ')
            .trim();
        if (!name) continue;
        const ids = dictionaries?.englishByName.get(key(name));
        const id = ids?.length === 1 ? ids[0] : undefined;
        const dedupeKey = id === undefined ? `name:${key(name)}` : `id:${id}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        if (id !== undefined) {
            result.push({
                ...(id > 0 ? { id } : {}),
                name: dictionaries?.spanishById.get(id) ?? name,
                englishName: dictionaries?.englishById.get(id) ?? name,
            });
        } else result.push({ name, englishName: name });
    }
    return result;
}

function hoverUrl(appId: number) {
    return `https://${HOVER_HOST}/apphoverpublic/${appId}?l=english&cc=ES`;
}

function tagDataUrl(language: 'english' | 'spanish') {
    return `https://${HOVER_HOST}/tagdata/populartags/${language}`;
}

export function createSteamTagClient(options: SteamTagClientOptions = {}) {
    const fetcher = options.fetcher ?? fetch;
    const intervalMs = Math.max(0, options.intervalMs ?? STEAM_TAG_INTERVAL_MS);
    const timeoutMs = Math.max(1000, options.timeoutMs ?? 15_000);
    const maxAttempts = Math.max(1, Math.min(4, options.maxAttempts ?? 3));
    const sleep =
        options.sleep ?? ((milliseconds: number) => delay(milliseconds));
    let nextRequestAt = 0;

    async function requestText(url: string) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const wait = Math.max(0, nextRequestAt - Date.now());
            if (wait) await sleep(wait);
            nextRequestAt = Date.now() + intervalMs;
            let response: Response;
            try {
                response = await fetcher(url, {
                    redirect: 'error',
                    signal: AbortSignal.timeout(timeoutMs),
                });
            } catch {
                if (attempt < maxAttempts) {
                    await sleep(Math.min(2000, 250 * 2 ** (attempt - 1)));
                    continue;
                }
                throw new SteamTagsError(
                    'Steam no respondió a tiempo o rechazó la conexión.',
                    { retryable: true },
                );
            }
            if (response.url) {
                try {
                    const finalUrl = new URL(response.url);
                    const requested = new URL(url);
                    if (
                        finalUrl.hostname !== HOVER_HOST ||
                        finalUrl.pathname !== requested.pathname
                    )
                        throw new SteamTagsError(
                            'Steam redirigió la consulta.',
                            {
                                retryable: false,
                            },
                        );
                } catch (error) {
                    if (error instanceof SteamTagsError) throw error;
                    throw new SteamTagsError(
                        'Steam devolvió una URL inválida.',
                    );
                }
            }
            if (response.status === 429) {
                if (attempt >= maxAttempts)
                    throw new SteamTagsError('Steam ha limitado la consulta.', {
                        status: 429,
                        retryable: true,
                    });
                await sleep(
                    retryAfterMilliseconds(
                        response.headers.get('retry-after'),
                    ) ?? 1000 * 2 ** (attempt - 1),
                );
                continue;
            }
            if (!response.ok)
                throw new SteamTagsError(
                    `Steam respondió con HTTP ${response.status}.`,
                    {
                        status: response.status,
                    },
                );
            try {
                return await response.text();
            } catch {
                throw new SteamTagsError(
                    'Steam devolvió una respuesta ilegible.',
                );
            }
        }
        throw new SteamTagsError('No se pudo consultar Steam.', {
            retryable: true,
        });
    }

    return {
        async loadDictionaries() {
            const english = JSON.parse(
                await requestText(tagDataUrl('english')),
            );
            const spanish = JSON.parse(
                await requestText(tagDataUrl('spanish')),
            );
            return createTagDictionaries(english, spanish);
        },
        async fetchGameTags(appId: number, dictionaries?: TagDictionaries) {
            return parseHoverTags(
                await requestText(hoverUrl(appId)),
                appId,
                dictionaries,
            );
        },
    };
}
