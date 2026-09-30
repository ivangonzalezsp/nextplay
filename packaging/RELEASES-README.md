# Next Play · Windows downloads

[🇬🇧 English](#english) · [🇪🇸 Español](#espanol)

<a id="english"></a>

[**Download the latest version**](https://github.com/ivangonzalezsp/nextplay-releases/releases/latest)

Next Play helps you choose what to play from your library. Use the local algorithm or connect your own ChatGPT account for AI recommendations.

## Install and get started

1. Download **NextPlay-Setup-…-x64.exe** from the latest release.
2. Run the installer and open **Next Play** using the shortcut.
3. Follow the setup wizard: add your Steam profile link and Steam Web API key. Your profile and game details must be public.
4. Import your games. Steam Families, IGDB and ChatGPT are optional connections.

You need 64-bit Windows 10/11 and an Internet connection for external sources. Git, Node, Python and Codex do not need to be installed separately. The local algorithm uses your saved library without consuming AI usage.

## Everyday use and updates

- The shortcut opens your browser. You can open it several times: the same running instance is reused.
- Closing the tab keeps Next Play running. To stop it, select **Exit** from its Windows system tray icon.
- In **Settings → Set up accounts and app**, you can change connections, enable startup with Windows and check for updates.
- **Update and restart** verifies the download, saves a backup and reopens the application. Finish any synchronization or recommendations before updating.
- **Allow access from my local network** displays the address for your phone. Enable it only on a trusted private network. Account management, sign-in and updates are handled from the PC.

Menu labels appear in the selected application language. Older versions may display them in Spanish.

## Your data

The application is installed in `%LOCALAPPDATA%\Programs\NextPlay`. Your library, manual games, history, connections and backups are stored in `%LOCALAPPDATA%\NextPlay`. Uninstalling keeps this folder. To make a manual backup, exit the application and copy the entire folder.

If you previously ran Next Play from its source code, close the previous application and select **Import previous installation** when opening the setup wizard for the first time. Choose the folder containing `package.json`; the originals are preserved. Then connect ChatGPT through the wizard. Importing is only available before configuring a new installation.

Each person uses their own accounts. Do not publish keys, data folders or logs containing personal information when reporting an issue.

## Pilot release

The first installers are distributed **without a code signature**. Windows may warn that the publisher is unknown or block them; some managed computers do not allow them to run. Download only from this repository's Releases.

Each release includes `SHA256SUMS.txt` and its release notes. This check detects incomplete or altered downloads, but does not replace a digital signature. If an update fails, your data and backups are preserved: reopen the app or run the official installer again. Logs are stored in `%LOCALAPPDATA%\NextPlay\logs`.

## License and source code

Next Play's original code is distributed under the [GNU General Public License, version 3](https://www.gnu.org/licenses/gpl-3.0.html). The corresponding source code for each distributed installer must be available to its recipients. Third-party dependencies and components retain their own licenses and terms; their notices are included in the installation.

The source code and development history are available in the public [ivangonzalezsp/nextplay](https://github.com/ivangonzalezsp/nextplay) repository.

---

<a id="espanol"></a>

[🇬🇧 English](#english) · [🇪🇸 Español](#espanol)

# Next Play · descargas para Windows

[**Descargar la última versión**](https://github.com/ivangonzalezsp/nextplay-releases/releases/latest)

Next Play te ayuda a elegir qué jugar de tu biblioteca. Usa el algoritmo local o conecta tu propia cuenta de ChatGPT para pedir recomendaciones con IA.

## Instalar y empezar

1. Descarga el archivo **NextPlay-Setup-…-x64.exe** de la última versión.
2. Ejecuta el instalador y abre **Next Play** desde el acceso directo.
3. Sigue el asistente: añade tu enlace de perfil de Steam y tu clave de Steam Web API. El perfil y los detalles de juegos deben ser públicos.
4. Importa tus juegos. Steam Families, IGDB y ChatGPT son conexiones opcionales.

Necesitas Windows 10/11 de 64 bits y conexión a Internet para las fuentes externas. Git, Node, Python y Codex no requieren instalación por separado. El algoritmo local utiliza la biblioteca guardada sin consumir IA.

## Uso diario y actualizaciones

- El acceso directo abre el navegador. Puedes abrirlo varias veces: se reutiliza la misma instancia.
- Cerrar la pestaña mantiene Next Play activa. Para detenerla, pulsa **Salir** en su icono de bandeja de Windows.
- En **Ajustes → Configurar cuentas y aplicación** puedes cambiar conexiones, activar el inicio con Windows y buscar actualizaciones.
- **Actualizar y reiniciar** verifica la descarga, guarda una copia y vuelve a abrir la aplicación. Termina las sincronizaciones o recomendaciones antes de actualizar.
- **Permitir acceso desde mi red local** muestra la dirección para el móvil. Actívalo solo en una red privada de confianza. La gestión de cuentas, inicio de sesión y actualizaciones se realiza desde el PC.

## Tus datos

El programa se instala en `%LOCALAPPDATA%\Programs\NextPlay`. La biblioteca, los juegos manuales, el historial, las conexiones y las copias se guardan en `%LOCALAPPDATA%\NextPlay`. La desinstalación conserva esta carpeta. Para una copia manual, sal de la aplicación y copia la carpeta completa.

Si ya usabas Next Play desde el código, cierra la aplicación anterior y selecciona **Importar instalación anterior** al abrir el asistente por primera vez. Elige la carpeta que contiene `package.json`; los originales se conservan. Después conecta ChatGPT desde el asistente. La importación solo se permite antes de configurar una instalación nueva.

Cada persona utiliza sus propias cuentas. No publiques claves, carpetas de datos ni registros con información personal al comunicar un problema.

## Versión piloto

Los primeros instaladores se distribuyen **sin firma de código**. Windows puede advertir que el editor es desconocido o bloquearlos; algunos equipos administrados no permiten su ejecución. Descarga solo desde las Releases de este repositorio.

Cada versión incluye `SHA256SUMS.txt` y sus notas. Esta comprobación detecta descargas incompletas o alteradas, pero no sustituye una firma digital. Si una actualización falla, tus datos y copias se conservan: vuelve a abrir la app o ejecuta de nuevo el instalador oficial. Los registros están en `%LOCALAPPDATA%\NextPlay\logs`.

## Licencia y código fuente

El código original de Next Play se distribuye bajo la [GNU General Public License, versión 3](https://www.gnu.org/licenses/gpl-3.0.html). Para cada instalador distribuido, el código fuente correspondiente debe estar disponible para quien lo reciba. Las dependencias y componentes de terceros conservan sus propias licencias y condiciones; sus avisos están dentro de la instalación.

El código fuente y el historial de desarrollo están disponibles en el repositorio público [ivangonzalezsp/nextplay](https://github.com/ivangonzalezsp/nextplay).
