import { describe, expect, it } from "vitest";
import { hasKanji, normalizeLyricText, shouldAnnotateLyric } from "../src/text";

describe("Japanese lyric detection", () => {
  it("detects common and iteration kanji", () => {
    expect(hasKanji("夜に駆ける")).toBe(true);
    expect(hasKanji("時々")).toBe(true);
  });

  it("does not process kana-only or Latin lyrics", () => {
    expect(shouldAnnotateLyric("ありがとう")).toBe(false);
    expect(shouldAnnotateLyric("hello world")).toBe(false);
  });

  it("normalizes Spotify layout whitespace", () => {
    expect(normalizeLyricText("  君の\n  名前  ")).toBe("君の 名前");
  });

  it("rejects unexpectedly large text blocks", () => {
    expect(shouldAnnotateLyric(`夜${"あ".repeat(300)}`)).toBe(false);
  });
});
