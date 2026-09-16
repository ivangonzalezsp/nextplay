#ifndef AppVersion
  #define AppVersion "0.2.0"
#endif
#ifndef SourceDir
  #error SourceDir must point to the validated application bundle
#endif

[Setup]
AppId={{D83571BE-DA05-4F34-8DE9-9174039C23A0}
AppName=Next Play
AppVersion={#AppVersion}
AppPublisher=Next Play
AppPublisherURL=https://github.com/ivangonzalezsp/nextplay-releases
AppSupportURL=https://github.com/ivangonzalezsp/nextplay-releases/issues
DefaultDirName={localappdata}\Programs\NextPlay
DefaultGroupName=Next Play
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
DisableDirPage=yes
DisableProgramGroupPage=yes
OutputBaseFilename=NextPlay-Setup-{#AppVersion}-x64
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern
CloseApplications=no
RestartApplications=no
Uninstallable=yes
CreateUninstallRegKey=not IsSmokeTest
UninstallDisplayName=Next Play
SetupLogging=yes

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SourceDir}\scripts\windows-install-check.ps1"; Flags: dontcopy

[InstallDelete]
Type: filesandordirs; Name: "{app}\dist"
Type: filesandordirs; Name: "{app}\node_modules"
Type: filesandordirs; Name: "{app}\runtime"
Type: filesandordirs; Name: "{app}\scripts"
Type: filesandordirs; Name: "{app}\server"
Type: filesandordirs; Name: "{app}\lib"

[Icons]
Name: "{userprograms}\Next Play"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\scripts\windows-launcher.ps1"""; WorkingDir: "{app}"; Check: not IsSmokeTest
Name: "{userdesktop}\Next Play"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\scripts\windows-launcher.ps1"""; WorkingDir: "{app}"; Check: not IsSmokeTest

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\scripts\windows-launcher.ps1"""; Description: "Abrir Next Play"; Flags: postinstall nowait skipifsilent runhidden; Check: not IsSmokeTest

[Code]
function IsSmokeTest: Boolean;
begin
  Result := ExpandConstant('{param:SMOKETEST|0}') = '1';
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ExitCode: Integer;
begin
  Result := '';
  if IsSmokeTest then exit;
  ExtractTemporaryFile('windows-install-check.ps1');
  if not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{tmp}\windows-install-check.ps1') + '" -UserDir "' + ExpandConstant('{param:USERDIR|{localappdata}\NextPlay}') + '"',
    '', SW_HIDE, ewWaitUntilTerminated, ExitCode) or (ExitCode <> 0) then
    Result := 'Termina la operacion en curso y cierra Next Play antes de instalar. Tus datos se conservan.';
end;

function InitializeUninstall: Boolean;
var
  ExitCode: Integer;
begin
  if IsSmokeTest then begin Result := True; exit; end;
  Result := Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\scripts\windows-install-check.ps1') + '" -Uninstall -AppRoot "' + ExpandConstant('{app}') + '"',
    '', SW_HIDE, ewWaitUntilTerminated, ExitCode) and (ExitCode = 0);
  if not Result then MsgBox('Termina la operacion en curso y cierra Next Play antes de desinstalar.', mbError, MB_OK);
end;
