import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("Spotify runtime observation", () => {
  it("survives Spotify replacing the body during startup or navigation", async () => {
    const extension = await readFile(resolve(projectRoot, "src", "extension.ts"), "utf8");

    expect(extension).toContain("observer.observe(document.documentElement");
    expect(extension).not.toContain("observer.observe(document.body");
    expect(extension).toContain('attributeFilter: ["class", "aria-current", "data-active"]');
  });

  it("does not pause lyric scans when Spotify marks its page as hidden", async () => {
    const extension = await readFile(resolve(projectRoot, "src", "extension.ts"), "utf8");

    expect(extension).toContain("scanTimer = window.setTimeout(scan, 0)");
    expect(extension).toContain(
      "diagnosticsTimer = window.setTimeout(publishRuntimeDiagnostics, 0)",
    );
    expect(extension).not.toContain("requestAnimationFrame(");
  });

  it("uses player progress events when background timers are throttled", async () => {
    const extension = await readFile(resolve(projectRoot, "src", "extension.ts"), "utf8");

    expect(extension).toContain('Spicetify.Player.addEventListener("onprogress"');
    expect(extension).toContain("updateFloatingLyrics(");
    expect(extension).toContain("floatingLyricsTimer = window.setInterval(");
  });
});
