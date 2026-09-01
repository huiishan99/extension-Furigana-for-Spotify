import { describe, expect, it, vi } from "vitest";
import {
  buildOnlineReadingIndex,
  clearOnlineReadingCache,
  convertSungReadingToFurigana,
  fetchOnlineReadingResult,
  findOnlineRomanization,
  getCachedOnlineReading,
  getVerifiedArtistAliases,
  normalizeLyricLookupText,
  ONLINE_CACHE_KEY,
  type OnlineReadingResult,
  parseTimestampedLyrics,
  romanizationToHiragana,
  type StorageAdapter,
  selectBestSearchCandidate,
  setCachedOnlineReading,
} from "../src/online-readings";

function createStorage(): { storage: StorageAdapter; values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    storage: {
      get: (key) => values.get(key) ?? null,
      set: (key, value) => values.set(key, value),
    },
  };
}

const track = {
  uri: "spotify:track:test",
  title: "夜に駆ける",
  artist: "YOASOBI",
  album: "THE BOOK",
};

const lyrics = [
  "[00:01.430]沈むように溶けてゆくように",
  "[00:08.831]二人だけの空が広がる夜に",
].join("\n");

const romanizedLyrics = [
  "[00:01.430]shi zu mu yo u ni to ke te yu ku yo u ni",
  "[00:08.831]fu ta ri da ke no so ra ga hi ro ga ru yo ru ni",
].join("\n");

