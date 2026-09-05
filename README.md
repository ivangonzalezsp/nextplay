# Next Play

Web personal en español para elegir qué jugar. Se ejecuta únicamente en `127.0.0.1:3000` y utiliza tu sesión de **Codex con ChatGPT**, sin facturación de la API de OpenAI.

## Arranque

Necesitas Node.js 24 o posterior y Codex CLI instalado. Desde esta carpeta:

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

IGDB es opcional para leer la biblioteca, pero necesario para géneros, modos, duración y descubrimientos. Si faltan metadatos, los filtros estrictos que los requieren excluyen esos juegos. Las duraciones usan la media hasta los créditos de IGDB cuando hay aportaciones; nunca se interpretan como duración de una sesión. Las horas de Steam no determinan si te gustó o terminaste un juego.

## Uso

### Steam Families

La conexión familiar utiliza `STEAM_FAMILY_TOKEN`, el valor `webapi_token` de [tu sesión oficial de Steam](https://store.steampowered.com/pointssummary/ajaxgetasyncconfig). Guárdalo en `.env.local` junto a `STEAM_API_KEY`. Son credenciales distintas. La app comprueba que el token corresponde al perfil conectado; nunca lo devuelve al navegador ni lo envía a Codex.

Pulsa **Comprobar conexiones** y **Conectar Steam Families**. Se importan automáticamente las bibliotecas del grupo, incluso si sus perfiles no son públicos. En **Tu biblioteca** puedes filtrar los juegos propios, los compartidos o los de cada miembro. Los duplicados se unen mediante AppID y tus preferencias se conservan. Las horas importadas pertenecen al perfil conectado, no a los propietarios de las copias.

Steam decide qué títulos admite en préstamo. Los excluidos y los juegos que el propietario marca como privados no se importan como compartidos. Las recomendaciones familiares cuentan entre las tres opciones de tu biblioteca, nunca como descubrimientos. No se comprueba si otra persona está usando la última copia disponible en ese instante.

La biblioteca familiar se refresca después de 24 horas al pedir recomendaciones, y también con **Actualizar Steam Families**. Si el token caduca o Steam falla, se conserva la última lectura y se indica el problema. Si Steam confirma que ya no perteneces a un grupo, se retiran los préstamos y se mantienen las preferencias. Esta integración utiliza servicios de Steam Families sin un contrato público estable y puede requerir ajustes si Steam cambia su interfaz.

### Recomendaciones

- **Para hoy:** tiempo de sesión y lo que te apetece. La adecuación a ese tiempo es una valoración orientativa.
- **Próximo juego:** selección para varias sesiones, con un límite opcional de horas de historia.
- En **Tu biblioteca**, marca favoritos y estados. Terminados y abandonados se excluyen salvo que actives la opción de incluirlos. «No me interesa» siempre se excluye.
- La conversación mantiene los filtros y los mensajes. Los cambios de filtros de la interfaz prevalecen sobre mensajes anteriores. Una nueva búsqueda, sincronización o corrección de preferencias reinicia las propuestas para evitar resultados obsoletos. Cada conversación admite 20 consultas.
- Las propuestas principales proceden de tu biblioteca propia o compartida; los descubrimientos se etiquetan aparte y enlazan a Steam. Las referencias de IGDB deben incluir un enlace de aplicación de Steam cuyo AppID coincida; se descartan paquetes y referencias sin enlace verificable. No se consultan precios.

## Datos locales y conexión a Codex

`data/state.json` conserva el perfil, biblioteca, preferencias y conversación. `data/cache.json` conserva metadatos (7 días) y valoraciones (24 horas). La biblioteca se refresca al pedir recomendaciones si supera 24 horas. **Actualizar biblioteca y datos** fuerza una nueva lectura y marca las reseñas para actualizar, conservando las anteriores si falla la consulta. No hay tareas de fondo. Las escrituras son atómicas; los archivos corruptos se conservan y producen un error en lugar de reemplazarse.

El servidor envía a Codex únicamente candidatos, preferencias y conversación, nunca las claves de Steam o Twitch. Utiliza el ejecutable oficial, entrada estándar, sesión efímera, autenticación forzada a ChatGPT y salida JSON validada. Las herramientas de comandos, conectores y búsqueda web están desactivadas. Se comparte el cupo de tu cuenta de Codex.

El modelo inicial es `gpt-5.6-luna`; puedes cambiar `NEXTPLAY_CODEX_MODEL` en `.env.local` por otro disponible en tu cuenta. Si Codex está instalado fuera de las ubicaciones habituales, configura `NEXTPLAY_CODEX_BIN` en el entorno con la ruta absoluta a su ejecutable nativo (`codex.exe` en Windows).

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

Las dos últimas órdenes usan Codex y consumen cupo. La prueba del flujo comprueba ambos modos y una continuación con una biblioteca ficticia aislada. Las demás pruebas no llaman a servicios externos: comprueban perfiles, bibliotecas privadas/vacías, fallos de red, exclusiones, propiedad, límites de duración, IDs inventados, conservación de contexto, protección del servidor local y persistencia tras reiniciar.

La interfaz expone herramientas WebMCP opcionales para consultar el estado y pedir recomendaciones con los mismos filtros visibles. Los navegadores sin WebMCP funcionan normalmente.

Fuentes: [Steam Player Service](https://partner.steamgames.com/doc/webapi/IPlayerService), [reseñas de Steam](https://partner.steamgames.com/doc/store/getreviews), [IGDB](https://api-docs.igdb.com/), [Codex](https://learn.chatgpt.com/docs/codex-sdk).
