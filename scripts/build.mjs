import { cp, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(projectRoot, "dist", "spotify-furigana");
const expectedPrefix = `${resolve(projectRoot, "dist")}${sep}`;
const packageJson = JSON.parse(
  await readFile(resolve(projectRoot, "package.json"), "utf8"),
);
const version = String(packageJson.version);

if (!/^\d+\.\d+\.\d+$/u.test(version)) {
  throw new Error(`Invalid release version: ${version}`);
}

if (!outputRoot.startsWith(expectedPrefix) || !outputRoot.endsWith("spotify-furigana")) {
  throw new Error(`Refusing to clear unexpected output path: ${outputRoot}`);
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

await build({
  entryPoints: [resolve(projectRoot, "src", "extension.ts")],
  outfile: resolve(outputRoot, "extension.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome120"],
  sourcemap: true,
  define: {
    __SPOTIFY_FURIGANA_VERSION__: JSON.stringify(version),
  },
  alias: {
    path: "path-browserify",
  },
  logLevel: "info",
});

await Promise.all([
  copyFile(resolve(projectRoot, "app", "index.js"), resolve(outputRoot, "index.js")),
  copyFile(
    resolve(projectRoot, "app", "manifest.json"),
    resolve(outputRoot, "manifest.json"),
  ),
  copyFile(resolve(projectRoot, "app", "style.css"), resolve(outputRoot, "style.css")),
  copyFile(
    resolve(projectRoot, "assets", "launcher.ico"),
    resolve(outputRoot, "launcher.ico"),
  ),
  copyFile(
    resolve(projectRoot, "assets", "launcher.icns"),
    resolve(outputRoot, "launcher.icns"),
  ),
  copyFile(
    resolve(projectRoot, "packaging", "launcher.ps1"),
    resolve(outputRoot, "launcher.ps1"),
  ),
  copyFile(
    resolve(projectRoot, "packaging", "overlay.ps1"),
    resolve(outputRoot, "overlay.ps1"),
  ),
  copyFile(
    resolve(projectRoot, "packaging", "overlay-core.ps1"),
    resolve(outputRoot, "overlay-core.ps1"),
  ),
  copyFile(
    resolve(projectRoot, "packaging", "launcher.sh"),
    resolve(outputRoot, "launcher.sh"),
  ),
  writeFile(resolve(outputRoot, "version.txt"), `${version}\n`, "utf8"),
  cp(
    resolve(projectRoot, "node_modules", "kuromoji", "dict"),
    resolve(outputRoot, "dict"),
    { recursive: true },
  ),
]);

console.log(`Built Spicetify app at ${outputRoot}`);
