import { syncSteamTags } from '../server/steam-tags-sync.ts';

function usage() {
    console.log('Uso: npm run sync:steam-tags [-- --force]');
}

async function main() {
    const force = process.argv.slice(2).includes('--force');
    if (process.argv.slice(2).some((arg) => arg !== '--force')) {
        usage();
        process.exitCode = 2;
        return;
    }
    let interrupted = false;
    const stop = () => {
        interrupted = true;
        console.log(
            'steam-tags: se recibió una señal; se cerrará tras el AppID actual',
        );
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    try {
        const result = await syncSteamTags({
            force,
            shouldStop: () => interrupted,
            onLog: (message) => console.log(message),
        });
        if (result.stopReason)
            process.exitCode = result.stopReason === 'interrumpido' ? 130 : 1;
    } finally {
        process.off('SIGINT', stop);
        process.off('SIGTERM', stop);
    }
}

main().catch((error) => {
    console.error(`steam-tags: error: ${(error as Error).message || error}`);
    process.exitCode = 1;
});
