import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * @param {string} [directory]
 * @param {(command: string, args: string[], options: import('node:child_process').SpawnSyncOptions) => {status: number | null, error?: Error}} [run]
 */
export function updateDocker(directory = '.', run = spawnSync) {
    const cwd = resolve(directory);
    const docker = (...args) => {
        const result = run('docker', args, { cwd, stdio: 'inherit' });
        if (result.error) throw result.error;
        if (result.status !== 0)
            throw new Error(`docker ${args[0]} failed (${result.status})`);
    };
    docker('compose', 'config', '--quiet');
    docker(
        'build',
        '--pull',
        '--tag',
        'nextplay-server:latest',
        'https://github.com/ivangonzalezsp/nextplay.git#main',
    );
    const backup = mkdtempSync(resolve(cwd, 'nextplay-backup-'));
    docker('compose', 'stop', 'nextplay');
    docker('compose', 'cp', 'nextplay:/var/lib/nextplay/.', backup);
    console.log(`Backup: ${backup}`);
    docker('compose', 'up', '-d', '--force-recreate', 'nextplay');
    docker('compose', 'logs', '--tail', '50', 'nextplay');
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
    try {
        updateDocker(...process.argv.slice(2));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
