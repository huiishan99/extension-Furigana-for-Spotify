[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-PathInside {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$Candidate
  )

  $rootPath = [System.IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
  $candidatePath = [System.IO.Path]::GetFullPath($Candidate)
  if (-not $candidatePath.StartsWith($rootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to modify a path outside ${rootPath}: ${candidatePath}"
  }
}

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$packageJsonPath = Join-Path $projectRoot "package.json"
$packageJson = Get-Content -Raw -LiteralPath $packageJsonPath | ConvertFrom-Json
$version = [string]$packageJson.version
if ($version -notmatch '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$') {
  throw "Invalid package version: ${version}"
}

$releaseRoot = Join-Path $projectRoot "release"
$stageName = "spotify-furigana-v${version}"
$stageRoot = Join-Path $releaseRoot $stageName
$archivePath = Join-Path $releaseRoot "${stageName}.zip"
$checksumPath = "${archivePath}.sha256"
$builtApp = Join-Path $projectRoot "dist\spotify-furigana"
$packagingRoot = Join-Path $projectRoot "packaging"
$thirdPartyLicenseInputs = @(
  @{ Source = "node_modules\kuroshiro\LICENSE"; Destination = "kuroshiro-1.2.0-LICENSE.txt" },
  @{ Source = "node_modules\kuroshiro-analyzer-kuromoji\LICENSE"; Destination = "kuroshiro-analyzer-kuromoji-1.1.0-LICENSE.txt" },
  @{ Source = "node_modules\kuromoji\LICENSE-2.0.txt"; Destination = "kuromoji-0.1.2-LICENSE.txt" },
  @{ Source = "node_modules\kuromoji\NOTICE.md"; Destination = "kuromoji-0.1.2-NOTICE.md" },
  @{ Source = "node_modules\doublearray\LICENSE.txt"; Destination = "doublearray-0.0.2-LICENSE.txt" },
  @{ Source = "node_modules\async\LICENSE"; Destination = "async-2.6.4-LICENSE.txt" },
  @{ Source = "node_modules\lodash\LICENSE"; Destination = "lodash-4.18.1-LICENSE.txt" },
  @{ Source = "node_modules\zlibjs\LICENSE"; Destination = "zlibjs-0.3.1-LICENSE.txt" },
  @{ Source = "node_modules\@babel\runtime\LICENSE"; Destination = "babel-runtime-7.29.7-LICENSE.txt" },
  @{ Source = "node_modules\path-browserify\LICENSE"; Destination = "path-browserify-1.0.1-LICENSE.txt" },
  @{ Source = "node_modules\wanakana\LICENSE"; Destination = "wanakana-5.3.1-LICENSE.txt" }
)

Assert-PathInside -Root $projectRoot -Candidate $releaseRoot
Assert-PathInside -Root $releaseRoot -Candidate $stageRoot
Assert-PathInside -Root $releaseRoot -Candidate $archivePath
Assert-PathInside -Root $releaseRoot -Candidate $checksumPath

foreach ($requiredPath in @(
  (Join-Path $builtApp "manifest.json"),
  (Join-Path $builtApp "extension.js"),
  (Join-Path $builtApp "launcher.ps1"),
  (Join-Path $builtApp "overlay.ps1"),
  (Join-Path $builtApp "launcher.sh"),
  (Join-Path $builtApp "version.txt"),
  (Join-Path $packagingRoot "install.ps1"),
  (Join-Path $packagingRoot "uninstall.ps1"),
  (Join-Path $packagingRoot "install.sh"),
  (Join-Path $packagingRoot "uninstall.sh"),
  (Join-Path $packagingRoot "INSTALL.md"),
  (Join-Path $packagingRoot "THIRD_PARTY_NOTICES.md"),
  (Join-Path $projectRoot "LICENSE")
)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) {
    throw "Required package input is missing: ${requiredPath}"
  }
}
foreach ($licenseInput in $thirdPartyLicenseInputs) {
  $licenseSource = Join-Path $projectRoot $licenseInput.Source
  if (-not (Test-Path -LiteralPath $licenseSource)) {
    throw "Required third-party license is missing: ${licenseSource}"
  }
}

New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
if (Test-Path -LiteralPath $stageRoot) {
  Remove-Item -LiteralPath $stageRoot -Recurse -Force
}
foreach ($oldOutput in @($archivePath, $checksumPath)) {
  if (Test-Path -LiteralPath $oldOutput) {
    Remove-Item -LiteralPath $oldOutput -Force
  }
}

New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null
Copy-Item -LiteralPath $builtApp -Destination (Join-Path $stageRoot "spotify-furigana") -Recurse
Copy-Item -LiteralPath (Join-Path $packagingRoot "install.ps1") -Destination $stageRoot
Copy-Item -LiteralPath (Join-Path $packagingRoot "uninstall.ps1") -Destination $stageRoot
Copy-Item -LiteralPath (Join-Path $packagingRoot "install.sh") -Destination $stageRoot
Copy-Item -LiteralPath (Join-Path $packagingRoot "uninstall.sh") -Destination $stageRoot
Copy-Item -LiteralPath (Join-Path $packagingRoot "INSTALL.md") -Destination $stageRoot
Copy-Item -LiteralPath (Join-Path $packagingRoot "THIRD_PARTY_NOTICES.md") -Destination $stageRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "LICENSE") -Destination $stageRoot
$thirdPartyLicenseRoot = Join-Path $stageRoot "THIRD_PARTY_LICENSES"
New-Item -ItemType Directory -Path $thirdPartyLicenseRoot -Force | Out-Null
foreach ($licenseInput in $thirdPartyLicenseInputs) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $licenseInput.Source) -Destination (Join-Path $thirdPartyLicenseRoot $licenseInput.Destination)
}

Compress-Archive -Path (Join-Path $stageRoot "*") -DestinationPath $archivePath -CompressionLevel Optimal
$sha256 = [System.Security.Cryptography.SHA256]::Create()
$archiveStream = [System.IO.File]::OpenRead($archivePath)
try {
  $hashBytes = $sha256.ComputeHash($archiveStream)
  $archiveHash = -join ($hashBytes | ForEach-Object { $_.ToString("x2") })
} finally {
  $archiveStream.Dispose()
  $sha256.Dispose()
}
$checksumLine = "${archiveHash}  $([System.IO.Path]::GetFileName($archivePath))`n"
[System.IO.File]::WriteAllText($checksumPath, $checksumLine, [System.Text.UTF8Encoding]::new($false))

Write-Host "Created release package: ${archivePath}"
Write-Host "Created checksum: ${checksumPath}"
