export const UI_LANGUAGE_KEY = "spotify-furigana:ui-language";
export const UI_LANGUAGE_CHANGE_EVENT = "spotify-furigana:ui-language-change";

export const UI_LANGUAGE_PREFERENCES = ["auto", "en", "zh-CN", "ja"] as const;

export type UiLanguagePreference = (typeof UI_LANGUAGE_PREFERENCES)[number];
export type UiLanguage = Exclude<UiLanguagePreference, "auto">;

export interface UiLanguageStorage {
  get(key: string): string | null;
}

export type RuntimeMessageKey =
  | "onlineDisabled"
  | "noTrackFallback"
  | "cachedReady"
  | "notFoundFallback"
  | "loading"
  | "matched"
  | "unavailableFallback"
  | "dictionaryFailed"
  | "disableFurigana"
  | "enableFurigana"
  | "enabledNotice"
  | "disabledNotice"
  | "cacheCleared"
  | "sourceLocal"
  | "sourceLoading"
  | "sourceAccurate"
  | "sourceFallback";

const runtimeMessages: Record<
  UiLanguage,
  Record<RuntimeMessageKey, string>
> = {
  en: {
    onlineDisabled: "Accurate online readings are off",
    noTrackFallback: "No Spotify track is available; using local readings",
    cachedReady: "Loaded synchronized readings from the local cache",
    notFoundFallback:
      "No synchronized readings found for this track; using local readings",
    loading: "Looking up synchronized readings…",
    matched: "Matched {count} synchronized lyric lines",
    unavailableFallback:
      "Online readings are temporarily unavailable; using local readings",
    dictionaryFailed: "The Furigana dictionary failed to load",
    disableFurigana: "Turn off lyric furigana",
    enableFurigana: "Turn on lyric furigana",
    enabledNotice: "Lyric furigana is on",
    disabledNotice: "Lyric furigana is off",
    cacheCleared: "Online reading cache cleared",
    sourceLocal: "Local readings",
    sourceLoading: "Checking accurate readings",
    sourceAccurate: "Accurate readings · {count} lines",
    sourceFallback: "Local fallback · online unavailable",
  },
  "zh-CN": {
    onlineDisabled: "在线精准读音未开启",
    noTrackFallback: "当前没有可查询的 Spotify 曲目，使用本地词典",
    cachedReady: "已从本地缓存加载同步读音",
    notFoundFallback: "当前歌曲暂无同步读音，使用本地词典",
    loading: "正在查询当前歌曲的同步读音…",
    matched: "已匹配 {count} 行同步读音",
    unavailableFallback: "在线读音暂时不可用，已自动使用本地词典",
    dictionaryFailed: "Furigana 词典加载失败",
    disableFurigana: "关闭歌词振假名",
    enableFurigana: "开启歌词振假名",
    enabledNotice: "歌词振假名已开启",
    disabledNotice: "歌词振假名已关闭",
    cacheCleared: "在线缓存已清除",
    sourceLocal: "本地读音",
    sourceLoading: "正在查询精准读音",
    sourceAccurate: "精准读音 · {count} 行",
    sourceFallback: "本地回退 · 在线读音不可用",
  },
  ja: {
    onlineDisabled: "オンライン高精度読みはオフです",
    noTrackFallback: "検索できるSpotify曲がないため、ローカル読みを使用します",
    cachedReady: "同期読みをローカルキャッシュから読み込みました",
    notFoundFallback: "同期読みが見つからないため、ローカル読みを使用します",
    loading: "現在の曲の同期読みを検索しています…",
    matched: "{count}行の同期読みを照合しました",
    unavailableFallback:
      "オンライン読みを一時的に利用できないため、ローカル読みを使用します",
    dictionaryFailed: "ふりがな辞書を読み込めませんでした",
    disableFurigana: "歌詞のふりがなをオフにする",
    enableFurigana: "歌詞のふりがなをオンにする",
    enabledNotice: "歌詞のふりがなをオンにしました",
    disabledNotice: "歌詞のふりがなをオフにしました",
    cacheCleared: "オンライン読みのキャッシュを消去しました",
    sourceLocal: "ローカル読み",
    sourceLoading: "高精度読みを確認中",
    sourceAccurate: "高精度読み · {count}行",
    sourceFallback: "ローカル読み · オンライン利用不可",
  },
};

export function normalizeUiLanguagePreference(
  value: unknown,
): UiLanguagePreference {
  return UI_LANGUAGE_PREFERENCES.includes(value as UiLanguagePreference)
    ? (value as UiLanguagePreference)
    : "auto";
}

export function resolveUiLanguage(
  preference: UiLanguagePreference,
  localeCandidates: readonly string[],
): UiLanguage {
  if (preference !== "auto") {
    return preference;
  }

  for (const candidate of localeCandidates) {
    const normalized = candidate.trim().toLowerCase();
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

export function getRuntimeUiLanguage(storage: UiLanguageStorage): UiLanguage {
  const preference = normalizeUiLanguagePreference(storage.get(UI_LANGUAGE_KEY));
  const candidates = [
    typeof document === "undefined" ? "" : document.documentElement.lang,
    ...(typeof navigator === "undefined" ? [] : navigator.languages),
    typeof navigator === "undefined" ? "" : navigator.language,
  ];
  return resolveUiLanguage(preference, candidates);
}

export function translateRuntimeMessage(
  language: UiLanguage,
  key: RuntimeMessageKey,
  values: Record<string, string | number> = {},
): string {
  return runtimeMessages[language][key].replace(
    /\{(\w+)\}/gu,
    (placeholder, name: string) =>
      Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
}
