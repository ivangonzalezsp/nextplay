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

El desarrollo y su historial permanecen en `ivangonzalezsp/nextplay`. Mientras ese repositorio sea privado, no debe considerarse el único medio público para obtener el código fuente correspondiente a una descarga.
