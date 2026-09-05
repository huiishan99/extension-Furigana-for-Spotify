#ifndef AppVersion
  #error AppVersion must be provided with /DAppVersion=x.y.z
#endif
#ifndef SourceRoot
  #error SourceRoot must be provided with /DSourceRoot=path
#endif
#ifndef LauncherIconId
  #error LauncherIconId must be provided with /DLauncherIconId=hash
#endif
#ifndef OutputDir
  #error OutputDir must be provided with /DOutputDir=path
#endif
#ifndef ProjectRoot
  #error ProjectRoot must be provided with /DProjectRoot=path
#endif

#define AppName "Furigana for Spotify"
#define AppPublisher "Furigana for Spotify contributors"
#define AppUrl "https://github.com/huiishan99/spotify-furigana"
[Setup]
AppId={{9C85021E-83A3-4899-8E11-EA30A869B4F1}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
UninstallDisplayName={#AppName}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppUrl}
AppSupportURL={#AppUrl}/issues
AppUpdatesURL={#AppUrl}/releases/latest
DefaultDirName={localappdata}\Programs\Furigana for Spotify
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir={#OutputDir}
OutputBaseFilename=Furigana-for-Spotify-Setup-v{#AppVersion}
SetupIconFile={#ProjectRoot}\assets\launcher.ico
WizardSmallImageFile={#ProjectRoot}\assets\logo.png
UninstallDisplayIcon={app}\launcher-v{#AppVersion}-{#LauncherIconId}.ico
LicenseFile={#ProjectRoot}\LICENSE
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
SetupLogging=yes
CloseApplications=no
RestartApplications=no
VersionInfoVersion={#AppVersion}.0
VersionInfoCompany={#AppPublisher}
VersionInfoDescription={#AppName} installer
VersionInfoProductName={#AppName}
VersionInfoProductVersion={#AppVersion}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "chinesesimplified"; MessagesFile: "{#ProjectRoot}\packaging\languages\ChineseSimplified.isl"
Name: "japanese"; MessagesFile: "compiler:Languages\Japanese.isl"

[CustomMessages]
english.AdditionalOptions=Installation options:
english.AutoUpdateTask=Check verified GitHub releases automatically (recommended)
english.DesktopIconTask=Create a desktop shortcut
english.InstallingExtension=Installing and applying the Spotify extension...
english.LaunchProgram=Launch Furigana for Spotify
chinesesimplified.AdditionalOptions=安装选项：
chinesesimplified.AutoUpdateTask=自动检查经过校验的 GitHub 更新（推荐）
chinesesimplified.DesktopIconTask=创建桌面快捷方式
chinesesimplified.InstallingExtension=正在安装并应用 Spotify 插件……
chinesesimplified.LaunchProgram=启动 Furigana for Spotify
japanese.AdditionalOptions=インストール オプション:
japanese.AutoUpdateTask=検証済みの GitHub リリースを自動確認する（推奨）
japanese.DesktopIconTask=デスクトップ ショートカットを作成する
japanese.InstallingExtension=Spotify 拡張機能をインストールして適用しています...
japanese.LaunchProgram=Furigana for Spotify を起動する

[Tasks]
Name: "autoupdate"; Description: "{cm:AutoUpdateTask}"; GroupDescription: "{cm:AdditionalOptions}"
Name: "desktopicon"; Description: "{cm:DesktopIconTask}"; GroupDescription: "{cm:AdditionalOptions}"

[Files]
Source: "{#SourceRoot}\spotify-furigana\*"; DestDir: "{app}\spotify-furigana"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SourceRoot}\spotify-furigana\Furigana for Spotify.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceRoot}\spotify-furigana\launcher.ico"; DestDir: "{app}"; DestName: "launcher-v{#AppVersion}-{#LauncherIconId}.ico"; Flags: ignoreversion
Source: "{#SourceRoot}\install.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceRoot}\uninstall.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceRoot}\INSTALL.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceRoot}\LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceRoot}\THIRD_PARTY_NOTICES.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceRoot}\THIRD_PARTY_LICENSES\*"; DestDir: "{app}\THIRD_PARTY_LICENSES"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Furigana for Spotify"; Filename: "{app}\Furigana for Spotify.exe"; WorkingDir: "{localappdata}\Furigana for Spotify"; IconFilename: "{app}\launcher-v{#AppVersion}-{#LauncherIconId}.ico"; AppUserModelID: "FuriganaForSpotify.Launcher"
Name: "{autodesktop}\Furigana for Spotify"; Filename: "{app}\Furigana for Spotify.exe"; WorkingDir: "{localappdata}\Furigana for Spotify"; IconFilename: "{app}\launcher-v{#AppVersion}-{#LauncherIconId}.ico"; AppUserModelID: "FuriganaForSpotify.Launcher"; Tasks: desktopicon

[InstallDelete]
Type: files; Name: "{autoprograms}\Furigana for Spotify.lnk"

[Run]
Filename: "{app}\Furigana for Spotify.exe"; Description: "{cm:LaunchProgram}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\uninstall.ps1"" -NoLaunch -SkipShortcut"; Flags: runhidden waituntilterminated logoutput; RunOnceId: "RemoveSpicetifyExtension"

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
var
  PowerShellPath: String;
  InstallParameters: String;
  ResultCode: Integer;
begin
  if CurStep <> ssPostInstall then
    Exit;

  WizardForm.StatusLabel.Caption := CustomMessage('InstallingExtension');
  PowerShellPath := ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe');
  InstallParameters := '-NoProfile -ExecutionPolicy Bypass -File "' +
    ExpandConstant('{app}\install.ps1') + '" -NoLaunch -SkipShortcut';
  if not WizardIsTaskSelected('autoupdate') then
    InstallParameters := InstallParameters + ' -DisableAutoUpdate';

  if not Exec(PowerShellPath, InstallParameters, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    RaiseException('Windows could not start the Furigana installer.');
  if ResultCode <> 0 then
    RaiseException(Format('Furigana installation failed with exit code %d. See the Setup log for details.', [ResultCode]));
end;
