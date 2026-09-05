import { execFileSync } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("Windows release installer", () => {
  let installer = "";
  let launcher = "";
  let overlay = "";
  let overlayCore = "";
  let uninstaller = "";
  let nativeLauncher = "";
  let setup = "";
  let packager = "";
  let releaseWorkflow = "";

  beforeAll(async () => {
    [
      installer,
      launcher,
      overlay,
      overlayCore,
      uninstaller,
      nativeLauncher,
      setup,
      packager,
      releaseWorkflow,
    ] = await Promise.all([
      readFile(resolve(projectRoot, "packaging", "install.ps1"), "utf8"),
      readFile(resolve(projectRoot, "packaging", "launcher.ps1"), "utf8"),
      readFile(resolve(projectRoot, "packaging", "overlay.ps1"), "utf8"),
      readFile(resolve(projectRoot, "packaging", "overlay-core.ps1"), "utf8"),
      readFile(resolve(projectRoot, "packaging", "uninstall.ps1"), "utf8"),
      readFile(resolve(projectRoot, "packaging", "windows-launcher", "Program.cs"), "utf8"),
      readFile(resolve(projectRoot, "packaging", "windows-setup.iss"), "utf8"),
      readFile(resolve(projectRoot, "scripts", "package.ps1"), "utf8"),
      readFile(resolve(projectRoot, ".github", "workflows", "release.yml"), "utf8"),
    ]);
  });

  it("detects one unambiguous Spotify installation and its preferences", () => {
    expect(installer).toContain('Get-AppxPackage -Name "SpotifyAB.SpotifyMusic"');
    expect(installer).toContain(
      "Both Microsoft Store Spotify and spotify.com Spotify are installed",
    );
    expect(installer).toContain('$spotifyInstallType = "Microsoft Store"');
    expect(installer).toContain("$storeSpotify.PackageFamilyName");
    expect(installer).toContain('$spotifyInstallType = "spotify.com desktop"');
    expect(installer).toContain('Join-Path $env:APPDATA "Spotify"');
    expect(installer).toContain('Join-Path $spotifyRoot "prefs"');
  });

  it("always configures and applies Spicetify", () => {
    expect(installer).not.toContain("SkipApply");
    expect(installer).toContain('"spotify_path", $spotifyRoot');
    expect(installer).toContain('"prefs_path", $prefsPath');
    expect(installer).toContain("& $spicetifyExecutable -n apply");
    expect(installer).toContain('@("-n", "backup", "apply")');
    expect(installer).toContain("$StandardInput | & $Executable @Arguments");
    expect(installer).toContain('-StandardInput "y"');
    expect(installer).toContain("if ($LASTEXITCODE -ne 0)");
    expect(installer).toContain("-File $installedLauncherScript -SkipUpdateCheck");
  });

  it("installs a self-repairing launcher and removes it on uninstall", () => {
    expect(installer).toContain("Furigana for Spotify.lnk");
    expect(installer).toContain("Spotify with Furigana.lnk");
    expect(installer).toContain("legacyShortcutBackupPath");
    expect(installer).toContain('$sourceLauncherScript = Join-Path $sourceApp "launcher.ps1"');
    expect(installer).toContain(
      '$sourceLauncherExecutable = Join-Path $sourceApp "Furigana for Spotify.exe"',
    );
    expect(installer).toContain("$shortcut.TargetPath = $LauncherExecutable");
    expect(installer).toContain("$shortcut.WorkingDirectory = $WorkingDirectory");
    expect(installer).toContain(
      '$launcherStateRoot = Join-Path $env:LOCALAPPDATA "Furigana for Spotify"',
    );
    expect(installer).not.toContain(
      "$shortcut.WorkingDirectory = Split-Path -Parent $LauncherScript",
    );
    expect(launcher).toContain("& $spicetifyExecutable auto");
    expect(launcher).toContain('$overlayPath = Join-Path $PSScriptRoot "overlay.ps1"');
    expect(launcher).toContain("Start-Process -FilePath $powerShellExecutable");
    expect(launcher).toContain("-WindowStyle Hidden");
    expect(launcher).toContain("Set-Location -LiteralPath $resolvedStateRoot");
    expect(launcher).toContain("[Environment]::CurrentDirectory = $resolvedStateRoot");
    expect(installer).toContain('$sourceLauncherIcon = Join-Path $sourceApp "launcher.ico"');
    expect(installer).toContain('$shortcut.IconLocation = "${LauncherIcon},0"');
    expect(installer).toContain('"launcher-v${Version}-${launcherIconId}.ico"');
    expect(installer).toContain("[System.Security.Cryptography.SHA256]::Create()");
    expect(installer).toContain("Set-FuriganaShortcutIcon");
    expect(installer).toContain('[Environment]::GetFolderPath("Desktop")');
    expect(installer).toContain('"Furigana for Spotify\\Furigana for Spotify.lnk"');
    expect(installer).toContain("$installedVersionedLauncherIcon");
    expect(installer).not.toContain('$shortcut.IconLocation = "${SpotifyExecutable},0"');
    expect(uninstaller).toContain("Furigana for Spotify.lnk");
    expect(uninstaller).toContain("Spotify with Furigana.lnk");
    expect(uninstaller).toContain("removedShortcutPath");
    expect(uninstaller).toContain("automatic-update state and log");
  });

  it("builds a native launcher instead of pointing users at PowerShell", () => {
    expect(nativeLauncher).toContain('AssemblyTitle("Furigana for Spotify")');
    expect(nativeLauncher).toContain("Environment.SpecialFolder.System");
    expect(nativeLauncher).toContain('Path.Combine(appDirectory, "launcher.ps1")');
    expect(nativeLauncher).toContain("Environment.SpecialFolder.ApplicationData");
    expect(nativeLauncher).toContain("SetCurrentProcessExplicitAppUserModelID");
    expect(nativeLauncher).toContain("UseShellExecute = false");
    expect(nativeLauncher).toContain("CreateNoWindow = true");
    expect(packager).toContain("Resolve-CSharpCompiler");
    expect(packager).toContain("/target:winexe");
    expect(packager).toContain("AssemblyFileVersion");
    expect(packager).toContain('"Furigana for Spotify.exe"');
  });

  it("builds a localized graphical installer with explicit user choices", () => {
    expect(setup).toContain("AppId={{9C85021E-83A3-4899-8E11-EA30A869B4F1}");
    expect(setup).toContain('Name: "chinesesimplified"');
    expect(setup).toContain('Name: "japanese"');
    expect(setup).toContain('Name: "autoupdate"');
    expect(setup).toContain('Name: "desktopicon"');
    expect(setup).toContain('Name: "{group}\\Furigana for Spotify"');
    expect(setup).toContain('Name: "{autodesktop}\\Furigana for Spotify"');
    expect(setup).toContain('Filename: "{app}\\Furigana for Spotify.exe"');
    expect(setup).toContain('DestName: "launcher-v{#AppVersion}-{#LauncherIconId}.ico"');
    expect(setup).toContain('IconFilename: "{app}\\launcher-v{#AppVersion}-{#LauncherIconId}.ico"');
    expect(setup).toContain(
      "UninstallDisplayIcon={app}\\launcher-v{#AppVersion}-{#LauncherIconId}.ico",
    );
    expect(setup).toContain('AppUserModelID: "FuriganaForSpotify.Launcher"');
    expect(setup).toContain("WizardSmallImageFile={#ProjectRoot}\\assets\\logo.png");
    expect(setup).toContain("UninstallDisplayName={#AppName}");
    expect(setup).toContain("procedure CurStepChanged");
    expect(setup).toContain("ResultCode <> 0");
    expect(setup).toContain("-NoLaunch -SkipShortcut");
    expect(setup).toContain("-DisableAutoUpdate");
    expect(setup).toContain("[UninstallRun]");
    expect(packager).toContain("Resolve-InnoSetupCompiler");
    expect(packager).toContain("function Get-Sha256Hex");
    expect(packager).toContain("Furigana-for-Spotify-Setup-v${version}.exe");
    expect(packager).toContain('"/DLauncherIconId=${launcherIconId}"');
    expect(releaseWorkflow).toContain("release/*.exe");
  });

  it("runs the floating lyric as a loopback-only Windows desktop overlay", () => {
    expect(installer).toContain('$sourceOverlayScript = Join-Path $sourceApp "overlay.ps1"');
    expect(overlay).toContain("[Net.IPAddress]::Loopback");
    expect(overlay).toContain('$corePath = Join-Path $PSScriptRoot "overlay-core.ps1"');
    expect(overlayCore).toContain("https://xpui\\.app\\.spotify\\.com");
    expect(overlay).toContain("FuriganaForSpotifyDesktopOverlay");
    expect(overlay).toContain("$window.Topmost = $true");
    expect(overlay).toContain("$window.Width = 720");
    expect(overlay).toContain("$window.ShowInTaskbar = $false");
    expect(overlay).toContain("$card.Background = [Windows.Media.Brushes]::Transparent");
    expect(overlay).toContain("$base.Effect = [Windows.Media.Effects.DropShadowEffect]");
    expect(overlay).toContain("$badge.Width = 34");
    expect(overlay).toContain("$badge.Height = 34");
    expect(overlay).toContain("$badgeText.FontSize = 19");
    expect(overlay).toContain("$badge.HorizontalAlignment = [Windows.HorizontalAlignment]::Right");
    expect(overlay).toContain("[Windows.Controls.Grid]::SetColumn($badge, 0)");
    expect(overlay).toContain("[Windows.Controls.Grid]::SetColumn($lyricsStage, 1)");
    expect(overlay).toContain("$grid.Children.Add($badge)");
    expect(overlay).toContain("$viewbox.Child = $lyricsPanel");
    expect(overlay).toContain("$nextLyricsPanel");
    expect(overlay).toContain("[Windows.Media.Animation.DoubleAnimation]");
    expect(overlay).toContain("$promoteFromNext");
    expect(overlay).toContain("$currentGrowX");
    expect(overlay).toContain("$outgoingLyricsPanel");
    expect(overlay).toContain("$lastRenderedStateSignature");
    expect(overlay).toContain("$timer.Interval = [TimeSpan]::FromMilliseconds(50)");
    expect(overlay).toContain("$processCheckTick -lt 20");
    expect(overlay).toContain("catch [IO.IOException]");
    expect(overlay).toContain("catch [ObjectDisposedException]");
    expect(overlay).not.toContain("$contentStack.BeginAnimation");
    expect(overlayCore).toContain("Get-ClampedStateNumber");
    expect(overlayCore).toContain('-Name "currentFontSize"');
    expect(overlayCore).toContain('-Name "nextFontSize"');
    expect(overlayCore).toContain("Get-OverlayTransition");
    expect(overlay).toContain('Join-Path $stateRoot "overlay-position.json"');
    expect(overlay).toContain('Get-Process -Name "Spotify"');
    expect(overlay).not.toContain("IPAddress]::Any");
  });
});

