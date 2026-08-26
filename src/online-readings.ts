import { toHiragana, toKatakana, toRomaji } from "wanakana";
import type { ReadingMode } from "./settings";

export const ONLINE_CACHE_KEY = "spotify-furigana:online-cache-v1";
export const ONLINE_STATUS_KEY = "spotify-furigana:online-status";
export const ONLINE_STATUS_EVENT = "spotify-furigana:online-status-change";
export const ONLINE_CACHE_CLEAR_EVENT = "spotify-furigana:online-cache-clear";

const SEARCH_ENDPOINT = "https://music-api.gdstudio.xyz/api.php";
const NETEASE_LYRIC_ENDPOINT = "https://music.163.com/api/song/lyric";
const MUSICBRAINZ_ARTIST_ENDPOINT = "https://musicbrainz.org/ws/2/artist/";
const POSITIVE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const NEGATIVE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 30;
const MAX_TIMESTAMP_DIFFERENCE_MS = 120;
const MAX_LYRIC_CANDIDATE_ATTEMPTS = 4;

export interface OnlineTrackMetadata {
  uri: string;
  title: string;
  artist: string;
  album: string;
}

export type OnlineReadingIndex = Record<string, string>;

export interface OnlineReadingResult {
  provider: "netease";
  providerTrackId: string;
  readings: OnlineReadingIndex;
}

export interface StorageAdapter {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export interface CachedOnlineReading {
  found: boolean;
  result: OnlineReadingResult | null;
}

export interface OnlineReadingStatus {
  state: "idle" | "loading" | "ready" | "fallback" | "error";
  message: string;
  code?:
    | "online-disabled"
    | "no-track"
    | "cache-ready"
    | "not-found"
    | "loading"
    | "matched"
    | "unavailable"
    | "cache-cleared";
  count?: number;
}

export type JsonRequest = (
  url: string,
  headers?: Record<string, string>,
) => Promise<unknown>;

interface TimestampedLine {
  startTimeMs: number;
  text: string;
}

interface SearchCandidate {
  id?: string | number;
  lyric_id?: string | number;
  name?: string;
  artist?: unknown;
  album?: string;
}

interface MusicBrainzArtist {
  name?: string;
  "sort-name"?: string;
  score?: number;
  aliases?: unknown;
}

interface CacheEntry {
  storedAt: number;
  expiresAt: number;
  result: OnlineReadingResult | null;
}

interface CacheDocument {
  version: 1;
  entries: Record<string, CacheEntry>;
}

const artistAliasCache = new Map<string, string[]>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getNestedString(
  value: unknown,
  firstKey: string,
  secondKey: string,
): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const first = value[firstKey];
  if (!isRecord(first)) {
    return undefined;
  }
  const nested = first[secondKey];
  return typeof nested === "string" ? nested : undefined;
}

export function normalizeLyricLookupText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/([\p{Script=Han}々〆ヶ])[（(][ぁ-ゖァ-ヺー]+[）)]/gu, "$1")
    .replace(/[\s\p{P}\p{S}]/gu, "")
    .toLowerCase();
}

function normalizeComparable(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

function normalizeTitle(value: string): string {
  return normalizeComparable(
    value.replace(/[（([]\s*(?:feat\.?|ft\.?|with)\s+.*?[）)\]]/giu, ""),
  );
}

export function parseTimestampedLyrics(value: string): TimestampedLine[] {
  const lines: TimestampedLine[] = [];

  for (const rawLine of value.split(/\r?\n/)) {
    const match = rawLine.trim().match(/^\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\](.*)$/u);
    if (!match) {
      continue;
    }

    const minutes = Number(match[1]);
    const seconds = Number(match[2]);
    const text = (match[3] ?? "").trim();
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || !text) {
      continue;
    }

    lines.push({
      startTimeMs: Math.round((minutes * 60 + seconds) * 1000),
      text,
    });
  }

  return lines;
}

function findClosestLine(
  lines: TimestampedLine[],
  startTimeMs: number,
): TimestampedLine | undefined {
  let best: TimestampedLine | undefined;
  let bestDifference = Number.POSITIVE_INFINITY;

  for (const line of lines) {
    const difference = Math.abs(line.startTimeMs - startTimeMs);
    if (difference < bestDifference) {
      best = line;
      bestDifference = difference;
    }
  }

  return bestDifference <= MAX_TIMESTAMP_DIFFERENCE_MS ? best : undefined;
}

