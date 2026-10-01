param([switch] $SkipUpgrade, [string] $PreviousInstaller, [string] $CandidateInstaller, [switch] $PublicUpdate)
$ErrorActionPreference = 'Stop'
if ($PublicUpdate -and ($SkipUpgrade -or -not $PreviousInstaller)) { throw 'PublicUpdate requires a PreviousInstaller and an upgrade test.' }
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$testRoot = Join-Path $repoRoot ('work\install-tests\' + [guid]::NewGuid().ToString('N'))
$installed = Join-Path $testRoot 'app'
$profile = Join-Path $testRoot 'profile'
$stage = Join-Path $repoRoot 'work\windows\app'
$version = (Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json).version
$installer = Join-Path $repoRoot ('outputs\windows\NextPlay-Setup-' + $version + '-x64.exe')
if ($CandidateInstaller) {
    $installer = [IO.Path]::GetFullPath($CandidateInstaller)
    if ([IO.Path]::GetFileName($installer) -notmatch '^NextPlay-Setup-(\d+\.\d+\.\d+)-x64\.exe$') { throw 'Invalid candidate installer name.' }
    $version = $Matches[1]
}
New-Item -ItemType Directory -Path $testRoot, $profile -Force | Out-Null
$env:NEXTPLAY_INSTALLER_SMOKE_TEST = '1'
$runtimePath = Join-Path $profile 'runtime.json'
$launcher = $null
$record = $null
$utf8 = New-Object Text.UTF8Encoding($false)
function Write-Json($Path, $Value) { [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 40 -Compress), $utf8) }
function Assert($Condition, $Message) { if (-not $Condition) { throw $Message } }
function Read-Ready($PreviousInstance = '', [int] $TimeoutSeconds = 90) {
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        try {
            $candidate = Get-Content -LiteralPath $runtimePath -Raw | ConvertFrom-Json
            $health = Invoke-RestMethod -Uri ($candidate.url + '/api/health') -TimeoutSec 2
            if ($health.instance -eq $candidate.instance -and $health.instance -ne $PreviousInstance) { return $candidate }
        } catch { }
        Start-Sleep -Milliseconds 250
    }
    $errorLog = Join-Path $profile 'logs\server-error.log'
    if (Test-Path -LiteralPath $errorLog) { Get-Content -LiteralPath $errorLog -Tail 20 }
    throw 'Native launcher readiness timeout.'
}
function Start-App([switch] $Open) {
    $backgroundArgument = if ($Open) { '' } else { ' -Background' }
    return Start-Process -FilePath 'powershell.exe' -ArgumentList ('-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $installed 'scripts\windows-launcher.ps1') + '"' + $backgroundArgument + ' -UserDir "' + $profile + '" -Port ' + $port) -WindowStyle Hidden -PassThru
}
function Assert-Desktop {
    $electron = Join-Path $installed 'runtime\electron\electron.exe'
    if (-not (Test-Path -LiteralPath $electron)) { return }
    $open = Start-App -Open
    Assert ($open.WaitForExit(15000)) 'Opening the desktop did not reuse the supervisor.'
    Assert ($open.ExitCode -eq 0) 'Could not open the desktop.'
    $deadline = [DateTime]::UtcNow.AddSeconds(45)
    $desktop = $null
    while ([DateTime]::UtcNow -lt $deadline) {
        try {
            $candidate = Get-Content -LiteralPath (Join-Path $profile 'desktop-window.json') -Raw | ConvertFrom-Json
            if ($candidate.instance -eq $record.instance -and (Get-Process -Id $candidate.pid -ErrorAction SilentlyContinue)) { $desktop = $candidate; break }
        } catch { }
        Start-Sleep -Milliseconds 250
    }
    Assert ($null -ne $desktop) 'Packaged Electron window did not load the installed server.'
    Assert ($desktop.version -eq $version -and $desktop.electron -eq '44.5.1' -and -not $desktop.menu) 'Wrong desktop version or visible menu.'
    $duplicate = Start-App -Open
    Assert ($duplicate.WaitForExit(15000)) 'Second desktop opening failed.'
    Start-Sleep -Seconds 1
    $again = Get-Content -LiteralPath (Join-Path $profile 'desktop-window.json') -Raw | ConvertFrom-Json
    Assert ($again.pid -eq $desktop.pid) 'Second opening started another desktop window.'
    Assert ((Invoke-RestMethod -Uri ($record.url + '/api/app')).desktop) 'Installed server did not enable desktop updates.'
    if (Test-Path -LiteralPath (Join-Path $profile 'settings.json')) {
        Invoke-RestMethod -Uri ($record.url + '/api/app/appearance') -Method Post -ContentType 'application/json' -Body '{"language":"en","theme":"cinema-amber"}' | Out-Null
        $deadline = [DateTime]::UtcNow.AddSeconds(15)
        do {
            Start-Sleep -Milliseconds 250
            $applied = Get-Content -LiteralPath (Join-Path $profile 'desktop-window.json') -Raw | ConvertFrom-Json
        } while (-not $applied.appearance -and [DateTime]::UtcNow -lt $deadline)
        Assert ($applied.appearance.language -eq 'en' -and $applied.appearance.theme -eq 'cinema-amber') 'Electron did not recover browser preferences.'
    }
}
function Post($Path) { Invoke-RestMethod -Uri ($record.url + '/api/app/' + $Path) -Method Post -ContentType 'application/json' -Body '{}' -TimeoutSec 600 }
function Handoff-Candidate {
    $updates = Join-Path $profile 'updates'
    New-Item -ItemType Directory -Path $updates -Force | Out-Null
    $download = Join-Path $updates ([IO.Path]::GetFileName($installer))
    Copy-Item -LiteralPath $installer -Destination $download
    Copy-Item -LiteralPath (Join-Path $installed 'scripts/windows-update.ps1') -Destination $updates
    $downloadDigest = (Get-FileHash -LiteralPath $download).Hash.ToLower()
    # Offline handoff; PublicUpdate exercises the anonymous download through the application API.
    Post 'exit' | Out-Null
    Write-Json (Join-Path $profile 'control.json') @{ action = 'update'; token = $record.token; version = $version; installer = $download; digest = $downloadDigest }
}
function Assert-DesktopClosed {
    $path = Join-Path $profile 'desktop-window.json'
    if (-not (Test-Path -LiteralPath $path)) { return }
    $desktop = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    while ((Get-Process -Id $desktop.pid -ErrorAction SilentlyContinue) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 250 }
    Assert (-not (Get-Process -Id $desktop.pid -ErrorAction SilentlyContinue)) 'Exit left a desktop process running.'
}
function Install($Exe) {
    $timer = [Diagnostics.Stopwatch]::StartNew()
    $result = Start-Process -FilePath $Exe -ArgumentList ('/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP- /SMOKETEST=1 /DIR="' + $installed + '" /LOG="' + (Join-Path $testRoot 'install.log') + '"') -WindowStyle Hidden -Wait -PassThru
    Assert ($result.ExitCode -eq 0) 'Installer failed.'
    Write-Output ('Installed ' + [IO.Path]::GetFileName($Exe) + ' in ' + [Math]::Round($timer.Elapsed.TotalSeconds, 1) + ' seconds.')
}
function Saved-Hash($Name) {
    $path = Join-Path $profile $Name
    if ($Name -ne 'data/library.sqlite') { return (Get-FileHash -LiteralPath $path).Hash }
    # Schema migrations may change the SQLite file while preserving every saved row.
    $snapshot = @'
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
const db = new DatabaseSync(process.argv[1], { readOnly: true });
if (Object.values(db.prepare('PRAGMA integrity_check').get())[0] !== 'ok') throw new Error('Saved database integrity check failed.');
const rows = ['app_state', 'games', 'steam_tags'].map(table => db.prepare('SELECT * FROM ' + table + ' ORDER BY 1').all());
db.close();
console.log(createHash('sha256').update(JSON.stringify(rows)).digest('hex'));
'@
    $hash = & node --input-type=module -e $snapshot $path
    Assert ($LASTEXITCODE -eq 0) 'Could not verify saved database rows.'
    return $hash
}
try {
    if (-not $SkipUpgrade -and $PreviousInstaller) {
        Install ([IO.Path]::GetFullPath($PreviousInstaller))
    } elseif (-not $SkipUpgrade) {
        # Compile a previous test version from the same source to exercise replacement of a real EXE installation.
        $manifestPath = Join-Path $stage 'package.json'
        $originalManifest = [IO.File]::ReadAllText($manifestPath)
        try {
            $oldManifest = $originalManifest | ConvertFrom-Json
            $oldManifest.version = '0.1.9'
            Write-Json $manifestPath $oldManifest
            & (Join-Path $repoRoot 'work\windows\inno\ISCC.exe') '/Qp' '/DAppVersion=0.1.9' (('/DSourceDir=') + $stage) (('/O') + $testRoot) (Join-Path $repoRoot 'packaging\nextplay.iss')
            Assert ($LASTEXITCODE -eq 0) 'Previous-version test installer compilation failed.'
        } finally { [IO.File]::WriteAllText($manifestPath, $originalManifest, $utf8) }
        Install (Join-Path $testRoot 'NextPlay-Setup-0.1.9-x64.exe')
    } else { Install $installer }
    $previousVersion = (Get-Content -LiteralPath (Join-Path $installed 'package.json') -Raw | ConvertFrom-Json).version
    if (-not $SkipUpgrade) { Assert ($previousVersion -ne $version) 'The upgrade needs an earlier version.' }
    & node (Join-Path $repoRoot 'scripts\test-package.mjs') $installed
    Assert ($LASTEXITCODE -eq 0) 'Installed runtime check failed.'
    # Choose an unused loopback port without changing the user's running copy.
    $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
    $listener.Start(); $port = $listener.LocalEndpoint.Port; $listener.Stop()
    Write-Json (Join-Path $profile 'update-check.json') @{ checkedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
    $launcher = Start-App
    $record = Read-Ready
    if ($SkipUpgrade) { Assert-Desktop }
    $duplicate = Start-App
    Assert ($duplicate.WaitForExit(10000)) 'Second opening did not reuse the instance.'
    Assert ($duplicate.ExitCode -eq 0) 'Second opening failed.'
    Assert ((Read-Ready).pid -eq $record.pid) 'Second opening started another server.'
    $previousInstance = $record.instance
    Post 'restart' | Out-Null
    $record = Read-Ready $previousInstance
    if ($SkipUpgrade) { Assert-Desktop }
    Post 'exit' | Out-Null
    Start-Sleep -Seconds 3
    Assert-DesktopClosed
    Assert (-not (Get-Process -Id $record.pid -ErrorAction SilentlyContinue)) 'Exit left a server running.'
    if (-not $SkipUpgrade) {
        $seed = @'
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
const [app, profile] = process.argv.slice(1);
const { openDatabase, storeState } = await import(pathToFileURL(join(app, 'server/database.ts')));
const { EMPTY_STATE } = await import(pathToFileURL(join(app, 'lib/model.ts')));
mkdirSync(join(profile,'data'),{recursive:true});
const state = structuredClone(EMPTY_STATE);
state.games = [{ appId:-1,name:'Preserved manual game',platform:'Switch',owned:true,playtimeMinutes:null,recentMinutes:null }];
state.preferences = {'-1':{favorite:true,status:'completed'}};
state.playHistory = [{appId:-1,name:'Preserved manual game',kind:'completed',at:123}];
state.history = [{id:'saved',text:'History sentinel',filters:state.filters,result:{at:1,message:'Saved',owned:[],discoveries:[],warnings:[]}}];
const db = openDatabase(join(profile,'data/library.sqlite'));
storeState(db,state); db.close();
writeFileSync(join(profile,'settings.json'),JSON.stringify({onboardingComplete:true,connections:{STEAM_API_KEY:'0123456789abcdef0123456789abcdef'}}));
mkdirSync(join(profile,'codex'),{recursive:true});
writeFileSync(join(profile,'codex/preservation-test.txt'),'Account data sentinel');
'@
        & (Join-Path $installed 'runtime\node.exe') --input-type=module -e $seed $installed $profile
        Assert ($LASTEXITCODE -eq 0) 'Could not seed isolated personal data.'
        $hashes = @{}
        foreach ($name in @('data/library.sqlite', 'settings.json', 'codex/preservation-test.txt')) { $hashes[$name] = Saved-Hash $name }
        $launcher = Start-App
        $record = Read-Ready $record.instance
        Assert ($record.version -eq $previousVersion) 'Expected the earlier version.'
        if ($PublicUpdate) {
            Post 'update' | Out-Null
        } else { Handoff-Candidate }
        $record = Read-Ready $record.instance 600
        Assert ($record.version -eq $version) 'The update did not reopen the new version.'
        Assert-Desktop
        $desktopBeforeRestart = Get-Content -LiteralPath (Join-Path $profile 'desktop-window.json') -Raw | ConvertFrom-Json
        $previousInstance = $record.instance
        Post 'restart' | Out-Null
        $record = Read-Ready $previousInstance
        Assert-Desktop
        Assert (-not (Get-Process -Id $desktopBeforeRestart.pid -ErrorAction SilentlyContinue)) 'Restart left the earlier desktop process running.'
        if (-not $PublicUpdate) {
            # Reinstall the unpublished candidate with Electron open to check updater file locks.
            $desktopBeforeUpdate = Get-Content -LiteralPath (Join-Path $profile 'desktop-window.json') -Raw | ConvertFrom-Json
            Handoff-Candidate
            $record = Read-Ready $record.instance 600
            Assert-Desktop
            Assert (-not (Get-Process -Id $desktopBeforeUpdate.pid -ErrorAction SilentlyContinue)) 'Update left the earlier desktop process running.'
            $backup = Get-ChildItem -LiteralPath (Join-Path $profile 'backups') -Directory | Sort-Object Name -Descending | Select-Object -First 1
            Assert (Test-Path -LiteralPath (Join-Path $backup.FullName 'electron')) 'Desktop session backup missing.'
            Assert (Test-Path -LiteralPath (Join-Path $backup.FullName 'desktop-appearance.json')) 'Browser preference backup missing.'
        }
        $restored = Invoke-RestMethod -Uri ($record.url + '/api/state') -TimeoutSec 30
        Assert ($restored.games[0].appId -eq -1 -and $restored.preferences.'-1'.favorite) 'The updated application cannot read its saved manual game.'
        Assert ($restored.history[0].id -eq 'saved' -and $restored.playHistory[0].kind -eq 'completed') 'The updated application cannot read its saved history.'
        Post 'exit' | Out-Null
        Start-Sleep -Seconds 3
        Assert-DesktopClosed
        foreach ($name in $hashes.Keys) { Assert ((Saved-Hash $name) -eq $hashes[$name]) ('Update changed personal data: ' + $name) }
        Assert ((Get-ChildItem -LiteralPath (Join-Path $profile 'backups') -Directory).Count -ge 1) 'Update backup missing.'
    }
    $uninstaller = Join-Path $installed 'unins000.exe'
    $removed = Start-Process -FilePath $uninstaller -ArgumentList '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SMOKETEST=1' -WindowStyle Hidden -Wait -PassThru
    Assert ($removed.ExitCode -eq 0) 'Uninstall failed.'
    Assert (-not (Test-Path -LiteralPath (Join-Path $installed 'runtime/node.exe'))) 'Uninstall left the application installed.'
    if (-not $SkipUpgrade) {
        foreach ($name in $hashes.Keys) { Assert ((Saved-Hash $name) -eq $hashes[$name]) ('Uninstall changed personal data: ' + $name) }
    }
    Write-Output ('Windows installer checks passed (upgrade: ' + (-not $SkipUpgrade) + '; public download: ' + [bool]$PublicUpdate + '): ' + $testRoot)
} finally {
    if ($record) {
        try { Post 'exit' | Out-Null } catch { }
    }
    if ($launcher -and -not $launcher.HasExited) { $launcher.WaitForExit(5000) | Out-Null }
    if ($launcher -and -not $launcher.HasExited) { $launcher.Kill() }
    Remove-Item Env:\NEXTPLAY_INSTALLER_SMOKE_TEST -ErrorAction SilentlyContinue
}
