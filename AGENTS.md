# AGENTS.md · Next Play

Instrucciones para trabajar en todo este repositorio. Consulta [README.md](README.md) para instalación y uso; este archivo recoge las convenciones y los límites que deben conservar los cambios. Si una tarea modifica alguno de estos contratos, actualiza también la documentación correspondiente.

## Forma de trabajar

- Antes de editar, revisa `git status --short`, el diff existente y las instrucciones adicionales de la carpeta afectada. Conserva el trabajo ajeno y limita los cambios al alcance solicitado.
- Sigue el flujo completo antes de corregir un fallo: interfaz, API, lógica compartida y persistencia. Busca todos los llamadores de la función que vas a cambiar; corrige la causa donde se comparte.
- Reutiliza funciones, tipos y componentes existentes. Prefiere las APIs nativas y las dependencias instaladas; no añadas abstracciones, dependencias o refactorizaciones para necesidades hipotéticas.
- Mantén la interfaz y sus mensajes en español, el comportamiento predeterminado y la accesibilidad por teclado. Los cambios visuales deben respetar los demás temas y tamaños de pantalla.
- Cuando un cambio visible para el usuario entra en un PR o commit, añade una entrada en `CHANGELOG.md` bajo `## [Unreleased]`, dentro de `### Features` o `### Correcciones de errores`, sin borrar entradas de otros agentes. Sustituye `- Ninguno.` solo en la categoría que corresponda; no incluyas secretos ni datos personales. Los cambios internos sin efecto para el usuario no necesitan entrada.
- Comunica qué cambió, cómo se comprobó y qué quedó pendiente. No presentes resultados históricos como verificaciones de la tarea actual.

## Mapa del proyecto

| Ubicación                                                                                         | Responsabilidad                                                                                                 |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `app/page.tsx`, `components/`                                                                     | Estado y composición de la interfaz; biblioteca, recomendaciones, ajustes e historial.                          |
| `components/ui/`                                                                                  | Componentes compartidos; reutiliza el `combobox.tsx` existente para selectores con búsqueda.                    |
| `lib/model.ts`                                                                                    | Tipos, valores predeterminados y helpers compartidos como `inLibrary`, `gameUrl`, `storyHours` y `steamTagKey`. |
| `lib/filters.ts`, `lib/tastes.ts`, `lib/play-history.ts`                                          | Elegibilidad y filtros, afinidades y fechas/eventos de juego.                                                   |
| `app/api/[...path]/route.ts`, `server/api.ts`                                                     | Adaptador de rutas y manejo central de la API: validación, operaciones y snapshots.                             |
| `server/store.ts`, `server/database.ts`                                                           | Directorios, configuración, escrituras JSON atómicas, exclusión de operaciones, SQLite y migraciones.           |
| `server/selection.ts`, `server/library.ts`                                                        | Selección local, validación de entradas/resultados y consultas paginadas al catálogo.                           |
| `server/codex.ts`, `scripts/library-mcp.ts`                                                       | Proceso de Codex y herramienta MCP de lectura de candidatos.                                                    |
| `server/sources.ts`, `server/family.ts`, `server/steam-*.ts`, `server/hltb.ts`, `scripts/hltb.py` | Steam, IGDB, familias, etiquetas, logros, duraciones y sus cachés.                                              |
| `server/local-access.ts`, `server/desktop.ts`, `server/updates.ts`                                | Administración local, cuentas, importación, procesos y actualizaciones.                                         |
| `scripts/start-server.ts`, `scripts/windows-*.ps1`, `packaging/`                                  | Servidor de producción, integración de Windows e instalador.                                                    |
| `tests/`, `docs/`, `.github/workflows/`                                                           | Pruebas, documentación específica y distribución de Windows.                                                    |

## Entorno y comandos

- Node.js **24 o posterior**, npm y el `package-lock.json` existente. Usa `npm ci` para instalar las versiones fijadas; no cambies de gestor de paquetes.
- React, TypeScript estricto, Tailwind y **Vinext sobre Vite**. El servidor necesita Node (`node:sqlite` y procesos locales); no sustituyas los scripts por `next dev` ni cambies a un runtime de Workers/Edge.
- El proyecto usa módulos ESM. Los scripts y pruebas TypeScript se ejecutan directamente con Node; conserva las extensiones `.ts` en sus imports y usa `@/` según el patrón existente de la interfaz.
- En Windows/PowerShell usa `npm.cmd` si la política de ejecución bloquea `npm.ps1`. No cambies la política global para resolverlo.

