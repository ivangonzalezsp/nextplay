import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
    access,
    cp,
    mkdir,
    readFile,
    readdir,
    rm,
    writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32' || process.arch !== 'x64')
    throw new Error('Package on Windows x64.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = join(root, 'work/windows');
const stage = join(work, 'app');
const downloads = join(root, 'work/downloads');
const output = join(root, 'outputs/windows');
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const runtimes = JSON.parse(
    await readFile(join(root, 'packaging/windows-runtimes.json'), 'utf8'),
);
function run(binary, args, cwd = root, env = process.env) {
    const result = spawnSync(binary, args, {
        cwd,
        env,
        windowsHide: true,
        stdio: 'inherit',
    });
    if (result.error || result.status !== 0)
        throw (
            result.error ||
            new Error(`${basename(binary)} failed (${result.status})`)
        );
}
async function removeBuildDirectory(path) {
    const inside = relative(work, resolve(path));
    if (!inside || inside.startsWith('..') || resolve(path) === work)
        throw new Error('Refusing unsafe build cleanup.');
    await rm(path, { recursive: true, force: true });
}
async function download(runtime) {
    const file = join(downloads, basename(new URL(runtime.url).pathname));
    let bytes;
    try {
        bytes = await readFile(file);
    } catch {
        /* Download below. */
    }
    if (
        !bytes ||
        createHash('sha256').update(bytes).digest('hex') !== runtime.sha256
    ) {
        const response = await fetch(runtime.url, {
            signal: AbortSignal.timeout(600_000),
        });
        if (!response.ok)
            throw new Error(
                `Download failed: ${new URL(runtime.url).hostname} ${response.status}`,
            );
        bytes = Buffer.from(await response.arrayBuffer());
        if (createHash('sha256').update(bytes).digest('hex') !== runtime.sha256)
            throw new Error('Runtime checksum mismatch.');
        await writeFile(file, bytes);
    }
    return file;
}
async function pruneRuntimeModules(modules) {
    // Runtime imports are JavaScript/JSON/WASM/native files. TypeScript sources,
    // declarations, source maps and package documentation are build-time/legal
    // material and otherwise make every install copy thousands of dead files.
    const removable = /\.(?:map|ts|tsx|mts|cts|flow|cpp|h|md|markdown|yml|yaml)$/i;
    const legal = /^(?:licen[cs]e|notice|copying)(?:[._-].*)?$/i;
    for (const file of await readdir(modules, {
        recursive: true,
        withFileTypes: true,
    })) {
        if (
            file.isFile() &&
            removable.test(file.name) &&
            !legal.test(file.name)
        )
            await rm(join(file.parentPath, file.name), { force: true });
    }
    // Vinext declares this package for TypeScript users only; it has no runtime files.
    await rm(join(modules, '@vinext/types'), { recursive: true, force: true });
    // No production code invokes npm-installed command shims.
    await rm(join(modules, '.bin'), { recursive: true, force: true });
    await rm(join(modules, '.package-lock.json'), { force: true });
    await rm(join(stage, 'package-lock.json'), { force: true });
}
async function pruneVinext(modules) {
    const dist = join(modules, 'vinext', 'dist');
    const entry = join(dist, 'server/prod-server.js');
    const keep = new Set([entry]);
    const queue = [entry];
    const imports = /(?:from\s*|import\s*(?:\(\s*)?)["']([^"']+)["']/g;
    while (queue.length) {
        const file = queue.pop();
        const source = await readFile(file, 'utf8');
        for (const match of source.matchAll(imports)) {
            const specifier = match[1];
            if (!specifier.startsWith('.')) continue;
            const base = resolve(dirname(file), specifier);
            let resolved;
            for (const candidate of [
                base,
                `${base}.js`,
                join(base, 'index.js'),
            ]) {
                try {
                    await access(candidate);
                    resolved = candidate;
                    break;
                } catch {
                    /* Try the next Node ESM resolution shape. */
                }
            }
            if (resolved && !keep.has(resolved)) {
                keep.add(resolved);
                queue.push(resolved);
            }
        }
    }
    for (const file of await readdir(dist, {
        recursive: true,
        withFileTypes: true,
    })) {
        if (file.isFile()) {
            const path = join(file.parentPath, file.name);
            if (!keep.has(path)) await rm(path, { force: true });
        }
    }
}
async function keepOnlyFiles(root, names) {
    for (const file of await readdir(root, {
        recursive: true,
        withFileTypes: true,
    })) {
        if (!file.isFile()) continue;
        const path = join(file.parentPath, file.name);
        if (!names.has(relative(root, path).replaceAll('\\', '/')))
            await rm(path, { force: true });
    }
}
async function pruneReactRuntime(modules) {
    await keepOnlyFiles(
        join(modules, 'react'),
        new Set([
            'LICENSE',
            'package.json',
            'compiler-runtime.js',
            'index.js',
            'jsx-runtime.js',
            'react.react-server.js',
            'jsx-runtime.react-server.js',
            'cjs/react-compiler-runtime.production.js',
            'cjs/react.development.js',
            'cjs/react-jsx-runtime.production.js',
            'cjs/react-jsx-runtime.development.js',
            'cjs/react-jsx-runtime.react-server.production.js',
            'cjs/react-jsx-runtime.react-server.development.js',
            'cjs/react.production.js',
            'cjs/react.react-server.production.js',
        ]),
    );
    await keepOnlyFiles(
        join(modules, 'react-dom'),
        new Set([
            'LICENSE',
            'package.json',
            'index.js',
            'server.edge.js',
            'static.edge.js',
            'react-dom.react-server.js',
            'cjs/react-dom.development.js',
            'cjs/react-dom.production.js',
            'cjs/react-dom-server.edge.development.js',
            'cjs/react-dom-server.edge.production.js',
            'cjs/react-dom-server-legacy.browser.development.js',
            'cjs/react-dom-server-legacy.browser.production.js',
            'cjs/react-dom.react-server.development.js',
            'cjs/react-dom.react-server.production.js',
        ]),
    );
}
await mkdir(downloads, { recursive: true });
await mkdir(output, { recursive: true });
await mkdir(work, { recursive: true });
const archives = Object.fromEntries(
    await Promise.all(
        Object.entries(runtimes).map(async ([name, value]) => [
            name,
            await download(value),
        ]),
    ),
);
if (!process.argv.includes('--reuse-stage')) {
    await access(join(root, 'dist/server/index.js'));
    await removeBuildDirectory(stage);
    await mkdir(stage, { recursive: true });
    // Explicit distribution allowlist: never archive the checkout or personal data.
    for (const name of [
        'dist',
        'public',
        'server',
        'lib',
        'package.json',
        'package-lock.json',
    ])
        await cp(join(root, name), join(stage, name), {
            recursive: true,
            filter: (path) => !path.endsWith('.map'),
        });
    await mkdir(join(stage, 'scripts'), { recursive: true });
    for (const name of [
        'start-server.ts',
        'library-mcp.ts',
        'hltb.py',
        'windows-launcher.ps1',
        'windows-integration.ps1',
        'windows-update.ps1',
        'windows-install-check.ps1',
    ])
        await cp(join(root, 'scripts', name), join(stage, 'scripts', name));
    run(
        process.env.ComSpec || 'cmd.exe',
        [
            '/d',
            '/s',
            '/c',
            'npm.cmd ci --omit=dev --omit=peer --legacy-peer-deps --ignore-scripts --no-audit --no-fund',
        ],
        stage,
        { ...process.env, npm_config_cache: join(work, 'npm-cache') },
    );
    await pruneRuntimeModules(join(stage, 'node_modules'));
    await pruneVinext(join(stage, 'node_modules'));
    await pruneReactRuntime(join(stage, 'node_modules'));
    // UI dependencies are compiled into dist; keep their notices in one file.
    const modules = join(root, 'node_modules');
    const notices = [];
    for (const file of await readdir(modules, {
        recursive: true,
        withFileTypes: true,
    })) {
        if (
            !file.isFile() ||
            !/^(?:licen[cs]e|notice|copying)(?:[.-].*)?$/i.test(file.name)
        )
            continue;
        const path = join(file.parentPath, file.name);
        notices.push(
            `${relative(modules, path).replaceAll('\\', '/')}\n\n${await readFile(path, 'utf8')}`,
        );
    }
    await mkdir(join(stage, 'licenses'), { recursive: true });
    await writeFile(
        join(stage, 'licenses/JavaScript-NOTICES.txt'),
        notices.sort().join('\n\n---\n\n'),
    );
    const unpack = join(work, 'unpack');
    await removeBuildDirectory(unpack);
    await mkdir(unpack, { recursive: true });
    await mkdir(join(stage, 'runtime/python'), { recursive: true });
    run('tar.exe', ['-xf', archives.node, '-C', unpack]);
    const nodeFolder = (await readdir(unpack)).find((name) =>
        name.startsWith('node-'),
    );
    await cp(
        join(unpack, nodeFolder, 'node.exe'),
        join(stage, 'runtime/node.exe'),
    );
    await mkdir(join(stage, 'licenses'), { recursive: true });
    await cp(
        join(unpack, nodeFolder, 'LICENSE'),
        join(stage, 'licenses/Node-LICENSE.txt'),
    );
    run('tar.exe', [
        '-xf',
        archives.python,
        '-C',
        join(stage, 'runtime/python'),
    ]);
    await writeFile(
        join(stage, 'runtime/python/python313._pth'),
        'python313.zip\n.\nLib/site-packages\nimport site\n',
    );
    run('tar.exe', ['-xf', archives.codex, '-C', unpack]);
    const codexRoot = join(unpack, 'package/vendor/x86_64-pc-windows-msvc');
    await cp(codexRoot, join(stage, 'runtime/codex'), { recursive: true });
    // Preserve the native layout: resource executables are resolved relative to bin/codex.exe.
    const python =
        process.env.NEXTPLAY_BUILD_PYTHON ||
        join(root, '.venv-hltb/Scripts/python.exe');
    run(python, [
        '-m',
        'pip',
        'install',
        '--cache-dir',
        join(work, 'pip-cache'),
        '--disable-pip-version-check',
        '--no-compile',
        '--require-hashes',
        '--only-binary=:all:',
        '--python-version',
        '3.13',
        '--platform',
        'win_amd64',
        '--implementation',
        'cp',
        '--abi',
        'cp313',
        '--target',
        join(stage, 'runtime/python/Lib/site-packages'),
        '-r',
        join(root, 'packaging/requirements-windows.txt'),
    ]);
    for (const name of ['LICENSE', 'NOTICE']) {
        const license = await fetch(
            `https://raw.githubusercontent.com/openai/codex/rust-v0.154.0/${name}`,
            { signal: AbortSignal.timeout(30_000) },
        );
        if (!license.ok) throw new Error('Codex license unavailable.');
        await writeFile(
            join(stage, `licenses/Codex-${name}.txt`),
            await license.text(),
        );
    }
    await writeFile(
        join(stage, 'licenses/README.txt'),
        'Next Play includes Node.js, Codex CLI and Python. Their licenses are in this directory and runtime/python/LICENSE.txt. JavaScript-NOTICES.txt includes notices for compiled dependencies; runtime dependencies also retain their original licenses under node_modules. Python wheel metadata, licenses and notices are preserved under runtime/python/Lib/site-packages.\n',
    );
    await writeFile(
        join(stage, 'runtime-versions.json'),
        JSON.stringify(
            {
                node: '24.21.0',
                python: '3.13.15',
                codex: '0.154.0',
                hltb: '1.0.23',
            },
            null,
            2,
        ),
    );
    run(join(stage, 'runtime/python/python.exe'), [
        '-I',
        '-B',
        join(root, 'tests/hltb_test.py'),
    ]);
    run(process.execPath, [join(root, 'scripts/test-package.mjs'), stage]);
}
const inno = join(work, 'inno');
try {
    await access(join(inno, 'ISCC.exe'));
} catch {
    run(archives.inno, [
        '/PORTABLE=1',
        '/CURRENTUSER',
        '/VERYSILENT',
        '/SUPPRESSMSGBOXES',
        '/NORESTART',
        '/NOICONS',
        `/DIR=${inno}`,
    ]);
}
run(join(inno, 'ISCC.exe'), [
    '/Qp',
    `/DAppVersion=${manifest.version}`,
    `/DSourceDir=${stage}`,
    `/O${output}`,
    join(root, 'packaging/nextplay.iss'),
]);
const installer = `NextPlay-Setup-${manifest.version}-x64.exe`;
const digest = createHash('sha256')
    .update(await readFile(join(output, installer)))
    .digest('hex');
await writeFile(join(output, 'SHA256SUMS.txt'), `${digest}  ${installer}\n`);
console.log(`Installer ready: ${join(output, installer)}`);
