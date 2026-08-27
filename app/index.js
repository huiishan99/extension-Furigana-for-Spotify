const react = Spicetify.React;
const settingEvent = "spotify-furigana:setting-change";
const desktopOverlaySupported = /^win/iu.test(navigator.platform ?? "");

const settingKeys = {
  enabled: "spotify-furigana:enabled",
  readingMode: "spotify-furigana:reading-mode",
  size: "spotify-furigana:size",
  opacity: "spotify-furigana:opacity",
  gap: "spotify-furigana:gap",
  onlineReadings: "spotify-furigana:online-readings-enabled",
  floatingLyrics: "spotify-furigana:floating-lyrics-enabled",
  floatingCurrentSize: "spotify-furigana:floating-current-size",
  floatingNextSize: "spotify-furigana:floating-next-size",
};
const onlineStatusKey = "spotify-furigana:online-status";
const onlineStatusEvent = "spotify-furigana:online-status-change";
const onlineCacheClearEvent = "spotify-furigana:online-cache-clear";
const runtimeDiagnosticsKey = "spotify-furigana:runtime-diagnostics-v1";
const runtimeDiagnosticsEvent =
  "spotify-furigana:runtime-diagnostics-change";
const uiLanguageKey = "spotify-furigana:ui-language";
const uiLanguageChangeEvent = "spotify-furigana:ui-language-change";
const uiLanguagePreferences = ["auto", "en", "zh-CN", "ja"];