export function romanizationToHiragana(value: string): string | null {
  const compact = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’]/gu, "'")
    .replace(/[^a-zぁ-ゖァ-ヺー'\-]+/gu, "");

  if (!compact) {
    return null;
  }

  const converted = toHiragana(compact, { passRomaji: false });
  return /^[ぁ-ゖーゝゞ]+$/u.test(converted) ? converted : null;
}

export function buildOnlineReadingIndex(
  lyrics: string,
  romanizedLyrics: string,
): OnlineReadingIndex {
  const lyricLines = parseTimestampedLyrics(lyrics);
  const romanizedLines = parseTimestampedLyrics(romanizedLyrics);
  const readings: OnlineReadingIndex = {};

  for (const lyricLine of lyricLines) {
    if (!/[\p{Script=Han}々〆ヶ]/u.test(lyricLine.text)) {
      continue;
    }

    const romanizedLine = findClosestLine(romanizedLines, lyricLine.startTimeMs);
    if (!romanizedLine || !romanizationToHiragana(romanizedLine.text)) {
      continue;
    }

    const key = normalizeLyricLookupText(lyricLine.text);
    if (key && !(key in readings)) {
      readings[key] = romanizedLine.text;
    }
  }

  return readings;
}

function getArtistNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((artist): artist is string => typeof artist === "string");
}

function getMusicBrainzNames(artist: MusicBrainzArtist): string[] {
  const names: string[] = [];
  if (typeof artist.name === "string") {
    names.push(artist.name);
  }
  if (typeof artist["sort-name"] === "string") {
    names.push(artist["sort-name"]);
  }
  if (Array.isArray(artist.aliases)) {
    for (const alias of artist.aliases) {
      if (isRecord(alias) && typeof alias.name === "string") {
        names.push(alias.name);
      }
    }
  }
  return names;
}

export function getVerifiedArtistAliases(
  response: unknown,
  expectedArtist: string,
): string[] {
  if (!isRecord(response) || !Array.isArray(response.artists)) {
    return [];
  }

  const expected = normalizeComparable(expectedArtist);
  for (const candidate of response.artists as MusicBrainzArtist[]) {
    if (!isRecord(candidate)) {
      continue;
    }
    const score = Number(candidate.score);
    if (!Number.isFinite(score) || score < 95) {
      continue;
    }

    const names = getMusicBrainzNames(candidate);
    if (!names.some((name) => normalizeComparable(name) === expected)) {
      continue;
    }

    return Array.from(
      new Set(names.map((name) => name.trim()).filter(Boolean)),
    );
  }

  return [];
}

async function fetchVerifiedArtistAliases(
  artist: string,
  request: JsonRequest,
): Promise<string[]> {
  const key = normalizeComparable(artist);
  const cached = artistAliasCache.get(key);
  if (cached) {
    return cached;
  }

  const url =
    `${MUSICBRAINZ_ARTIST_ENDPOINT}?query=${encodeURIComponent(artist)}` +
    "&fmt=json&limit=5";
  const response = await request(url, {
    "User-Agent":
      "FuriganaForSpotify/0.6.0 (https://github.com/huiishan99/spotify-furigana)",
  });
  const aliases = getVerifiedArtistAliases(response, artist);
  if (aliases.length > 0) {
    artistAliasCache.set(key, aliases);
  }
  return aliases;
}

