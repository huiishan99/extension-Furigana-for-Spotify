$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
. (Join-Path $projectRoot "packaging\overlay-core.ps1")

$tokens = $null
$parseErrors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile(
  (Join-Path $projectRoot "packaging\overlay.ps1"),
  [ref]$tokens,
  [ref]$parseErrors
)
if ($parseErrors.Count -gt 0) {
  throw "overlay.ps1 contains syntax errors: $($parseErrors -join '; ')"
}

function Assert-Equal {
  param(
    [Parameter(Mandatory = $true)][AllowNull()][object]$Actual,
    [Parameter(Mandatory = $true)][AllowNull()][object]$Expected,
    [Parameter(Mandatory = $true)][string]$Message
  )

  if ($Actual -ne $Expected) {
    throw "${Message}: expected '$Expected', received '$Actual'."
  }
}

$validHeader = "POST /state HTTP/1.1`r`nOrigin: https://xpui.app.spotify.com`r`nContent-Length: 42"
$metadata = Get-OverlayRequestMetadata -Header $validHeader
Assert-Equal -Actual $metadata.ContentLength -Expected 42 -Message "valid request length"
Assert-Equal `
  -Actual (Get-OverlayRequestMetadata -Header ($validHeader -replace "xpui\.app\.spotify\.com", "example.com")) `
  -Expected $null `
  -Message "foreign origin rejection"
Assert-Equal `
  -Actual (Get-OverlayRequestMetadata -Header ($validHeader -replace "Content-Length: 42", "Content-Length: 60001")) `
  -Expected $null `
  -Message "oversized request rejection"

$state = ConvertFrom-OverlayStateBody -Body @'
{
  "version": 1,
  "enabled": true,
  "segments": [{"text":"二人","reading":"ふたり"}],
  "nextSegments": {"text":"次"},
  "currentFontSize": 999,
  "nextFontSize": -5
}
'@
Assert-Equal -Actual $state.Enabled -Expected $true -Message "enabled state"
Assert-Equal -Actual $state.Segments.Count -Expected 1 -Message "current segment normalization"
Assert-Equal -Actual $state.NextSegments.Count -Expected 1 -Message "next segment normalization"
Assert-Equal -Actual $state.CurrentFontSize -Expected 44 -Message "current font clamp"
Assert-Equal -Actual $state.NextFontSize -Expected 12 -Message "next font clamp"
Assert-Equal `
  -Actual (Get-SegmentTextSignature -Segments $state.Segments) `
  -Expected "二人" `
  -Message "segment signature"

$disabled = ConvertFrom-OverlayStateBody -Body '{"version":1,"enabled":false}'
Assert-Equal -Actual $disabled.Enabled -Expected $false -Message "disabled state"
Assert-Equal -Actual $disabled.Segments.Count -Expected 0 -Message "disabled segments"
Assert-Equal -Actual (ConvertFrom-OverlayStateBody -Body '{') -Expected $null -Message "malformed state"
Assert-Equal `
  -Actual (ConvertFrom-OverlayStateBody -Body '{"version":2,"enabled":true}') `
  -Expected $null `
  -Message "unsupported protocol version"

Assert-Equal `
  -Actual (Get-OverlayTransition -CurrentSignature "A" -PreviousCurrentSignature "" -PreviousNextSignature "" -HadPreviousCurrent $false) `
  -Expected "initial" `
  -Message "initial transition"
Assert-Equal `
  -Actual (Get-OverlayTransition -CurrentSignature "B" -PreviousCurrentSignature "A" -PreviousNextSignature "B" -HadPreviousCurrent $true) `
  -Expected "promote-next" `
  -Message "preview promotion"
Assert-Equal `
  -Actual (Get-OverlayTransition -CurrentSignature "C" -PreviousCurrentSignature "A" -PreviousNextSignature "B" -HadPreviousCurrent $true) `
  -Expected "replace" `
  -Message "non-contiguous replacement"
Assert-Equal `
  -Actual (Get-OverlayTransition -CurrentSignature "A" -PreviousCurrentSignature "A" -PreviousNextSignature "B" -HadPreviousCurrent $true) `
  -Expected "unchanged" `
  -Message "heartbeat deduplication"

Write-Output "Overlay core tests passed."
