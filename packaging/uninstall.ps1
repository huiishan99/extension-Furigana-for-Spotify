[CmdletBinding()]
param(
  [switch]$NoLaunch,
  [switch]$SkipShortcut
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-SpicetifyExecutable {
  $command = Get-Command "spicetify" -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($command) {
    return $command.Path
  }

  $candidates = @(
    (Join-Path $env:USERPROFILE ".spicetify\spicetify.exe"),
    (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\spicetify.exe")
  )

  $wingetPackages = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages"
  if (Test-Path -LiteralPath $wingetPackages) {
    $candidates += Get-ChildItem -LiteralPath $wingetPackages -Directory -Filter "Spicetify.Spicetify_*" -ErrorAction SilentlyContinue |
      ForEach-Object { Join-Path $_.FullName "spicetify.exe" }
  }

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return [System.IO.Path]::GetFullPath($candidate)
    }
  }

  throw "Spicetify was not found. Install or repair Spicetify before uninstalling Furigana for Spotify."
}

function Invoke-Spicetify {
  param(
    [Parameter(Mandatory = $true)][string]$Executable,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )

  & $Executable @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "spicetify $($Arguments -join ' ') failed with exit code ${LASTEXITCODE}."
  }
}

$appName = "spotify-furigana"
$spicetifyExecutable = Resolve-SpicetifyExecutable
Invoke-Spicetify -Executable $spicetifyExecutable -Arguments @("config", "custom_apps", "${appName}-")

$spotifyProcesses = Get-Process -Name "Spotify" -ErrorAction SilentlyContinue
if ($spotifyProcesses) {
  Write-Host "Closing Spotify before removing the extension..."
  $spotifyProcesses | Stop-Process -Force
  $spotifyProcesses | Wait-Process -ErrorAction SilentlyContinue
}
Invoke-Spicetify -Executable $spicetifyExecutable -Arguments @("-n", "apply")

$customAppsRoot = Join-Path $env:APPDATA "spicetify\CustomApps"
$targetApp = Join-Path $customAppsRoot $appName
$expectedPrefix = [System.IO.Path]::GetFullPath($customAppsRoot).TrimEnd('\') + '\'
$resolvedTarget = [System.IO.Path]::GetFullPath($targetApp)
if (-not $resolvedTarget.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to move a path outside the Spicetify CustomApps directory: ${resolvedTarget}"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
if (Test-Path -LiteralPath $targetApp) {
  $removedPath = "${targetApp}.removed-${timestamp}"
  Move-Item -LiteralPath $targetApp -Destination $removedPath
  Write-Host "Furigana for Spotify was disabled and moved to ${removedPath}."
} else {
  Write-Host "No installed Furigana for Spotify directory was found."
}

$startMenuPrograms = Join-Path ([Environment]::GetFolderPath("StartMenu")) "Programs"
$shortcutPaths = @(
  (Join-Path $startMenuPrograms "Furigana for Spotify.lnk"),
  (Join-Path $startMenuPrograms "Spotify with Furigana.lnk")
)
if (-not $SkipShortcut) {
  foreach ($shortcutPath in $shortcutPaths) {
    if (Test-Path -LiteralPath $shortcutPath) {
      $removedShortcutPath = "${shortcutPath}.removed-${timestamp}"
      Move-Item -LiteralPath $shortcutPath -Destination $removedShortcutPath
      Write-Host "The launcher shortcut was moved to ${removedShortcutPath}."
    }
  }
}

$updateStateRoot = Join-Path $env:LOCALAPPDATA "Furigana for Spotify"
if (Test-Path -LiteralPath $updateStateRoot) {
  $removedUpdateStatePath = "${updateStateRoot}.removed-${timestamp}"
  if (Test-Path -LiteralPath $removedUpdateStatePath) {
    throw "Update-state removal path already exists: ${removedUpdateStatePath}"
  }
  Move-Item -LiteralPath $updateStateRoot -Destination $removedUpdateStatePath
  Write-Host "The automatic-update state and log were moved to ${removedUpdateStatePath}."
}

if (-not $NoLaunch) {
  Invoke-Spicetify -Executable $spicetifyExecutable -Arguments @("auto")
}
