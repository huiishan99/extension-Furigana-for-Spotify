import AppKit
import CoreText
import Darwin
import Foundation
import QuartzCore

private let overlayWidth: CGFloat = 720
private let overlayHeight: CGFloat = 154
private let maximumBodyLength = 60_000
private let maximumRequestLength = 65_536

private struct OverlaySegment: Decodable, Equatable {
  let text: String
  let reading: String?
}

private struct RawOverlayState: Decodable {
  let version: Int?
  let enabled: Bool?
  let segments: [OverlaySegment]?
  let nextSegments: [OverlaySegment]?
  let currentFontSize: Double?
  let nextFontSize: Double?
}

private struct OverlayState: Equatable {
  let enabled: Bool
  let segments: [OverlaySegment]
  let nextSegments: [OverlaySegment]
  let currentFontSize: CGFloat
  let nextFontSize: CGFloat
}

private struct SavedPosition: Codable {
  let left: Double
  let top: Double
}

private func clampedFontSize(
  _ value: Double?, default defaultValue: Double, range: ClosedRange<Double>
) -> CGFloat {
  guard let value, value.isFinite else {
    return CGFloat(defaultValue)
  }
  return CGFloat(min(range.upperBound, max(range.lowerBound, value)))
}

private func sanitizedSegments(_ segments: [OverlaySegment]?) -> [OverlaySegment] {
  return (segments ?? []).prefix(128).compactMap { segment in
    let text = String(segment.text.prefix(512))
    guard !text.isEmpty else {
      return nil
    }
    let reading = segment.reading.map { String($0.prefix(512)) }.flatMap { $0.isEmpty ? nil : $0 }
    return OverlaySegment(text: text, reading: reading)
  }
}

private func decodeOverlayState(_ body: Data) -> OverlayState? {
  guard let raw = try? JSONDecoder().decode(RawOverlayState.self, from: body),
    raw.version == 1,
    let enabled = raw.enabled
  else {
    return nil
  }
  if !enabled {
    return OverlayState(
      enabled: false,
      segments: [],
      nextSegments: [],
      currentFontSize: 30,
      nextFontSize: 20
    )
  }
  return OverlayState(
    enabled: true,
    segments: sanitizedSegments(raw.segments),
    nextSegments: sanitizedSegments(raw.nextSegments),
    currentFontSize: clampedFontSize(raw.currentFontSize, default: 30, range: 26...44),
    nextFontSize: clampedFontSize(raw.nextFontSize, default: 20, range: 12...24)
  )
}

private enum RequestMetadata {
  case incomplete
  case invalid
  case valid(bodyOffset: Int, bodyLength: Int)
}

private func requestMetadata(_ request: Data) -> RequestMetadata {
  let separator = Data([13, 10, 13, 10])
  guard let separatorRange = request.range(of: separator) else {
    return request.count < maximumRequestLength ? .incomplete : .invalid
  }
  guard let header = String(data: request[..<separatorRange.lowerBound], encoding: .ascii) else {
    return .invalid
  }
  let lines = header.components(separatedBy: "\r\n")
  guard let requestLine = lines.first,
    requestLine == "POST /state HTTP/1.1" || requestLine == "POST /state HTTP/1.0"
  else {
    return .invalid
  }

  var headers: [String: String] = [:]
  for line in lines.dropFirst() {
    guard let colon = line.firstIndex(of: ":") else {
      return .invalid
    }
    let name = line[..<colon].trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    let value = line[line.index(after: colon)...].trimmingCharacters(in: .whitespacesAndNewlines)
    headers[name] = value
  }
  guard headers["origin"] == "https://xpui.app.spotify.com",
    let lengthText = headers["content-length"],
    !lengthText.isEmpty,
    lengthText.utf8.allSatisfy({ (48...57).contains($0) }),
    let bodyLength = Int(lengthText),
    (0...maximumBodyLength).contains(bodyLength)
  else {
    return .invalid
  }
  let bodyOffset = separatorRange.upperBound
  guard bodyOffset + bodyLength <= maximumRequestLength else {
    return .invalid
  }
  return .valid(bodyOffset: bodyOffset, bodyLength: bodyLength)
}

