# Next Play

[🇬🇧 English](#english) · [🇪🇸 Español](#espanol)

<a id="english"></a>

## English

**Next Play was created using vibecoding:** development assisted by AI through natural-language instructions.

A personal app for choosing what to play from your Steam library. Switch between **English 🇬🇧 and Spanish 🇪🇸** in the top corner; your browser remembers the language. Use the local algorithm without AI, or your **Codex session with ChatGPT**, without an OpenAI API key. Each person installs the app on their own computer and connects their own accounts.

### Install on Windows

[**Download Next Play for Windows x64**](https://github.com/ivangonzalezsp/nextplay-releases/releases/latest)

1. Download **NextPlay-Setup-…-x64.exe**, run it, and open the **Next Play** shortcut.
2. The wizard lets you add your Steam profile and API key and import your games. Steam Families, IGDB, and ChatGPT are optional; the local algorithm works without AI.
3. If you have an earlier installation, close it and select **Import previous installation** before configuring the new one. Originals are kept; reconnect ChatGPT through the wizard.

After setup, an optional tutorial reviews up to five played games and your tastes. Each confirmed step is saved; **Finish later** keeps those answers. Resume it through **Settings → Tutorial & initial preferences**. Reviewing earlier game statuses does not invent gaming history dates.

The installer includes Node, Codex, and Python with HowLongToBeat. You do not need Git, a terminal, or additional tools. Requires 64-bit Windows 10/11. The distribution is not code-signed, so Windows may warn about or block it.

#### Open, close, and update

The shortcut starts Next Play and opens your browser. Opening it again reuses the running instance. Closing the tab leaves the app running; choose **Exit** from its tray icon to stop it completely.

In **Settings → Set up accounts and app**, save connections, connect or cancel official ChatGPT sign-in, check for updates, and optionally enable Windows startup. **Update and restart** downloads the public release, checks SHA-256, and creates a backup before installation. Finish active operations first. Automatic update checks are limited to once a day.

Access initially stays on your PC. **Allow access from my local network** requests Windows permission, restarts Next Play, and shows the address for your phone. Its firewall rule is limited to the program, private networks, and the local subnet. Managing credentials, authentication, updates, and processes remains restricted to the PC through the actual connection and HTTP origin.

#### Data and privacy

The program lives in `%LOCALAPPDATA%\Programs\NextPlay`; your library, settings, Codex session, and backups live in `%LOCALAPPDATA%\NextPlay`. Credentials stay local; the API only reports whether they are configured. Omitting a key keeps its value; removal requires an explicit action. Uninstalling keeps your data. For a manual backup, exit Next Play and copy the entire data folder.

Source and development history are in the public **ivangonzalezsp/nextplay** repository. Public installers and release notes are in **ivangonzalezsp/nextplay-releases**. Personal data and credentials must never be published. See [Windows build and release](docs/windows-release.md).

### License

Original Next Play code is distributed under the [GNU General Public License, version 3](LICENSE). Dependencies, data, covers, logos, and third-party services retain their own licenses and terms. The **Next Play** name and logo are not granted under this license.

### Develop from source

For everyday use, choose the Windows installer. For development, use:

- **Node.js 24 or newer**, with npm. SQLite is built into Node; no database server is needed.
- **A Steam account and Steam Web API key** to import your library. Your profile and game details must be public.
- **Git** to clone, or a source ZIP.
- Optionally **Codex CLI and a ChatGPT account with Codex access** for AI recommendations.
- Optionally **Twitch/IGDB credentials** for genres, modes, and discoveries.
- Optionally **Python 3.12**, the tested version for HowLongToBeat.

These commands use Windows PowerShell. Internet is needed for dependencies, source synchronization, and Codex; the local algorithm uses saved data.

#### Get the project and install dependencies

Extract the source ZIP and open a terminal beside `package.json`, or clone:

```powershell
git clone https://github.com/ivangonzalezsp/nextplay.git next-play
cd next-play
node --version
npm ci
Copy-Item .env.example .env.local
```

Node must report `v24` or newer. Copy `.env.example` only on first setup to avoid overwriting keys; on macOS/Linux use `cp .env.example .env.local`. Fill at least `STEAM_API_KEY` in `.env.local`; optional credentials can remain empty. **No `OPENAI_API_KEY` is required.**

#### First launch

```powershell
npm run dev
```

1. Open [Next Play](http://127.0.0.1:3000).
2. Open settings, then **Set up accounts and app**. Add your Steam profile link (`https://steamcommunity.com/id/your_user/` or `https://steamcommunity.com/profiles/YOUR_STEAMID64/`) and key.
3. Under **Diagnostics**, click **Check connections**, then **Sync** under **Steam & Families**.
4. Check **Your library**. To start without AI, choose **Local algorithm** under **Engine & AI**, adjust filters, and request a recommendation. Start with few filters while optional metadata is missing.

Keep the terminal open. Stop with `Ctrl+C`; run `npm run dev` again to reopen. Data remains in `data/`. Development listens only on `127.0.0.1:3000`, so sharing this link does not grant access from another computer. Each person runs their own copy. The Codex desktop app need not stay open.

#### Desktop prototype (Electron)

After installing dependencies, build and open the desktop window:

```sh
npm run build
npm run desktop
```

The prototype uses the installed **Node.js 24+** and downloads Electron on first launch if needed. It starts its own server on a free loopback port, opens one Next Play window, and stops that server when you close the window or choose **File → Quit**. The profile retains that port in `desktop-server.json` so language and palette persist between launches; if another process occupies it, startup fails without stopping that process. A second launch of the same profile focuses the existing window. Web links open in your browser; **Play** links open Steam.

The default profile is `work/desktop-profile/`: SQLite under `data/`, account settings in `settings.json`, a separate Codex session in `codex/`, and window preferences under `electron/`. It persists between launches and does not load the checkout's `.env.local`, library, or inherited credentials. Configure any accounts explicitly from the app; no accounts are copied automatically. To use another test profile, run `npm run desktop -- --profile "path/to/test-profile"`.

This is a source-run prototype, validated on Windows, with a launcher designed for Windows, Linux, and macOS. Linux/macOS execution remains unverified. It does not replace the Windows installer: bundled runtimes, platform-specific installers, startup/LAN integrations, and desktop updates are pending. Use `npm run dev` for normal browser development.

#### Enable AI recommendations (optional)

Install [Codex CLI using OpenAI's official instructions](https://learn.chatgpt.com/docs/codex/cli), then sign in with your own ChatGPT account:

```powershell
npm install -g @openai/codex@latest
codex login
codex login status
npm run check:codex
```

The status must say **Logged in using ChatGPT**. Choose Codex in **Engine & AI**. Recommendations share your account's Codex allowance. The local algorithm works without Codex. Use `npm.cmd` or `codex.cmd` if PowerShell blocks `.ps1` launchers; do not change the global execution policy.

#### Run a production build

For a prebuilt Docker server with persistent data, see [Next Play Server · Docker](docs/docker-server.md#english). The **Server image** workflow runs on PRs to `main` or manually and prepares AMD64/ARM64 images and runtime checks; downloads require a successful run. This is separate from the desktop prototype.

```powershell
npm run build
npm run start:production
```

This checkout server listens on the local network at `0.0.0.0:3001`. Use `http://127.0.0.1:3001` on the PC, or `http://<PC-IP>:3001` on your phone. Only use a trusted private network; do not expose it to the Internet. `npm start` remains available on port 3000. Rebuild after changing code. The installed app has its own startup and network controls.

For checkout startup at Windows sign-in, after building:

```powershell
npm run startup:install
```

A hidden launcher is added to the sign-in startup folder. Remove it with `npm run startup:uninstall`. If you move the project, remove the old launcher and install it from the new location. Rebuild after code changes.

### Connect your data

Use your own keys in `.env.local`; `.env.example` contains placeholders:

| Variable               | Where to get it                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `STEAM_API_KEY`        | [Steam Web API](https://steamcommunity.com/dev/apikey); use `localhost` as your personal app's domain.                             |
| `TWITCH_CLIENT_ID`     | [Twitch console](https://dev.twitch.tv/console/apps); register a **Confidential** app with `http://localhost` as its redirect URL. |
| `TWITCH_CLIENT_SECRET` | The same Twitch app's management page.                                                                                             |

Twitch's two values are optional and must be configured together. Never paste keys into chat or commit them. Next Play rereads `.env.local`; click **Check connections**, then **Sync**. The UI shows key presence; synchronization checks whether the source accepts it.

Add your own profile before syncing. Your profile and **game details** must be public. If Steam cannot read them, the last library is kept and an error is shown; that differs from an accessible library with zero games. Steam passwords and cookies are not imported.

IGDB is optional for reading your library, but needed for genres, modes, and discoveries. Strict metadata filters exclude games missing that information. Story length prefers HLTB, then IGDB's average time to credits when there are contributions. Story length is never session length; Steam hours do not prove liking or finishing a game.

#### HowLongToBeat

[howlongtobeatpy](https://github.com/ScrappyCocco/HowLongToBeat-PythonAPI) runs through a short-lived Python process started by Node. No other server or HLTB credentials are needed. The optional integration has been tested with Python 3.12:

```powershell
python -m venv .venv-hltb
.venv-hltb\Scripts\python.exe -m pip install -r requirements-hltb.txt
.venv-hltb\Scripts\python.exe tests/hltb_test.py
```

On macOS/Linux:

```sh
python3 -m venv .venv-hltb
.venv-hltb/bin/python -m pip install -r requirements-hltb.txt
.venv-hltb/bin/python tests/hltb_test.py
```

Then click **Check connections**. Without Python/HLTB, available IGDB lengths are used. `.venv-hltb` is detected by default; set `NEXTPLAY_PYTHON` to an absolute executable path for another environment. The process receives only game names and identifiers, without Steam/Twitch keys or Codex authentication.

Each recommendation queries up to eight candidates without current cache data, including discoveries. Coverage grows through searches rather than scanning the entire library at once. A match requires an explicit primary or alternate Steam AppID; alternate editions may share estimates. The UI shows story, story plus extras, completionist length, link, and retrieval date. Estimates without contributions remain unknown.

`data/hltb.json` caches reads for seven days. **Update library and data** also schedules HLTB refresh on the next recommendation. Blocking, rate limits, format changes, and failures preserve the last valid read, falling back to IGDB when HLTB story length is missing. This unofficial integration depends on the site's behavior.

### Use Next Play

#### Language and colors

Use **🇬🇧 EN / 🇪🇸 ES** in the header to change language. Spanish is the initial fallback. The choice is saved in this browser and synchronized between its tabs. New recommendations and service messages use the selected language; personal notes, titles, and earlier AI conversations keep their original text. Steam tags use their English names when available.

The app has one **immersive** layout with **Mint, Ocean, Violet, Amber, and Rose** palettes. **Color** changes the palette without changing navigation or cards. The choice persists after reload; old Legacy, Steam, PS5, and Switch 2 selections fall back to Mint.

#### Steam Families

Use `STEAM_FAMILY_TOKEN`, the `webapi_token` from [your official Steam session](https://store.steampowered.com/pointssummary/ajaxgetasyncconfig), alongside `STEAM_API_KEY`. They are different credentials. Next Play checks that the token belongs to the connected profile; it never returns it to the browser or sends it to Codex.

Click **Check connections** and **Connect Steam Families**. Group libraries are imported automatically, including private profiles. Filter your own games, shared games, or each member's games in **Your library**. Duplicates merge by AppID and preferences are preserved. Imported playtime belongs to the connected profile, not copy owners.

Steam determines which games can be borrowed. Excluded games and owner-private titles are not imported as shared. Family recommendations count among the three library choices, never as discoveries. Availability of a free copy at that moment is not checked.

Family data refreshes after 24 hours when requesting recommendations, or through **Update Steam Families**. Expired tokens and failures keep the last read with a warning. If Steam confirms that you left the group, borrowed games are removed and preferences kept. This integration uses Steam Families services without a stable public contract.

#### Steam tags

Tags come from public Steam pages, without keys or AI classification. Spanish names, IDs, available English names, and retrieval dates are saved. [Steamworks tags](https://partner.steamgames.com/doc/store/tags) reflect developer and community input; the top twenty describe games but do not guarantee difficulty, content, or suitability.

**Settings → Steam & Families → Load Steam tags** runs a resumable sync. It keeps progress when stopped or rate-limited. Library covers and filters use the same top four tags; selection also uses them as affinity signals. Tags remain distinct from IGDB genres.

#### Recommendations and tastes

- **For today** selects a session with an optional minutes target; available metadata cannot guarantee session length. **Next game** selects for several sessions with an optional story-hours limit.
- Set favorites and statuses in **Your library**. Completed and abandoned games are excluded unless replaying is allowed. **Not interested** is always excluded.
- **Local algorithm · No tokens** ranks the saved catalog using the same weights, returning up to three library games and two discoveries already in history. Card scores are explanations, not probabilities. It makes no AI or recommendation network calls, works without Codex, and ignores free-text mood, notes, and conversation. Use filters and editable affinities instead. Story length is a strict limit. The last engine selection is saved.
- **History** keeps completed searches with date, engine, filters, message, cards, and warnings in SQLite. Open earlier results and change game statuses. The conversation present during migration is imported automatically; conversations deleted earlier cannot be recovered.

**Your tastes** estimates affinities from played and favorite games with metadata: progression, challenge, action/combat, tactics, building/automation, combinations, puzzles, exploration, narrative, atmosphere, horror, replayability, survival, and cooperation. Rules live in `lib/tastes.ts`; Steam tags carry more weight than IGDB genres and descriptions. Hours have limited weight adjusted to story length when known, and recognized editions count once. Explicit opinions override favorites and hours; manual affinity corrections have priority. Negative opinions can yield negative weights. Weights describe evidence, not probabilities or confirmed completion.

Exclude hours that do not represent your tastes without removing games from recommendations. Favorites still count. Persistent notes go to Codex; the local algorithm ignores them. Current filters and requests take priority over the inferred profile.

Mark games as playing or paused and select continuing or starting in **For today**. The shortlist saves candidates and can limit searches to them. Opinions on completed or abandoned games adjust affinities and can be removed. Remove active filters individually and inspect the matching count, including shortlist restrictions. Recent recommendations receive a soft penalty across the last five searches; an explicit current request can repeat a game.

**Something like this** prepares an editable Codex request based on a reference game, excluding the reference from results. **Comfort zone** selects a familiar option and an alternative with a known connection and a less represented trait; missing evidence is reported. Filter counts show candidates before choosing that pair. Guided chat asks questions until you choose **Recommend now**.

### Data and Codex internals

`data/library.sqlite` is the source of truth, using Node's native SQLite module. `games` stores synced games, owners, hours, and metadata with unique AppIDs; `app_state` stores profile, family, preferences, and conversation. Updates are transactional. First launch imports `data/state.json`, keeping it unchanged as a pre-migration copy. Editing that old JSON no longer updates the app. Corruption produces an error without replacing originals.

`data/cache.json` keeps metadata for seven days and reviews for 24 hours. Recommendation requests refresh libraries older than 24 hours. **Update library and data** forces reads and marks reviews for refresh, preserving prior values on failure. There are no background library-refresh jobs. Stop the server and copy `data` for a complete manual backup.

Codex receives a compact eligible-candidate index, eight initial records, and [read-only MCP](https://developers.openai.com/codex/mcp/) access through `query_games` to search, filter, and page the whole catalog. Index rows hold AppID, name, origin, known story length, and up to four Steam tags with shared name dictionaries. Statuses, favorites, and opinions are sent separately. The index is rebuilt from current filters and data on every request.

The index budget is 160,000 characters, not tokens. Over budget, it preserves IDs, names, and origin first; if needed, `nextOffset` exposes the rest without hiding partial coverage. The searchable catalog is not capped at 40 library games or 20 discoveries. Queries support names/descriptions, ownership, family owners, genre, mode, length, favorites, unplayed games, and AppID lookups. Pages contain up to 50 games with `total` and `nextOffset`. AI must verify records before recommending; knowing all titles does not mean reading all details.

Each query uses a temporary read-only SQLite catalog of eligible candidates, deleted afterward. AI receives owner names, never SteamIDs or keys. Commands, other connectors, and web search are disabled. Official Codex uses ChatGPT authentication, an ephemeral session, and JSON output validated against eligible candidates. Your Codex allowance is shared.

Review refreshes are limited to 40 library games and 20 discoveries per request; this only limits network work. HLTB updates up to eight games incrementally. Logs `recommendations:database:ready`, `recommendations:codex:start`, and `codex:catalog:query` report catalog counts and AI queries.

The initial model is `gpt-5.6-luna`. Choose model and reasoning effort in **Engine & AI**; **Save** applies draft selections. The last used selection is kept in SQLite. `NEXTPLAY_CODEX_MODEL` in `.env.local` can select another available model. For a nonstandard installation, set `NEXTPLAY_CODEX_BIN` to the absolute native executable path (`codex.exe` on Windows). If Codex cannot find your user folder, launch from a normal Windows terminal and check `codex login status`; do not copy authentication files or use another account.

### Share and troubleshoot

Share the [public downloads link](https://github.com/ivangonzalezsp/nextplay-releases/releases/latest). No GitHub sign-in is needed to download or update. Each person connects their own accounts; do not send your development or personal-data folder.

| Problem                                                  | Check                                                                                                                              |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `node` / `npm` is not recognized, or `node:sqlite` fails | Install Node 24+, open a new terminal, and check `node --version`.                                                                 |
| PowerShell blocks `npm.ps1` / `codex.ps1`                | Use `npm.cmd` / `codex.cmd`, or CMD.                                                                                               |
| Port 3000 is occupied                                    | Stop the other Next Play development instance in its terminal with `Ctrl+C`, or use another test port.                             |
| Steam imports no games                                   | Check your key, profile link, and public game-details setting.                                                                     |
| Codex is missing or the model needs a newer version      | Update with `npm install -g @openai/codex@latest`, check login, and rerun `npm run check:codex`; check `NEXTPLAY_CODEX_BIN` above. |
| Missing lengths, genres, or results                      | Configure optional sources, check connections, and relax filters. Local mode does not download new metadata.                       |

### Checks

```powershell
npm test
npm run typecheck
npm run build
npm run check:codex -- --live
npm run check:flow
```

The last two commands call Codex and consume allowance. The flow check covers both modes and a continuation with 124 synthetic games, including a shared game beyond the first 60. Other tests avoid external services and cover privacy, failures, filters, ownership, invented IDs, context, local access, SQLite migration/rollback/persistence, MCP pagination, language isolation, and palette persistence.

The UI optionally exposes WebMCP tools to inspect state and request recommendations with the visible filters. Browsers without WebMCP work normally.

Sources: [Steam Player Service](https://partner.steamgames.com/doc/webapi/IPlayerService), [Steam reviews](https://partner.steamgames.com/doc/store/getreviews), [IGDB](https://api-docs.igdb.com/), [Codex](https://learn.chatgpt.com/docs/codex-sdk).

---

<a id="espanol"></a>

## Español

[🇬🇧 English](#english) · [🇪🇸 Español](#espanol)

**Next Play se ha creado usando vibecoding:** desarrollo asistido por IA mediante instrucciones en lenguaje natural.

Web personal en español e inglés para elegir qué jugar de tu biblioteca de Steam. Puedes usar el algoritmo local sin IA o tu sesión de **Codex con ChatGPT**, sin configurar la API de OpenAI. Cada persona instala la app en su ordenador y utiliza sus propias cuentas y claves.

## Instalar en Windows

[**Descargar Next Play para Windows x64**](https://github.com/ivangonzalezsp/nextplay-releases/releases/latest)

1. Descarga **NextPlay-Setup-…-x64.exe**, ejecútalo y abre el acceso directo **Next Play**.
2. El asistente permite añadir tu perfil y clave de Steam e importar tus juegos. Steam Families, IGDB y ChatGPT son opcionales. Puedes usar el algoritmo local sin IA.
3. Si tienes una instalación anterior, ciérrala y selecciona **Importar instalación anterior** antes de configurar la nueva. Los datos originales se conservan; conecta ChatGPT de nuevo desde el asistente.

Después de configurar la instalación se ofrece un tutorial opcional para revisar hasta cinco juegos jugados e indicar tus gustos. Las respuestas se guardan al confirmar cada paso; **Completar más adelante** conserva lo confirmado. Puedes retomarlo desde **Ajustes → Tutorial y preferencias iniciales**. Los estados de juegos anteriores no añaden fechas al historial.

El instalador incluye Node, Codex y Python con HowLongToBeat: no necesitas Git, terminal ni instalar herramientas aparte. Cada persona conecta sus propias cuentas. Requiere Windows 10/11 de 64 bits. Esta primera distribución no tiene firma de código y Windows puede mostrar avisos o bloquearla.

### Abrir, cerrar y actualizar

El acceso directo inicia Next Play y abre el navegador. Una segunda apertura reutiliza la instancia. Cerrar la pestaña mantiene la aplicación activa; **Salir**, en su icono de bandeja, la cierra por completo.

En **Ajustes → Configurar cuentas y aplicación** puedes guardar conexiones, conectar o cancelar el inicio de sesión oficial de ChatGPT, buscar actualizaciones y activar opcionalmente el inicio con Windows. **Actualizar y reiniciar** descarga la versión pública, verifica SHA-256 y guarda una copia antes de instalar. Termina cualquier operación en curso primero. La búsqueda automática se limita a una vez al día.

El acceso empieza limitado al PC. **Permitir acceso desde mi red local** solicita permiso de Windows, reinicia Next Play y muestra la dirección para el móvil. La regla de firewall se limita al programa, a redes privadas y a la subred local. La gestión de credenciales, autenticación, actualizaciones y procesos sigue restringida al PC por conexión real y origen HTTP.

### Datos y privacidad

El programa está en `%LOCALAPPDATA%\Programs\NextPlay`; la biblioteca, configuración, sesión de Codex y copias están en `%LOCALAPPDATA%\NextPlay`. Las credenciales se guardan localmente; la API solo devuelve si están configuradas. Omitir una clave conserva su valor y eliminarla requiere una acción explícita. La desinstalación conserva tus datos. Para una copia manual, sal de Next Play y copia la carpeta completa.

El código y el historial permanecen en **ivangonzalezsp/nextplay**, público. Los instaladores y notas se publican en **ivangonzalezsp/nextplay-releases**, público. Parte del código distribuido se puede inspeccionar. Consulta [compilación y publicación](docs/windows-release.md) para mantener este reparto.

## Licencia

El código original de Next Play se distribuye bajo la [GNU General Public License, versión 3](LICENSE).
Las dependencias, datos, carátulas, logos y servicios de terceros conservan sus propias licencias y condiciones.
El nombre y el logotipo **Next Play** no se conceden bajo esta licencia.

## Desarrollo desde el código fuente

Las siguientes instrucciones son para desarrollar desde el repositorio público. Para uso normal, utiliza el instalador de Windows.

### Requisitos de desarrollo

- **Node.js 24 o posterior**, con npm. SQLite viene integrado en Node; no necesitas instalar un servidor de base de datos.
- **Una cuenta de Steam y una clave de Steam Web API** para importar tu biblioteca. El perfil y los detalles de juegos deben ser públicos.
- **Git**, solo si vas a clonar el repositorio; también puedes recibir el código en ZIP.
- **Opcional: Codex CLI y una cuenta de ChatGPT con acceso a Codex**, para las recomendaciones con IA. El algoritmo local no los necesita.
- **Opcional: credenciales de Twitch/IGDB**, para géneros, modos y descubrimientos.
- **Opcional: Python 3.12**, versión probada para consultar duraciones de HowLongToBeat.

Las instrucciones principales usan PowerShell en Windows. Necesitas Internet para instalar dependencias, sincronizar fuentes y consultar Codex; el algoritmo local utiliza los datos ya guardados.

## Instalación y primer arranque

### 1. Obtener el proyecto

Descomprime el ZIP recibido y abre una terminal en la carpeta que contiene `package.json`. Si te han facilitado un repositorio, sustituye `URL_DEL_REPOSITORIO` por su dirección:

```powershell
git clone URL_DEL_REPOSITORIO next-play
cd next-play
```

### 2. Instalar dependencias y configurar tus claves

```powershell
node --version
npm ci
Copy-Item .env.example .env.local
```

Comprueba que Node muestra `v24` o superior. Copia `.env.example` solo en la primera instalación para no sobrescribir tus claves. En macOS/Linux, utiliza `cp .env.example .env.local`.

Abre `.env.local` en un editor y completa al menos `STEAM_API_KEY`, siguiendo [Conectar tus datos](#conectar-tus-datos). Puedes dejar vacías las credenciales opcionales. No necesitas `OPENAI_API_KEY`.

### 3. Iniciar la app e importar tu biblioteca

```powershell
npm run dev
```

1. Abre [Next Play](http://127.0.0.1:3000).
2. Abre la configuración desde la cabecera. En **Configurar cuentas y aplicación**, añade **tu enlace de Steam** (`https://steamcommunity.com/id/tu_usuario/` o `https://steamcommunity.com/profiles/TU_STEAMID64/`) y tu clave.
3. En **Diagnóstico**, pulsa **Comprobar conexiones**; vuelve a **Steam & Familias** y pulsa **Sincronizar**.
4. Comprueba que tus juegos aparecen en **Tu biblioteca**. Para empezar sin Codex, selecciona el **Algoritmo local** en **Motor & IA**, ajusta los filtros y pide una recomendación. Al principio conviene usar pocos filtros: faltarán metadatos si no has configurado las fuentes opcionales.

Deja la terminal abierta mientras usas la app. Para detenerla, pulsa `Ctrl+C`; para volver a abrirla, ejecuta `npm run dev` desde la misma carpeta. Los datos se conservan en `data/`.

La app escucha únicamente en `127.0.0.1:3000`: compartir ese enlace no permite que tus amigos entren desde otro ordenador. Cada uno debe ejecutar su propia copia. No necesitas mantener abierta la aplicación de escritorio de Codex.

### Prototipo de escritorio (Electron)

Después de instalar las dependencias, compila y abre la ventana de escritorio:

```sh
npm run build
npm run desktop
```

El prototipo utiliza el **Node.js 24+** instalado y descarga Electron en el primer arranque si hace falta. Inicia su propio servidor en un puerto loopback libre, abre una ventana de Next Play y detiene ese servidor al cerrar la ventana o elegir **Archivo → Salir**. El perfil conserva ese puerto en `desktop-server.json` para mantener idioma y paleta entre arranques; si otro proceso lo ocupa, el arranque falla sin detenerlo. Un segundo arranque del mismo perfil enfoca la ventana existente. Los enlaces web se abren en tu navegador y **Jugar** abre Steam.

El perfil predeterminado es `work/desktop-profile/`: SQLite bajo `data/`, cuentas en `settings.json`, una sesión separada de Codex en `codex/` y preferencias de ventana bajo `electron/`. Se conserva entre arranques y no carga `.env.local`, la biblioteca del checkout ni las credenciales heredadas. Configura las cuentas expresamente desde la app; no se copian automáticamente. Para otro perfil de prueba, ejecuta `npm run desktop -- --profile "ruta/al/perfil-de-prueba"`.

Es un prototipo ejecutado desde el código fuente, validado en Windows, con un lanzador preparado para Windows, Linux y macOS. La ejecución en Linux/macOS sigue sin verificar. No sustituye al instalador de Windows: quedan pendientes los runtimes incluidos, instaladores por plataforma, integraciones de inicio automático/LAN y actualizaciones de escritorio. Usa `npm run dev` para el desarrollo habitual en navegador.

### 4. Activar recomendaciones con IA (opcional)

Instala [Codex CLI siguiendo la documentación oficial de OpenAI](https://learn.chatgpt.com/docs/codex/cli) e inicia sesión con tu propia cuenta de ChatGPT:

```powershell
npm install -g @openai/codex@latest
codex login
codex login status
npm run check:codex
```

El estado debe indicar **Logged in using ChatGPT**. La comprobación sin `--live` no pide una recomendación. En la app, pulsa **Comprobar conexiones** y selecciona Codex en **Motor & IA**. Las recomendaciones con IA consumen el cupo de tu cuenta; elige un modelo disponible para ella.

### Ejecutar una compilación local

Para un servidor Docker ya compilado con datos persistentes, consulta [Next Play Server · Docker](docs/docker-server.md#español). El workflow **Server image**, ejecutado en las PR a `main` o manualmente, prepara imágenes AMD64/ARM64 y pruebas del contenedor; las descargas requieren una ejecución correcta. Esta distribución es independiente del prototipo de escritorio.

Como alternativa al modo de desarrollo:

```powershell
npm run build
npm run start:production
```

Este servidor escucha en la red local en `0.0.0.0:3001`; en el PC usa `http://127.0.0.1:3001` y desde el móvil la IP del PC, por ejemplo `http://192.168.1.208:3001`. La API confía en dispositivos de redes privadas, así que no expongas este puerto a Internet. `npm start` sigue disponible en el puerto 3000. Tras cambiar o actualizar el código, vuelve a ejecutar `npm run build` antes de arrancar la compilación.

### Arranque automático en Windows

Después de crear una compilación, puedes hacer que este servidor se inicie al entrar en Windows:

```powershell
npm run build
npm run startup:install
```

Se instala un lanzador oculto en la carpeta de inicio de sesión y la app queda disponible en el PC y en la red local mediante `http://<IP-del-PC>:3001`. Para quitarlo:

```powershell
npm run startup:uninstall
```

Si mueves la carpeta del proyecto, quita el arranque anterior y vuelve a instalarlo desde la nueva ubicación. Después de cambiar el código, ejecuta `npm run build` para que el siguiente arranque use la versión nueva.

## Conectar tus datos

Configura tus propias claves en `.env.local`. `.env.example` contiene el formato sin secretos; solo la clave de Steam es necesaria para importar la biblioteca propia:

| Variable               | Procedencia                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `STEAM_API_KEY`        | [Steam Web API](https://steamcommunity.com/dev/apikey). Usa `localhost` como dominio de tu app personal.                                    |
| `TWITCH_CLIENT_ID`     | [Consola de Twitch](https://dev.twitch.tv/console/apps). Registra una aplicación de tipo **Confidential** y redirección `http://localhost`. |
| `TWITCH_CLIENT_SECRET` | Sección de gestión de esa misma aplicación de Twitch.                                                                                       |

Las dos variables de Twitch son opcionales y se configuran juntas. No pegues claves en el chat ni las incluyas en Git. **No necesitas `OPENAI_API_KEY`.** La app relee `.env.local`; pulsa **Comprobar conexiones** y luego **Sincronizar**. La presencia de una clave se indica en la interfaz; la sincronización verifica si la fuente la acepta.

Añade el enlace de tu propio perfil antes de sincronizar. El perfil y los **detalles de juegos** deben ser públicos. Si la API no permite verlos, se conserva la última biblioteca y se muestra un error; esto se distingue de una biblioteca accesible con cero juegos. No se importan contraseñas ni cookies de Steam.

IGDB es opcional para leer la biblioteca, pero necesario para géneros, modos y descubrimientos. Si faltan metadatos, los filtros estrictos que los requieren excluyen esos juegos. La duración principal prioriza HowLongToBeat; cuando falta, utiliza la media hasta los créditos de IGDB si hay aportaciones. Nunca se interpreta como duración de una sesión. Las horas de Steam no determinan si te gustó o terminaste un juego.

### HowLongToBeat

Se utiliza [howlongtobeatpy](https://github.com/ScrappyCocco/HowLongToBeat-PythonAPI), mediante un proceso puntual de Python que inicia Node. No necesitas otro servidor ni credenciales de HLTB. Esta integración es opcional y se ha probado con Python 3.12. Cada persona debe preparar su entorno desde la carpeta del proyecto:

```powershell
python -m venv .venv-hltb
.venv-hltb\Scripts\python.exe -m pip install -r requirements-hltb.txt
.venv-hltb\Scripts\python.exe tests/hltb_test.py
```

En macOS/Linux:

```sh
python3 -m venv .venv-hltb
.venv-hltb/bin/python -m pip install -r requirements-hltb.txt
.venv-hltb/bin/python tests/hltb_test.py
```

Después, pulsa **Comprobar conexiones** en la app. Sin Python/HLTB, las duraciones utilizan IGDB cuando hay datos disponibles.

Por defecto se detecta `.venv-hltb`. Para usar otro entorno, configura `NEXTPLAY_PYTHON` con la ruta absoluta de su ejecutable. El proceso recibe solo nombres e identificadores de juegos; no hereda las claves de Steam, Twitch ni la autenticación de Codex.

Cada recomendación consulta hasta ocho candidatos sin caché vigente, incluyendo descubrimientos cuando existen. La cobertura aumenta con las búsquedas; no se recorre de golpe toda la biblioteca. Los nombres permiten buscar, pero solo se acepta una ficha con el AppID de Steam explícito (principal o alternativo); algunos alternativos comparten las estimaciones de otra edición. Se muestran historia, historia y extras, completista, enlace y fecha. Un tiempo sin aportaciones permanece desconocido.

`data/hltb.json` conserva las consultas durante siete días. **Actualizar biblioteca y datos** marca también HLTB para refrescar en la siguiente recomendación. Si hay bloqueo, límite de peticiones, cambio de formato o error, se conserva la última lectura y se utiliza IGDB cuando falta la historia de HLTB. Esta biblioteca es una integración no oficial y su funcionamiento depende de los cambios de la web.

## Uso

### Idioma y colores

Usa **🇬🇧 EN / 🇪🇸 ES** en la cabecera para cambiar de idioma. Español es el idioma inicial. La elección se guarda en este navegador y se sincroniza entre sus pestañas. Las nuevas recomendaciones y los mensajes de servicios usan el idioma elegido; las notas personales, títulos y conversaciones anteriores conservan su texto original. Las etiquetas de Steam usan su nombre inglés cuando está disponible.

Solo se conserva el diseño **Inmersivo**, con las paletas **Menta, Océano, Violeta, Ámbar y Rosa**. El selector **Color** cambia la paleta sin cambiar las tarjetas ni la navegación. Las selecciones antiguas de Legacy, Steam, PS5 y Switch 2 vuelven a Menta.

### Steam Families

La conexión familiar utiliza `STEAM_FAMILY_TOKEN`, el valor `webapi_token` de [tu sesión oficial de Steam](https://store.steampowered.com/pointssummary/ajaxgetasyncconfig). Guárdalo en `.env.local` junto a `STEAM_API_KEY`. Son credenciales distintas. La app comprueba que el token corresponde al perfil conectado; nunca lo devuelve al navegador ni lo envía a Codex.

Pulsa **Comprobar conexiones** y **Conectar Steam Families**. Se importan automáticamente las bibliotecas del grupo, incluso si sus perfiles no son públicos. En **Tu biblioteca** puedes filtrar los juegos propios, los compartidos o los de cada miembro. Los duplicados se unen mediante AppID y tus preferencias se conservan. Las horas importadas pertenecen al perfil conectado, no a los propietarios de las copias.

Steam decide qué títulos admite en préstamo. Los excluidos y los juegos que el propietario marca como privados no se importan como compartidos. Las recomendaciones familiares cuentan entre las tres opciones de tu biblioteca, nunca como descubrimientos. No se comprueba si otra persona está usando la última copia disponible en ese instante.

La biblioteca familiar se refresca después de 24 horas al pedir recomendaciones, y también con **Actualizar Steam Families**. Si el token caduca o Steam falla, se conserva la última lectura y se indica el problema. Si Steam confirma que ya no perteneces a un grupo, se retiran los préstamos y se mantienen las preferencias. Esta integración utiliza servicios de Steam Families sin un contrato público estable y puede requerir ajustes si Steam cambia su interfaz.

### Etiquetas de Steam

Las etiquetas se obtienen de las fichas públicas de Steam, sin claves ni clasificación generada por IA. Se conserva el nombre en español, su identificador y la traducción inglesa cuando aparecen en el diccionario de Steam, además de la fecha de consulta. Según [Steamworks](https://partner.steamgames.com/doc/store/tags?l=spanish), las etiquetas reflejan aportaciones de desarrolladores y comunidad; las veinte principales ayudan a describir y encontrar juegos, pero no garantizan por sí solas una característica.

### Logros de Steam

Los juegos marcados como **Estoy jugando** o **En pausa** muestran su progreso de logros y una lista desplegable en la biblioteca. Consulta [logros de Steam](docs/steam-achievements.md) para conocer la sincronización, los requisitos y la ubicación de esta interfaz.

En **Tu biblioteca** puedes buscar por etiquetas y seleccionar una etiqueta para filtrar tus juegos propios o compartidos. La IA también puede consultar estas etiquetas mediante `query_games`: `query` busca fragmentos, `tag` coincide con el nombre completo en español o inglés (sin distinguir tildes o mayúsculas) y `tagIds` coincide con cualquiera de los IDs indicados. Se pueden combinar con los filtros y la paginación existentes. Los géneros de IGDB y las etiquetas de Steam conservan su significado separado; dos etiquetas con la misma traducción siguen teniendo IDs distintos.

La importación se inicia desde **Ajustes y Conexiones > Cargar etiquetas de Steam** o con `npm run sync:steam-tags`, y se puede reanudar: guarda resultados por lotes en la tabla `steam_tags` de SQLite, conserva las etiquetas anteriores si Steam falla y registra los juegos sin etiquetas o sin una ficha disponible. `npm run sync:steam-tags -- --force` vuelve a consultar los juegos ya comprobados. Antes de escribir se crea una copia consistente en `data/backups`. Si Steam limita las consultas, respeta la espera indicada y detiene la importación si el límite persiste. No añade una descarga completa de etiquetas a cada recomendación. Las etiquetas guardadas sobreviven a las sincronizaciones de las bibliotecas. La fuente pública utilizada no tiene un contrato de API estable y puede cambiar.

### Tus gustos

La pestaña **Tus gustos** calcula un perfil provisional con todo el historial jugado o marcado como favorito que tenga metadatos en la BBDD. Incluye progresión, desafío, acción/combate, tácticas, construcción/automatización, combinaciones, puzles, exploración, narrativa, atmósfera/inmersión, terror/miedo, rejugabilidad, supervivencia y cooperación. Las reglas están en `lib/tastes.ts`: una etiqueta de Steam aporta una señal de 1 (por ID, independiente del idioma, o por nombre), un género de IGDB 0,75, un modo multijugador 0,5 y una coincidencia solo en la descripción 0,25. Varias etiquetas de la misma afinidad no multiplican la señal. Son aproximaciones, no características confirmadas.

Las horas aportan `log(1 + horas) / log(501)`, con un máximo de 1 por juego. Si hay duración principal de HLTB o, en su defecto, IGDB, se toma el mayor entre ese peso y `0,8 × min(1, horas / duración)`, para que los juegos cortos también cuenten; no implica haberlos terminado. Un favorito aporta 2. Cada afinidad suma el peso de cada juego multiplicado por su señal y lo divide entre el peso total del historial con metadatos más 3, que modera las inferencias con pocas referencias. El resultado se muestra sobre 100: refleja presencia en el historial, no una probabilidad ni rechazo cuando es bajo. Los juegos sin jugar o sin metadatos no diluyen el perfil. El análisis de gustos solo usa los cuatro primeros tags de Steam, los mismos que se muestran como etiquetas principales en las tarjetas. Se muestra el número total de referencias y los cinco juegos con más peso, junto con las etiquetas o fuentes utilizadas. Se agrupan títulos con sufijos de edición reconocibles y coincidencias de ID de IGDB; las ediciones con nombres e identificadores distintos pueden requerir excluir sus horas manualmente.

Puedes **priorizar**, **neutralizar** o **reducir** una afinidad, excluir las horas de juegos que no representan tus gustos y guardar notas para Codex. Excluir horas conserva el juego en la biblioteca y no anula un favorito explícito. Las notas llegan a Codex; los controles de afinidad y horas cambian también el orden de consulta. Las correcciones se guardan en `data/library.sqlite`, sobreviven a sincronizaciones y nuevas búsquedas, y al guardarlas se retiran las propuestas anteriores.

La puntuación de preselección da 80 a una mención del nombre (solo Codex), 40 a un favorito, hasta ±16 por afinidades corregidas y hasta 6 por inferencias. En Para hoy, la actividad reciente de una lectura vigente suma 4 y tener cero minutos registrados suma 1; en Próximo juego suman 1 y 4, respectivamente. Las horas desconocidas no se consideran cero. Primero se aplican los filtros y exclusiones. Los descubrimientos también utilizan las referencias del perfil. Codex recibe las afinidades, sus evidencias y las notas; la petición actual y los filtros prevalecen. No se entrena un modelo ni se consumen llamadas a Codex para calcular el perfil.

### Recomendaciones

- **Para hoy:** tiempo de sesión y lo que te apetece. La adecuación a ese tiempo es una valoración orientativa.
- **Próximo juego:** selección para varias sesiones, con un límite opcional de horas de historia.
- En **Tu biblioteca**, marca favoritos y estados. Terminados y abandonados se excluyen salvo que actives la opción de incluirlos. «No me interesa» siempre se excluye.
- **Cómo recomendar → Algoritmo local · sin tokens:** ordena todo el catálogo guardado con estos mismos pesos y muestra hasta tres juegos de biblioteca y dos descubrimientos ya presentes en el historial. Cada ficha explica los puntos; no son probabilidades. No ejecuta consultas a la IA ni refrescos de red, y funciona sin Codex disponible. No interpreta ánimo, notas ni conversación; usa los filtros y las afinidades editables. El límite de historia es estricto; el tiempo de sesión no se puede garantizar con estos datos. La última opción utilizada se guarda.
- **Historial:** cada recomendación completada conserva fecha, motor, filtros, mensaje, fichas y avisos en SQLite. Se puede abrir cualquier resultado anterior y marcar sus juegos. La conversación que exista al actualizar se incorpora automáticamente; las búsquedas borradas antes de esta función no se pueden recuperar.
- **Modo guiado:** actívalo en el chat para que Codex haga una pregunta por turno y acote tus preferencias antes de proponer juegos. Contesta en el mismo cuadro; **Recomiéndame ya** cambia a **Directo** y pide propuestas con todo lo hablado. Directo también permite pedir juegos desde el principio. El tipo de respuesta se valida según el modo elegido y se recupera al recargar la conversación. Las preguntas no añaden entradas al Historial ni afectan a la penalización por repetición. El motor local mantiene su comportamiento sin conversación.
- Los mensajes del jugador, las respuestas de la IA y las fichas recomendadas aparecen en orden de conversación, siempre encima del cuadro de texto.
- La conversación activa mantiene los filtros y los mensajes hasta que pulses **Reiniciar**. Los cambios de filtros de la interfaz prevalecen sobre mensajes anteriores, y cambiar entre Para hoy, Próximo juego o motores no borra el contexto. Cada nueva petición llega a Codex como continuación de los turnos anteriores; el historial completo se conserva en SQLite. Mientras se genera una recomendación, **Actividad de la IA** muestra fases y eventos sanitizados sin guardar prompts ni razonamientos como historial.
- Las propuestas principales proceden de tu biblioteca propia o compartida; los descubrimientos se etiquetan aparte y enlazan a Steam. Las referencias de IGDB deben incluir un enlace de aplicación de Steam cuyo AppID coincida; se descartan paquetes y referencias sin enlace verificable. No se consultan precios.

## Datos locales y conexión a Codex

`data/library.sqlite` es la base de datos local SQLite, usando el módulo nativo de Node.js. La tabla `games` guarda todos los juegos sincronizados, sus propietarios, horas y metadatos, con AppID único; `app_state` guarda perfil, grupo familiar, preferencias y conversación. Las actualizaciones se guardan juntas en una transacción. En el primer arranque se importa automáticamente `data/state.json` y se conserva ese archivo sin modificar como copia anterior a la migración. A partir de entonces SQLite es la fuente de los datos; editar el JSON antiguo no cambia la app. Un archivo corrupto produce un error sin reemplazar los originales.

`data/cache.json` conserva metadatos (7 días) y valoraciones (24 horas). La biblioteca se refresca al pedir recomendaciones si supera 24 horas. **Actualizar biblioteca y datos** fuerza una nueva lectura y marca las reseñas para actualizar, conservando las anteriores si falla la consulta. No hay tareas de fondo. Para hacer una copia actual completa, cierra el servidor y copia la carpeta `data`.

Codex recibe un índice compacto de los candidatos elegibles, una muestra inicial de ocho fichas y acceso a `query_games`, una herramienta [MCP de lectura](https://developers.openai.com/codex/mcp/) para buscar, filtrar y paginar todo el catálogo. El índice usa filas con AppID, nombre, procedencia, duración principal conocida y hasta cuatro etiquetas Steam, cuyos nombres se guardan una sola vez en un diccionario. Los estados, favoritos y opiniones se envían aparte como preferencias. Se reconstruye en cada petición con los filtros y datos actuales, sin otra base de datos ni sincronización.

El índice tiene un presupuesto de 160.000 caracteres (no tokens): si lo supera, conserva primero AppID, nombre y procedencia de todos los juegos; si aun así no cabe, indica `nextOffset` para consultar el resto sin ocultar la cobertura parcial. No hay un límite fijo de juegos ni se recorta el catálogo consultable a 40 juegos de biblioteca y 20 descubrimientos. `query_games` permite consultar nombres/descripciones, juegos propios o familiares, propietario, género, modo, duración, favoritos, juegos sin jugar y fichas por AppID. Cada página contiene hasta 50 juegos e indica `total` y `nextOffset`. La IA debe verificar las fichas antes de recomendar: disponer de todos los títulos no significa haber leído todos sus detalles, y la mejora de calidad debe comprobarse con recomendaciones reales.

Cada consulta usa una copia SQLite temporal de los candidatos que cumplen los filtros y exclusiones, leída en modo solo lectura y eliminada al terminar. La IA recibe nombres de propietarios, nunca sus SteamID ni las claves de Steam/Twitch. Los comandos, otros conectores y la búsqueda web siguen desactivados. Se usa el ejecutable oficial de Codex, sesión efímera, autenticación con ChatGPT y salida JSON validada contra todo el catálogo elegible. Se comparte el cupo de tu cuenta de Codex.

La actualización de reseñas consulta como máximo 40 juegos de biblioteca y 20 descubrimientos por petición; ese límite solo afecta al trabajo de red, no al catálogo consultable. El resto conserva las reseñas disponibles y su fecha. HLTB mantiene su actualización gradual de hasta ocho juegos. Los logs `recommendations:database:ready` y `recommendations:codex:start` muestran los totales completos, y `codex:catalog:query` registra las consultas de la IA.

El modelo inicial es `gpt-5.6-luna`; puedes elegir el modelo y el esfuerzo de razonamiento junto a los filtros. La última selección usada en una consulta se conserva en `data/library.sqlite`. También puedes cambiar `NEXTPLAY_CODEX_MODEL` en `.env.local` por otro disponible en tu cuenta. Si Codex está instalado fuera de las ubicaciones habituales, configura `NEXTPLAY_CODEX_BIN` en el entorno con la ruta absoluta a su ejecutable nativo (`codex.exe` en Windows).

Si aparece «no puede localizar tu carpeta de usuario», ejecuta la aplicación desde una terminal normal de tu sesión de Windows. No copies archivos de autenticación ni uses otra cuenta. `codex login status` debe indicar **Logged in using ChatGPT**.

## Compartir Next Play

Comparte el [enlace público de descargas](https://github.com/ivangonzalezsp/nextplay-releases/releases/latest). Tus conocidos no necesitan clonar el repositorio ni autenticarse en GitHub para descargar o actualizar. Cada persona usa sus propias cuentas desde el asistente. No envíes la carpeta de desarrollo ni tu carpeta de datos personales.

## Problemas frecuentes

| Problema                                                      | Qué comprobar                                                                                                                                                                    |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node` o `npm` no se reconoce, o falla `node:sqlite`          | Instala Node.js 24 o posterior y abre una terminal nueva; comprueba `node --version`.                                                                                            |
| PowerShell bloquea `npm.ps1` o `codex.ps1`                    | Utiliza `npm.cmd` o `codex.cmd` en los comandos correspondientes, o una terminal CMD.                                                                                            |
| El puerto 3000 está ocupado                                   | Detén la otra instancia de Next Play con `Ctrl+C` en su terminal antes de iniciar otra.                                                                                          |
| Steam no importa juegos                                       | Revisa tu clave, el enlace de tu perfil y la visibilidad pública de los detalles de juegos.                                                                                      |
| No encuentra Codex o el modelo requiere una versión más nueva | Ejecuta `npm install -g @openai/codex@latest`, revisa `codex login status` y repite `npm run check:codex`. Consulta también la configuración de `NEXTPLAY_CODEX_BIN` más arriba. |
| Faltan duraciones, géneros o resultados                       | Configura las fuentes opcionales, comprueba las conexiones y prueba con menos filtros. El modo local no descarga metadatos nuevos.                                               |

## Comprobaciones

```powershell
npm test
npm run typecheck
npm run build
npm run check:codex -- --live
npm run check:flow
```

Las dos últimas órdenes usan Codex y consumen cupo. La prueba del flujo comprueba ambos modos y una continuación con 124 juegos ficticios, buscando un compartido situado más allá de los primeros 60. Las demás pruebas no llaman a servicios externos: comprueban perfiles, bibliotecas privadas/vacías, fallos de red, exclusiones, propiedad, límites de duración, IDs inventados, conservación de contexto, protección del servidor local, migración a SQLite, rollback, persistencia y búsquedas/paginación por el transporte MCP real.

La interfaz expone herramientas WebMCP opcionales para consultar el estado y pedir recomendaciones con los mismos filtros visibles. Los navegadores sin WebMCP funcionan normalmente.

Fuentes: [Steam Player Service](https://partner.steamgames.com/doc/webapi/IPlayerService), [reseñas de Steam](https://partner.steamgames.com/doc/store/getreviews), [IGDB](https://api-docs.igdb.com/), [Codex](https://learn.chatgpt.com/docs/codex-sdk).

## Selección y seguimiento

Puedes marcar juegos en curso o en pausa y elegir continuar o empezar en «Para hoy». La lista corta guarda candidatos y permite limitar una búsqueda a ellos. Las opiniones sobre juegos terminados o abandonados ajustan tus afinidades y pueden retirarse.

Los filtros activos se pueden quitar individualmente y muestran cuántos juegos de la biblioteca cumplen los requisitos, también al limitar la búsqueda a la lista corta. Se penalizan suavemente las recomendaciones de las últimas cinco búsquedas para favorecer alternativas; una petición explícita de un juego permite repetirlo.

«Algo como este» prepara una petición editable para Codex a partir de un juego y lo excluye de los resultados. «Zona de confort» selecciona una opción afín y otra con una conexión conocida y un rasgo menos representado; si no hay evidencia suficiente, lo indica. Los recuentos de filtros muestran candidatos antes de seleccionar esta pareja.
