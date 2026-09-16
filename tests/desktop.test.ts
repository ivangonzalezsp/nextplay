import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    rm,
    writeFile,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { IncomingMessage } from 'node:http';
import { EMPTY_STATE, type State } from '../lib/model.ts';
import {
    atomicJson,
    config,
    exclusive,
    readState,
    saveConnections,
    userSettings,
} from '../server/store.ts';
import { openDatabase, storeState } from '../server/database.ts';
import { attestLocalPeer, canManage } from '../server/local-access.ts';
import { cancelLogin, importInstallation } from '../server/desktop.ts';
import { handle } from '../server/api.ts';
import {
    checkUpdates,
    downloadVerified,
    newerVersion,
    parseRelease,
    publicDownload,
    releaseRepo,
} from '../server/updates.ts';

async function isolated(t: TestContext) {
    const base = resolve('work/desktop-tests');
    await mkdir(base, { recursive: true });
    const dir = await mkdtemp(join(base, 'profile-'));
    const saved = { ...process.env };
    process.env.NEXTPLAY_USER_DIR = dir;
    process.env.NEXTPLAY_DATA_DIR = join(dir, 'data');
    process.env.NEXTPLAY_INSTALLED = '1';
    process.env.NEXTPLAY_VERSION = '0.2.0';
    for (const key of [
        'STEAM_API_KEY',
        'STEAM_FAMILY_TOKEN',
        'TWITCH_CLIENT_ID',
        'TWITCH_CLIENT_SECRET',
    ])
        delete process.env[key];
    await atomicJson(join(dir, 'update-check.json'), { checkedAt: Date.now() });
    t.after(async () => {
        process.env = saved;
        assert.ok(dir.startsWith(base + '\\') || dir.startsWith(base + '/'));
        await rm(dir, { recursive: true, force: true });
    });
    return dir;
}
function request(path: string, body: unknown, local = true) {
    const nodeRequest = {
        headers: {
            'x-nextplay-local-peer':
                process.env.NEXTPLAY_LOCAL_SECRET || 'forged',
        },
        socket: { remoteAddress: local ? '127.0.0.1' : '192.168.1.25' },
    } as unknown as IncomingMessage;
    attestLocalPeer(nodeRequest);
    return new Request('http://127.0.0.1:3001/api/' + path, {
        method: path === 'connections' ? 'PATCH' : 'POST',
        headers: {
            ...(nodeRequest.headers as Record<string, string>),
            'Content-Type': 'application/json',
            Origin: 'http://127.0.0.1:3001',
        },
        body: JSON.stringify(body),
    });
}
const digest = (value: string | Buffer) =>
    createHash('sha256').update(value).digest('hex');
const release = (version = '0.3.0') => ({
    tag_name: 'v' + version,
    draft: false,
    prerelease: false,
    assets: [`NextPlay-Setup-${version}-x64.exe`, 'SHA256SUMS.txt'].map(
        (name) => ({
            name,
            browser_download_url: `https://github.com/${releaseRepo}/releases/download/v${version}/${name}`,
        }),
    ),
});

void test('server shutdown terminates its own Codex child', async (t) => {
    const dir = await isolated(t);
    const pidFile = join(dir, 'child-pid');
    const runner = join(dir, 'runner.mjs');
    const childCode = `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000);`;
    await writeFile(
        runner,
        `import { existsSync } from 'node:fs';
        import { runProcess } from ${JSON.stringify(pathToFileURL(resolve('server/codex.ts')).href)};
        process.env.NEXTPLAY_CODEX_BIN = process.execPath;
        void runProcess(['-e', ${JSON.stringify(childCode)}]);
        setInterval(() => { if (existsSync(${JSON.stringify(pidFile)})) process.exit(0); }, 25);`,
    );
    const result = spawnSync(process.execPath, [runner], {
        windowsHide: true,
        encoding: 'utf8',
        timeout: 10_000,
    });
    assert.equal(result.status, 0, result.stderr);
    const pid = Number(await readFile(pidFile, 'utf8'));
    let alive = true;
    for (let i = 0; i < 40 && alive; i++) {
        try {
            process.kill(pid, 0);
            await new Promise((done) => setTimeout(done, 25));
        } catch (error) {
            assert.equal((error as NodeJS.ErrnoException).code, 'ESRCH');
            alive = false;
        }
    }
    if (alive) process.kill(pid);
    assert.equal(
        alive,
        false,
        'An owned Codex process survived server shutdown',
    );
});

