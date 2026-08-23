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

  printf 'Closing Spotify before removing the extension...\n'
  pkill -TERM -x Spotify >/dev/null 2>&1 || true
  attempts=0
  while pgrep -x Spotify >/dev/null 2>&1 && [ "$attempts" -lt 20 ]; do
    sleep 0.25
    attempts=$((attempts + 1))
  done

  if pgrep -x Spotify >/dev/null 2>&1; then
    pkill -KILL -x Spotify >/dev/null 2>&1 || true
  fi
}

if [ "$(uname -s)" != "Darwin" ]; then
  fail "This uninstaller supports macOS only. On Windows, run uninstall.ps1 from PowerShell."
fi

: "${HOME:?HOME is not set}"

app_name="spotify-furigana"
spicetify_executable=$(resolve_spicetify) || fail "Spicetify was not found. Install or repair Spicetify before uninstalling Furigana for Spotify."
config_root="${XDG_CONFIG_HOME:-$HOME/.config}/spicetify"
custom_apps_root="$config_root/CustomApps"
target_app="$custom_apps_root/$app_name"
launcher_app="$HOME/Applications/Furigana for Spotify.app"
update_state_root="$HOME/Library/Application Support/Furigana for Spotify"
timestamp=$(date +%Y%m%d-%H%M%S)

run_spicetify config custom_apps "$app_name-"
stop_spotify
run_spicetify -n apply

if [ -e "$target_app" ]; then
  removed_path="$target_app.removed-$timestamp"
  [ ! -e "$removed_path" ] || fail "Removal path already exists: $removed_path"
  mv "$target_app" "$removed_path"
  printf 'Furigana for Spotify was disabled and moved to %s.\n' "$removed_path"
else
  printf 'No installed Furigana for Spotify directory was found.\n'
fi

if [ -e "$launcher_app" ]; then
  removed_launcher_path="$launcher_app.removed-$timestamp"
  [ ! -e "$removed_launcher_path" ] || fail "Launcher removal path already exists: $removed_launcher_path"
  mv "$launcher_app" "$removed_launcher_path"
  printf 'The launcher was moved to %s.\n' "$removed_launcher_path"
fi

if [ -e "$update_state_root" ]; then
  removed_update_state_path="$update_state_root.removed-$timestamp"
  [ ! -e "$removed_update_state_path" ] || fail "Update-state removal path already exists: $removed_update_state_path"
  mv "$update_state_root" "$removed_update_state_path"
  printf 'The automatic-update state and log were moved to %s.\n' "$removed_update_state_path"
fi

run_spicetify auto
