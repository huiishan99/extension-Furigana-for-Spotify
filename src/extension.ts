import { getDictionaryPath } from "./assets";
import {
  convertToFurigana,
  createSafeFuriganaFragment,
} from "./reading-engine";
import {
  type FuriganaSettings,
  getFuriganaSettings,
  setFuriganaSettings,
  SETTING_CHANGE_EVENT,
} from "./settings";
import { LYRIC_SELECTOR, LYRIC_SELECTORS } from "./lyrics";
import { PLAYBAR_FU_ICON } from "./icon";
import { normalizeLyricText, shouldAnnotateLyric } from "./text";
import {
  createRuntimeDiagnostics,
  RUNTIME_DIAGNOSTICS_EVENT,
  RUNTIME_DIAGNOSTICS_KEY,
  type RuntimeDiagnosticsInput,
} from "./diagnostics";
import {
  clearOnlineReadingCache,
  fetchOnlineReadingResult,
  findOnlineRomanization,
  getCachedOnlineReading,
  ONLINE_CACHE_CLEAR_EVENT,
  ONLINE_STATUS_EVENT,
  ONLINE_STATUS_KEY,
  type OnlineReadingIndex,
  type OnlineReadingStatus,
  type OnlineTrackMetadata,
  setCachedOnlineReading,
} from "./online-readings";
import {
  getRuntimeUiLanguage,
  translateRuntimeMessage,
  UI_LANGUAGE_CHANGE_EVENT,
  type RuntimeMessageKey,
  type UiLanguage,
} from "./ui-language";
import {
  createDesktopOverlayState,
  extractDesktopLyricSegments,
  findTimedLyricContext,
  findCurrentLyricLine,
  getSpotifyLyricsUrl,
  parseSpotifyTimedLyrics,
  publishDesktopLyricPairProgressively,
  sendDesktopOverlayState,
  type DesktopLyricSegment,
  type DesktopOverlayState,
  type TimedLyricLine,
} from "./floating-lyrics";

const STATE_ATTRIBUTE = "data-spotify-furigana";
const STYLE_ID = "spotify-furigana-styles";
const READY_INTERVAL_MS = 100;
const ONLINE_REQUEST_TIMEOUT_MS = 10_000;
const FLOATING_LYRICS_SYNC_INTERVAL_MS = 125;
const FLOATING_LYRICS_LOOKAHEAD_MS = 300;

interface DesktopLyricSegmentCacheEntry {
  promise: Promise<DesktopLyricSegment[]>;
  resolved?: DesktopLyricSegment[];
}

