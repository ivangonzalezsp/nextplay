import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess, { type SpawnOptions } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { codexModels } from '../server/codex.ts';
import { parseCodexSettings } from '../server/selection.ts';
import { codexSettingsAvailable, EMPTY_STATE } from '../lib/model.ts';
import { handle } from '../server/api.ts';
import { readState, saveState } from '../server/store.ts';

void test('Codex catalog follows authenticated pagination and validates model/effort settings without inference', async (t) => {
    const dir = await mkdtemp(join(tmpdir(), 'nextplay-codex-models-'));
    const previous = {
        NEXTPLAY_DATA_DIR: process.env.NEXTPLAY_DATA_DIR,
        NEXTPLAY_USER_DIR: process.env.NEXTPLAY_USER_DIR,
        NEXTPLAY_CODEX_BIN: process.env.NEXTPLAY_CODEX_BIN,
        CODEX_HOME: process.env.CODEX_HOME,
    };
    Object.assign(process.env, {
        NEXTPLAY_DATA_DIR: dir,
        NEXTPLAY_USER_DIR: dir,
        NEXTPLAY_CODEX_BIN: process.execPath,
        CODEX_HOME: join(dir, 'codex'),
    });
    const model = (name: string, effort = 'low') => ({
        model: name,
        displayName: name,
        defaultReasoningEffort: effort,
        supportedReasoningEfforts: [{ reasoningEffort: effort }],
    });
    let account: object | null = {
        type: 'chatgpt',
        planType: 'free',
        email: 'private@example.test',
    };
    let fail = false;
    const spawn = childProcess.spawn;
    const mocked = t.mock.method(
        childProcess,
        'spawn',
        (command: string, args: string[], options: SpawnOptions) => {
            assert.equal(command, process.execPath);
            if (args[0] === 'login')
                return spawn(
                    command,
                    ['-e', 'console.log("Logged in using ChatGPT")'],
                    options,
                );
            assert.deepEqual(args, ['app-server', '-c', 'mcp_servers={}']);
            const script = `
            const rl = require('node:readline').createInterface({input:process.stdin});
            let initialized = false;
            rl.on('line', line => {
                const req = JSON.parse(line);
                if (req.method === 'initialized') { initialized = true; return; }
                let result;
                if (req.method === 'initialize') result = {};
                else if (!initialized) process.exit(1);
                else if (req.method === 'account/read') result = {account:${JSON.stringify(account)}};
                else if (req.method === 'model/list') {
                    if (${fail}) { console.log(JSON.stringify({id:req.id,error:{message:'private failure'}})); return; }
                    result = req.params.cursor
                        ? {data:[${JSON.stringify(model('future-model', 'none'))},${JSON.stringify({ ...model('hidden-model'), hidden: true })}],nextCursor:null}
                        : {data:[${JSON.stringify(model('free-model', 'high'))}],nextCursor:'page-2'};
                } else process.exit(1); // No threads, inference turns or tools allowed.
                console.log(JSON.stringify({id:req.id,result}));
            });`;
            return spawn(command, ['-e', script], options);
        },
    );
    syncBuiltinESMExports();
    t.mock.method(globalThis, 'fetch', () => {
        throw new Error('No direct network calls expected');
    });
    try {
        const catalog = await codexModels();
        assert.deepEqual(catalog, [
            {
                model: 'free-model',
                displayName: 'free-model',
                efforts: ['high'],
                defaultEffort: 'high',
            },
            {
                model: 'future-model',
                displayName: 'future-model',
                efforts: ['none'],
                defaultEffort: 'none',
            },
        ]);
        const fallback = { model: 'gpt-5.6-luna', effort: 'medium' as const };
        assert.throws(() => parseCodexSettings(fallback, fallback, catalog));
        assert.throws(() =>
            parseCodexSettings(
                { model: 'free-model', effort: 'max' },
                fallback,
                catalog,
            ),
        );
        assert.deepEqual(
            parseCodexSettings(
                { model: 'future-model', effort: 'none' },
                fallback,
                catalog,
            ),
            { model: 'future-model', effort: 'none' },
        );
        assert.equal(codexSettingsAvailable(fallback, catalog), false);
        assert.equal(codexSettingsAvailable(fallback, null), true);
        assert.deepEqual(
            parseCodexSettings(
                { model: 'gpt-6-luna', effort: 'none' },
                { model: 'gpt-6-luna', effort: 'none' },
                null,
            ),
            { model: 'gpt-6-luna', effort: 'none' },
        );
        assert.throws(() =>
            parseCodexSettings(
                { model: 'gpt-6-luna', effort: 'invalid' },
                fallback,
                null,
            ),
        );

        await saveState(structuredClone(EMPTY_STATE));
        const save = (codex: object) =>
            handle(
                new Request(
                    'http://127.0.0.1:3000/api/recommendations/settings',
                    {
                        method: 'PATCH',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ engine: 'codex', codex }),
                    },
                ),
            );
        assert.equal((await save(fallback)).status, 400);
        assert.equal((await readState()).codex?.model, fallback.model);
        const settings = { model: 'free-model', effort: 'high' };
        const response = await save(settings);
        assert.equal(response.status, 200);
        const snapshot = await response.json();
        assert.deepEqual(snapshot.codex, settings);
        assert.deepEqual(snapshot.setup.codexModels, catalog);
        assert.ok(!JSON.stringify(snapshot).includes('private@example.test'));
        assert.deepEqual((await readState()).codex, settings);

        account = null;
        assert.deepEqual(await codexModels(), []);
        account = { type: 'chatgpt', planType: 'pro' };
        fail = true;
        assert.equal(await codexModels(), null);
    } finally {
        mocked.mock.restore();
        syncBuiltinESMExports();
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        await rm(dir, { recursive: true, force: true });
    }
});
