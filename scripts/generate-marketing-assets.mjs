import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import gifenc from "gifenc";
import sharp from "sharp";

const { GIFEncoder, applyPalette, quantize } = gifenc;

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(projectRoot, "assets", "marketing");
const expectedPrefix = `${resolve(projectRoot, "assets")}${sep}`;

if (!outputRoot.startsWith(expectedPrefix) || !outputRoot.endsWith("marketing")) {
  throw new Error(`Refusing to write marketing assets outside assets/: ${outputRoot}`);
}

const logoPath = resolve(projectRoot, "assets", "logo.png");
const screenshotPath = resolve(
  projectRoot,
  "assets",
  "screenshots",
  "lyrics-view.png",
);
const [logoBuffer, screenshotBuffer] = await Promise.all([
  readFile(logoPath),
  readFile(screenshotPath),
]);

const logoUri = `data:image/png;base64,${logoBuffer.toString("base64")}`;
const screenshotUri = `data:image/png;base64,${screenshotBuffer.toString("base64")}`;

await mkdir(outputRoot, { recursive: true });

function roundedRectClip(id, x, y, width, height, radius) {
  return `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" /></clipPath>`;
}

function socialPreviewSvg(logoHref, screenshotHref) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1280" height="640" viewBox="0 0 1280 640">
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#071017" />
      <stop offset="0.62" stop-color="#08151b" />
      <stop offset="1" stop-color="#03251f" />
    </linearGradient>
    <radialGradient id="glow" cx="0.76" cy="0.18" r="0.72">
      <stop offset="0" stop-color="#00dba1" stop-opacity="0.34" />
      <stop offset="1" stop-color="#00dba1" stop-opacity="0" />
    </radialGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="22" stdDeviation="24" flood-color="#000" flood-opacity="0.48" />
    </filter>
    ${roundedRectClip("screenshot", 682, 52, 548, 536, 28)}
  </defs>

  <rect width="1280" height="640" fill="url(#background)" />
  <rect width="1280" height="640" fill="url(#glow)" />
  <circle cx="114" cy="536" r="176" fill="#00dba1" opacity="0.055" />
  <path d="M0 606 C262 520 440 716 694 592 C908 488 1056 542 1280 452 V640 H0 Z" fill="#00dba1" opacity="0.04" />

  <image x="66" y="58" width="132" height="132" xlink:href="${logoHref}" />
  <text x="224" y="104" fill="#f6f5ef" font-family="Segoe UI, Yu Gothic UI, sans-serif" font-size="29" font-weight="750">Furigana for Spotify</text>
  <text x="224" y="143" fill="#7fe9cb" font-family="Segoe UI, Yu Gothic UI, sans-serif" font-size="18" font-weight="650" letter-spacing="2.2">LOCAL JAPANESE LYRIC READINGS</text>

  <text x="68" y="286" fill="#f8f7f2" font-family="Segoe UI, Yu Gothic UI, sans-serif" font-size="61" font-weight="780" letter-spacing="-2">
    <tspan x="68" dy="0">Japanese lyrics,</tspan>
    <tspan x="68" dy="72">now readable.</tspan>
  </text>
  <text x="70" y="462" fill="#b8c5c3" font-family="Segoe UI, Yu Gothic UI, sans-serif" font-size="23" font-weight="450">
    Real-time furigana for Spotify desktop.
  </text>

  <g transform="translate(68 510)">
    <rect width="470" height="54" rx="27" fill="#0e2824" stroke="#1f6b59" />
    <circle cx="28" cy="27" r="7" fill="#00dba1" />
    <text x="48" y="35" fill="#d9f7ee" font-family="Segoe UI, Yu Gothic UI, sans-serif" font-size="16" font-weight="700" letter-spacing="0.9">LOCAL BY DEFAULT  ·  OPT-IN ONLINE  ·  SPICETIFY</text>
  </g>

  <g filter="url(#shadow)">
    <rect x="662" y="32" width="588" height="576" rx="36" fill="#10181d" stroke="#2b4f48" stroke-width="2" />
    <image x="413" y="52" width="992" height="539" preserveAspectRatio="xMidYMid slice" clip-path="url(#screenshot)" xlink:href="${screenshotHref}" />
    <rect x="682" y="52" width="548" height="536" rx="28" fill="none" stroke="#00dba1" stroke-opacity="0.28" />
  </g>

  <g transform="translate(913 74)">
    <rect width="278" height="48" rx="24" fill="#07120f" fill-opacity="0.92" stroke="#00dba1" stroke-opacity="0.72" />
    <text x="139" y="31" text-anchor="middle" fill="#80f0d0" font-family="Segoe UI, Yu Gothic UI, sans-serif" font-size="16" font-weight="750" letter-spacing="1.5">ふりがな · FURIGANA</text>
  </g>
