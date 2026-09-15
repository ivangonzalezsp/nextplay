param(
  [ValidateSet('Install', 'Uninstall')]
  [string] $Action = 'Install'
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$startup = [Environment]::GetFolderPath('Startup')
$launcher = Join-Path $startup 'Next Play Production.vbs'

if ([string]::IsNullOrWhiteSpace($startup)) {
  throw 'Windows no ha devuelto la carpeta de inicio de sesion.'
}

if ($Action -eq 'Uninstall') {
  if (Test-Path -LiteralPath $launcher) {
    Remove-Item -LiteralPath $launcher -Force
  }
  Write-Output "Arranque automatico quitado: $launcher"
  exit 0
}

if (-not (Test-Path -LiteralPath (Join-Path $repo 'dist\server\index.js'))) {
  throw "No existe una compilacion de produccion en $repo. Ejecuta 'npm run build' antes de instalar el arranque automatico."
}

$escapedRepo = $repo.Replace('"', '""')
@"
' Next Play production startup
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "$escapedRepo"
shell.Run "cmd.exe /d /c npm.cmd run start:production", 0, False
"@ | Set-Content -LiteralPath $launcher -Encoding ASCII

Write-Output "Arranque automatico instalado: $launcher"
Write-Output 'La app arrancara en la red local en http://<IP-del-PC>:3001 al iniciar sesion en Windows.'
