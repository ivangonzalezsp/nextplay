# syntax=docker/dockerfile:1
FROM node:24.21.0-bookworm-slim AS build
WORKDIR /app
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY vite.config.ts tsconfig.json ./
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY server ./server
COPY public ./public
COPY scripts ./scripts
RUN npm run build
# Preserve notices for UI dependencies compiled into dist.
RUN node --input-type=module <<'JS'
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
const notices = [];
for (const file of await readdir('node_modules', { recursive: true, withFileTypes: true })) {
    if (!file.isFile() || !/^(?:licen[cs]e|notice|copying)(?:[.-].*)?$/i.test(file.name)) continue;
    const path = join(file.parentPath, file.name);
    notices.push(`${relative('node_modules', path)}\n\n${await readFile(path, 'utf8')}`);
}
await mkdir('licenses');
await writeFile('licenses/JavaScript-NOTICES.txt', notices.sort().join('\n\n---\n\n'));
JS

FROM node:24.21.0-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=peer --legacy-peer-deps --ignore-scripts --no-audit --no-fund

FROM node:24.21.0-bookworm-slim AS server
LABEL org.opencontainers.image.title="Next Play Server" \
      org.opencontainers.image.source="https://github.com/ivangonzalezsp/nextplay" \
      org.opencontainers.image.licenses="GPL-3.0-only"
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*
COPY requirements-hltb.txt ./
RUN python3 -m venv /opt/hltb \
    && /opt/hltb/bin/pip install --no-cache-dir -r requirements-hltb.txt \
    && npm install --global @openai/codex@0.154.0 --no-audit --no-fund \
    && npm cache clean --force
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/server ./server
COPY --from=build /app/lib ./lib
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/licenses ./licenses
COPY package.json package-lock.json LICENSE README.md ./
RUN node --input-type=module <<'JS'
import { writeFile } from 'node:fs/promises';
for (const name of ['LICENSE', 'NOTICE']) {
    const response = await fetch(`https://raw.githubusercontent.com/openai/codex/rust-v0.154.0/${name}`);
    if (!response.ok) throw new Error(`Codex ${name}: ${response.status}`);
    await writeFile(`licenses/Codex-${name}.txt`, await response.text());
}
const response = await fetch('https://raw.githubusercontent.com/nodejs/node/v24.21.0/LICENSE');
if (!response.ok) throw new Error(`Node license: ${response.status}`);
await writeFile('licenses/Node-LICENSE.txt', await response.text());
JS
ENV NODE_ENV=production \
    NEXTPLAY_USER_DIR=/var/lib/nextplay \
    NEXTPLAY_DATA_DIR=/var/lib/nextplay/data \
    CODEX_HOME=/var/lib/nextplay/codex \
    NEXTPLAY_PYTHON=/opt/hltb/bin/python
RUN mkdir -p /var/lib/nextplay/data /var/lib/nextplay/codex \
    && chown -R node:node /var/lib/nextplay
USER node
EXPOSE 3000
VOLUME ["/var/lib/nextplay"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(async r=>{if(!r.ok || (await r.json()).application!=='nextplay')process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "scripts/start-server.ts", "--hostname", "0.0.0.0", "--port", "3000"]
