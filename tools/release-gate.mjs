import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { verifyAssets } from "./assets.mjs";
export const sha = (b) => createHash("sha256").update(b).digest("hex");
export const SOURCE_DIRS = [
  "app",
  "content",
  "tools",
  "tests",
  "references",
  "artwork",
  ".github",
];
export const SOURCE_FILES = [
  ".gitattributes",
  ".gitignore",
  "AGENTS.md",
  "package.json",
  "bun.lock",
  "asset-contract.json",
  "requirements.json",
  "START-GAME.cmd",
  "README.md",
  "PLAY.md",
  "IMPLEMENTATION-STATUS.md",
  "DEPLOYMENT.md",
  "ACCEPTANCE.md",
  "ARCHITECTURE.md",
  "ASSETS.md",
  "GAME-DESIGN.md",
  "CONTENT-CATALOG.md",
  "TRACK-WORKSHOP.md",
  "design-review.html",
  "preview.mjs",
  "review-design.mjs",
  "package-design.mjs",
];
export async function sourceIdentity(root) {
  const files = [];
  async function walk(dir) {
    for (const entry of (
      await readdir(path.join(root, dir), { withFileTypes: true })
    ).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) await walk(rel);
      else files.push(rel);
    }
  }
  for (const dir of SOURCE_DIRS) await walk(dir);
  files.push(...SOURCE_FILES);
  files.sort();
  const hashes = {};
  for (const file of files) {
    const bytes = await readFile(path.join(root, file));
    if (/pk_[a-f0-9]{32,}/i.test(bytes.toString()))
      throw Error("Credential-like value in release source: " + file);
    hashes[file] = sha(bytes);
  }
  return { hash: sha(JSON.stringify(hashes)), files: hashes };
}
export async function verifyCandidateArtifacts(root) {
  const release = JSON.parse(
    await readFile(path.join(root, "dist/release.json"), "utf8"),
  );
  if (!/^sl-[a-f0-9]{14}$/.test(release.release))
    throw Error("Invalid release identifier");
  const base = `./releases/${release.release}/`,
    seen = new Set();
  for (const entry of release.files) {
    if (
      seen.has(entry.url) ||
      (entry.url.includes("..") && entry.url !== "./") ||
      (entry.url !== "./" && !entry.url.startsWith(base))
    )
      throw Error("Invalid inventory path");
    seen.add(entry.url);
    const file = entry.url === "./" ? "index.html" : entry.url.slice(2);
    if (sha(await readFile(path.join(root, "dist", file))) !== entry.hash)
      throw Error("Distribution changed: " + file);
  }
  const html = await readFile(path.join(root, "dist/index.html"), "utf8");
  const contract = await verifyAssets(
    root,
    path.join(root, "dist/releases", release.release),
    { html, release: release.release },
  );
  for (const name of [
    ...contract.required,
    ...contract.images.map((x) => x.path),
  ])
    if (!seen.has(base + name))
      throw Error("Required asset omitted from public inventory: " + name);
  if (!Array.isArray(release.offlineFiles) || !release.offlineFiles.length)
    throw Error("Offline inventory missing");
  for (const entry of release.offlineFiles)
    if (
      !release.files.some((f) => f.url === entry.url && f.hash === entry.hash)
    )
      throw Error("Offline inventory diverges from public files");
  const worker = await readFile(path.join(root, "dist/sw.js"), "utf8");
  if (
    !worker.includes("INVENTORY=" + JSON.stringify(release.offlineFiles) + ";")
  )
    throw Error("Worker inventory differs");
  if (
    !seen.has(base + "native-shell.html") ||
    !Array.isArray(release.nativeFiles) ||
    release.nativeFiles.length !== 28
  )
    throw Error("Native route inventory incomplete");
  const nativeURLs = new Set(),
    nativePaths = new Set();
  for (const entry of release.nativeFiles) {
    if (
      nativeURLs.has(entry.url) ||
      nativePaths.has(entry.file) ||
      !/^\/(?:editor|track)\/(?:[a-z0-9-]+|:slug|index\.html)$/.test(
        entry.url,
      ) ||
      !/^native-routes\/[a-z0-9-]+\.html$/.test(entry.file) ||
      sha(await readFile(path.join(root, "dist", entry.file))) !== entry.hash
    )
      throw Error("Native route changed or omitted");
    nativeURLs.add(entry.url);
    nativePaths.add(entry.file);
  }
  const outputHash = sha(
    JSON.stringify(release.files) +
      JSON.stringify(release.nativeFiles) +
      worker,
  );
  const source = await sourceIdentity(root);
  if (release.sourceHash !== source.hash)
    throw Error(
      "Distribution was built from different source; rebuild this candidate",
    );
  return {
    release: release.release,
    outputHash,
    source,
  };
}
export async function verifyRelease(
  root,
  stage = "local",
  publicationAuthorization = null,
) {
  const stages = ["local", "staged", "live"];
  if (!stages.includes(stage))
    throw Error("Unknown release verification stage");
  const candidate = await verifyCandidateArtifacts(root);
  const requirements = JSON.parse(
    await readFile(path.join(root, "requirements.json"), "utf8"),
  );
  const receiptBytes = await readFile(
    path.join(root, "audit/current-acceptance.json"),
  );
  const receipt = JSON.parse(receiptBytes);
  if (
    new Set(requirements.required.map((r) => r.id)).size !==
      requirements.required.length ||
    !Array.isArray(receipt.requirements) ||
    new Set(receipt.requirements.map((r) => r.id)).size !==
      receipt.requirements.length
  )
    throw Error("Duplicate or missing acceptance identities");
  if (
    receipt.sourceHash !== candidate.source.hash ||
    receipt.outputHash !== candidate.outputHash ||
    receipt.release !== candidate.release
  )
    throw Error("Acceptance receipt does not match this exact candidate");
  // Explicit candidate publication is separate from passing product acceptance.
  // Default package/release/CI callers never supply this authorization.
  let knownIncomplete = new Set();
  if (publicationAuthorization) {
    const { readPublicationAuthorization } =
      await import("./candidate-publication.mjs");
    knownIncomplete = await readPublicationAuthorization(
      root,
      publicationAuthorization,
      candidate,
      receipt,
      receiptBytes,
    );
  }
  for (const requirement of requirements.required) {
    if (
      !requirement.outcome ||
      !requirement.method ||
      !stages.includes(requirement.stage)
    )
      throw Error("Incomplete acceptance contract: " + requirement.id);
    if (stages.indexOf(requirement.stage) > stages.indexOf(stage)) continue;
    const evidence = receipt.requirements?.find((r) => r.id === requirement.id);
    if (evidence?.status !== "passed" && !knownIncomplete.has(requirement.id))
      throw Error(
        "Required acceptance is missing or not passed: " + requirement.id,
      );
    if (evidence.status === "passed" && !evidence.artifacts?.length)
      throw Error("Required acceptance is missing evidence: " + requirement.id);
    for (const artifact of evidence.artifacts || []) {
      if (
        !artifact.path.startsWith("audit/") ||
        artifact.path.includes("..") ||
        sha(await readFile(path.join(root, artifact.path))) !== artifact.sha256
      )
        throw Error("Acceptance evidence changed: " + requirement.id);
    }
  }
  return candidate;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  try {
    const result = await verifyRelease(root, process.argv[2] || "local");
    console.log("Release gate passed: " + result.release);
  } catch (error) {
    console.error("Release gate refused: " + error.message);
    process.exitCode = 1;
  }
}