| Comando en PowerShell                                         | Uso                                                                                     |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `npm.cmd run dev`                                             | Desarrollo en `127.0.0.1:3000`.                                                         |
| `npm.cmd run build`                                           | Genera la compilación en `dist/`.                                                       |
| `npm.cmd start`                                               | Sirve la compilación en `127.0.0.1:3000`.                                               |
| `npm.cmd run start:production`                                | Desde el checkout, sirve la compilación en `0.0.0.0:3001`, accesible por LAN.           |
| `npm.cmd test`                                                | Suite de Node: `node --test tests/*.test.ts`.                                           |
| `node --test tests/filters.test.ts`                           | Ejemplo de prueba enfocada; elige el archivo del comportamiento afectado.               |
| `npm.cmd run typecheck`                                       | Comprobación de tipos sin emitir código.                                                |
| `npm.cmd run lint`                                            | Oxlint, sin correcciones automáticas.                                                   |
| `npm.cmd run check:codex`                                     | Comprueba disponibilidad/autenticación sin pedir una respuesta a la IA.                 |
| `npm.cmd run check:codex -- --live`, `npm.cmd run check:flow` | Pruebas reales que **consumen cupo de Codex**; no son parte de la validación rutinaria. |
| `npm.cmd run sync:steam-tags`                                 | Descarga etiquetas y escribe datos locales; no es una prueba.                           |

Reutiliza el servidor existente si corresponde a la prueba. Si un puerto está ocupado, comprueba el proceso y su ruta antes de detenerlo o elige otro puerto; nunca cierres todos los procesos Node. Compila de nuevo antes de probar cambios en producción. El instalador usa `--installed`, escucha solo en loopback inicialmente y habilita LAN según la configuración guardada; no lo confundas con `start:production` del checkout.

## Comportamientos que deben conservarse

- **Motor & IA:** en `components/settings/SettingsModal.tsx`, los controles editan borradores. Solo **Guardar** aplica motor, modelo y esfuerzo; cerrar o cancelar descarta los cambios. Conserva la validación de `codexEffortsForModel`.
- **Temas:** Inmersivo es el tema inicial; `Legacy` conserva el diseño original. Añade temas como módulos siguiendo [app/themes/README.md](app/themes/README.md), incluyendo modales y portales; no reemplaces estilos globales para introducir una opción.
- **Filtros:** reutiliza `DEFAULT_FILTERS`, `clearFilters` y la elegibilidad compartida. Limpiar filtros conserva `replay: false`; los ignorados se excluyen siempre y los completados/abandonados requieren permitir rejugar. Comprueba tanto el recuento como la selección final.
- **Etiquetas:** las portadas de la biblioteca muestran hasta cuatro en la parte inferior. El filtro de biblioteca debe corresponder a las etiquetas visibles; conserva la búsqueda, selección por clic/Enter y chips extraíbles donde se admiten varias. Usa `steamTagKey` para la identidad, sin confundir etiquetas de Steam con géneros de IGDB.
- **Juegos manuales:** usan `appId` negativo e identidad de IGDB; cero no es válido. Deben sobrevivir a la sincronización propia/familiar y quedar fuera de consultas exclusivas de Steam. Usa `gameUrl` para sus enlaces e `inLibrary` para incluir juegos propios y compartidos.
- **Historial:** `conversation` es el contexto activo, `history` conserva recomendaciones y `playHistory` registra la actividad del jugador. Limpiar una conversación no borra los historiales. Reutiliza los helpers de fechas para evitar desplazamientos de día por zona horaria.
- **Metadatos:** desconocido no equivale a cero ni a una característica confirmada. La duración de historia no es la de una sesión; las horas jugadas no prueban gusto ni finalización. El motor local debe seguir funcionando sin Codex ni consultas de recomendación a la red.
- **Logros:** conserva los datos anteriores ante fallos y no reveles nombres/descripciones de logros ocultos pendientes. Su alcance e interfaz están en [docs/steam-achievements.md](docs/steam-achievements.md).

## Datos personales y credenciales

