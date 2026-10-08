import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const canonical = "https://github.com/huiishan99/extension-Furigana-for-Spotify";
const acceptedUrls = [`${canonical}/releases/tag/v0.6.3`, `${canonical}/releases/tag/v0.6.3/`];
const rejectedUrls = [
  "https://github.com/huiishan99/spotify-furigana/releases/tag/v0.6.3",
  "https://github.com/another-owner/extension-Furigana-for-Spotify/releases/tag/v0.6.3",
  "https://github.com/huiishan99/another-repository/releases/tag/v0.6.3",
  "https://github.com.evil.example/huiishan99/extension-Furigana-for-Spotify/releases/tag/v0.6.3",
  "https://github.com@evil.example/huiishan99/extension-Furigana-for-Spotify/releases/tag/v0.6.3",
  "http://github.com/huiishan99/extension-Furigana-for-Spotify/releases/tag/v0.6.3",
  `${canonical}/releases/tag/v0.6.3?download=1`,
  `${canonical}/releases/tag/v0.6.3#fragment`,
  `${canonical}/releases/tag/v0.6.3-rc.1`,
  `${canonical}/releases/tag/v0.6.3+build.1`,
  `${canonical}/releases/tag/v0.6.3/extra`,
  `${canonical}/releases/tag/v0.6.3//`,
  "https://github.com/huiishan99/extension-furigana-for-spotify/releases/tag/v0.6.3",
  `${canonical}/releases/tag/v0.6.3\nextra`,
  `${canonical}/releases/tag/v0.6.3%0a`,
  `${canonical}/releases/tag/V0.6.3`,
  `${canonical}/releases/tag/v999.0.0/../../v0.6.3`,
];
const powerShellCommands = process.platform === "win32" ? ["powershell.exe", "pwsh.exe"] : ["pwsh"];

for (const command of powerShellCommands) {
  const available =
    spawnSync(command, ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"], {
      encoding: "utf8",
      windowsHide: true,
    }).status === 0;
  describe(`Windows updater policy (${command})`, () => {
    it.runIf(available)("validates production redirects using the actual launcher function", () => {
      const result = spawnSync(
        command,
        ["-NoProfile", "-File", resolve(projectRoot, "tests", "updater-policy.test.ps1")],
        { encoding: "utf8", windowsHide: true },
      );
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      expect(result.stdout).toContain("Updater release-policy tests passed.");
    });

    it.runIf(available)(
      "rejects custom update sources before resolving or launching Spotify",
      () => {
        const result = spawnSync(
          command,
          [
            "-NoProfile",
            "-File",
            resolve(projectRoot, "packaging", "launcher.ps1"),
            "-SkipUpdateCheck",
            "-ReleaseLatestUrl",
            "https://example.com/releases/latest",
          ],
          {
            env: { ...process.env, SPOTIFY_FURIGANA_TEST_MODE: "0" },
            encoding: "utf8",
            windowsHide: true,
          },
        );
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain("Custom update sources are available only in test mode.");
      },
    );
  });
}

describe("canonical release sources", () => {
  it("pins both launcher defaults and the canary to the current repository", async () => {
    for (const path of [
      "packaging/launcher.ps1",
      "packaging/launcher.sh",
      ".github/workflows/compatibility-canary.yml",
    ]) {
      const content = await readFile(resolve(projectRoot, path), "utf8");
      expect(content).toContain(`${canonical}/releases/latest`);
      expect(content).not.toContain("huiishan99/spotify-furigana");
    }
  });

  it("keeps the canary URL allowlist anchored, case-sensitive, and repository-specific", async () => {
    const workflow = await readFile(
      resolve(projectRoot, ".github/workflows/compatibility-canary.yml"),
      "utf8",
    );
    const policy = workflow.match(/\$resolvedUrl -cnotmatch '([^']+)'/u)?.[1];
    expect(policy).toBeDefined();
    expect(policy?.startsWith("\\A")).toBe(true);
    expect(policy?.endsWith("\\z")).toBe(true);
    // Translate the .NET absolute anchors; require the complete match in JS too.
    const regex = new RegExp((policy ?? "").replace(/^\\A/u, "^").replace(/\\z$/u, "$"), "u");
    const accepts = (url: string) => regex.exec(url)?.[0] === url;
    for (const url of acceptedUrls) expect(accepts(url), url).toBe(true);
    for (const url of rejectedUrls) expect(accepts(url), url).toBe(false);
  });

  it("keeps package and lockfile versions consistent", async () => {
    const pkg = JSON.parse(await readFile(resolve(projectRoot, "package.json"), "utf8"));
    const lock = JSON.parse(await readFile(resolve(projectRoot, "package-lock.json"), "utf8"));
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/u);
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages[""].version).toBe(pkg.version);
  });
});

describe("macOS updater production URL policy", () => {
  it.runIf(process.platform !== "win32")(
    "accepts canonical stable tags and rejects hostile redirects before downloads",
    async () => {
      const testRoot = await mkdtemp(resolve(tmpdir(), "furigana-url-policy-"));
      try {
        const launcher = await readFile(resolve(projectRoot, "packaging/launcher.sh"), "utf8");
        const boundary = "\nspicetify_executable=$(resolve_spicetify)";
        expect(launcher).toContain(boundary);
        const functionsOnly = launcher.slice(0, launcher.indexOf(boundary));
        const versionFile = resolve(testRoot, "version.txt");
        await writeFile(versionFile, "0.6.3\n");
        const script = resolve(testRoot, "policy.sh");
        await writeFile(
          script,
          `${functionsOnly}\n
version_file=$POLICY_VERSION_FILE
log_update() { printf '%s\\n' "$1"; }
curl() {
  if [ "$1" != "-fsSL" ]; then
    printf '%s\\n' 'Unexpected download request' >&2
    return 91
  fi
  printf '%s' "$POLICY_RESOLVED_URL"
}
shasum() { return 92; }
unzip() { return 93; }
perform_update_check
`,
        );
        for (const url of [...acceptedUrls, ...rejectedUrls]) {
          const result = spawnSync("sh", [script], {
            encoding: "utf8",
            env: {
              ...process.env,
              HOME: testRoot,
              SPOTIFY_FURIGANA_TEST_MODE: "0",
              POLICY_VERSION_FILE: versionFile,
              POLICY_RESOLVED_URL: url,
            },
          });
          const context = `${url}\n${result.stdout}\n${result.stderr}`;
          if (acceptedUrls.includes(url)) {
            expect(result.status, context).toBe(0);
            expect(result.stdout).toContain("No update available (installed 0.6.3, latest 0.6.3).");
          } else {
            expect(result.status, context).toBe(1);
            expect(result.stdout, context).toMatch(
              /outside the expected GitHub repository|unsupported release/,
            );
          }
          expect(result.stderr, context).not.toContain("Unexpected download");
        }
      } finally {
        await rm(testRoot, { recursive: true, force: true });
      }
    },
  );
});
