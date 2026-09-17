# Next Play

Web personal en español para elegir qué jugar de tu biblioteca de Steam. Puedes usar el algoritmo local sin IA o tu sesión de **Codex con ChatGPT**, sin configurar la API de OpenAI. Cada persona instala la app en su ordenador y utiliza sus propias cuentas y claves.

## Instalar en Windows

[**Descargar Next Play para Windows x64**](https://github.com/ivangonzalezsp/nextplay-releases/releases/latest)

1. Descarga **NextPlay-Setup-…-x64.exe**, ejecútalo y abre el acceso directo **Next Play**.
2. El asistente permite añadir tu perfil y clave de Steam e importar tus juegos. Steam Families, IGDB y ChatGPT son opcionales. Puedes usar el algoritmo local sin IA.
3. Si tienes una instalación anterior, ciérrala y selecciona **Importar instalación anterior** antes de configurar la nueva. Los datos originales se conservan; conecta ChatGPT de nuevo desde el asistente.

El instalador incluye Node, Codex y Python con HowLongToBeat: no necesitas Git, terminal ni instalar herramientas aparte. Cada persona conecta sus propias cuentas. Requiere Windows 10/11 de 64 bits. Esta primera distribución no tiene firma de código y Windows puede mostrar avisos o bloquearla.

### Abrir, cerrar y actualizar

El acceso directo inicia Next Play y abre el navegador. Una segunda apertura reutiliza la instancia. Cerrar la pestaña mantiene la aplicación activa; **Salir**, en su icono de bandeja, la cierra por completo.

En **Ajustes → Configurar cuentas y aplicación** puedes guardar conexiones, conectar o cancelar el inicio de sesión oficial de ChatGPT, buscar actualizaciones y activar opcionalmente el inicio con Windows. **Actualizar y reiniciar** descarga la versión pública, verifica SHA-256 y guarda una copia antes de instalar. Termina cualquier operación en curso primero. La búsqueda automática se limita a una vez al día.

El acceso empieza limitado al PC. **Permitir acceso desde mi red local** solicita permiso de Windows, reinicia Next Play y muestra la dirección para el móvil. La regla de firewall se limita al programa, a redes privadas y a la subred local. La gestión de credenciales, autenticación, actualizaciones y procesos sigue restringida al PC por conexión real y origen HTTP.

### Datos y privacidad

El programa está en `%LOCALAPPDATA%\Programs\NextPlay`; la biblioteca, configuración, sesión de Codex y copias están en `%LOCALAPPDATA%\NextPlay`. Las credenciales se guardan localmente; la API solo devuelve si están configuradas. Omitir una clave conserva su valor y eliminarla requiere una acción explícita. La desinstalación conserva tus datos. Para una copia manual, sal de Next Play y copia la carpeta completa.

El código y el historial permanecen en **ivangonzalezsp/nextplay**, privado. Los instaladores y notas se publican en **ivangonzalezsp/nextplay-releases**, público. Parte del código distribuido se puede inspeccionar. Consulta [compilación y publicación](docs/windows-release.md) para mantener este reparto.

## Desarrollo desde el código fuente

Las siguientes instrucciones son para quienes tienen acceso al repositorio privado. Para uso normal, utiliza el instalador de Windows.

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
- **Historial:** cada consulta completada conserva fecha, motor, filtros, mensaje, fichas y avisos en SQLite. Se puede abrir cualquier resultado anterior y marcar sus juegos. La conversación que exista al actualizar se incorpora automáticamente; las búsquedas borradas antes de esta función no se pueden recuperar.
- La conversación mantiene los filtros y los mensajes. Los cambios de filtros de la interfaz prevalecen sobre mensajes anteriores. Una nueva búsqueda, sincronización o corrección de preferencias reinicia las propuestas para evitar resultados obsoletos, conservando el historial. Cambiar entre Para hoy y Próximo juego o entre motores inicia otro contexto. Cada conversación de Codex admite 20 consultas; el historial no tiene ese límite ni se envía entero a la IA.
- Las propuestas principales proceden de tu biblioteca propia o compartida; los descubrimientos se etiquetan aparte y enlazan a Steam. Las referencias de IGDB deben incluir un enlace de aplicación de Steam cuyo AppID coincida; se descartan paquetes y referencias sin enlace verificable. No se consultan precios.

## Datos locales y conexión a Codex

`data/library.sqlite` es la base de datos local SQLite, usando el módulo nativo de Node.js. La tabla `games` guarda todos los juegos sincronizados, sus propietarios, horas y metadatos, con AppID único; `app_state` guarda perfil, grupo familiar, preferencias y conversación. Las actualizaciones se guardan juntas en una transacción. En el primer arranque se importa automáticamente `data/state.json` y se conserva ese archivo sin modificar como copia anterior a la migración. A partir de entonces SQLite es la fuente de los datos; editar el JSON antiguo no cambia la app. Un archivo corrupto produce un error sin reemplazar los originales.

`data/cache.json` conserva metadatos (7 días) y valoraciones (24 horas). La biblioteca se refresca al pedir recomendaciones si supera 24 horas. **Actualizar biblioteca y datos** fuerza una nueva lectura y marca las reseñas para actualizar, conservando las anteriores si falla la consulta. No hay tareas de fondo. Para hacer una copia actual completa, cierra el servidor y copia la carpeta `data`.

Codex recibe una muestra inicial de ocho juegos y acceso a `query_games`, una herramienta [MCP de lectura](https://developers.openai.com/codex/mcp/) para buscar, filtrar y paginar todos los candidatos elegibles. Ya no se recorta el catálogo a 40 juegos de biblioteca y 20 descubrimientos. Puede consultar nombres/descripciones, juegos propios o familiares, propietario, género, modo, duración, favoritos, juegos sin jugar y fichas por AppID. Cada página contiene hasta 50 juegos e indica `total` y `nextOffset`; el modelo decide qué búsquedas y páginas necesita, por lo que tener acceso a todos no significa leerlos todos en cada recomendación.

Cada consulta usa una copia SQLite temporal de los candidatos que cumplen los filtros y exclusiones, leída en modo solo lectura y eliminada al terminar. La IA recibe nombres de propietarios, nunca sus SteamID ni las claves de Steam/Twitch. Los comandos, otros conectores y la búsqueda web siguen desactivados. Se usa el ejecutable oficial de Codex, sesión efímera, autenticación con ChatGPT y salida JSON validada contra todo el catálogo elegible. Se comparte el cupo de tu cuenta de Codex.

La actualización de reseñas consulta como máximo 40 juegos de biblioteca y 20 descubrimientos por petición; ese límite solo afecta al trabajo de red, no al catálogo consultable. El resto conserva las reseñas disponibles y su fecha. HLTB mantiene su actualización gradual de hasta ocho juegos. Los logs `recommendations:database:ready` y `recommendations:codex:start` muestran los totales completos, y `codex:catalog:query` registra las consultas de la IA.

El modelo inicial es `gpt-5.6-luna`; puedes elegir el modelo y el esfuerzo de razonamiento junto a los filtros. La última selección usada en una consulta se conserva en `data/library.sqlite`. También puedes cambiar `NEXTPLAY_CODEX_MODEL` en `.env.local` por otro disponible en tu cuenta. Si Codex está instalado fuera de las ubicaciones habituales, configura `NEXTPLAY_CODEX_BIN` en el entorno con la ruta absoluta a su ejecutable nativo (`codex.exe` en Windows).

Si aparece «no puede localizar tu carpeta de usuario», ejecuta la aplicación desde una terminal normal de tu sesión de Windows. No copies archivos de autenticación ni uses otra cuenta. `codex login status` debe indicar **Logged in using ChatGPT**.

## Compartir Next Play

Comparte el [enlace público de descargas](https://github.com/ivangonzalezsp/nextplay-releases/releases/latest). Tus conocidos no necesitan acceso al repositorio privado ni autenticarse en GitHub para descargar o actualizar. Cada persona usa sus propias cuentas desde el asistente. No envíes la carpeta de desarrollo ni tu carpeta de datos personales.

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
