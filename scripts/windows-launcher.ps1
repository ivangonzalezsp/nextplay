param([switch] $Background, [string] $UserDir, [ValidateRange(1, 65535)][int] $Port = 3001)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$appRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if (-not $UserDir) { $UserDir = Join-Path $env:LOCALAPPDATA 'NextPlay' }
$UserDir = [IO.Path]::GetFullPath($UserDir)
$env:NEXTPLAY_USER_DIR = $UserDir
New-Item -ItemType Directory -Path (Join-Path $UserDir 'logs') -Force | Out-Null
$runtimePath = Join-Path $UserDir 'runtime.json'
$controlPath = Join-Path $UserDir 'control.json'
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$sha = [Security.Cryptography.SHA256]::Create()
$profileId = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($UserDir))).Replace('-', '').Substring(0, 16)
$mutex = New-Object Threading.Mutex($false, ('Local\NextPlay-' + $sid + '-' + $profileId))
$ownsMutex = $false
$tray = $null
$script:serverProcess = $null
$script:runtime = $null
$script:command = $null
$launchFailed = $false

function Read-RunningApp {
    $record = Get-Content -LiteralPath $runtimePath -Raw | ConvertFrom-Json
    $url = [uri] $record.url
    if ($url.Scheme -ne 'http' -or $url.Host -ne '127.0.0.1') { throw 'Direccion local no valida.' }
    $health = Invoke-RestMethod -Uri ($record.url + '/api/health') -TimeoutSec 2
    if ($health.application -ne 'nextplay' -or $health.instance -ne $record.instance) { throw 'La instancia no coincide.' }
    return $record
}
function Open-NextPlay {
    try {
        $record = Read-RunningApp
        Start-Process -FilePath $record.url
    } catch {
        [Windows.Forms.MessageBox]::Show('Next Play todavia no esta disponible. Espera unos segundos y vuelve a abrirla.', 'Next Play') | Out-Null
    }
}
try {
    try { $ownsMutex = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $ownsMutex = $true }
    if (-not $ownsMutex) {
        if (-not $Background) { Open-NextPlay }
        exit 0
    }
    if (Test-Path -LiteralPath $controlPath) { Remove-Item -LiteralPath $controlPath -Force }
    $node = Join-Path $appRoot 'runtime\node.exe'
    $entry = Join-Path $appRoot 'scripts\start-server.ts'
    $script:serverProcess = Start-Process -FilePath $node -ArgumentList ('"' + $entry + '" --installed --port ' + $Port) -WorkingDirectory $appRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $UserDir 'logs\server.log') -RedirectStandardError (Join-Path $UserDir 'logs\server-error.log')
    $deadline = [DateTime]::UtcNow.AddSeconds(60)
    while ([DateTime]::UtcNow -lt $deadline) {
        if ($script:serverProcess.HasExited) { throw 'El servidor no ha arrancado. El puerto puede estar ocupado; consulta los registros de Next Play.' }
        try {
            $script:runtime = Read-RunningApp
            if ($script:runtime.pid -eq $script:serverProcess.Id) { break }
        } catch { }
        Start-Sleep -Milliseconds 300
    }
    if (-not $script:runtime -or $script:runtime.pid -ne $script:serverProcess.Id) { throw 'Next Play ha tardado demasiado en arrancar.' }
    $tray = New-Object Windows.Forms.NotifyIcon
    $tray.Icon = [Drawing.SystemIcons]::Application
    $tray.Text = 'Next Play'
    $tray.Visible = $true
    $menu = New-Object Windows.Forms.ContextMenuStrip
    $openItem = $menu.Items.Add('Abrir Next Play')
    $openItem.add_Click({ Open-NextPlay })
    $exitItem = $menu.Items.Add('Salir')
    $exitItem.add_Click({
        try { Invoke-RestMethod -Uri ($script:runtime.url + '/api/app/exit') -Method Post -ContentType 'application/json' -Body '{}' -TimeoutSec 15 | Out-Null }
        catch { [Windows.Forms.MessageBox]::Show('Hay una operacion en curso. Termina la operacion y vuelve a salir.', 'Next Play') | Out-Null }
    })
    $tray.ContextMenuStrip = $menu
    $tray.add_DoubleClick({ Open-NextPlay })
    $timer = New-Object Windows.Forms.Timer
    $timer.Interval = 500
    $timer.add_Tick({
        if (-not $script:serverProcess.HasExited) { return }
        $timer.Stop()
        if (Test-Path -LiteralPath $controlPath) {
            try {
                $next = Get-Content -LiteralPath $controlPath -Raw | ConvertFrom-Json
                if ($next.token -eq $script:runtime.token -and @('exit', 'restart', 'update') -contains $next.action) { $script:command = $next }
            } catch { }
        }
        [Windows.Forms.Application]::ExitThread()
    })
    $timer.Start()
    if (-not $Background) { Open-NextPlay }
    [Windows.Forms.Application]::Run()
    $timer.Dispose()
    if (-not $script:command) { throw 'Next Play se ha cerrado inesperadamente. Puedes volver a abrirla desde su acceso directo.' }
    if ($script:command.action -eq 'update') {
        # Keep the single-instance mutex while the external helper replaces the application.
        $helper = Join-Path $UserDir 'updates\windows-update.ps1'
        $testFlag = if ($env:NEXTPLAY_INSTALLER_SMOKE_TEST -eq '1') { ' -SmokeTest' } else { '' }
        $updater = Start-Process -FilePath 'powershell.exe' -ArgumentList ('-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $helper + '" -AppRoot "' + $appRoot + '" -UserDir "' + $UserDir + '"' + $testFlag) -WindowStyle Hidden -Wait -PassThru
        $script:command.action = if ($updater.ExitCode -eq 0) { 'restart' } else { 'exit' }
    }
} catch {
    $launchFailed = $true
    if ($script:serverProcess -and -not $script:serverProcess.HasExited) { $script:serverProcess.Kill(); $script:serverProcess.WaitForExit(5000) | Out-Null }
    $_.Exception.Message | Set-Content -LiteralPath (Join-Path $UserDir 'logs\launcher-error.log') -Encoding UTF8
    if ($env:NEXTPLAY_INSTALLER_SMOKE_TEST -ne '1') { [Windows.Forms.MessageBox]::Show($_.Exception.Message + "`nRegistros: " + (Join-Path $UserDir 'logs'), 'Next Play') | Out-Null }
} finally {
    if ($tray) { $tray.Visible = $false; $tray.Dispose() }
    if ($ownsMutex) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
if ($launchFailed) { exit 1 }
if ($script:command -and $script:command.action -eq 'restart') {
    $backgroundFlag = if ($Background) { ' -Background' } else { '' }
    Start-Process -FilePath 'powershell.exe' -ArgumentList ('-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" -UserDir "' + $UserDir + '" -Port ' + $Port + $backgroundFlag) -WindowStyle Hidden
}
