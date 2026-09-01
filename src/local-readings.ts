import { toKatakana, toRomaji } from "wanakana";
import type { ReadingMode } from "./settings";

const PEOPLE_COUNTER_PATTERN =
  /(?<![〇零一二三四五六七八九十百千万億兆壱弐参0-9０-９])(?:(?:一人|1人|１人)(?!称|前)|(?:二人|2人|２人)(?!称|前|羽織|三脚))/gu;

interface LocalReadingReplacement {
  token: string;
  surface: string;
  reading: string;
}

export interface ProtectedLocalReadings {
  value: string;
  restore(convertedHtml: string): string;
}

function getPeopleCounterReading(surface: string): string {
  return /^[一1１]/u.test(surface) ? "ひとり" : "ふたり";
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

function renderRuby(surface: string, reading: string, mode: ReadingMode): string {
  return `<ruby>${surface}<rp>(</rp><rt>${displayReading(reading, mode)}</rt><rp>)</rp></ruby>`;
}

export function protectLocalReadings(value: string, mode: ReadingMode): ProtectedLocalReadings {
  const replacements: LocalReadingReplacement[] = [];
  let tokenSequence = 0;

  const protectedValue = value.replace(PEOPLE_COUNTER_PATTERN, (surface: string) => {
    let token: string;
    do {
      token = `SPOTIFYFURIGANALOCAL${tokenSequence}TOKEN`;
      tokenSequence += 1;
    } while (value.includes(token));

    replacements.push({
      token,
      surface,
      reading: getPeopleCounterReading(surface),
    });
    return token;
  });

  return {
    value: protectedValue,
    restore(convertedHtml: string): string {
      return replacements.reduce(
        (html, replacement) =>
          html.replaceAll(
            replacement.token,
            renderRuby(replacement.surface, replacement.reading, mode),
          ),
        convertedHtml,
      );
    },
  };
}
