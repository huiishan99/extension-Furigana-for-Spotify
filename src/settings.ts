export const ENABLED_KEY = "spotify-furigana:enabled";
export const READING_MODE_KEY = "spotify-furigana:reading-mode";
export const FURIGANA_SIZE_KEY = "spotify-furigana:size";
export const FURIGANA_OPACITY_KEY = "spotify-furigana:opacity";
export const FURIGANA_GAP_KEY = "spotify-furigana:gap";
export const ONLINE_READINGS_KEY = "spotify-furigana:online-readings-enabled";
export const FLOATING_LYRICS_KEY = "spotify-furigana:floating-lyrics-enabled";
export const SETTING_CHANGE_EVENT = "spotify-furigana:setting-change";

export const READING_MODES = ["hiragana", "katakana", "romaji"] as const;

export type ReadingMode = (typeof READING_MODES)[number];

export interface FuriganaSettings {
  enabled: boolean;
  readingMode: ReadingMode;
  size: number;
  opacity: number;
  gap: number;
  onlineReadings: boolean;
  floatingLyrics: boolean;
}

export const DEFAULT_SETTINGS: Readonly<FuriganaSettings> = {
  enabled: true,
  readingMode: "hiragana",
  size: 0.46,
  opacity: 0.82,
  gap: 0,
  onlineReadings: false,
  floatingLyrics: false,
};

export const SETTING_RANGES = {
  size: { min: 0.3, max: 0.75 },
  opacity: { min: 0.4, max: 1 },
  gap: { min: 0, max: 8 },
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getNumberSetting(
  key: string,
  fallback: number,
  range: { min: number; max: number },
): number {
  const raw = Spicetify.LocalStorage.get(key);
  if (raw === null || raw.trim() === "") {
    return fallback;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? clamp(value, range.min, range.max) : fallback;
}

export function normalizeReadingMode(value: unknown): ReadingMode {
  return READING_MODES.includes(value as ReadingMode)
    ? (value as ReadingMode)
    : DEFAULT_SETTINGS.readingMode;
}

export function isFuriganaEnabled(): boolean {
  return Spicetify.LocalStorage.get(ENABLED_KEY) !== "false";
}

export function setFuriganaEnabled(enabled: boolean): void {
  Spicetify.LocalStorage.set(ENABLED_KEY, String(enabled));
}

export function getFuriganaSettings(): FuriganaSettings {
  return {
    enabled: isFuriganaEnabled(),
    readingMode: normalizeReadingMode(
      Spicetify.LocalStorage.get(READING_MODE_KEY),
    ),
    size: getNumberSetting(
      FURIGANA_SIZE_KEY,
      DEFAULT_SETTINGS.size,
      SETTING_RANGES.size,
    ),
    opacity: getNumberSetting(
      FURIGANA_OPACITY_KEY,
      DEFAULT_SETTINGS.opacity,
      SETTING_RANGES.opacity,
    ),
    gap: getNumberSetting(
      FURIGANA_GAP_KEY,
      DEFAULT_SETTINGS.gap,
      SETTING_RANGES.gap,
    ),
    onlineReadings:
      Spicetify.LocalStorage.get(ONLINE_READINGS_KEY) === "true",
    floatingLyrics:
      Spicetify.LocalStorage.get(FLOATING_LYRICS_KEY) === "true",
  };
}

export function setFuriganaSettings(settings: FuriganaSettings): void {
  setFuriganaEnabled(settings.enabled);
  Spicetify.LocalStorage.set(READING_MODE_KEY, settings.readingMode);
  Spicetify.LocalStorage.set(FURIGANA_SIZE_KEY, String(settings.size));
  Spicetify.LocalStorage.set(FURIGANA_OPACITY_KEY, String(settings.opacity));
  Spicetify.LocalStorage.set(FURIGANA_GAP_KEY, String(settings.gap));
  Spicetify.LocalStorage.set(
    ONLINE_READINGS_KEY,
    String(settings.onlineReadings),
  );
  Spicetify.LocalStorage.set(
    FLOATING_LYRICS_KEY,
    String(settings.floatingLyrics),
  );
}
