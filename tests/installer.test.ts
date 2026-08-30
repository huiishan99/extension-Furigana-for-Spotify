import { execFileSync } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  readdir,
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
  let uninstaller = "";

  beforeAll(async () => {
    [installer, launcher, overlay, uninstaller] = await Promise.all([
      readFile(resolve(projectRoot, "packaging", "install.ps1"), "utf8"),
      readFile(resolve(projectRoot, "packaging", "launcher.ps1"), "utf8"),
      readFile(resolve(projectRoot, "packaging", "overlay.ps1"), "utf8"),
      readFile(resolve(projectRoot, "packaging", "uninstall.ps1"), "utf8"),
    ]);
  });

  it("detects one unambiguous Spotify installation and its preferences", () => {
    expect(installer).toContain(
      'Get-AppxPackage -Name "SpotifyAB.SpotifyMusic"',
    );
    expect(installer).toContain(
      "Both Microsoft Store Spotify and spotify.com Spotify are installed",
    );
    expect(installer).toContain('$spotifyInstallType = "Microsoft Store"');
    expect(installer).toContain("$storeSpotify.PackageFamilyName");
    expect(installer).toContain(
      '$spotifyInstallType = "spotify.com desktop"',
    );
    expect(installer).toContain('Join-Path $env:APPDATA "Spotify"');
    expect(installer).toContain('Join-Path $spotifyRoot "prefs"');
  });

  it("always configures and applies Spicetify", () => {
    expect(installer).not.toContain("SkipApply");
    expect(installer).toContain('"spotify_path", $spotifyRoot');
    expect(installer).toContain('"prefs_path", $prefsPath');
    expect(installer).toContain("& $spicetifyExecutable -n apply");
    expect(installer).toContain('@("-n", "backup", "apply")');
    expect(installer).toContain('$StandardInput | & $Executable @Arguments');
    expect(installer).toContain('-StandardInput "y"');
    expect(installer).toContain("if ($LASTEXITCODE -ne 0)");
    expect(installer).toContain("-File $installedLauncherScript -SkipUpdateCheck");
  });

  it("installs a self-repairing launcher and removes it on uninstall", () => {
    expect(installer).toContain("Furigana for Spotify.lnk");
    expect(installer).toContain("Spotify with Furigana.lnk");
    expect(installer).toContain("legacyShortcutBackupPath");
    expect(installer).toContain("-WindowStyle Hidden -File");
    expect(installer).toContain('$sourceLauncherScript = Join-Path $sourceApp "launcher.ps1"');
    expect(installer).toContain("$shortcut.TargetPath = $PowerShellExecutable");
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
    expect(launcher).toContain(
      "[Environment]::CurrentDirectory = $resolvedStateRoot",
    );
    expect(installer).toContain('$sourceLauncherIcon = Join-Path $sourceApp "launcher.ico"');
    expect(installer).toContain('$shortcut.IconLocation = "${IconPath},0"');
    expect(installer).not.toContain('$shortcut.IconLocation = "${SpotifyExecutable},0"');
    expect(uninstaller).toContain("Furigana for Spotify.lnk");
    expect(uninstaller).toContain("Spotify with Furigana.lnk");
    expect(uninstaller).toContain("removedShortcutPath");
    expect(uninstaller).toContain("automatic-update state and log");
  });

  it("runs the floating lyric as a loopback-only Windows desktop overlay", () => {
    expect(installer).toContain('$sourceOverlayScript = Join-Path $sourceApp "overlay.ps1"');
    expect(overlay).toContain("[Net.IPAddress]::Loopback");
    expect(overlay).toContain("https://xpui\\.app\\.spotify\\.com");
    expect(overlay).toContain("FuriganaForSpotifyDesktopOverlay");
    expect(overlay).toContain("$window.Topmost = $true");
    expect(overlay).toContain("$window.ShowInTaskbar = $false");
    expect(overlay).toContain("$card.Background = [Windows.Media.Brushes]::Transparent");
    expect(overlay).toContain("$base.Effect = [Windows.Media.Effects.DropShadowEffect]");
    expect(overlay).toContain("$nextLyricsPanel");
    expect(overlay).toContain("[Windows.Media.Animation.DoubleAnimation]");
    expect(overlay).toContain("$promoteFromNext");
    expect(overlay).toContain("$currentGrowX");
    expect(overlay).toContain("$outgoingLyricsPanel");
    expect(overlay).toContain("$lastRenderedStateSignature");
    expect(overlay).toContain(
      "$timer.Interval = [TimeSpan]::FromMilliseconds(50)",
    );
    expect(overlay).toContain("$processCheckTick -lt 20");
    expect(overlay).not.toContain("$contentStack.BeginAnimation");
    expect(overlay).toContain('Get-ClampedStateNumber');
    expect(overlay).toContain('-Name "currentFontSize"');
    expect(overlay).toContain('-Name "nextFontSize"');
    expect(overlay).toContain('Join-Path $stateRoot "overlay-position.json"');
    expect(overlay).toContain('Get-Process -Name "Spotify"');
    expect(overlay).not.toContain("IPAddress]::Any");
  });
});