</svg>`;
}

function easeInOut(value) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function demoFrameSvg(frameIndex, frameCount) {
  const progress = frameIndex / (frameCount - 1);
  const wave = 0.5 - 0.5 * Math.cos(progress * Math.PI * 2);
  const eased = easeInOut(wave);
  const scale = 1 + eased * 0.085;
  const highlightOpacity = 0.28 + eased * 0.64;
  const highlight = { x: 207, y: 101, width: 329, height: 67 };
  const scanX = highlight.x + 10 + progress * (highlight.width - 20);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="960" height="540" viewBox="0 0 960 540">
  <defs>
    <clipPath id="viewport"><rect x="0" y="54" width="960" height="486" /></clipPath>
    <linearGradient id="topbar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#071017" />
      <stop offset="1" stop-color="#0b201c" />
    </linearGradient>
    <linearGradient id="bottomShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#071017" stop-opacity="0" />
      <stop offset="1" stop-color="#071017" stop-opacity="0.72" />
    </linearGradient>
  </defs>

  <rect width="960" height="540" fill="#071017" />
  <g clip-path="url(#viewport)" transform="translate(566 291) scale(${scale.toFixed(4)}) translate(-566 -291)">
    <image x="-65" y="54" width="1025" height="557" preserveAspectRatio="xMidYMid slice" xlink:href="${screenshotUri}" />
    <rect x="${highlight.x}" y="${highlight.y}" width="${highlight.width}" height="${highlight.height}" rx="14" fill="none" stroke="#00e0a5" stroke-width="4" opacity="${highlightOpacity.toFixed(3)}" />
    <rect x="${scanX.toFixed(2)}" y="${highlight.y + 5}" width="3" height="${highlight.height - 10}" rx="1.5" fill="#8affde" opacity="${(0.35 + eased * 0.45).toFixed(3)}" />
  </g>
  <rect x="0" y="418" width="960" height="122" fill="url(#bottomShade)" />

  <rect x="0" y="0" width="960" height="54" fill="url(#topbar)" />
  <image x="14" y="7" width="40" height="40" xlink:href="${logoUri}" />
  <text x="65" y="35" fill="#f8f7f2" font-family="Segoe UI, Yu Gothic UI, sans-serif" font-size="19" font-weight="750">Furigana for Spotify</text>
  <g transform="translate(754 11)">
    <rect width="188" height="34" rx="17" fill="#0d2c25" stroke="#00dba1" stroke-opacity="0.72" />
    <circle cx="21" cy="17" r="5" fill="#00dba1" />
    <text x="36" y="23" fill="#c9f8ea" font-family="Segoe UI, Yu Gothic UI, sans-serif" font-size="13" font-weight="750" letter-spacing="1">FURIGANA ON</text>
  </g>

  <g transform="translate(608 476)">
    <rect width="320" height="44" rx="22" fill="#07120f" fill-opacity="0.88" stroke="#287866" />
    <text x="160" y="29" text-anchor="middle" fill="#d8f8ef" font-family="Segoe UI, Yu Gothic UI, sans-serif" font-size="15" font-weight="700">Read kanji without leaving the song</text>
  </g>
</svg>`;
}

const socialSvg = socialPreviewSvg(logoUri, screenshotUri);
const editableSocialSvg = socialPreviewSvg(
  "../logo.png",
  "../screenshots/lyrics-view.png",
);
const socialSvgPath = resolve(outputRoot, "social-preview.svg");
const socialPngPath = resolve(outputRoot, "social-preview.png");
await writeFile(socialSvgPath, editableSocialSvg, "utf8");
await sharp(Buffer.from(socialSvg))
  .png({ compressionLevel: 9, palette: true, quality: 92 })
  .toFile(socialPngPath);

const gifWidth = 960;
const gifHeight = 540;
const frameCount = 20;
const gif = GIFEncoder();

for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
  const rgba = await sharp(Buffer.from(demoFrameSvg(frameIndex, frameCount)))
    .ensureAlpha()
    .raw()
    .toBuffer();
  const palette = quantize(rgba, 128, { format: "rgb565" });
  const indexed = applyPalette(rgba, palette, "rgb565");
  const isLastFrame = frameIndex === frameCount - 1;
  gif.writeFrame(indexed, gifWidth, gifHeight, {
    palette,
    delay: isLastFrame ? 700 : 90,
    repeat: 0,
    dispose: 1,
  });
}

gif.finish();
const demoGifPath = resolve(outputRoot, "demo.gif");
await writeFile(demoGifPath, gif.bytes());

const [socialMetadata, demoMetadata] = await Promise.all([
  sharp(socialPngPath).metadata(),
  sharp(demoGifPath, { animated: true }).metadata(),
]);

if (socialMetadata.width !== 1280 || socialMetadata.height !== 640) {
  throw new Error("Unexpected social preview dimensions.");
}
if (demoMetadata.width !== gifWidth || demoMetadata.pageHeight !== gifHeight) {
  throw new Error("Unexpected demo GIF dimensions.");
}

console.log(`Created ${socialPngPath}`);
console.log(`Created ${demoGifPath}`);
