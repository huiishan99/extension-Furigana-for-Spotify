import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function runProcess(
  command: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return await new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(command, args, {
      env: environment,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", rejectProcess);
    child.on("close", (code) => resolveProcess({ code, stdout, stderr }));
  });
}

async function runWindowsUpdateScenario(
  mode: "valid" | "checksum-failure" | "offline",
): Promise<{
  installRan: boolean;
  launcherStateRoot: string;
  spicetifyWorkingDirectory: string;
  spicetifyLog: string;
  updateLog: string;
}> {
  const testRoot = await mkdtemp(resolve(tmpdir(), "spotify-furigana-updater-"));
  const installedRoot = resolve(testRoot, "installed", "spotify-furigana");
  const fakeBin = resolve(testRoot, "bin");
  const fakeHome = resolve(testRoot, "home");
  const fakeLocalAppData = resolve(testRoot, "local-app-data");
  const packageRoot = resolve(testRoot, "package");
  const packageApp = resolve(packageRoot, "spotify-furigana");
  const archiveName = "spotify-furigana-v0.5.0.zip";
  const archivePath = resolve(testRoot, archiveName);
  const zipScript = resolve(testRoot, "make-zip.ps1");
  const installMarker = resolve(testRoot, "install-ran.txt");
  const spicetifyLogPath = resolve(testRoot, "spicetify.log");

  await Promise.all([
    mkdir(installedRoot, { recursive: true }),
    mkdir(fakeBin, { recursive: true }),
    mkdir(fakeHome, { recursive: true }),
    mkdir(fakeLocalAppData, { recursive: true }),
    mkdir(packageApp, { recursive: true }),
  ]);
  await Promise.all([
    copyFile(
      resolve(projectRoot, "packaging", "launcher.ps1"),
      resolve(installedRoot, "launcher.ps1"),
    ),
    writeFile(resolve(installedRoot, "version.txt"), "0.4.0\n"),
    writeFile(resolve(packageApp, "manifest.json"), '{"name":"test"}\n'),
    writeFile(resolve(packageApp, "version.txt"), "0.5.0\n"),
    writeFile(
      resolve(packageRoot, "install.ps1"),
      [
        "[CmdletBinding()]",
        "param([switch]$NoLaunch)",
        "if (-not $NoLaunch) { exit 20 }",
        "[System.IO.File]::WriteAllText($env:UPDATE_INSTALL_MARKER, 'no-launch')",
        "",
      ].join("\r\n"),
    ),
    writeFile(
      resolve(fakeBin, "spicetify.cmd"),
      [
        "@echo off",
        'echo cwd=%CD% args=%*>>"%SPICETIFY_TEST_LOG%"',
        "exit /b 0",
        "",
      ].join("\r\n"),
    ),
    writeFile(
      zipScript,
      [
        "param([string]$Source, [string]$Destination)",
        "Compress-Archive -Path (Join-Path $Source '*') -DestinationPath $Destination -Force",
        "",
      ].join("\r\n"),
    ),
  ]);

  execFileSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    zipScript,
    packageRoot,
    archivePath,
  ]);
  const archive = await readFile(archivePath);
  const realHash = createHash("sha256").update(archive).digest("hex");
  const publishedHash = mode === "valid" ? realHash : "0".repeat(64);

  const server = createServer((request, response) => {
    const path = request.url ?? "";
    if (path === "/latest") {
      response.writeHead(302, { Location: "/releases/tag/v0.5.0" });
      response.end();
      return;
    }
    if (path === "/releases/tag/v0.5.0") {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end("release");
      return;
    }
    if (path.endsWith(`/${archiveName}`)) {
      response.writeHead(200, { "Content-Type": "application/zip" });
      response.end(archive);
      return;
    }
    if (path.endsWith(`/${archiveName}.sha256`)) {
      response.writeHead(200, { "Content-Type": "text/plain" });
      response.end(`${publishedHash}  ${archiveName}\n`);
      return;
    }
    response.writeHead(404);
    response.end();
  });

  let serverClosed = false;
  try {
    await new Promise<void>((resolveListen) => {
      server.listen(0, "127.0.0.1", resolveListen);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Test update server did not expose a TCP port.");
    }
    const releaseApiUrl = `http://127.0.0.1:${address.port}/latest`;
    const downloadBase = `http://127.0.0.1:${address.port}/download`;
    if (mode === "offline") {
      await new Promise<void>((resolveClose) =>
        server.close(() => resolveClose()),
      );
      serverClosed = true;
    }

    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      LOCALAPPDATA: fakeLocalAppData,
      SPICETIFY_TEST_LOG: spicetifyLogPath,
      SPOTIFY_FURIGANA_TEST_MODE: "1",
      UPDATE_INSTALL_MARKER: installMarker,
      USERPROFILE: fakeHome,
    };
    const inheritedPath = process.env.PATH ?? process.env.Path ?? "";
    for (const key of Object.keys(environment)) {
      if (key.toLowerCase() === "path") {
        delete environment[key];
      }
    }
    environment.Path = `${fakeBin};${inheritedPath}`;

    const result = await runProcess(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        resolve(installedRoot, "launcher.ps1"),
        "-UpdateIntervalHours",
        "0",
        "-ReleaseLatestUrl",
        releaseApiUrl,
        "-ReleaseDownloadBaseUrl",
        downloadBase,
      ],
      environment,
    );
    expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);

    let installRan = true;
    try {
      await access(installMarker);
    } catch {
      installRan = false;
    }
    const spicetifyLog = await readFile(spicetifyLogPath, "utf8");
    const updateLog = await readFile(
      resolve(fakeLocalAppData, "Furigana for Spotify", "update.log"),
      "utf8",
    );
    const spicetifyWorkingDirectoryFromLog = spicetifyLog.match(
      /^cwd=(.+) args=auto\r?$/m,
    )?.[1];
    if (!spicetifyWorkingDirectoryFromLog) {
      throw new Error(
        `Could not read the Spicetify working directory: ${spicetifyLog}`,
      );
    }
    const [launcherStateRoot, spicetifyWorkingDirectory] = await Promise.all([
      realpath(resolve(fakeLocalAppData, "Furigana for Spotify")),
      realpath(spicetifyWorkingDirectoryFromLog),
    ]);
    return {
      installRan,
      launcherStateRoot,
      spicetifyWorkingDirectory,
      spicetifyLog,
      updateLog,
    };
  } finally {
    if (!serverClosed) {
      await new Promise<void>((resolveClose) =>
        server.close(() => resolveClose()),
      );
    }
    await rm(testRoot, { recursive: true, force: true });
  }
}

