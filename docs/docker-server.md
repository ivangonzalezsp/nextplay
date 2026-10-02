# Next Play Server · Docker

## Español

El servidor incluye la interfaz compilada, Node.js 24.21.0, Codex CLI 0.154.0 y Python con HLTB. No incluye Electron ni datos personales. Ejecuta procesos como el usuario `node`, sin privilegios de root. Los dispositivos usan la misma biblioteca y motor del servidor.

### Descargar y arrancar sin compilar

El workflow **Server image**, ejecutado en las PR a `main` o manualmente, prepara los artefactos `nextplay-server-amd64` y `nextplay-server-arm64`. Elige la arquitectura del servidor, descarga y extrae su ZIP: contiene la imagen, Compose, instrucciones, checksums y el código fuente correspondiente. Las imágenes de una PR son versiones de prueba. Esta primera distribución usa archivos descargables; la publicación en un registro sigue pendiente.

Desde la carpeta extraída, sustituye el nombre por el archivo descargado:

```sh
docker load --input nextplay-server-VERSION-amd64.tar.gz
docker compose up -d
docker compose logs --tail 50 nextplay
```

Abre `http://127.0.0.1:3000` en el servidor. Solo necesitas Docker y Compose, sin Git, Node, Python ni npm en el host. El servicio se reinicia con Docker salvo que lo detengas explícitamente.

Para PC/móvil en una LAN privada de confianza, crea `.env` junto a Compose indicando **la IP privada concreta del servidor**:

```dotenv
NEXTPLAY_BIND_IP=192.168.1.50
NEXTPLAY_HTTP_PORT=3000
```

Ejecuta `docker compose up -d` y abre `http://192.168.1.50:3000` desde los dispositivos. La API admite loopback e IPv4 privadas; este paquete no añade dominios públicos, autenticación multiusuario ni exposición a Internet. El modo remoto del cliente de escritorio sigue pendiente; el navegador funciona con el servidor actual.

### Datos, claves y Codex

El volumen `nextplay-data` guarda `/var/lib/nextplay`: `data/library.sqlite`, cachés, `settings.json` y `codex/`. Recrear el contenedor conserva el volumen. **No uses `docker compose down --volumes` si quieres conservar tus datos.** El motor local funciona sin Codex.

Para Steam/IGDB, conserva `.env.local` fuera de la imagen y crea `compose.override.yaml` junto a Compose:

```yaml
services:
    nextplay:
        volumes:
            - ./.env.local:/app/.env.local:ro
```

El archivo debe existir antes de arrancar. Usa los nombres de `.env.example` del código fuente, sin escribir claves en Compose o en la imagen. Los valores guardados en `settings.json` tienen prioridad, como en el checkout.

Conecta tu propia cuenta de ChatGPT desde el terminal del servidor:

```sh
docker compose exec nextplay codex login --device-auth
docker compose exec nextplay codex login status
```

