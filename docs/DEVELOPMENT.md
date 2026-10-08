# Development guide

This document contains the implementation and build details intentionally kept out of the user-facing READMEs.

## v0.6.3 release preparation

The canonical repository is [`huiishan99/extension-Furigana-for-Spotify`](https://github.com/huiishan99/extension-Furigana-for-Spotify). Keep `spotify-furigana` as the package name, Custom App identifier, install directory, and release ZIP prefix; the repository rename does not rename those internal identifiers.

The source version is **0.6.3**. Its release candidate includes the Windows Setup wizard, native Windows launcher, native macOS overlay, and canonical-URL updater repair. The [v0.6.3 release page](https://github.com/huiishan99/extension-Furigana-for-Spotify/releases/tag/v0.6.3) is the distribution destination for `spotify-furigana-v0.6.3.zip`, `spotify-furigana-v0.6.3.zip.sha256`, `Furigana-for-Spotify-Setup-v0.6.3.exe`, and `Furigana-for-Spotify-Setup-v0.6.3.exe.sha256`. A tagged source tree or successful build alone does not mean those assets are published. The release body is maintained in [`releases/v0.6.3.md`](./releases/v0.6.3.md).

Windows launchers shipped through v0.6.2 reject the canonical release URL after the old repository URL redirects. They cannot retrieve the update that repairs them. Once the v0.6.3 assets are published, affected users must manually download and completely extract `spotify-furigana-v0.6.3.zip`, then rerun `install.ps1` once. Reinstalling v0.6.2 does not repair the updater, and publishing v0.6.3 alone does not migrate those installations.

## Requirements

The Node.js/npm requirements below are for development. Release users need Spotify Desktop and Spicetify installed separately, but do not need Node.js, npm, or a browser extension. The Windows Setup wizard installs Furigana only and does not bootstrap Spotify or Spicetify.

- Node.js 22 or later
- npm
- Windows or macOS and Spicetify for real-client verification

## Architecture

```text
Spotify lyrics DOM
        ↓
Find lyric lines containing kanji
        ↓
Convert locally with Kuroshiro + Kuromoji
        ↓
Build allowlisted <ruby> / <rt> annotations
```

The custom app and startup extension run separately. They share settings through `Spicetify.LocalStorage` and synchronize changes with a window event.

## Repository layout

```text
extension-Furigana-for-Spotify/
├── app/          # Spicetify Custom App page, styles, and manifest
├── assets/       # Project logo, screenshots, and launch artwork
├── docs/         # User translations, compatibility, and developer docs
├── packaging/    # Graphical/script installers, native launcher, and offline instructions
├── scripts/      # Build, package, and generated-asset scripts
├── src/          # Lyrics observer, selectors, settings, and reading engine
├── tests/        # Vitest tests
├── types/        # Kuroshiro and Spicetify declarations
└── manifest.json # Spicetify Marketplace discovery metadata
```

Key entry points:

- `src/extension.ts`: observes the stable document root, coalesces scans with background-safe timers, coordinates settings, and updates lyric lines;
- `src/lyrics.ts`: maintains current and legacy Spotify lyrics selectors;
- `src/reading-engine.ts`: performs local reading conversion and safe DOM construction;
- `src/local-readings.ts`: applies context-guarded local phrase readings before dictionary conversion;
- `src/settings.ts`: validates and persists the display configuration;
- `src/diagnostics.ts`: creates a versioned, privacy-safe runtime report from settings, reading status, selector counts, and annotation state without including track identity or lyric text;
- `src/ui-language.ts`: resolves automatic or manual UI language preferences and localizes extension statuses, notifications, and playbar labels;
- `src/icon.ts`: provides the original 「ふ」 playbar mark;
- `src/online-readings.ts`: strictly matches optional NetEase synchronized romanization, verifies cross-script artist aliases through MusicBrainz when needed, aligns readings to Spotify lyric lines, and manages the bounded local cache;
- `app/index.ts`: renders the type-checked Spicetify settings page and reuses the runtime setting schema;
- `packaging/launcher.ps1` and `packaging/launcher.sh`: check the official stable GitHub Release, verify its SHA-256, run a no-recursion upgrade, and fall back to the installed version before launching through Spicetify; the Windows launcher changes to its local state directory before `spicetify auto` so the installed app remains replaceable;
- `packaging/overlay.ps1`: hosts the Windows WPF always-on-top lyric window and accepts bounded state messages only from the fixed IPv4 loopback listener; it persists coordinates but never lyric content;
- `packaging/overlay-core.ps1`: contains the platform-neutral request validation, state normalization, clamping, deduplication, and transition decisions exercised directly from the test suite;
- `packaging/windows-setup.iss`: builds the localized Inno Setup wizard, optional desktop/update choices, Start menu registration, and Installed apps lifecycle;
- `packaging/windows-launcher/Program.cs`: provides the small native Windows entry point used by searchable shortcuts while delegating repair/update behavior to `launcher.ps1`;
- `scripts/build.mjs`: bundles the extension with the package version injected for diagnostics, copies the local dictionary and platform launchers, and writes `version.txt` for release comparison.

## Build and verify

Release packaging runs on Windows and requires the universal macOS helper at `build/macos-overlay/FuriganaForSpotifyOverlay`. Build it on macOS with `npm run build:macos-overlay`, then transfer that output to the Windows packaging workspace. CI performs this handoff automatically. A normal `npm run check` does not require this cross-platform packaging step.

```powershell
npm ci
npm run check
npm run marketing-assets
npm run package
```

- `npm run check` runs Biome formatting/lint checks, TypeScript checks, Vitest with a regression coverage floor, app syntax validation, native overlay-core tests when PowerShell is available, and the production build.
- `npm run marketing-assets` deterministically rebuilds launch artwork from the project logo and real screenshot.
- `npm run package` uses the .NET Framework C# compiler and Inno Setup 6/7 to create the Windows Setup.exe plus the portable ZIP, with SHA-256 files for both, under the ignored `release/` directory.
- `packaging/install.ps1` and `packaging/uninstall.ps1` implement the Windows lifecycle; `packaging/install.sh` and `packaging/uninstall.sh` implement the macOS lifecycle and create a branded app launcher under `~/Applications`.
- Auto-update launchers check at most once per 24 hours, accept stable `vX.Y.Z` tags only, require exact versioned ZIP/checksum assets, and invoke installers with launch suppression so the original launcher performs one final `spicetify auto`. Test-only source overrides require `SPOTIFY_FURIGANA_TEST_MODE=1` and are never used by installed shortcuts.
- Release builds pin every GitHub Action to an immutable commit and publish GitHub build-provenance attestations for every release artifact. Dependabot groups weekly npm and Actions maintenance updates, while the scheduled compatibility canary verifies that the canonical Release endpoint still resolves to this repository before running the fixture suite.

For v0.6.3, require the exact release commit to pass the Linux, macOS, and Windows CI matrix, the universal macOS overlay build/self-test, and Windows package verification. The package verifier checks package/lock/staged versions, native Windows launcher and Setup version metadata, complete ZIP contents, required native helpers and notices, and both SHA-256 files. Before announcing the release, verify all four uploaded assets on the versioned release page and retain the one-time Windows recovery instructions in the release body. No new live Spotify-client validation was performed during this release update; earlier results remain in `docs/COMPATIBILITY.md`.

## Publishing a verified release

The `Release` workflow supports the existing stable-tag push trigger and a manual **Run workflow** entry point. For a manual run, select `main`, enter the package version without `v`, and paste the full SHA of the main commit whose CI and packaging checks you have verified. The workflow rejects a changed main SHA, version mismatches, existing tags/releases, and missing reviewed release notes. It builds and verifies the packages before publishing, then checks those preconditions again. Release runs are serialized, existing assets are not overwritten, and the built-in GitHub token prevents the newly created tag from starting a duplicate release run.

The manual trigger does not select or approve a new commit for you. Check the exact main commit's successful CI before starting it. If publication stops after a tag or draft release was created, inspect that state before deciding how to recover; do not bypass the overwrite protection or force-move a tag.

## Install a source build

```powershell
npm run build

$target = Join-Path $env:APPDATA "spicetify\CustomApps\spotify-furigana"
New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item -Recurse -Force "dist\spotify-furigana\*" $target

spicetify config custom_apps spotify-furigana
spicetify apply
```

Restart Spotify and verify the standard lyrics view, the playbar toggle, all three reading modes, and each appearance control. Record real-client results in `docs/COMPATIBILITY.md`; do not describe automated selector coverage as real-client verification.

On macOS, use the equivalent source install:

```sh
npm run build
target="${XDG_CONFIG_HOME:-$HOME/.config}/spicetify/CustomApps/spotify-furigana"
mkdir -p "$target"
cp -R dist/spotify-furigana/. "$target/"
spicetify config spotify_path "/Applications/Spotify.app/Contents/Resources" \
  prefs_path "$HOME/Library/Application Support/Spotify/prefs" \
  custom_apps spotify-furigana
spicetify apply
```