describe("macOS release installer", () => {
  let installer = "";
  let launcher = "";
  let packager = "";
  let uninstaller = "";

  beforeAll(async () => {
    [installer, launcher, uninstaller, packager] = await Promise.all([
      readFile(resolve(projectRoot, "packaging", "install.sh"), "utf8"),
      readFile(resolve(projectRoot, "packaging", "launcher.sh"), "utf8"),
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
        execFileSync("/bin/sh", [
          "-n",
          resolve(projectRoot, "packaging", script),
        ]),
      ).not.toThrow();
    }
  });

  it("detects supported Spotify locations and configures macOS paths", () => {
    expect(installer).toContain('"$(uname -s)" != "Darwin"');
    expect(installer).toContain('"/Applications/Spotify.app"');
    expect(installer).toContain('"$HOME/Applications/Spotify.app"');
    expect(installer).toContain('spotify_root="$spotify_app/Contents/Resources"');
    expect(installer).toContain(
      'prefs_path="$HOME/Library/Application Support/Spotify/prefs"',
    );
    expect(installer).toContain(
      'config_root="${XDG_CONFIG_HOME:-$HOME/.config}/spicetify"',
    );
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
    expect(installer).toContain(
      'launcher_app="$HOME/Applications/Furigana for Spotify.app"',
    );
    expect(installer).toContain("CFBundleIdentifier");
    expect(installer).toContain("launcher.icns");
    expect(installer).toContain('cp "$installed_launcher" "$launcher_executable"');
    expect(launcher).toContain('exec "$spicetify_executable" auto');
    expect(installer).toContain('source_icon="$source_app/launcher.icns"');
    expect(installer).toContain('source_launcher="$source_app/launcher.sh"');
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
    const fakeSpotifyExecutable = resolve(
      fakeSpotify,
      "Contents",
      "MacOS",
      "Spotify",
    );

    await Promise.all([
      copyFile(resolve(projectRoot, "packaging", "install.sh"), releaseInstaller),
      copyFile(
        resolve(projectRoot, "packaging", "uninstall.sh"),
        releaseUninstaller,
      ),
      copyFile(
        resolve(projectRoot, "assets", "launcher.icns"),
        resolve(sourceApp, "launcher.icns"),
      ),
      copyFile(
        resolve(projectRoot, "packaging", "launcher.sh"),
        resolve(sourceApp, "launcher.sh"),
      ),
      writeFile(resolve(sourceApp, "manifest.json"), '{"name":"test"}\n'),
      writeFile(resolve(sourceApp, "version.txt"), "0.5.0\n"),
      writeFile(fakeSpotifyExecutable, "#!/bin/sh\nexit 0\n"),
      writeFile(
        resolve(fakeHome, "Library", "Application Support", "Spotify", "prefs"),
        "test\n",
      ),
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
      SPOTIFY_FURIGANA_SPOTIFY_APP: fakeSpotify,
      XDG_CONFIG_HOME: configHome,
    };

    execFileSync("/bin/sh", [releaseInstaller], {
      cwd: releaseRoot,
      env: environment,
    });

    const installedApp = resolve(
      configHome,
      "spicetify",
      "CustomApps",
      "spotify-furigana",
    );
    const launcherApp = resolve(
      fakeHome,
      "Applications",
      "Furigana for Spotify.app",
    );
    await Promise.all([
      readFile(resolve(installedApp, "manifest.json")),
      readFile(resolve(launcherApp, "Contents", "Info.plist")),
      readFile(
        resolve(launcherApp, "Contents", "MacOS", "spotify-furigana"),
      ),
      readFile(resolve(launcherApp, "Contents", "Resources", "launcher.icns")),
      readFile(resolve(launcherApp, "Contents", "Resources", "version.txt")),
    ]);
    execFileSync("/usr/bin/plutil", [
      "-lint",
      resolve(launcherApp, "Contents", "Info.plist"),
    ]);
    execFileSync(
      resolve(launcherApp, "Contents", "MacOS", "spotify-furigana"),
      [],
      { env: environment },
    );

    execFileSync("/bin/sh", [releaseInstaller], {
      cwd: releaseRoot,
      env: environment,
    });
    const installedEntries = await readdir(
      resolve(configHome, "spicetify", "CustomApps"),
    );
    expect(
      installedEntries.some((entry) =>
        entry.startsWith("spotify-furigana.backup-"),
      ),
    ).toBe(true);

    execFileSync("/bin/sh", [releaseUninstaller], {
      cwd: releaseRoot,
      env: environment,
    });
    const removedEntries = await readdir(
      resolve(configHome, "spicetify", "CustomApps"),
    );
    expect(
      removedEntries.some((entry) =>
        entry.startsWith("spotify-furigana.removed-"),
      ),
    ).toBe(true);

    const log = await readFile(commandLog, "utf8");
    const resolvedFakeSpotify = await realpath(fakeSpotify);
    expect(log).toContain(
      `spotify_path ${resolvedFakeSpotify}/Contents/Resources`,
    );
    expect(log).toContain(
      `prefs_path ${fakeHome}/Library/Application Support/Spotify/prefs`,
    );
    expect(log).toContain("custom_apps spotify-furigana");
    expect(log).toContain("custom_apps spotify-furigana-");
    expect(log).toContain("-n apply");
    expect(log).toContain("-n backup apply");
    expect(log).toContain("auto");
    await rm(testRoot, { recursive: true, force: true });
  });
});
