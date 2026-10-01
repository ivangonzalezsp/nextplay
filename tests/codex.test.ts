import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess, { type SpawnOptions } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runProcess, outputSchema } from '../server/codex.ts';
import { DEFAULT_FILTERS, EMPTY_STATE } from '../lib/model.ts';
import type { Snapshot, RecommendationStreamFrame } from '../lib/model.ts';
import {
    validatePicks,
    recentRecommendationPenalties,
} from '../server/selection.ts';
import { handle } from '../server/api.ts';
import { atomicJson, saveState, readState } from '../server/store.ts';

void test('Codex clarification responses are distinct from recommendations and empty searches', () => {
    const question = {
        needsClarification: true,
        message: '¿Prefieres explorar con calma o buscas un reto?',
        owned: [],
        discoveries: [],
    };
    assert.ok(outputSchema().required.includes('needsClarification'));
    assert.deepEqual(validatePicks(question, []), question);
    assert.deepEqual(validatePicks(question, [], 'guided'), question);
    assert.throws(() => validatePicks(question, [], 'direct'));
    assert.throws(() =>
        validatePicks({ ...question, needsClarification: false }, [], 'guided'),
    );
    for (const needsClarification of [null, 'true', 1, {}])
        assert.throws(() =>
            validatePicks({ ...question, needsClarification }, []),
        );
    for (const message of ['', '   ', 'x'.repeat(3001)])
        assert.throws(() => validatePicks({ ...question, message }, []));
    for (const bucket of ['owned', 'discoveries'])
        assert.throws(() =>
            validatePicks({ ...question, [bucket]: [{ appId: 1 }] }, []),
        );
    // Existing results and searches with no matches still mean a recommendation.
    assert.equal(
        validatePicks(
            { message: 'No hay candidatos.', owned: [], discoveries: [] },
            [],
        ).needsClarification,
        false,
    );
    assert.equal(
        validatePicks({ ...question, needsClarification: false }, [])
            .needsClarification,
        false,
    );
});

