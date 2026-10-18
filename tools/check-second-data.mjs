// Read-only owner snapshots around promotion. No policy/row is created or changed.
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { DOMParser } from "linkedom";
import { parseCatalog } from "../app/publication.js";
import { HOST_CONFIG } from "../app/pagelove.js";
const file = new URL("../audit/second-data-preservation.json", import.meta.url);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
let key = "";
async function read(path) {
  const response = await fetch(HOST_CONFIG.authoringOrigin + path, {
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
    headers: { Authorization: "Bearer " + key },
  });
  if (response.status !== 200)
    throw Error("Read-only preservation snapshot failed: " + response.status);
  const html = await response.text();
  return { path, sha256: sha(html), bytes: Buffer.byteLength(html), html };
}
async function run(op) {
  if (!["before", "after"].includes(op))
    throw Error("Unsupported read-only operation");
  let report;
  if (op === "before") {
    try {
      await fs.access(file);
      throw Error("Existing snapshot must not be overwritten");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const catalog = await read("/workshop-tracks/catalog.html");
    const paths = [
      "/boards/trial.html",
      "/boards/daily.html",
      catalog.path,
      ...parseCatalog(catalog.html, DOMParser).map(
        (row) => `/workshop-tracks/${row.id}/definition.html`,
      ),
    ];
    const before = [];
    for (const path of [...new Set(paths)]) {
      const { html, ...snapshot } =
        path === catalog.path ? catalog : await read(path);
      before.push(snapshot);
    }
    report = {
      utc: new Date().toISOString(),
      origin: HOST_CONFIG.publicOrigin,
      before,
      scope:
        "Read-only owner DAV hashes of both existing board documents, the Workshop catalog and every definition referenced at baseline. Owner reads bypass access cleanup. Any concurrent change is reported rather than overwritten.",
    };
  } else {
    report = JSON.parse(await fs.readFile(file));
    report.after = [];
    for (const old of report.before) {
      const { html, ...snapshot } = await read(old.path);
      report.after.push({
        ...snapshot,
        unchanged: snapshot.sha256 === old.sha256,
      });
    }
    report.verifiedAt = new Date().toISOString();
    report.passed = report.after.every((row) => row.unchanged);
  }
  await fs.writeFile(file, JSON.stringify(report, null, 2) + "\n");
  return {
    operation: op,
    resources: report.before.length,
    passed: report.passed,
  };
}
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.setEncoding("utf8");
let input = "";
console.log(
  "Ready for hidden JSON owner key and read-only before/after operation.",
);
process.stdin.on("data", async (chunk) => {
  if (chunk.includes("\u0003")) process.exit(0);
  input += chunk;
  const end = input.search(/[\r\n]/);
  if (end < 0) return;
  process.stdin.pause();
  try {
    const command = JSON.parse(input.slice(0, end));
    key = command.key;
    if (typeof key !== "string" || !key.startsWith("pk_"))
      throw Error("Hidden owner key required");
    console.log(JSON.stringify(await run(command.op)));
  } catch (error) {
    console.log(JSON.stringify({ error: error.message }));
    process.exitCode = 1;
  } finally {
    key = "";
    process.exit(process.exitCode || 0);
  }
});
