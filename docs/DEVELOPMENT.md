# Development guide

This document contains the implementation and build details intentionally kept out of the user-facing READMEs.

## Requirements

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
spotify-furigana/
├── app/          # Spicetify Custom App page, styles, and manifest
├── assets/       # Project logo, screenshots, and launch artwork
├── docs/         # User translations, compatibility, and developer docs
├── packaging/    # Release installer, uninstaller, and offline instructions
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
- `app/index.js`: renders the Spicetify settings page;
- `packaging/launcher.ps1` and `packaging/launcher.sh`: check the official stable GitHub Release, verify its SHA-256, run a no-recursion upgrade, and fall back to the installed version before launching through Spicetify; the Windows launcher changes to its local state directory before `spicetify auto` so the installed app remains replaceable;
- `packaging/overlay.ps1`: hosts the Windows WPF always-on-top lyric window and accepts bounded state messages only from the fixed IPv4 loopback listener; it persists coordinates but never lyric content;
- `scripts/build.mjs`: bundles the extension with the package version injected for diagnostics, copies the local dictionary and platform launchers, and writes `version.txt` for release comparison.

## Build and verify

```powershell
npm ci
npm run check
npm run marketing-assets
npm run package
```

- `npm run check` runs TypeScript checks, app syntax validation, Vitest, and the production build.
- `npm run marketing-assets` deterministically rebuilds launch artwork from the project logo and real screenshot.
- `npm run package` creates the installable ZIP and SHA-256 checksum under the ignored `release/` directory.
- `packaging/install.ps1` and `packaging/uninstall.ps1` implement the Windows lifecycle; `packaging/install.sh` and `packaging/uninstall.sh` implement the macOS lifecycle and create a branded app launcher under `~/Applications`.
- Auto-update launchers check at most once per 24 hours, accept stable `vX.Y.Z` tags only, require exact versioned ZIP/checksum assets, and invoke installers with launch suppression so the original launcher performs one final `spicetify auto`. Test-only source overrides require `SPOTIFY_FURIGANA_TEST_MODE=1` and are never used by installed shortcuts.

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
