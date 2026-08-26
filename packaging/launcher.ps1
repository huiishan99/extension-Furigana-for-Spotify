[CmdletBinding()]
param(
  [switch]$SkipUpdateCheck,
  [ValidateRange(0, 720)][int]$UpdateIntervalHours = 24,
  [string]$ReleaseLatestUrl = "https://github.com/huiishan99/spotify-furigana/releases/latest",
  [string]$ReleaseDownloadBaseUrl = "https://github.com/huiishan99/spotify-furigana/releases/download"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$officialReleaseLatestUrl = "https://github.com/huiishan99/spotify-furigana/releases/latest"
$officialDownloadBaseUrl = "https://github.com/huiishan99/spotify-furigana/releases/download"
$testMode = $env:SPOTIFY_FURIGANA_TEST_MODE -eq "1"
if (-not $testMode -and (
  $ReleaseLatestUrl -ne $officialReleaseLatestUrl -or
  $ReleaseDownloadBaseUrl -ne $officialDownloadBaseUrl
)) {
  throw "Custom update sources are available only in test mode."
}

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

  throw "Spicetify was not found. Reinstall Spicetify, then run the Furigana installer again."
}

function Write-UpdateLog {
  param(
    [Parameter(Mandatory = $true)][string]$StateRoot,
    [Parameter(Mandatory = $true)][string]$Message
  )

  try {
    New-Item -ItemType Directory -Path $StateRoot -Force | Out-Null
    $timestamp = [DateTime]::UtcNow.ToString("o")
    Add-Content -LiteralPath (Join-Path $StateRoot "update.log") -Value "${timestamp} ${Message}" -Encoding UTF8
  } catch {
    # Logging must never prevent Spotify from launching.
  }
}

function Test-UpdateCheckDue {
  param(
    [Parameter(Mandatory = $true)][string]$StateFile,
    [Parameter(Mandatory = $true)][int]$IntervalHours
  )

  if ($IntervalHours -eq 0 -or -not (Test-Path -LiteralPath $StateFile -PathType Leaf)) {
    return $true
  }

  try {
    $lastCheck = [DateTime]::Parse(
      (Get-Content -Raw -LiteralPath $StateFile).Trim(),
      [Globalization.CultureInfo]::InvariantCulture,
      [Globalization.DateTimeStyles]::RoundtripKind
    ).ToUniversalTime()
    return ([DateTime]::UtcNow - $lastCheck).TotalHours -ge $IntervalHours
  } catch {
    return $true
  }
}

function Get-FileSha256 {
  param(
    [Parameter(Mandatory = $true)][string]$Path
  )

  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $hashBytes = $sha256.ComputeHash($stream)
    return -join ($hashBytes | ForEach-Object { $_.ToString("x2") })
  } finally {
    $stream.Dispose()
    $sha256.Dispose()
  }
}

function Invoke-FuriganaUpdate {
  param(
    [Parameter(Mandatory = $true)][string]$StateRoot,
    [Parameter(Mandatory = $true)][string]$CurrentVersionText
  )

  $currentVersion = [version]$CurrentVersionText
  $headers = @{ "User-Agent" = "FuriganaForSpotify/${CurrentVersionText}" }
  $latestResponse = Invoke-WebRequest -Uri $ReleaseLatestUrl -Headers $headers -TimeoutSec 15 -UseBasicParsing
  $baseResponse = $latestResponse.BaseResponse
  if ($baseResponse.PSObject.Properties.Name -contains "ResponseUri") {
    $resolvedLatestUrl = [string]$baseResponse.ResponseUri.AbsoluteUri
  } elseif ($baseResponse.PSObject.Properties.Name -contains "RequestMessage") {
    $resolvedLatestUrl = [string]$baseResponse.RequestMessage.RequestUri.AbsoluteUri
  } else {
    throw "Could not resolve the latest GitHub Release URL."
  }
  $tagName = $resolvedLatestUrl.TrimEnd('/').Split('/')[-1]
  if ($tagName -notmatch '^v(?<version>\d+\.\d+\.\d+)$') {
    throw "Latest GitHub Release has an unsupported tag: ${tagName}"
  }
  if (-not $testMode) {
    $expectedTagUrl = "https://github.com/huiishan99/spotify-furigana/releases/tag/${tagName}"
    if (-not [string]::Equals($resolvedLatestUrl.TrimEnd('/'), $expectedTagUrl, [StringComparison]::Ordinal)) {
      throw "Latest Release redirected outside the expected GitHub repository."
    }
  }

  $latestVersionText = $Matches.version
  $latestVersion = [version]$latestVersionText
  if ($latestVersion -le $currentVersion) {
    Write-UpdateLog -StateRoot $StateRoot -Message "No update available (installed ${CurrentVersionText}, latest ${latestVersionText})."
    return
  }

  $archiveName = "spotify-furigana-v${latestVersionText}.zip"
  $checksumName = "${archiveName}.sha256"
  $archiveUrl = "$($ReleaseDownloadBaseUrl.TrimEnd('/'))/${tagName}/${archiveName}"
  $checksumUrl = "$($ReleaseDownloadBaseUrl.TrimEnd('/'))/${tagName}/${checksumName}"

  $tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  $tempRoot = Join-Path $tempBase "spotify-furigana-update-$([guid]::NewGuid().ToString('N'))"
  $resolvedTempRoot = [System.IO.Path]::GetFullPath($tempRoot)
  if (-not $resolvedTempRoot.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to use an update directory outside the system temp directory."
  }

  New-Item -ItemType Directory -Path $resolvedTempRoot | Out-Null
  try {
    $archivePath = Join-Path $resolvedTempRoot $archiveName
    $checksumPath = Join-Path $resolvedTempRoot $checksumName
    Invoke-WebRequest -Uri $archiveUrl -Headers $headers -OutFile $archivePath -TimeoutSec 60 -UseBasicParsing
    Invoke-WebRequest -Uri $checksumUrl -Headers $headers -OutFile $checksumPath -TimeoutSec 30 -UseBasicParsing

    $checksumText = Get-Content -Raw -LiteralPath $checksumPath
    $escapedArchiveName = [regex]::Escape($archiveName)
    if ($checksumText -notmatch "(?im)^(?<hash>[0-9a-f]{64})\s+\*?${escapedArchiveName}\s*$") {
      throw "Release checksum file has an invalid format."
    }
    $expectedHash = $Matches.hash.ToLowerInvariant()
    $actualHash = Get-FileSha256 -Path $archivePath
    if ($actualHash -ne $expectedHash) {
      throw "Release archive SHA-256 did not match the published checksum."
    }

    $extractRoot = Join-Path $resolvedTempRoot "extracted"
    Expand-Archive -LiteralPath $archivePath -DestinationPath $extractRoot
    $installScript = Join-Path $extractRoot "install.ps1"
    $manifestPath = Join-Path $extractRoot "spotify-furigana\manifest.json"
    $versionPath = Join-Path $extractRoot "spotify-furigana\version.txt"
    foreach ($requiredPath in @($installScript, $manifestPath, $versionPath)) {
      if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "Downloaded release is incomplete: ${requiredPath} is missing."
      }
    }
    $packageVersion = (Get-Content -Raw -LiteralPath $versionPath).Trim()
    if ($packageVersion -ne $latestVersionText) {
      throw "Downloaded package version ${packageVersion} did not match ${latestVersionText}."
    }

    $powerShellExecutable = (Get-Process -Id $PID).Path
    & $powerShellExecutable -NoProfile -ExecutionPolicy Bypass -File $installScript -NoLaunch
    if ($LASTEXITCODE -ne 0) {
      throw "The ${latestVersionText} installer exited with code ${LASTEXITCODE}."
    }
    Write-UpdateLog -StateRoot $StateRoot -Message "Updated automatically from ${CurrentVersionText} to ${latestVersionText}."
  } finally {
    if (Test-Path -LiteralPath $resolvedTempRoot) {
      Remove-Item -LiteralPath $resolvedTempRoot -Recurse -Force
    }
  }
}

