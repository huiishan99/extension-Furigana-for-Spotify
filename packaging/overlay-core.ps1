Set-StrictMode -Version Latest

function Get-StateProperty {
  param(
    [Parameter(Mandatory = $true)][object]$State,
    [Parameter(Mandatory = $true)][string]$Name
  )

  $property = $State.PSObject.Properties[$Name]
  if ($property) {
    return $property.Value
  }
  return $null
}

function Get-ClampedStateNumber {
  param(
    [Parameter(Mandatory = $true)][object]$State,
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][double]$Default,
    [Parameter(Mandatory = $true)][double]$Minimum,
    [Parameter(Mandatory = $true)][double]$Maximum
  )

  $rawValue = Get-StateProperty -State $State -Name $Name
  if ($null -eq $rawValue) {
    return $Default
  }
  try {
    $value = [Convert]::ToDouble(
      $rawValue,
      [Globalization.CultureInfo]::InvariantCulture
    )
  } catch {
    return $Default
  }
  if ([double]::IsNaN($value) -or [double]::IsInfinity($value)) {
    return $Default
  }
  return [Math]::Min($Maximum, [Math]::Max($Minimum, $value))
}

function Get-SegmentTextSignature {
  param([Parameter(Mandatory = $true)][AllowEmptyCollection()][object[]]$Segments)

  $textValues = @()
  foreach ($segment in $Segments) {
    if ($null -eq $segment) {
      continue
    }
    $textValue = Get-StateProperty -State $segment -Name "text"
    if ($textValue -is [string]) {
      $textValues += $textValue
    }
  }
  return [string]::Join([char]0x001F, $textValues)
}

function Get-OverlayRequestMetadata {
  param([Parameter(Mandatory = $true)][string]$Header)

  if ($Header -notmatch '^POST /state HTTP/1\.[01]\r?\n') {
    return $null
  }
  if ($Header -notmatch '(?im)^Origin:\s*https://xpui\.app\.spotify\.com\s*$') {
    return $null
  }
  if ($Header -notmatch '(?im)^Content-Length:\s*(?<length>\d+)\s*$') {
    return $null
  }

  $contentLength = [int]$Matches.length
  if ($contentLength -lt 0 -or $contentLength -gt 60000) {
    return $null
  }
  return [pscustomobject]@{ ContentLength = $contentLength }
}

function ConvertFrom-OverlayStateBody {
  param([Parameter(Mandatory = $true)][string]$Body)

  try {
    $state = $Body | ConvertFrom-Json
    if ((Get-StateProperty -State $state -Name "version") -ne 1) {
      return $null
    }

    $stateEnabled = Get-StateProperty -State $state -Name "enabled"
    if ($stateEnabled -isnot [bool] -or -not $stateEnabled) {
      return [pscustomobject]@{
        Enabled = $false
        Segments = @()
        NextSegments = @()
        CurrentFontSize = 30
        NextFontSize = 20
      }
    }

    $segments = Get-StateProperty -State $state -Name "segments"
    if ($null -eq $segments) {
      $segments = @()
    } elseif ($segments -isnot [array]) {
      $segments = @($segments)
    }
    $nextSegments = Get-StateProperty -State $state -Name "nextSegments"
    if ($null -eq $nextSegments) {
      $nextSegments = @()
    } elseif ($nextSegments -isnot [array]) {
      $nextSegments = @($nextSegments)
    }

    return [pscustomobject]@{
      Enabled = $true
      Segments = @($segments)
      NextSegments = @($nextSegments)
      CurrentFontSize = Get-ClampedStateNumber `
        -State $state `
        -Name "currentFontSize" `
        -Default 30 `
        -Minimum 26 `
        -Maximum 44
      NextFontSize = Get-ClampedStateNumber `
        -State $state `
        -Name "nextFontSize" `
        -Default 20 `
        -Minimum 12 `
        -Maximum 24
    }
  } catch {
    return $null
  }
}

function Get-OverlayTransition {
  param(
    [Parameter(Mandatory = $true)][string]$CurrentSignature,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$PreviousCurrentSignature,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$PreviousNextSignature,
    [Parameter(Mandatory = $true)][bool]$HadPreviousCurrent
  )

  if ($CurrentSignature -eq $PreviousCurrentSignature) {
    return "unchanged"
  }
  if (-not $HadPreviousCurrent) {
    return "initial"
  }
  if (
    -not [string]::IsNullOrEmpty($PreviousNextSignature) -and
    $PreviousNextSignature -eq $CurrentSignature
  ) {
    return "promote-next"
  }
  return "replace"
}