void test('clarifications survive reload, feed the next streamed reply and do not enter recommendation history', async (t) => {
    const dir = await mkdtemp(join(tmpdir(), 'nextplay-clarification-'));
    const previous = {
        NEXTPLAY_DATA_DIR: process.env.NEXTPLAY_DATA_DIR,
        NEXTPLAY_USER_DIR: process.env.NEXTPLAY_USER_DIR,
        NEXTPLAY_CODEX_BIN: process.env.NEXTPLAY_CODEX_BIN,
    };
    process.env.NEXTPLAY_DATA_DIR = dir;
    process.env.NEXTPLAY_USER_DIR = dir;
    process.env.NEXTPLAY_CODEX_BIN = process.execPath;
    const filters = {
        ...DEFAULT_FILTERS,
        mode: 'next' as const,
        minutes: null,
    };
    const state = structuredClone(EMPTY_STATE);
    state.games = [
        {
            appId: -901,
            igdbId: 901,
            name: 'Isla tranquila',
            owned: true,
            platform: 'PC',
            playtimeMinutes: 0,
            recentMinutes: 0,
        },
    ];
    state.games.push({
        ...state.games[0],
        appId: -902,
        igdbId: 902,
        name: 'Referencia',
    });
    const picks = {
        needsClarification: false,
        message: 'Prueba esta aventura tranquila.',
        owned: [
            {
                appId: -901,
                reason: 'Exploración.',
                whyNow: 'Encaja con lo que has pedido.',
                caveat: 'Duración desconocida.',
            },
        ],
        discoveries: [],
    };
    state.history = [
        {
            id: 'previous',
            text: '',
            filters,
            result: {
                ...validatePicks(picks, state.games),
                at: 1,
                warnings: [],
            },
        },
    ];
    const question = {
        needsClarification: true,
        message: '¿Exploración tranquila o combates exigentes?',
        owned: [],
        discoveries: [],
    };
    let response: unknown = question;
    let lastExecArgs: string[] = [];
    const spawn = childProcess.spawn;
    const mockedSpawn = t.mock.method(
        childProcess,
        'spawn',
        (command: string, args: string[], options: SpawnOptions) => {
            assert.equal(command, process.execPath);
            assert.ok(['exec', 'login'].includes(args[0]));
            if (args[0] === 'exec') lastExecArgs = args;
            const script =
                args[0] === 'login'
                    ? 'console.log("Logged in using ChatGPT")'
                    : `let prompt = ''; process.stdin.on('data', chunk => prompt += chunk); process.stdin.on('end', () => {
                const fs = require('node:fs');
                fs.writeFileSync(${JSON.stringify(join(dir, 'prompt.txt'))}, prompt);
                fs.copyFileSync(${JSON.stringify(args[args.indexOf('--output-schema') + 1])}, ${JSON.stringify(join(dir, 'schema.json'))});
                fs.writeFileSync(${JSON.stringify(args[args.indexOf('--output-last-message') + 1])}, ${JSON.stringify(JSON.stringify(response))});
            });`;
            return spawn(command, ['-e', script], options);
        },
    );
    syncBuiltinESMExports();
    t.mock.method(globalThis, 'fetch', () => {
        throw new Error('No network calls expected');
    });
    const request = (path: string, payload: object) =>
        handle(
            new Request(`http://127.0.0.1:3000/api/${path}`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload),
            }),
        );
    try {
        await atomicJson(join(dir, 'settings.json'), {
            connections: {
                STEAM_API_KEY: null,
                STEAM_FAMILY_TOKEN: null,
                TWITCH_CLIENT_ID: null,
                TWITCH_CLIENT_SECRET: null,
            },
        });
        await saveState(state);
        for (const conversationMode of [null, 'automatic', 1]) {
            const invalid = await request('recommendations', {
                engine: 'codex',
                filters,
                text: '',
                conversationMode,
            });
            assert.equal(invalid.status, 400);
        }
        const asked = await request('recommendations', {
            engine: 'codex',
            codex: { model: 'gpt-6.1-sol', effort: 'high' },
            conversationMode: 'guided',
            filters,
            text: 'No sé qué jugar.',
            referenceAppId: -902,
        });
        assert.equal(asked.status, 200);
        assert.equal(
            lastExecArgs[lastExecArgs.indexOf('--model') + 1],
            'gpt-6.1-sol',
        );
        assert.ok(lastExecArgs.includes('model_reasoning_effort="high"'));
        const first = (await asked.json()) as Snapshot;
        assert.equal(first.conversation.length, 1);
        assert.equal(first.conversation[0].result.needsClarification, true);
        assert.equal(first.conversation[0].reference?.appId, -902);
        assert.deepEqual(first.history, state.history);
        const reloaded = await readState();
        assert.deepEqual(reloaded.conversation, first.conversation);
        assert.deepEqual(
            [...recentRecommendationPenalties(reloaded)],
            [[-901, 30]],
        );
        const guidedSchema = JSON.parse(
            await readFile(join(dir, 'schema.json'), 'utf8'),
        );
        assert.deepEqual(guidedSchema.properties.needsClarification.enum, [
            true,
        ]);
        assert.equal(guidedSchema.properties.owned.maxItems, 0);
        assert.equal(guidedSchema.properties.discoveries.maxItems, 0);

        // Answering keeps guided mode until the player explicitly requests picks.
        assert.equal(
            (
                await handle(
                    new Request(
                        'http://127.0.0.1:3000/api/recommendations/settings',
                        {
                            method: 'PATCH',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({
                                engine: 'codex',
                                codex: { model: 'gpt-6-luna', effort: 'max' },
                            }),
                        },
                    ),
                )
            ).status,
            200,
        );
        response = {
            ...question,
            message:
                '¿Prefieres una historia corta o explorar durante varias sesiones?',
        };
        const followUp = await request('recommendations', {
            engine: 'codex',
            filters,
            text: 'Explorar con calma, sin combates.',
        });
        assert.equal(followUp.status, 200);
        assert.equal(
            lastExecArgs[lastExecArgs.indexOf('--model') + 1],
            'gpt-6-luna',
        );
        assert.ok(lastExecArgs.includes('model_reasoning_effort="max"'));
        const guided = await readState();
        assert.equal(guided.conversation.length, 2);
        assert.equal(guided.conversation[1].result.needsClarification, true);
        assert.equal(guided.conversation[1].reference?.appId, -902);
        assert.deepEqual(guided.history, state.history);
        const guidedData = JSON.parse(
            (await readFile(join(dir, 'prompt.txt'), 'utf8')).split(
                'DATOS_JSON:\n',
            )[1],
        );
        assert.equal(guidedData.conversationMode, 'guided');
        assert.equal(guidedData.history[0].reply, question.message);

        response = picks;
        const answered = await request('recommendations/stream', {
            engine: 'codex',
            conversationMode: 'direct',
            filters,
            text: 'Una historia corta. Recomiéndame ya.',
        });
        const frames = (await answered.text())
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line) as RecommendationStreamFrame);
        const result = frames.at(-1)!;
        assert.equal(result.type, 'result');
        if (result.type !== 'result') assert.fail(JSON.stringify(result));
        assert.equal(result.data.conversation.length, 3);
        assert.equal(
            result.data.conversation[2].result.needsClarification,
            false,
        );
        assert.equal(result.data.conversation[2].result.owned[0].appId, -901);
        assert.equal(result.data.history!.length, 2);
        assert.deepEqual(result.data.history![0], state.history[0]);
        const prompt = await readFile(join(dir, 'prompt.txt'), 'utf8');
        const data = JSON.parse(prompt.split('DATOS_JSON:\n')[1]);
        assert.equal(data.history[0].needsClarification, true);
        assert.equal(data.history[0].reply, question.message);
        assert.equal(data.history[0].text, 'No sé qué jugar.');
        assert.equal(data.text, 'Una historia corta. Recomiéndame ya.');
        assert.equal(data.history[1].text, 'Explorar con calma, sin combates.');
        assert.equal(data.conversationMode, 'direct');
        assert.deepEqual(
            JSON.parse(await readFile(join(dir, 'schema.json'), 'utf8'))
                .properties.needsClarification.enum,
            [false],
        );
        assert.deepEqual(data.history[0].picks, []);
        assert.equal(data.reference.game.appId, -902);
        assert.ok(
            !data.candidates.some(
                (game: { appId: number }) => game.appId === -902,
            ),
        );
        assert.equal(result.data.conversation[2].reference, undefined);

        response = question;
        assert.equal(
            (
                await request('recommendations', {
                    engine: 'codex',
                    filters,
                    text: 'Algo parecido',
                    conversationMode: 'guided',
                    referenceAppId: -902,
                })
            ).status,
            200,
        );
        response = picks;
        assert.equal(
            (
                await request('recommendations', {
                    engine: 'codex',
                    filters,
                    text: 'Recomiéndame ya',
                    conversationMode: 'direct',
                    referenceAppId: null,
                })
            ).status,
            200,
        );
        const withoutReference = JSON.parse(
            (await readFile(join(dir, 'prompt.txt'), 'utf8')).split(
                'DATOS_JSON:\n',
            )[1],
        );
        assert.equal(withoutReference.reference, undefined);
        assert.ok(
            withoutReference.candidates.some(
                (game: { appId: number }) => game.appId === -902,
            ),
        );

        response = { ...picks, needsClarification: true };
        assert.equal(
            (
                await request('recommendations', {
                    engine: 'codex',
                    filters,
                    text: 'Otra opción',
                })
            ).status,
            502,
        );
        assert.equal((await readState()).conversation.length, 5);
        // A model that ignores the selected mode cannot save an unwanted result.
        response = picks;
        assert.equal(
            (
                await request('recommendations', {
                    engine: 'codex',
                    filters,
                    text: '',
                    conversationMode: 'guided',
                })
            ).status,
            502,
        );
        response = question;
        assert.equal(
            (
                await request('recommendations', {
                    engine: 'codex',
                    filters,
                    text: '',
                    conversationMode: 'direct',
                })
            ).status,
            502,
        );
        assert.equal((await readState()).conversation.length, 5);

        // Guided mode still asks when filters leave no candidates, even in comfort mode.
        assert.equal(
            (
                await request('recommendations', {
                    engine: 'codex',
                    filters: {
                        ...filters,
                        genre: 'Estrategia',
                        comfortZone: true,
                    },
                    text: '',
                    conversationMode: 'guided',
                })
            ).status,
            200,
        );
        const emptyData = JSON.parse(
            (await readFile(join(dir, 'prompt.txt'), 'utf8')).split(
                'DATOS_JSON:\n',
            )[1],
        );
        assert.equal(emptyData.catalog.total, 0);
        assert.equal(emptyData.comfortZone, undefined);
        assert.equal(
            (await readState()).conversation.at(-1)!.result.needsClarification,
            true,
        );
        const reset = await request('conversation/reset', { filters });
        assert.equal(reset.status, 200);
        const cleared = await readState();
        assert.equal(cleared.conversation.length, 0);
        assert.equal(cleared.history!.length, 3);
    } finally {
        mockedSpawn.mock.restore();
        syncBuiltinESMExports();
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        await rm(dir, { recursive: true, force: true });
    }
});

