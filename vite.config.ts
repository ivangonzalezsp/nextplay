import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';
import { attestLocalPeer } from './server/local-access';
// Codex needs a local process: use Vinext's Node runtime, not Workers.
export default defineConfig({
    cacheDir: '.vinext/vite-cache',
    css: { postcss: { plugins: [tailwindcss()] } },
    plugins: [
        {
            name: 'nextplay-local-peer',
            configureServer(server) {
                server.middlewares.use((request, _response, next) => {
                    attestLocalPeer(request);
                    next();
                });
            },
        },
        vinext(),
    ],
    server: { host: '127.0.0.1', port: 3000, strictPort: true },
});
