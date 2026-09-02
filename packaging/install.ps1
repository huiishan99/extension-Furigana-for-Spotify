[CmdletBinding()]
param(
  [switch]$NoLaunch,
  [switch]$DisableAutoUpdate,
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

  throw "Spicetify was not found. Install it from https://spicetify.app/docs/getting-started, open a new PowerShell window, then run this installer again."
}

function Invoke-Spicetify {
  param(
    [Parameter(Mandatory = $true)][string]$Executable,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [string]$StandardInput
  )

  if ($PSBoundParameters.ContainsKey("StandardInput")) {
    $StandardInput | & $Executable @Arguments
  } else {
    & $Executable @Arguments
  }
  if ($LASTEXITCODE -ne 0) {
    throw "spicetify $($Arguments -join ' ') failed with exit code ${LASTEXITCODE}."
  }
}

function New-FuriganaShortcut {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$LauncherExecutable,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory
  )

  $shortcutRoot = Split-Path -Parent $Path
  New-Item -ItemType Directory -Path $shortcutRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $WorkingDirectory -Force | Out-Null

  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $null
  try {
    $shortcut = $shell.CreateShortcut($Path)
    $shortcut.TargetPath = $LauncherExecutable
    $shortcut.Arguments = ""
    $shortcut.WorkingDirectory = $WorkingDirectory
    $shortcut.IconLocation = "${LauncherExecutable},0"
    $shortcut.Description = "Update, repair, and launch Furigana for Spotify"
    $shortcut.WindowStyle = 7
    $shortcut.Save()
  } finally {
    if ($shortcut) {
      [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($shortcut)
    }
    [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell)
  }
}

