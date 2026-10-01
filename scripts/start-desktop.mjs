import { spawn } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    desktopLinkTarget,
    startDesktopServer,
    stopDesktopServer,
} from './desktop-runtime.mjs';

const entry = fileURLToPath(import.meta.url);
const root = resolve(dirname(entry), '..');

if (!process.versions.electron) {
    try {
        await access(join(root, 'dist/server/index.js'));
    } catch {
        throw new Error(
            'Ejecuta npm run build primero. Run npm run build first.',
        );
    }
    // This prototype keeps the existing Node 24 server; packaged runtimes come later.
    process.env.electron_config_cache ||= join(root, 'work/electron-cache');
    const { default: electron } = await import('electron');
    const env = { ...process.env, NEXTPLAY_DESKTOP_NODE: process.execPath };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(electron, [entry, ...process.argv.slice(2)], {
        cwd: root,
        env,
        stdio: 'inherit',
        windowsHide: false,
    });
    child.once('error', (error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
    child.once('close', (code) => {
        process.exitCode = code ?? 1;
    });
    for (const signal of ['SIGINT', 'SIGTERM'])
        process.once(signal, () => child.kill());
} else {
    const { app, BrowserWindow, dialog, Menu, session, shell } =
        await import('electron');
    const profileIndex = process.argv.indexOf('--profile');
    if (profileIndex !== -1 && !process.argv[profileIndex + 1])
        throw new Error('--profile requires a directory.');
    const profile = resolve(
        profileIndex === -1
            ? join(root, 'work/desktop-profile')
            : process.argv[profileIndex + 1],
    );
    await mkdir(join(profile, 'electron'), { recursive: true });
    app.setName('Next Play');
    app.setPath('userData', join(profile, 'electron'));
    app.setPath('sessionData', join(profile, 'electron'));
    app.setAppLogsPath(join(profile, 'logs'));
    let server;
    let window;
    let stopping = false;
    let stopped = false;
    app.on('before-quit', (event) => {
        if (stopped || !server) return;
        event.preventDefault();
        if (stopping) return;
        stopping = true;
        void stopDesktopServer(server.child).finally(() => {
            stopped = true;
            app.quit();
        });
    });
    app.on('window-all-closed', () => app.quit());
    app.on('second-instance', () => {
        if (window?.isMinimized()) window.restore();
        window?.show();
        window?.focus();
    });
    if (!app.requestSingleInstanceLock()) {
        app.quit();
    } else {
        void app.whenReady().then(async () => {
            try {
                const en = !app.getLocale().startsWith('es');
                const label = (es, english) => (en ? english : es);
                server = await startDesktopServer({
                    root,
                    profile,
                    node: process.env.NEXTPLAY_DESKTOP_NODE,
                });
                server.child.once('close', () => {
                    if (stopping) return;
                    dialog.showErrorBox(
                        'Next Play',
                        label(
                            'El servidor se ha cerrado. Vuelve a abrir Next Play.',
                            'The server has stopped. Reopen Next Play.',
                        ),
                    );
                    app.exit(1);
                });
                session.defaultSession.setPermissionRequestHandler(
                    (_contents, _permission, callback) => callback(false),
                );
                session.defaultSession.setPermissionCheckHandler(() => false);
                // ponytail: Vinext requires inline bootstrap scripts; use nonces when its SSR supports them.
                const csp =
                    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; font-src 'self' data:; connect-src 'self'; frame-src https://www.youtube.com https://www.youtube-nocookie.com; object-src 'none'; base-uri 'self'; form-action 'self'";
                session.defaultSession.webRequest.onHeadersReceived(
                    { urls: [server.url + '/*'] },
                    (details, callback) =>
                        callback({
                            responseHeaders: {
                                ...details.responseHeaders,
                                'Content-Security-Policy': [csp],
                            },
                        }),
                );
                window = new BrowserWindow({
                    title: 'Next Play',
                    width: 1440,
                    height: 960,
                    minWidth: 420,
                    minHeight: 600,
                    backgroundColor: '#101513',
                    show: false,
                    webPreferences: {
                        nodeIntegration: false,
                        contextIsolation: true,
                        sandbox: true,
                    },
                });
                const openExternal = (url) => {
                    if (desktopLinkTarget(url, server.url) === 'external')
                        void shell
                            .openExternal(url)
                            .catch(() =>
                                dialog.showErrorBox(
                                    'Next Play',
                                    label(
                                        'No se ha podido abrir el enlace externo.',
                                        'Could not open the external link.',
                                    ),
                                ),
                            );
                };
                window.webContents.setWindowOpenHandler(({ url }) => {
                    if (desktopLinkTarget(url, server.url) === 'internal')
                        void window.loadURL(url);
                    else openExternal(url);
                    return { action: 'deny' };
                });
                window.webContents.on('will-navigate', (event, url) => {
                    if (desktopLinkTarget(url, server.url) === 'internal')
                        return;
                    event.preventDefault();
                    openExternal(url);
                });
                window.webContents.on(
                    'will-redirect',
                    (event, url, _inPlace, mainFrame) => {
                        if (
                            mainFrame &&
                            desktopLinkTarget(url, server.url) !== 'internal'
                        )
                            event.preventDefault();
                    },
                );
                window.webContents.on('will-attach-webview', (event) =>
                    event.preventDefault(),
                );
                Menu.setApplicationMenu(
                    Menu.buildFromTemplate([
                        ...(process.platform === 'darwin'
                            ? [{ role: 'appMenu' }]
                            : []),
                        {
                            label: label('Archivo', 'File'),
                            submenu: [
                                { label: label('Salir', 'Quit'), role: 'quit' },
                            ],
                        },
                        {
                            label: label('Editar', 'Edit'),
                            submenu: [
                                {
                                    label: label('Deshacer', 'Undo'),
                                    role: 'undo',
                                },
                                {
                                    label: label('Rehacer', 'Redo'),
                                    role: 'redo',
                                },
                                { type: 'separator' },
                                { label: label('Cortar', 'Cut'), role: 'cut' },
                                {
                                    label: label('Copiar', 'Copy'),
                                    role: 'copy',
                                },
                                {
                                    label: label('Pegar', 'Paste'),
                                    role: 'paste',
                                },
                                {
                                    label: label(
                                        'Seleccionar todo',
                                        'Select all',
                                    ),
                                    role: 'selectAll',
                                },
                            ],
                        },
                        {
                            label: label('Ver', 'View'),
                            submenu: [
                                {
                                    label: label('Recargar', 'Reload'),
                                    role: 'reload',
                                },
                                {
                                    label: label('Acercar', 'Zoom in'),
                                    role: 'zoomIn',
                                },
                                {
                                    label: label('Alejar', 'Zoom out'),
                                    role: 'zoomOut',
                                },
                                {
                                    label: label(
                                        'Restablecer zoom',
                                        'Reset zoom',
                                    ),
                                    role: 'resetZoom',
                                },
                                {
                                    label: label(
                                        'Pantalla completa',
                                        'Full screen',
                                    ),
                                    role: 'togglefullscreen',
                                },
                            ],
                        },
                    ]),
                );
                window.once('ready-to-show', () => window.show());
                await window.loadURL(server.url);
            } catch (error) {
                console.error(error.message);
                dialog.showErrorBox(
                    'Next Play',
                    'No se ha podido abrir Next Play. Revisa la terminal.\nCould not open Next Play. Check the terminal.',
                );
                if (server) {
                    stopping = true;
                    await stopDesktopServer(server.child);
                }
                app.exit(1);
            }
        });
    }
}
