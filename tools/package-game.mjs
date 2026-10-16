import { verifyRelease, SOURCE_DIRS, SOURCE_FILES } from "./release-gate.mjs";
import { readFile, writeFile, readdir, stat, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url)),
  sha = (b) => createHash("sha256").update(b).digest("hex"),
  files = [];
async function walk(dir) {
  for (const name of (await readdir(path.join(root, dir))).sort()) {
    const rel = dir + "/" + name;
    if ((await stat(path.join(root, rel))).isDirectory()) await walk(rel);
    else files.push(rel);
  }
}
for (const dir of SOURCE_DIRS) await walk(dir);
files.push(...SOURCE_FILES);
await verifyRelease(root);
const hashes = {},
  patch = [];
for (const file of files) {
  const bytes = await readFile(path.join(root, file));
  hashes[file] = sha(bytes);
  if (
    [".js", ".mjs", ".html", ".css", ".json", ".cmd"].includes(
      path.extname(file),
    ) &&
    file !== "package-design.mjs"
  ) {
    const lines = bytes
      .toString("utf8")
      .replace(/\r\n/g, "\n")
      .replace(/\n$/, "")
      .split("\n");
    patch.push(
      `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n` +
        lines.map((l) => "+" + l).join("\n") +
        "\n",
    );
  }
}
const release = JSON.parse(
  await readFile(path.join(root, "dist/release.json"), "utf8"),
);
for (const entry of release.files) {
  const rel =
    entry.url === "./" ? "dist/index.html" : "dist/" + entry.url.slice(2);
  if (sha(await readFile(path.join(root, rel))) !== entry.hash)
    throw Error("Distribution integrity mismatch: " + rel);
  files.push(rel);
}
files.push("dist/sw.js", "dist/release.json");
for (const entry of release.nativeFiles) files.push("dist/" + entry.file);
await writeFile(
  path.join(root, "audit/implementation-hashes.json"),
  JSON.stringify(
    {
      utc: new Date().toISOString(),
      release: release.release,
      sourceHashes: hashes,
      sourceCount: Object.keys(hashes).length,
    },
    null,
    2,
  ),
);
await writeFile(
  path.join(root, "audit/implementation.patch"),
  patch.join("\n"),
);
for (const f of [
  "audit/2026-10-16-design.md",
  "audit/2026-10-16-implementation.md",
  "audit/implementation-baseline-README.md",
  "audit/build.json",
  "audit/final-tests.txt",
  "audit/final-regressions.txt",
  "audit/simulation-races.json",
  "audit/browser-game-review.json",
  "audit/implementation-hashes.json",
  "audit/implementation.patch",
  "audit/current-acceptance.json",
])
  files.push(f);
const acceptance = JSON.parse(
  await readFile(path.join(root, "audit/current-acceptance.json"), "utf8"),
);
for (const row of acceptance.requirements)
  for (const artifact of row.artifacts || []) files.push(artifact.path);
await mkdir(path.join(root, "artifacts"), { recursive: true });
await writeFile(
  path.join(root, "artifacts/package-files.json"),
  JSON.stringify(
    { release: release.release, files: [...new Set(files)].sort() },
    null,
    2,
  ),
);
console.log(
  "Verified current distribution; " +
    Object.keys(hashes).length +
    " source/reference hashes and " +
    files.length +
    " package inputs.",
);
