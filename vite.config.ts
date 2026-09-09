import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';
// Codex needs a local process: use Vinext's Node runtime, not Workers.
export default defineConfig({
  cacheDir: '.vinext/vite-cache',
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [vinext()],
  server: { host: '127.0.0.1', port: 3000, strictPort: true },
});
