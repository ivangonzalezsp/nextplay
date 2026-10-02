import { spawn } from 'node:child_process';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    desktopLinkTarget,
    desktopShortcut,
    installedDesktop,
    startDesktopServer,
    stopDesktopServer,
} from './desktop-runtime.mjs';
import { desktopAppearance } from '../lib/desktop.ts';

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
    // Source runs use npm's Electron; Windows installs include its runtime.
    process.env.electron_config_cache ||= join(root, 'work/electron-cache');
    let electron;
    try {
        electron = join(root, 'runtime/electron/electron.exe');
        await access(electron);
    } catch {
        ({ default: electron } = await import('electron'));
    }
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
    const installed = process.argv.includes('--installed');
    const smokeTest = process.env.NEXTPLAY_INSTALLER_SMOKE_TEST === '1';
    const profileIndex = process.argv.indexOf('--profile');
    if (profileIndex !== -1 && !process.argv[profileIndex + 1])
        throw new Error('--profile requires a directory.');
    const profile = resolve(
        profileIndex === -1
            ? installed
                ? join(process.env.LOCALAPPDATA, 'NextPlay')
                : join(root, 'work/desktop-profile')
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
        if (stopped || !server?.child) return;
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
        if (smokeTest) return;
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
                server = installed
                    ? await installedDesktop(profile)
                    : await startDesktopServer({
                          root,
                          profile,
                          node: process.env.NEXTPLAY_DESKTOP_NODE,
                      });
                server.child?.once('close', () => {
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
                Menu.setApplicationMenu(null);
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
                    icon: join(
                        root,
                        'dist/client',
                        process.platform === 'win32'
                            ? 'favicon.ico'
                            : 'icon.png',
                    ),
                    width: 1455,
                    height: 975,
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
                window.webContents.on('before-input-event', (event, input) => {
                    const shortcut = desktopShortcut(input);
                    if (!shortcut) return;
                    event.preventDefault();
                    if (shortcut === 'quit') app.quit();
                    else if (shortcut === 'close') window.close();
                    else if (shortcut === 'fullscreen')
                        window.setFullScreen(!window.isFullScreen());
                    else if (shortcut === 'forceReload')
                        window.webContents.reloadIgnoringCache();
                    else if (shortcut === 'resetZoom')
                        window.webContents.setZoomLevel(0);
                    else if (shortcut === 'zoomIn' || shortcut === 'zoomOut')
                        window.webContents.setZoomLevel(
                            window.webContents.getZoomLevel() +
                                (shortcut === 'zoomIn' ? 0.5 : -0.5),
                        );
                    else window.webContents[shortcut]();
                });
                window.once('ready-to-show', () => {
                    if (!smokeTest) window.show();
                });
                await window.loadURL(server.url);
                if (installed) {
                    const desktopRecord = {
                        pid: process.pid,
                        instance: server.instance,
                        url: server.url,
                        version: server.version,
                        electron: process.versions.electron,
                        menu: Menu.getApplicationMenu() !== null,
                    };
                    const saveDesktop = async () => {
                        const file = join(profile, 'desktop-window.json');
                        await writeFile(
                            file + '.tmp',
                            JSON.stringify(desktopRecord),
                        );
                        await rename(file + '.tmp', file);
                    };
                    await saveDesktop();
                    const appearanceFile = join(
                        profile,
                        'desktop-appearance.json',
                    );
                    try {
                        await access(join(profile, 'settings.json'));
                    } catch (error) {
                        if (error.code !== 'ENOENT') throw error;
                        await writeFile(appearanceFile, '{}', {
                            flag: 'wx',
                        }).catch((error) => {
                            if (error.code !== 'EEXIST') throw error;
                        });
                    }
                    const importAppearance = async () => {
                        try {
                            const appearance = desktopAppearance(
                                JSON.parse(
                                    await readFile(appearanceFile, 'utf8'),
                                ),
                            );
                            const applied = await window.webContents
                                .executeJavaScript(`(() => {
                                const changed = !localStorage.getItem('nextplay-browser-preferences-imported');
                                const preferences = ${JSON.stringify(appearance)};
                                if (changed) for (const [key, value] of Object.entries(preferences)) localStorage.setItem('nextplay-' + key, value);
                                localStorage.setItem('nextplay-browser-preferences-imported', '1');
                                return {changed, language: localStorage.getItem('nextplay-language'), theme: localStorage.getItem('nextplay-theme')};
                            })()`);
                            if (applied.changed)
                                await window.loadURL(server.url);
                            desktopRecord.appearance = {
                                language: applied.language,
                                theme: applied.theme,
                            };
                            await saveDesktop();
                            return true;
                        } catch (error) {
                            if (error.code === 'ENOENT') return false;
                            throw error;
                        }
                    };
                    if (!(await importAppearance())) {
                        // The old browser alone can read its origin's localStorage.
                        if (!smokeTest)
                            await shell.openExternal(
                                server.url +
                                    '/migrate-appearance.html?v=' +
                                    encodeURIComponent(server.version),
                            );
                        let importing = false;
                        const timer = setInterval(() => {
                            if (importing) return;
                            importing = true;
                            void importAppearance()
                                .then((done) => {
                                    if (done) clearInterval(timer);
                                })
                                .catch((error) => {
                                    clearInterval(timer);
                                    console.error(error.message);
                                })
                                .finally(() => {
                                    importing = false;
                                });
                        }, 1000);
                        window.once('closed', () => clearInterval(timer));
                    }
                }
            } catch (error) {
                console.error(error.message);
                if (!smokeTest)
                    dialog.showErrorBox(
                        'Next Play',
                        'No se ha podido abrir Next Play. Revisa la terminal.\nCould not open Next Play. Check the terminal.',
                    );
                if (server?.child) {
                    stopping = true;
                    await stopDesktopServer(server.child);
                }
                app.exit(1);
            }
        });
    }
}