const translations = {
  en: {
    eyebrow: "Japanese lyric companion",
    lead:
      "Show hiragana, katakana, or romaji above Japanese kanji lyrics in Spotify Desktop for Windows and macOS. Local analysis is the default, with optional synchronized pronunciation matching.",
    interfaceLanguage: "Interface language",
    interfaceLanguageDescription:
      "Follow Spotify automatically or choose a language for this app.",
    automatic: "Auto",
    english: "English",
    chinese: "简体中文",
    japanese: "日本語",
    annotationTitle: "Lyric furigana",
    currentlyOn: "Currently on",
    currentlyOff: "Currently off",
    turnOff: "Turn off",
    turnOn: "Turn on",
    floatingTitle: "Floating current lyric",
    floatingDescription:
      "Show the current line and a smaller next-line preview in a transparent Windows overlay. The preview slides upward when the lyric changes.",
    floatingCurrentSize: "Current line size",
    floatingNextSize: "Next line size",
    windowsOnly: "Windows only",
    onlineTitle: "Accurate online readings (experimental)",
    onlineDescription:
      "Use synchronized romanization for special sung pronunciations, with automatic fallback to local readings.",
    privacy:
      "When enabled, the public track title and artist are sent to GD Studio. If scripts differ, the public artist name is sent to MusicBrainz for alias verification, then lyrics and romanization are requested from NetEase Cloud Music. “Synchronized” means timestamp pairing, not audio analysis; results are cached only on this device.",
    clearCache: "Clear cache",
    displayTitle: "Furigana display",
    displayDescription: "Changes are saved and applied immediately.",
    reset: "Reset",
    readingStyle: "Reading style",
    hiragana: "Hiragana",
    katakana: "Katakana",
    romaji: "Romaji",
    fontSize: "Size",
    opacity: "Opacity",
    verticalGap: "Vertical gap",
    runtimeReady: "Runtime ready · Spicetify {version}",
    runtimeMissing: "Runtime API incomplete; run spicetify apply again",
    diagnosticsTitle: "Troubleshooting diagnostics",
    diagnosticsDescription:
      "Copy a compact runtime report when opening an issue.",
    diagnosticsPrivacy:
      "The report contains versions, settings, reading status, and selector counts—never track titles, artists, lyrics, account data, or credentials.",
    diagnosticsSummary: "{annotated} annotated lines · {source}",
    diagnosticsWaiting: "Waiting for the lyric runtime",
    copyDiagnostics: "Copy diagnostics",
    diagnosticsCopied: "Diagnostics copied",
    diagnosticsCopyFailed: "Could not copy diagnostics",
    hint:
      "You can also use the ふ button in the player bar. Changing the reading style regenerates the current lyrics; the local dictionary may take a moment to load the first time.",
    statusOnlineDisabled: "Accurate online readings are off",
    statusNoTrack: "No Spotify track is available; using local readings",
    statusCacheReady: "Loaded synchronized readings from the local cache",
    statusNotFound:
      "No synchronized readings found for this track; using local readings",
    statusLoading: "Looking up synchronized readings…",
    statusMatched: "Matched {count} synchronized lyric lines",
    statusUnavailable:
      "Online readings are temporarily unavailable; using local readings",
    statusCacheCleared: "Online reading cache cleared",
    statusWaiting: "Waiting for the current track status",
  },
  "zh-CN": {
    eyebrow: "日本語歌词辅助",
    lead:
      "在 Windows 与 macOS Spotify 桌面端的日语歌词汉字上方显示平假名、片假名或罗马字。默认本地分析，也可主动开启同步读音匹配。",
    interfaceLanguage: "界面语言",
    interfaceLanguageDescription: "自动跟随 Spotify，或单独选择本应用的语言。",
    automatic: "自动",
    english: "English",
    chinese: "简体中文",
    japanese: "日本語",
    annotationTitle: "歌词注音",
    currentlyOn: "当前已开启",
    currentlyOff: "当前已关闭",
    turnOff: "关闭",
    turnOn: "开启",
    floatingTitle: "当前句悬浮显示",
    floatingDescription:
      "在透明、可拖动的 Windows 桌面悬浮窗中显示当前句与较小的下一句；换句时，下方预览会自然向上滑动。",
    floatingCurrentSize: "当前句字号",
    floatingNextSize: "下一句字号",
    windowsOnly: "仅支持 Windows",
    onlineTitle: "在线精准读音（实验性）",
    onlineDescription:
      "使用同步罗马音修正歌词中的特殊唱法；无结果时自动回退本地词典。",
    privacy:
      "开启后会向 GD Studio 发送公开的歌曲名和歌手；文字不同而无法匹配时，会向 MusicBrainz 查询公开歌手别名，再从网易云音乐读取歌词与罗马音。“同步”指时间戳配对，不会分析音频；结果仅缓存在本机。",
    clearCache: "清除缓存",
    displayTitle: "注音显示",
    displayDescription: "所有调整都会自动保存并实时应用。",
    reset: "恢复默认",
    readingStyle: "读音形式",
    hiragana: "平假名",
    katakana: "片假名",
    romaji: "罗马字",
    fontSize: "字号",
    opacity: "透明度",
    verticalGap: "上下间距",
    runtimeReady: "运行时正常 · Spicetify {version}",
    runtimeMissing: "运行时 API 不完整，请重新运行 spicetify apply",
    diagnosticsTitle: "故障诊断",
    diagnosticsDescription: "提交 Issue 时可复制一份精简的运行状态报告。",
    diagnosticsPrivacy:
      "报告只包含版本、设置、读音状态和选择器数量，不包含歌曲名、歌手、歌词、账号数据或凭据。",
    diagnosticsSummary: "已注音 {annotated} 行 · {source}",
    diagnosticsWaiting: "正在等待歌词运行时",
    copyDiagnostics: "复制诊断信息",
    diagnosticsCopied: "诊断信息已复制",
    diagnosticsCopyFailed: "无法复制诊断信息",
    hint:
      "也可以点击播放器底部的 ふ 按钮快速开关。切换读音形式时会重新生成当前歌词；本地词典首次加载可能需要片刻。",
    statusOnlineDisabled: "在线精准读音未开启",
    statusNoTrack: "当前没有可查询的 Spotify 曲目，使用本地词典",
    statusCacheReady: "已从本地缓存加载同步读音",
    statusNotFound: "当前歌曲暂无同步读音，使用本地词典",
    statusLoading: "正在查询当前歌曲的同步读音…",
    statusMatched: "已匹配 {count} 行同步读音",
    statusUnavailable: "在线读音暂时不可用，已自动使用本地词典",
    statusCacheCleared: "在线缓存已清除",
    statusWaiting: "等待当前歌曲状态",
  },
  ja: {
    eyebrow: "日本語歌詞サポート",
    lead:
      "WindowsとmacOSのSpotifyデスクトップ版で、日本語歌詞の漢字にひらがな、カタカナ、またはローマ字の読みを表示します。通常はローカル解析を使い、同期発音の照合も任意で有効にできます。",
    interfaceLanguage: "表示言語",
    interfaceLanguageDescription:
      "Spotifyに自動で合わせるか、このアプリの言語を選択します。",
    automatic: "自動",
    english: "English",
    chinese: "简体中文",
    japanese: "日本語",
    annotationTitle: "歌詞のふりがな",
    currentlyOn: "現在オン",
    currentlyOff: "現在オフ",
    turnOff: "オフにする",
    turnOn: "オンにする",
    floatingTitle: "現在の歌詞をフローティング表示",
    floatingDescription:
      "現在行と小さな次行プレビューを透明なWindowsオーバーレイに表示し、切り替え時は次行が自然に上へスライドします。",
    floatingCurrentSize: "現在行のサイズ",
    floatingNextSize: "次行のサイズ",
    windowsOnly: "Windowsのみ",
    onlineTitle: "オンライン高精度読み（実験的）",
    onlineDescription:
      "同期ローマ字で歌唱特有の読みを補正し、見つからない場合はローカル読みに戻します。",
    privacy:
      "有効にすると、公開曲名とアーティスト名をGD Studioへ送信します。表記体系の違いで一致しない場合は、公開アーティスト名をMusicBrainzで別名確認し、その後NetEase Cloud Musicから歌詞とローマ字を取得します。「同期」はタイムスタンプの対応を意味し、音声解析は行いません。結果はこの端末だけに保存されます。",
    clearCache: "キャッシュを消去",
    displayTitle: "ふりがな表示",
    displayDescription: "変更は自動保存され、すぐに反映されます。",
    reset: "初期設定に戻す",
    readingStyle: "読みの形式",
    hiragana: "ひらがな",
    katakana: "カタカナ",
    romaji: "ローマ字",
    fontSize: "文字サイズ",
    opacity: "不透明度",
    verticalGap: "上下の間隔",
    runtimeReady: "ランタイム正常 · Spicetify {version}",
    runtimeMissing: "ランタイムAPIが不足しています。spicetify applyを再実行してください",
    diagnosticsTitle: "トラブルシューティング診断",
    diagnosticsDescription:
      "Issueを作成するときに、簡潔な実行状態レポートをコピーできます。",
    diagnosticsPrivacy:
      "レポートに含まれるのはバージョン、設定、読みの状態、セレクター数だけです。曲名、アーティスト、歌詞、アカウント情報、認証情報は含まれません。",
    diagnosticsSummary: "{annotated}行に読みを表示 · {source}",
    diagnosticsWaiting: "歌詞ランタイムを待っています",
    copyDiagnostics: "診断情報をコピー",
    diagnosticsCopied: "診断情報をコピーしました",
    diagnosticsCopyFailed: "診断情報をコピーできませんでした",
    hint:
      "プレーヤーバーの「ふ」ボタンでも切り替えられます。読みの形式を変えると現在の歌詞を再生成します。ローカル辞書の初回読み込みには少し時間がかかる場合があります。",
    statusOnlineDisabled: "オンライン高精度読みはオフです",
    statusNoTrack: "検索できるSpotify曲がないため、ローカル読みを使用します",
    statusCacheReady: "同期読みをローカルキャッシュから読み込みました",
    statusNotFound: "同期読みが見つからないため、ローカル読みを使用します",
    statusLoading: "現在の曲の同期読みを検索しています…",
    statusMatched: "{count}行の同期読みを照合しました",
    statusUnavailable:
      "オンライン読みを一時的に利用できないため、ローカル読みを使用します",
    statusCacheCleared: "オンライン読みのキャッシュを消去しました",
    statusWaiting: "現在の曲の状態を待っています",
  },
};

