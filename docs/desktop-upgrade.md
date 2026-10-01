# Actualización de Windows a la app de escritorio

Esta transición se publicará como **Next Play 1.0.0**, con incremento `major` desde 0.9.1. Cambia el arranque de la instalación Windows del navegador a una ventana Electron; conserva el contrato de datos personales. El candidato de CI ensaya el salto 0.9.1 → 1.0.0, sin publicar la versión.

El instalador mantiene su AppId, nombre y carpeta de programa. El supervisor existente abre el Electron incluido, conserva el inicio automático opcional y el acceso LAN, y cierra la ventana antes de reiniciar, actualizar o salir. Cerrar solo la ventana deja disponible el servidor en la bandeja; «Salir» en la bandeja detiene la aplicación.

Los datos siguen en `%LOCALAPPDATA%\NextPlay`: `data/library.sqlite`, `settings.json` y `codex/`. No se copia el perfil de desarrollo. Electron guarda su sesión y preferencias en `electron/` dentro de la misma carpeta personal. El ayudante de actualización respalda también esa carpeta y `desktop-appearance.json`; el desinstalador conserva el perfil.

Al abrir por primera vez una instalación anterior que contiene `settings.json`, se abre una pestaña en el navegador predeterminado, con el mismo origen local utilizado antes. Esa página lee únicamente `nextplay-language` y `nextplay-theme` y los envía a la API local. Electron los importa una vez; los cambios posteriores en su configuración prevalecen. La pestaña muestra cuándo puede cerrarse. Si las preferencias estaban en otro navegador o en otro origen/puerto, ese navegador debe abrir esa misma URL. Las cuentas y los historiales no dependen de esta recuperación. Una instalación nueva no abre esta pestaña.

La API exige administración por conexión loopback real, valida los dos valores y rechaza cualquier otro campo. La primera transferencia es idempotente y no modifica `settings.json` ni credenciales. No se intenta leer las carpetas privadas de otros navegadores.

## To-do de aceptación

- [x] Electron fijado por versión y SHA-256 oficial, con sus licencias incluidas.
- [x] Acceso directo y supervisor compatibles con la instalación anterior.
- [x] Perfil existente y actualizador Windows reutilizados; prototipo de desarrollo aislado.
- [x] Recuperación de idioma/color y prueba de validación, acceso remoto y escritura única.
- [x] Paquete arrancado sin herramientas de desarrollo en PATH.
- [x] Actualización aislada desde el EXE público 0.9.1, con backup y conservación de biblioteca, juegos manuales, historiales, cuentas y ajustes.
- [x] Ventana Electron empaquetada, recuperación de idioma/color, doble apertura, reinicio, actualización con la ventana abierta, salida y desinstalación.
- [x] Instalación nueva aislada.
- [x] CI preparada para generar el EXE candidato, probar la actualización desde 0.9.1 y la instalación nueva, sin publicación pública. El workflow **Windows installer nightly** lo ejecuta cada noche sobre `main` y también admite lanzamiento manual; las PR solo ejecutan las comprobaciones de código y Docker.

El ensayo local del 1 de octubre de 2026 usa el EXE público 0.9.1 y un candidato 0.10.0. Verifica SHA-256 del instalador anterior e integridad de SQLite, y sustituye la descarga de la versión futura por una transferencia offline al ayudante existente. También reinstala el candidato con Electron abierto para verificar el cierre antes de reemplazar archivos y el respaldo de sus preferencias. No prueba la descarga pública de una versión aún no publicada ni conecta cuentas reales.

Los EXE candidatos de la nightly usan una versión de ensayo superior; no cambian `package.json` en Git ni publican una release. Publicar exige el flujo de [Windows release](windows-release.md). Las pruebas locales no sustituyen una VM limpia ni validan instaladores para Linux/macOS.
