# Compilar y publicar el instalador

## Repositorios y credencial

- Desarrollo y Actions: `ivangonzalezsp/nextplay`, **privado**.
- Descargas: `ivangonzalezsp/nextplay-releases`, **público**. Solo README, instalador, SHA-256 y notas. Nunca publiques aquí el checkout del desarrollo.
- Crea un [personal access token fine-grained](https://github.com/settings/personal-access-tokens/new) cuyo propietario sea `ivangonzalezsp`, con **Only select repositories → nextplay-releases** y **Repository permissions → Contents: Read and write**. Utiliza una caducidad y renuévalo cuando corresponda.
- Guarda el valor como secreto de Actions **RELEASES_TOKEN** en el repositorio **privado**. No lo guardes en `.env`, en Git, en el repositorio público ni en los artefactos.

El token solo se entrega al último paso de publicación. `GITHUB_TOKEN` tiene `contents: read` en el repositorio privado. El publicador usa un borrador hasta completar ambas subidas; un intento fallido se puede reanudar mientras siga en borrador. Una versión ya pública es inmutable para este script.

## Publicar una versión

1. Cambia la versión de `package.json` y `package-lock.json` y añade `docs/releases/vX.Y.Z.md`, revisada para publicación pública.
2. Guarda y publica los cambios en el repositorio privado.
3. Crea y publica la etiqueta correspondiente, por ejemplo `git tag v0.2.1` y `git push origin v0.2.1`.
4. Actions ejecuta pruebas, tipos, compilación, HLTB con Python empaquetado, arranque del paquete y prueba del instalador. Después sube únicamente el EXE y `SHA256SUMS.txt` a la Release pública, junto con las notas.

La ejecución manual de **Windows installer** compila y guarda artefactos privados para revisión. Solo una ejecución sobre una etiqueta publica una Release. El README público se mantiene a partir de `packaging/RELEASES-README.md`.

## Compilación local en Windows x64

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
$env:NEXTPLAY_BUILD_PYTHON = (Get-Command python).Source
npm.cmd run package:windows
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-installer.ps1
```

Python solo es necesario en la máquina de compilación para resolver las ruedas fijadas; también se reconoce `.venv-hltb\Scripts\python.exe`. La máquina del usuario recibe Python embebido. Las versiones y SHA-256 de Node, Codex, Python e Inno Setup están en `packaging/windows-runtimes.json`; las dependencias de HLTB tienen versión y hash en `packaging/requirements-windows.txt`. El empaquetador instala Inno en modo portátil dentro de `work/windows/inno`.

El resultado queda en `outputs/windows`. El empaquetador usa una lista explícita de carpetas y conserva licencias; las pruebas buscan archivos personales y coincidencias con las claves locales antes de generar el EXE. `work`, `outputs`, datos, credenciales y cachés no se versionan. `npm.cmd run test:package -- RUTA_DEL_PAQUETE` comprueba los ejecutables con un PATH sin herramientas de desarrollo y un perfil temporal separado.

Las bibliotecas de interfaz se incluyen en `dist` durante la compilación y se declaran como `devDependencies`. El paquete instala las dependencias de ejecución desde el lockfile mediante [`npm ci --omit=dev --omit=peer`](https://docs.npmjs.com/cli/v11/commands/npm-ci/#omit). Esto evita duplicar miles de archivos sin trasladar una instalación de npm al equipo del usuario. No se cambian las versiones fijadas. Los avisos de las dependencias compiladas se reúnen en `licenses/JavaScript-NOTICES.txt`; el paquete también prueba una consulta real al proceso MCP que utiliza Codex.

Para comprobar la actualización pública entre dos versiones ya publicadas, ejecuta `scripts/test-installer.ps1 -PreviousInstaller RUTA_DEL_EXE_ANTERIOR -PublicUpdate`. Usa una instalación de ensayo, llama a la API normal de actualización y descarga anónimamente desde la Release pública. La versión del checkout debe coincidir con la última Release. Al comparar SQLite se verifican las filas guardadas para admitir migraciones de esquema sin confundirlas con pérdida de datos.

## Pruebas de aceptación antes de ampliar la distribución

Las pruebas automatizadas cubren importación SQLite, juegos manuales, preferencias e historial, conservación de claves, credenciales omitidas/eliminadas, origen/peer local, aplicación ocupada y descargas alteradas/interrumpidas. La prueba del paquete comprueba los recursos HTML/JS/CSS y arranque/salida/reinicio. La prueba del EXE utiliza `/SMOKETEST=1` y una carpeta bajo `work`, sin registro de desinstalación ni accesos directos del usuario; ejecuta el supervisor de bandeja, doble apertura, reinicio, actualización desde un instalador de ensayo 0.1.9 y desinstalación conservando datos. La versión de ensayo usa el mismo código para verificar el mecanismo, no representa una versión publicada anterior.

Completa también una prueba en una máquina o VM Windows sin herramientas de desarrollo: instalación normal, acceso directo, segunda apertura, icono de bandeja, salida, reinicio, inicio opcional con Windows, desinstalación conservando datos y una actualización entre dos versiones. Prueba un inicio de sesión real de ChatGPT y la consulta en vivo de las fuentes con las cuentas de prueba. Desde otro dispositivo, comprueba la biblioteca y el rechazo de la administración; comprueba que la regla de firewall solo permite el ejecutable de Next Play, perfil privado y subred local. Descarga y actualiza sin acceso al repositorio privado.

No confundas una comprobación sin herramientas en PATH con una VM limpia, ni las pruebas offline de HLTB con la disponibilidad de su servicio. Los primeros binarios no llevan firma de código; SmartScreen o la política del equipo pueden impedir su uso.
