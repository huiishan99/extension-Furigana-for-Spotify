import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const powerShell = process.platform === "win32" ? "pwsh.exe" : "pwsh";
const probe = spawnSync(powerShell, ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"], {
  encoding: "utf8",
  windowsHide: true,
});
const hasPowerShell = probe.status === 0;

describe("native overlay core", () => {
  it.runIf(hasPowerShell)("parses protocol state and chooses lyric transitions", () => {
    const result = spawnSync(
      powerShell,
      ["-NoProfile", "-File", resolve(projectRoot, "tests", "overlay-core.test.ps1")],
      {
        cwd: projectRoot,
        encoding: "utf8",
        windowsHide: true,
      },
    );

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("Overlay core tests passed.");
  });
});
