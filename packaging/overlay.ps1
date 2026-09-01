[CmdletBinding()]
param(
  [ValidateRange(1024, 65535)][int]$Port = 43841
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$corePath = Join-Path $PSScriptRoot "overlay-core.ps1"
if (-not (Test-Path -LiteralPath $corePath -PathType Leaf)) {
  throw "Desktop lyric core is missing: ${corePath}"
}
. $corePath

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
$lastCurrentLyricSignature = ""
$lastNextLyricSignature = ""
$lastRenderedStateSignature = ""
$lastCurrentSegments = @()
$lastCurrentFontSize = 30
$lastNextFontSize = 20

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
          $metadata = Get-OverlayRequestMetadata -Header $header
          if ($null -eq $metadata) {
            return $null
          }
          $contentLength = $metadata.ContentLength
        }
      }

      if ($headerEnd -ge 0 -and $memory.Length -ge ($headerEnd + 4 + $contentLength)) {
        $bodyOffset = $headerEnd + 4
        return [Text.Encoding]::UTF8.GetString($bytes, $bodyOffset, $contentLength)
      }
    }
    return $null
  } catch [IO.IOException] {
    # A browser request can be abandoned while Spotify is being backgrounded,
    # restarted, or re-applied. Treat the partial loopback message as noise so
    # one interrupted sender cannot terminate the desktop overlay.
    return $null
  } catch [ObjectDisposedException] {
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

function Set-SegmentPanel {
  param(
    [Parameter(Mandatory = $true)][Windows.Controls.StackPanel]$Panel,
    [Parameter(Mandatory = $true)][object[]]$Segments,
    [Parameter(Mandatory = $true)][double]$BaseFontSize,
    [Parameter(Mandatory = $true)][double]$ReadingFontSize,
    [Parameter(Mandatory = $true)][string]$BaseColor,
    [Parameter(Mandatory = $true)][string]$ReadingColor
  )

  $Panel.Children.Clear()
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
    $reading.FontSize = $ReadingFontSize
    $reading.FontWeight = [Windows.FontWeights]::SemiBold
    $reading.Foreground = if ($readingValue) { New-Brush $ReadingColor } else { New-Brush "#00121212" }
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
    $base.FontSize = $BaseFontSize
    $base.FontWeight = [Windows.FontWeights]::SemiBold
    $base.Foreground = New-Brush $BaseColor
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
    [void]$Panel.Children.Add($segmentPanel)
  }

  return $Panel.Children.Count
}

