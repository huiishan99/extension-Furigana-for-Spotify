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
  clampFloatingLyricPosition,
  findTimedLyricLine,
  findCurrentLyricLine,
  FLOATING_LYRICS_ID,
  FLOATING_LYRICS_POSITION_KEY,
  getSpotifyLyricsUrl,
  parseFloatingLyricPosition,
  parseSpotifyTimedLyrics,
  type TimedLyricLine,
} from "./floating-lyrics";

const STATE_ATTRIBUTE = "data-spotify-furigana";
const STYLE_ID = "spotify-furigana-styles";
const READY_INTERVAL_MS = 100;
const ONLINE_REQUEST_TIMEOUT_MS = 10_000;
const FLOATING_LYRICS_SYNC_INTERVAL_MS = 250;

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

    #${FLOATING_LYRICS_ID} {
      position: fixed;
      z-index: 2147483000;
      left: 50%;
      bottom: 108px;
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr) 28px;
      align-items: center;
      width: min(680px, calc(100vw - 48px));
      min-height: 70px;
      padding: 14px 14px 12px;
      border: 1px solid color-mix(in srgb, var(--spice-button, #1ed760) 58%, transparent);
      border-radius: 18px;
      color: var(--spice-text, #fff);
      background: color-mix(in srgb, var(--spice-main, #121212) 88%, transparent);
      box-shadow: 0 16px 44px rgba(0, 0, 0, 0.42);
      backdrop-filter: blur(18px) saturate(1.18);
      transform: translateX(-50%);
      cursor: grab;
      user-select: none;
      touch-action: none;
    }

    #${FLOATING_LYRICS_ID}[hidden] {
      display: none;
    }

    #${FLOATING_LYRICS_ID}.is-dragging {
      cursor: grabbing;
    }

    #${FLOATING_LYRICS_ID} .spotify-furigana-floating__badge {
      display: grid;
      place-items: center;
      width: 27px;
      height: 27px;
      border-radius: 9px;
      color: #06120d;
      background: var(--spice-button, #1ed760);
      font-size: 16px;
      font-weight: 850;
    }

    #${FLOATING_LYRICS_ID} .spotify-furigana-floating__line {
      min-width: 0;
      padding: 8px 10px 2px;
      overflow: hidden;
      font-size: clamp(20px, 2.2vw, 30px);
      font-weight: 750;
      line-height: 1.45;
      text-align: center;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    #${FLOATING_LYRICS_ID} ruby.spotify-furigana__ruby {
      ruby-align: center;
      ruby-position: over;
    }

    #${FLOATING_LYRICS_ID} .spotify-furigana-floating__line rt {
      color: color-mix(in srgb, currentColor 78%, var(--spice-button, #1ed760));
      font-size: 0.48em;
      font-weight: 600;
      line-height: 1;
      opacity: var(--spotify-furigana-opacity, 0.82);
      position: relative;
      top: calc(-1 * var(--spotify-furigana-gap, 0px));
    }

    #${FLOATING_LYRICS_ID} .spotify-furigana-floating__line rp {
      display: none;
    }

    #${FLOATING_LYRICS_ID} .spotify-furigana-floating__close {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      color: var(--spice-subtext, #b3b3b3);
      background: transparent;
      font: inherit;
      font-size: 20px;
      cursor: pointer;
    }

    #${FLOATING_LYRICS_ID} .spotify-furigana-floating__close:hover {
      color: var(--spice-text, #fff);
      background: color-mix(in srgb, var(--spice-text, #fff) 12%, transparent);
    }

    @media (max-width: 720px) {
      #${FLOATING_LYRICS_ID} {
        bottom: 96px;
        width: calc(100vw - 24px);
      }
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
  let floatingLyricsRoot: HTMLElement | undefined;
  let floatingLyricsContent: HTMLElement | undefined;
  let lastFloatingLyricsSignature = "";
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

  function removeFloatingLyrics(): void {
    floatingLyricsRenderGeneration += 1;
    floatingLyricsRoot?.remove();
    floatingLyricsRoot = undefined;
    floatingLyricsContent = undefined;
    lastFloatingLyricsSignature = "";
  }

  function setFloatingLyricsPosition(
    root: HTMLElement,
    position: { left: number; top: number },
  ): void {
    root.style.left = `${position.left}px`;
    root.style.top = `${position.top}px`;
    root.style.right = "auto";
    root.style.bottom = "auto";
    root.style.transform = "none";
  }

  function constrainFloatingLyrics(root: HTMLElement): {
    left: number;
    top: number;
  } {
    const rect = root.getBoundingClientRect();
    return clampFloatingLyricPosition(
      { left: rect.left, top: rect.top },
      { width: window.innerWidth, height: window.innerHeight },
      { width: rect.width, height: rect.height },
    );
  }

  function beginFloatingLyricsDrag(
    event: PointerEvent,
    root: HTMLElement,
  ): void {
    if (
      event.button !== 0 ||
      (event.target instanceof Element && event.target.closest("button"))
    ) {
      return;
    }

    const rect = root.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    root.classList.add("is-dragging");
    setFloatingLyricsPosition(root, { left: rect.left, top: rect.top });

    const move = (moveEvent: PointerEvent): void => {
      const position = clampFloatingLyricPosition(
        {
          left: moveEvent.clientX - offsetX,
          top: moveEvent.clientY - offsetY,
        },
        { width: window.innerWidth, height: window.innerHeight },
        { width: root.offsetWidth, height: root.offsetHeight },
      );
      setFloatingLyricsPosition(root, position);
    };

    const stop = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      root.classList.remove("is-dragging");
      Spicetify.LocalStorage.set(
        FLOATING_LYRICS_POSITION_KEY,
        JSON.stringify(constrainFloatingLyrics(root)),
      );
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
    event.preventDefault();
  }

  function ensureFloatingLyrics(): HTMLElement | null {
    if (!document.body) {
      return null;
    }

    if (floatingLyricsRoot?.isConnected && floatingLyricsContent) {
      const close = floatingLyricsRoot.querySelector<HTMLElement>(
        ".spotify-furigana-floating__close",
      );
      floatingLyricsRoot.title = t("moveFloatingLyrics");
      close?.setAttribute("aria-label", t("hideFloatingLyrics"));
      return floatingLyricsRoot;
    }

    const root = document.createElement("aside");
    root.id = FLOATING_LYRICS_ID;
    root.hidden = true;
    root.title = t("moveFloatingLyrics");
    root.setAttribute("data-spotify-furigana-floating", "ready");
    root.setAttribute("aria-live", "polite");
    root.setAttribute("aria-atomic", "true");

    const badge = document.createElement("span");
    badge.className = "spotify-furigana-floating__badge";
    badge.textContent = "ふ";
    badge.setAttribute("aria-hidden", "true");

    const content = document.createElement("div");
    content.className = "spotify-furigana-floating__line";
    content.dir = "auto";

    const close = document.createElement("button");
    close.className = "spotify-furigana-floating__close";
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", t("hideFloatingLyrics"));
    close.addEventListener("click", () => {
      applySettings({ ...settings, floatingLyrics: false }, false, true);
    });

    root.append(badge, content, close);
    root.addEventListener("pointerdown", (event) =>
      beginFloatingLyricsDrag(event, root),
    );
    document.body.appendChild(root);

    const savedPosition = parseFloatingLyricPosition(
      Spicetify.LocalStorage.get(FLOATING_LYRICS_POSITION_KEY),
    );
    if (savedPosition) {
      setFloatingLyricsPosition(root, savedPosition);
    }

    floatingLyricsRoot = root;
    floatingLyricsContent = content;
    lastFloatingLyricsSignature = "";
    return root;
  }

  async function renderTimedFloatingLyrics(
    sourceValue: string,
    root: HTMLElement,
  ): Promise<void> {
    if (!floatingLyricsContent) {
      return;
    }

    const source = normalizeLyricText(sourceValue);
    const sungRomanization =
      activeOnlineTrackUri === Spicetify.Player.data?.item?.uri
        ? findOnlineRomanization(onlineReadings, source)
        : undefined;
    const signature = `timed:${settings.readingMode}:${sungRomanization ?? ""}:${source}`;
    if (signature === lastFloatingLyricsSignature) {
      root.hidden = false;
      return;
    }

    const generation = ++floatingLyricsRenderGeneration;
    lastFloatingLyricsSignature = signature;
    floatingLyricsContent.textContent = source;
    root.hidden = false;

    if (!shouldAnnotateLyric(source)) {
      return;
    }

    try {
      const converted = await convertToFurigana(
        source,
        dictionaryPath,
        settings.readingMode,
        sungRomanization,
      );
      if (
        generation !== floatingLyricsRenderGeneration ||
        !enabled ||
        !settings.floatingLyrics ||
        !floatingLyricsContent?.isConnected
      ) {
        return;
      }
      floatingLyricsContent.replaceChildren(
        createSafeFuriganaFragment(converted, document),
      );
    } catch (error: unknown) {
      console.warn(
        "[Furigana for Spotify] Floating lyric conversion failed.",
        error,
      );
    }
  }

  function updateFloatingLyrics(): void {
    if (!enabled || !settings.floatingLyrics) {
      removeFloatingLyrics();
      return;
    }

    const root = ensureFloatingLyrics();
    if (!root || !floatingLyricsContent) {
      return;
    }

    const currentLine = findCurrentLyricLine(document);
    if (currentLine) {
      const signature = `dom:${currentLine.innerHTML}`;
      if (signature !== lastFloatingLyricsSignature) {
        floatingLyricsRenderGeneration += 1;
        floatingLyricsContent.replaceChildren(
          ...Array.from(currentLine.childNodes, (node) => node.cloneNode(true)),
        );
        lastFloatingLyricsSignature = signature;
      }

      root.hidden = false;
    } else {
      const currentTimedLine = findTimedLyricLine(
        floatingTimedLyrics,
        Spicetify.Player.getProgress(),
      );
      if (!currentTimedLine) {
        root.hidden = true;
        lastFloatingLyricsSignature = "";
        return;
      }
      void renderTimedFloatingLyrics(currentTimedLine.words, root);
    }

    const savedPosition = parseFloatingLyricPosition(
      Spicetify.LocalStorage.get(FLOATING_LYRICS_POSITION_KEY),
    );
    if (savedPosition) {
      setFloatingLyricsPosition(root, constrainFloatingLyrics(root));
    }
  }

  async function refreshFloatingTimedLyrics(): Promise<void> {
    const generation = ++floatingLyricsLoadGeneration;
    const trackUri = Spicetify.Player.data?.item?.uri;
    const url = typeof trackUri === "string" ? getSpotifyLyricsUrl(trackUri) : null;
    floatingLyricsTrackUri = typeof trackUri === "string" ? trackUri : undefined;
    floatingTimedLyrics = [];
    lastFloatingLyricsSignature = "";

    if (!enabled || !settings.floatingLyrics || !url) {
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
    const shouldRun = enabled && settings.floatingLyrics;
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
      removeFloatingLyrics();
    }
  }

  function hideFloatingLyricsUntilAvailable(): void {
    if (floatingLyricsRoot) {
      floatingLyricsRoot.hidden = true;
    }
    lastFloatingLyricsSignature = "";
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

    if (
      !enabledChanged &&
      !readingModeChanged &&
      !appearanceChanged &&
      !onlineReadingsChanged &&
      !floatingLyricsChanged
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
    } else if (readingModeChanged || onlineReadingsChanged) {
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
    if (floatingLyricsRoot?.isConnected) {
      floatingLyricsRoot.title = t("moveFloatingLyrics");
      floatingLyricsRoot
        .querySelector(".spotify-furigana-floating__close")
        ?.setAttribute("aria-label", t("hideFloatingLyrics"));
    }
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
