<p align="center">
  <strong>English</strong> · <a href="./docs/README.zh-CN.md">简体中文</a> · <a href="./docs/README.ja.md">日本語</a>
</p>

<p align="center">
  <img src="./assets/logo.png" alt="Furigana for Spotify logo" width="168" />
</p>

<h1 align="center">Furigana for Spotify</h1>

<p align="center">
  <strong>Show hiragana, katakana, or romaji readings above Japanese kanji in Spotify lyrics on Windows and macOS.</strong>
  <br />
  Local by default · Optional synchronized readings · No Spotify credentials required
</p>

<p align="center">
  <a href="https://github.com/huiishan99/spotify-furigana/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/huiishan99/spotify-furigana/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="https://github.com/huiishan99/spotify-furigana/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/huiishan99/spotify-furigana?display_name=tag&amp;label=release&amp;color=00A77D" /></a>
  <a href="https://github.com/huiishan99/spotify-furigana/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/huiishan99/spotify-furigana?style=flat&amp;logo=github&amp;color=00A77D" /></a>
  <img alt="Windows and macOS" src="https://img.shields.io/badge/Desktop-Windows%20%7C%20macOS-4F46E5" />
  <img alt="Spotify Desktop 1.2.97 tested" src="https://img.shields.io/badge/Spotify%20Desktop-1.2.97%20tested-16A34A?logo=spotify&amp;logoColor=1ED760&amp;labelColor=191414" />
  <img alt="Spicetify 2.44 tested" src="https://img.shields.io/badge/Spicetify-2.44%20tested-F97366" />
  <a href="./LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-4338CA" /></a>
</p>

> [!IMPORTANT]
> This is an independent community project. It is not affiliated with, sponsored by, or endorsed by Spotify AB. The project mark does not use the official Spotify logo; the mark inside the compatibility badge only identifies the target platform.

