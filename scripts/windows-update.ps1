param([Parameter(Mandatory)][string] $AppRoot, [Parameter(Mandatory)][string] $UserDir, [switch] $SmokeTest)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$AppRoot = [IO.Path]::GetFullPath($AppRoot)
$UserDir = [IO.Path]::GetFullPath($UserDir)
$statusPath = Join-Path $UserDir 'last-update.json'
try {
    $control = Get-Content -LiteralPath (Join-Path $UserDir 'control.json') -Raw | ConvertFrom-Json
    $runtime = Get-Content -LiteralPath (Join-Path $UserDir 'runtime.json') -Raw | ConvertFrom-Json
    if ($control.action -ne 'update' -or $control.token -ne $runtime.token -or $control.version -notmatch '^\d+\.\d+\.\d+$') { throw 'Solicitud de actualizacion no valida.' }
    $installer = [IO.Path]::GetFullPath($control.installer)
    $expected = Join-Path (Join-Path $UserDir 'updates') ('NextPlay-Setup-' + $control.version + '-x64.exe')
    if ($installer -ne $expected -or (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash -ne $control.digest) { throw 'El instalador no coincide con la descarga verificada.' }
    $backup = Join-Path $UserDir ('backups\before-' + $control.version + '-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss'))
    New-Item -ItemType Directory -Path $backup -Force | Out-Null
    foreach ($name in @('data', 'settings.json', 'codex')) {
        $source = Join-Path $UserDir $name
        if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination $backup -Recurse }
    }
    $arguments = '/SILENT /SUPPRESSMSGBOXES /NORESTART /SP- /NOICONS /UPDATE=1 /DIR="' + $AppRoot + '" /USERDIR="' + $UserDir + '" /LOG="' + (Join-Path $UserDir 'logs\update.log') + '"'
    if ($SmokeTest) { $arguments += ' /SMOKETEST=1' }
    $process = Start-Process -FilePath $installer -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw 'La instalacion no se ha completado. Tus datos y la copia de seguridad se conservan. Ejecuta de nuevo el instalador para reintentar.' }
    @{ version = $control.version; at = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding UTF8
    # The supervisor releases its single-instance mutex and reopens the application.
    exit 0
} catch {
    $message = 'No se ha completado la actualizacion. Tus datos estan guardados. Puedes abrir Next Play o ejecutar de nuevo el instalador. Registros: ' + (Join-Path $UserDir 'logs\update.log')
    @{ error = $message } | ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding UTF8
    if (-not $SmokeTest) { [Windows.Forms.MessageBox]::Show($message, 'Next Play') | Out-Null }
    exit 1
}
