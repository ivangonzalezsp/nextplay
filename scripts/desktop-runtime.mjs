import { fork } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export function desktopShortcut(input, platform = process.platform) {
    if (input.type !== 'keyDown' || input.alt) return null;
    if (input.key === 'F11') return 'fullscreen';
    if (!(platform === 'darwin' ? input.meta : input.control)) return null;
    const key = input.key.toLowerCase();
    if (input.shift && key === 'z') return 'redo';
    if (input.shift && key === 'r') return 'forceReload';
    if (input.shift && key !== '+') return null;
    return (
        {
            c: 'copy',
            x: 'cut',
            v: 'paste',
            a: 'selectAll',
            z: 'undo',
            y: 'redo',
            r: 'reload',
            w: 'close',
            q: 'quit',
            '+': 'zoomIn',
            '=': 'zoomIn',
            '-': 'zoomOut',
            0: 'resetZoom',
        }[key] || null
    );
}

export function desktopLinkTarget(value, origin) {
    try {
        const url = new URL(value);
        if (url.username || url.password) return 'blocked';
        if (url.origin === origin && url.protocol === 'http:')
            return 'internal';
        if (url.protocol === 'https:') return 'external';
        if (/^steam:\/\/run\/[1-9]\d*$/.test(value)) return 'external';
    } catch {
        // Malformed links never reach the operating system.
    }
    return 'blocked';
}

export function stopDesktopServer(child) {
    if (child.exitCode !== null || child.signalCode !== null)
        return Promise.resolve();
    return new Promise((done) => {
        const timer = setTimeout(() => child.kill(), 8000);
        child.once('close', () => {
            clearTimeout(timer);
            done();
        });
        if (child.connected)
            child.send('nextplay:shutdown', (error) => {
                if (error) child.kill();
            });
        else child.kill();
    });
}

export async function startDesktopServer({ root, profile, node }) {
    await mkdir(join(profile, 'codex'), { recursive: true });
    // ponytail: retain the port for browser storage; use a custom scheme if port conflicts become frequent.
    const portFile = join(profile, 'desktop-server.json');
    let port = 0;
    try {
        port = JSON.parse(await readFile(portFile, 'utf8')).port;
        if (!Number.isInteger(port) || port < 1 || port > 65535)
            throw new Error('Invalid desktop profile port.');
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
    const env = Object.fromEntries(
        Object.entries(process.env).filter(
            ([key]) =>
                !/^(NEXTPLAY_|STEAM_|TWITCH_|CODEX_|OPENAI_|GH_|GITHUB_|ELECTRON_)/i.test(
                    key,
                ),
        ),
    );
    Object.assign(env, {
        NEXTPLAY_DESKTOP: '1',
        NEXTPLAY_USER_DIR: profile,
        NEXTPLAY_DATA_DIR: join(profile, 'data'),
        CODEX_HOME: join(profile, 'codex'),
    });
    const child = fork(
        join(root, 'scripts/start-server.ts'),
        ['--desktop', '--hostname', '127.0.0.1', '--port', String(port)],
        {
            cwd: root,
            execPath: node,
            execArgv: [],
            env,
            windowsHide: true,
            stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
        },
    );
    return new Promise((done, fail) => {
        const timer = setTimeout(
            () => failed(new Error('Next Play server startup timed out.')),
            60_000,
        );
        const failed = (error) => {
            clearTimeout(timer);
            child.off('message', ready);
            child.off('error', failed);
            child.off('close', exited);
            void stopDesktopServer(child);
            fail(error);
        };
        const exited = (code) =>
            failed(new Error(`Next Play server exited (${code}).`));
        const ready = async (message) => {
            if (message?.type !== 'nextplay:ready') return;
            if (!/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(message.url)) {
                failed(new Error('Invalid Next Play server address.'));
                return;
            }
            clearTimeout(timer);
            child.off('message', ready);
            child.off('error', failed);
            child.off('close', exited);
            try {
                await writeFile(
                    portFile + '.tmp',
                    JSON.stringify({ port: Number(new URL(message.url).port) }),
                );
                await rename(portFile + '.tmp', portFile);
                if (child.exitCode !== null || child.signalCode !== null)
                    throw new Error('Next Play server exited during startup.');
                done({ child, url: message.url });
            } catch (error) {
                failed(error);
            }
        };
        child.once('error', failed);
        child.once('close', exited);
        child.on('message', ready);
    });
}
