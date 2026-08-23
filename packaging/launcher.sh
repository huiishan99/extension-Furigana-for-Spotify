#!/bin/sh

set -u

PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.spicetify:$PATH"
export PATH

official_latest_url="https://github.com/huiishan99/spotify-furigana/releases/latest"
official_download_base="https://github.com/huiishan99/spotify-furigana/releases/download"
latest_url=$official_latest_url
download_base=$official_download_base
if [ "${SPOTIFY_FURIGANA_TEST_MODE:-0}" = "1" ]; then
  latest_url=${SPOTIFY_FURIGANA_TEST_LATEST_URL:-$official_latest_url}
  download_base=${SPOTIFY_FURIGANA_TEST_DOWNLOAD_BASE:-$official_download_base}
fi

launcher_contents=$(CDPATH= cd "$(dirname "$0")/.." && pwd -P)
version_file="$launcher_contents/Resources/version.txt"
disabled_marker="$launcher_contents/Resources/auto-update.disabled"
state_root="$HOME/Library/Application Support/Furigana for Spotify"
last_check_file="$state_root/last-update-check.txt"
log_file="$state_root/update.log"
lock_dir="$state_root/update.lock"
update_temp_root=""
lock_acquired=0

log_update() {
  mkdir -p "$state_root" 2>/dev/null || return 0
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$log_file" 2>/dev/null || true
}

cleanup() {
  if [ -n "$update_temp_root" ] && [ -d "$update_temp_root" ]; then
    temp_base=${TMPDIR:-/tmp}
    temp_base=${temp_base%/}
    case "$update_temp_root" in
      "$temp_base"/spotify-furigana-update.*) rm -rf "$update_temp_root" ;;
      *) log_update "Refused to remove an unexpected temporary update path." ;;
    esac
  fi
  if [ "$lock_acquired" -eq 1 ] && [ -d "$lock_dir" ]; then
    rmdir "$lock_dir" 2>/dev/null || true
  fi
}
trap cleanup EXIT HUP INT TERM

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

valid_version() {
  printf '%s\n' "$1" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'
}

