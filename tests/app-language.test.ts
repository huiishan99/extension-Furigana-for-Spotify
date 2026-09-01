import { afterEach, describe, expect, it, vi } from "vitest";

async function loadAppLanguageApi(
  documentLanguage: string,
  navigatorLanguages: string[],
): Promise<AppLanguageTestApi> {
  vi.resetModules();
  vi.stubGlobal("Spicetify", {
    React: {},
    LocalStorage: { get: () => null, set: () => undefined },
  });
  vi.stubGlobal("document", { documentElement: { lang: documentLanguage } });
  vi.stubGlobal("navigator", {
    platform: "Win32",
    languages: navigatorLanguages,
    language: navigatorLanguages[0] ?? "",
  });
  return await import("../app/index");
}

type AppLanguageTestApi = typeof import("../app/index");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Spicetify app language", () => {
  it("uses English automatically for an English Spotify document", async () => {
    const api = await loadAppLanguageApi("en", ["zh-CN"]);
    expect(api.resolveUiLanguage("auto")).toBe("en");
    expect(api.translations.en.interfaceLanguage).toBe("Interface language");
  });

  it("supports manual English, Simplified Chinese, and Japanese", async () => {
    const api = await loadAppLanguageApi("en", ["en-US"]);
    expect(api.resolveUiLanguage("zh-CN")).toBe("zh-CN");
    expect(api.translations["zh-CN"].interfaceLanguage).toBe("界面语言");
    expect(api.translations.ja.interfaceLanguage).toBe("表示言語");
    expect(api.translations["zh-CN"].copyDiagnostics).toBe("复制诊断信息");
    expect(api.translations.ja.copyDiagnostics).toBe("診断情報をコピー");
    expect(api.normalizeUiLanguagePreference("invalid")).toBe("auto");
  });

  it("keeps the three app dictionaries structurally complete", async () => {
    const api = await loadAppLanguageApi("en", ["en-US"]);
    const englishKeys = Object.keys(api.translations.en).sort();
    expect(Object.keys(api.translations["zh-CN"]).sort()).toEqual(englishKeys);
    expect(Object.keys(api.translations.ja).sort()).toEqual(englishKeys);
  });

  it("exposes independent default sizes for both floating lyric lines", async () => {
    const api = await loadAppLanguageApi("en", ["en-US"]);

    expect(api.readSettings()).toMatchObject({
      floatingCurrentSize: 30,
      floatingNextSize: 20,
    });
    expect(api.settingKeys.floatingCurrentSize).toBe(
      "spotify-furigana:floating-current-size",
    );
    expect(api.settingKeys.floatingNextSize).toBe(
      "spotify-furigana:floating-next-size",
    );
  });

  it("localizes status codes instead of reusing a stored Chinese message", async () => {
    const api = await loadAppLanguageApi("en", ["en-US"]);
    expect(
      api.localizeOnlineStatus(
        {
          state: "ready",
          code: "matched",
          count: 35,
        },
        api.translations.en,
      ),
    ).toBe("Matched 35 synchronized lyric lines");
  });
});
