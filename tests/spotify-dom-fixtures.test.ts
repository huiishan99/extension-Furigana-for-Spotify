import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findCurrentLyricLine } from "../src/floating-lyrics";
import { LYRIC_SELECTOR } from "../src/lyrics";

const fixtureRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "spotify-dom",
);

async function loadFixture(name: string) {
  const html = await readFile(resolve(fixtureRoot, name), "utf8");
  return parseHTML(html);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Spotify DOM compatibility fixtures", () => {
  it.each([
    "current-desktop.html",
    "legacy-standard.html",
    "legacy-fullscreen.html",
    "generated-classes.html",
  ])("discovers lyric lines in %s", async (fixture) => {
    const { document } = await loadFixture(fixture);
    const lines = [...document.querySelectorAll(LYRIC_SELECTOR)];

    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.textContent?.trim())).toEqual([
      "昨日までの僕ら",
      expect.stringContaining("二人"),
    ]);
  });

  it.each(["current-desktop.html", "legacy-standard.html"])(
    "finds the active lyric in %s",
    async (fixture) => {
      const { document, HTMLElement } = await loadFixture(fixture);
      vi.stubGlobal("HTMLElement", HTMLElement);

      const activeLine = findCurrentLyricLine(document);

      expect(activeLine?.textContent).toContain("二人");
    },
  );

  it("finds an active line when Spotify class names carry generated prefixes", async () => {
    const { document, HTMLElement } = await loadFixture(
      "generated-classes.html",
    );
    vi.stubGlobal("HTMLElement", HTMLElement);

    const activeLine = findCurrentLyricLine(document);

    expect(activeLine?.textContent).toContain("二人だけの空");
  });
});