function Set-LyricSegments {
  param(
    [Parameter(Mandatory = $true)][object[]]$Segments,
    [Parameter(Mandatory = $true)][object[]]$NextSegments,
    [Parameter(Mandatory = $true)][double]$CurrentFontSize,
    [Parameter(Mandatory = $true)][double]$NextFontSize
  )

  $renderSignature = [ordered]@{
    segments = $Segments
    nextSegments = $NextSegments
    currentFontSize = $CurrentFontSize
    nextFontSize = $NextFontSize
  } | ConvertTo-Json -Compress -Depth 5
  if ($renderSignature -eq $lastRenderedStateSignature) {
    return
  }

  $currentSignature = Get-SegmentTextSignature -Segments $Segments
  $nextSignature = Get-SegmentTextSignature -Segments $NextSegments
  $hadPreviousCurrent = @($lastCurrentSegments).Count -gt 0
  $transition = Get-OverlayTransition `
    -CurrentSignature $currentSignature `
    -PreviousCurrentSignature $lastCurrentLyricSignature `
    -PreviousNextSignature $lastNextLyricSignature `
    -HadPreviousCurrent $hadPreviousCurrent
  $currentChanged = $transition -ne "unchanged"
  $promoteFromNext = $transition -eq "promote-next"
  $previousNextFontSize = $lastNextFontSize

  $viewbox.BeginAnimation([Windows.UIElement]::OpacityProperty, $null)
  $currentTranslate.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, $null)
  $currentScale.BeginAnimation([Windows.Media.ScaleTransform]::ScaleXProperty, $null)
  $currentScale.BeginAnimation([Windows.Media.ScaleTransform]::ScaleYProperty, $null)
  $nextViewbox.BeginAnimation([Windows.UIElement]::OpacityProperty, $null)
  $nextTranslate.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, $null)
  $outgoingViewbox.BeginAnimation([Windows.UIElement]::OpacityProperty, $null)
  $outgoingTranslate.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, $null)
  $viewbox.Opacity = 1
  $currentTranslate.Y = 0
  $currentScale.ScaleX = 1
  $currentScale.ScaleY = 1
  $nextViewbox.Opacity = 0.72
  $nextTranslate.Y = 0
  $outgoingViewbox.Opacity = 1
  $outgoingTranslate.Y = 0

  $outgoingCount = 0
  if ($currentChanged -and $hadPreviousCurrent) {
    $outgoingCount = Set-SegmentPanel `
      -Panel $outgoingLyricsPanel `
      -Segments $lastCurrentSegments `
      -BaseFontSize $lastCurrentFontSize `
      -ReadingFontSize ([Math]::Round($lastCurrentFontSize * 0.47, 1)) `
      -BaseColor "#FFF8F2" `
      -ReadingColor "#E6B8F5D7"
    $outgoingViewbox.Visibility = if ($outgoingCount -gt 0) {
      [Windows.Visibility]::Visible
    } else {
      [Windows.Visibility]::Collapsed
    }
  } else {
    $outgoingViewbox.Visibility = [Windows.Visibility]::Collapsed
    $outgoingLyricsPanel.Children.Clear()
  }

  $currentReadingFontSize = [Math]::Round($CurrentFontSize * 0.47, 1)
  $nextReadingFontSize = [Math]::Round($NextFontSize * 0.5, 1)
  $currentCount = Set-SegmentPanel `
    -Panel $lyricsPanel `
    -Segments $Segments `
    -BaseFontSize $CurrentFontSize `
    -ReadingFontSize $currentReadingFontSize `
    -BaseColor "#FFF8F2" `
    -ReadingColor "#E6B8F5D7"
  $nextCount = Set-SegmentPanel `
    -Panel $nextLyricsPanel `
    -Segments $NextSegments `
    -BaseFontSize $NextFontSize `
    -ReadingFontSize $nextReadingFontSize `
    -BaseColor "#BFF8F2" `
    -ReadingColor "#A8B8F5D7"
  $nextViewbox.Visibility = if ($nextCount -gt 0) {
    [Windows.Visibility]::Visible
  } else {
    [Windows.Visibility]::Collapsed
  }

  $script:lastRenderedStateSignature = $renderSignature
  $script:lastCurrentLyricSignature = $currentSignature
  $script:lastNextLyricSignature = $nextSignature
  $script:lastCurrentSegments = @($Segments)
  $script:lastCurrentFontSize = $CurrentFontSize
  $script:lastNextFontSize = $NextFontSize

  if ($currentCount -eq 0 -or $suppressed) {
    $window.Hide()
  } else {
    $window.Topmost = $true
    $window.Show()
    if ($currentChanged) {
      $duration = [Windows.Duration]::new([TimeSpan]::FromMilliseconds(360))
      $ease = [Windows.Media.Animation.CubicEase]::new()
      $ease.EasingMode = [Windows.Media.Animation.EasingMode]::EaseOut
      $startY = if ($promoteFromNext) { 64 } else { 18 }
      $startScale = if ($promoteFromNext) {
        [Math]::Min(1, [Math]::Max(0.45, $previousNextFontSize / $CurrentFontSize))
      } else {
        0.94
      }
      $startOpacity = if ($promoteFromNext) { 0.72 } else { 0.12 }

      $currentFade = [Windows.Media.Animation.DoubleAnimation]::new($startOpacity, 1, $duration)
      $currentSlide = [Windows.Media.Animation.DoubleAnimation]::new($startY, 0, $duration)
      $currentGrowX = [Windows.Media.Animation.DoubleAnimation]::new($startScale, 1, $duration)
      $currentGrowY = [Windows.Media.Animation.DoubleAnimation]::new($startScale, 1, $duration)
      $currentSlide.EasingFunction = $ease
      $currentGrowX.EasingFunction = $ease
      $currentGrowY.EasingFunction = $ease
      $viewbox.BeginAnimation([Windows.UIElement]::OpacityProperty, $currentFade)
      $currentTranslate.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, $currentSlide)
      $currentScale.BeginAnimation([Windows.Media.ScaleTransform]::ScaleXProperty, $currentGrowX)
      $currentScale.BeginAnimation([Windows.Media.ScaleTransform]::ScaleYProperty, $currentGrowY)

      if ($nextCount -gt 0) {
        $nextDuration = [Windows.Duration]::new([TimeSpan]::FromMilliseconds(240))
        $nextFade = [Windows.Media.Animation.DoubleAnimation]::new(0, 0.72, $nextDuration)
        $nextSlide = [Windows.Media.Animation.DoubleAnimation]::new(18, 0, $nextDuration)
        $nextFade.BeginTime = [TimeSpan]::FromMilliseconds(100)
        $nextSlide.BeginTime = [TimeSpan]::FromMilliseconds(100)
        $nextSlide.EasingFunction = $ease
        $nextViewbox.BeginAnimation([Windows.UIElement]::OpacityProperty, $nextFade)
        $nextTranslate.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, $nextSlide)
      }

      if ($outgoingCount -gt 0) {
        $outgoingDuration = [Windows.Duration]::new([TimeSpan]::FromMilliseconds(260))
        $outgoingFade = [Windows.Media.Animation.DoubleAnimation]::new(1, 0, $outgoingDuration)
        $outgoingSlide = [Windows.Media.Animation.DoubleAnimation]::new(0, -28, $outgoingDuration)
        $outgoingSlide.EasingFunction = $ease
        $hideOutgoing = {
          $outgoingViewbox.Visibility = [Windows.Visibility]::Collapsed
          $outgoingLyricsPanel.Children.Clear()
        }.GetNewClosure()
        $outgoingFade.add_Completed($hideOutgoing)
        $outgoingViewbox.BeginAnimation([Windows.UIElement]::OpacityProperty, $outgoingFade)
        $outgoingTranslate.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, $outgoingSlide)
      }
    }
  }
}

