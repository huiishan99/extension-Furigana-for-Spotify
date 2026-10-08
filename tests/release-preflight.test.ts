import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { getReleaseRequest, verifyReleaseTarget } = await import(
  pathToFileURL(resolve(projectRoot, "scripts/release-preflight.mjs")).href
);
const sha = "a".repeat(40);
const repository = "huiishan99/extension-Furigana-for-Spotify";
const environment = {
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_REF: "refs/heads/main",
  GITHUB_SHA: sha,
  GITHUB_REPOSITORY: repository,
  RELEASE_VERSION: "0.6.3",
  EXPECTED_SHA: sha,
};
const base = `repos/${repository}`;
const tagPath = `${base}/git/ref/tags/v0.6.3`;
const releasesPath = `${base}/releases?per_page=100&page=1`;

function responses(overrides: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = {
    [`${base}/branches/main`]: { commit: { sha } },
    [tagPath]: null,
    [releasesPath]: [],
    ...overrides,
  };
  return async (path: string) => {
    if (!(path in data)) throw new Error(`Unexpected API request: ${path}`);
    return data[path];
  };
}

describe("release request validation", () => {
  it("accepts only exact main/version/SHA manual inputs", () => {
    expect(getReleaseRequest(environment, "0.6.3")).toEqual({
      event: "workflow_dispatch",
      repository,
      sha,
      tag: "v0.6.3",
    });
  });

  it.each([
    { GITHUB_REF: "refs/heads/unreviewed" },
    { RELEASE_VERSION: "0.6.2" },
    { RELEASE_VERSION: "0.6.3; echo untrusted" },
    { RELEASE_VERSION: "0.6.3\n" },
    { EXPECTED_SHA: "b".repeat(40) },
    { EXPECTED_SHA: "a".repeat(7) },
    { GITHUB_SHA: `${sha}\n` },
    { GITHUB_REPOSITORY: "someone/fork" },
    { GITHUB_EVENT_NAME: "pull_request" },
  ])("rejects mismatched or unsafe input %j", (override) => {
    expect(() => getReleaseRequest({ ...environment, ...override }, "0.6.3")).toThrow();
  });

  it.each(["0.6.3-rc.1", "0.6.3\n", "../../other", "0.6.3; exit 0"])(
    "rejects unsupported package version %s",
    (version) => {
      expect(() => getReleaseRequest(environment, version)).toThrow();
    },
  );

  it("accepts the existing stable-tag trigger only for its matching package", () => {
    const input = { ...environment, GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/tags/v0.6.3" };
    expect(getReleaseRequest(input, "0.6.3").tag).toBe("v0.6.3");
    expect(() =>
      getReleaseRequest({ ...input, GITHUB_REF: "refs/tags/v0.6.2" }, "0.6.3"),
    ).toThrow();
  });
});

describe("release target checks", () => {
  const request = getReleaseRequest(environment, "0.6.3");
  it("accepts a new release at the exact current main commit", async () => {
    await expect(verifyReleaseTarget(request, responses())).resolves.toBeUndefined();
  });

  it("rejects main moving since the approved input was recorded", async () => {
    await expect(
      verifyReleaseTarget(
        request,
        responses({ [`${base}/branches/main`]: { commit: { sha: "b".repeat(40) } } }),
      ),
    ).rejects.toThrow("current main");
  });

  it("never recreates or moves an existing tag on manual dispatch", async () => {
    await expect(
      verifyReleaseTarget(request, responses({ [tagPath]: { object: { type: "commit", sha } } })),
    ).rejects.toThrow("tag already exists");
  });

  it.each([true, false])("never overwrites an existing release (draft=%s)", async (draft) => {
    await expect(
      verifyReleaseTarget(request, responses({ [releasesPath]: [{ tag_name: "v0.6.3", draft }] })),
    ).rejects.toThrow("release for this version already exists");
  });

  it("checks later release pages as well", async () => {
    await expect(
      verifyReleaseTarget(
        request,
        responses({
          [releasesPath]: Array.from({ length: 100 }, (_, index) => ({
            tag_name: `v0.5.${index}`,
          })),
          [`${base}/releases?per_page=100&page=2`]: [{ tag_name: "v0.6.3", draft: true }],
        }),
      ),
    ).rejects.toThrow("release for this version already exists");
  });

  it("fails closed if the release list cannot be inspected", async () => {
    await expect(verifyReleaseTarget(request, responses({ [releasesPath]: null }))).rejects.toThrow(
      "inspect existing releases",
    );
  });

  it("supports lightweight and annotated tags only when they resolve to the exact commit", async () => {
    const tagged = { ...request, event: "push" };
    await expect(
      verifyReleaseTarget(tagged, responses({ [tagPath]: { object: { type: "commit", sha } } })),
    ).resolves.toBeUndefined();
    const annotation = "c".repeat(40);
    await expect(
      verifyReleaseTarget(
        tagged,
        responses({
          [tagPath]: { object: { type: "tag", sha: annotation } },
          [`${base}/git/tags/${annotation}`]: { object: { type: "commit", sha } },
        }),
      ),
    ).resolves.toBeUndefined();
    await expect(
      verifyReleaseTarget(
        tagged,
        responses({ [tagPath]: { object: { type: "commit", sha: "b".repeat(40) } } }),
      ),
    ).rejects.toThrow("does not resolve");
    await expect(verifyReleaseTarget(tagged, responses())).rejects.toThrow("does not resolve");
  });

  it("rejects cyclic annotated tags", async () => {
    const annotation = "c".repeat(40);
    await expect(
      verifyReleaseTarget(
        { ...request, event: "push" },
        responses({
          [tagPath]: { object: { type: "tag", sha: annotation } },
          [`${base}/git/tags/${annotation}`]: { object: { type: "tag", sha: annotation } },
        }),
      ),
    ).rejects.toThrow("cyclic");
  });

  it("keeps workflow publication serialized and rechecks before creating the release", async () => {
    const workflow = await readFile(resolve(projectRoot, ".github/workflows/release.yml"), "utf8");
    expect(workflow).toContain("group: release-${{ github.repository }}");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow.match(/run: node scripts\/release-preflight\.mjs/gu)).toHaveLength(2);
    expect(workflow).toContain("overwrite_files: false");
    expect(workflow).toContain("target_commitish: ${{ needs.prepare.outputs.sha }}");
    expect(workflow).toContain("body_path: docs/releases/${{ needs.prepare.outputs.tag }}.md");
    expect(workflow.indexOf("Build and verify release packages")).toBeLessThan(
      workflow.indexOf("Recheck release target before publishing"),
    );
    expect(workflow.indexOf("Recheck release target before publishing")).toBeLessThan(
      workflow.indexOf("- name: Create GitHub Release"),
    );
  });
});
