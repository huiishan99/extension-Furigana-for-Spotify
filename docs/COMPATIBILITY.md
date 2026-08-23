# Compatibility matrix

This page separates real-client verification from automated layout coverage. A selector fixture or successful build is useful regression evidence, but it is not presented as a real Spotify runtime test.

## Verified on a real client

| Date | OS | Spotify Desktop | Spicetify | Lyrics layout | Result |
| --- | --- | --- | --- | --- | --- |
| 2026-08-23 | Windows 11 Pro 10.0.26200 | Microsoft Store 1.2.96.518 | 2.44.0 | `.lyrics-lyricsContent-text` | Pass (playbar icon 16×16 runtime geometry) |
| 2026-08-21 | Windows 11 Pro 10.0.26200 | Microsoft Store 1.2.96.518 | 2.44.0 | `.lyrics-lyricsContent-text` | Pass (v0.4.3 English/Chinese/Japanese UI) |
| 2026-08-19 | Windows 11 Pro 10.0.26200 | Microsoft Store 1.2.96.518 | 2.44.0 | `.lyrics-lyricsContent-text` | Pass (v0.4.2 artist aliases + release fallback) |
| 2026-08-19 | Windows 11 Pro 10.0.26200 | Microsoft Store 1.2.96.518 | 2.44.0 | `.lyrics-lyricsContent-text` | Pass (v0.4.1 local counter fallback) |
| 2026-08-17 | Windows 11 Pro 10.0.26200 | Microsoft Store 1.2.96.518 | 2.44.0 | `.lyrics-lyricsContent-text` | Pass (v0.3.0 install + online transport/fallback + live ruby) |
| 2026-08-17 | Windows 11 Pro 10.0.26200 | Microsoft Store 1.2.96.518 | 2.44.0 | `.lyrics-lyricsContent-text` | Pass (Release install + full `auto` relaunch) |
| 2026-08-16 | Windows 11 Pro 10.0.26200 | Microsoft Store 1.2.96.518 | 2.44.0 | `.lyrics-lyricsContent-text` | Pass |

The 2026-08-16 real-client check covered extension injection, playbar toggling, local dictionary loading, and live furigana rendering in the standard lyrics view. The first 2026-08-17 check covered the packaged v0.2.2 installer, Store path configuration, applied-build hashes, the generated `spicetify auto` launcher, a complete close/relaunch cycle with `--app-directory`, and the `Furigana for Spotify` control in the Windows accessibility tree. The v0.3.0 check covered its packaged upgrade, the opt-in settings and privacy UI, request and cache state inside Spotify, cache clearing with an immediate retry, live fallback rendering (59 ruby elements across 32 lyric lines), and successful Spotify-runtime transport of a known NetEase synchronized sample for `二人だけの空が広がる夜に`. The final alignment of that sample is covered by automated integration tests rather than a playback claim. The v0.4.1 check installed the packaged build and inserted a temporary off-screen lyric node into the real Spotify DOM: `一人`, `二人`, `1人`, and `2人` rendered as `ひとり`, `ふたり`, `ひとり`, and `ふたり`, while `一人称` and `二人三脚` retained their dictionary readings. The v0.4.2 check installed the packaged build and matched 35 synchronized lines for `旅路` by Spotify artist `Fujii Kaze`: the Spotify-runtime trace verified `藤井風` through MusicBrainz, skipped the matching-album provider release because it lacked romanization, and selected another exact-title, exact-artist official release that contained it. The v0.4.3 check installed the packaged build, detected the real Spotify document language as English, switched the complete settings UI live through Simplified Chinese and Japanese, persisted each explicit preference, and returned to automatic English before a clean relaunch. The 2026-08-23 check measured the live playbar DOM before and after the icon fix: the button remained 32×32 and directly before Lyrics, while the icon wrapper and SVG changed from zero width/`0 × 0` to `16 × 16`. Temporary runtime inspection code was removed afterward. The regular Microsoft Store shortcut remains unsupported because it opens the unmodified UI.

Spicetify 2.44.0 officially lists Spotify compatibility through 1.2.93. The 1.2.96.518 rows record this project's direct test evidence and do not expand Spicetify's official compatibility claim.

macOS installation, rollback, launcher, shell syntax, build, and selector contracts are covered by automated checks. No macOS real-client row has been recorded yet, so this page does not present macOS as real-client verified.

## Automated compatibility contracts

Every CI run checks the following known Spotify lyrics layouts:

| Layout family | Selector | Evidence |
| --- | --- | --- |
| Current desktop | `.lyrics-lyricsContent-text` | Selector regression test |
| Earlier standard lyrics | `[data-testid="lyrics-line"]` | Selector regression test |
| Earlier fullscreen lyrics | `[data-testid="fullscreen-lyric"]` | Selector regression test |

CI runs TypeScript checks, unit tests, and the production bundle on Windows, macOS, and Linux. These checks catch selector removal, settings regressions, local reading-engine failures, unsafe package changes, invalid macOS shell installers, and platform-specific build problems.

## Report another working version

Open a compatibility report using the repository's bug-report form and include:

- operating system, Spotify Desktop, and Spicetify versions;
- standard or fullscreen lyrics view;
- whether the playbar toggle and settings page work;
- whether hiragana, katakana, and romaji modes render;
- console errors with account information removed.

Do not paste complete copyrighted lyrics. Confirmed reports can be added to the real-client table through a pull request.