void test('Codex JSON events are available to progress listeners', async () => {
    const previous = process.env.NEXTPLAY_CODEX_BIN;
    process.env.NEXTPLAY_CODEX_BIN = process.execPath;
    const events: Record<string, unknown>[] = [];
    try {
        await runProcess(
            [
                '-e',
                "process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'mcp_tool_call',status:'completed'}})+String.fromCharCode(10))",
                '--',
                '--json',
            ],
            '',
            10_000,
            process.cwd(),
            (event) => events.push(event),
        );
        assert.equal(events[0]?.type, 'item.completed');
        assert.equal(
            (events[0]?.item as { type?: string })?.type,
            'mcp_tool_call',
        );
    } finally {
        if (previous === undefined) delete process.env.NEXTPLAY_CODEX_BIN;
        else process.env.NEXTPLAY_CODEX_BIN = previous;
    }
});

void test('Codex processes stop when the request is cancelled', async () => {
    const previous = process.env.NEXTPLAY_CODEX_BIN;
    process.env.NEXTPLAY_CODEX_BIN = process.execPath;
    const controller = new AbortController();
    try {
        const pending = runProcess(
            ['-e', 'setTimeout(() => {}, 60000)'],
            '',
            undefined,
            process.cwd(),
            undefined,
            controller.signal,
        );
        controller.abort();
        await assert.rejects(pending, (error: unknown) => {
            assert.equal(
                (error as Error).message,
                'La búsqueda se ha detenido.',
            );
            assert.equal((error as { status?: number }).status, 499);
            return true;
        });
    } finally {
        if (previous === undefined) delete process.env.NEXTPLAY_CODEX_BIN;
        else process.env.NEXTPLAY_CODEX_BIN = previous;
    }
});

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