Abre el enlace e introduce el código en tu navegador. Puede requerir habilitar el acceso por código en tu cuenta o workspace: [OpenAI Docs · equipos sin navegador](https://learn.chatgpt.com/docs/auth#login-on-headless-devices). La sesión permanece en el volumen; no requiere `OPENAI_API_KEY` y comparte el cupo de tu cuenta. No copies toda la configuración personal de Codex.

La administración por API requiere una conexión loopback real **dentro del contenedor**. El puerto publicado, incluso accedido desde el host, no concede esa confianza. Configura claves mediante el archivo montado y login con `docker compose exec`. Las actualizaciones, inicio y firewall del instalador Windows no se aplican aquí.

### Actualizar y respaldar

Descarga la nueva imagen de la misma arquitectura y comprueba su checksum. Conserva Compose, override y volumen. Antes de actualizar, usa un directorio de copia nuevo:

```sh
docker compose stop
docker compose cp nextplay:/var/lib/nextplay ./nextplay-backup
docker load --input nextplay-server-NUEVA_VERSION-amd64.tar.gz
docker compose up -d --force-recreate
```

La copia con el servidor detenido incluye SQLite y sus archivos auxiliares consistentemente. Para volver a una imagen anterior, restaura también la copia si hubo una migración de esquema.

Si tienes el código fuente y Node.js 24 o posterior con npm en el host, puedes ejecutar desde el checkout:

```sh
npm run update:docker
```

El comando compila la última revisión de `main` desde GitHub como `nextplay-server:latest` usando Docker, antes de detener el servicio. Después respalda los datos en una carpeta nueva `nextplay-backup-*` y recrea `nextplay` conservando el volumen y la configuración. Requiere Internet y capacidad para compilar en el servidor; `main` puede incluir cambios todavía no publicados en una release. Si la compilación falla, el servidor sigue funcionando; si la copia falla, no se recrea el servicio y permanece parado. No requiere `npm install` ni Git en el host. En PowerShell usa `npm.cmd`. Si Compose está en otra carpeta, ejecuta `npm run update:docker -- /ruta/compose`, conservando la carpeta original para usar el mismo volumen.

### Migrar desde el checkout

Detén el servidor anterior y conserva una copia completa. En una instalación Docker nueva, creada con `docker compose up -d` y detenida con `docker compose stop`, copia el contenido del directorio de datos:

```sh
docker compose cp ./old-data/. nextplay:/var/lib/nextplay/data
```

Si usaba `data/settings.json`, cópialo también a `/var/lib/nextplay/settings.json`: el directorio de usuario y el de datos están separados en el contenedor. Conserva `.env.local` como archivo montado si contenía las claves. Conecta Codex de nuevo. Corrige el propietario del volumen y arranca:

```sh
docker compose run --rm --user root --entrypoint chown nextplay -R node:node /var/lib/nextplay
docker compose up -d
```

Estas instrucciones no modifican automáticamente la instalación anterior.

### Mantenedores y validación

```sh
docker build --tag nextplay-server:latest .
node scripts/test-docker.mjs nextplay-server:latest
```

La [compilación por etapas](https://docs.docker.com/build/building/multi-stage/) separa dependencias de desarrollo y ejecución. El contexto usa una lista de archivos permitidos: no envía `data/`, `.env*`, autenticación, Electron instalado ni archivos de trabajo. `/app/licenses` conserva los avisos de dependencias compiladas; los paquetes de ejecución mantienen sus licencias. El artefacto incluye el código fuente completo GPL del commit compilado.

La prueba usa un volumen y puerto aleatorios aislados. Comprueba HTML/JS/CSS, Codex/HLTB, MCP de lectura, denegación de administración por el puerto publicado, integridad SQLite y conservación de datos/ajustes tras recrear el contenedor. No inicia sesión ni realiza recomendaciones o sincronizaciones reales. El workflow ejecuta pruebas, tipos, lint enfocado y build en Windows, Linux y macOS antes de probar contenedores en runners nativos AMD64 y ARM64; solo una ejecución correcta confirma cada arquitectura. Las comprobaciones de Node no prueban una ventana Electron ni un instalador en Linux/macOS.

## English

The server bundles the compiled UI/backend, Node.js 24.21.0, Codex CLI 0.154.0 and Python/HLTB, without Electron or personal data. The **Server image** workflow runs on PRs to `main` or manually and prepares AMD64/ARM64 downloads with the image, Compose, checksums and matching GPL source. PR artifacts are preview images. Registry publication is pending.

Extract the artifact for your server and run `docker load --input IMAGE.tar.gz`, then `docker compose up -d`. Docker/Compose are the only host requirements. The default URL is `http://127.0.0.1:3000`. For a trusted private LAN, set `NEXTPLAY_BIND_IP` to the server's private IPv4 address in a `.env` file beside Compose and recreate the service. Public domains, Internet exposure and the desktop client's remote URL mode are not included.

The volume persists `/var/lib/nextplay`, including `data/library.sqlite`, caches, `settings.json` and `codex/`. Recreating the container preserves it; `docker compose down --volumes` deletes it. Mount your existing `.env.local` read-only at `/app/.env.local` using the override above for Steam/IGDB credentials; saved settings take precedence. Connect ChatGPT with `docker compose exec nextplay codex login --device-auth`, following [OpenAI's headless authentication instructions](https://learn.chatgpt.com/docs/auth#login-on-headless-devices). No API key is required. Administration remains restricted to actual loopback peers inside the container.

Before updating, stop the service and copy `/var/lib/nextplay` to a new backup directory with `docker compose cp`. Load the new image and run `docker compose up -d --force-recreate`, keeping the volume and configuration. For migration, stop/back up the checkout, copy its data directory into `/var/lib/nextplay/data`, copy user settings into `/var/lib/nextplay/settings.json` when applicable, fix ownership to `node:node` and sign in again. Originals are not modified automatically.

With the source checkout and Node.js 24+ / npm on the host, run `npm run update:docker` (PowerShell: `npm.cmd`). Docker builds the latest GitHub `main` as `nextplay-server:latest` before stopping the server, then backs up to a new `nextplay-backup-*` directory and recreates the service, preserving its volume and configuration. Internet and server build capacity are required; main may include unreleased changes. No npm installation or host Git is needed. Build failures leave the running server alone; backup failures abort recreation and leave the service stopped. For Compose in another directory, use `npm run update:docker -- /path/compose`, keeping the original directory to preserve the same volume.

Maintainers build with `docker build --tag nextplay-server:latest .` and verify with `node scripts/test-docker.mjs nextplay-server:latest`. The isolated synthetic check covers assets, runtimes, read-only MCP, local administration and preservation after recreation without login or live recommendations. CI runs tests, types, focused lint and build on Windows/Linux/macOS, followed by native AMD64/ARM64 container checks. Node checks do not verify an Electron window or installer on Linux/macOS. Successful native container runs are required before claiming image validation.