private func requestBody(_ request: Data) -> Data? {
  guard case .valid(let bodyOffset, let bodyLength) = requestMetadata(request),
    request.count >= bodyOffset + bodyLength
  else {
    return nil
  }
  return request.subdata(in: bodyOffset..<bodyOffset + bodyLength)
}

private final class LoopbackServer {
  private var socketDescriptor: Int32 = -1
  private var source: DispatchSourceRead?
  private let onBody: (Data) -> Void

  init(port: UInt16, onBody: @escaping (Data) -> Void) throws {
    self.onBody = onBody
    socketDescriptor = socket(AF_INET, SOCK_STREAM, 0)
    guard socketDescriptor >= 0 else {
      throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
    }

    var reuseAddress: Int32 = 1
    setsockopt(
      socketDescriptor,
      SOL_SOCKET,
      SO_REUSEADDR,
      &reuseAddress,
      socklen_t(MemoryLayout.size(ofValue: reuseAddress))
    )
    var noSignal: Int32 = 1
    setsockopt(
      socketDescriptor, SOL_SOCKET, SO_NOSIGPIPE, &noSignal,
      socklen_t(MemoryLayout.size(ofValue: noSignal)))
    let currentFlags = fcntl(socketDescriptor, F_GETFL, 0)
    _ = fcntl(socketDescriptor, F_SETFL, currentFlags | O_NONBLOCK)

    var address = sockaddr_in()
    address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
    address.sin_family = sa_family_t(AF_INET)
    address.sin_port = port.bigEndian
    address.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))
    let bindResult = withUnsafePointer(to: &address) { pointer in
      pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { rebound in
        Darwin.bind(socketDescriptor, rebound, socklen_t(MemoryLayout<sockaddr_in>.size))
      }
    }
    guard bindResult == 0, listen(socketDescriptor, 8) == 0 else {
      let savedError = errno
      Darwin.close(socketDescriptor)
      socketDescriptor = -1
      throw POSIXError(POSIXErrorCode(rawValue: savedError) ?? .EIO)
    }

    let source = DispatchSource.makeReadSource(fileDescriptor: socketDescriptor, queue: .main)
    source.setEventHandler { [weak self] in
      self?.acceptPendingConnections()
    }
    source.setCancelHandler { [socketDescriptor] in
      Darwin.close(socketDescriptor)
    }
    self.source = source
    source.resume()
  }

  deinit {
    stop()
  }

  func stop() {
    source?.cancel()
    source = nil
    socketDescriptor = -1
  }

  private func acceptPendingConnections() {
    while socketDescriptor >= 0 {
      let client = accept(socketDescriptor, nil, nil)
      if client < 0 {
        if errno == EAGAIN || errno == EWOULDBLOCK {
          return
        }
        return
      }
      DispatchQueue.global(qos: .userInitiated).async { [weak self] in
        self?.handle(client: client)
      }
    }
  }

  private func handle(client: Int32) {
    defer { Darwin.close(client) }
    var noSignal: Int32 = 1
    setsockopt(
      client, SOL_SOCKET, SO_NOSIGPIPE, &noSignal, socklen_t(MemoryLayout.size(ofValue: noSignal)))
    var timeout = timeval(tv_sec: 1, tv_usec: 0)
    setsockopt(
      client, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout.size(ofValue: timeout)))

    var request = Data()
    var buffer = [UInt8](repeating: 0, count: 4096)
    while request.count < maximumRequestLength {
      let count = recv(client, &buffer, min(buffer.count, maximumRequestLength - request.count), 0)
      if count <= 0 {
        break
      }
      request.append(buffer, count: count)
      switch requestMetadata(request) {
      case .invalid:
        sendNoContent(to: client)
        return
      case .incomplete:
        continue
      case .valid(let bodyOffset, let bodyLength):
        if request.count >= bodyOffset + bodyLength {
          if let body = requestBody(request) {
            DispatchQueue.main.async { [weak self] in
              self?.onBody(body)
            }
          }
          sendNoContent(to: client)
          return
        }
      }
    }
    sendNoContent(to: client)
  }

  private func sendNoContent(to client: Int32) {
    let response = Array(
      "HTTP/1.1 204 No Content\r\nConnection: close\r\nContent-Length: 0\r\n\r\n".utf8)
    response.withUnsafeBytes { bytes in
      _ = Darwin.send(client, bytes.baseAddress, bytes.count, 0)
    }
  }
}