function normalizeUiLanguagePreference(value) {
  return uiLanguagePreferences.includes(value) ? value : "auto";
}

function readUiLanguagePreference() {
  return normalizeUiLanguagePreference(
    Spicetify.LocalStorage.get(uiLanguageKey),
  );
}

function getLocaleCandidates() {
  const candidates = [];
  if (document.documentElement.lang) {
    candidates.push(document.documentElement.lang);
  }
  if (Array.isArray(navigator.languages)) {
    candidates.push(...navigator.languages);
  }
  if (navigator.language) {
    candidates.push(navigator.language);
  }
  return candidates;
}

function resolveUiLanguage(preference) {
  if (preference !== "auto") {
    return preference;
  }
  for (const candidate of getLocaleCandidates()) {
    const normalized = String(candidate).trim().toLowerCase();
    if (normalized.startsWith("zh")) {
      return "zh-CN";
    }
    if (normalized.startsWith("ja")) {
      return "ja";
    }
    if (normalized) {
      return "en";
    }
  }
  return "en";
}

function formatText(template, values = {}) {
  return template.replace(/\{(\w+)\}/gu, (placeholder, name) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
}

function localizeOnlineStatus(status, text) {
  const statusKeys = {
    "online-disabled": "statusOnlineDisabled",
    "no-track": "statusNoTrack",
    "cache-ready": "statusCacheReady",
    "not-found": "statusNotFound",
    loading: "statusLoading",
    matched: "statusMatched",
    unavailable: "statusUnavailable",
    "cache-cleared": "statusCacheCleared",
  };
  const key = statusKeys[status.code];
  if (key) {
    return formatText(text[key], { count: status.count ?? 0 });
  }
  const fallbackKeys = {
    idle: "statusOnlineDisabled",
    loading: "statusLoading",
    ready: "statusCacheReady",
    fallback: "statusNotFound",
    error: "statusUnavailable",
  };
  return text[fallbackKeys[status.state] ?? "statusWaiting"];
}

const defaultSettings = {
  enabled: true,
  readingMode: "hiragana",
  size: 0.46,
  opacity: 0.82,
  gap: 0,
  onlineReadings: false,
  floatingLyrics: false,
  floatingCurrentSize: 30,
  floatingNextSize: 20,
};

const readingModes = ["hiragana", "katakana", "romaji"];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readNumber(key, fallback, min, max) {
  const raw = Spicetify.LocalStorage.get(key);
  if (raw === null || raw.trim() === "") {
    return fallback;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

function readSettings() {
  const readingMode = Spicetify.LocalStorage.get(settingKeys.readingMode);
  return {
    enabled: Spicetify.LocalStorage.get(settingKeys.enabled) !== "false",
    readingMode: readingModes.includes(readingMode) ? readingMode : "hiragana",
    size: readNumber(settingKeys.size, defaultSettings.size, 0.3, 0.75),
    opacity: readNumber(
      settingKeys.opacity,
      defaultSettings.opacity,
      0.4,
      1,
    ),
    gap: readNumber(settingKeys.gap, defaultSettings.gap, 0, 8),
    onlineReadings:
      Spicetify.LocalStorage.get(settingKeys.onlineReadings) === "true",
    floatingLyrics:
      Spicetify.LocalStorage.get(settingKeys.floatingLyrics) === "true",
    floatingCurrentSize: readNumber(
      settingKeys.floatingCurrentSize,
      defaultSettings.floatingCurrentSize,
      26,
      44,
    ),
    floatingNextSize: readNumber(
      settingKeys.floatingNextSize,
      defaultSettings.floatingNextSize,
      12,
      24,
    ),
  };
}

function readOnlineStatus() {
  const raw = Spicetify.LocalStorage.get(onlineStatusKey);
  if (!raw) {
    return {
      state: "idle",
      code: "online-disabled",
      message: "",
    };
  }

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.state === "string" && typeof parsed?.message === "string") {
      return parsed;
    }
  } catch {
    // Ignore stale or malformed status data.
  }

  return { state: "idle", message: "" };
}

function readRuntimeDiagnostics() {
  const raw = Spicetify.LocalStorage.get(runtimeDiagnosticsKey);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed?.schemaVersion === 1 &&
      typeof parsed.report === "string" &&
      typeof parsed.annotatedLines === "number" &&
      typeof parsed.onlineStatus?.state === "string"
    ) {
      return parsed;
    }
  } catch {
    // Ignore stale or malformed diagnostics.
  }
  return null;
}

