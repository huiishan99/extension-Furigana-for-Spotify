import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface AppLanguageTestApi {
  normalizeUiLanguagePreference(value: unknown): string;
  resolveUiLanguage(preference: string): string;
  localizeOnlineStatus(
    status: { state: string; code?: string; count?: number },
    text: Record<string, string>,
  ): string;
  translations: {
    en: Record<string, string>;
    "zh-CN": Record<string, string>;
    ja: Record<string, string>;
  };
  readSettings(): {
    floatingCurrentSize: number;
    floatingNextSize: number;
  };
  settingKeys: Record<string, string>;
}

async function loadAppLanguageApi(
  documentLanguage: string,
  navigatorLanguages: string[],
): Promise<AppLanguageTestApi> {
  const source = await readFile(resolve(projectRoot, "app", "index.js"), "utf8");
  const context = {
    Spicetify: {
      React: {},
      LocalStorage: { get: () => null, set: () => undefined },
    },
    document: { documentElement: { lang: documentLanguage } },
    navigator: {
      languages: navigatorLanguages,
      language: navigatorLanguages[0] ?? "",
    },
  };
  return runInNewContext(
    `${source}\n;({ normalizeUiLanguagePreference, resolveUiLanguage, localizeOnlineStatus, translations, readSettings, settingKeys })`,
    context,
  ) as AppLanguageTestApi;
}

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
