import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';

const execute = promisify(execFile);
const image = process.argv[2] || 'nextplay-server:latest';
const name = `nextplay-test-${randomUUID()}`;
const volume = `${name}-data`;
const docker = async (...args) =>
    (
        await execute('docker', args, { timeout: 90_000, maxBuffer: 4_000_000 })
    ).stdout.trim();
const inside = (code) =>
    docker('exec', name, 'node', '--input-type=module', '-e', code);
let url;

async function start() {
    await docker(
        'run',
        '--detach',
        '--init',
        '--name',
        name,
        '--publish',
        '127.0.0.1::3000',
        '--mount',
        `type=volume,source=${volume},target=/var/lib/nextplay`,
        image,
    );
    const mapping = await docker('port', name, '3000/tcp');
    assert.match(mapping, /^127\.0\.0\.1:\d+$/);
    url = `http://${mapping}`;
    for (let attempt = 0; attempt < 180; attempt++) {
        try {
            const response = await fetch(`${url}/api/health`, {
                signal: AbortSignal.timeout(1000),
            });
            if (
                response.ok &&
                (await response.json()).application === 'nextplay'
            )
                return;
        } catch {
            /* Wait for startup. */
        }
        await sleep(250);
    }
    throw new Error('Docker server did not become ready.');
}

async function stop() {
    await docker('stop', '--time', '10', name);
    assert.notEqual(
        await docker('inspect', '--format', '{{.State.ExitCode}}', name),
        '137',
        'Server must stop without SIGKILL',
    );
    await docker('rm', name);
}

try {
    await start();
    const response = await fetch(url);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Next Play/);
    const assets = [...html.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))"/g)]
        .map((match) => match[1])
        .filter((path) => path.startsWith('/'));
    assert.ok(assets.some((path) => path.endsWith('.js')));
    assert.ok(assets.some((path) => path.endsWith('.css')));
    for (const asset of new Set(assets)) {
        const result = await fetch(url + asset);
        assert.equal(result.status, 200, asset);
        assert.match(
            result.headers.get('content-type') || '',
            /javascript|css/,
        );
    }
    assert.equal(await docker('exec', name, 'id', '-u'), '1000');
    await inside(`
        import assert from 'node:assert/strict';
        import { access } from 'node:fs/promises';
        for (const path of ['/app/.env.local', '/app/node_modules/electron'])
            await assert.rejects(access(path), { code: 'ENOENT' });
    `);
    assert.match(await docker('exec', name, 'codex', '--version'), /0\.154\.0/);
    await docker(
        'exec',
        name,
        '/opt/hltb/bin/python',
        '-c',
        'import howlongtobeatpy',
    );
    const state = await (await fetch(`${url}/api/state`)).json();
    assert.equal(state.games.length, 0);
    assert.equal(state.setup.hltb, true);
    assert.equal(state.setup.codex, false);
    const app = await (await fetch(`${url}/api/app`)).json();
    assert.equal(app.installed, false);
    assert.equal(
        app.canManage,
        false,
        'Published Docker port must not grant administration',
    );
    const denied = await fetch(`${url}/api/connections`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            STEAM_API_KEY: '0123456789abcdef0123456789abcdef',
        }),
    });
    assert.equal(denied.status, 403);
    // Seed synthetic settings through the real loopback peer, never real accounts.
    await inside(`
        import assert from 'node:assert/strict';
        const result = await fetch('http://127.0.0.1:3000/api/connections', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ STEAM_API_KEY: '0123456789abcdef0123456789abcdef' }),
        });
        assert.equal(result.status, 200);
        const app = await result.json();
        assert.equal(app.connections.STEAM_API_KEY, true);
        assert.ok(!JSON.stringify(app).includes('0123456789abcdef0123456789abcdef'));
        const { DatabaseSync } = await import('node:sqlite');
        const db = new DatabaseSync('/var/lib/nextplay/data/library.sqlite');
        db.exec("CREATE TABLE docker_smoke (value TEXT); INSERT INTO docker_smoke VALUES ('kept');");
        db.close();
    `);
    await stop();
    await start();
    const restored = await (await fetch(`${url}/api/app`)).json();
    assert.equal(restored.connections.STEAM_API_KEY, true);
    assert.ok(
        !JSON.stringify(restored).includes('0123456789abcdef0123456789abcdef'),
    );
    await inside(`
        import assert from 'node:assert/strict';
        import { DatabaseSync } from 'node:sqlite';
        const db = new DatabaseSync('/var/lib/nextplay/data/library.sqlite');
        assert.equal(db.prepare('SELECT value FROM docker_smoke').get().value, 'kept');
        assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
        db.close();
        const { openDatabase } = await import('./server/database.ts');
        openDatabase('/tmp/nextplay-mcp-test.sqlite').close();
        const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
        const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
        const client = new Client({ name: 'nextplay-docker-test', version: '1.0.0' });
        try {
            await client.connect(new StdioClientTransport({ command: process.execPath,
                args: ['scripts/library-mcp.ts', '/tmp/nextplay-mcp-test.sqlite'], cwd: '/app' }));
            const result = await client.callTool({ name: 'query_games', arguments: {} });
            assert.ok(!result.isError);
            assert.equal(JSON.parse(result.content[0].text).total, 0);
        } finally { await client.close(); }
    `);
    await stop();
    console.log(
        'Docker verified: HTML/JS/CSS, runtimes, MCP, local administration, SQLite and settings after recreation.',
    );
} catch (error) {
    const logs = await docker('logs', name).catch(() => '');
    if (logs) console.error(logs);
    throw error;
} finally {
    await docker('rm', '--force', name).catch(() => {});
    await docker('volume', 'rm', volume).catch(() => {});
}