private final class LyricLineView: NSView {
  var segments: [OverlaySegment] = [] {
    didSet { rebuildLine() }
  }
  var baseFontSize: CGFloat = 30 {
    didSet { rebuildLine() }
  }
  var baseColor = NSColor(calibratedRed: 1, green: 0.973, blue: 0.949, alpha: 1) {
    didSet { rebuildLine() }
  }
  var readingColor = NSColor(calibratedRed: 0.722, green: 0.961, blue: 0.843, alpha: 0.9) {
    didSet { rebuildLine() }
  }
  var readingScale: CGFloat = 0.47 {
    didSet { rebuildLine() }
  }

  private var line: CTLine?

  override init(frame frameRect: NSRect) {
    super.init(frame: frameRect)
    wantsLayer = true
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is unavailable")
  }

  private func rebuildLine() {
    let result = NSMutableAttributedString()
    let baseFont = CTFontCreateWithName("Hiragino Sans" as CFString, baseFontSize, nil)
    let readingFont = CTFontCreateWithName(
      "Hiragino Sans" as CFString, baseFontSize * readingScale, nil)
    for segment in segments {
      let piece = NSMutableAttributedString(
        string: segment.text,
        attributes: [
          NSAttributedString.Key(kCTFontAttributeName as String): baseFont,
          NSAttributedString.Key(kCTForegroundColorAttributeName as String): baseColor.cgColor,
        ]
      )
      if let reading = segment.reading, !reading.isEmpty {
        let rubyAttributes: [CFString: Any] = [
          kCTFontAttributeName: readingFont,
          kCTForegroundColorAttributeName: readingColor.cgColor,
        ]
        let annotation = CTRubyAnnotationCreateWithAttributes(
          .auto,
          .auto,
          .before,
          reading as CFString,
          rubyAttributes as CFDictionary
        )
        piece.addAttribute(
          NSAttributedString.Key(kCTRubyAnnotationAttributeName as String),
          value: annotation,
          range: NSRange(location: 0, length: piece.length)
        )
      }
      result.append(piece)
    }
    line = result.length > 0 ? CTLineCreateWithAttributedString(result) : nil
    needsDisplay = true
  }

  override func draw(_ dirtyRect: NSRect) {
    super.draw(dirtyRect)
    guard let line, let context = NSGraphicsContext.current?.cgContext else {
      return
    }
    context.saveGState()
    defer { context.restoreGState() }
    context.setShadow(
      offset: CGSize(width: 0, height: -1), blur: 4,
      color: NSColor.black.withAlphaComponent(0.95).cgColor)
    context.textMatrix = .identity
    context.textPosition = .zero
    let lineBounds = CTLineGetImageBounds(line, context)
    guard lineBounds.width > 0, lineBounds.height > 0 else {
      return
    }
    let horizontalPadding: CGFloat = 8
    let verticalPadding: CGFloat = 4
    let scale = min(
      1,
      max(0.1, (bounds.width - horizontalPadding * 2) / lineBounds.width),
      max(0.1, (bounds.height - verticalPadding * 2) / lineBounds.height)
    )
    let x = (bounds.width - lineBounds.width * scale) / 2 - lineBounds.minX * scale
    let y = (bounds.height - lineBounds.height * scale) / 2 - lineBounds.minY * scale
    context.translateBy(x: x, y: y)
    context.scaleBy(x: scale, y: scale)
    CTLineDraw(line, context)
  }
}

