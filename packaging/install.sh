#!/bin/sh

set -eu

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

resolve_spicetify() {
  if command -v spicetify >/dev/null 2>&1; then
    command -v spicetify
    return
  fi

  for candidate in \
    "$HOME/.spicetify/spicetify" \
    "/opt/homebrew/bin/spicetify" \
    "/usr/local/bin/spicetify"
  do
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return
    fi
  done

  return 1
}

run_spicetify() {
  "$spicetify_executable" "$@"
}

stop_spotify() {
  if ! pgrep -x Spotify >/dev/null 2>&1; then
    return
  fi

  printf 'Closing Spotify before applying the extension...\n'
  pkill -TERM -x Spotify >/dev/null 2>&1 || true
  attempts=0
  while pgrep -x Spotify >/dev/null 2>&1 && [ "$attempts" -lt 20 ]; do
    sleep 0.25
    attempts=$((attempts + 1))
  done

  if pgrep -x Spotify >/dev/null 2>&1; then
    printf 'Spotify did not close in time; stopping it now.\n'
    pkill -KILL -x Spotify >/dev/null 2>&1 || true
  fi
}

create_launcher() {
  launcher_root=$1
  installed_icon=$2
  installed_launcher=$3
  installed_version_file=$4
  disable_auto_update=$5
  launcher_version=$6
  contents_root="$launcher_root/Contents"
  executable_root="$contents_root/MacOS"
  resources_root="$contents_root/Resources"
  launcher_executable="$executable_root/spotify-furigana"

  mkdir -p "$executable_root" "$resources_root"

  cp "$installed_launcher" "$launcher_executable"
  chmod 755 "$launcher_executable"
  cp "$installed_version_file" "$resources_root/version.txt"
  if [ "$disable_auto_update" = "1" ]; then
    : > "$resources_root/auto-update.disabled"
  fi

  cat > "$contents_root/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>Furigana for Spotify</string>
  <key>CFBundleExecutable</key>
  <string>spotify-furigana</string>
  <key>CFBundleIconFile</key>
  <string>launcher</string>
  <key>CFBundleIdentifier</key>
  <string>com.github.huiishan99.spotify-furigana.launcher</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>Furigana for Spotify</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>$launcher_version</string>
  <key>CFBundleVersion</key>
  <string>$launcher_version</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

  cp "$installed_icon" "$resources_root/launcher.icns"
}

if [ "$(uname -s)" != "Darwin" ]; then
  fail "This installer supports macOS only. On Windows, run install.ps1 from PowerShell."
fi

: "${HOME:?HOME is not set}"

script_root=$(CDPATH= cd "$(dirname "$0")" && pwd -P)
app_name="spotify-furigana"
source_app="$script_root/$app_name"
source_manifest="$source_app/manifest.json"
source_icon="$source_app/launcher.icns"
source_launcher="$source_app/launcher.sh"
source_version_file="$source_app/version.txt"

[ -f "$source_manifest" ] || fail "The release package is incomplete: $source_manifest is missing."
[ -f "$source_icon" ] || fail "The release package is incomplete: $source_icon is missing."
[ -f "$source_launcher" ] || fail "The release package is incomplete: $source_launcher is missing."
[ -f "$source_version_file" ] || fail "The release package is incomplete: $source_version_file is missing."
launcher_version=$(tr -d '[:space:]' < "$source_version_file")
printf '%s\n' "$launcher_version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || fail "The release package has invalid version metadata."
disable_auto_update=${SPOTIFY_FURIGANA_DISABLE_AUTO_UPDATE:-0}
case "$disable_auto_update" in
  0|1) ;;
  *) fail "SPOTIFY_FURIGANA_DISABLE_AUTO_UPDATE must be 0 or 1." ;;
esac

spotify_app=""
if [ -n "${SPOTIFY_FURIGANA_SPOTIFY_APP:-}" ]; then
  set -- "$SPOTIFY_FURIGANA_SPOTIFY_APP"
else
  set -- "/Applications/Spotify.app" "$HOME/Applications/Spotify.app"
