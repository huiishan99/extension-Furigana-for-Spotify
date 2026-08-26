import { LYRIC_SELECTOR } from "./lyrics";

export const FLOATING_LYRICS_ID = "spotify-furigana-floating-lyrics";
export const FLOATING_LYRICS_POSITION_KEY =
  "spotify-furigana:floating-lyrics-position-v1";

export const CURRENT_LYRIC_SELECTORS = [
  ".lyrics-lyricsContent-active .lyrics-lyricsContent-text",
  '[data-testid="lyrics-line"][aria-current="true"]',
  '[data-testid="lyrics-line"][data-active="true"]',
  '[class*="lyricsContent-active"] [class*="lyricsContent-text"]',
  ".lyrics-lyricsContent-active",
] as const;

export interface FloatingLyricPosition {
  left: number;
  top: number;
}

export interface TimedLyricLine {
  startTimeMs: number;
  words: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export function getSpotifyLyricsUrl(trackUri: string): string | null {
  const match = /^spotify:track:([A-Za-z0-9]+)$/u.exec(trackUri);
  if (!match) {
    return null;
  }

  return `https://spclient.wg.spotify.com/color-lyrics/v2/track/${match[1]}?format=json&vocalRemoval=false&market=from_token`;
}

export function parseSpotifyTimedLyrics(value: unknown): TimedLyricLine[] {
  const lyrics = asRecord(asRecord(value)?.lyrics);
  if (lyrics?.syncType !== "LINE_SYNCED" || !Array.isArray(lyrics.lines)) {
    return [];
  }

  return lyrics.lines
    .map((line): TimedLyricLine | null => {
      const record = asRecord(line);
      const startTimeMs = Number(record?.startTimeMs);
      const words = typeof record?.words === "string" ? record.words.trim() : "";
      return Number.isFinite(startTimeMs) && startTimeMs >= 0 && words
        ? { startTimeMs, words }
        : null;
    })
    .filter((line): line is TimedLyricLine => line !== null)
    .sort((left, right) => left.startTimeMs - right.startTimeMs);
}

export function findTimedLyricLine(
  lines: readonly TimedLyricLine[],
  progressMs: number,
): TimedLyricLine | null {
  if (!Number.isFinite(progressMs) || lines.length === 0) {
    return null;
  }

  let low = 0;
  let high = lines.length - 1;
  let currentIndex = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (lines[middle]!.startTimeMs <= progressMs) {
      currentIndex = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return currentIndex >= 0 ? (lines[currentIndex] ?? null) : null;
}

export function findCurrentLyricLine(
  root: Pick<ParentNode, "querySelector">,
): HTMLElement | null {
  for (const selector of CURRENT_LYRIC_SELECTORS) {
    const match = root.querySelector(selector);
    if (!(match instanceof HTMLElement)) {
      continue;
    }

    if (match.matches(LYRIC_SELECTOR)) {
      return match;
    }

    const nestedLine = match.querySelector<HTMLElement>(LYRIC_SELECTOR);
    if (nestedLine) {
      return nestedLine;
    }
  }

  return null;
}

export function parseFloatingLyricPosition(
  value: string | null,
): FloatingLyricPosition | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<FloatingLyricPosition>;
    if (Number.isFinite(parsed.left) && Number.isFinite(parsed.top)) {
      return { left: Number(parsed.left), top: Number(parsed.top) };
    }
  } catch {
    // Ignore stale or malformed local positions.
  }

  return null;
}

export function clampFloatingLyricPosition(
  position: FloatingLyricPosition,
  viewport: { width: number; height: number },
  card: { width: number; height: number },
  margin = 12,
): FloatingLyricPosition {
  const maxLeft = Math.max(margin, viewport.width - card.width - margin);
  const maxTop = Math.max(margin, viewport.height - card.height - margin);
  return {
    left: Math.min(maxLeft, Math.max(margin, position.left)),
    top: Math.min(maxTop, Math.max(margin, position.top)),
  };
}
