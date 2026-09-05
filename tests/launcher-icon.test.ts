import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("desktop launcher icons", () => {
  it("contains the expected multi-size PNG icon entries", async () => {
    const icon = await readFile(resolve(projectRoot, "assets", "launcher.ico"));
    const imageCount = icon.readUInt16LE(4);
    const sizes = [];
    let compactImage: Buffer | undefined;

    expect(icon.readUInt16LE(0)).toBe(0);
    expect(icon.readUInt16LE(2)).toBe(1);
    expect(imageCount).toBe(7);

    for (let index = 0; index < imageCount; index += 1) {
      const entryOffset = 6 + index * 16;
      const widthByte = icon.readUInt8(entryOffset);
      const heightByte = icon.readUInt8(entryOffset + 1);
      const size = widthByte === 0 ? 256 : widthByte;
      const imageLength = icon.readUInt32LE(entryOffset + 8);
      const imageOffset = icon.readUInt32LE(entryOffset + 12);
      const image = icon.subarray(imageOffset, imageOffset + imageLength);

      sizes.push(size);
      expect(heightByte === 0 ? 256 : heightByte).toBe(size);
      expect(image.subarray(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      expect(imageOffset + imageLength).toBeLessThanOrEqual(icon.length);
      if (size === 32) compactImage = image;
    }

    expect(sizes).toEqual([16, 24, 32, 48, 64, 128, 256]);
    if (!compactImage) throw new Error("The 32 px launcher icon is missing.");
    const compact = await sharp(compactImage)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (const row of [2, 3, 28, 29]) {
      const opaquePixels = Array.from({ length: compact.info.width }, (_, column) => {
        return compact.data[(row * compact.info.width + column) * compact.info.channels + 3] ?? 0;
      }).filter((alpha) => alpha > 32);
      expect(opaquePixels).toHaveLength(0);
    }
  });

  it("contains the expected macOS PNG icon entries", async () => {
    const icon = await readFile(resolve(projectRoot, "assets", "launcher.icns"));
    const expectedTypes = ["icp4", "icp5", "icp6", "ic07", "ic08", "ic09", "ic10"];
    const types = [];
    let offset = 8;

    expect(icon.subarray(0, 4).toString("ascii")).toBe("icns");
    expect(icon.readUInt32BE(4)).toBe(icon.length);

    while (offset < icon.length) {
      const type = icon.subarray(offset, offset + 4).toString("ascii");
      const length = icon.readUInt32BE(offset + 4);
      types.push(type);
      expect(length).toBeGreaterThan(8);
      expect(icon.subarray(offset + 8, offset + 16)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      offset += length;
    }

    expect(offset).toBe(icon.length);
    expect(types).toEqual(expectedTypes);
  });
});
