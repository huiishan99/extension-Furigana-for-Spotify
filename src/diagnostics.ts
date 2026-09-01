import type { OnlineReadingStatus } from "./online-readings";
import type { ReadingMode } from "./settings";
import type { UiLanguage } from "./ui-language";

export const RUNTIME_DIAGNOSTICS_KEY = "spotify-furigana:runtime-diagnostics-v1";
export const RUNTIME_DIAGNOSTICS_EVENT = "spotify-furigana:runtime-diagnostics-change";

export interface LyricSelectorCount {
  selector: string;
  count: number;
}

export interface RuntimeDiagnosticsInput {
  appVersion: string;
  spicetifyVersion: string;
  platform: string;
  uiLanguage: UiLanguage;
  enabled: boolean;
  readingMode: ReadingMode;
  onlineReadings: boolean;
  floatingLyrics: boolean;
  floatingCurrentSize: number;
  floatingNextSize: number;
  onlineStatus: Pick<OnlineReadingStatus, "state" | "code" | "count">;
  trackAvailable: boolean;
  selectorCounts: LyricSelectorCount[];
  annotatedLines: number;
  pendingLines: number;
  engineState: "ready" | "error";
}

export interface RuntimeDiagnostics extends RuntimeDiagnosticsInput {
  schemaVersion: 1;
  generatedAt: string;
  report: string;
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

export function formatRuntimeDiagnostics(diagnostics: Omit<RuntimeDiagnostics, "report">): string {
  const selectorLines = diagnostics.selectorCounts.map(
    ({ selector, count }) => `  ${selector}: ${count}`,
  );
  const onlineCount =
    typeof diagnostics.onlineStatus.count === "number"
      ? ` (${diagnostics.onlineStatus.count} matched lines)`
      : "";

  return [
    "Furigana for Spotify diagnostics",
    `Generated: ${diagnostics.generatedAt}`,
    `App version: ${diagnostics.appVersion}`,
    `Spicetify version: ${diagnostics.spicetifyVersion}`,
    `Platform: ${diagnostics.platform}`,
    `UI language: ${diagnostics.uiLanguage}`,
    `Enabled: ${yesNo(diagnostics.enabled)}`,
    `Reading mode: ${diagnostics.readingMode}`,
    `Online readings enabled: ${yesNo(diagnostics.onlineReadings)}`,
    `Floating lyrics enabled: ${yesNo(diagnostics.floatingLyrics)}`,
    `Floating current line size: ${diagnostics.floatingCurrentSize}px`,
    `Floating next line size: ${diagnostics.floatingNextSize}px`,
    `Online status: ${diagnostics.onlineStatus.code ?? diagnostics.onlineStatus.state}${onlineCount}`,
    `Spotify track available: ${yesNo(diagnostics.trackAvailable)}`,
    `Reading engine: ${diagnostics.engineState}`,
    `Annotated lyric lines: ${diagnostics.annotatedLines}`,
    `Pending lyric lines: ${diagnostics.pendingLines}`,
    "Lyric selector matches:",
    ...(selectorLines.length > 0 ? selectorLines : ["  none: 0"]),
    "Privacy: this report contains no track title, artist, URI, lyrics, account data, or credentials.",
  ].join("\n");
}

export function createRuntimeDiagnostics(
  input: RuntimeDiagnosticsInput,
  generatedAt = new Date().toISOString(),
): RuntimeDiagnostics {
  const diagnosticsWithoutReport: Omit<RuntimeDiagnostics, "report"> = {
    schemaVersion: 1,
    generatedAt,
    ...input,
  };
  return {
    ...diagnosticsWithoutReport,
    report: formatRuntimeDiagnostics(diagnosticsWithoutReport),
  };
}
