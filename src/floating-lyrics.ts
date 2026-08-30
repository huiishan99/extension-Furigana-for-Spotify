import { LYRIC_SELECTOR } from "./lyrics";
import { DEFAULT_SETTINGS, SETTING_RANGES } from "./settings";

export const DESKTOP_OVERLAY_URL = "http://127.0.0.1:43841/state";

export const CURRENT_LYRIC_SELECTORS = [
  ".lyrics-lyricsContent-active .lyrics-lyricsContent-text",
  '[data-testid="lyrics-line"][aria-current="true"]',
  '[data-testid="lyrics-line"][data-active="true"]',
  '[class*="lyricsContent-active"] [class*="lyricsContent-text"]',
  ".lyrics-lyricsContent-active",
] as const;

export interface TimedLyricLine {
  startTimeMs: number;
  words: string;
}

export interface DesktopLyricSegment {
  text: string;
  reading?: string;
}

export interface DesktopOverlayState {
  version: 1;
  enabled: boolean;
  segments: DesktopLyricSegment[];
  nextSegments: DesktopLyricSegment[];
  currentFontSize: number;
  nextFontSize: number;
}

export async function publishDesktopLyricPairProgressively(
  currentSegmentsPromise: Promise<readonly DesktopLyricSegment[]>,
  nextSegmentsPromise: Promise<readonly DesktopLyricSegment[]>,
  resolvedNextSegments: readonly DesktopLyricSegment[] | undefined,
  canPublish: () => boolean,
  publish: (
    currentSegments: readonly DesktopLyricSegment[],
    nextSegments: readonly DesktopLyricSegment[],
  ) => void,
  previewGraceMs = 16,
): Promise<void> {
  const currentSegments = await currentSegmentsPromise;
  if (!canPublish()) {
    return;
  }

  if (resolvedNextSegments !== undefined) {
    publish(currentSegments, resolvedNextSegments);
    return;
  }

  let graceTimer: number | undefined;
  const nextWithinGrace = await Promise.race([
    nextSegmentsPromise,
    new Promise<undefined>((resolve) => {
      graceTimer = setTimeout(resolve, Math.max(0, previewGraceMs));
    }),
  ]);
  if (graceTimer !== undefined) {
    clearTimeout(graceTimer);
  }
  if (!canPublish()) {
    return;
  }
  if (nextWithinGrace !== undefined) {
    publish(currentSegments, nextWithinGrace);
    return;
  }

  publish(currentSegments, []);
  const nextSegments = await nextSegmentsPromise;
  if (canPublish()) {
    publish(currentSegments, nextSegments);
  }
}

export interface TimedLyricContext {
  current: TimedLyricLine;
  next: TimedLyricLine | null;
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
  return findTimedLyricContext(lines, progressMs)?.current ?? null;
}

export function findTimedLyricContext(
  lines: readonly TimedLyricLine[],
  progressMs: number,
): TimedLyricContext | null {
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

  if (currentIndex < 0) {
    return null;
  }
  return {
    current: lines[currentIndex]!,
    next: lines[currentIndex + 1] ?? null,
  };
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

function appendSegment(
  segments: DesktopLyricSegment[],
  text: string,
  reading?: string,
): void {
  const normalizedText = text.replace(/\s+/gu, " ");
  const normalizedReading = reading?.replace(/\s+/gu, " ").trim();
  if (!normalizedText) {
    return;
  }

  const previous = segments.at(-1);
  if (!normalizedReading && previous && !previous.reading) {
    previous.text += normalizedText;
    return;
  }
  segments.push(
    normalizedReading
      ? { text: normalizedText, reading: normalizedReading }
      : { text: normalizedText },
  );
}

function elementTagName(node: Node): string {
  return "tagName" in node
    ? String((node as Element).tagName).toLowerCase()
    : "";
}

export function extractDesktopLyricSegments(
  root: Pick<ParentNode, "childNodes">,
): DesktopLyricSegment[] {
  const segments: DesktopLyricSegment[] = [];

  const visit = (node: Node): void => {
    if (node.nodeType === 3) {
      appendSegment(segments, node.textContent ?? "");
      return;
    }

    const tagName = elementTagName(node);
    if (tagName === "rt" || tagName === "rp") {
      return;
    }
    if (tagName === "ruby") {
      let base = "";
      let reading = "";
      for (const child of node.childNodes) {
        const childTagName = elementTagName(child);
        if (childTagName === "rt") {
          reading += child.textContent ?? "";
        } else if (childTagName !== "rp") {
          base += child.textContent ?? "";
        }
      }
      appendSegment(segments, base, reading);
      return;
    }

    for (const child of node.childNodes) {
      visit(child);
    }
  };

  for (const child of root.childNodes) {
    visit(child);
  }
  return segments;
}

export function createDesktopOverlayState(
  enabled: boolean,
  segments: readonly DesktopLyricSegment[] = [],
  nextSegments: readonly DesktopLyricSegment[] = [],
  currentFontSize = DEFAULT_SETTINGS.floatingCurrentSize,
  nextFontSize = DEFAULT_SETTINGS.floatingNextSize,
): DesktopOverlayState {
  const sanitize = (
    values: readonly DesktopLyricSegment[],
  ): DesktopLyricSegment[] =>
    values
      .slice(0, 128)
      .map(({ text, reading }) => ({
        text: text.slice(0, 512),
        ...(reading ? { reading: reading.slice(0, 512) } : {}),
      }))
      .filter(({ text }) => text.length > 0);
  const normalizeFontSize = (
    value: number,
    fallback: number,
    range: { min: number; max: number },
  ): number =>
    Number.isFinite(value)
      ? Math.min(range.max, Math.max(range.min, value))
      : fallback;

  return {
    version: 1,
    enabled,
    segments: enabled ? sanitize(segments) : [],
    nextSegments: enabled ? sanitize(nextSegments) : [],
    currentFontSize: normalizeFontSize(
      currentFontSize,
      DEFAULT_SETTINGS.floatingCurrentSize,
      SETTING_RANGES.floatingCurrentSize,
    ),
    nextFontSize: normalizeFontSize(
      nextFontSize,
      DEFAULT_SETTINGS.floatingNextSize,
      SETTING_RANGES.floatingNextSize,
    ),
  };
}

export function sendDesktopOverlayState(state: DesktopOverlayState): void {
  void fetch(DESKTOP_OVERLAY_URL, {
    method: "POST",
    mode: "no-cors",
    body: JSON.stringify(state),
  }).catch(() => {
    // The native overlay is optional and may not be running when Spotify's
    // regular shortcut is used. Retry on the next state change without noise.
  });
}