function Apply-OverlayState {
  param([Parameter(Mandatory = $true)][string]$Body)

  try {
    $state = ConvertFrom-OverlayStateBody -Body $Body
    if ($null -eq $state) {
      return
    }
    if (-not $state.Enabled) {
      $script:suppressed = $false
      $script:lastCurrentLyricSignature = ""
      $script:lastNextLyricSignature = ""
      $script:lastRenderedStateSignature = ""
      $script:lastCurrentSegments = @()
      $script:lastCurrentFontSize = 30
      $script:lastNextFontSize = 20
      $window.Hide()
      return
    }
    Set-LyricSegments `
      -Segments $state.Segments `
      -NextSegments $state.NextSegments `
      -CurrentFontSize $state.CurrentFontSize `
      -NextFontSize $state.NextFontSize
  } catch {
    # Ignore malformed loopback messages without writing lyric content to disk.
  }
}

try {
  $window = [Windows.Window]::new()
  $window.Title = "Furigana for Spotify Desktop Lyrics"
  $window.Width = 720
  $window.Height = 154
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
  $card.Padding = [Windows.Thickness]::new(6, 5, 6, 5)

  $grid = [Windows.Controls.Grid]::new()
  [void]$grid.ColumnDefinitions.Add([Windows.Controls.ColumnDefinition]@{ Width = [Windows.GridLength]::new(44) })
  [void]$grid.ColumnDefinitions.Add([Windows.Controls.ColumnDefinition]@{ Width = [Windows.GridLength]::new(1, [Windows.GridUnitType]::Star) })
  [void]$grid.ColumnDefinitions.Add([Windows.Controls.ColumnDefinition]@{ Width = [Windows.GridLength]::new(28) })

  $badge = [Windows.Controls.Border]::new()
  $badge.Width = 34
  $badge.Height = 34
  $badge.Background = New-Brush "#8001CA95"
  $badge.CornerRadius = [Windows.CornerRadius]::new(10)
  $badge.Opacity = 0.3
  $badge.ToolTip = "Drag to move desktop lyrics"
  $badge.HorizontalAlignment = [Windows.HorizontalAlignment]::Right
  $badge.VerticalAlignment = [Windows.VerticalAlignment]::Center
  $badge.Margin = [Windows.Thickness]::new(0, 0, 2, 0)
  $badgeText = [Windows.Controls.TextBlock]::new()
  $badgeText.Text = [string][char]0x3075
  $badgeText.FontFamily = [Windows.Media.FontFamily]::new("Yu Gothic UI, Meiryo UI")
  $badgeText.FontSize = 19
  $badgeText.FontWeight = [Windows.FontWeights]::Bold
  $badgeText.Foreground = New-Brush "#FFF8F2"
  $badgeText.HorizontalAlignment = [Windows.HorizontalAlignment]::Center
  $badgeText.VerticalAlignment = [Windows.VerticalAlignment]::Center
  $badge.Child = $badgeText
  [Windows.Controls.Grid]::SetColumn($badge, 0)

  $contentStack = [Windows.Controls.StackPanel]::new()
  $contentStack.Orientation = [Windows.Controls.Orientation]::Vertical
  $contentStack.HorizontalAlignment = [Windows.HorizontalAlignment]::Stretch
  $contentStack.VerticalAlignment = [Windows.VerticalAlignment]::Center

  $viewbox = [Windows.Controls.Viewbox]::new()
  $viewbox.Height = 78
  $viewbox.Stretch = [Windows.Media.Stretch]::Uniform
  $viewbox.StretchDirection = [Windows.Controls.StretchDirection]::DownOnly
  $viewbox.HorizontalAlignment = [Windows.HorizontalAlignment]::Center
  $viewbox.VerticalAlignment = [Windows.VerticalAlignment]::Center
  $viewbox.Margin = [Windows.Thickness]::new(2, 0, 2, 0)
  $viewbox.RenderTransformOrigin = [Windows.Point]::new(0.5, 0.5)
  $currentTransform = [Windows.Media.TransformGroup]::new()
  $currentScale = [Windows.Media.ScaleTransform]::new(1, 1)
  $currentTranslate = [Windows.Media.TranslateTransform]::new(0, 0)
  [void]$currentTransform.Children.Add($currentScale)
  [void]$currentTransform.Children.Add($currentTranslate)
  $viewbox.RenderTransform = $currentTransform
  $lyricsPanel = [Windows.Controls.StackPanel]::new()
  $lyricsPanel.Orientation = [Windows.Controls.Orientation]::Horizontal
  $lyricsPanel.HorizontalAlignment = [Windows.HorizontalAlignment]::Center
  $viewbox.Child = $lyricsPanel

  $nextViewbox = [Windows.Controls.Viewbox]::new()
  $nextViewbox.Height = 48
  $nextViewbox.Stretch = [Windows.Media.Stretch]::Uniform
  $nextViewbox.StretchDirection = [Windows.Controls.StretchDirection]::DownOnly
  $nextViewbox.HorizontalAlignment = [Windows.HorizontalAlignment]::Center
  $nextViewbox.VerticalAlignment = [Windows.VerticalAlignment]::Center
  $nextViewbox.Margin = [Windows.Thickness]::new(2, -4, 2, 0)
  $nextViewbox.Opacity = 0.72
  $nextTranslate = [Windows.Media.TranslateTransform]::new(0, 0)
  $nextViewbox.RenderTransform = $nextTranslate
  $nextLyricsPanel = [Windows.Controls.StackPanel]::new()
  $nextLyricsPanel.Orientation = [Windows.Controls.Orientation]::Horizontal
  $nextLyricsPanel.HorizontalAlignment = [Windows.HorizontalAlignment]::Center
  $nextViewbox.Child = $nextLyricsPanel

  [void]$contentStack.Children.Add($viewbox)
  [void]$contentStack.Children.Add($nextViewbox)

  $outgoingViewbox = [Windows.Controls.Viewbox]::new()
  $outgoingViewbox.Height = 78
  $outgoingViewbox.Stretch = [Windows.Media.Stretch]::Uniform
  $outgoingViewbox.StretchDirection = [Windows.Controls.StretchDirection]::DownOnly
  $outgoingViewbox.HorizontalAlignment = [Windows.HorizontalAlignment]::Center
  $outgoingViewbox.VerticalAlignment = [Windows.VerticalAlignment]::Top
  $outgoingViewbox.Margin = [Windows.Thickness]::new(4, 0, 4, 0)
  $outgoingViewbox.Visibility = [Windows.Visibility]::Collapsed
  $outgoingViewbox.IsHitTestVisible = $false
  $outgoingTranslate = [Windows.Media.TranslateTransform]::new(0, 0)
  $outgoingViewbox.RenderTransform = $outgoingTranslate
  $outgoingLyricsPanel = [Windows.Controls.StackPanel]::new()
  $outgoingLyricsPanel.Orientation = [Windows.Controls.Orientation]::Horizontal
  $outgoingLyricsPanel.HorizontalAlignment = [Windows.HorizontalAlignment]::Center
  $outgoingViewbox.Child = $outgoingLyricsPanel

  $lyricsStage = [Windows.Controls.Grid]::new()
  $lyricsStage.Height = 122
  $lyricsStage.HorizontalAlignment = [Windows.HorizontalAlignment]::Stretch
  $lyricsStage.VerticalAlignment = [Windows.VerticalAlignment]::Center
  [void]$lyricsStage.Children.Add($contentStack)
  [void]$lyricsStage.Children.Add($outgoingViewbox)
  [Windows.Controls.Grid]::SetColumn($lyricsStage, 1)

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
  [void]$grid.Children.Add($lyricsStage)
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
  $timer.Interval = [TimeSpan]::FromMilliseconds(50)
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
    if ($processCheckTick -lt 20) {
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