void test('local authentication exposes pending status and cancellation without accepting a remote cancel', async (t) => {
    const dir = await isolated(t);
    process.env.NEXTPLAY_CODEX_BIN = process.execPath;
    await writeFile(join(dir, 'login'), 'setInterval(() => {}, 1000);');
    t.after(cancelLogin);
    const pending = await handle(request('app/login', {}));
    assert.equal(pending.status, 200);
    assert.equal((await pending.json()).login.state, 'pending');
    assert.equal(
        (await handle(request('app/login/cancel', {}, false))).status,
        403,
    );
    const cancelled = await handle(request('app/login/cancel', {}));
    assert.equal(cancelled.status, 200);
    assert.equal((await cancelled.json()).login.state, 'idle');
});

void test('administration uses the actual peer and rejects forged headers, origins and unknown fields', async (t) => {
    await isolated(t);
    assert.equal(canManage(request('app/exit', {}, false)), false);
    for (const path of [
        'connections',
        'app/login',
        'app/login/cancel',
        'app/update',
        'app/import',
        'app/exit',
    ])
        assert.equal((await handle(request(path, {}, false))).status, 403);
    const crossSite = request('connections', {});
    crossSite.headers.set('origin', 'https://attacker.example');
    assert.equal((await handle(crossSite)).status, 403);
    assert.equal(
        (await handle(request('connections', { NEXTPLAY_PYTHON: 'evil.exe' })))
            .status,
        400,
    );
    assert.deepEqual(await userSettings(), {});
});

void test('connections are atomic, write-only, preserve omitted keys and require explicit removal', async (t) => {
    const dir = await isolated(t);
    const key = 'abcdef0123456789abcdef0123456789';
    const response = await handle(
        request('connections', { STEAM_API_KEY: key }),
    );
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.ok(!body.includes(key));
    assert.equal(JSON.parse(body).connections.STEAM_API_KEY, true);
    await saveConnections({ TWITCH_CLIENT_ID: 'test-client' });
    assert.equal((await config()).steam, key);
    const before = await readFile(join(dir, 'settings.json'), 'utf8');
    await assert.rejects(
        saveConnections({
            TWITCH_CLIENT_SECRET: 'valid',
            STEAM_API_KEY: 'bad\nkey',
        }),
    );
    assert.equal(await readFile(join(dir, 'settings.json'), 'utf8'), before);
    await saveConnections({ STEAM_API_KEY: null });
    assert.equal((await config()).steam, '');
    assert.equal((await config()).clientId, 'test-client');
});