describe("release auto-updaters", () => {
  it("pins official release sources and verifies packages before install", async () => {
    const [windowsLauncher, macLauncher, buildScript, packageScript] =
      await Promise.all([
        readFile(resolve(projectRoot, "packaging", "launcher.ps1"), "utf8"),
        readFile(resolve(projectRoot, "packaging", "launcher.sh"), "utf8"),
        readFile(resolve(projectRoot, "scripts", "build.mjs"), "utf8"),
        readFile(resolve(projectRoot, "scripts", "package.ps1"), "utf8"),
      ]);

    expect(windowsLauncher).toContain(
      "https://github.com/huiishan99/spotify-furigana/releases/latest",
    );
    expect(windowsLauncher).toContain(
      "[System.Security.Cryptography.SHA256]::Create()",
    );
    expect(windowsLauncher).toContain("Expand-Archive");
    expect(windowsLauncher).toContain("-NoLaunch");
    expect(windowsLauncher).toContain("continuing with the installed version");
    expect(macLauncher).toContain(
      "https://github.com/huiishan99/spotify-furigana/releases/latest",
    );
    expect(macLauncher).toContain("shasum -a 256");
    expect(macLauncher).toContain("SPOTIFY_FURIGANA_NO_LAUNCH=1");
    expect(macLauncher).toContain('exec "$spicetify_executable" auto');
    expect(buildScript).toContain('resolve(outputRoot, "launcher.ps1")');
    expect(buildScript).toContain('resolve(outputRoot, "overlay.ps1")');
    expect(buildScript).toContain('resolve(outputRoot, "launcher.sh")');
    expect(buildScript).toContain('resolve(outputRoot, "version.txt")');
    expect(packageScript).toContain('(Join-Path $builtApp "launcher.ps1")');
    expect(packageScript).toContain('(Join-Path $builtApp "overlay.ps1")');
    expect(packageScript).toContain('(Join-Path $builtApp "launcher.sh")');
    expect(packageScript).toContain('(Join-Path $builtApp "version.txt")');
  });

  it(
    "installs a checksum-verified newer release and still launches Spotify",
    async () => {
      if (process.platform !== "win32") {
        return;
      }

      const result = await runWindowsUpdateScenario("valid");
      expect(result.installRan).toBe(true);
      expect(result.spicetifyLog).toContain("auto");
      expect(result.spicetifyWorkingDirectory.toLowerCase()).toBe(
        result.launcherStateRoot.toLowerCase(),
      );
      expect(result.updateLog).toContain(
        "Updated automatically from 0.4.0 to 0.5.0.",
      );
    },
    20_000,
  );

  it("rejects a bad checksum but still launches the installed version", async () => {
    if (process.platform !== "win32") {
      return;
    }

    const result = await runWindowsUpdateScenario("checksum-failure");
    expect(result.installRan).toBe(false);
    expect(result.spicetifyLog).toContain("auto");
    expect(result.updateLog).toContain("SHA-256 did not match");
    expect(result.updateLog).toContain("continuing with the installed version");
  });

  it("continues launching when the release service is offline", async () => {
    if (process.platform !== "win32") {
      return;
    }

    const result = await runWindowsUpdateScenario("offline");
    expect(result.installRan).toBe(false);
    expect(result.spicetifyLog).toContain("auto");
    expect(result.updateLog).toContain("Update check failed");
    expect(result.updateLog).toContain("continuing with the installed version");
  });
});
