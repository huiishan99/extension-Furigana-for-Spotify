import { describe, expect, it } from "vitest";
import {
  normalizeUiLanguagePreference,
  resolveUiLanguage,
  translateRuntimeMessage,
  UI_LANGUAGE_KEY,
} from "../src/ui-language";

describe("runtime UI language", () => {
  it("defaults automatic non-Chinese and non-Japanese locales to English", () => {
    expect(resolveUiLanguage("auto", ["en-US"])).toBe("en");
    expect(resolveUiLanguage("auto", ["de-DE"])).toBe("en");
    expect(resolveUiLanguage("auto", [])).toBe("en");
  });

  it("detects Chinese and Japanese locale families", () => {
    expect(resolveUiLanguage("auto", ["zh-TW"])).toBe("zh-CN");
    expect(resolveUiLanguage("auto", ["ja-JP"])).toBe("ja");
  });

  it("honors a manual language independently of the runtime locale", () => {
    expect(resolveUiLanguage("en", ["zh-CN"])).toBe("en");
    expect(resolveUiLanguage("zh-CN", ["en-US"])).toBe("zh-CN");
    expect(resolveUiLanguage("ja", ["en-US"])).toBe("ja");
    expect(normalizeUiLanguagePreference("unknown")).toBe("auto");
    expect(UI_LANGUAGE_KEY).toBe("spotify-furigana:ui-language");
  });

  it("localizes runtime controls, statuses, and dynamic counts", () => {
    expect(translateRuntimeMessage("en", "enableFurigana")).toBe(
      "Turn on lyric furigana",
    );
    expect(translateRuntimeMessage("zh-CN", "cacheCleared")).toBe(
      "在线缓存已清除",
    );
    expect(
      translateRuntimeMessage("ja", "matched", { count: 35 }),
    ).toBe("35行の同期読みを照合しました");
    expect(
      translateRuntimeMessage("zh-CN", "sourceAccurate", { count: 35 }),
    ).toBe("精准读音 · 35 行");
    expect(translateRuntimeMessage("en", "sourceFallback")).toBe(
      "Local fallback · online unavailable",
    );
  });
});