private final class BadgeView: NSView {
  override func draw(_ dirtyRect: NSRect) {
    super.draw(dirtyRect)
    NSColor(calibratedRed: 0.004, green: 0.792, blue: 0.584, alpha: 0.5).setFill()
    NSBezierPath(roundedRect: bounds, xRadius: 10, yRadius: 10).fill()
    let text = "ふ" as NSString
    let attributes: [NSAttributedString.Key: Any] = [
      .font: NSFont(name: "Hiragino Sans", size: 19)
        ?? NSFont.systemFont(ofSize: 19, weight: .bold),
      .foregroundColor: NSColor(calibratedRed: 1, green: 0.973, blue: 0.949, alpha: 1),
    ]
    let size = text.size(withAttributes: attributes)
    text.draw(
      at: CGPoint(x: (bounds.width - size.width) / 2, y: (bounds.height - size.height) / 2),
      withAttributes: attributes
    )
  }
}

private final class OverlayContentView: NSView {
  let currentView = LyricLineView(frame: NSRect(x: 48, y: 59, width: 642, height: 84))
  let nextView = LyricLineView(frame: NSRect(x: 48, y: 9, width: 642, height: 50))
  let outgoingView = LyricLineView(frame: NSRect(x: 48, y: 59, width: 642, height: 84))
  private let badgeView = BadgeView(frame: NSRect(x: 8, y: 60, width: 34, height: 34))
  private let closeButton = NSButton(frame: NSRect(x: 686, y: 120, width: 26, height: 26))
  private var trackingAreaReference: NSTrackingArea?
  var onClose: (() -> Void)?

  override init(frame frameRect: NSRect) {
    super.init(frame: frameRect)
    wantsLayer = true
    outgoingView.isHidden = true
    nextView.alphaValue = 0.72
    nextView.baseColor = NSColor(calibratedRed: 0.749, green: 0.973, blue: 0.949, alpha: 1)
    nextView.readingColor = NSColor(calibratedRed: 0.722, green: 0.961, blue: 0.843, alpha: 0.66)
    nextView.readingScale = 0.5
    badgeView.alphaValue = 0.3
    badgeView.toolTip = "Drag to move desktop lyrics"

    closeButton.title = "×"
    closeButton.isBordered = false
    closeButton.bezelStyle = .inline
    closeButton.font = NSFont.systemFont(ofSize: 17)
    closeButton.contentTintColor = NSColor.white.withAlphaComponent(0.85)
    closeButton.alphaValue = 0.25
    closeButton.toolTip = "Hide until the desktop lyric setting is turned off and on"
    closeButton.target = self
    closeButton.action = #selector(closeOverlay)
    closeButton.setAccessibilityLabel("Hide desktop lyrics")

    addSubview(outgoingView)
    addSubview(currentView)
    addSubview(nextView)
    addSubview(badgeView)
    addSubview(closeButton)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is unavailable")
  }

  override func hitTest(_ point: NSPoint) -> NSView? {
    return closeButton.frame.contains(point) ? closeButton : self
  }

  override func mouseDown(with event: NSEvent) {
    window?.performDrag(with: event)
  }

  override func updateTrackingAreas() {
    if let trackingAreaReference {
      removeTrackingArea(trackingAreaReference)
    }
    let tracking = NSTrackingArea(
      rect: bounds,
      options: [.activeAlways, .mouseEnteredAndExited],
      owner: self,
      userInfo: nil
    )
    addTrackingArea(tracking)
    trackingAreaReference = tracking
    super.updateTrackingAreas()
  }

  override func mouseEntered(with event: NSEvent) {
    badgeView.alphaValue = 0.8
    closeButton.alphaValue = 0.8
  }

  override func mouseExited(with event: NSEvent) {
    badgeView.alphaValue = 0.3
    closeButton.alphaValue = 0.25
  }

