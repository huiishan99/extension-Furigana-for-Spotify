import { appendFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const canonicalRepository = "huiishan99/extension-Furigana-for-Spotify";

export function getReleaseRequest(environment, version) {
  if (
    typeof version !== "string" ||
    version.trim() !== version ||
    !/^[0-9]+\.[0-9]+\.[0-9]+$/u.test(version)
  ) {
    throw new Error("The package must have a stable X.Y.Z version.");
  }
  const {
    GITHUB_EVENT_NAME: event,
    GITHUB_REF: ref,
    GITHUB_SHA: sha,
    GITHUB_REPOSITORY: repository,
  } = environment;
  if (
    repository !== canonicalRepository ||
    !/^[0-9a-f]{40}$/u.test(sha ?? "") ||
    sha.length !== 40
  ) {
    throw new Error("Release requires the canonical repository and a full commit SHA.");
  }
  const tag = `v${version}`;
  if (event === "workflow_dispatch") {
    if (
      ref !== "refs/heads/main" ||
      environment.RELEASE_VERSION !== version ||
      environment.EXPECTED_SHA !== sha
    ) {
      throw new Error(
        "Manual release must use main and match the exact expected SHA and package version.",
      );
    }
  } else if (event !== "push" || ref !== `refs/tags/${tag}`) {
    throw new Error("Release event/tag does not match the package version.");
  }
  return { event, repository, sha, tag };
}

export async function verifyReleaseTarget(request, readGitHub) {
  const base = `repos/${request.repository}`;
  const main = await readGitHub(`${base}/branches/main`);
  if (main?.commit?.sha !== request.sha) {
    throw new Error("The release commit is no longer the current main commit.");
  }
  const tagRef = await readGitHub(`${base}/git/ref/tags/${request.tag}`);
  if (request.event === "workflow_dispatch") {
    if (tagRef) throw new Error("The release tag already exists; refusing to recreate or move it.");
  } else {
    let object = tagRef?.object;
    const seen = new Set();
    while (object?.type === "tag") {
      if (
        !/^[0-9a-f]{40}$/u.test(object.sha ?? "") ||
        object.sha.length !== 40 ||
        seen.has(object.sha)
      ) {
        throw new Error("Invalid or cyclic annotated release tag.");
      }
      seen.add(object.sha);
      object = (await readGitHub(`${base}/git/tags/${object.sha}`))?.object;
    }
    if (object?.type !== "commit" || object.sha !== request.sha) {
      throw new Error("The existing tag does not resolve to the release commit.");
    }
  }
  // Include drafts as well as published releases; never silently edit an existing release.
  for (let page = 1; ; page += 1) {
    const releases = await readGitHub(`${base}/releases?per_page=100&page=${page}`);
    if (!Array.isArray(releases)) throw new Error("Could not inspect existing releases.");
    if (releases.some((release) => release.tag_name === request.tag)) {
      throw new Error("A release for this version already exists; refusing to overwrite it.");
    }
    if (releases.length < 100) break;
  }
}

async function main() {
  const pkg = JSON.parse(await readFile(resolve(projectRoot, "package.json"), "utf8"));
  const request = getReleaseRequest(process.env, pkg.version);
  await readFile(resolve(projectRoot, "docs", "releases", `${request.tag}.md`), "utf8");
  if (!process.env.GITHUB_TOKEN)
    throw new Error("GitHub's workflow token is required for release checks.");
  await verifyReleaseTarget(request, async (path) => {
    const response = await fetch(`https://api.github.com/${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 404) return null;
    if (!response.ok)
      throw new Error(`Release preflight API check failed (${response.status}): ${path}`);
    return response.json();
  });
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `tag=${request.tag}\nsha=${request.sha}\n`);
  }
  console.log(`Verified new release ${request.tag} at main commit ${request.sha}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
