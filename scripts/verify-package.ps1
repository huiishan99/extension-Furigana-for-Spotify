[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-NonemptyFile {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf) -or (Get-Item -LiteralPath $Path).Length -eq 0) {
    throw "Required release file is missing or empty: ${Path}"
  }
}

# Avoid depending on PowerShell module autoloading when npm starts Windows
# PowerShell from a PowerShell 7 CI shell with an inherited PSModulePath.
function Get-PackageFileSha256 {
  param([Parameter(Mandatory = $true)][string]$Path)

  $stream = [System.IO.File]::OpenRead($Path)
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    return [BitConverter]::ToString($sha256.ComputeHash($stream)).Replace('-', '')
  } finally {
    $stream.Dispose()
    $sha256.Dispose()
  }
}

function Assert-ExecutableVersion {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Version
  )

  $metadata = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($Path)
  if ($metadata.FileVersion -ne "${Version}.0" -or $metadata.ProductVersion -ne $Version) {
    throw "Executable version does not match ${Version}: ${Path} (file $($metadata.FileVersion), product $($metadata.ProductVersion))."
  }
}

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$packageJson = Get-Content -Raw -LiteralPath (Join-Path $projectRoot "package.json") | ConvertFrom-Json
$version = [string]$packageJson.version
if ($version -notmatch '\A[0-9]+\.[0-9]+\.[0-9]+\z') {
  throw "Invalid stable release version: ${version}"
}
# Windows PowerShell 5.1 cannot parse package-lock.json's empty packages key.
# Node is already required for the build and preserves that key correctly.
& node -e "const fs = require('node:fs'); const lock = JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); if (lock.version !== process.argv[2] || lock.packages[''].version !== process.argv[2]) process.exit(1);" (Join-Path $projectRoot "package-lock.json") $version
if ($LASTEXITCODE -ne 0) {
  throw "package.json and package-lock.json versions must match."
}

$releaseRoot = Join-Path $projectRoot "release"
$stageRoot = Join-Path $releaseRoot "spotify-furigana-v${version}"
$archivePath = Join-Path $releaseRoot "spotify-furigana-v${version}.zip"
$setupPath = Join-Path $releaseRoot "Furigana-for-Spotify-Setup-v${version}.exe"
foreach ($artifact in @($archivePath, $setupPath)) {
  Assert-NonemptyFile -Path $artifact
  $checksumPath = "${artifact}.sha256"
  Assert-NonemptyFile -Path $checksumPath
  $checksumText = Get-Content -Raw -LiteralPath $checksumPath
  $escapedName = [regex]::Escape([System.IO.Path]::GetFileName($artifact))
  if ($checksumText -notmatch "\A(?<hash>[0-9a-fA-F]{64})[ \t]+\*?${escapedName}\r?\n?\z") {
    throw "Release checksum has an invalid filename or format: ${checksumPath}"
  }
  $expectedHash = $Matches.hash
  if ((Get-PackageFileSha256 -Path $artifact) -ne $expectedHash) {
    throw "Release checksum does not match: ${artifact}"
  }
}

$requiredFiles = @(
  "install.ps1", "uninstall.ps1", "install.sh", "uninstall.sh", "INSTALL.md", "LICENSE", "THIRD_PARTY_NOTICES.md",
  "spotify-furigana/manifest.json", "spotify-furigana/extension.js", "spotify-furigana/index.js", "spotify-furigana/style.css",
  "spotify-furigana/launcher.ps1", "spotify-furigana/launcher.sh", "spotify-furigana/overlay.ps1", "spotify-furigana/overlay-core.ps1",
  "spotify-furigana/Furigana for Spotify.exe", "spotify-furigana/FuriganaForSpotifyOverlay",
  "spotify-furigana/launcher.ico", "spotify-furigana/launcher.icns", "spotify-furigana/version.txt"
)
foreach ($name in @("base", "cc", "check", "tid", "tid_map", "tid_pos", "unk", "unk_char", "unk_compat", "unk_invoke", "unk_map", "unk_pos")) {
  $requiredFiles += "spotify-furigana/dict/${name}.dat.gz"
}
foreach ($relativePath in $requiredFiles) {
  Assert-NonemptyFile -Path (Join-Path $stageRoot $relativePath)
}
if (@(Get-ChildItem -LiteralPath (Join-Path $stageRoot "THIRD_PARTY_LICENSES") -File).Count -eq 0) {
  throw "The package is missing third-party license files."
}
$stagedVersion = (Get-Content -Raw -LiteralPath (Join-Path $stageRoot "spotify-furigana/version.txt")).Trim()
if ($stagedVersion -ne $version) {
  throw "Packaged version ${stagedVersion} does not match ${version}."
}
Assert-ExecutableVersion -Path (Join-Path $stageRoot "spotify-furigana/Furigana for Spotify.exe") -Version $version
Assert-ExecutableVersion -Path $setupPath -Version $version

# Compare the complete archive with the staged inputs without extracting or running it.
# This also rejects unexpected roots, duplicate paths, and traversal entries.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$expectedFiles = [System.Collections.Generic.Dictionary[string,string]]::new([StringComparer]::Ordinal)
foreach ($file in Get-ChildItem -LiteralPath $stageRoot -File -Recurse) {
  $relativePath = $file.FullName.Substring($stageRoot.Length + 1).Replace('\', '/')
  $expectedFiles[$relativePath] = $file.FullName
}
$seenFiles = [System.Collections.Generic.Dictionary[string,bool]]::new([StringComparer]::OrdinalIgnoreCase)
$archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
  foreach ($entry in $archive.Entries) {
    $entryPath = $entry.FullName.Replace('\', '/')
    if ($entryPath.StartsWith('/') -or $entryPath.Contains(':') -or $entryPath -match '(^|/)\.\.?(/|$)') {
      throw "Release archive contains an unsafe path: ${entryPath}"
    }
    if ($entryPath.EndsWith('/')) {
      continue
    }
    if (-not $expectedFiles.ContainsKey($entryPath) -or $seenFiles.ContainsKey($entryPath)) {
      throw "Release archive contains an unexpected or duplicate file: ${entryPath}"
    }
    $seenFiles[$entryPath] = $true
    $stream = $entry.Open()
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
      $archiveHash = [BitConverter]::ToString($sha256.ComputeHash($stream)).Replace('-', '')
    } finally {
      $stream.Dispose()
      $sha256.Dispose()
    }
    if ($archiveHash -ne (Get-PackageFileSha256 -Path $expectedFiles[$entryPath])) {
      throw "Release archive differs from the staged input: ${entryPath}"
    }
  }
  if ($seenFiles.Count -ne $expectedFiles.Count) {
    throw "Release archive is missing staged input files."
  }
} finally {
  $archive.Dispose()
}

Write-Host "Verified version ${version}: ZIP contents, Windows executable versions, and both SHA-256 files."