- En desarrollo, la fuente de verdad es `data/library.sqlite`, o `library.sqlite` bajo `NEXTPLAY_DATA_DIR`. `server/database.ts` gestiona `games`, `app_state`, `steam_tags` y `steam_achievements`. `data/state.json` es únicamente el origen de una migración antigua; editarlo no actualiza la biblioteca existente.
- `NEXTPLAY_USER_DIR` controla la configuración del usuario y por defecto coincide con el directorio de datos. En la instalación Windows, el programa vive en `%LOCALAPPDATA%\Programs\NextPlay` y los datos personales bajo `%LOCALAPPDATA%\NextPlay` (SQLite en `data/library.sqlite`, ajustes en `settings.json` y sesión en `codex/`). No mezcles perfiles de desarrollo, instalación y pruebas.
- Las pruebas que escriban deben usar un directorio temporal aislado con `NEXTPLAY_DATA_DIR` y, si afectan ajustes, `NEXTPLAY_USER_DIR`. Reutiliza los patrones de las pruebas existentes y restaura el entorno al terminar. No uses la biblioteca ni las cuentas reales para fixtures.
- Para migraciones o importaciones sobre datos personales, crea primero una copia consistente mediante `backupDatabase`/`VACUUM INTO`, o cierra la app antes de copiar su carpeta completa. Usa las transacciones y escrituras atómicas existentes; conserva los originales si hay corrupción o incompatibilidad.
- Las importaciones deben ser idempotentes y limitarse a los campos autorizados. Resuelve identidades ambiguas antes de asignar AppIDs; no escribas coincidencias aproximadas. No inventes fechas, opiniones ni horas: las fechas aproximadas requieren autorización y deben quedar marcadas. Verifica integridad (`PRAGMA integrity_check`) y conservación de los datos no afectados.
- Reutiliza `config`, `validateConnections` y `saveConnections`: omitir una credencial conserva su valor; eliminarla requiere la acción explícita prevista (`null`). La API devuelve presencia/estado, nunca los secretos. No registres claves, tokens, archivos de autenticación ni cuerpos que los contengan.
- No versiones ni distribuyas `.env.local`, otros `.env` con valores reales, `data/`, autenticación ni copias personales. Tampoco versiones `work/`, `outputs/`, `dist/` o cachés; los artefactos de distribución se generan mediante el empaquetador. `.env.example` sí se versiona y debe contener solo ejemplos sin secretos; respeta `.gitignore`.

## Límites de la API y servicios externos

- Mantén las validaciones de `server/api.ts`: host/origen, solicitudes JSON, tamaño del cuerpo y campos de entrada. Las mutaciones comparten `exclusive`; las actualizaciones y reinicios respetan el estado de operación/mantenimiento.
- Administrar credenciales, login, importaciones, actualizaciones o procesos requiere `canManage`. La confianza procede de la conexión loopback real que certifica `attestLocalPeer` en Vite y en el servidor de producción, además de las comprobaciones HTTP. No la sustituyas por `Host`, `Origin` o cabeceras reenviadas declaradas por el cliente.
- El acceso LAN es para una red privada de confianza, sin exposición a Internet. Activar inicio automático, firewall, login o instalar una actualización debe estar dentro de lo solicitado/autorizado; no lo ejecutes como efecto lateral de probar otra función. Usa los scripts existentes, que limitan la gestión a los procesos propios.
- Codex se integra mediante su CLI y sesión de ChatGPT; esta app no requiere `OPENAI_API_KEY`. Conserva el catálogo temporal de solo lectura, la paginación MCP, el filtrado previo y la validación de resultados contra candidatos reales. No incluyas SteamID ni credenciales en ese catálogo ni habilites comandos, conectores adicionales o acceso a la base personal para el modelo.
- Conserva cachés válidas ante fallos de Steam, IGDB o HLTB, respeta límites/reintentos y evita descargas completas al pedir una recomendación. HLTB es opcional; usa `NEXTPLAY_PYTHON` o `.venv-hltb` según el patrón existente, sin pasar credenciales al subproceso.

## Validación antes de entregar

