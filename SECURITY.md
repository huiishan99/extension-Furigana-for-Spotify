# Security Policy

## Supported versions

Security fixes are applied to the latest release.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability.

Use GitHub's private vulnerability reporting feature for this repository. Include the affected version, impact, reproduction steps, and any suggested mitigation. Do not include Spotify credentials, cookies, account data, or complete lyrics.

You can expect an initial acknowledgement within seven days. A public advisory or fix will be coordinated after the issue has been assessed.

## Scope

Furigana for Spotify processes lyrics already rendered by Spotify and performs reading conversion locally by default. If the user explicitly enables experimental online accurate readings, the extension sends the current public track title and artist to the GD Studio search endpoint, then requests the selected track's synchronized lyrics and romanization from NetEase Cloud Music. When strict artist matching fails because providers use different scripts, the public artist name is sent to MusicBrainz for high-confidence alias verification. The Spotify album name is used only for local result ranking. It does not send Spotify credentials, cookies, or the lyrics rendered by Spotify. Matched reading data is cached only in Spotify's local storage.

Starting with v0.5.0, the branded launcher checks this repository's public `github.com` latest-Release page at most once every 24 hours unless automatic updates were disabled during installation. It sends no Spotify data. A newer stable package is installed only after the downloaded ZIP matches the adjacent published SHA-256 file and its internal version matches the release tag. Update errors are logged locally and do not prevent the installed version from launching.

Starting with v0.5.1, the settings page can copy a local troubleshooting report. It contains the Furigana and Spicetify versions, platform, UI language, display settings, online-reading state, lyric-selector counts, and annotation counts. It does not contain track titles, artists, Spotify URIs, lyrics, account data, cookies, tokens, or credentials. The report remains in Spotify's local storage until the runtime state changes and is shared only when the user explicitly copies it.

Reports involving unsafe DOM insertion, network requests outside the three disclosed online-reading hosts and the documented GitHub release paths, accidental online-mode activation, release package tampering, updater verification bypasses, or installer path handling are especially useful.