declare const __SPOTIFY_FURIGANA_VERSION__: string;

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    [data-spotify-furigana="ready"] ruby.spotify-furigana__ruby {
      ruby-align: center;
      ruby-position: over;
    }

    [data-spotify-furigana="ready"] ruby.spotify-furigana__ruby rt {
      color: inherit;
      font-size: var(--spotify-furigana-size, 0.46em);
      font-weight: 500;
      line-height: 1;
      opacity: var(--spotify-furigana-opacity, 0.82);
      position: relative;
      top: calc(-1 * var(--spotify-furigana-gap, 0px));
      user-select: none;
    }

    [data-spotify-furigana="ready"] ruby.spotify-furigana__ruby rp {
      display: none;
    }
  `;
  document.head.appendChild(style);
}

function applyAppearance(settings: FuriganaSettings): void {
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty("--spotify-furigana-size", `${settings.size}em`);
  rootStyle.setProperty(
    "--spotify-furigana-opacity",
    String(settings.opacity),
  );
  rootStyle.setProperty("--spotify-furigana-gap", `${settings.gap}px`);
}

function isSpicetifyReady(): boolean {
  return (
    typeof Spicetify !== "undefined" &&
    Boolean(Spicetify.Player) &&
    Boolean(Spicetify.Platform) &&
    Boolean(Spicetify.LocalStorage) &&
    Boolean(Spicetify.CosmosAsync) &&
    Boolean(Spicetify.Playbar?.Button) &&
    typeof Spicetify.showNotification === "function"
  );
}

async function waitForSpicetify(): Promise<void> {
  while (!isSpicetifyReady()) {
    await new Promise((resolve) => window.setTimeout(resolve, READY_INTERVAL_MS));
  }
}

function getCurrentTrackMetadata(): OnlineTrackMetadata | null {
  const item = Spicetify.Player.data?.item;
  const metadata = item?.metadata ?? {};
  const uri = item?.uri;
  const title = item?.name ?? metadata.title;
  const artist =
    metadata.artist_name ?? metadata.artist ?? metadata.artist_names;
  const album = metadata.album_title ?? metadata.album_name ?? "";

  if (
    typeof uri !== "string" ||
    !uri.startsWith("spotify:track:") ||
    typeof title !== "string" ||
    !title.trim() ||
    typeof artist !== "string" ||
    !artist.trim()
  ) {
    return null;
  }

  return {
    uri,
    title: title.trim(),
    artist: artist.trim(),
    album: typeof album === "string" ? album.trim() : "",
  };
}

async function requestOnlineJson(
  url: string,
  headers?: Record<string, string>,
): Promise<unknown> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(
      () => reject(new Error("Online reading request timed out.")),
      ONLINE_REQUEST_TIMEOUT_MS,
    );
  });

  try {
    return await Promise.race([
      Spicetify.CosmosAsync.get(url, null, headers),
      timeout,
    ]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
}

async function main(): Promise<void> {
  await waitForSpicetify();
  injectStyles();

  const dictionaryPath = getDictionaryPath();
  const originalNodes = new WeakMap<HTMLElement, Node[]>();
  const sourceText = new WeakMap<HTMLElement, string>();
  const lineGeneration = new WeakMap<HTMLElement, number>();

  let settings = getFuriganaSettings();
  let uiLanguage: UiLanguage = getRuntimeUiLanguage(Spicetify.LocalStorage);
  let enabled = settings.enabled;
  let generationCounter = 0;
  let engineUnavailable = false;
  let scanTimer: number | undefined;
  let reportedEngineError = false;
  let activeOnlineTrackUri: string | undefined;
  let onlineReadings: OnlineReadingIndex | undefined;
  let onlineLoadGeneration = 0;
  let onlineStatus: OnlineReadingStatus = {
    state: "idle",
    code: "online-disabled",
    message: "",
  };
  let diagnosticsTimer: number | undefined;
  let lastDiagnosticsSignature = "";
  const desktopOverlaySupported = /^win/iu.test(navigator.platform);
  let lastFloatingLyricsSignature = "";
  let lastDesktopOverlayStateSignature = "";
  let lastDesktopOverlayState: DesktopOverlayState | undefined;
  let lastDesktopOverlaySentAt = 0;
  const desktopLyricSegmentCache = new Map<
    string,
    DesktopLyricSegmentCacheEntry
  >();
  let floatingLyricsRenderGeneration = 0;
  let floatingLyricsLoadGeneration = 0;
  let floatingLyricsTrackUri: string | undefined;
  let floatingTimedLyrics: TimedLyricLine[] = [];
  let floatingLyricsTimer: number | undefined;

  function t(
    key: RuntimeMessageKey,
    values?: Record<string, string | number>,
  ): string {
    return translateRuntimeMessage(uiLanguage, key, values);
  }

  function getReadingSourceLabel(): string {
    if (onlineStatus.code === "loading") {
      return t("sourceLoading");
    }
    if (onlineStatus.code === "matched" || onlineStatus.code === "cache-ready") {
      return t("sourceAccurate", { count: onlineStatus.count ?? 0 });
    }
    if (onlineStatus.code === "unavailable") {
      return t("sourceFallback");
    }
    return t("sourceLocal");
  }

  function getPlaybarLabel(): string {
    const action = enabled ? t("disableFurigana") : t("enableFurigana");
    return enabled ? `${action} · ${getReadingSourceLabel()}` : action;
  }

  const playbarButton = new Spicetify.Playbar.Button(
    getPlaybarLabel(),
    PLAYBAR_FU_ICON,
    () => applySettings({ ...settings, enabled: !enabled }, true, true),
    false,
    enabled,
  );

  function createDiagnosticsInput(): RuntimeDiagnosticsInput {
    return {
      appVersion: __SPOTIFY_FURIGANA_VERSION__,
      spicetifyVersion: Spicetify.Config?.version ?? "unknown",
      platform: navigator.platform || "unknown",
      uiLanguage,
      enabled,
      readingMode: settings.readingMode,
      onlineReadings: settings.onlineReadings,
      floatingLyrics: settings.floatingLyrics,
      floatingCurrentSize: settings.floatingCurrentSize,
      floatingNextSize: settings.floatingNextSize,
      onlineStatus: {
        state: onlineStatus.state,
        code: onlineStatus.code,
        count: onlineStatus.count,
      },
      trackAvailable: Boolean(getCurrentTrackMetadata()),
      selectorCounts: LYRIC_SELECTORS.map((selector) => ({
        selector,
        count: document.querySelectorAll(selector).length,
      })),
      annotatedLines: document.querySelectorAll(
        `[${STATE_ATTRIBUTE}="ready"]`,
      ).length,
      pendingLines: document.querySelectorAll(
        `[${STATE_ATTRIBUTE}="pending"]`,
      ).length,
      engineState: engineUnavailable ? "error" : "ready",
    };
  }

  function publishRuntimeDiagnostics(): void {
    diagnosticsTimer = undefined;
    const input = createDiagnosticsInput();
    const signature = JSON.stringify(input);
    if (signature === lastDiagnosticsSignature) {
      return;
    }
    lastDiagnosticsSignature = signature;
    const diagnostics = createRuntimeDiagnostics(input);
    Spicetify.LocalStorage.set(
      RUNTIME_DIAGNOSTICS_KEY,
      JSON.stringify(diagnostics),
    );
    window.dispatchEvent(
      new CustomEvent(RUNTIME_DIAGNOSTICS_EVENT, { detail: diagnostics }),
    );
  }

  function scheduleRuntimeDiagnostics(): void {
    if (diagnosticsTimer === undefined) {
      diagnosticsTimer = window.setTimeout(publishRuntimeDiagnostics, 0);
    }
  }

  function publishOnlineStatus(status: OnlineReadingStatus): void {
    onlineStatus = status;
    Spicetify.LocalStorage.set(ONLINE_STATUS_KEY, JSON.stringify(status));
    window.dispatchEvent(
      new CustomEvent(ONLINE_STATUS_EVENT, { detail: status }),
    );
    playbarButton.label = getPlaybarLabel();
    scheduleRuntimeDiagnostics();
  }

  function forgetLine(line: HTMLElement): void {
    line.removeAttribute(STATE_ATTRIBUTE);
    originalNodes.delete(line);
    sourceText.delete(line);
    lineGeneration.delete(line);
  }

  function publishDesktopOverlay(
    segments: readonly DesktopLyricSegment[] = [],
    nextSegments: readonly DesktopLyricSegment[] = [],
  ): void {
    const state = createDesktopOverlayState(
      segments.length > 0,
      segments,
      nextSegments,
      settings.floatingCurrentSize,
      settings.floatingNextSize,
    );
    const signature = JSON.stringify(state);
    const now = Date.now();
    if (
      signature === lastDesktopOverlayStateSignature &&
      now - lastDesktopOverlaySentAt < 5_000
    ) {
      return;
    }
    lastDesktopOverlayStateSignature = signature;
    lastDesktopOverlayState = state;
    lastDesktopOverlaySentAt = now;
    sendDesktopOverlayState(state);
  }

  function retryDesktopOverlayState(): void {
    if (
      lastDesktopOverlayState &&
      Date.now() - lastDesktopOverlaySentAt >= 5_000
    ) {
      lastDesktopOverlaySentAt = Date.now();
      sendDesktopOverlayState(lastDesktopOverlayState);
    }
  }

  function hideDesktopOverlay(): void {
    floatingLyricsRenderGeneration += 1;
    lastFloatingLyricsSignature = "";
    publishDesktopOverlay();
  }

  function getDesktopLyricSegmentEntry(
    sourceValue: string,
  ): DesktopLyricSegmentCacheEntry {
    const source = normalizeLyricText(sourceValue);
    const sungRomanization =
      activeOnlineTrackUri === Spicetify.Player.data?.item?.uri
        ? findOnlineRomanization(onlineReadings, source)
        : undefined;
    const cacheKey = `${settings.readingMode}:${sungRomanization ?? ""}:${source}`;
    const cached = desktopLyricSegmentCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const entry: DesktopLyricSegmentCacheEntry = {
      promise: Promise.resolve([]),
    };
    entry.promise = (async (): Promise<DesktopLyricSegment[]> => {
      if (!source) {
        return [];
      }
      if (!shouldAnnotateLyric(source)) {
        return [{ text: source }];
      }
      try {
        const converted = await convertToFurigana(
          source,
          dictionaryPath,
          settings.readingMode,
          sungRomanization,
        );
        const fragment = createSafeFuriganaFragment(converted, document);
        return extractDesktopLyricSegments(fragment);
      } catch (error: unknown) {
        console.warn(
          "[Furigana for Spotify] Desktop lyric conversion failed.",
          error,
        );
        return [{ text: source }];
      }
    })().then((segments) => {
      entry.resolved = segments;
      return segments;
    });
    desktopLyricSegmentCache.set(cacheKey, entry);
    if (desktopLyricSegmentCache.size > 24) {
      const oldestKey = desktopLyricSegmentCache.keys().next().value;
      if (typeof oldestKey === "string") {
        desktopLyricSegmentCache.delete(oldestKey);
      }
    }
    return entry;
  }

  function canPublishDesktopLyrics(generation: number): boolean {
    return (
      generation === floatingLyricsRenderGeneration &&
      enabled &&
      settings.floatingLyrics &&
      desktopOverlaySupported
    );
  }

  async function renderDesktopLyricPair(
    currentSourceValue: string,
    nextSourceValue = "",
    currentSegments?: readonly DesktopLyricSegment[],
    signaturePrefix = "timed",
  ): Promise<void> {
    const currentSource = normalizeLyricText(currentSourceValue);
    const nextSource = normalizeLyricText(nextSourceValue);
    const currentSungRomanization = findOnlineRomanization(
      onlineReadings,
      currentSource,
    );
    const nextSungRomanization = findOnlineRomanization(
      onlineReadings,
      nextSource,
    );
    const signature = `${signaturePrefix}:${settings.readingMode}:${currentSungRomanization ?? ""}:${nextSungRomanization ?? ""}:${currentSource}:${nextSource}`;
    if (signature === lastFloatingLyricsSignature) {
      return;
    }

    const generation = ++floatingLyricsRenderGeneration;
    lastFloatingLyricsSignature = signature;
    if (!currentSource) {
      publishDesktopOverlay();
      return;
    }

    // Start the preview conversion immediately, but never make the current lyric
    // wait for it. This matters most while the local dictionary is warming up.
    const nextEntry = getDesktopLyricSegmentEntry(nextSource);
    await publishDesktopLyricPairProgressively(
      currentSegments
        ? Promise.resolve([...currentSegments])
        : getDesktopLyricSegmentEntry(currentSource).promise,
      nextEntry.promise,
      nextEntry.resolved,
      () => canPublishDesktopLyrics(generation),
      publishDesktopOverlay,
    );
  }

  function updateFloatingLyrics(): void {
    if (!enabled || !settings.floatingLyrics || !desktopOverlaySupported) {
      hideDesktopOverlay();
      return;
    }
    retryDesktopOverlayState();

    const timedContext = findTimedLyricContext(
      floatingTimedLyrics,
      Spicetify.Player.getProgress(),
      FLOATING_LYRICS_LOOKAHEAD_MS,
    );
    const nextSource = timedContext?.next?.words ?? "";
    const currentLine = findCurrentLyricLine(document);
    const currentLineSource = currentLine
      ? currentLine.querySelector("ruby.spotify-furigana__ruby")
        ? getAnnotatedSource(currentLine)
        : normalizeLyricText(currentLine.textContent)
      : "";
    const timedCurrentSource = normalizeLyricText(
      timedContext?.current.words ?? "",
    );
    if (
      timedContext &&
      currentLine &&
      currentLineSource !== timedCurrentSource
    ) {
      void renderDesktopLyricPair(
        timedContext.current.words,
        timedContext.next?.words ?? "",
        undefined,
        "timed-lookahead",
      );
      return;
    }
    if (currentLine?.querySelector("ruby.spotify-furigana__ruby")) {
      void renderDesktopLyricPair(
        currentLineSource,
        nextSource,
        extractDesktopLyricSegments(currentLine),
        `dom:${currentLine.innerHTML}`,
      );
      return;
    }
    if (currentLine) {
      void renderDesktopLyricPair(
        currentLineSource,
        nextSource,
        undefined,
        "dom-text",
      );
      return;
    }

    if (!timedContext) {
      hideDesktopOverlay();
      return;
    }
    void renderDesktopLyricPair(
      timedContext.current.words,
      timedContext.next?.words ?? "",
    );
  }

  async function refreshFloatingTimedLyrics(): Promise<void> {
    const generation = ++floatingLyricsLoadGeneration;
    const trackUri = Spicetify.Player.data?.item?.uri;
    const url = typeof trackUri === "string" ? getSpotifyLyricsUrl(trackUri) : null;
    floatingLyricsTrackUri = typeof trackUri === "string" ? trackUri : undefined;
    floatingTimedLyrics = [];
    lastFloatingLyricsSignature = "";

    if (!enabled || !settings.floatingLyrics || !desktopOverlaySupported || !url) {
      updateFloatingLyrics();
      return;
    }

    try {
      const response = await requestOnlineJson(url);
      if (
        generation !== floatingLyricsLoadGeneration ||
        floatingLyricsTrackUri !== trackUri
      ) {
        return;
      }
      floatingTimedLyrics = parseSpotifyTimedLyrics(response);
    } catch (error: unknown) {
      if (generation !== floatingLyricsLoadGeneration) {
        return;
      }
      console.warn(
        "[Furigana for Spotify] Spotify timed lyrics were unavailable.",
        error,
      );
    }

    updateFloatingLyrics();
  }

  function syncFloatingLyricsTimer(): void {
    const shouldRun = enabled && settings.floatingLyrics && desktopOverlaySupported;
    if (shouldRun && floatingLyricsTimer === undefined) {
      floatingLyricsTimer = window.setInterval(
        updateFloatingLyrics,
        FLOATING_LYRICS_SYNC_INTERVAL_MS,
      );
    } else if (!shouldRun && floatingLyricsTimer !== undefined) {
      window.clearInterval(floatingLyricsTimer);
      floatingLyricsTimer = undefined;
    }

    if (shouldRun) {
      void refreshFloatingTimedLyrics();
    } else {
      floatingLyricsLoadGeneration += 1;
      floatingTimedLyrics = [];
      floatingLyricsTrackUri = undefined;
      hideDesktopOverlay();
    }
  }

  function hideFloatingLyricsUntilAvailable(): void {
    hideDesktopOverlay();
  }

  function restoreLine(line: HTMLElement): void {
    const originals = originalNodes.get(line);
    if (originals) {
      line.replaceChildren(...originals);
    } else {
      const source = sourceText.get(line);
      if (source !== undefined) {
        line.textContent = source;
      }
    }

    forgetLine(line);
  }

  function restoreAll(): void {
    document
      .querySelectorAll<HTMLElement>(`[${STATE_ATTRIBUTE}]`)
      .forEach(restoreLine);
  }

  async function refreshOnlineReadings(): Promise<void> {
    const generation = ++onlineLoadGeneration;
    const track = getCurrentTrackMetadata();
    activeOnlineTrackUri = track?.uri;
    onlineReadings = undefined;

    if (!settings.onlineReadings) {
      publishOnlineStatus({
        state: "idle",
        code: "online-disabled",
        message: t("onlineDisabled"),
      });
      return;
    }

    if (!track) {
      publishOnlineStatus({
        state: "fallback",
        code: "no-track",
        message: t("noTrackFallback"),
      });
      return;
    }

    const cached = getCachedOnlineReading(Spicetify.LocalStorage, track.uri);
    if (cached.found) {
      onlineReadings = cached.result?.readings;
      publishOnlineStatus(
        cached.result
          ? {
              state: "ready",
              code: "cache-ready",
              count: Object.keys(cached.result.readings).length,
              message: t("cachedReady"),
            }
          : {
              state: "fallback",
              code: "not-found",
              message: t("notFoundFallback"),
            },
      );
      restoreAll();
      scheduleScan();
      return;
    }

    publishOnlineStatus({
      state: "loading",
      code: "loading",
      message: t("loading"),
    });

    try {
      const result = await fetchOnlineReadingResult(track, requestOnlineJson);
      if (
        generation !== onlineLoadGeneration ||
        activeOnlineTrackUri !== track.uri
      ) {
        return;
      }

      setCachedOnlineReading(Spicetify.LocalStorage, track.uri, result);
      onlineReadings = result?.readings;
      publishOnlineStatus(
        result
          ? {
              state: "ready",
              code: "matched",
              count: Object.keys(result.readings).length,
              message: t("matched", {
                count: Object.keys(result.readings).length,
              }),
            }
          : {
              state: "fallback",
              code: "not-found",
              message: t("notFoundFallback"),
            },
      );
    } catch (error: unknown) {
      if (generation !== onlineLoadGeneration) {
        return;
      }
      console.warn(
        "[Furigana for Spotify] Online readings were unavailable.",
        error,
      );
      publishOnlineStatus({
        state: "error",
        code: "unavailable",
        message: t("unavailableFallback"),
      });
    }

    restoreAll();
    scheduleScan();
  }

  function getAnnotatedSource(line: HTMLElement): string {
    const copy = line.cloneNode(true) as HTMLElement;
    copy.querySelectorAll("rt, rp").forEach((annotation) => annotation.remove());
    return normalizeLyricText(copy.textContent);
  }

  async function annotateLine(line: HTMLElement): Promise<void> {
    const state = line.getAttribute(STATE_ATTRIBUTE);
    if (state === "pending") {
      return;
    }

    if (state === "ready") {
      const previousSource = sourceText.get(line);
      if (
        previousSource !== undefined &&
        line.querySelector("ruby.spotify-furigana__ruby") &&
        getAnnotatedSource(line) === previousSource
      ) {
        return;
      }

      forgetLine(line);
    }

    const source = normalizeLyricText(line.textContent);
    if (!shouldAnnotateLyric(source)) {
      return;
    }

    const sungRomanization =
      activeOnlineTrackUri === getCurrentTrackMetadata()?.uri
        ? findOnlineRomanization(onlineReadings, source)
        : undefined;
    if (engineUnavailable && !sungRomanization) {
      return;
    }

    originalNodes.set(line, Array.from(line.childNodes));
    sourceText.set(line, source);
    const generation = ++generationCounter;
    lineGeneration.set(line, generation);
    line.setAttribute(STATE_ATTRIBUTE, "pending");

    try {
      const converted = await convertToFurigana(
        source,
        dictionaryPath,
        settings.readingMode,
        sungRomanization,
      );

      if (lineGeneration.get(line) !== generation) {
        return;
      }

      const currentText = normalizeLyricText(line.textContent);

      if (!line.isConnected || currentText !== source) {
        forgetLine(line);
        if (line.isConnected) {
          scheduleScan();
        }
        return;
      }

      if (!enabled || line.getAttribute(STATE_ATTRIBUTE) !== "pending") {
        if (line.isConnected && line.hasAttribute(STATE_ATTRIBUTE)) {
          restoreLine(line);
        }
        return;
      }

      line.replaceChildren(
        createSafeFuriganaFragment(converted, line.ownerDocument),
      );
      line.setAttribute(STATE_ATTRIBUTE, "ready");
    } catch (error: unknown) {
      if (lineGeneration.get(line) !== generation) {
        return;
      }

      engineUnavailable = true;
      restoreLine(line);
      if (!reportedEngineError) {
        reportedEngineError = true;
        console.warn("[Furigana for Spotify] Reading engine failed to load.", error);
        Spicetify.showNotification(t("dictionaryFailed"), true);
      }
    }
  }

  function scan(): void {
    scanTimer = undefined;
    updateFloatingLyrics();
    if (!enabled || (engineUnavailable && !onlineReadings)) {
      return;
    }

    document
      .querySelectorAll<HTMLElement>(LYRIC_SELECTOR)
      .forEach((line) => void annotateLine(line));
    scheduleRuntimeDiagnostics();
  }

  function scheduleScan(): void {
    if (scanTimer === undefined) {
      scanTimer = window.setTimeout(scan, 0);
    }
  }

  function applySettings(
    nextSettings: FuriganaSettings,
    announce = false,
    broadcast = false,
  ): void {
    const enabledChanged = nextSettings.enabled !== enabled;
    const readingModeChanged = nextSettings.readingMode !== settings.readingMode;
    const appearanceChanged =
      nextSettings.size !== settings.size ||
      nextSettings.opacity !== settings.opacity ||
      nextSettings.gap !== settings.gap;
    const onlineReadingsChanged =
      nextSettings.onlineReadings !== settings.onlineReadings;
    const floatingLyricsChanged =
      nextSettings.floatingLyrics !== settings.floatingLyrics;
    const floatingTypographyChanged =
      nextSettings.floatingCurrentSize !== settings.floatingCurrentSize ||
      nextSettings.floatingNextSize !== settings.floatingNextSize;

    if (
      !enabledChanged &&
      !readingModeChanged &&
      !appearanceChanged &&
      !onlineReadingsChanged &&
      !floatingLyricsChanged &&
      !floatingTypographyChanged
    ) {
      return;
    }

    settings = nextSettings;
    enabled = settings.enabled;
    setFuriganaSettings(settings);
    applyAppearance(settings);
    playbarButton.active = enabled;
    playbarButton.label = getPlaybarLabel();

    if (readingModeChanged || onlineReadingsChanged) {
      restoreAll();
      lastFloatingLyricsSignature = "";
    }
    if (floatingTypographyChanged) {
      lastFloatingLyricsSignature = "";
    }

    if (enabled && (enabledChanged || readingModeChanged)) {
      engineUnavailable = false;
      scheduleScan();
    } else if (!enabled && enabledChanged) {
      restoreAll();
    }

    if (onlineReadingsChanged) {
      if (enabled) {
        scheduleScan();
      }
      void refreshOnlineReadings();
    }

    if (floatingLyricsChanged || enabledChanged) {
      syncFloatingLyricsTimer();
    } else if (
      readingModeChanged ||
      onlineReadingsChanged ||
      floatingTypographyChanged
    ) {
      updateFloatingLyrics();
    }

    if (announce) {
      Spicetify.showNotification(
        enabled ? t("enabledNotice") : t("disabledNotice"),
      );
    }

    if (broadcast) {
      window.dispatchEvent(
        new CustomEvent(SETTING_CHANGE_EVENT, {
          detail: { enabled, settings },
        }),
      );
    }
    scheduleRuntimeDiagnostics();
  }

  window.addEventListener(SETTING_CHANGE_EVENT, (event) => {
    const detail = (event as CustomEvent<{ settings?: unknown }>).detail;
    if (detail?.settings !== settings) {
      applySettings(getFuriganaSettings());
    }
  });

  window.addEventListener(UI_LANGUAGE_CHANGE_EVENT, () => {
    uiLanguage = getRuntimeUiLanguage(Spicetify.LocalStorage);
    playbarButton.label = getPlaybarLabel();
    scheduleRuntimeDiagnostics();
  });

  window.addEventListener(ONLINE_CACHE_CLEAR_EVENT, () => {
    onlineLoadGeneration += 1;
    clearOnlineReadingCache(Spicetify.LocalStorage);
    onlineReadings = undefined;
    restoreAll();
    if (settings.onlineReadings) {
      void refreshOnlineReadings();
    } else {
      publishOnlineStatus({
        state: "idle",
        code: "cache-cleared",
        message: t("cacheCleared"),
      });
    }
    if (enabled && !settings.onlineReadings) {
      scheduleScan();
    }
  });

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "aria-current", "data-active"],
    childList: true,
    characterData: true,
    subtree: true,
  });

  applyAppearance(settings);
  syncFloatingLyricsTimer();
  Spicetify.Player.addEventListener("songchange", () => {
    restoreAll();
    hideFloatingLyricsUntilAvailable();
    void refreshOnlineReadings();
    void refreshFloatingTimedLyrics();
  });
  void refreshOnlineReadings();
  scheduleScan();
  scheduleRuntimeDiagnostics();
}

void main();