void test('import preserves manual games, history, preferences and credentials, leaving the source unchanged', async (t) => {
    const dir = await isolated(t);
    const source = join(dir, 'old-install');
    await mkdir(join(source, 'data'), { recursive: true });
    await atomicJson(join(source, 'package.json'), {
        name: 'what-should-i-play-next',
    });
    const previous: State = {
        ...structuredClone(EMPTY_STATE),
        games: [
            {
                appId: -42,
                name: 'Manual',
                platform: 'Switch',
                owned: true,
                playtimeMinutes: null,
                recentMinutes: null,
            },
        ],
        preferences: { '-42': { status: 'completed', favorite: true } },
        history: [
            {
                id: 'kept',
                text: 'Mi recomendación',
                filters: structuredClone(EMPTY_STATE.filters),
                result: {
                    at: 1,
                    message: 'Guardada',
                    owned: [],
                    discoveries: [],
                    warnings: [],
                },
            },
        ],
        playHistory: [{ appId: -42, name: 'Manual', kind: 'completed', at: 2 }],
    };
    const path = join(source, 'data/library.sqlite');
    const db = openDatabase(path);
    try {
        storeState(db, previous);
    } finally {
        db.close();
    }
    const original = digest(await readFile(path));
    const env =
        'STEAM_API_KEY=abcdef0123456789abcdef0123456789\nTWITCH_CLIENT_SECRET=test-secret\n';
    await writeFile(join(source, '.env.local'), env);
    await atomicJson(join(source, 'data/hltb.json'), {
        '400': { checkedAt: 123, data: null },
    });
    // Invalid imported credentials must fail before activating any data.
    await atomicJson(join(source, 'data/settings.json'), {
        connections: { STEAM_API_KEY: 'bad' },
    });
    await assert.rejects(importInstallation(source), /32 caracteres/);
    assert.equal((await readState()).games.length, 0);
    await rm(join(source, 'data/settings.json'));
    await importInstallation(source);
    assert.deepEqual(await readState(), previous);
    assert.equal((await config()).clientSecret, 'test-secret');
    assert.equal(digest(await readFile(path)), original);
    assert.equal(await readFile(join(source, '.env.local'), 'utf8'), env);
    await assert.rejects(importInstallation(source), /instalación nueva/);
    assert.deepEqual(await readState(), previous);
});

void test('updates accept only the official complete stable release and check at most daily', async (t) => {
    await isolated(t);
    assert.equal(newerVersion('0.10.0', '0.9.9'), true);
    assert.equal(newerVersion('0.2.0', '0.2.0'), false);
    assert.equal(newerVersion('0.3.0-beta', '0.2.0'), false);
    assert.equal(parseRelease(release()).version, '0.3.0');
    for (const invalid of [
        { ...release(), prerelease: true },
        { ...release(), assets: [] },
        { ...release(), tag_name: 'v../evil' },
    ])
        assert.throws(() => parseRelease(invalid));
    const altered = release();
    altered.assets[0].browser_download_url =
        'https://github.com/attacker/release.exe';
    assert.throws(() => parseRelease(altered));
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => {
        calls++;
        return Response.json(release());
    });
    await checkUpdates();
    assert.equal(calls, 0);
    assert.equal((await checkUpdates(true)).release?.version, '0.3.0');
    await checkUpdates();
    assert.equal(calls, 1);
    await assert.rejects(publicDownload('http://github.com/x'), /no permitido/);
    await assert.rejects(
        publicDownload('https://github.com.attacker.example/x'),
        /no permitido/,
    );
    // The global operation lock rejects update before a network call or process shutdown.
    await exclusive(async () =>
        assert.equal((await handle(request('app/update', {}))).status, 409),
    );
    assert.equal(calls, 1);
});

void test('interrupted, oversized and altered downloads never replace the verified installer', async (t) => {
    const dir = await isolated(t);
    const path = join(dir, 'installer.exe');
    await downloadVerified(new Response('good'), path, digest('good'));
    await assert.rejects(
        downloadVerified(new Response('altered'), path, digest('good')),
        /alterada/,
    );
    await assert.rejects(
        downloadVerified(
            new Response('oversized'),
            path,
            digest('oversized'),
            3,
        ),
        /tamaño/,
    );
    let reads = 0;
    const broken = new ReadableStream({
        pull(controller) {
            if (reads++ === 0)
                controller.enqueue(new TextEncoder().encode('half'));
            else controller.error(new Error('Interrupted'));
        },
    });
    await assert.rejects(
        downloadVerified(new Response(broken), path, digest('whole')),
        /Interrupted/,
    );
    assert.equal(await readFile(path, 'utf8'), 'good');
    assert.ok(!(await readdir(dir)).some((name) => name.endsWith('.partial')));
});
