param([switch] $Uninstall, [string] $AppRoot, [string] $UserDir)
$ErrorActionPreference = 'Stop'
$userData = if ($UserDir) { [IO.Path]::GetFullPath($UserDir) } else { Join-Path $env:LOCALAPPDATA 'NextPlay' }
$runtimeFile = Join-Path $userData 'runtime.json'
try {
    if (Test-Path -LiteralPath $runtimeFile) {
        $record = Get-Content -LiteralPath $runtimeFile -Raw | ConvertFrom-Json
        $url = [uri] $record.url
        if ($url.Scheme -ne 'http' -or $url.Host -ne '127.0.0.1') { exit 2 }
        $process = Get-Process -Id $record.pid -ErrorAction SilentlyContinue
        if ($process) {
            $health = Invoke-RestMethod -Uri ($record.url + '/api/health') -TimeoutSec 3
            if ($health.application -ne 'nextplay' -or $health.instance -ne $record.instance) { exit 2 }
            Invoke-RestMethod -Uri ($record.url + '/api/app/exit') -Method Post -ContentType 'application/json' -Body '{}' -TimeoutSec 15 | Out-Null
            $process.WaitForExit(15000) | Out-Null
            if (-not $process.HasExited) { exit 2 }
            Start-Sleep -Milliseconds 1200
        }
    }
    if ($Uninstall) {
        $shortcut = Join-Path ([Environment]::GetFolderPath('Startup')) 'Next Play.lnk'
        if (Test-Path -LiteralPath $shortcut) { Remove-Item -LiteralPath $shortcut -Force }
        if ($AppRoot -and (Get-NetFirewallRule -Name 'NextPlay-LocalNetwork' -ErrorAction SilentlyContinue)) {
            & (Join-Path $AppRoot 'scripts\windows-integration.ps1') -Action Firewall -Enabled no
        }
    } elseif (Test-Path -LiteralPath (Join-Path $userData 'data/library.sqlite')) {
        $backup = Join-Path $userData ('backups\before-install-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))
        New-Item -ItemType Directory -Path $backup -Force | Out-Null
        foreach ($name in @('data', 'settings.json', 'codex')) {
            $source = Join-Path $userData $name
            if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination $backup -Recurse }
        }
    }
    exit 0
} catch { exit 2 }
