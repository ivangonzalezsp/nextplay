param(
    [ValidateSet('Startup', 'Firewall', 'ImportFolder')][string] $Action,
    [ValidateSet('yes', 'no')][string] $Enabled = 'no',
    [ValidateRange(1, 65535)][int] $Port = 3001,
    [switch] $Elevated
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
$appRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if ($Action -eq 'ImportFolder') {
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = 'Cierra tu copia anterior y selecciona su carpeta de Next Play. Los originales se conservaran.'
    $dialog.ShowNewFolderButton = $false
    if ($dialog.ShowDialog() -eq 'OK') { Write-Output $dialog.SelectedPath }
    $dialog.Dispose()
    exit 0
}
if ($Action -eq 'Startup') {
    $shortcutPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'Next Play.lnk'
    if ($Enabled -eq 'yes') {
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
        $shortcut.Arguments = '-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $appRoot 'scripts\windows-launcher.ps1') + '" -Background'
        $shortcut.WorkingDirectory = $appRoot
        $shortcut.WindowStyle = 7
        $shortcut.Description = 'Next Play'
        $shortcut.Save()
    } elseif (Test-Path -LiteralPath $shortcutPath) {
        Remove-Item -LiteralPath $shortcutPath -Force
    }
    exit 0
}
if (-not $Elevated) {
    $arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" -Action Firewall -Enabled ' + $Enabled + ' -Port ' + $Port + ' -Elevated'
    $process = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -Verb RunAs -WindowStyle Hidden -Wait -PassThru
    exit $process.ExitCode
}
$ruleName = 'NextPlay-LocalNetwork'
Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
if ($Enabled -eq 'yes') {
    New-NetFirewallRule -Name $ruleName -DisplayName 'Next Play - red privada' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Program (Join-Path $appRoot 'runtime\node.exe') -Profile Private -RemoteAddress LocalSubnet | Out-Null
}
