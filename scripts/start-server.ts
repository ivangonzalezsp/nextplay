import { readFile, mkdir } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import { attestLocalPeer } from '../server/local-access.ts';
import { atomicJson, userDir, userSettings } from '../server/store.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
Object.assign(process.env, { NODE_ENV: 'production' });
const installed = process.argv.includes('--installed');
const desktop = process.argv.includes('--desktop');
if (desktop) process.env.NEXTPLAY_DESKTOP = '1';
const argument = (key: string, fallback: string) =>
    process.argv[process.argv.indexOf(key) + 1] && process.argv.includes(key)
        ? process.argv[process.argv.indexOf(key) + 1]
        : fallback;
if (installed) {
    if (!process.env.LOCALAPPDATA && !process.env.NEXTPLAY_USER_DIR)
        throw new Error('Windows no ha indicado tu carpeta de usuario.');
    process.env.NEXTPLAY_INSTALLED = '1';
    process.env.NEXTPLAY_USER_DIR ||= join(
        process.env.LOCALAPPDATA!,
        'NextPlay',
    );
    process.env.NEXTPLAY_DATA_DIR = join(userDir(), 'data');
    process.env.NEXTPLAY_CODEX_BIN = join(root, 'runtime/codex/bin/codex.exe');
    process.env.NEXTPLAY_PYTHON = join(root, 'runtime/python/python.exe');
    process.env.CODEX_HOME = join(userDir(), 'codex');
    await mkdir(process.env.CODEX_HOME, { recursive: true });
} else if (!desktop) {
    try {
        loadEnvFile(join(root, '.env.local'));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
}
process.env.NEXTPLAY_VERSION = JSON.parse(
    await readFile(join(root, 'package.json'), 'utf8'),
).version;
process.env.NEXTPLAY_INSTANCE = randomUUID();
process.env.NEXTPLAY_SESSION_TOKEN = randomBytes(32).toString('hex');
const settings = await userSettings();
const host = installed
    ? settings.lan
        ? '0.0.0.0'
        : '127.0.0.1'
    : argument('--hostname', '127.0.0.1');
const port = Number(argument('--port', installed ? '3001' : '3000'));
if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('Puerto no válido.');
const { startProdServer } = await import('vinext/server/prod-server');
const running = await startProdServer({
    host,
    port,
    outDir: join(root, 'dist'),
});
process.env.NEXTPLAY_PORT = String(running.port);
const handlers = running.server.listeners('request');
running.server.removeAllListeners('request');
running.server.on('request', (request, response) => {
    attestLocalPeer(request);
    for (const handler of handlers)
        handler.call(running.server, request, response);
});
if (installed) {
    await mkdir(userDir(), { recursive: true });
    await atomicJson(join(userDir(), 'runtime.json'), {
        pid: process.pid,
        url: `http://127.0.0.1:${running.port}`,
        port: running.port,
        version: process.env.NEXTPLAY_VERSION,
        instance: process.env.NEXTPLAY_INSTANCE,
        token: process.env.NEXTPLAY_SESSION_TOKEN,
    });
}
if (desktop && process.send) {
    let closing = false;
    const shutdown = () => {
        if (closing) return;
        closing = true;
        setTimeout(() => process.exit(0), 5000).unref();
        running.server.close(() => process.exit(0));
    };
    process.on('message', (message) => {
        if (message === 'nextplay:shutdown') shutdown();
    });
    process.once('disconnect', shutdown);
    process.send({
        type: 'nextplay:ready',
        url: `http://127.0.0.1:${running.port}`,
    });
}