function selectSearchCandidates(
  candidates: SearchCandidate[],
  track: OnlineTrackMetadata,
  artistAliases: string[] = [],
): SearchCandidate[] {
  const expectedTitle = normalizeTitle(track.title);
  const expectedArtists = new Set(
    [track.artist, ...artistAliases].map(normalizeComparable).filter(Boolean),
  );
  const expectedAlbum = normalizeComparable(track.album);
  const matches: Array<{ candidate: SearchCandidate; score: number }> = [];
  const seenProviderIds = new Set<string>();

  for (const candidate of candidates) {
    if (typeof candidate.name !== "string") {
      continue;
    }

    const candidateTitle = normalizeTitle(candidate.name);
    if (!candidateTitle || candidateTitle !== expectedTitle) {
      continue;
    }

    const artists = getArtistNames(candidate.artist).map(normalizeComparable);
    const artistMatches = artists.some((artist) => expectedArtists.has(artist));
    if (!artistMatches) {
      continue;
    }

    let score = 90;
    const candidateAlbum =
      typeof candidate.album === "string"
        ? normalizeComparable(candidate.album)
        : "";
    if (expectedAlbum && candidateAlbum === expectedAlbum) {
      score += 20;
    }

    const providerTrackId = String(candidate.lyric_id ?? candidate.id ?? "");
    if (!providerTrackId || seenProviderIds.has(providerTrackId)) {
      continue;
    }
    seenProviderIds.add(providerTrackId);
    matches.push({ candidate, score });
  }

  return matches
    .sort((left, right) => right.score - left.score)
    .map(({ candidate }) => candidate);
}

export function selectBestSearchCandidate(
  candidates: SearchCandidate[],
  track: OnlineTrackMetadata,
  artistAliases: string[] = [],
): SearchCandidate | null {
  return selectSearchCandidates(candidates, track, artistAliases)[0] ?? null;
}

export async function fetchOnlineReadingResult(
  track: OnlineTrackMetadata,
  request: JsonRequest,
): Promise<OnlineReadingResult | null> {
  const query = encodeURIComponent(`${track.title} ${track.artist}`);
  const searchUrl = `${SEARCH_ENDPOINT}?types=search&source=netease&name=${query}&count=20`;
  const searchResponse = await request(searchUrl);
  if (!Array.isArray(searchResponse)) {
    return null;
  }

  let candidates = selectSearchCandidates(
    searchResponse as SearchCandidate[],
    track,
  );
  if (candidates.length === 0) {
    try {
      const aliases = await fetchVerifiedArtistAliases(track.artist, request);
      candidates = selectSearchCandidates(
        searchResponse as SearchCandidate[],
        track,
        aliases,
      );
    } catch (error: unknown) {
      console.warn(
        "[Furigana for Spotify] Artist alias verification was unavailable.",
        error,
      );
    }
  }

  for (const candidate of candidates.slice(0, MAX_LYRIC_CANDIDATE_ATTEMPTS)) {
    const providerTrackId = String(candidate.lyric_id ?? candidate.id ?? "");
    if (!providerTrackId || !/^\d+$/u.test(providerTrackId)) {
      continue;
    }

    const lyricUrl =
      `${NETEASE_LYRIC_ENDPOINT}?os=pc&id=${encodeURIComponent(providerTrackId)}` +
      "&lv=-1&kv=-1&tv=-1&rv=-1";
    const lyricResponse = await request(lyricUrl);
    const lyrics = getNestedString(lyricResponse, "lrc", "lyric");
    const romanizedLyrics = getNestedString(
      lyricResponse,
      "romalrc",
      "lyric",
    );
    if (!lyrics || !romanizedLyrics) {
      continue;
    }

    const readings = buildOnlineReadingIndex(lyrics, romanizedLyrics);
    if (Object.keys(readings).length === 0) {
      continue;
    }

    return {
      provider: "netease",
      providerTrackId,
      readings,
    };
  }

  return null;
}

function createEmptyCache(): CacheDocument {
  return { version: 1, entries: {} };
}

function readCache(storage: StorageAdapter): CacheDocument {
  const raw = storage.get(ONLINE_CACHE_KEY);
  if (!raw) {
    return createEmptyCache();
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      !isRecord(parsed.entries)
    ) {
      return createEmptyCache();
    }
    return parsed as unknown as CacheDocument;
  } catch {
    return createEmptyCache();
  }
}

export function getCachedOnlineReading(
  storage: StorageAdapter,
  trackUri: string,
  now = Date.now(),
): CachedOnlineReading {
  const entry = readCache(storage).entries[trackUri];
  if (!entry || entry.expiresAt <= now) {
    return { found: false, result: null };
  }
  return { found: true, result: entry.result };
}

