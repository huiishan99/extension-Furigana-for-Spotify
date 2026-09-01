import { access, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface MarketplaceManifest {
  name: string;
  description: string;
  preview: string;
  readme: string;
  authors: Array<{ name: string; url: string }>;
  tags: string[];
}

describe("Marketplace publishing metadata", () => {
  it("references repository assets that exist", async () => {
    const manifest = JSON.parse(
      await readFile(resolve(projectRoot, "manifest.json"), "utf8"),
    ) as MarketplaceManifest;

    expect(manifest.name).toBe("Furigana for Spotify");
    expect(manifest.description.length).toBeGreaterThan(20);
    expect(manifest.preview).toBe("assets/marketing/demo.gif");
    expect(manifest.readme).toBe("README.md");
    expect(manifest.authors).toContainEqual({
      name: "huiishan99",
      url: "https://github.com/huiishan99",
    });
    expect(manifest.tags).toContain("furigana");

    await Promise.all([
      access(resolve(projectRoot, manifest.preview)),
      access(resolve(projectRoot, manifest.readme)),
    ]);
  });

  it("keeps launch artwork at its documented dimensions", async () => {
    const socialPreview = resolve(projectRoot, "assets", "marketing", "social-preview.png");
    const demo = resolve(projectRoot, "assets", "marketing", "demo.gif");
    const [socialMetadata, demoMetadata, socialStat, demoStat] = await Promise.all([
      sharp(socialPreview).metadata(),
      sharp(demo, { animated: true }).metadata(),
      stat(socialPreview),
      stat(demo),
    ]);

    expect(socialMetadata.width).toBe(1280);
    expect(socialMetadata.height).toBe(640);
    expect(demoMetadata.width).toBe(960);
    expect(demoMetadata.pageHeight).toBe(540);
    expect(demoMetadata.pages).toBe(20);
    expect(socialStat.size).toBeLessThan(1_000_000);
    expect(demoStat.size).toBeLessThan(10_000_000);
  });
});
