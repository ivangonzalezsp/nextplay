import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../server/codex.ts';

void test('Codex errors identify the failure without leaking raw output', async (t) => {
    const previous = process.env.NEXTPLAY_CODEX_BIN;
    process.env.NEXTPLAY_CODEX_BIN = process.execPath;
    const logs: unknown[][] = [];
    t.mock.method(console, 'info', (...args: unknown[]) => logs.push(args));
    t.mock.method(console, 'error', (...args: unknown[]) => logs.push(args));
    try {
        for (const [raw, expected, status] of [
            [
                JSON.stringify({
                    type: 'error',
                    status: 400,
                    error: {
                        type: 'invalid_request_error',
                        message:
                            "The 'gpt-6-astra' model requires a newer version of Codex. Please upgrade to the latest app or CLI and try again.",
                    },
                }),
                /Actualiza Codex CLI/,
                502,
            ],
            ['Input exceeds the context window limit', /contexto/, 502],
            ['The model is not supported', /modelo o el esfuerzo/, 502],
            [
                'MCP startup failed: required server library failed',
                /catálogo local/,
                502,
            ],
            ['error: unexpected argument --example', /argumentos/, 502],
            ['stream disconnected before completion', /conexión/, 502],
            ['usage limit reached', /límite de uso/, 429],
            ['401 Unauthorized', /iniciar sesión/, 503],
            ['Not logged in', /iniciar sesión/, 503],
            ['Unknown failure', /no ha podido completar/, 502],
        ] as const) {
            await assert.rejects(
                runProcess(
                    [
                        '-e',
                        `process.stdout.write(JSON.stringify({type:'turn.failed',error:{message:${JSON.stringify(raw + ' PRIVATE_SENTINEL')}}})); process.exitCode=1`,
                        '--',
                        '--json',
                    ],
                    '',
                    10_000,
                ),
                (error: unknown) => {
                    assert.ok(error instanceof Error);
                    assert.match(error.message, expected);
                    assert.equal(
                        (error as Error & { status: number }).status,
                        status,
                    );
                    return true;
                },
            );
        }
        assert.ok(!JSON.stringify(logs).includes('PRIVATE_SENTINEL'));
        assert.ok(
            logs.some(
                ([, details]) =>
                    (details as { exitCode?: number })?.exitCode === 1,
            ),
        );
    } finally {
        if (previous === undefined) delete process.env.NEXTPLAY_CODEX_BIN;
        else process.env.NEXTPLAY_CODEX_BIN = previous;
    }
});
