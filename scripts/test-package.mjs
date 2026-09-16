import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { parseEnv } from 'node:util';

const app = resolve(process.argv[2] || 'work/windows/app');
const tests = resolve('work/package-tests');
await mkdir(tests, { recursive: true });
const profile = await mkdtemp(join(tests, 'profile-'));
const env = {
    ...process.env,
    NEXTPLAY_USER_DIR: profile,
    PATH: `${process.env.SystemRoot}\\System32;${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0`,
    CODEX_HOME: join(profile, 'codex'),
};
for (const key of Object.keys(env))
    if (
        /^(STEAM_|TWITCH_|GH_|GITHUB_|OPENAI_|NEXTPLAY_)/.test(key) &&
        key !== 'NEXTPLAY_USER_DIR'
    )
        delete env[key];
await mkdir(env.CODEX_HOME, { recursive: true });
await writeFile(
    join(profile, 'update-check.json'),
    JSON.stringify({ checkedAt: Date.now() }),
);
const allowed = new Set([
    'dist',
    'public',
    'server',
    'lib',
    'package.json',
    'package-lock.json',
    'scripts',
    'node_modules',
    'runtime',
    'licenses',
    'runtime-versions.json',
]);
for (const name of await readdir(app))
    assert.ok(
        allowed.has(name) || /^unins\d+\.(exe|dat|msg)$/.test(name),
        `Unexpected bundle entry: ${name}`,
    );
let secrets = [];
try {
    secrets = Object.entries(parseEnv(await readFile('.env.local', 'utf8')))
        .filter(
            ([key, value]) =>
                /(KEY|TOKEN|SECRET|CLIENT_ID)$/.test(key) && value.length > 8,
        )
        .map(([, value]) => value);
} catch (error) {
    if (error.code !== 'ENOENT') throw error;
}
for (const folder of ['dist', 'server', 'lib', 'scripts', 'public']) {
    for (const path of await readdir(join(app, folder), { recursive: true })) {
        assert.ok(
            !/(^|[\\/])(?:\.git|\.env(?:\..*)?|auth\.json|settings\.json|library\.sqlite)(?:$|[\\/])/.test(
                path,
            ),
            'Personal file in bundle',
        );
        if (!/\.(ts|js|json|html|ps1|py)$/.test(path)) continue;
        const content = await readFile(join(app, folder, path), 'utf8');
        assert.ok(
            !secrets.some((secret) => content.includes(secret)),
            'A local credential leaked into the bundle',
        );
    }
}
const node = join(app, 'runtime/node.exe');
function command(binary, args) {
    const result = spawnSync(binary, args, {
        cwd: app,
        env,
        windowsHide: true,
        encoding: 'utf8',
        timeout: 30_000,
    });
    assert.equal(
        result.status,
        0,
        `${basename(binary)} failed: ${result.error?.message || result.stderr}`,
    );
    return result.stdout.trim();
}
assert.equal(command(node, ['--version']), 'v24.21.0');
assert.match(
    command(join(app, 'runtime/codex/bin/codex.exe'), ['--version']),
    /0\.154\.0/,
);
assert.equal(
    command(join(app, 'runtime/python/python.exe'), [
        '-I',
        '-B',
        '-c',
        'import howlongtobeatpy, requests, aiohttp, sys; print(sys.version.split()[0])',
    ]),
    '3.13.15',
);
let child, url;
const sleep = (ms) =>
    new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
async function start() {
    let logs = '';
    child = spawn(
        node,
        ['scripts/start-server.ts', '--installed', '--port', '0'],
        { cwd: app, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    child.stdout.on('data', (data) => {
        logs += data;
    });
    child.stderr.on('data', (data) => {
        logs += data;
    });
    child.on('error', (error) => {
        logs += error.message;
    });
    for (let i = 0; i < 120; i++) {
        if (child.exitCode !== null)
            throw new Error('Packaged server failed: ' + logs.slice(-6000));
        try {
            const record = JSON.parse(
                await readFile(join(profile, 'runtime.json'), 'utf8'),
            );
            if (record.pid === child.pid) {
                url = record.url;
                if ((await fetch(url + '/api/health')).ok) return;
            }
        } catch {
            /* Wait for this instance's atomic readiness file. */
        }
        await sleep(250);
    }
    throw new Error('Packaged server readiness timeout: ' + logs.slice(-6000));
}
async function api(path, body, method = 'POST') {
    const response = await fetch(
        url + '/api/' + path,
        body === undefined
            ? {}
            : {
                  method,
                  headers: { 'Content-Type': 'application/json', Origin: url },
                  body: JSON.stringify(body),
              },
    );
    assert.equal(
        response.status,
        200,
        `API ${path}: ${await response.clone().text()}`,
    );
    return response.json();
}
async function stop() {
    await api('app/exit', {});
    for (let i = 0; i < 40 && child.exitCode === null; i++) await sleep(100);
    assert.equal(child.exitCode, 0, 'Server must stop after its response');
}
try {
    await start();
    const html = await (await fetch(url)).text();
    assert.match(html, /Next Play/);
    const assets = [...html.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))"/g)]
        .map((match) => match[1])
        .filter((path) => path.startsWith('/'));
    assert.ok(assets.length, 'HTML must include compiled assets');
    for (const asset of new Set(assets))
        assert.equal(
            (await fetch(url + asset)).status,
            200,
            `Missing asset ${asset}`,
        );
    const state = await api('state');
    assert.equal(state.profile, null);
    assert.equal(state.games.length, 0);
    assert.equal(state.setup.hltb, true);
    assert.equal(state.setup.codex, false);
    const status = await api('app');
    assert.equal(status.installed, true);
    assert.equal(status.canManage, true);
    assert.equal(status.startup, false);
    assert.equal(status.lan, false);
    const key = '0123456789abcdef0123456789abcdef';
    const saved = await api('connections', { STEAM_API_KEY: key }, 'PATCH');
    assert.equal(saved.connections.STEAM_API_KEY, true);
    assert.ok(!JSON.stringify(saved).includes(key));
    await stop();
    await start();
    assert.equal((await api('app')).connections.STEAM_API_KEY, true);
    await stop();
    console.log(
        `Package verified without developer tools on PATH. Isolated data: ${profile}`,
    );
} finally {
    if (child && child.exitCode === null) child.kill();
}
