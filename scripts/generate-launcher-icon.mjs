import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(projectRoot, "assets", "logo.png");
const windowsOutputPath = resolve(projectRoot, "assets", "launcher.ico");
const macOutputPath = resolve(projectRoot, "assets", "launcher.icns");
const windowsIconSizes = [16, 24, 32, 48, 64, 128, 256];
const macIconTypes = [
  ["icp4", 16],
  ["icp5", 32],
  ["icp6", 64],
  ["ic07", 128],
  ["ic08", 256],
  ["ic09", 512],
  ["ic10", 1024],
];

const source = await readFile(sourcePath);
const trimmed = await sharp(source)
  .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
async function renderIcons(sizes) {
  return Promise.all(
    sizes.map((size) => {
      const inset = Math.max(1, Math.round(size * 0.06));
      return sharp(trimmed)
        .resize(size - inset * 2, size - inset * 2, {
          fit: "contain",
          kernel: sharp.kernel.lanczos3,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .extend({
          top: inset,
          bottom: inset,
          left: inset,
          right: inset,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png({ compressionLevel: 9 })
        .toBuffer();
    }),
  );
}

const windowsImages = await renderIcons(windowsIconSizes);

const headerSize = 6;
const directoryEntrySize = 16;
let imageOffset = headerSize + directoryEntrySize * windowsImages.length;
const header = Buffer.alloc(headerSize);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(windowsImages.length, 4);

const directory = Buffer.alloc(directoryEntrySize * windowsImages.length);
windowsImages.forEach((image, index) => {
  const offset = index * directoryEntrySize;
  const size = windowsIconSizes[index];
  directory.writeUInt8(size === 256 ? 0 : size, offset);
  directory.writeUInt8(size === 256 ? 0 : size, offset + 1);
  directory.writeUInt8(0, offset + 2);
  directory.writeUInt8(0, offset + 3);
  directory.writeUInt16LE(1, offset + 4);
  directory.writeUInt16LE(32, offset + 6);
  directory.writeUInt32LE(image.length, offset + 8);
  directory.writeUInt32LE(imageOffset, offset + 12);
  imageOffset += image.length;
});

await writeFile(windowsOutputPath, Buffer.concat([header, directory, ...windowsImages]));

const macImages = await renderIcons(macIconTypes.map(([, size]) => size));
const macChunks = macImages.map((image, index) => {
  const chunkHeader = Buffer.alloc(8);
  chunkHeader.write(macIconTypes[index][0], 0, 4, "ascii");
  chunkHeader.writeUInt32BE(image.length + chunkHeader.length, 4);
  return Buffer.concat([chunkHeader, image]);
});
const macHeader = Buffer.alloc(8);
macHeader.write("icns", 0, 4, "ascii");
macHeader.writeUInt32BE(
  macHeader.length + macChunks.reduce((total, chunk) => total + chunk.length, 0),
  4,
);
await writeFile(macOutputPath, Buffer.concat([macHeader, ...macChunks]));

console.log(`Created Windows launcher icon: ${windowsOutputPath}`);
console.log(`Created macOS launcher icon: ${macOutputPath}`);
