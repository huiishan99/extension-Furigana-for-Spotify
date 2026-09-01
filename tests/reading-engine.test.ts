import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { convertToFurigana } from "../src/reading-engine";

const dictionaryPath = fileURLToPath(new URL("../node_modules/kuromoji/dict/", import.meta.url));

describe("local reading engine", () => {
  it("converts Japanese kanji without a remote API", async () => {
    const converted = await convertToFurigana("夜に駆ける", dictionaryPath);

    expect(converted).toContain("<ruby>夜");
    expect(converted).toContain("<rt>よる</rt>");
    expect(converted).toContain("<ruby>駆");
  });

  it.each([
    ["hiragana", "<rt>よる</rt>"],
    ["katakana", "<rt>ヨル</rt>"],
    ["romaji", "<rt>yoru</rt>"],
  ] as const)("supports %s readings", async (mode, expectedReading) => {
    const converted = await convertToFurigana("夜に駆ける", dictionaryPath, mode);

    expect(converted).toContain(expectedReading);
  });

  it("prefers a synchronized sung reading when one is available", async () => {
    const converted = await convertToFurigana(
      "二人だけの空",
      dictionaryPath,
      "hiragana",
      "fu ta ri da ke no so ra",
    );

    expect(converted).toContain("<rt>ふたり</rt>");
    expect(converted).not.toContain("<rt>にん</rt>");
  });

  it("corrects one- and two-person counters during local fallback", async () => {
    const converted = await convertToFurigana("一人で歩く、二人だけの空、1人2人", dictionaryPath);

    expect(converted).toContain("<ruby>一人<rp>(</rp><rt>ひとり</rt>");
    expect(converted).toContain("<ruby>二人<rp>(</rp><rt>ふたり</rt>");
    expect(converted).toContain("<ruby>1人<rp>(</rp><rt>ひとり</rt>");
    expect(converted).toContain("<ruby>2人<rp>(</rp><rt>ふたり</rt>");
    expect(converted).not.toContain("<rt>いち</rt>");
    expect(converted).not.toContain("<rt>にん</rt>");
  });
});
