import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
    desktopLinkTarget,
    desktopShortcut,
    installedDesktop,
    startDesktopServer,
    stopDesktopServer,
} from '../scripts/desktop-runtime.mjs';
import { createServer } from 'node:http';

void test(
    'Windows GUI launcher starts its sibling supervisor without a console and forwards background mode',
    { skip: process.platform !== 'win32' },
    async (t) => {
        const base = resolve('work/desktop-runtime-tests');
        await mkdir(base, { recursive: true });
        const dir = await mkdtemp(join(base, 'launcher with spaces-'));
        t.after(() => rm(dir, { recursive: true, force: true }));
        await cp(
            'scripts/windows-launcher.vbs',
            join(dir, 'windows-launcher.vbs'),
        );
        await writeFile(
            join(dir, 'windows-launcher.ps1'),
            `param([switch] $Background)
$record = @{background=[bool]$Background;window=(Get-Process -Id $PID).MainWindowHandle.ToInt64()}
$record | ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $PSScriptRoot ('result-' + [bool]$Background + '.json'))`,
        );
        for (const background of [false, true]) {
            const result = spawnSync(
                'wscript.exe',
                [
                    join(dir, 'windows-launcher.vbs'),
                    ...(background ? ['-Background'] : []),
                ],
                { windowsHide: true, timeout: 5000 },
            );
            assert.equal(
                result.status,
                0,
                String(result.error ?? result.stderr),
            );
            const path = join(
                dir,
                `result-${background ? 'True' : 'False'}.json`,
            );
            let record: { background: boolean; window: number } | undefined;
            for (let attempt = 0; attempt < 100; attempt++) {
                try {
                    record = JSON.parse(await readFile(path, 'utf8'));
                    break;
                } catch {
                    await new Promise<void>((done) => setTimeout(done, 50));
                }
            }
            assert.deepEqual(record, { background, window: 0 });
        }
    },
);