- Para cambios de lógica, añade o ajusta la prueba de regresión más pequeña en la suite existente (`node:test` y `node:assert/strict`). No introduzcas otro framework ni pruebas que solo repliquen la implementación.
- Para cambios de código, ejecuta las pruebas pertinentes, `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run build` y `git diff --check`. Si cambias HLTB, ejecuta también `tests/hltb_test.py` con el Python configurado. Distingue fallos del cambio y fallos previos.
- Ejecuta lint al revisar código. **En la revisión del 17-09-2026, el lint global falla** por reglas de imágenes, imports, accesibilidad y React, entre otras. Vuelve a comprobarlo: no declares lint limpio ni suprimas reglas globales para ocultar errores. El resultado actual prevalece sobre esta nota.
- Los cambios de UI requieren interacción en navegador: recorrido afectado, guardar/cancelar y recarga cuando haya persistencia, más temas/responsive cuando corresponda. Un build correcto no demuestra que el servidor o los recursos HTML/JS/CSS funcionen.
- Para cambios solo de documentación, comprueba contenido, rutas/enlaces locales, formato del archivo y `git diff --check`; no hace falta reconstruir ni ejecutar toda la suite. La regla de Prettier previa a cada commit sigue siendo obligatoria.
- Evita comprobaciones reales de Codex y sincronizaciones sobre datos personales salvo que formen parte de la tarea autorizada. Informa de las pruebas no realizadas; una prueba offline o un PATH reducido no equivale a un servicio real ni a una máquina Windows limpia.

## Antes de cada commit (obligatorio)

Antes de crear **cualquier commit**, ejecuta siempre:

```sh
npm run format:prettier
```

En PowerShell puedes usar `npm.cmd run format:prettier`, que ejecuta el mismo script.

- Si Prettier modifica archivos, incluye **todos esos cambios** en el commit y revisa el diff resultante.
- Si el comando falla, **no crees el commit**. Corrige el problema y vuelve a ejecutarlo con éxito antes de continuar.
- Esta obligación se aplica a cada commit, incluidos los de documentación. `npm run format` (oxfmt) y `prettier --check` no sustituyen este paso.
- El script actual solo cubre `app`, `components`, `lib`, `scripts` y `tests`. Si editas `AGENTS.md`, `server/`, `docs/` u otros archivos admitidos fuera de ese glob, formatea además los archivos afectados con el Prettier local; por ejemplo, `npx --no-install prettier --write AGENTS.md`.
- Revisa los archivos preparados y `git diff --cached --check` antes del commit. Conserva los cambios previos ajenos al alcance, salvo el formato exigido arriba; no incluyas datos personales ni secretos.
- Haz commits, pushes y etiquetas dentro del alcance pedido. Comprueba rama y remoto antes de publicar; si necesitas una rama nueva, usa el prefijo `codex/`. Si falla el push después de un commit, comprueba el estado y el log antes de reintentar para no duplicarlo.

## Distribución de Windows

- Sigue [docs/windows-release.md](docs/windows-release.md) para compilar/publicar y [docs/windows-validation.md](docs/windows-validation.md) para conocer pruebas y límites documentados. Consulta el código y los resultados actuales antes de reutilizar conclusiones antiguas.
- Desarrollo y Actions pertenecen a `ivangonzalezsp/nextplay` (**público**). `ivangonzalezsp/nextplay-releases` es **público** y contiene únicamente material de distribución; nunca publiques allí el checkout ni el historial privado.
- **Publicar una etiqueta `v*` desde fuera de Actions activa el workflow de publicación pública.** La ejecución manual de **Release version** promociona `CHANGELOG.md` desde `## [Unreleased]` a `## [X.Y.Z] - fecha`, sincroniza `package.json` y `package-lock.json` y abre un PR `codex/release/vX.Y.Z`; después del merge, crea la etiqueta y despacha **Windows installer** sobre ella porque el push con `GITHUB_TOKEN` no activa otro workflow. El publicador usa esa sección como notas públicas.
- En cada versión del changelog, separa siempre los cambios en `### Features` y `### Correcciones de errores`; si una queda vacía, indícalo con `- Ninguno.`. Los archivos de `docs/releases/` anteriores son histórico.
- Reutiliza `npm.cmd run package:windows`, `npm.cmd run test:package -- RUTA_DEL_PAQUETE` y `scripts/test-installer.ps1` según la guía. Los runtimes y hashes se fijan en `packaging/windows-runtimes.json` y `packaging/requirements-windows.txt`; no eludas la lista de archivos permitidos, las licencias, los checksums ni las pruebas de conservación de datos.
- Una modificación de empaquetado o dependencias requiere comprobar el paquete arrancado y sus recursos, no solo el build del checkout. Usa instalaciones de ensayo; no instales ni actualices la aplicación personal para validar un cambio ajeno a ella.
