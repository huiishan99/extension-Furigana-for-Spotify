import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clampFloatingLyricPosition,
  CURRENT_LYRIC_SELECTORS,
  findCurrentLyricLine,
  findTimedLyricLine,
  getSpotifyLyricsUrl,
  parseSpotifyTimedLyrics,
  parseFloatingLyricPosition,
} from "../src/floating-lyrics";

class FakeElement {
  constructor(
    private readonly isLyricLine: boolean,
    private readonly nestedLine: FakeElement | null = null,
  ) {}

  matches(): boolean {
    return this.isLyricLine;
  }

  querySelector(): FakeElement | null {
    return this.nestedLine;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("floating current lyric", () => {
  it("targets Spotify's active lyric class before generic fallbacks", () => {
    vi.stubGlobal("HTMLElement", FakeElement);
    const activeLine = new FakeElement(true);
    const root = {
      querySelector: vi.fn((selector: string) =>
        selector === CURRENT_LYRIC_SELECTORS[0] ? activeLine : null,
      ),
    };

    expect(
      findCurrentLyricLine(root as unknown as Pick<ParentNode, "querySelector">),
    ).toBe(activeLine);
    expect(root.querySelector).toHaveBeenCalledOnce();
    expect(CURRENT_LYRIC_SELECTORS[0]).toBe(
      ".lyrics-lyricsContent-active .lyrics-lyricsContent-text",
    );
  });

  it("accepts an active wrapper and returns its lyric text child", () => {
    vi.stubGlobal("HTMLElement", FakeElement);
    const nestedLine = new FakeElement(true);
    const wrapper = new FakeElement(false, nestedLine);
    const root = {
      querySelector: vi.fn((selector: string) =>
        selector === CURRENT_LYRIC_SELECTORS[0] ? wrapper : null,
      ),
    };

    expect(
      findCurrentLyricLine(root as unknown as Pick<ParentNode, "querySelector">),
    ).toBe(nestedLine);
  });

  it("restores valid positions and keeps dragged cards on screen", () => {
    expect(parseFloatingLyricPosition('{"left":120,"top":80}')).toEqual({
      left: 120,
      top: 80,
    });
    expect(parseFloatingLyricPosition("not-json")).toBeNull();
    expect(
      clampFloatingLyricPosition(
        { left: 900, top: -50 },
        { width: 960, height: 540 },
        { width: 400, height: 90 },
      ),
    ).toEqual({ left: 548, top: 12 });
  });

  it("parses Spotify line-synced lyrics and follows playback progress", () => {
    const lines = parseSpotifyTimedLyrics({
      lyrics: {
        syncType: "LINE_SYNCED",
        lines: [
          { startTimeMs: "2200", words: "二人だけ" },
          { startTimeMs: "800", words: "一人きり" },
          { startTimeMs: "invalid", words: "ignored" },
        ],
      },
    });

    expect(lines).toEqual([
      { startTimeMs: 800, words: "一人きり" },
      { startTimeMs: 2200, words: "二人だけ" },
    ]);
    expect(findTimedLyricLine(lines, 799)).toBeNull();
    expect(findTimedLyricLine(lines, 1800)?.words).toBe("一人きり");
    expect(findTimedLyricLine(lines, 2200)?.words).toBe("二人だけ");
  });

  it("builds the authenticated Spotify lyrics endpoint only for tracks", () => {
    expect(getSpotifyLyricsUrl("spotify:track:3L7ISJTvKx56uhsF28aJ4p")).toBe(
      "https://spclient.wg.spotify.com/color-lyrics/v2/track/3L7ISJTvKx56uhsF28aJ4p?format=json&vocalRemoval=false&market=from_token",
    );
    expect(getSpotifyLyricsUrl("spotify:episode:abc")).toBeNull();
  });
});
