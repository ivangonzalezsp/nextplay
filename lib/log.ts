export function log(
    scope: 'browser' | 'server',
    event: string,
    details?: unknown,
) {
    const prefix = `[nextplay:${scope}] ${new Date().toISOString()} ${event}`;
    if (details === undefined) console.info(prefix);
    else console.info(prefix, details);
}

export function logError(
    scope: 'browser' | 'server',
    event: string,
    error: unknown,
    details?: Record<string, unknown>,
) {
    console.error(`[nextplay:${scope}] ${new Date().toISOString()} ${event}`, {
        ...details,
        error: error instanceof Error ? error.message : String(error),
    });
}