function formatDiagnosticsSummary(diagnostics, text) {
  if (!diagnostics) {
    return text.diagnosticsWaiting;
  }
  return formatText(text.diagnosticsSummary, {
    annotated: diagnostics.annotatedLines,
    source: localizeOnlineStatus(diagnostics.onlineStatus, text),
  });
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) {
    throw new Error("Clipboard copy failed.");
  }
}

function persistSettings(settings) {
  Object.entries(settings).forEach(([name, value]) => {
    Spicetify.LocalStorage.set(settingKeys[name], String(value));
  });
  window.dispatchEvent(
    new CustomEvent(settingEvent, {
      detail: { enabled: settings.enabled, settings, source: "app" },
    }),
  );
}

function SettingSlider({
  label,
  value,
  min,
  max,
  step,
  valueLabel,
  disabled = false,
  onChange,
}) {
  return react.createElement(
    "label",
    { className: "spotify-furigana-app__slider" },
    react.createElement(
      "span",
      { className: "spotify-furigana-app__slider-heading" },
      react.createElement("strong", null, label),
      react.createElement("output", null, valueLabel),
    ),
    react.createElement("input", {
      type: "range",
      min,
      max,
      step,
      value,
      disabled,
      onChange: (event) => onChange(Number(event.target.value)),
    }),
  );
}

