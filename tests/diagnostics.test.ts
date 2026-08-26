import { describe, expect, it } from "vitest";
import {
  createRuntimeDiagnostics,
  formatRuntimeDiagnostics,
  RUNTIME_DIAGNOSTICS_EVENT,
  RUNTIME_DIAGNOSTICS_KEY,
} from "../src/diagnostics";

const input = {
  appVersion: "0.5.1",
  spicetifyVersion: "2.44.0",
  platform: "Win32",
  uiLanguage: "en" as const,
  enabled: true,
  readingMode: "hiragana" as const,
  onlineReadings: true,
  floatingLyrics: false,
  onlineStatus: {
    state: "ready" as const,
    code: "matched" as const,
    count: 35,
  },
  trackAvailable: true,
  selectorCounts: [
    { selector: ".lyrics-lyricsContent-text", count: 32 },
    { selector: '[data-testid="lyrics-line"]', count: 0 },
  ],
  annotatedLines: 32,
  pendingLines: 0,
  engineState: "ready" as const,
};

describe("privacy-safe runtime diagnostics", () => {
  it("creates a stable report with useful runtime and selector state", () => {
    const diagnostics = createRuntimeDiagnostics(
      input,
      "2026-08-26T00:00:00.000Z",
    );

    expect(diagnostics.schemaVersion).toBe(1);
    expect(diagnostics.report).toContain("App version: 0.5.1");
    expect(diagnostics.report).toContain("Floating lyrics enabled: no");
    expect(diagnostics.report).toContain("Online status: matched (35 matched lines)");
    expect(diagnostics.report).toContain(
      "  .lyrics-lyricsContent-text: 32",
    );
    expect(formatRuntimeDiagnostics(diagnostics)).toBe(diagnostics.report);
  });

  it("contains no fields for track identity, lyrics, accounts, or credentials", () => {
    const serialized = JSON.stringify(createRuntimeDiagnostics(input)).toLowerCase();

    for (const forbidden of [
      '"title"',
      '"artist"',
      '"uri"',
      '"lyrics"',
      '"account"',
      '"credential"',
      '"cookie"',
      '"token"',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(serialized).toContain("contains no track title");
  });

  it("uses versioned storage and event names", () => {
    expect(RUNTIME_DIAGNOSTICS_KEY).toBe(
      "spotify-furigana:runtime-diagnostics-v1",
    );
    expect(RUNTIME_DIAGNOSTICS_EVENT).toBe(
      "spotify-furigana:runtime-diagnostics-change",
    );
  });
});