version_is_newer() {
  current_major=${1%%.*}
  current_rest=${1#*.}
  current_minor=${current_rest%%.*}
  current_patch=${current_rest#*.}
  latest_major=${2%%.*}
  latest_rest=${2#*.}
  latest_minor=${latest_rest%%.*}
  latest_patch=${latest_rest#*.}

  [ "$latest_major" -gt "$current_major" ] && return 0
  [ "$latest_major" -lt "$current_major" ] && return 1
  [ "$latest_minor" -gt "$current_minor" ] && return 0
  [ "$latest_minor" -lt "$current_minor" ] && return 1
  [ "$latest_patch" -gt "$current_patch" ]
}

update_check_due() {
  [ "${SPOTIFY_FURIGANA_FORCE_UPDATE:-0}" = "1" ] && return 0
  [ ! -f "$last_check_file" ] && return 0
  last_check=$(cat "$last_check_file" 2>/dev/null || printf '0')
  case "$last_check" in
    ''|*[!0-9]*) return 0 ;;
  esac
  now=$(date +%s)
  [ $((now - last_check)) -ge 86400 ]
}

perform_update_check() {
  for command_name in curl shasum unzip; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
      log_update "Update check skipped because $command_name is unavailable."
      return 1
    fi
  done
  if [ ! -f "$version_file" ]; then
    log_update "Update check failed because installed version metadata is missing."
    return 1
  fi
  current_version=$(tr -d '[:space:]' < "$version_file")
  if ! valid_version "$current_version"; then
    log_update "Update check failed because installed version metadata is invalid."
    return 1
  fi

  resolved_latest_url=$(curl -fsSL --connect-timeout 5 --max-time 15 -o /dev/null -w '%{url_effective}' "$latest_url") || {
    log_update "Update check could not reach GitHub; continuing with the installed version."
    return 1
  }
  tag_name=${resolved_latest_url##*/}
  case "$tag_name" in
    v*) latest_version=${tag_name#v} ;;
    *) log_update "Update check received an unsupported release tag."; return 1 ;;
  esac
  if ! valid_version "$latest_version"; then
    log_update "Update check received an unsupported release version."
    return 1
  fi
  if ! version_is_newer "$current_version" "$latest_version"; then
    log_update "No update available (installed $current_version, latest $latest_version)."
    return 0
  fi

  archive_name="spotify-furigana-v$latest_version.zip"
  checksum_name="$archive_name.sha256"
  archive_url="${download_base%/}/$tag_name/$archive_name"
  checksum_url="${download_base%/}/$tag_name/$checksum_name"
  update_temp_root=$(mktemp -d "${TMPDIR:-/tmp}/spotify-furigana-update.XXXXXX") || {
    log_update "Could not create a temporary update directory."
    return 1
  }
  archive_path="$update_temp_root/$archive_name"
  checksum_path="$update_temp_root/$checksum_name"
  curl -fL --connect-timeout 5 --max-time 60 -o "$archive_path" "$archive_url" >/dev/null 2>&1 || {
    log_update "Could not download release $latest_version; continuing with the installed version."
    return 1
  }
  curl -fL --connect-timeout 5 --max-time 30 -o "$checksum_path" "$checksum_url" >/dev/null 2>&1 || {
    log_update "Could not download the release checksum; continuing with the installed version."
    return 1
  }

  expected_hash=$(awk -v file="$archive_name" 'length($1) == 64 && $1 !~ /[^0-9A-Fa-f]/ && $2 == file { print tolower($1); exit }' "$checksum_path")
  [ -n "$expected_hash" ] || {
    log_update "Release checksum file has an invalid format; update was not installed."
    return 1
  }
  actual_hash=$(shasum -a 256 "$archive_path" | awk '{ print tolower($1) }')
  if [ "$actual_hash" != "$expected_hash" ]; then
    log_update "Release archive SHA-256 did not match; update was not installed."
    return 1
  fi

  extract_root="$update_temp_root/extracted"
  mkdir -p "$extract_root"
  unzip -q "$archive_path" -d "$extract_root" || {
    log_update "Release archive could not be extracted; update was not installed."
    return 1
  }
  install_script="$extract_root/install.sh"
  package_manifest="$extract_root/spotify-furigana/manifest.json"
  package_version_file="$extract_root/spotify-furigana/version.txt"
  if [ ! -f "$install_script" ] || [ ! -f "$package_manifest" ] || [ ! -f "$package_version_file" ]; then
    log_update "Downloaded release is incomplete; update was not installed."
    return 1
  fi
  package_version=$(tr -d '[:space:]' < "$package_version_file")
  if [ "$package_version" != "$latest_version" ]; then
    log_update "Downloaded package version did not match the release tag; update was not installed."
    return 1
  fi

  SPOTIFY_FURIGANA_NO_LAUNCH=1 /bin/sh "$install_script" >/dev/null 2>&1 || {
    log_update "Release installer failed; continuing with the previous installation."
    return 1
  }
  log_update "Updated automatically from $current_version to $latest_version."
  return 0
}

spicetify_executable=$(resolve_spicetify) || {
  osascript -e 'display alert "Furigana for Spotify" message "Spicetify was not found. Reinstall Spicetify, then run the Furigana installer again." as critical' >/dev/null 2>&1 || true
  exit 1
}

if [ "${SPOTIFY_FURIGANA_SKIP_UPDATE:-0}" != "1" ] && [ ! -f "$disabled_marker" ] && update_check_due; then
  mkdir -p "$state_root" 2>/dev/null || true
  if mkdir "$lock_dir" 2>/dev/null; then
    lock_acquired=1
    date +%s > "$last_check_file" 2>/dev/null || true
    perform_update_check || true
  else
    log_update "Another launcher is already checking for updates; skipped this check."
  fi
fi

cleanup
trap - EXIT HUP INT TERM
exec "$spicetify_executable" auto