  @objc private func closeOverlay() {
    onClose?()
  }
}

private final class OverlayPanel: NSPanel {
  override var canBecomeKey: Bool { false }
  override var canBecomeMain: Bool { false }
}

private final class OverlayController: NSObject {
  private let panel: OverlayPanel
  private let contentView: OverlayContentView
  private let positionPath: URL
  private let startedAt = Date()
  private var lastSpotifySeenAt: Date?
  private var spotifySeen = false
  private var suppressed = false
  private var lastState: OverlayState?
  private var lastCurrentSignature = ""
  private var lastNextSignature = ""
  private var server: LoopbackServer?
  private var processTimer: Timer?
  private var animationGeneration = 0
  private let previewMode: Bool

  init(port: UInt16, previewMode: Bool) throws {
    self.previewMode = previewMode
    let stateRoot = FileManager.default.homeDirectoryForCurrentUser
      .appendingPathComponent("Library/Application Support/Furigana for Spotify", isDirectory: true)
    positionPath = stateRoot.appendingPathComponent("overlay-position.json")

    let frame = NSRect(x: 0, y: 0, width: overlayWidth, height: overlayHeight)
    panel = OverlayPanel(
      contentRect: frame,
      styleMask: [.borderless, .nonactivatingPanel],
      backing: .buffered,
      defer: false
    )
    contentView = OverlayContentView(frame: frame)
    super.init()

    panel.title = "Furigana for Spotify Desktop Lyrics"
    panel.contentView = contentView
    panel.isOpaque = false
    panel.backgroundColor = .clear
    panel.hasShadow = false
    panel.level = .floating
    panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
    panel.hidesOnDeactivate = false
    panel.isReleasedWhenClosed = false
    panel.animationBehavior = .none
    panel.isMovable = true
    panel.isMovableByWindowBackground = true
    panel.setAccessibilityTitle("Furigana for Spotify Desktop Lyrics")
    setInitialPosition()

    contentView.onClose = { [weak self] in
      self?.suppressed = true
      self?.panel.orderOut(nil)
    }
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(windowDidMove),
      name: NSWindow.didMoveNotification,
      object: panel
    )