try {
  $spicetifyExecutable = Resolve-SpicetifyExecutable
} catch {
  try {
    $shell = New-Object -ComObject WScript.Shell
    [void]$shell.Popup(
      $_.Exception.Message,
      0,
      "Furigana for Spotify",
      16
    )
    [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell)
  } catch {
    # The shortcut is hidden, but a console invocation will still receive the error below.
  }
  throw
}
$stateRoot = Join-Path $env:LOCALAPPDATA "Furigana for Spotify"
$resolvedStateRoot = [System.IO.Path]::GetFullPath($stateRoot)
New-Item -ItemType Directory -Path $resolvedStateRoot -Force | Out-Null
Set-Location -LiteralPath $resolvedStateRoot
[Environment]::CurrentDirectory = $resolvedStateRoot
$lastCheckPath = Join-Path $stateRoot "last-update-check.txt"
$disabledMarker = Join-Path $PSScriptRoot "auto-update.disabled"
$versionPath = Join-Path $PSScriptRoot "version.txt"
$skipFromEnvironment = $env:SPOTIFY_FURIGANA_SKIP_UPDATE -eq "1"

if (
  -not $SkipUpdateCheck -and
  -not $skipFromEnvironment -and
  -not (Test-Path -LiteralPath $disabledMarker) -and
  (Test-UpdateCheckDue -StateFile $lastCheckPath -IntervalHours $UpdateIntervalHours)
) {
  New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
  $lockPath = Join-Path $stateRoot "update.lock"
  $lockStream = $null
  try {
    $lockStream = [System.IO.File]::Open(
      $lockPath,
      [System.IO.FileMode]::OpenOrCreate,
      [System.IO.FileAccess]::ReadWrite,
      [System.IO.FileShare]::None
    )
  } catch [System.IO.IOException] {
    Write-UpdateLog -StateRoot $stateRoot -Message "Another launcher is already checking for updates; skipped this check."
  }

  if ($lockStream) {
    try {
      [System.IO.File]::WriteAllText(
        $lastCheckPath,
        [DateTime]::UtcNow.ToString("o"),
        [System.Text.UTF8Encoding]::new($false)
      )

      if (-not (Test-Path -LiteralPath $versionPath -PathType Leaf)) {
        throw "Installed version metadata is missing."
      }
      $currentVersionText = (Get-Content -Raw -LiteralPath $versionPath).Trim()
      if ($currentVersionText -notmatch '^\d+\.\d+\.\d+$') {
        throw "Installed version metadata is invalid: ${currentVersionText}"
      }
      Invoke-FuriganaUpdate -StateRoot $stateRoot -CurrentVersionText $currentVersionText
    } catch {
      Write-UpdateLog -StateRoot $stateRoot -Message "Update check failed; continuing with the installed version. $($_.Exception.Message)"
    } finally {
      $lockStream.Dispose()
    }
  }
}

& $spicetifyExecutable auto
exit $LASTEXITCODE
