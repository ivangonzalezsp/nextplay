# Validación de la primera distribución · 16 de septiembre de 2026

## Comprobado

- 58 pruebas automatizadas: biblioteca, recomendaciones, juegos manuales, historial, SQLite, credenciales, importación, origen HTTP, autenticación local y cancelación, cierre de procesos propios, actualizaciones y bloqueo durante operaciones.
- Comprobación de tipos y compilación de producción.
- Paquete con su propio Node 24.21.0, Codex 0.154.0 y Python 3.13.15; arranque con PATH sin herramientas de desarrollo, recursos HTML/JS/CSS accesibles y claves conservadas tras reiniciar.
- HLTB: pruebas offline con el Python empaquetado y consulta real de Portal (Steam AppID 400, HLTB 7230).
- EXE de Inno Setup ejecutado en Windows 11 x64, con perfil y carpeta de instalación de ensayo: supervisor de bandeja, segunda apertura, salida y reinicio.
- Actualización mediante el ayudante externo desde un EXE 0.1.9 de ensayo a 0.2.0, copia de seguridad, reapertura y comparación de las huellas de SQLite, configuración y un archivo de cuenta. La versión de ensayo utiliza el mismo código para probar el mecanismo.
- Desinstalador real ejecutado en el ensayo: elimina el programa y conserva los archivos personales con las mismas huellas. El modo de ensayo omite el registro de Windows, accesos directos y cambios de inicio/firewall.
- Interrupción, contenido alterado y exceso de tamaño al descargar: se rechazan y se eliminan los parciales, conservando el archivo anterior. Actualización con operación en curso: rechazada antes de descargar o cerrar.
- Importación sobre instalación vacía: juegos manuales, preferencias, historial y claves conservados; originales intactos; claves inválidas e instalación no vacía rechazadas.
- Revisión del asistente en el navegador: validación de errores, conexiones opcionales, opciones desactivadas inicialmente y finalización persistente.
- Repositorio de desarrollo privado y repositorio de descargas público. Empaquetado por lista de archivos admitidos y búsqueda de coincidencias con credenciales locales. No se distribuyen `.env`, datos, autenticación ni credenciales de publicación.

## Pendiente antes de ampliar el piloto

- Máquina o VM Windows limpia: instalación normal con accesos directos/registro, SmartScreen, inicio opcional con Windows y desinstalación normal. La prueba con PATH reducido se ha hecho en una máquina que tiene herramientas de desarrollo.
- Inicio de sesión real de ChatGPT en el asistente con una cuenta de prueba. Se han probado los estados de inicio/cancelación y el ejecutable empaquetado; no se ha conectado una cuenta real durante estas pruebas.
- Móvil físico y consentimiento de firewall: el rechazo por dirección real y origen se comprueba en las pruebas del servidor; falta el recorrido desde otro dispositivo y la creación de la regla privada en un equipo de prueba.
- Configurar `RELEASES_TOKEN`, limitado a `nextplay-releases`, para activar la publicación automática desde Actions. El propietario ha decidido configurarlo más adelante.

El lint global mantiene errores anteriores en componentes y pruebas (imports sin usar, imágenes, etiquetas y reglas de React); no se considera una validación superada. Las comprobaciones nuevas se revisan también con el linter.