export function setCachedOnlineReading(
  storage: StorageAdapter,
  trackUri: string,
  result: OnlineReadingResult | null,
  now = Date.now(),
): void {
  const cache = readCache(storage);
  const validEntries = Object.entries(cache.entries)
    .filter(([, entry]) => entry.expiresAt > now)
    .sort(([, left], [, right]) => right.storedAt - left.storedAt)
    .slice(0, MAX_CACHE_ENTRIES - 1);

  cache.entries = Object.fromEntries(validEntries);
  cache.entries[trackUri] = {
    storedAt: now,
    expiresAt:
      now + (result ? POSITIVE_CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS),
    result,
  };
  storage.set(ONLINE_CACHE_KEY, JSON.stringify(cache));
}

export function clearOnlineReadingCache(storage: StorageAdapter): void {
  storage.set(ONLINE_CACHE_KEY, JSON.stringify(createEmptyCache()));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isKana(value: string): boolean {
  return /^[ぁ-ゖァ-ヺー]+$/u.test(value);
}

function anchorAlternatives(value: string): string[] {
  const hiragana = toHiragana(value);
  const alternatives = new Set([hiragana]);
  const particleVariants: Record<string, string> = {
    は: "わ",
    へ: "え",
    を: "お",
  };

  for (let index = 0; index < hiragana.length; index += 1) {
    const character = hiragana[index];
    if (!character) {
      continue;
    }
    const replacement = particleVariants[character];
    if (!replacement) {
      continue;
    }
    for (const current of Array.from(alternatives)) {
      alternatives.add(
        `${current.slice(0, index)}${replacement}${current.slice(index + 1)}`,
      );
    }
  }

  return Array.from(alternatives);
}

function displayReading(value: string, mode: ReadingMode): string {
  if (mode === "katakana") {
    return toKatakana(value);
  }
  if (mode === "romaji") {
    return toRomaji(value);
  }
  return value;
}

interface SurfaceSegment {
  kind: "anchor" | "other";
  text: string;
}

function splitSurface(value: string): SurfaceSegment[] {
  const segments: SurfaceSegment[] = [];
  for (const character of value) {
    const kind = isKana(character) ? "anchor" : "other";
    const previous = segments.at(-1);
    if (previous?.kind === kind) {
      previous.text += character;
    } else {
      segments.push({ kind, text: character });
    }
  }
  return segments;
}

function findAnchor(
  reading: string,
  cursor: number,
  anchor: string,
): { index: number; length: number } | null {
  let best: { index: number; length: number } | null = null;
  for (const alternative of anchorAlternatives(anchor)) {
    const index = reading.indexOf(alternative, cursor);
    if (index >= 0 && (!best || index < best.index)) {
      best = { index, length: alternative.length };
    }
  }
  return best;
}

export function convertSungReadingToFurigana(
  source: string,
  romanization: string,
  mode: ReadingMode,
): string | null {
  if (/[A-Za-z]/u.test(source)) {
    return null;
  }

  const reading = romanizationToHiragana(romanization);
  if (!reading) {
    return null;
  }

  const segments = splitSurface(source);
  const output: string[] = [];
  let cursor = 0;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment) {
      continue;
    }
    if (segment.kind === "anchor") {
      const match = findAnchor(reading, cursor, segment.text);
      if (!match || match.index !== cursor) {
        return null;
      }
      output.push(escapeHtml(segment.text));
      cursor += match.length;
      continue;
    }

    if (!/[\p{Script=Han}々〆ヶ0-9０-９]/u.test(segment.text)) {
      output.push(escapeHtml(segment.text));
      continue;
    }

    const nextAnchor = segments
      .slice(index + 1)
      .find((candidate) => candidate.kind === "anchor");
    const nextMatch = nextAnchor
      ? findAnchor(reading, cursor, nextAnchor.text)
      : { index: reading.length, length: 0 };
    if (!nextMatch || nextMatch.index <= cursor) {
      return null;
    }

    const segmentReading = reading.slice(cursor, nextMatch.index);
    output.push(
      `<ruby>${escapeHtml(segment.text)}<rp>(</rp><rt>${escapeHtml(displayReading(segmentReading, mode))}</rt><rp>)</rp></ruby>`,
    );
    cursor = nextMatch.index;
  }

  return cursor === reading.length ? output.join("") : null;
}

export function findOnlineRomanization(
  readings: OnlineReadingIndex | undefined,
  lyricText: string,
): string | undefined {
  if (!readings) {
    return undefined;
  }
  return readings[normalizeLyricLookupText(lyricText)];
}
