import { createHash } from "node:crypto";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const names = ["/index.html", "/release.json", "/sw.js"];
// Root promotion rollback leaves content, Workshop/catalog/board data, native
// routes and every immutable release intact. Those have their own histories.
export async function restoreRoot(plan, { read, write, equivalent }) {
  if (
    plan.length !== 3 ||
    names.some((name) => plan.filter((p) => p.path === name).length !== 1)
  )
    throw Error("Rollback requires exactly the three root entries.");
  for (const item of plan) {
    if (sha(item.bytes) !== item.hash)
      throw Error("Rollback baseline changed.");
    const current = await read(item.path);
    if (
      current.status !== 200 ||
      !current.etag ||
      current.etag !== item.etag ||
      sha(current.bytes) !== item.currentHash
    )
      throw Error("Concurrent change prevents rollback: " + item.path);
  }
  const receipt = [];
  for (const name of names) {
    const item = plan.find((p) => p.path === name);
    let response;
    try {
      response = await write(name, item.bytes, item.etag);
    } catch {
      /* Reconcile ambiguity without replay. */
    }
    const after = await read(name);
    if (
      after.status !== 200 ||
      !equivalent(name, item.bytes, after.bytes) ||
      (response && ![200, 201, 204].includes(response.status))
    )
      throw Error("Rollback readback failed: " + name);
    receipt.push({
      path: name,
      sha256: sha(after.bytes),
      status: response?.status || "reconciled",
    });
  }
  return receipt;
}
