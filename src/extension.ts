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

const STATE_ATTRIBUTE = "data-spotify-furigana";
const STYLE_ID = "spotify-furigana-styles";
const READY_INTERVAL_MS = 100;
const ONLINE_REQUEST_TIMEOUT_MS = 10_000;

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

    if (
      !enabledChanged &&
      !readingModeChanged &&
      !appearanceChanged &&
      !onlineReadingsChanged
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
    childList: true,
    characterData: true,
    subtree: true,
  });

  applyAppearance(settings);
  Spicetify.Player.addEventListener("songchange", () => {
    restoreAll();
    void refreshOnlineReadings();
  });
  void refreshOnlineReadings();
  scheduleScan();
  scheduleRuntimeDiagnostics();
}

void main();
