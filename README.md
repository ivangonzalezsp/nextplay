# Next Play

Web personal en español para elegir qué jugar. Se ejecuta únicamente en `127.0.0.1:3000` y utiliza tu sesión de **Codex con ChatGPT**, sin facturación de la API de OpenAI.

## Arranque

Necesitas Node.js 24 o posterior; Codex CLI es opcional si usas el algoritmo local. Desde esta carpeta:

```powershell
npm install
codex login
npm run check:codex
npm run dev
```

Abre [Next Play](http://127.0.0.1:3000). La carpeta y los scripts funcionan también después de cerrar Codex. Para usar una compilación local:

```powershell
npm run build
npm start
```

La web no se publica ni se abre a la red local. Mantén el PC encendido y el proceso activo. La distribución se adapta a pantallas pequeñas; esta primera versión no ofrece acceso desde otro dispositivo.

## Conectar tus datos

Completa `.env.local` con estas tres variables. `.env.example` contiene el formato sin secretos:

| Variable               | Procedencia                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `STEAM_API_KEY`        | [Steam Web API](https://steamcommunity.com/dev/apikey). Usa `localhost` como dominio de tu app personal.                                    |
| `TWITCH_CLIENT_ID`     | [Consola de Twitch](https://dev.twitch.tv/console/apps). Registra una aplicación de tipo **Confidential** y redirección `http://localhost`. |
| `TWITCH_CLIENT_SECRET` | Sección de gestión de esa misma aplicación de Twitch.                                                                                       |

No pegues claves en el chat ni las incluyas en Git. **No necesitas `OPENAI_API_KEY`.** La app relee `.env.local`; pulsa **Comprobar conexiones** y luego **Sincronizar Steam**. La presencia de una clave se indica en la interfaz; la sincronización verifica si la fuente la acepta.

El enlace inicial es [fineku](https://steamcommunity.com/id/fineku/). El perfil y los **detalles de juegos** deben ser públicos. Si la API no permite verlos, se conserva la última biblioteca y se muestra un error; esto se distingue de una biblioteca accesible con cero juegos. No se importan contraseñas ni cookies de Steam.

IGDB es opcional para leer la biblioteca, pero necesario para géneros, modos y descubrimientos. Si faltan metadatos, los filtros estrictos que los requieren excluyen esos juegos. La duración principal prioriza HowLongToBeat; cuando falta, utiliza la media hasta los créditos de IGDB si hay aportaciones. Nunca se interpreta como duración de una sesión. Las horas de Steam no determinan si te gustó o terminaste un juego.

### HowLongToBeat

Se utiliza [howlongtobeatpy](https://github.com/ScrappyCocco/HowLongToBeat-PythonAPI), mediante un proceso puntual de Python que inicia Node. No necesitas otro servidor ni credenciales de HLTB. La integración se ha probado con Python 3.12. Prepara el entorno desde esta carpeta (ya preparado en este PC):

```powershell
python -m venv .venv-hltb
.venv-hltb\Scripts\python.exe -m pip install -r requirements-hltb.txt
.venv-hltb\Scripts\python.exe tests/hltb_test.py
```

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

En **Tu biblioteca** puedes buscar por etiquetas y seleccionar una etiqueta para filtrar tus juegos propios o compartidos. La IA también puede consultar estas etiquetas mediante `query_games`: `query` busca fragmentos, `tag` coincide con el nombre completo en español o inglés (sin distinguir tildes o mayúsculas) y `tagIds` coincide con cualquiera de los IDs indicados. Se pueden combinar con los filtros y la paginación existentes. Los géneros de IGDB y las etiquetas de Steam conservan su significado separado; dos etiquetas con la misma traducción siguen teniendo IDs distintos.

La importación se ejecuta con `npm run sync:steam-tags` y se puede reanudar: guarda resultados por lotes en la tabla `steam_tags` de SQLite, conserva las etiquetas anteriores si Steam falla y registra los juegos sin etiquetas o sin una ficha disponible. `npm run sync:steam-tags -- --force` vuelve a consultar los juegos ya comprobados. Antes de escribir se crea una copia consistente en `data/backups`. Si Steam limita las consultas, respeta la espera indicada y detiene la importación si el límite persiste. No añade una descarga completa de etiquetas a cada recomendación. Las etiquetas guardadas sobreviven a las sincronizaciones de las bibliotecas. La fuente pública utilizada no tiene un contrato de API estable y puede cambiar.

### Tus gustos

La pestaña **Tus gustos** calcula un perfil provisional con todo el historial jugado o marcado como favorito que tenga metadatos en la BBDD. Las reglas están en `lib/tastes.ts`: una etiqueta de Steam aporta una señal de 1 (por ID, independiente del idioma, o por nombre), un género de IGDB 0,75, un modo multijugador 0,5 y una coincidencia solo en la descripción 0,25. Varias etiquetas de la misma afinidad no multiplican la señal. Son aproximaciones, no características confirmadas.

Las horas aportan `log(1 + horas) / log(501)`, con un máximo de 1 por juego. Si hay duración principal de HLTB o, en su defecto, IGDB, se toma el mayor entre ese peso y `0,8 × min(1, horas / duración)`, para que los juegos cortos también cuenten; no implica haberlos terminado. Un favorito aporta 2. Cada afinidad suma el peso de cada juego multiplicado por su señal y lo divide entre el peso total del historial con metadatos más 3, que modera las inferencias con pocas referencias. El resultado se muestra sobre 100: refleja presencia en el historial, no una probabilidad ni rechazo cuando es bajo. Los juegos sin jugar o sin metadatos no diluyen el perfil. Se muestra el número total de referencias y los cinco juegos con más peso, junto con las etiquetas o fuentes utilizadas. Se agrupan títulos con sufijos de edición reconocibles y coincidencias de ID de IGDB; las ediciones con nombres e identificadores distintos pueden requerir excluir sus horas manualmente.

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

## Control de versiones

El repositorio Git es local. La etiqueta `v0.1.0` identifica el punto de partida. El historial incluye el código y las dependencias declaradas; `.env.local`, `data/`, `node_modules/` y las compilaciones quedan excluidos.

Para ver los puntos guardados usa `git log --oneline --decorate`. Guarda cada cambio terminado con `git add .` y `git commit -m "Descripción del cambio"`. Si un commit introduce un fallo, `git revert <identificador>` crea otro commit que lo deshace conservando el historial. Puedes consultar el punto inicial sin modificar archivos con `git show v0.1.0`.

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
