import { describe, expect, it } from "vitest";
import { PLAYBAR_FU_ICON } from "../src/icon";

describe("playbar icon", () => {
  it("uses the project-specific fu mark instead of a Spotify icon name", () => {
    expect(PLAYBAR_FU_ICON).toContain("<svg");
    expect(PLAYBAR_FU_ICON).toContain('width="16"');
    expect(PLAYBAR_FU_ICON).toContain('height="16"');
    expect(PLAYBAR_FU_ICON).toContain('viewBox="0 0 24 24"');
    expect(PLAYBAR_FU_ICON).toContain("ふ");
    expect(PLAYBAR_FU_ICON).toContain("currentColor");
    expect(PLAYBAR_FU_ICON).not.toContain("spotify");
  });
});
