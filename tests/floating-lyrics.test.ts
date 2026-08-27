import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDesktopOverlayState,
  CURRENT_LYRIC_SELECTORS,
  DESKTOP_OVERLAY_URL,
  extractDesktopLyricSegments,
  findCurrentLyricLine,
  findTimedLyricContext,
  findTimedLyricLine,
  getSpotifyLyricsUrl,
  parseSpotifyTimedLyrics,
  sendDesktopOverlayState,
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

  it("serializes base text and ruby readings for the native overlay", () => {
    const text = (value: string) => ({
      nodeType: 3,
      textContent: value,
      childNodes: [],
    });
    const element = (tagName: string, childNodes: object[]) => ({
      nodeType: 1,
      tagName,
      textContent: childNodes.map((child) => (child as { textContent: string }).textContent).join(""),
      childNodes,
    });
    const root = {
      childNodes: [
        element("ruby", [
          text("二人"),
          element("rp", [text("(")]),
          element("rt", [text("ふたり")]),
          element("rp", [text(")")]),
        ]),
        text("だけの空"),
      ],
    };

    expect(
      extractDesktopLyricSegments(
        root as unknown as Pick<ParentNode, "childNodes">,
      ),
    ).toEqual([
      { text: "二人", reading: "ふたり" },
      { text: "だけの空" },
    ]);
    expect(
      createDesktopOverlayState(
        true,
        [
          { text: "二人", reading: "ふたり" },
          { text: "だけ" },
        ],
        [{ text: "次", reading: "つぎ" }],
      ),
    ).toEqual({
      version: 1,
      enabled: true,
      segments: [
        { text: "二人", reading: "ふたり" },
        { text: "だけ" },
      ],
      nextSegments: [{ text: "次", reading: "つぎ" }],
      currentFontSize: 30,
      nextFontSize: 20,
    });
    expect(
      createDesktopOverlayState(true, [], [], 99, -1),
    ).toMatchObject({
      currentFontSize: 44,
      nextFontSize: 12,
    });
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
    expect(findTimedLyricContext(lines, 1800)).toEqual({
      current: { startTimeMs: 800, words: "一人きり" },
      next: { startTimeMs: 2200, words: "二人だけ" },
    });
    expect(findTimedLyricContext(lines, 2200)?.next).toBeNull();
  });

  it("builds the authenticated Spotify lyrics endpoint only for tracks", () => {
    expect(getSpotifyLyricsUrl("spotify:track:3L7ISJTvKx56uhsF28aJ4p")).toBe(
      "https://spclient.wg.spotify.com/color-lyrics/v2/track/3L7ISJTvKx56uhsF28aJ4p?format=json&vocalRemoval=false&market=from_token",
    );
    expect(getSpotifyLyricsUrl("spotify:episode:abc")).toBeNull();
  });

  it("posts only to the fixed loopback overlay without CORS proxying", () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null)));
    vi.stubGlobal("fetch", fetchMock);
    const state = createDesktopOverlayState(true, [
      { text: "二人", reading: "ふたり" },
    ]);

    sendDesktopOverlayState(state);

    expect(DESKTOP_OVERLAY_URL).toBe("http://127.0.0.1:43841/state");
    expect(fetchMock).toHaveBeenCalledWith(DESKTOP_OVERLAY_URL, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify(state),
    });
  });
});