    server = try LoopbackServer(port: port) { [weak self] body in
      self?.apply(body: body)
    }
    if !previewMode {
      processTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
        self?.checkSpotifyProcess()
      }
    }
  }

  deinit {
    processTimer?.invalidate()
    server?.stop()
    NotificationCenter.default.removeObserver(self)
  }

  func showPreview() {
    let state = OverlayState(
      enabled: true,
      segments: [
        OverlaySegment(text: "明日", reading: "あした"),
        OverlaySegment(text: "は", reading: nil),
        OverlaySegment(text: "晴", reading: "は"),
        OverlaySegment(text: "れる", reading: nil),
      ],
      nextSegments: [
        OverlaySegment(text: "二人", reading: "ふたり"),
        OverlaySegment(text: "で歩こう", reading: nil),
      ],
      currentFontSize: 34,
      nextFontSize: 21
    )
    render(state)
  }

  private func apply(body: Data) {
    guard let state = decodeOverlayState(body) else {
      return
    }
    if !state.enabled {
      suppressed = false
      lastState = nil
      lastCurrentSignature = ""
      lastNextSignature = ""
      contentView.currentView.segments = []
      contentView.nextView.segments = []
      contentView.outgoingView.segments = []
      panel.orderOut(nil)
      return
    }
    render(state)
  }

  private func render(_ state: OverlayState) {
    guard state != lastState else {
      return
    }
    let currentSignature = state.segments.map(\.text).joined(separator: "\u{001F}")
    let nextSignature = state.nextSegments.map(\.text).joined(separator: "\u{001F}")
    let currentChanged = currentSignature != lastCurrentSignature
    let promoteFromNext = !lastNextSignature.isEmpty && lastNextSignature == currentSignature
    let previousCurrent = contentView.currentView.segments
    let previousCurrentSize = contentView.currentView.baseFontSize

    contentView.currentView.baseFontSize = state.currentFontSize
    contentView.currentView.segments = state.segments
    contentView.nextView.baseFontSize = state.nextFontSize
    contentView.nextView.segments = state.nextSegments
    contentView.nextView.isHidden = state.nextSegments.isEmpty
    lastState = state
    lastCurrentSignature = currentSignature
    lastNextSignature = nextSignature

    guard !state.segments.isEmpty, !suppressed else {
      panel.orderOut(nil)
      return
    }
    panel.orderFrontRegardless()

    if currentChanged {
      animationGeneration += 1
      let generation = animationGeneration
      if !previousCurrent.isEmpty {
        contentView.outgoingView.baseFontSize = previousCurrentSize
        contentView.outgoingView.segments = previousCurrent
        contentView.outgoingView.isHidden = false
        animate(
          view: contentView.outgoingView,
          fromOpacity: 1,
          toOpacity: 0,
          fromTranslationY: 0,
          toTranslationY: 28,
          fromScale: 1,
          toScale: 1,
          duration: 0.26
        )
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.27) { [weak self] in
          guard self?.animationGeneration == generation else { return }
          self?.contentView.outgoingView.isHidden = true
          self?.contentView.outgoingView.segments = []
        }
      }
      let startScale =
        promoteFromNext
        ? min(1, max(0.45, state.nextFontSize / state.currentFontSize))
        : 0.94
      animate(
        view: contentView.currentView,
        fromOpacity: promoteFromNext ? 0.72 : 0.12,
        toOpacity: 1,
        fromTranslationY: promoteFromNext ? -50 : -18,
        toTranslationY: 0,
        fromScale: startScale,
        toScale: 1,
        duration: 0.36
      )
      if !state.nextSegments.isEmpty {
        animate(
          view: contentView.nextView,
          fromOpacity: 0,
          toOpacity: 0.72,
          fromTranslationY: -18,
          toTranslationY: 0,
          fromScale: 1,
          toScale: 1,
          duration: 0.24,
          delay: 0.1
        )
      }
    }
  }

  private func animate(
    view: NSView,
    fromOpacity: Float,
    toOpacity: Float,
    fromTranslationY: CGFloat,
    toTranslationY: CGFloat,
    fromScale: CGFloat,
    toScale: CGFloat,
    duration: CFTimeInterval,
    delay: CFTimeInterval = 0
  ) {
    guard let layer = view.layer else { return }
    layer.opacity = toOpacity
    let opacity = CABasicAnimation(keyPath: "opacity")
    opacity.fromValue = fromOpacity
    opacity.toValue = toOpacity
    let translation = CABasicAnimation(keyPath: "transform.translation.y")
    translation.fromValue = fromTranslationY
    translation.toValue = toTranslationY
    let scale = CABasicAnimation(keyPath: "transform.scale")
    scale.fromValue = fromScale
    scale.toValue = toScale
    let group = CAAnimationGroup()
    group.animations = [opacity, translation, scale]
    group.duration = duration
    group.beginTime = CACurrentMediaTime() + delay
    group.fillMode = .backwards
    group.timingFunction = CAMediaTimingFunction(name: .easeOut)
    layer.add(group, forKey: "lyric-transition")
  }

  private func setInitialPosition() {
    let visibleFrame = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
    var origin = CGPoint(
      x: visibleFrame.midX - overlayWidth / 2,
      y: visibleFrame.minY + 72
    )
    if let data = try? Data(contentsOf: positionPath),
      let saved = try? JSONDecoder().decode(SavedPosition.self, from: data),
      saved.left.isFinite,
      saved.top.isFinite
    {
      origin = CGPoint(x: saved.left, y: saved.top)
    }
    let allScreens = NSScreen.screens.map(\.visibleFrame)
    let workspace = allScreens.reduce(visibleFrame) { $0.union($1) }
    origin.x = min(workspace.maxX - overlayWidth - 12, max(workspace.minX + 12, origin.x))
    origin.y = min(workspace.maxY - overlayHeight - 12, max(workspace.minY + 12, origin.y))
    panel.setFrameOrigin(origin)
  }

  @objc private func windowDidMove() {
    let position = SavedPosition(left: panel.frame.minX, top: panel.frame.minY)
    do {
      try FileManager.default.createDirectory(
        at: positionPath.deletingLastPathComponent(),
        withIntermediateDirectories: true
      )
      try JSONEncoder().encode(position).write(to: positionPath, options: .atomic)
    } catch {
      // Position persistence is optional and must not interrupt lyric display.
    }
  }

  private func checkSpotifyProcess() {
    let spotifyRunning = NSWorkspace.shared.runningApplications.contains { application in
      application.bundleIdentifier == "com.spotify.client" || application.localizedName == "Spotify"
    }
    if spotifyRunning {
      spotifySeen = true
      lastSpotifySeenAt = Date()
      return
    }
    let shouldExitAfterSpotify =
      spotifySeen && Date().timeIntervalSince(lastSpotifySeenAt ?? startedAt) >= 8
    let shouldExitWithoutSpotify = !spotifySeen && Date().timeIntervalSince(startedAt) >= 90
    if shouldExitAfterSpotify || shouldExitWithoutSpotify {
      NSApplication.shared.terminate(nil)
    }
  }
}

