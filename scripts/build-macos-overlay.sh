#!/bin/sh

set -eu

if [ "$(uname -s)" != "Darwin" ]; then
  printf 'The macOS overlay must be built on macOS.\n' >&2
  exit 1
fi

project_root=$(CDPATH= cd "$(dirname "$0")/.." && pwd -P)
source_file="$project_root/packaging/macos-overlay/main.swift"
output_root="$project_root/build/macos-overlay"
output_file="$output_root/FuriganaForSpotifyOverlay"
sdk_path=$(xcrun --sdk macosx --show-sdk-path)
mode=${1:---universal}

mkdir -p "$output_root"

compile_architecture() {
  architecture=$1
  destination=$2
  xcrun swiftc \
    -parse-as-library \
    -warnings-as-errors \
    -O \
    -whole-module-optimization \
    -target "$architecture-apple-macosx12.0" \
    -sdk "$sdk_path" \
    "$source_file" \
    -o "$destination"
}

case "$mode" in
  --native)
    compile_architecture "$(uname -m)" "$output_file"
    ;;
  --universal)
    arm_file="$output_root/FuriganaForSpotifyOverlay.arm64"
    intel_file="$output_root/FuriganaForSpotifyOverlay.x86_64"
    compile_architecture arm64 "$arm_file"
    compile_architecture x86_64 "$intel_file"
    xcrun lipo -create "$arm_file" "$intel_file" -output "$output_file"
    rm -f "$arm_file" "$intel_file"
    ;;
  *)
    printf 'Usage: %s [--native|--universal]\n' "$0" >&2
    exit 2
    ;;
esac

chmod 755 "$output_file"
codesign --force --sign - "$output_file"
"$output_file" --self-test
printf 'Built macOS overlay at %s\n' "$output_file"
