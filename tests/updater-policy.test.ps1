$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# Exercise the real updater function without launching Spotify or making network requests.
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$tokens = $null
$parseErrors = $null
$launcher = [System.Management.Automation.Language.Parser]::ParseFile(
  (Join-Path $projectRoot "packaging/launcher.ps1"), [ref]$tokens, [ref]$parseErrors
)
if ($parseErrors.Count -gt 0) { throw "Launcher syntax errors: $($parseErrors -join '; ')" }
$updater = $launcher.Find({
  param($node)
  $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq "Invoke-FuriganaUpdate"
}, $false)
if (-not $updater) { throw "The updater function was not found." }
. ([scriptblock]::Create($updater.Extent.Text))

$canonical = "https://github.com/huiishan99/extension-Furigana-for-Spotify"
$ReleaseLatestUrl = "$canonical/releases/latest"
$ReleaseDownloadBaseUrl = "$canonical/releases/download"
$testMode = $false
$script:requests = 0
$script:log = ""
$script:resolvedUrl = ""
$script:responseShape = "ResponseUri"
function Invoke-WebRequest {
  param($Uri, $Headers, $TimeoutSec, [switch]$UseBasicParsing)
  $script:requests += 1
  if ($Uri -cne $ReleaseLatestUrl) { throw "Unexpected download request: $Uri" }
  if ($script:responseShape -eq "ResponseUri") {
    return [pscustomobject]@{ BaseResponse = [pscustomobject]@{ ResponseUri = [pscustomobject]@{ AbsoluteUri = $script:resolvedUrl } } }
  }
  if ($script:responseShape -eq "RequestMessage") {
    return [pscustomobject]@{ BaseResponse = [pscustomobject]@{ RequestMessage = [pscustomobject]@{ RequestUri = [pscustomobject]@{ AbsoluteUri = $script:resolvedUrl } } } }
  }
  return [pscustomobject]@{ BaseResponse = [pscustomobject]@{} }
}
function Write-UpdateLog {
  param($StateRoot, $Message)
  $script:log = $Message
}

$accepted = @("$canonical/releases/tag/v0.6.3", "$canonical/releases/tag/v0.6.3/")
$rejected = @(
  "https://github.com/huiishan99/spotify-furigana/releases/tag/v0.6.3",
  "https://github.com/another-owner/extension-Furigana-for-Spotify/releases/tag/v0.6.3",
  "https://github.com/huiishan99/another-repository/releases/tag/v0.6.3",
  "https://github.com.evil.example/huiishan99/extension-Furigana-for-Spotify/releases/tag/v0.6.3",
  "https://github.com@evil.example/huiishan99/extension-Furigana-for-Spotify/releases/tag/v0.6.3",
  "http://github.com/huiishan99/extension-Furigana-for-Spotify/releases/tag/v0.6.3",
  "$canonical/releases/tag/v0.6.3?download=1",
  "$canonical/releases/tag/v0.6.3#fragment",
  "$canonical/releases/tag/v0.6.3-rc.1",
  "$canonical/releases/tag/v0.6.3+build.1",
  "$canonical/releases/tag/v0.6.3/extra",
  "$canonical/releases/tag/v0.6.3//",
  "https://github.com/huiishan99/extension-furigana-for-spotify/releases/tag/v0.6.3",
  "$canonical/releases/tag/v0.6.3`n",
  "$canonical/releases/tag/v0.6.3%0a",
  "$canonical/releases/tag/V0.6.3",
  "$canonical/releases/tag/v999.0.0/../../v0.6.3"
)
foreach ($shape in @("ResponseUri", "RequestMessage")) {
  $script:responseShape = $shape
  foreach ($url in $accepted) {
    $script:resolvedUrl = $url
    $script:log = ""
    $script:requests = 0
    Invoke-FuriganaUpdate -StateRoot "unused-test-state" -CurrentVersionText "0.6.3"
    if ($script:log -cne "No update available (installed 0.6.3, latest 0.6.3)." -or $script:requests -ne 1) {
      throw "Expected a canonical no-update result for $shape $url; got $script:log"
    }
  }
  foreach ($url in $rejected) {
    $script:resolvedUrl = $url
    $script:requests = 0
    $errorMessage = ""
    try { Invoke-FuriganaUpdate -StateRoot "unused-test-state" -CurrentVersionText "0.6.3" } catch { $errorMessage = $_.Exception.Message }
    if ($errorMessage -notmatch 'unsupported tag|outside the expected GitHub repository' -or $script:requests -ne 1) {
      throw "Expected rejection before download for $shape $url; got $errorMessage"
    }
  }
}
$script:responseShape = "unknown"
$errorMessage = ""
try { Invoke-FuriganaUpdate -StateRoot "unused-test-state" -CurrentVersionText "0.6.3" } catch { $errorMessage = $_.Exception.Message }
if ($errorMessage -cne "Could not resolve the latest GitHub Release URL.") { throw "Unknown response shape was not rejected." }
Write-Output "Updater release-policy tests passed."