> [!TIP]
> If this project helps you read even one Japanese song more comfortably, consider [giving it a star](https://github.com/huiishan99/spotify-furigana). Stars help other Japanese learners discover it.

## See it in action

<p align="center">
  <img src="./assets/marketing/demo.gif" alt="Animated close-up of live Japanese furigana displayed in Spotify lyrics on Windows" width="100%" />
</p>

<p align="center">
  <sub>Animated from a real capture on Windows 11 · Spotify 1.2.97.270 · Spicetify 2.44.0. <a href="./assets/screenshots/lyrics-view.png">View the full screenshot.</a> Lyrics, artwork, and Spotify UI elements belong to their respective rights holders and appear here only to demonstrate the extension.</sub>
</p>

The extension enhances lyrics already displayed by Spotify and uses standard HTML `<ruby>` annotations to place readings above kanji.

| Original lyric | With furigana |
| --- | --- |
| 声も聞かさないで | <ruby>声<rt>こえ</rt></ruby>も<ruby>聞<rt>き</rt></ruby>かさないで |
| 明日は晴れる | <ruby>明日<rt>あした</rt></ruby>は<ruby>晴<rt>は</rt></ruby>れる |

## Why use it

- **Works with Spotify's lyrics view**: automatically processes the current desktop layout and known fullscreen lyrics layouts.
- **Optional floating current line**: keep the lyric being sung and its furigana in a draggable card inside Spotify while browsing other pages.
- **Local by default**: Kuroshiro + Kuromoji perform tokenization and reading conversion on your machine without contacting a lyrics service.
- **Reliable common counters offline**: locally corrects `一人` / `1人` → `ひとり` and `二人` / `2人` → `ふたり`, while preserving terms such as `一人称` and `二人三脚`.
- **Optional accurate-reading mode**: use synchronized romanization when available for song-specific and intentionally unusual pronunciations.
- **Know which source is active**: hover the player-bar `ふ` button to see whether the current lyrics use local readings, accurate synchronized readings, or a safe local fallback.
- **English, Chinese, and Japanese UI**: follow Spotify automatically or choose a language independently in the app.
- **Choose how readings appear**: switch between hiragana, katakana, and romaji, then tune size, opacity, and vertical spacing.
- **Keeps Spotify's lyrics view**: it enhances the text already visible in Spotify instead of replacing the player or its timing.
- **Easy to toggle**: use the lyrics button in the player bar or the custom app page in the sidebar.

## Requirements

- Windows 10/11, or macOS 12 or later
- Spotify Desktop: on Windows, use the [spotify.com build](https://www.spotify.com/download/windows/) or Microsoft Store build (install only one); on macOS, use the [spotify.com build](https://www.spotify.com/download/mac/)
- [Spicetify](https://spicetify.app/docs/getting-started)

Verified on real hardware with:

| Component | Verified version |
| --- | --- |
| Windows | Windows 11 Pro 10.0.26200 |
| Spotify | Microsoft Store build 1.2.97.270 |
| Spicetify | 2.44.0 |

Other versions may work, but have not been individually verified.

The macOS installer and production bundle are covered by automated checks on macOS runners. A real Spotify client compatibility report has not yet been recorded, so macOS support should be considered newly available rather than real-client verified.

See the [compatibility matrix](./docs/COMPATIBILITY.md) for more version information.

## Install

<p>
  <a href="https://github.com/huiishan99/spotify-furigana/releases/latest"><img alt="Download the latest release" src="https://img.shields.io/badge/Download-latest%20release-00A77D?style=for-the-badge&amp;logo=github" /></a>
</p>

Download `spotify-furigana-vX.Y.Z.zip` from the [latest release](https://github.com/huiishan99/spotify-furigana/releases/latest), then extract it completely.

### Windows

Open PowerShell in the extracted folder and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

The installer detects your single Spotify installation, backs up an existing Furigana installation, installs and enables the app, applies the Spicetify configuration, and creates a **Furigana for Spotify** launcher in the Start menu. The launcher uses the project's original **ふ** icon so it is easy to distinguish from Spotify's regular shortcut.

After installation, open **Furigana for Spotify** from the Start menu. This launcher checks for an official Furigana release at most once every 24 hours, then checks and reapplies Spicetify before opening Spotify. The extension therefore receives future Furigana features automatically, survives normal restarts, and can recover after supported Spotify updates. Play a Japanese song with lyrics and open the lyrics view; the local dictionary may take a moment to load on the first conversion.

> [!IMPORTANT]
> Microsoft Store users must launch **Furigana for Spotify** instead of Spotify's regular shortcut. The generated launcher runs `spicetify auto` with the required app directory; opening the Store app directly will show the unmodified Spotify UI. Spicetify 2.44 officially lists support through Spotify 1.2.93; the Store 1.2.97 setup above is real-client tested by this project but remains outside Spicetify's official range.

### macOS

Open Terminal in the extracted folder and run:

```sh
sh ./install.sh
```

The installer supports Spotify in `/Applications` or `~/Applications`, validates Spotify's preferences, backs up an existing Furigana installation, configures and applies Spicetify, and creates **Furigana for Spotify.app** in `~/Applications` with the project's **ふ** icon. Open this launcher for future starts so it can install official Furigana releases automatically and run `spicetify auto` before launching Spotify.

## Update

Starting with `v0.5.0`, the **Furigana for Spotify** launcher checks the official latest GitHub Release at most once every 24 hours. When a newer stable version exists, it downloads the version-matched ZIP and `.sha256` file, verifies the archive, preserves the installed version as a timestamped backup, and upgrades before opening Spotify. There is no resident background updater.

If GitHub is unavailable, the checksum is invalid, or installation fails, the launcher records the error locally and opens the currently installed version. The update check sends no Spotify credentials, account data, track information, or lyrics; it makes only the normal HTTPS requests needed to read and download this project's public GitHub Release.

Users on `v0.4.3` or earlier must install `v0.5.0` manually once to receive the new updater. Download and extract the newest Release ZIP, then run:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

On macOS:

```sh
sh ./install.sh
```

To install without automatic Furigana updates, use `-DisableAutoUpdate` on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -DisableAutoUpdate
```

On macOS, use `SPOTIFY_FURIGANA_DISABLE_AUTO_UPDATE=1 sh ./install.sh`. Running the installer again without that option re-enables automatic updates.

## Customize the readings

Open **Furigana for Spotify** from Spotify's sidebar. The settings page lets you:

- follow Spotify's interface language automatically or choose English, Simplified Chinese, or Japanese;
- switch between hiragana, katakana, and romaji readings;
- adjust reading size from 30% to 75%;
- adjust opacity from 40% to 100%;
- add up to 8 px of vertical spacing;
- show the current lyric and its furigana in a draggable floating card inside Spotify;
- restore the display defaults with one click.
- enable experimental online accurate readings and clear their local cache.

Changes are saved locally and apply immediately.

The floating card uses the same line-synced lyrics that Spotify already provides to its desktop client and remains inside the Spotify window. It does not contact an additional lyrics service unless you separately enable accurate online readings.

## Optional accurate readings and privacy

Online accurate readings are **off by default**. When enabled, the extension sends the current public track title and artist to the GD Studio search endpoint, then requests the selected track's synchronized lyrics and romanization from NetEase Cloud Music. If strict artist matching fails because the services use different scripts, it sends the public artist name to MusicBrainz and accepts only a high-confidence verified alias such as `Fujii Kaze` ↔ `藤井風`. The Spotify album name is used only for local result ranking. It uses that pronunciation data only to annotate the matching Spotify lyric line.

The extension does not send Spotify credentials, cookies, account data, or the lyrics rendered by Spotify. “Synchronized” means timestamp-paired provider lyrics and romanization; the extension does not listen to or transcribe audio. Successful matches are cached locally for up to 30 days; unavailable matches are remembered for 6 hours to avoid repeated requests, with at most 30 tracks retained. The settings page can clear this cache at any time. Provider availability and song coverage are not guaranteed, so local reading rules and the dictionary remain the automatic fallback.

## Uninstall

```powershell
powershell -ExecutionPolicy Bypass -File .\uninstall.ps1
```

On macOS:

```sh
sh ./uninstall.sh
```

## Troubleshooting

- **No Furigana page in the sidebar:** run `spicetify apply`, then restart Spotify.
- **The button appears but lyrics are unchanged:** make sure the song has Japanese lyrics containing kanji, enable the lyrics button, and wait briefly for the first local dictionary load.
- **Online accurate readings stay on the local fallback:** the provider may not have synchronized romanization, the album/version may not match safely, or the service may be temporarily unavailable. The extension deliberately refuses weak matches.
- **The app disappeared after a Spotify update:** close Spotify and open **Furigana for Spotify** from the Windows Start menu or `~/Applications` on macOS. If needed, run `spicetify backup apply` once.
- **The installer detects two Spotify installations:** keep either the Microsoft Store build or the [spotify.com build](https://www.spotify.com/download/windows/), remove the other, open the retained app for at least 60 seconds, then run the installer again.
- **Microsoft Store Spotify opens without Furigana:** close it and use **Furigana for Spotify** from the Start menu; do not use the regular Store shortcut.
- **macOS says Spotify or its preferences are missing:** install Spotify in `/Applications` or `~/Applications`, open it, sign in for at least 60 seconds, close it, and rerun `sh ./install.sh`.
- **The macOS launcher cannot find Spicetify:** reinstall Spicetify, open a new Terminal window, and rerun the Furigana installer so the launcher is rebuilt.
- **Need help with an issue:** open the Furigana app page and select **Copy diagnostics**. The report contains versions, settings, reading status, and selector counts, but never track titles, artists, lyrics, account data, or credentials.

## Known limitations

- Local mode handles common one- and two-person counters, but can still misread names, place names, wordplay, and intentionally unusual pronunciations. Online accurate readings improve supported songs but cannot cover every track or line.
- Spotify updates can change the lyrics DOM. If the extension stops working, include your Spotify and Spicetify versions in the issue.
- Web Player and mobile are not supported. macOS has automated installer/build coverage but is awaiting a published real-client verification report.

## Contributing

Found a problem or have an idea? Open an [Issue](https://github.com/huiishan99/spotify-furigana/issues) or read [CONTRIBUTING.md](./CONTRIBUTING.md) before submitting a pull request.

Security issues should be reported privately as described in [SECURITY.md](./SECURITY.md).

## Share the project

The ready-to-post English, Chinese, and Japanese launch copy is available in [docs/LAUNCH_KIT.md](./docs/LAUNCH_KIT.md). If the extension helps you, a [GitHub star](https://github.com/huiishan99/spotify-furigana) or a thoughtful compatibility report is the most useful support.

## Trademark notice

Furigana for Spotify is an independent open-source project. Spotify, the Spotify logo, and related brand elements are trademarks of Spotify AB. This project is not affiliated with, sponsored by, or endorsed by Spotify AB. “for Spotify” is used only to describe platform compatibility.

The project logo is an original design combining “ふ”, a ruby-annotation bar, and a music note. Its near-black, teal-emerald, and off-white palette suggests a music-streaming product while remaining distinct from Spotify Green; it does not use Spotify's circle, waves, or official logo. See the [Spotify Design & Branding Guidelines](https://developer.spotify.com/documentation/design).

## License

[MIT](./LICENSE)