function SpotifyFuriganaApp() {
  const [settings, setSettings] = react.useState(readSettings);
  const [onlineStatus, setOnlineStatus] = react.useState(readOnlineStatus);
  const [runtimeDiagnostics, setRuntimeDiagnostics] = react.useState(
    readRuntimeDiagnostics,
  );
  const [uiLanguagePreference, setUiLanguagePreference] = react.useState(
    readUiLanguagePreference,
  );
  const settingsRef = react.useRef(settings);
  settingsRef.current = settings;
  const uiLanguage = resolveUiLanguage(uiLanguagePreference);
  const text = translations[uiLanguage];

  const updateSettings = (patch) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    persistSettings(next);
    setSettings(next);
  };

  const updateUiLanguage = (preference) => {
    const normalized = normalizeUiLanguagePreference(preference);
    Spicetify.LocalStorage.set(uiLanguageKey, normalized);
    setUiLanguagePreference(normalized);
    window.dispatchEvent(new CustomEvent(uiLanguageChangeEvent));
  };

  const copyRuntimeDiagnostics = async () => {
    if (!runtimeDiagnostics?.report) {
      Spicetify.showNotification(text.diagnosticsCopyFailed, true);
      return;
    }
    try {
      await copyText(runtimeDiagnostics.report);
      Spicetify.showNotification(text.diagnosticsCopied);
    } catch {
      Spicetify.showNotification(text.diagnosticsCopyFailed, true);
    }
  };

  react.useEffect(() => {
    const syncSettings = (event) => {
      if (event.detail?.source !== "app") {
        const next = readSettings();
        settingsRef.current = next;
        setSettings(next);
      }
    };
    window.addEventListener(settingEvent, syncSettings);
    return () => window.removeEventListener(settingEvent, syncSettings);
  }, []);

  react.useEffect(() => {
    const syncRuntimeDiagnostics = (event) => {
      setRuntimeDiagnostics(event.detail ?? readRuntimeDiagnostics());
    };
    window.addEventListener(runtimeDiagnosticsEvent, syncRuntimeDiagnostics);
    return () =>
      window.removeEventListener(
        runtimeDiagnosticsEvent,
        syncRuntimeDiagnostics,
      );
  }, []);

  react.useEffect(() => {
    const syncOnlineStatus = (event) => {
      setOnlineStatus(event.detail ?? readOnlineStatus());
    };
    window.addEventListener(onlineStatusEvent, syncOnlineStatus);
    return () => window.removeEventListener(onlineStatusEvent, syncOnlineStatus);
  }, []);

  const runtimeVersion = Spicetify.Config?.version || "unknown";
  const runtimeReady = Boolean(
    Spicetify.Player && Spicetify.LocalStorage && Spicetify.Playbar,
  );

  return react.createElement(
    "section",
    { className: "contentSpacing spotify-furigana-app" },
    react.createElement(
      "p",
      { className: "spotify-furigana-app__eyebrow" },
      text.eyebrow,
    ),
    react.createElement("h1", null, "Furigana for Spotify"),
    react.createElement(
      "p",
      { className: "spotify-furigana-app__lead" },
      text.lead,
    ),
    react.createElement(
      "div",
      {
        className:
          "spotify-furigana-app__card spotify-furigana-app__language",
      },
      react.createElement(
        "div",
        null,
        react.createElement("strong", null, text.interfaceLanguage),
        react.createElement("p", null, text.interfaceLanguageDescription),
      ),
      react.createElement(
        "select",
        {
          className: "spotify-furigana-app__language-select",
          value: uiLanguagePreference,
          "aria-label": text.interfaceLanguage,
          onChange: (event) => updateUiLanguage(event.target.value),
        },
        react.createElement(
          "option",
          { value: "auto" },
          `${text.automatic} (${translations[uiLanguage][
            uiLanguage === "en"
              ? "english"
              : uiLanguage === "ja"
                ? "japanese"
                : "chinese"
          ]})`,
        ),
        react.createElement("option", { value: "en" }, text.english),
        react.createElement("option", { value: "zh-CN" }, text.chinese),
        react.createElement("option", { value: "ja" }, text.japanese),
      ),
    ),
    react.createElement(
      "div",
      { className: "spotify-furigana-app__card" },
      react.createElement(
        "div",
        null,
        react.createElement("strong", null, text.annotationTitle),
        react.createElement(
          "p",
          null,
          settings.enabled ? text.currentlyOn : text.currentlyOff,
        ),
      ),
      react.createElement(
        "button",
        {
          className: "spotify-furigana-app__toggle",
          type: "button",
          "aria-pressed": settings.enabled,
          onClick: () => updateSettings({ enabled: !settings.enabled }),
        },
        settings.enabled ? text.turnOff : text.turnOn,
      ),
    ),
    react.createElement(
      "div",
      {
        className:
          "spotify-furigana-app__card spotify-furigana-app__floating",
      },
      react.createElement(
        "div",
        { className: "spotify-furigana-app__floating-header" },
        react.createElement(
          "div",
          null,
          react.createElement("strong", null, text.floatingTitle),
          react.createElement("p", null, text.floatingDescription),
        ),
        react.createElement(
          "button",
          {
            className: "spotify-furigana-app__toggle",
            type: "button",
            disabled: !desktopOverlaySupported,
            "aria-pressed": settings.floatingLyrics,
            onClick: () =>
              updateSettings({ floatingLyrics: !settings.floatingLyrics }),
          },
          desktopOverlaySupported
            ? settings.floatingLyrics
              ? text.turnOff
              : text.turnOn
            : text.windowsOnly,
        ),
      ),
      react.createElement(
        "div",
        {
          className: "spotify-furigana-app__floating-sliders",
        },
        react.createElement(SettingSlider, {
          label: text.floatingCurrentSize,
          value: settings.floatingCurrentSize,
          min: 26,
          max: 44,
          step: 1,
          valueLabel: `${settings.floatingCurrentSize}px`,
          disabled: !desktopOverlaySupported,
          onChange: (floatingCurrentSize) =>
            updateSettings({ floatingCurrentSize }),
        }),
        react.createElement(SettingSlider, {
          label: text.floatingNextSize,
          value: settings.floatingNextSize,
          min: 12,
          max: 24,
          step: 1,
          valueLabel: `${settings.floatingNextSize}px`,
          disabled: !desktopOverlaySupported,
          onChange: (floatingNextSize) =>
            updateSettings({ floatingNextSize }),
        }),
      ),
    ),
    react.createElement(
      "div",
      { className: "spotify-furigana-app__card spotify-furigana-app__online" },
      react.createElement(
        "div",
        null,
        react.createElement("strong", null, text.onlineTitle),
        react.createElement(
          "p",
          null,
          text.onlineDescription,
        ),
        react.createElement(
          "p",
          { className: "spotify-furigana-app__online-status" },
          localizeOnlineStatus(onlineStatus, text),
        ),
        react.createElement(
          "p",
          { className: "spotify-furigana-app__privacy" },
          text.privacy,
        ),
      ),
      react.createElement(
        "div",
        { className: "spotify-furigana-app__actions" },
        react.createElement(
          "button",
          {
            className: "spotify-furigana-app__reset",
            type: "button",
            onClick: () =>
              window.dispatchEvent(new CustomEvent(onlineCacheClearEvent)),
          },
          text.clearCache,
        ),
        react.createElement(
          "button",
          {
            className: "spotify-furigana-app__toggle",
            type: "button",
            "aria-pressed": settings.onlineReadings,
            onClick: () =>
              updateSettings({ onlineReadings: !settings.onlineReadings }),
          },
          settings.onlineReadings ? text.turnOff : text.turnOn,
        ),
      ),
    ),
    react.createElement(
      "div",
      { className: "spotify-furigana-app__panel" },
      react.createElement(
        "div",
        { className: "spotify-furigana-app__panel-heading" },
        react.createElement(
          "div",
          null,
          react.createElement("h2", null, text.displayTitle),
          react.createElement("p", null, text.displayDescription),
        ),
        react.createElement(
          "button",
          {
            className: "spotify-furigana-app__reset",
            type: "button",
            onClick: () =>
              updateSettings({
                ...defaultSettings,
                enabled: settings.enabled,
                floatingLyrics: settings.floatingLyrics,
              }),
          },
          text.reset,
        ),
      ),
      react.createElement(
        "strong",
        { className: "spotify-furigana-app__label" },
        text.readingStyle,
      ),
      react.createElement(
        "div",
        {
          className: "spotify-furigana-app__segments",
          role: "group",
          "aria-label": text.readingStyle,
        },
        ...[
          ["hiragana", text.hiragana],
          ["katakana", text.katakana],
          ["romaji", text.romaji],
        ].map(([mode, label]) =>
          react.createElement(
            "button",
            {
              key: mode,
              type: "button",
              className:
                settings.readingMode === mode
                  ? "spotify-furigana-app__segment is-active"
                  : "spotify-furigana-app__segment",
              "aria-pressed": settings.readingMode === mode,
              onClick: () => updateSettings({ readingMode: mode }),
            },
            label,
          ),
        ),
      ),
      react.createElement(
        "div",
        { className: "spotify-furigana-app__sliders" },
        react.createElement(SettingSlider, {
          label: text.fontSize,
          value: settings.size,
          min: 0.3,
          max: 0.75,
          step: 0.01,
          valueLabel: `${Math.round(settings.size * 100)}%`,
          onChange: (size) => updateSettings({ size }),
        }),
        react.createElement(SettingSlider, {
          label: text.opacity,
          value: settings.opacity,
          min: 0.4,
          max: 1,
          step: 0.01,
          valueLabel: `${Math.round(settings.opacity * 100)}%`,
          onChange: (opacity) => updateSettings({ opacity }),
        }),
        react.createElement(SettingSlider, {
          label: text.verticalGap,
          value: settings.gap,
          min: 0,
          max: 8,
          step: 1,
          valueLabel: `${settings.gap}px`,
          onChange: (gap) => updateSettings({ gap }),
        }),
      ),
    ),
    react.createElement(
      "div",
      {
        className:
          "spotify-furigana-app__card spotify-furigana-app__diagnostics",
      },
      react.createElement(
        "div",
        null,
        react.createElement("strong", null, text.diagnosticsTitle),
        react.createElement("p", null, text.diagnosticsDescription),
        react.createElement(
          "p",
          { className: "spotify-furigana-app__diagnostics-summary" },
          formatDiagnosticsSummary(runtimeDiagnostics, text),
        ),
        react.createElement(
          "p",
          { className: "spotify-furigana-app__privacy" },
          text.diagnosticsPrivacy,
        ),
      ),
      react.createElement(
        "button",
        {
          className: "spotify-furigana-app__reset",
          type: "button",
          disabled: !runtimeDiagnostics?.report,
          onClick: copyRuntimeDiagnostics,
        },
        text.copyDiagnostics,
      ),
    ),
    react.createElement(
      "div",
      { className: "spotify-furigana-app__status" },
      react.createElement("span", {
        className: runtimeReady ? "is-ready" : "is-error",
      }),
      react.createElement(
        "span",
        null,
        runtimeReady
          ? formatText(text.runtimeReady, { version: runtimeVersion })
          : text.runtimeMissing,
      ),
    ),
    react.createElement(
      "p",
      { className: "spotify-furigana-app__hint" },
      text.hint,
    ),
  );
}

function render() {
  return react.createElement(SpotifyFuriganaApp);
}
