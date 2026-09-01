import Kuroshiro from "kuroshiro";
import KuromojiAnalyzer from "kuroshiro-analyzer-kuromoji";
import { protectLocalReadings } from "./local-readings";
import { convertSungReadingToFurigana } from "./online-readings";
import type { ReadingMode } from "./settings";

let enginePromise: Promise<Kuroshiro> | undefined;
let activeDictionaryPath: string | undefined;

async function createEngine(dictionaryPath: string): Promise<Kuroshiro> {
  const engine = new Kuroshiro();
  await engine.init(new KuromojiAnalyzer({ dictPath: dictionaryPath }));
  return engine;
}

function getEngine(dictionaryPath: string): Promise<Kuroshiro> {
  if (activeDictionaryPath !== dictionaryPath) {
    activeDictionaryPath = dictionaryPath;
    enginePromise = undefined;
  }

  enginePromise ??= createEngine(dictionaryPath).catch((error: unknown) => {
    enginePromise = undefined;
    throw error;
  });

  return enginePromise;
}

export async function convertToFurigana(
  value: string,
  dictionaryPath: string,
  readingMode: ReadingMode = "hiragana",
  sungRomanization?: string,
): Promise<string> {
  if (sungRomanization) {
    const aligned = convertSungReadingToFurigana(value, sungRomanization, readingMode);
    if (aligned) {
      return aligned;
    }
  }

  const engine = await getEngine(dictionaryPath);
  const protectedReadings = protectLocalReadings(value, readingMode);
  const converted = await engine.convert(protectedReadings.value, {
    mode: "furigana",
    to: readingMode,
  });
  return protectedReadings.restore(converted);
}

export function createSafeFuriganaFragment(
  convertedHtml: string,
  targetDocument: Document,
): DocumentFragment {
  const parsed = new DOMParser().parseFromString(convertedHtml, "text/html");
  const fragment = targetDocument.createDocumentFragment();

  for (const child of parsed.body.childNodes) {
    appendSafeNode(child, fragment, targetDocument);
  }

  return fragment;
}

function appendSafeNode(source: Node, destination: Node, targetDocument: Document): void {
  if (source.nodeType === Node.TEXT_NODE) {
    destination.appendChild(targetDocument.createTextNode(source.textContent ?? ""));
    return;
  }

  if (!(source instanceof Element)) {
    return;
  }

  const tagName = source.tagName.toLowerCase();
  if (tagName !== "ruby" && tagName !== "rt" && tagName !== "rp") {
    destination.appendChild(targetDocument.createTextNode(source.textContent ?? ""));
    return;
  }

  const element = targetDocument.createElement(tagName);
  if (tagName === "ruby") {
    element.className = "spotify-furigana__ruby";
  }

  for (const child of source.childNodes) {
    appendSafeNode(child, element, targetDocument);
  }

  destination.appendChild(element);
}