private final class AppDelegate: NSObject, NSApplicationDelegate {
  private var controller: OverlayController?
  private let port: UInt16
  private let previewMode: Bool

  init(port: UInt16, previewMode: Bool) {
    self.port = port
    self.previewMode = previewMode
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    do {
      controller = try OverlayController(port: port, previewMode: previewMode)
      if previewMode {
        controller?.showPreview()
      }
    } catch {
      FileHandle.standardError.write(
        Data("Furigana overlay could not start: \(error.localizedDescription)\n".utf8))
      NSApplication.shared.terminate(nil)
    }
  }
}

private func runSelfTest() -> Int32 {
  let validJSON =
    #"{"version":1,"enabled":true,"segments":[{"text":"二人","reading":"ふたり"}],"nextSegments":[{"text":"歩こう"}],"currentFontSize":99,"nextFontSize":1}"#
    .data(using: .utf8)!
  guard let state = decodeOverlayState(validJSON),
    state.currentFontSize == 44,
    state.nextFontSize == 12,
    state.segments == [OverlaySegment(text: "二人", reading: "ふたり")]
  else {
    return 1
  }
  let requestHeader =
    "POST /state HTTP/1.1\r\nOrigin: https://xpui.app.spotify.com\r\nContent-Length: \(validJSON.count)\r\n\r\n"
  var request = Data(requestHeader.utf8)
  request.append(validJSON)
  guard requestBody(request) == validJSON else {
    return 2
  }
  var rejected = Data(
    "POST /state HTTP/1.1\r\nOrigin: https://example.com\r\nContent-Length: \(validJSON.count)\r\n\r\n"
      .utf8)
  rejected.append(validJSON)
  guard requestBody(rejected) == nil else {
    return 3
  }
  print("macOS overlay self-test passed")
  return 0
}

private func commandLinePort() -> UInt16 {
  guard let index = CommandLine.arguments.firstIndex(of: "--port"),
    CommandLine.arguments.indices.contains(index + 1),
    let value = UInt16(CommandLine.arguments[index + 1]),
    value >= 1024
  else {
    return 43841
  }
  return value
}

@main
private struct FuriganaOverlayApplication {
  static func main() {
    if CommandLine.arguments.contains("--self-test") {
      Darwin.exit(runSelfTest())
    }
    let application = NSApplication.shared
    let applicationDelegate = AppDelegate(
      port: commandLinePort(),
      previewMode: CommandLine.arguments.contains("--preview")
    )
    application.setActivationPolicy(.accessory)
    application.delegate = applicationDelegate
    application.run()
  }
}
