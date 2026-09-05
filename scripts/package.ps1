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

function Resolve-CSharpCompiler {
  $candidates = @(
    (Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"),
    (Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319\csc.exe")
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return $candidate
    }
  }
  throw "The .NET Framework C# compiler is required to build the discoverable Windows launcher."
}

function Resolve-InnoSetupCompiler {
  $command = Get-Command "ISCC.exe" -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($command) {
    return $command.Path
  }

  $programFilesRoots = @(
    (Join-Path $env:LOCALAPPDATA "Programs"),
    [Environment]::GetFolderPath("ProgramFilesX86"),
    [Environment]::GetFolderPath("ProgramFiles")
  ) | Where-Object { $_ }
  foreach ($programFilesRoot in $programFilesRoots) {
    foreach ($folderName in @("Inno Setup 7", "Inno Setup 6")) {
      $candidate = Join-Path $programFilesRoot "${folderName}\ISCC.exe"
      if (Test-Path -LiteralPath $candidate -PathType Leaf) {
        return $candidate
      }
    }
  }
  throw "Inno Setup 6 or 7 is required to build the Windows Setup.exe. Install it with: winget install --id JRSoftware.InnoSetup -e"
}

function Get-Sha256Hex {
  param(
    [Parameter(Mandatory = $true)][string]$InputPath
  )

  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  $inputStream = [System.IO.File]::OpenRead($InputPath)
  try {
    $hashBytes = $sha256.ComputeHash($inputStream)
    $hash = -join ($hashBytes | ForEach-Object { $_.ToString("x2") })
  } finally {
    $inputStream.Dispose()
    $sha256.Dispose()
  }
  return $hash
}

function Write-Sha256File {
  param(
    [Parameter(Mandatory = $true)][string]$InputPath,
    [Parameter(Mandatory = $true)][string]$OutputPath
  )

  $hash = Get-Sha256Hex -InputPath $InputPath
  $checksumLine = "${hash}  $([System.IO.Path]::GetFileName($InputPath))`n"
  [System.IO.File]::WriteAllText($OutputPath, $checksumLine, [System.Text.UTF8Encoding]::new($false))
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
$setupPath = Join-Path $releaseRoot "Furigana-for-Spotify-Setup-v${version}.exe"
$setupChecksumPath = "${setupPath}.sha256"
$builtApp = Join-Path $projectRoot "dist\spotify-furigana"
$packagingRoot = Join-Path $projectRoot "packaging"
$nativeLauncherSource = Join-Path $packagingRoot "windows-launcher\Program.cs"
$nativeLauncherPath = Join-Path $builtApp "Furigana for Spotify.exe"
$setupScript = Join-Path $packagingRoot "windows-setup.iss"
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
  @{ Source = "node_modules\wanakana\LICENSE"; Destination = "wanakana-5.3.1-LICENSE.txt" },
  @{ Source = "packaging\languages\ChineseSimplified.LICENSE.txt"; Destination = "inno-setup-chinese-simplified-translation-LICENSE.txt" }
)

Assert-PathInside -Root $projectRoot -Candidate $releaseRoot
Assert-PathInside -Root $releaseRoot -Candidate $stageRoot
Assert-PathInside -Root $releaseRoot -Candidate $archivePath
Assert-PathInside -Root $releaseRoot -Candidate $checksumPath
Assert-PathInside -Root $releaseRoot -Candidate $setupPath
Assert-PathInside -Root $releaseRoot -Candidate $setupChecksumPath

$cSharpCompiler = Resolve-CSharpCompiler
$launcherVersionSource = [System.IO.Path]::GetTempFileName()
try {
  $launcherVersion = "${version}.0"
  $launcherVersionCode = "using System.Reflection;`n[assembly: AssemblyVersion(`"${launcherVersion}`")]`n[assembly: AssemblyFileVersion(`"${launcherVersion}`")]`n[assembly: AssemblyInformationalVersion(`"${version}`")]`n"
  [System.IO.File]::WriteAllText($launcherVersionSource, $launcherVersionCode, [System.Text.UTF8Encoding]::new($false))
  & $cSharpCompiler /nologo /target:winexe /optimize+ /platform:anycpu /reference:System.Windows.Forms.dll "/win32icon:$projectRoot\assets\launcher.ico" "/out:$nativeLauncherPath" $nativeLauncherSource $launcherVersionSource
  if ($LASTEXITCODE -ne 0) {
    throw "The native Windows launcher build failed with exit code ${LASTEXITCODE}."
  }
} finally {
  Remove-Item -LiteralPath $launcherVersionSource -Force -ErrorAction SilentlyContinue
}

foreach ($requiredPath in @(
  (Join-Path $builtApp "manifest.json"),
  (Join-Path $builtApp "extension.js"),
  (Join-Path $builtApp "launcher.ps1"),
  $nativeLauncherPath,
  (Join-Path $builtApp "overlay.ps1"),
  (Join-Path $builtApp "overlay-core.ps1"),
  (Join-Path $builtApp "launcher.sh"),
  (Join-Path $builtApp "version.txt"),
  (Join-Path $packagingRoot "install.ps1"),
  (Join-Path $packagingRoot "uninstall.ps1"),
  (Join-Path $packagingRoot "install.sh"),
  (Join-Path $packagingRoot "uninstall.sh"),
  (Join-Path $packagingRoot "INSTALL.md"),
  (Join-Path $packagingRoot "THIRD_PARTY_NOTICES.md"),
  $setupScript,
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
foreach ($oldOutput in @($archivePath, $checksumPath, $setupPath, $setupChecksumPath)) {
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
Write-Sha256File -InputPath $archivePath -OutputPath $checksumPath

$innoSetupCompiler = Resolve-InnoSetupCompiler
$launcherIconHash = Get-Sha256Hex -InputPath (Join-Path $builtApp "launcher.ico")
$launcherIconId = $launcherIconHash.Substring(0, 12)
& $innoSetupCompiler "/DAppVersion=${version}" "/DLauncherIconId=${launcherIconId}" "/DSourceRoot=${stageRoot}" "/DOutputDir=${releaseRoot}" "/DProjectRoot=${projectRoot}" $setupScript
if ($LASTEXITCODE -ne 0) {
  throw "The Windows Setup.exe build failed with exit code ${LASTEXITCODE}."
}
if (-not (Test-Path -LiteralPath $setupPath -PathType Leaf)) {
  throw "The Windows Setup.exe was not created at ${setupPath}."
}
Write-Sha256File -InputPath $setupPath -OutputPath $setupChecksumPath

Write-Host "Created release package: ${archivePath}"
Write-Host "Created checksum: ${checksumPath}"
Write-Host "Created Windows installer: ${setupPath}"
Write-Host "Created installer checksum: ${setupChecksumPath}"