describe("online synchronized readings", () => {
  it("parses timestamps and pairs Japanese lines with synchronized romaji", () => {
    expect(parseTimestampedLyrics(lyrics)[1]).toEqual({
      startTimeMs: 8831,
      text: "二人だけの空が広がる夜に",
    });

    const index = buildOnlineReadingIndex(lyrics, romanizedLyrics);
    expect(findOnlineRomanization(index, "二人だけの空が広がる夜に")).toBe(
      "fu ta ri da ke no so ra ga hi ro ga ru yo ru ni",
    );
  });

  it("normalizes provider-side parenthesized readings for Spotify lookup", () => {
    expect(normalizeLyricLookupText("明けない夜に溢(こぼ)れた涙も")).toBe(
      normalizeLyricLookupText("明けない夜に溢れた涙も"),
    );
  });

  it("converts synchronized romaji into phrase-level furigana", () => {
    expect(romanizationToHiragana("fu ta ri da ke")).toBe("ふたりだけ");

    const converted = convertSungReadingToFurigana(
      "二人だけの空が広がる夜に",
      "fu ta ri da ke no so ra ga hi ro ga ru yo ru ni",
      "hiragana",
    );

    expect(converted).toContain("<ruby>二人<rp>(</rp><rt>ふたり</rt><rp>)</rp></ruby>だけの");
    expect(converted).toContain("<ruby>空<rp>(</rp><rt>そら</rt>");
    expect(converted).toContain("<ruby>夜<rp>(</rp><rt>よる</rt>");
  });

  it("handles sung particle pronunciation and display modes", () => {
    const converted = convertSungReadingToFurigana(
      "明日は晴れる",
      "a shi ta wa ha re ru",
      "katakana",
    );

    expect(converted).toContain("<rt>アシタ</rt>");
    expect(converted).toContain("<rt>ハ</rt>");
    expect(converted).toContain("は");
  });

  it("requires an exact title and artist, then prefers the matching album", () => {
    const candidate = selectBestSearchCandidate(
      [
        {
          id: "1",
          name: "夜に駆ける",
          artist: ["YOASOBI"],
          album: "夜に駆ける",
        },
        {
          id: "2",
          name: "夜に駆ける",
          artist: ["YOASOBI"],
          album: "THE BOOK",
        },
        {
          id: "3",
          name: "夜に駆ける",
          artist: ["Cover Artist"],
          album: "THE BOOK",
        },
        {
          id: "4",
          name: "夜に駆ける",
          artist: ["YOASOBI Tribute"],
          album: "THE BOOK",
        },
      ],
      track,
    );

    expect(candidate?.id).toBe("2");
  });

  it("accepts a cross-script artist only through a high-confidence alias", () => {
    const response = {
      artists: [
        {
          name: "藤井風",
          "sort-name": "Fujii, Kaze",
          score: 100,
          aliases: [{ name: "藤井風" }, { name: "Fujii Kaze" }],
        },
      ],
    };
    const aliases = getVerifiedArtistAliases(response, "Fujii Kaze");
    const candidate = selectBestSearchCandidate(
      [
        {
          id: "2135625944",
          name: "満ちてゆく",
          artist: ["藤井風"],
          album: "満ちてゆく",
        },
        {
          id: "cover",
          name: "満ちてゆく",
          artist: ["Cover Artist"],
          album: "満ちてゆく",
        },
      ],
      {
        uri: "spotify:track:michiteyuku",
        title: "満ちてゆく",
        artist: "Fujii Kaze",
        album: "満ちてゆく",
      },
      aliases,
    );

    expect(aliases).toContain("藤井風");
    expect(candidate?.id).toBe("2135625944");
    expect(getVerifiedArtistAliases(response, "Different Artist")).toEqual([]);
  });

  it("fetches only after a strict match and builds a usable index", async () => {
    const request = vi.fn(async (url: string) => {
      if (url.includes("types=search")) {
        return [
          {
            id: "1409311773",
            lyric_id: "1409311773",
            name: "夜に駆ける",
            artist: ["YOASOBI"],
            album: "THE BOOK",
          },
        ];
      }
      return {
        lrc: { lyric: lyrics },
        romalrc: { lyric: romanizedLyrics },
      };
    });

    const result = await fetchOnlineReadingResult(track, request);

    expect(result?.providerTrackId).toBe("1409311773");
    expect(Object.keys(result?.readings ?? {})).toHaveLength(2);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]?.[0]).toContain("rv=-1");
  });

  it("tries another verified release when the album match has no romaji", async () => {
    const request = vi.fn(async (url: string) => {
      if (url.includes("types=search")) {
        return [
          {
            id: "album-version",
            lyric_id: "100",
            name: "夜に駆ける",
            artist: ["YOASOBI"],
            album: "THE BOOK",
          },
          {
            id: "single-version",
            lyric_id: "200",
            name: "夜に駆ける",
            artist: ["YOASOBI"],
            album: "夜に駆ける",
          },
          {
            id: "cover-version",
            lyric_id: "300",
            name: "夜に駆ける",
            artist: ["Cover Artist"],
            album: "THE BOOK",
          },
        ];
      }
      if (url.includes("id=100")) {
        return { lrc: { lyric: lyrics }, romalrc: { lyric: "" } };
      }
      return {
        lrc: { lyric: lyrics },
        romalrc: { lyric: romanizedLyrics },
      };
    });

    const result = await fetchOnlineReadingResult(track, request);

    expect(result?.providerTrackId).toBe("200");
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[1]?.[0]).toContain("id=100");
    expect(request.mock.calls[2]?.[0]).toContain("id=200");
    expect(request.mock.calls.some(([url]) => url.includes("id=300"))).toBe(false);
  });

  it("uses a verified artist alias before fetching synchronized lyrics", async () => {
    const request = vi.fn(async (url: string) => {
      if (url.includes("types=search")) {
        return [
          {
            id: "2135625944",
            lyric_id: "2135625944",
            name: "満ちてゆく",
            artist: ["藤井風"],
            album: "満ちてゆく",
          },
        ];
      }
      if (url.includes("musicbrainz.org")) {
        return {
          artists: [
            {
              name: "藤井風",
              "sort-name": "Fujii, Kaze",
              score: 100,
              aliases: [{ name: "Fujii Kaze" }],
            },
          ],
        };
      }
      return {
        lrc: { lyric: lyrics },
        romalrc: { lyric: romanizedLyrics },
      };
    });

    const result = await fetchOnlineReadingResult(
      {
        uri: "spotify:track:michiteyuku",
        title: "満ちてゆく",
        artist: "Fujii Kaze",
        album: "満ちてゆく",
      },
      request,
    );

    expect(result?.providerTrackId).toBe("2135625944");
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[1]?.[0]).toContain("musicbrainz.org");
    expect(request.mock.calls[2]?.[0]).toContain("rv=-1");
  });

  it("retries artist verification after an empty transient response", async () => {
    let aliasRequests = 0;
    const request = vi.fn(async (url: string) => {
      if (url.includes("types=search")) {
        return [
          {
            id: "400",
            lyric_id: "400",
            name: "再試行",
            artist: ["再試行歌手"],
            album: "再試行",
          },
        ];
      }
      if (url.includes("musicbrainz.org")) {
        aliasRequests += 1;
        return aliasRequests === 1
          ? { artists: [] }
          : {
              artists: [
                {
                  name: "再試行歌手",
                  "sort-name": "Retry Artist",
                  score: 100,
                },
              ],
            };
      }
      return {
        lrc: { lyric: lyrics },
        romalrc: { lyric: romanizedLyrics },
      };
    });
    const retryTrack = {
      uri: "spotify:track:retry",
      title: "再試行",
      artist: "Retry Artist",
      album: "再試行",
    };

    expect(await fetchOnlineReadingResult(retryTrack, request)).toBeNull();
    expect((await fetchOnlineReadingResult(retryTrack, request))?.providerTrackId).toBe("400");
    expect(aliasRequests).toBe(2);
  });

  it("caches successful and negative lookups with different expiry windows", () => {
    const { storage, values } = createStorage();
    const result: OnlineReadingResult = {
      provider: "netease",
      providerTrackId: "1409311773",
      readings: buildOnlineReadingIndex(lyrics, romanizedLyrics),
    };
    const now = 1_000_000;

    setCachedOnlineReading(storage, track.uri, result, now);
    expect(getCachedOnlineReading(storage, track.uri, now + 1).result).toEqual(result);
    expect(values.get(ONLINE_CACHE_KEY)).toContain("1409311773");

    setCachedOnlineReading(storage, "spotify:track:missing", null, now);
    expect(getCachedOnlineReading(storage, "spotify:track:missing", now + 1)).toEqual({
      found: true,
      result: null,
    });
    expect(
      getCachedOnlineReading(storage, "spotify:track:missing", now + 7 * 60 * 60 * 1000).found,
    ).toBe(false);

    clearOnlineReadingCache(storage);
    expect(getCachedOnlineReading(storage, track.uri, now + 1).found).toBe(false);
  });
});