describe("macOS release installer", () => {
  let installer = "";
  let launcher = "";
  let overlay = "";
  let overlayBuilder = "";
  let packager = "";
  let uninstaller = "";

  beforeAll(async () => {
    [installer, launcher, overlay, overlayBuilder, uninstaller, packager] = await Promise.all([
      readFile(resolve(projectRoot, "packaging", "install.sh"), "utf8"),
      readFile(resolve(projectRoot, "packaging", "launcher.sh"), "utf8"),
      readFile(resolve(projectRoot, "packaging", "macos-overlay", "main.swift"), "utf8"),
      readFile(resolve(projectRoot, "scripts", "build-macos-overlay.sh"), "utf8"),
      readFile(resolve(projectRoot, "packaging", "uninstall.sh"), "utf8"),
      readFile(resolve(projectRoot, "scripts", "package.ps1"), "utf8"),
    ]);
  });

  it("uses valid POSIX shell syntax", () => {
    if (process.platform === "win32") {
      return;
    }

    for (const script of ["install.sh", "launcher.sh", "uninstall.sh"]) {
      expect(() =>
        execFileSync("/bin/sh", ["-n", resolve(projectRoot, "packaging", script)]),
      ).not.toThrow();
    }
  });

  it("detects supported Spotify locations and configures macOS paths", () => {
    expect(installer).toContain('"$(uname -s)" != "Darwin"');
    expect(installer).toContain('"/Applications/Spotify.app"');
    expect(installer).toContain('"$HOME/Applications/Spotify.app"');
    expect(installer).toContain('spotify_root="$spotify_app/Contents/Resources"');
    expect(installer).toContain('prefs_path="$HOME/Library/Application Support/Spotify/prefs"');
    expect(installer).toContain('config_root="${XDG_CONFIG_HOME:-$HOME/.config}/spicetify"');
    expect(installer).toContain('custom_apps "$app_name"');
  });

  it("applies Spicetify with an update recovery path", () => {
    expect(installer).toContain("run_spicetify -n apply");
    expect(installer).toContain("run_spicetify -n backup apply");
    expect(installer).toContain("run_spicetify auto");
    expect(installer).toContain("trap rollback EXIT");
    expect(installer).toContain("$target_app.backup-$timestamp");
  });

  it("creates a branded self-repairing app launcher", () => {
    expect(installer).toContain('launcher_app="$HOME/Applications/Furigana for Spotify.app"');
    expect(installer).toContain("CFBundleIdentifier");
    expect(installer).toContain("launcher.icns");
    expect(installer).toContain('cp "$installed_launcher" "$launcher_executable"');
    expect(installer).toContain(
      'cp "$installed_overlay" "$overlay_executable_root/FuriganaForSpotifyOverlay"',
    );
    expect(installer).toContain("LSUIElement");
    expect(installer.match(/<key>LSArchitecturePriority<\/key>/gu)).toHaveLength(2);
    expect(installer.match(/<key>LSRequiresNativeExecution<\/key>/gu)).toHaveLength(2);
    expect(installer).toContain("<string>arm64</string>\n    <string>x86_64</string>");
    expect(installer).toContain("com.github.huiishan99.spotify-furigana.overlay");
    expect(launcher).toContain('exec "$spicetify_executable" auto');
    expect(launcher).toContain('"$overlay_executable" >/dev/null 2>&1 &');
    expect(installer).toContain('source_icon="$source_app/launcher.icns"');
    expect(installer).toContain('source_launcher="$source_app/launcher.sh"');
    expect(installer).toContain('source_overlay="$source_app/FuriganaForSpotifyOverlay"');
  });

  it("runs a native, loopback-only macOS desktop overlay", () => {
    expect(overlay).toContain('inet_addr("127.0.0.1")');
    expect(overlay).toContain('headers["origin"] == "https://xpui.app.spotify.com"');
    expect(overlay).toContain("CTRubyAnnotationCreateWithAttributes");
    expect(overlay).toContain("panel.level = .floating");
    expect(overlay).toContain(".canJoinAllSpaces");
    expect(overlay).toContain('application.bundleIdentifier == "com.spotify.client"');
    expect(overlay).toContain('appendingPathComponent("overlay-position.json")');
    expect(overlay).toContain('CABasicAnimation(keyPath: "transform.translation.y")');
    expect(overlayBuilder).toContain('compile_architecture arm64 "$arm_file"');
    expect(overlayBuilder).toContain("xcrun lipo -create");
    expect(overlayBuilder).toContain('"$output_file" --self-test');
  });

  it("disables the custom app and preserves removed files on uninstall", () => {
    expect(uninstaller).toContain('custom_apps "$app_name-"');
    expect(uninstaller).toContain("run_spicetify -n apply");
    expect(uninstaller).toContain("$target_app.removed-$timestamp");
    expect(uninstaller).toContain("$launcher_app.removed-$timestamp");
    expect(uninstaller).toContain("automatic-update state and log");
    expect(uninstaller).toContain("run_spicetify auto");
  });

  it("ships both macOS lifecycle scripts in the release archive", () => {
    expect(packager).toContain('(Join-Path $packagingRoot "install.sh")');
    expect(packager).toContain('(Join-Path $packagingRoot "uninstall.sh")');
    expect(packager).toContain('(Join-Path $builtApp "FuriganaForSpotifyOverlay")');
  });

  it("completes an isolated install, upgrade, and uninstall lifecycle on macOS", async () => {
    if (process.platform !== "darwin") {
      return;
    }

    const testRoot = await mkdtemp(resolve(tmpdir(), "spotify-furigana-test-"));
    const releaseRoot = resolve(testRoot, "release");
    const sourceApp = resolve(releaseRoot, "spotify-furigana");
    const fakeSpotify = resolve(testRoot, "Spotify.app");
    const fakeBin = resolve(testRoot, "bin");
    const fakeHome = resolve(testRoot, "home");
    const configHome = resolve(testRoot, "config");
    const commandLog = resolve(testRoot, "spicetify.log");

    await Promise.all([
      mkdir(sourceApp, { recursive: true }),
      mkdir(resolve(fakeSpotify, "Contents", "MacOS"), { recursive: true }),
      mkdir(resolve(fakeSpotify, "Contents", "Resources"), { recursive: true }),
      mkdir(resolve(fakeHome, "Library", "Application Support", "Spotify"), {
        recursive: true,
      }),
      mkdir(fakeBin, { recursive: true }),
      mkdir(configHome, { recursive: true }),
    ]);

    const releaseInstaller = resolve(releaseRoot, "install.sh");
    const releaseUninstaller = resolve(releaseRoot, "uninstall.sh");
    const fakeSpicetify = resolve(fakeBin, "spicetify");
    const fakeSpotifyExecutable = resolve(fakeSpotify, "Contents", "MacOS", "Spotify");

    await Promise.all([
      copyFile(resolve(projectRoot, "packaging", "install.sh"), releaseInstaller),
      copyFile(resolve(projectRoot, "packaging", "uninstall.sh"), releaseUninstaller),
      copyFile(
        resolve(projectRoot, "assets", "launcher.icns"),
        resolve(sourceApp, "launcher.icns"),
      ),
      copyFile(resolve(projectRoot, "packaging", "launcher.sh"), resolve(sourceApp, "launcher.sh")),
      writeFile(resolve(sourceApp, "FuriganaForSpotifyOverlay"), "#!/bin/sh\nexit 0\n"),
      writeFile(resolve(sourceApp, "manifest.json"), '{"name":"test"}\n'),
      writeFile(resolve(sourceApp, "version.txt"), "0.5.0\n"),
      writeFile(fakeSpotifyExecutable, "#!/bin/sh\nexit 0\n"),
      writeFile(resolve(fakeHome, "Library", "Application Support", "Spotify", "prefs"), "test\n"),
      writeFile(
        fakeSpicetify,
        [
          "#!/bin/sh",
          'printf "%s\\n" "$*" >> "$SPICETIFY_TEST_LOG"',
          'if [ "$*" = "-n apply" ] && [ "${SPICETIFY_FAIL_APPLY_ONCE:-}" = "1" ] && [ ! -e "$SPICETIFY_FAIL_FLAG" ]; then',
          '  : > "$SPICETIFY_FAIL_FLAG"',
          "  exit 1",
          "fi",
          "",
        ].join("\n"),
      ),
    ]);
    await Promise.all([
      chmod(releaseInstaller, 0o755),
      chmod(releaseUninstaller, 0o755),
      chmod(fakeSpotifyExecutable, 0o755),
      chmod(fakeSpicetify, 0o755),
    ]);

    const environment = {
      ...process.env,
      HOME: fakeHome,
      PATH: `${fakeBin}:/usr/bin:/bin`,
      SPICETIFY_FAIL_APPLY_ONCE: "1",
      SPICETIFY_FAIL_FLAG: resolve(testRoot, "apply-failed"),
      SPICETIFY_TEST_LOG: commandLog,
      SPOTIFY_FURIGANA_SKIP_UPDATE: "1",
      SPOTIFY_FURIGANA_DISABLE_OVERLAY: "1",
      SPOTIFY_FURIGANA_SPOTIFY_APP: fakeSpotify,
      XDG_CONFIG_HOME: configHome,
    };

    execFileSync("/bin/sh", [releaseInstaller], {
      cwd: releaseRoot,
      env: environment,
    });

    const installedApp = resolve(configHome, "spicetify", "CustomApps", "spotify-furigana");
    const launcherApp = resolve(fakeHome, "Applications", "Furigana for Spotify.app");
    await Promise.all([
      readFile(resolve(installedApp, "manifest.json")),
      readFile(resolve(launcherApp, "Contents", "Info.plist")),
      readFile(resolve(launcherApp, "Contents", "MacOS", "spotify-furigana")),
      readFile(
        resolve(
          launcherApp,
          "Contents",
          "Helpers",
          "Furigana Desktop Lyrics.app",
          "Contents",
          "Info.plist",
        ),
      ),
      readFile(
        resolve(
          launcherApp,
          "Contents",
          "Helpers",
          "Furigana Desktop Lyrics.app",
          "Contents",
          "MacOS",
          "FuriganaForSpotifyOverlay",
        ),
      ),
      readFile(resolve(launcherApp, "Contents", "Resources", "launcher.icns")),
      readFile(resolve(launcherApp, "Contents", "Resources", "version.txt")),
    ]);
    execFileSync("/usr/bin/plutil", ["-lint", resolve(launcherApp, "Contents", "Info.plist")]);
    execFileSync("/usr/bin/plutil", [
      "-lint",
      resolve(
        launcherApp,
        "Contents",
        "Helpers",
        "Furigana Desktop Lyrics.app",
        "Contents",
        "Info.plist",
      ),
    ]);
    execFileSync(resolve(launcherApp, "Contents", "MacOS", "spotify-furigana"), [], {
      env: environment,
    });

    execFileSync("/bin/sh", [releaseInstaller], {
      cwd: releaseRoot,
      env: environment,
    });
    const installedEntries = await readdir(resolve(configHome, "spicetify", "CustomApps"));
    expect(installedEntries.some((entry) => entry.startsWith("spotify-furigana.backup-"))).toBe(
      true,
    );

    execFileSync("/bin/sh", [releaseUninstaller], {
      cwd: releaseRoot,
      env: environment,
    });
    const removedEntries = await readdir(resolve(configHome, "spicetify", "CustomApps"));
    expect(removedEntries.some((entry) => entry.startsWith("spotify-furigana.removed-"))).toBe(
      true,
    );

    const log = await readFile(commandLog, "utf8");
    const resolvedFakeSpotify = await realpath(fakeSpotify);
    expect(log).toContain(`spotify_path ${resolvedFakeSpotify}/Contents/Resources`);
    expect(log).toContain(`prefs_path ${fakeHome}/Library/Application Support/Spotify/prefs`);
    expect(log).toContain("custom_apps spotify-furigana");
    expect(log).toContain("custom_apps spotify-furigana-");
    expect(log).toContain("-n apply");
    expect(log).toContain("-n backup apply");
    expect(log).toContain("auto");
    await rm(testRoot, { recursive: true, force: true });
  });
});