void test('installed desktop reuses the existing profile and rejects a different server identity', async (t) => {
    const base = resolve('work/desktop-runtime-tests');
    await mkdir(base, { recursive: true });
    const profile = await mkdtemp(join(base, 'installed-'));
    const server = createServer((_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(
            JSON.stringify({ application: 'nextplay', instance: 'actual' }),
        );
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const port = (server.address() as { port: number }).port;
    t.after(async () => {
        await new Promise<void>((done, fail) =>
            server.close((error) => (error ? fail(error) : done())),
        );
        await rm(profile, { recursive: true, force: true });
    });
    const record = {
        url: `http://127.0.0.1:${port}`,
        instance: 'actual',
        version: '0.10.0',
    };
    await writeFile(join(profile, 'runtime.json'), JSON.stringify(record));
    assert.deepEqual(await installedDesktop(profile), record);
    await writeFile(
        join(profile, 'runtime.json'),
        JSON.stringify({ ...record, instance: 'forged' }),
    );
    await assert.rejects(installedDesktop(profile), /identity mismatch/);
    await writeFile(
        join(profile, 'runtime.json'),
        JSON.stringify({ ...record, url: 'https://example.com' }),
    );
    await assert.rejects(
        installedDesktop(profile),
        /Invalid installed server address/,
    );
});

void test('menu-free desktop keeps editing, reload and window shortcuts without stealing plain text', () => {
    const input = {
        type: 'keyDown',
        key: 'c',
        control: true,
        meta: false,
        alt: false,
        shift: false,
    };
    assert.equal(desktopShortcut(input, 'win32'), 'copy');
    assert.equal(desktopShortcut({ ...input, control: false }, 'win32'), null);
    assert.equal(desktopShortcut({ ...input, type: 'keyUp' }, 'win32'), null);
    assert.equal(desktopShortcut({ ...input, alt: true }, 'win32'), null);
    assert.equal(desktopShortcut({ ...input, shift: true }, 'win32'), null);
    assert.equal(desktopShortcut(input, 'darwin'), null);
    assert.equal(
        desktopShortcut({ ...input, control: false, meta: true }, 'darwin'),
        'copy',
    );
    for (const [key, action] of Object.entries({
        x: 'cut',
        v: 'paste',
        a: 'selectAll',
        z: 'undo',
        y: 'redo',
        r: 'reload',
        w: 'close',
        q: 'quit',
        '+': 'zoomIn',
        '-': 'zoomOut',
        '0': 'resetZoom',
    }))
        assert.equal(desktopShortcut({ ...input, key }, 'linux'), action);
    assert.equal(
        desktopShortcut({ ...input, key: 'z', shift: true }, 'win32'),
        'redo',
    );
    assert.equal(
        desktopShortcut({ ...input, key: 'r', shift: true }, 'win32'),
        'forceReload',
    );
    assert.equal(
        desktopShortcut({ ...input, key: '+', shift: true }, 'win32'),
        'zoomIn',
    );
    assert.equal(
        desktopShortcut({ ...input, key: 'F11', control: false }, 'win32'),
        'fullscreen',
    );
});

void test('desktop links stay local or use HTTPS / Steam run; unsafe protocols and credentials are blocked', () => {
    const origin = 'http://127.0.0.1:43210';
    assert.equal(desktopLinkTarget(origin + '/library', origin), 'internal');
    assert.equal(
        desktopLinkTarget('https://store.steampowered.com/app/400/', origin),
        'external',
    );
    assert.equal(desktopLinkTarget('steam://run/400', origin), 'external');
    for (const url of [
        'http://127.0.0.1:43211/',
        'http://127.0.0.1.attacker.example:43210/',
        'http://user@127.0.0.1:43210/',
        'https://user:password@example.com/',
        'javascript:alert(1)',
        'file:///C:/Windows/System32/cmd.exe',
        'data:text/html,hello',
        'steam://install/400',
        'steam://run/0',
        'steam://run/400/--argument',
        'steam://run/400?argument=evil',
        'not a URL',
    ])
        assert.equal(desktopLinkTarget(url, origin), 'blocked', url);
});

void test('desktop server isolates credentials and paths, persists data, and terminates only its child', async (t) => {
    const base = resolve('work/desktop-runtime-tests');
    await mkdir(base, { recursive: true });
    const root = await mkdtemp(join(base, 'app-'));
    const profile = join(root, 'profile with spaces');
    await mkdir(join(root, 'scripts'));
    await writeFile(
        join(root, '.env.local'),
        'STEAM_API_KEY=synthetic-env-key\n',
    );
    await writeFile(
        join(root, 'scripts/start-server.ts'),
        `
        import { config } from ${JSON.stringify(pathToFileURL(resolve('server/store.ts')).href)};
        import { mkdir, writeFile } from 'node:fs/promises';
        import { join } from 'node:path';
        const connections = await config();
        await mkdir(process.env.NEXTPLAY_DATA_DIR, { recursive: true });
        await writeFile(join(process.env.NEXTPLAY_DATA_DIR, 'kept.txt'), 'kept');
        process.send({ type: 'nextplay:ready', url: 'http://127.0.0.1:43210' });
        process.on('message', message => { if (message === 'nextplay:inspect') process.send({
            user: process.env.NEXTPLAY_USER_DIR,
            data: process.env.NEXTPLAY_DATA_DIR,
            codex: process.env.CODEX_HOME,
            steam: connections.steam,
            inherited: !!process.env.NEXTPLAY_INSTALLED || !!process.env.OPENAI_API_KEY,
            args: process.argv.slice(2),
        }); });
        process.on('message', message => { if (message === 'nextplay:shutdown') process.exit(0); });
    `,
    );
    t.after(async () => {
        assert.ok(root.startsWith(base));
        await rm(root, { recursive: true, force: true });
    });
    const previous = { ...process.env };
    process.env.STEAM_API_KEY = 'synthetic-parent-key';
    process.env.OPENAI_API_KEY = 'synthetic-parent-key';
    process.env.NEXTPLAY_INSTALLED = '1';
    let running;
    try {
        running = await startDesktopServer({
            root,
            profile,
            node: process.execPath,
        });
    } finally {
        process.env = previous;
    }
    t.after(() => stopDesktopServer(running.child));
    const status = await new Promise<Record<string, unknown>>((done) => {
        running.child.once('message', done);
        running.child.send('nextplay:inspect');
    });
    assert.equal(running.url, 'http://127.0.0.1:43210');
    assert.deepEqual(status, {
        user: profile,
        data: join(profile, 'data'),
        codex: join(profile, 'codex'),
        steam: '',
        inherited: false,
        args: ['--desktop', '--hostname', '127.0.0.1', '--port', '0'],
    });
    await stopDesktopServer(running.child);
    assert.equal(running.child.exitCode, 0);
    await stopDesktopServer(running.child);
    const { readFile } = await import('node:fs/promises');
    assert.equal(
        await readFile(join(profile, 'data/kept.txt'), 'utf8'),
        'kept',
    );
    const again = await startDesktopServer({
        root,
        profile,
        node: process.execPath,
    });
    t.after(() => stopDesktopServer(again.child));
    const resumed = await new Promise<Record<string, unknown>>((done) => {
        again.child.once('message', done);
        again.child.send('nextplay:inspect');
    });
    assert.deepEqual(resumed.args, [
        '--desktop',
        '--hostname',
        '127.0.0.1',
        '--port',
        '43210',
    ]);
    await stopDesktopServer(again.child);
    await writeFile(
        join(profile, 'desktop-server.json'),
        JSON.stringify({ port: 0 }),
    );
    await assert.rejects(
        startDesktopServer({ root, profile, node: process.execPath }),
        /Invalid desktop profile port/,
    );
});

void test('desktop startup reports server failure before opening a window', async (t) => {
    const base = resolve('work/desktop-runtime-tests');
    await mkdir(base, { recursive: true });
    const root = await mkdtemp(join(base, 'failed-'));
    await mkdir(join(root, 'scripts'));
    await writeFile(join(root, 'scripts/start-server.ts'), 'process.exit(2);');
    t.after(() => rm(root, { recursive: true, force: true }));
    await assert.rejects(
        startDesktopServer({
            root,
            profile: join(root, 'profile'),
            node: process.execPath,
        }),
        /server exited \(2\)/,
    );
});