fi
for candidate in "$@"; do
  if [ -d "$candidate" ]; then
    resolved_candidate=$(CDPATH= cd "$candidate" && pwd -P)
    if [ -n "$spotify_app" ] && [ "$resolved_candidate" != "$spotify_app" ]; then
      fail "Spotify was found in both /Applications and ~/Applications. Keep one installation, open it and sign in, then run this installer again."
    fi
    spotify_app=$resolved_candidate
  fi
done

[ -n "$spotify_app" ] || fail "Spotify for macOS was not found. Install it in /Applications or ~/Applications, open it and sign in, then run this installer again."

spotify_root="$spotify_app/Contents/Resources"
spotify_executable="$spotify_app/Contents/MacOS/Spotify"
prefs_path="$HOME/Library/Application Support/Spotify/prefs"
[ -x "$spotify_executable" ] || fail "Spotify is incomplete: $spotify_executable is missing."
[ -f "$prefs_path" ] || fail "Spotify's preferences file is missing at $prefs_path. Open Spotify, sign in for at least 60 seconds, close it, then run this installer again."

spicetify_executable=$(resolve_spicetify) || fail "Spicetify was not found. Install it from https://spicetify.app/docs/getting-started, open a new Terminal window, then run this installer again."

config_root="${XDG_CONFIG_HOME:-$HOME/.config}/spicetify"
custom_apps_root="$config_root/CustomApps"
target_app="$custom_apps_root/$app_name"
launcher_app="$HOME/Applications/Furigana for Spotify.app"
timestamp=$(date +%Y%m%d-%H%M%S)
backup_path=""
launcher_backup_path=""
install_complete=0

rollback() {
  status=$?
  if [ "$install_complete" -ne 1 ]; then
    if [ -e "$target_app" ]; then
      rm -rf "$target_app"
    fi
    if [ -n "$backup_path" ] && [ -e "$backup_path" ]; then
      mv "$backup_path" "$target_app"
    fi
    if [ -e "$launcher_app" ]; then
      rm -rf "$launcher_app"
    fi
    if [ -n "$launcher_backup_path" ] && [ -e "$launcher_backup_path" ]; then
      mv "$launcher_backup_path" "$launcher_app"
    fi
  fi
  exit "$status"
}
trap rollback EXIT

mkdir -p "$custom_apps_root" "$HOME/Applications"
if [ -e "$target_app" ]; then
  backup_path="$target_app.backup-$timestamp"
  [ ! -e "$backup_path" ] || fail "Backup path already exists: $backup_path"
  mv "$target_app" "$backup_path"
fi
if [ -e "$launcher_app" ]; then
  launcher_backup_path="$launcher_app.backup-$timestamp"
  [ ! -e "$launcher_backup_path" ] || fail "Launcher backup path already exists: $launcher_backup_path"
  mv "$launcher_app" "$launcher_backup_path"
fi

cp -R "$source_app" "$target_app"

run_spicetify config \
  spotify_path "$spotify_root" \
  prefs_path "$prefs_path" \
  custom_apps "$app_name"

stop_spotify
if ! run_spicetify -n apply; then
  printf 'The existing Spotify backup could not be applied. Refreshing it for the current Spotify version...\n'
  run_spicetify -n backup apply
fi

create_launcher \
  "$launcher_app" \
  "$target_app/launcher.icns" \
  "$target_app/launcher.sh" \
  "$target_app/version.txt" \
  "$disable_auto_update" \
  "$launcher_version"
if [ "${SPOTIFY_FURIGANA_NO_LAUNCH:-0}" != "1" ]; then
  run_spicetify auto
fi

install_complete=1
printf 'Furigana for Spotify was installed to %s.\n' "$target_app"
if [ -n "$backup_path" ]; then
  printf 'The previous installation was preserved at %s.\n' "$backup_path"
fi
if [ -n "$launcher_backup_path" ]; then
  printf 'The previous launcher was preserved at %s.\n' "$launcher_backup_path"
fi
printf 'A self-repairing launcher was created at %s.\n' "$launcher_app"
if [ "$disable_auto_update" = "1" ]; then
  printf 'Automatic Furigana release updates are disabled for this installation.\n'
else
  printf 'The launcher checks the official GitHub Release once every 24 hours and installs checksum-verified updates automatically.\n'
fi
printf 'Open Furigana for Spotify from Applications. It also runs spicetify auto so supported Spotify updates are reapplied before launch.\n'
