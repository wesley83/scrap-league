// Read-only verification of the immutable dependencies used by pre-update clients.
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
const baselinePath =
    process.argv[2] || "audit/deployment-before-handbook-followup.json",
  receiptPath = process.argv[3] || "audit/handbook-old-client-assets.json";
if (
  ![baselinePath, receiptPath].every((value) =>
    /^audit\/[a-z-]+\.json$/.test(value),
  )
)
  throw Error("Use named audit JSON files");
const baselineURL = new URL("../" + baselinePath, import.meta.url);
const baselineBytes = await fs.readFile(baselineURL);
const baseline = JSON.parse(baselineBytes);
if (
  baseline.origin !== "https://hire-poker-8313.onpagelove.com" ||
  !/^sl-[a-f0-9]{14}$/.test(baseline.release)
)
  throw Error("Unexpected deployment baseline");
const prefix = "/releases/" + baseline.release + "/";
const files = baseline.publicFiles.filter((row) => row.path.startsWith(prefix));
if (!files.length || files.some((row) => row.path.includes("..")))
  throw Error("Missing or invalid old dependency inventory");
const checks = [];
for (let start = 0; start < files.length; start += 4) {
  await Promise.all(
    files.slice(start, start + 4).map(async (file) => {
      const response = await fetch(baseline.origin + file.path, {
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      const bytes = Buffer.from(await response.arrayBuffer());
      const hash = createHash("sha256").update(bytes).digest("hex");
      checks.push({
        path: file.path,
        status: response.status,
        expected: file.sha256,
        actual: hash,
        passed: response.status === 200 && hash === file.sha256,
      });
    }),
  );
}
checks.sort((a, b) => a.path.localeCompare(b.path));
const receipt = {
  utc: new Date().toISOString(),
  origin: baseline.origin,
  release: baseline.release,
  baselineSha256: createHash("sha256").update(baselineBytes).digest("hex"),
  checks,
  passed: checks.every((row) => row.passed),
};
await fs.writeFile(
  new URL("../" + receiptPath, import.meta.url),
  JSON.stringify(receipt, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    release: receipt.release,
    files: checks.length,
    passed: receipt.passed,
  }),
);
if (!receipt.passed) process.exitCode = 1;