function Sync-RegisteredInstaller {
  param(
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $true)][string]$InstallerSourceRoot
  )

  $registeredInstallRoot = [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "Programs\Furigana for Spotify"))
  $uninstallRoot = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall"
  if (-not (Test-Path -LiteralPath $uninstallRoot)) {
    return
  }

  foreach ($uninstallKey in Get-ChildItem -LiteralPath $uninstallRoot -ErrorAction SilentlyContinue) {
    $entry = Get-ItemProperty -LiteralPath $uninstallKey.PSPath -ErrorAction SilentlyContinue
    if (-not $entry -or $entry.DisplayName -notmatch '^Furigana for Spotify(?: \d+\.\d+\.\d+)?$' -or -not $entry.InstallLocation) {
      continue
    }

    $entryInstallRoot = [System.IO.Path]::GetFullPath([string]$entry.InstallLocation).TrimEnd('\')
    if (-not $entryInstallRoot.Equals($registeredInstallRoot.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
      continue
    }

    Set-ItemProperty -LiteralPath $uninstallKey.PSPath -Name "DisplayVersion" -Value $Version
    foreach ($lifecycleScript in @("install.ps1", "uninstall.ps1")) {
      $sourceScript = Join-Path $InstallerSourceRoot $lifecycleScript
      $registeredScript = Join-Path $registeredInstallRoot $lifecycleScript
      if ((Test-Path -LiteralPath $sourceScript -PathType Leaf) -and
          -not ([System.IO.Path]::GetFullPath($sourceScript).Equals([System.IO.Path]::GetFullPath($registeredScript), [System.StringComparison]::OrdinalIgnoreCase))) {
        Copy-Item -LiteralPath $sourceScript -Destination $registeredScript -Force
      }
    }
    return
  }
}

$appName = "spotify-furigana"
$sourceApp = Join-Path $PSScriptRoot $appName
$sourceManifest = Join-Path $sourceApp "manifest.json"
$sourceLauncherIcon = Join-Path $sourceApp "launcher.ico"
$sourceLauncherScript = Join-Path $sourceApp "launcher.ps1"
$sourceLauncherExecutable = Join-Path $sourceApp "Furigana for Spotify.exe"
$sourceOverlayScript = Join-Path $sourceApp "overlay.ps1"
$sourceVersionFile = Join-Path $sourceApp "version.txt"
if (-not (Test-Path -LiteralPath $sourceManifest)) {
  throw "The release package is incomplete: ${sourceManifest} is missing."
}
if (-not (Test-Path -LiteralPath $sourceLauncherIcon -PathType Leaf)) {
  throw "The release package is incomplete: ${sourceLauncherIcon} is missing."
}
if (-not (Test-Path -LiteralPath $sourceLauncherScript -PathType Leaf)) {
  throw "The release package is incomplete: ${sourceLauncherScript} is missing."
}
if (-not (Test-Path -LiteralPath $sourceLauncherExecutable -PathType Leaf)) {
  throw "The release package is incomplete: ${sourceLauncherExecutable} is missing."
}
if (-not (Test-Path -LiteralPath $sourceOverlayScript -PathType Leaf)) {
  throw "The release package is incomplete: ${sourceOverlayScript} is missing."
}
if (-not (Test-Path -LiteralPath $sourceVersionFile -PathType Leaf)) {
  throw "The release package is incomplete: ${sourceVersionFile} is missing."
}
$sourceVersion = (Get-Content -Raw -LiteralPath $sourceVersionFile).Trim()
if ($sourceVersion -notmatch '^\d+\.\d+\.\d+$') {
  throw "The release package contains an invalid version: ${sourceVersion}"
}

$storeSpotify = Get-AppxPackage -Name "SpotifyAB.SpotifyMusic" -ErrorAction SilentlyContinue | Select-Object -First 1
$websiteSpotifyRoot = Join-Path $env:APPDATA "Spotify"
$websiteSpotifyExecutable = Join-Path $websiteSpotifyRoot "Spotify.exe"
$websiteSpotifyInstalled = Test-Path -LiteralPath $websiteSpotifyExecutable -PathType Leaf
if ($storeSpotify -and $websiteSpotifyInstalled) {
  throw "Both Microsoft Store Spotify and spotify.com Spotify are installed. Keep only one version, open it and sign in for at least 60 seconds, then run this installer again."
}

if ($storeSpotify) {
  $spotifyInstallType = "Microsoft Store"
  $spotifyRoot = $storeSpotify.InstallLocation
  $spotifyExecutable = Join-Path $spotifyRoot "Spotify.exe"
  $prefsPath = Join-Path $env:LOCALAPPDATA "Packages\$($storeSpotify.PackageFamilyName)\LocalState\Spotify\prefs"
} elseif ($websiteSpotifyInstalled) {
  $spotifyInstallType = "spotify.com desktop"
  $spotifyRoot = $websiteSpotifyRoot
  $spotifyExecutable = $websiteSpotifyExecutable
  $prefsPath = Join-Path $spotifyRoot "prefs"
} else {
  throw "Spotify for Windows was not found. Install it from https://www.spotify.com/download/windows/, open it and sign in for at least 60 seconds, then run this installer again."
}
if (-not (Test-Path -LiteralPath $prefsPath -PathType Leaf)) {
  throw "Spotify's preferences file is missing at ${prefsPath}. Open Spotify, sign in for at least 60 seconds, close it, then run this installer again."
}

$spicetifyExecutable = Resolve-SpicetifyExecutable
$customAppsRoot = Join-Path $env:APPDATA "spicetify\CustomApps"
$targetApp = Join-Path $customAppsRoot $appName
$expectedPrefix = [System.IO.Path]::GetFullPath($customAppsRoot).TrimEnd('\') + '\'
$resolvedTarget = [System.IO.Path]::GetFullPath($targetApp)
if (-not $resolvedTarget.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to install outside the Spicetify CustomApps directory: ${resolvedTarget}"
}

$startMenuPrograms = Join-Path ([Environment]::GetFolderPath("StartMenu")) "Programs"
$shortcutPath = Join-Path $startMenuPrograms "Furigana for Spotify.lnk"
$legacyShortcutPath = Join-Path $startMenuPrograms "Spotify with Furigana.lnk"
$launcherStateRoot = Join-Path $env:LOCALAPPDATA "Furigana for Spotify"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = $null
$shortcutBackupPath = $null
$legacyShortcutBackupPath = $null

New-Item -ItemType Directory -Path $customAppsRoot -Force | Out-Null
if (Test-Path -LiteralPath $targetApp) {
  $backupPath = "${targetApp}.backup-${timestamp}"
  if (Test-Path -LiteralPath $backupPath) {
    throw "Backup path already exists: ${backupPath}"
  }
  Move-Item -LiteralPath $targetApp -Destination $backupPath
}
if (-not $SkipShortcut -and (Test-Path -LiteralPath $shortcutPath)) {
  $shortcutBackupPath = "${shortcutPath}.backup-${timestamp}"
  Move-Item -LiteralPath $shortcutPath -Destination $shortcutBackupPath
}
if (-not $SkipShortcut -and (Test-Path -LiteralPath $legacyShortcutPath)) {
  $legacyShortcutBackupPath = "${legacyShortcutPath}.backup-${timestamp}"
  Move-Item -LiteralPath $legacyShortcutPath -Destination $legacyShortcutBackupPath
}

try {
  Copy-Item -LiteralPath $sourceApp -Destination $targetApp -Recurse
  if ($DisableAutoUpdate) {
    New-Item -ItemType File -Path (Join-Path $targetApp "auto-update.disabled") -Force | Out-Null
  }

  Invoke-Spicetify -Executable $spicetifyExecutable -Arguments @(
    "config",
    "spotify_path", $spotifyRoot,
    "prefs_path", $prefsPath,
    "custom_apps", $appName
  )

  $spotifyProcesses = Get-Process -Name "Spotify" -ErrorAction SilentlyContinue
  if ($spotifyProcesses) {
    Write-Host "Closing Spotify before applying the extension..."
    $spotifyProcesses | Stop-Process -Force
    $spotifyProcesses | Wait-Process -ErrorAction SilentlyContinue
  }

  & $spicetifyExecutable -n apply
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "The existing Spotify backup could not be applied. Refreshing the backup for the current Spotify version..."
    if ($storeSpotify) {
      Invoke-Spicetify -Executable $spicetifyExecutable -Arguments @("-n", "backup", "apply") -StandardInput "y"
    } else {
      Invoke-Spicetify -Executable $spicetifyExecutable -Arguments @("-n", "backup", "apply")
    }
  }
  $installedLauncherIcon = Join-Path $targetApp "launcher.ico"
  $installedLauncherScript = Join-Path $targetApp "launcher.ps1"
  $installedLauncherExecutable = Join-Path $targetApp "Furigana for Spotify.exe"
  $installedOverlayScript = Join-Path $targetApp "overlay.ps1"
  if (-not (Test-Path -LiteralPath $installedOverlayScript -PathType Leaf)) {
    throw "The installed desktop overlay is missing: ${installedOverlayScript}"
  }
  if (-not (Test-Path -LiteralPath $installedLauncherExecutable -PathType Leaf)) {
    throw "The installed native launcher is missing: ${installedLauncherExecutable}"
  }
  if (-not $SkipShortcut) {
    New-FuriganaShortcut -Path $shortcutPath -LauncherExecutable $installedLauncherExecutable -WorkingDirectory $launcherStateRoot
  }
  if (-not $NoLaunch) {
    $powerShellExecutable = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
    if (-not (Test-Path -LiteralPath $powerShellExecutable -PathType Leaf)) {
      throw "Windows PowerShell was not found at ${powerShellExecutable}."
    }
    & $powerShellExecutable -NoProfile -ExecutionPolicy Bypass -File $installedLauncherScript -SkipUpdateCheck
    if ($LASTEXITCODE -ne 0) {
      throw "The Furigana launcher failed with exit code ${LASTEXITCODE}."
    }
  }
} catch {
  if (Test-Path -LiteralPath $targetApp) {
    Remove-Item -LiteralPath $targetApp -Recurse -Force
  }
  if ($backupPath -and (Test-Path -LiteralPath $backupPath)) {
    Move-Item -LiteralPath $backupPath -Destination $targetApp
  }
  if (Test-Path -LiteralPath $shortcutPath) {
    Remove-Item -LiteralPath $shortcutPath -Force
  }
  if ($shortcutBackupPath -and (Test-Path -LiteralPath $shortcutBackupPath)) {
    Move-Item -LiteralPath $shortcutBackupPath -Destination $shortcutPath
  }
  if ($legacyShortcutBackupPath -and (Test-Path -LiteralPath $legacyShortcutBackupPath)) {
    Move-Item -LiteralPath $legacyShortcutBackupPath -Destination $legacyShortcutPath
  }
  throw
}

Sync-RegisteredInstaller -Version $sourceVersion -InstallerSourceRoot $PSScriptRoot

Write-Host "Furigana for Spotify was installed to ${targetApp}."
if ($backupPath) {
  Write-Host "The previous installation was preserved at ${backupPath}."
}
if ($shortcutBackupPath) {
  Write-Host "The previous launcher shortcut was preserved at ${shortcutBackupPath}."
}
if ($legacyShortcutBackupPath) {
  Write-Host "The legacy launcher shortcut was preserved at ${legacyShortcutBackupPath}."
}
if ($SkipShortcut) {
  Write-Host "The graphical installer manages the Start menu and optional desktop shortcuts."
} else {
  Write-Host "A discoverable self-repairing launcher was created at ${shortcutPath}."
}
Write-Host "Configured Spotify installation: ${spotifyInstallType}."
if ($DisableAutoUpdate) {
  Write-Host "Automatic Furigana release updates are disabled for this installation."
} else {
  Write-Host "The launcher checks the official GitHub Release once every 24 hours and installs checksum-verified updates automatically."
}
Write-Host "Open 'Furigana for Spotify' from the Start menu. It also runs 'spicetify auto' so Spotify updates are reapplied before launch."
