import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { restoreRoot } from "../tools/rollback.mjs";
const sha = (b) => createHash("sha256").update(b).digest("hex");
function fixture() {
  const names = ["/index.html", "/release.json", "/sw.js"];
  const remote = new Map([
    ...names.map((n) => [n, Buffer.from("B " + n)]),
    ["/boards/trial.html", Buffer.from("player rows")],
    ["/workshop-tracks/saved", Buffer.from("draft")],
    ["/releases/A/main.js", Buffer.from("old client")],
  ]);
  const writes = [];
  const plan = names.map((path) => ({
    path,
    bytes: Buffer.from("A " + path),
    hash: sha(Buffer.from("A " + path)),
    currentHash: sha(remote.get(path)),
    etag: "B",
  }));
  return {
    remote,
    writes,
    plan,
    driver: {
      read: async (name) => ({
        status: 200,
        etag: "B",
        bytes: remote.get(name),
      }),
      write: async (name, bytes, etag) => {
        assert.equal(etag, "B");
        writes.push(name);
        remote.set(name, bytes);
        if (name === "/release.json") throw Error("Lost success");
        return { status: 204 };
      },
      equivalent: (name, a, b) => a.equals(b),
    },
  };
}
test("conditional A→B→A root restoration reconciles ambiguity and preserves user documents and dependencies", async () => {
  const f = fixture(),
    before = new Map(f.remote);
  const result = await restoreRoot(f.plan, f.driver);
  assert.equal(result[1].status, "reconciled");
  assert.equal(f.writes.length, 3);
  for (const [name, bytes] of before)
    assert.deepEqual(
      f.remote.get(name),
      name.startsWith("/boards/") ||
        name.startsWith("/workshop-") ||
        name.startsWith("/releases/")
        ? bytes
        : Buffer.from("A " + name),
    );
});
test("rollback refuses stale state and altered baseline before the first write", async () => {
  for (const kind of ["stale", "corrupt"]) {
    const f = fixture();
    if (kind === "stale") f.remote.set("/sw.js", Buffer.from("C"));
    else f.plan[0].bytes = Buffer.from("bad");
    await assert.rejects(restoreRoot(f.plan, f.driver));
    assert.equal(f.writes.length, 0);
  }
});
