import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  FURIGANA_GAP_KEY,
  FURIGANA_OPACITY_KEY,
  FURIGANA_SIZE_KEY,
  FLOATING_CURRENT_SIZE_KEY,
  FLOATING_LYRICS_KEY,
  FLOATING_NEXT_SIZE_KEY,
  getFuriganaSettings,
  READING_MODE_KEY,
  setFuriganaSettings,
} from "../src/settings";

function useLocalStorage(initial: Record<string, string> = {}): Map<string, string> {
  const values = new Map(Object.entries(initial));
  vi.stubGlobal("Spicetify", {
    LocalStorage: {
      get: (key: string) => values.get(key) ?? null,
      set: (key: string, value: string) => values.set(key, value),
    },
  });
  return values;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("furigana settings", () => {
  it("uses readable defaults for a new installation", () => {
    useLocalStorage();

    expect(getFuriganaSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("rejects unknown modes and clamps numeric settings", () => {
    useLocalStorage({
      [READING_MODE_KEY]: "unknown",
      [FURIGANA_SIZE_KEY]: "99",
      [FURIGANA_OPACITY_KEY]: "0.1",
      [FURIGANA_GAP_KEY]: "not-a-number",
      [FLOATING_CURRENT_SIZE_KEY]: "99",
      [FLOATING_NEXT_SIZE_KEY]: "4",
    });

    expect(getFuriganaSettings()).toMatchObject({
      readingMode: "hiragana",
      size: 0.75,
      opacity: 0.4,
      gap: 0,
      floatingCurrentSize: 44,
      floatingNextSize: 12,
    });
  });

  it("persists the complete display configuration", () => {
    const values = useLocalStorage();

    setFuriganaSettings({
      enabled: false,
      readingMode: "romaji",
      size: 0.6,
      opacity: 0.7,
      gap: 4,
      onlineReadings: true,
      floatingLyrics: true,
      floatingCurrentSize: 38,
      floatingNextSize: 18,
    });

    expect(getFuriganaSettings()).toEqual({
      enabled: false,
      readingMode: "romaji",
      size: 0.6,
      opacity: 0.7,
      gap: 4,
      onlineReadings: true,
      floatingLyrics: true,
      floatingCurrentSize: 38,
      floatingNextSize: 18,
    });
    expect(values.get(FLOATING_LYRICS_KEY)).toBe("true");
    expect(values.get(FLOATING_CURRENT_SIZE_KEY)).toBe("38");
    expect(values.get(FLOATING_NEXT_SIZE_KEY)).toBe("18");
    expect(values.size).toBe(9);
  });
});
