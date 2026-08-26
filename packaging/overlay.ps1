[CmdletBinding()]
param(
  [ValidateRange(1024, 65535)][int]$Port = 43841
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName WindowsBase

$createdNew = $false
$mutex = [Threading.Mutex]::new(
  $true,
  "Local\FuriganaForSpotifyDesktopOverlay",
  [ref]$createdNew
)
if (-not $createdNew) {
  $mutex.Dispose()
  exit 0
}

$listener = $null
$timer = $null
$window = $null
$stateRoot = Join-Path $env:LOCALAPPDATA "Furigana for Spotify"
$positionPath = Join-Path $stateRoot "overlay-position.json"
$startedAt = [DateTime]::UtcNow
$lastSpotifySeenAt = $null
$spotifySeen = $false
$processCheckTick = 0
$suppressed = $false

function New-Brush {
  param([Parameter(Mandatory = $true)][string]$Color)
  return [Windows.Media.SolidColorBrush]::new(
    [Windows.Media.ColorConverter]::ConvertFromString($Color)
  )
}

function Save-OverlayPosition {
  try {
    New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
    $position = [ordered]@{
      left = [Math]::Round($window.Left, 2)
      top = [Math]::Round($window.Top, 2)
    } | ConvertTo-Json -Compress
    [System.IO.File]::WriteAllText(
      $positionPath,
      $position,
      [System.Text.UTF8Encoding]::new($false)
    )
  } catch {
    # Position persistence is optional and must not interrupt lyric display.
  }
}

function Set-InitialOverlayPosition {
  $left = [Windows.SystemParameters]::WorkArea.Left +
    ([Windows.SystemParameters]::WorkArea.Width - $window.Width) / 2
  $top = [Windows.SystemParameters]::WorkArea.Bottom - $window.Height - 72

  if (Test-Path -LiteralPath $positionPath -PathType Leaf) {
    try {
      $saved = Get-Content -Raw -LiteralPath $positionPath | ConvertFrom-Json
      $savedLeft = [double]$saved.left
      $savedTop = [double]$saved.top
      if (
        -not [double]::IsNaN($savedLeft) -and
        -not [double]::IsInfinity($savedLeft) -and
        -not [double]::IsNaN($savedTop) -and
        -not [double]::IsInfinity($savedTop)
      ) {
        $left = $savedLeft
        $top = $savedTop
      }
    } catch {
      # Ignore malformed or stale coordinates.
    }
  }

  $minimumLeft = [Windows.SystemParameters]::VirtualScreenLeft + 12
  $minimumTop = [Windows.SystemParameters]::VirtualScreenTop + 12
  $maximumLeft = [Windows.SystemParameters]::VirtualScreenLeft +
    [Windows.SystemParameters]::VirtualScreenWidth - $window.Width - 12
  $maximumTop = [Windows.SystemParameters]::VirtualScreenTop +
    [Windows.SystemParameters]::VirtualScreenHeight - $window.Height - 12
  $window.Left = [Math]::Min($maximumLeft, [Math]::Max($minimumLeft, $left))
  $window.Top = [Math]::Min($maximumTop, [Math]::Max($minimumTop, $top))
}

function Get-RequestBody {
  param([Parameter(Mandatory = $true)][Net.Sockets.TcpClient]$Client)

  $Client.ReceiveTimeout = 1000
  $stream = $Client.GetStream()
  $memory = [IO.MemoryStream]::new()
  $buffer = [byte[]]::new(4096)
  $headerEnd = -1
  $contentLength = -1
  try {
    while ($memory.Length -lt 65536) {
      $read = $stream.Read($buffer, 0, $buffer.Length)
      if ($read -le 0) {
        break
      }
      $memory.Write($buffer, 0, $read)
      $bytes = $memory.ToArray()
      if ($headerEnd -lt 0) {
        $candidate = [Text.Encoding]::ASCII.GetString($bytes)
        $headerEnd = $candidate.IndexOf("`r`n`r`n", [StringComparison]::Ordinal)
        if ($headerEnd -ge 0) {
          $header = $candidate.Substring(0, $headerEnd)
          if ($header -notmatch '^POST /state HTTP/1\.[01]\r?\n') {
            return $null
          }
          if ($header -notmatch '(?im)^Origin:\s*https://xpui\.app\.spotify\.com\s*$') {
            return $null
          }
          if ($header -notmatch '(?im)^Content-Length:\s*(?<length>\d+)\s*$') {
            return $null
          }
          $contentLength = [int]$Matches.length
          if ($contentLength -lt 0 -or $contentLength -gt 60000) {
            return $null
          }
        }
      }

      if ($headerEnd -ge 0 -and $memory.Length -ge ($headerEnd + 4 + $contentLength)) {
        $bodyOffset = $headerEnd + 4
        return [Text.Encoding]::UTF8.GetString($bytes, $bodyOffset, $contentLength)
      }
    }
    return $null
  } finally {
    $response = [Text.Encoding]::ASCII.GetBytes(
      "HTTP/1.1 204 No Content`r`nConnection: close`r`nContent-Length: 0`r`n`r`n"
    )
    try {
      $stream.Write($response, 0, $response.Length)
      $stream.Flush()
    } catch {
      # The sender does not need to read the no-cors response.
    }
    $memory.Dispose()
  }
}

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

function Set-LyricSegments {
  param([Parameter(Mandatory = $true)][object[]]$Segments)

  $lyricsPanel.Children.Clear()
  foreach ($segment in $Segments | Select-Object -First 128) {
    if ($null -eq $segment) {
      continue
    }
    $textValue = Get-StateProperty -State $segment -Name "text"
    if ($textValue -isnot [string] -or [string]::IsNullOrEmpty($textValue)) {
      continue
    }
    $readingValue = Get-StateProperty -State $segment -Name "reading"
    $textValue = $textValue.Substring(0, [Math]::Min(512, $textValue.Length))
    if ($readingValue -is [string]) {
      $readingValue = $readingValue.Substring(0, [Math]::Min(512, $readingValue.Length))
    } else {
      $readingValue = ""
    }

    $segmentPanel = [Windows.Controls.StackPanel]::new()
    $segmentPanel.Orientation = [Windows.Controls.Orientation]::Vertical
    $segmentPanel.VerticalAlignment = [Windows.VerticalAlignment]::Bottom

    $reading = [Windows.Controls.TextBlock]::new()
    $reading.Text = if ($readingValue) { $readingValue } else { " " }
    $reading.FontFamily = [Windows.Media.FontFamily]::new("Yu Gothic UI, Meiryo UI, Segoe UI")
    $reading.FontSize = 14
    $reading.FontWeight = [Windows.FontWeights]::SemiBold
    $reading.Foreground = if ($readingValue) { New-Brush "#E6B8F5D7" } else { New-Brush "#00121212" }
    $reading.TextAlignment = [Windows.TextAlignment]::Center
    $reading.HorizontalAlignment = [Windows.HorizontalAlignment]::Stretch
    $reading.Margin = [Windows.Thickness]::new(1, 0, 1, 1)
    $reading.Effect = [Windows.Media.Effects.DropShadowEffect]@{
      Color = [Windows.Media.Colors]::Black
      BlurRadius = 4
      ShadowDepth = 1
      Opacity = 0.95
    }

    $base = [Windows.Controls.TextBlock]::new()
    $base.Text = $textValue
    $base.FontFamily = [Windows.Media.FontFamily]::new("Yu Gothic UI, Meiryo UI, Segoe UI")
    $base.FontSize = 30
    $base.FontWeight = [Windows.FontWeights]::SemiBold
    $base.Foreground = New-Brush "#FFF8F2"
    $base.TextAlignment = [Windows.TextAlignment]::Center
    $base.Margin = [Windows.Thickness]::new(0)
    $base.Effect = [Windows.Media.Effects.DropShadowEffect]@{
      Color = [Windows.Media.Colors]::Black
      BlurRadius = 6
      ShadowDepth = 1
      Opacity = 1
    }

    [void]$segmentPanel.Children.Add($reading)
    [void]$segmentPanel.Children.Add($base)
    [void]$lyricsPanel.Children.Add($segmentPanel)
  }

  if ($lyricsPanel.Children.Count -eq 0 -or $suppressed) {
    $window.Hide()
  } else {
    $window.Topmost = $true
    $window.Show()
  }
}

function Apply-OverlayState {
  param([Parameter(Mandatory = $true)][string]$Body)

  try {
    $state = $Body | ConvertFrom-Json
    if ((Get-StateProperty -State $state -Name "version") -ne 1) {
      return
    }
    $stateEnabled = Get-StateProperty -State $state -Name "enabled"
    if ($stateEnabled -isnot [bool] -or -not $stateEnabled) {
      $script:suppressed = $false
      $window.Hide()
      return
    }
    $segments = Get-StateProperty -State $state -Name "segments"
    if ($segments -isnot [array]) {
      $segments = @($segments)
    }
    Set-LyricSegments -Segments $segments
  } catch {
    # Ignore malformed loopback messages without writing lyric content to disk.
  }
}

try {
  $window = [Windows.Window]::new()
  $window.Title = "Furigana for Spotify Desktop Lyrics"
  $window.Width = 860
  $window.Height = 112
  $window.WindowStyle = [Windows.WindowStyle]::None
  $window.ResizeMode = [Windows.ResizeMode]::NoResize
  $window.AllowsTransparency = $true
  $window.Background = [Windows.Media.Brushes]::Transparent
  $window.ShowInTaskbar = $false
  $window.ShowActivated = $false
  $window.Topmost = $true
  $window.WindowStartupLocation = [Windows.WindowStartupLocation]::Manual

  $card = [Windows.Controls.Border]::new()
  $card.Background = [Windows.Media.Brushes]::Transparent
  $card.BorderThickness = [Windows.Thickness]::new(0)
  $card.Padding = [Windows.Thickness]::new(8, 5, 8, 5)

  $grid = [Windows.Controls.Grid]::new()
  [void]$grid.ColumnDefinitions.Add([Windows.Controls.ColumnDefinition]@{ Width = [Windows.GridLength]::new(36) })
  [void]$grid.ColumnDefinitions.Add([Windows.Controls.ColumnDefinition]@{ Width = [Windows.GridLength]::new(1, [Windows.GridUnitType]::Star) })
  [void]$grid.ColumnDefinitions.Add([Windows.Controls.ColumnDefinition]@{ Width = [Windows.GridLength]::new(32) })

  $badge = [Windows.Controls.Border]::new()
  $badge.Width = 26
  $badge.Height = 26
  $badge.Background = New-Brush "#8001CA95"
  $badge.CornerRadius = [Windows.CornerRadius]::new(8)
  $badge.Opacity = 0.3
  $badge.ToolTip = "Drag to move desktop lyrics"
  $badge.VerticalAlignment = [Windows.VerticalAlignment]::Center
  $badgeText = [Windows.Controls.TextBlock]::new()
  $badgeText.Text = [string][char]0x3075
  $badgeText.FontFamily = [Windows.Media.FontFamily]::new("Yu Gothic UI, Meiryo UI")
  $badgeText.FontSize = 15
  $badgeText.FontWeight = [Windows.FontWeights]::Bold
  $badgeText.Foreground = New-Brush "#FFF8F2"
  $badgeText.HorizontalAlignment = [Windows.HorizontalAlignment]::Center
  $badgeText.VerticalAlignment = [Windows.VerticalAlignment]::Center
  $badge.Child = $badgeText
  [Windows.Controls.Grid]::SetColumn($badge, 0)

  $viewbox = [Windows.Controls.Viewbox]::new()
  $viewbox.Stretch = [Windows.Media.Stretch]::Uniform
  $viewbox.StretchDirection = [Windows.Controls.StretchDirection]::DownOnly
  $viewbox.HorizontalAlignment = [Windows.HorizontalAlignment]::Center
  $viewbox.VerticalAlignment = [Windows.VerticalAlignment]::Center
  $viewbox.Margin = [Windows.Thickness]::new(4, 0, 4, 0)
  $lyricsPanel = [Windows.Controls.StackPanel]::new()
  $lyricsPanel.Orientation = [Windows.Controls.Orientation]::Horizontal
  $lyricsPanel.HorizontalAlignment = [Windows.HorizontalAlignment]::Center
  $viewbox.Child = $lyricsPanel
  [Windows.Controls.Grid]::SetColumn($viewbox, 1)

  $closeButton = [Windows.Controls.Button]::new()
  $closeButton.Content = [string][char]0x00D7
  $closeButton.Width = 26
  $closeButton.Height = 26
  $closeButton.Padding = [Windows.Thickness]::new(0)
  $closeButton.BorderThickness = [Windows.Thickness]::new(0)
  $closeButton.Background = [Windows.Media.Brushes]::Transparent
  $closeButton.Foreground = New-Brush "#D9FFFFFF"
  $closeButton.FontSize = 17
  $closeButton.Opacity = 0.25
  $closeButton.Cursor = [Windows.Input.Cursors]::Hand
  $closeButton.ToolTip = "Hide until the desktop lyric setting is turned off and on"
  $closeButton.VerticalAlignment = [Windows.VerticalAlignment]::Top
  [Windows.Controls.Grid]::SetColumn($closeButton, 2)
  $closeButton.Add_Click({
    $script:suppressed = $true
    $window.Hide()
  })

  $card.Add_MouseEnter({
    $badge.Opacity = 0.8
    $closeButton.Opacity = 0.8
  })
  $card.Add_MouseLeave({
    $badge.Opacity = 0.3
    $closeButton.Opacity = 0.25
  })

  [void]$grid.Children.Add($badge)
  [void]$grid.Children.Add($viewbox)
  [void]$grid.Children.Add($closeButton)
  $card.Child = $grid
  $window.Content = $card
  Set-InitialOverlayPosition

  $window.Add_MouseLeftButtonDown({
    param($sender, $eventArgs)
    $source = $eventArgs.OriginalSource
    while ($source -is [Windows.DependencyObject]) {
      if ($source -is [Windows.Controls.Button]) {
        return
      }
      $source = [Windows.Media.VisualTreeHelper]::GetParent($source)
    }
    try {
      $window.DragMove()
      Save-OverlayPosition
    } catch {
      # DragMove can be interrupted if Spotify exits during a drag.
    }
  })

  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
  $listener.Server.ExclusiveAddressUse = $true
  $listener.Start()

  $timer = [Windows.Threading.DispatcherTimer]::new()
  $timer.Interval = [TimeSpan]::FromMilliseconds(100)
  $timer.Add_Tick({
    while ($listener.Pending()) {
      $client = $listener.AcceptTcpClient()
      try {
        $body = Get-RequestBody -Client $client
        if ($null -ne $body) {
          Apply-OverlayState -Body $body
        }
      } finally {
        $client.Dispose()
      }
    }

    $script:processCheckTick += 1
    if ($processCheckTick -lt 10) {
      return
    }
    $script:processCheckTick = 0
    $spotifyProcesses = Get-Process -Name "Spotify" -ErrorAction SilentlyContinue
    if ($spotifyProcesses) {
      $script:spotifySeen = $true
      $script:lastSpotifySeenAt = [DateTime]::UtcNow
    } elseif (
      ($spotifySeen -and ([DateTime]::UtcNow - $lastSpotifySeenAt).TotalSeconds -ge 8) -or
      (-not $spotifySeen -and ([DateTime]::UtcNow - $startedAt).TotalSeconds -ge 90)
    ) {
      $window.Close()
    }
  })
  $timer.Start()
  $application = [Windows.Application]::new()
  [void]$application.Run()
} finally {
  if ($timer) {
    $timer.Stop()
  }
  if ($listener) {
    $listener.Stop()
  }
  if ($window) {
    Save-OverlayPosition
  }
  if ($createdNew) {
    try {
      $mutex.ReleaseMutex()
    } catch {
      # The process may be ending after a dispatcher failure.
    }
  }
  $mutex.Dispose()
}
