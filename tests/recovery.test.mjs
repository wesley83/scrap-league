import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { openStore, freshProgress } from "../app/storage.js";
import { Workshop } from "../app/workshop.js";
import {
  captureAttempt,
  resolveAttempt,
  updateDegradation,
  recoverProgressContent,
} from "../app/continuation.js";
import { loadContent } from "../tools/content.mjs";
import { compile } from "../app/track.js";
import { RULES } from "../app/builds.js";
const content = await loadContent(),
  track = content.tracks[0].track;
test("unsupported saved parts recover without discarding rewards or the original record", async () => {
  const s = await openStore({ factory: new IDBFactory() }),
    original = freshProgress();
  original.completed = [1, 2];
  original.build.engine = "removed-engine";
  await s.set("progress", original);
  const recovery = recoverProgressContent(original, content);
  assert.equal(recovery.reasons.length, 1);
  await s.archiveAndRecoverProgress(original, recovery.progress);
  assert.deepEqual((await s.get("progress")).completed, [1, 2]);
  assert.equal((await s.get("progress")).build.engine, "courier");
  assert.equal(
    (await s.get((await s.keys("archive:"))[0])).original.build.engine,
    "removed-engine",
  );
  s.close();
});
const create = () => openStore({ factory: new IDBFactory() });
function editor(store, baseline = 0) {
  const w = Object.create(Workshop.prototype);
  Object.assign(w, {
    store,
    track: structuredClone(track),
    baseline,
    generation: 0,
    tested: "",
    zoom: 1,
    pan: { x: 0, y: 0 },
    saveChain: Promise.resolve(),
    saveTimer: null,
    history: [],
    future: [],
    q: () => ({ textContent: "" }),
    notify() {},
    refresh() {},
    draw() {},
    save() {},
  });
  return w;
}
const result = (id = "run", elapsedMs = 90000) => ({
  id,
  key: "trial-key",
  mode: "league",
  trackId: track.id,
  elapsedMs,
  splits: [30000, 30000, elapsedMs - 60000],
  dnf: false,
  difficulty: "club",
  classification: [{ id: "player" }],
  createdAt: new Date().toISOString(),
});

test("concurrent draft rejection followed by open preserves the unsaved working copy", async () => {
  const s = await create();
  await s.saveDraft(track, 0, {}, "");
  const w = editor(s, 1);
  w.track.name = "Unsaved changes";
  await s.saveDraft({ ...track, name: "Other tab" }, 1, {}, "");
  w.saveTimer = setTimeout(() => {}, 10000);
  await assert.rejects(
    w.open(content.tracks[1].track),
    /changed in another tab/,
  );
  assert.equal(w.track.name, "Unsaved changes");
  assert.equal((await s.get("draft:" + track.id)).track.name, "Other tab");
  await w.saveCopy();
  assert.notEqual(w.track.id, track.id);
  assert.equal(w.track.name, "Unsaved changes — copy");
  assert.equal((await s.get("draft:" + w.track.id)).track.name, w.track.name);
  s.close();
});
test("quota rejection followed by navigation retains draft and allows export", async () => {
  const downloads = [];
  const w = editor({
    saveDraft: async () => {
      throw new DOMException("No space", "QuotaExceededError");
    },
  });
  w.track.name = "Keep me";
  w.compiled = compile(w.track);
  w.download = (...args) => downloads.push(args);
  w.saveTimer = setTimeout(() => {}, 10000);
  await assert.rejects(w.open(content.tracks[1].track), {
    name: "QuotaExceededError",
  });
  w.export();
  assert.equal(w.track.name, "Keep me");
  assert.match(downloads[0][1], /Keep me/);
});
test("opening a saved draft preserves zoom pan and selection", async () => {
  const w = editor(null);
  const view = {
    zoom: 2.75,
    pan: { x: 30, y: 42 },
    selected: track.pieces[2].id,
  };
  await w.open(track, { revision: 2, view });
  assert.equal(w.zoom, view.zoom);
  assert.deepEqual(w.pan, view.pan);
  assert.equal(w.selected, view.selected);
});
for (const stage of ["after-result", "after-best"])
  test(
    "result transaction abort at " +
      stage +
      " rolls back rewards, best and ghost together",
    async () => {
      const s = await create();
      const p = freshProgress();
      p.cup = { id: "cup", index: 0, rounds: [] };
      await s.set("progress", p);
      await assert.rejects(
        s.commitResult(result(), new Float32Array([0, 1, 2, 3]), "cup", 0, {
          fault: (tx, where) => {
            if (where === stage) tx.abort();
          },
        }),
        /abort/i,
      );
      assert.deepEqual((await s.get("progress")).completed, []);
      assert.equal(await s.get("result:run"), undefined);
      assert.equal(await s.get("best:trial-key"), undefined);
      await s.commitResult(result(), new Float32Array([0, 1, 2, 3]), "cup", 0);
      await s.commitResult(result(), new Float32Array([9, 9, 9, 9]), "cup", 0);
      assert.deepEqual((await s.get("progress")).completed, [1]);
      assert.equal((await s.get("progress")).cup.rounds.length, 1);
      assert.deepEqual(
        Array.from((await s.get("best:trial-key")).ghost),
        [0, 1, 2, 3],
      );
      s.close();
    },
  );
test("schema migration preserves v1 progress drafts ghosts and archives unsupported records", async () => {
  const factory = new IDBFactory();
  const p = freshProgress();
  p.completed = [1];
  p.presets = [{ name: "Favorite", build: p.build }];
  await new Promise((resolve, reject) => {
    const req = factory.open("scrap-league", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("records");
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result,
        tx = db.transaction("records", "readwrite"),
        s = tx.objectStore("records");
      s.put(p, "progress");
      s.put({ revision: 1, track }, "draft:" + track.id);
      s.put(
        { result: result(), ghost: new Float32Array([0, 1, 2, 3]) },
        "best:k",
      );
      s.put({ version: 999 }, "draft:future");
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    };
  });
  const s = await openStore({ factory });
  assert.deepEqual((await s.get("progress")).completed, [1]);
  assert.equal((await s.get("progress")).presets[0].name, "Favorite");
  assert.equal((await s.get("draft:" + track.id)).track.id, track.id);
  assert.equal((await s.get("best:k")).ghost.length, 4);
  assert.ok(await s.get("archive:draft:future"));
  assert.ok(s.db.objectStoreNames.contains("ghosts"));
  s.close();
});
test("backup restore is atomic, rejects malformed ghosts, and category reset preserves other data", async () => {
  const s = await create();
  const p = freshProgress();
  p.completed = [1];
  p.presets = [{ name: "Car", build: p.build }];
  await s.set("progress", p);
  await s.saveDraft(track, 0, { zoom: 2 }, "");
  await s.set("settings", { sound: false });
  await s.commitResult(
    { ...result(), mode: "trial" },
    new Float32Array([0, 1, 2, 3]),
  );
  const backup = await s.exportBackup();
  const bad = structuredClone(backup);
  bad.entries.find((e) => e.store === "ghosts").value.data = ["bad"];
  await assert.rejects(s.importBackup(bad), /Invalid backup ghost/);
  assert.deepEqual((await s.get("progress")).completed, [1]);
  await s.reset("progression");
  assert.deepEqual((await s.get("progress")).completed, []);
  assert.equal((await s.get("progress")).presets.length, 1);
  assert.ok(await s.get("draft:" + track.id));
  await s.importBackup(JSON.parse(JSON.stringify(backup)));
  assert.deepEqual((await s.get("progress")).completed, [1]);
  assert.deepEqual(
    Array.from((await s.get("best:trial-key")).ghost),
    [0, 1, 2, 3],
  );
  s.close();
});
test("outbox claims are exclusive, expired leases recover and late responses cannot acknowledge a new claim", async () => {
  const s = await create();
  await s.enqueueRun({ id: "score" });
  await s.enqueueRun({ id: "score" });
  const a = await s.claimRun("a", 100);
  assert.ok(a);
  assert.equal(await s.claimRun("b", 200), null);
  const b = await s.claimRun("b", 30200);
  assert.ok(b);
  await assert.rejects(
    s.settleRun("score", a.lease.id, "confirmed", "", 30300),
    /expired/,
  );
  await s.settleRun("score", b.lease.id, "confirmed", "", 30300);
  assert.equal((await s.get("outbox:score")).state, "confirmed");
  assert.equal((await s.keys("outbox:")).length, 1);
  s.close();
});
test("closed storage connection rejects without claiming success", async () => {
  const s = await create();
  s.close();
  await assert.rejects(s.set("settings", {}), /Reload to reconnect/);
});
test("cup continuation consumes captured track build parts and seed despite changed defaults", () => {
  const p = freshProgress();
  const race = {
    id: "attempt",
    index: 0,
    track: compile(track),
    trackRevision: "original",
    build: p.build,
    settingsSnapshot: { assist: false, autoAccelerate: false },
    seed: 123,
    rivals: content.rivals,
    difficulty: "club",
  };
  const cup = { pending: captureAttempt(race, content.parts) };
  const now = { ...track, name: "Changed layout" };
  const resumed = resolveAttempt(cup, 0, now, {
    ...p.build,
    engine: "different",
  });
  assert.equal(resumed.track.name, track.name);
  assert.deepEqual(resumed.build, p.build);
  assert.equal(resumed.seed, 123);
  assert.equal(resumed.settings.assist, false);
  assert.deepEqual(resumed.parts, content.parts);
  cup.pending.rules = RULES + "future";
  assert.throws(
    () => resolveAttempt(cup, 0, now, p.build),
    /different racing rules/,
  );
});
test("performance degradation requires sustained overload and survives recovery", () => {
  const race = {};
  updateDegradation(race, 0.2, 0.06);
  assert.equal(race.performanceDegraded, undefined);
  updateDegradation(race, 0.016, 0.016);
  assert.equal(race.overloadSeconds, 0);
  for (let i = 0; i < 21; i++) updateDegradation(race, 0.1, 0.06);
  assert.equal(race.performanceDegraded, true);
  updateDegradation(race, 0.016, 0.016);
  assert.equal(race.performanceDegraded, true);
});
test("backup rejects malformed result and ghost timelines before replacing any saves", async () => {
  const s = await create();
  await s.commitResult(
    { ...result(), mode: "trial" },
    new Float32Array([0, 1, 2, 0, 1, 2, 3, 0]),
  );
  const backup = await s.exportBackup();
  for (const data of [
    [0, 1, 2, 0, 0, 2, 3, 0],
    [0, 1, 2],
    [0, 2000, 0, 0],
  ]) {
    const bad = structuredClone(backup);
    bad.entries.find((e) => e.store === "ghosts").value.data = data;
    await assert.rejects(s.importBackup(bad), /ghost/i);
    assert.equal((await s.get("best:trial-key")).result.elapsedMs, 90000);
  }
  const bad = structuredClone(backup);
  bad.entries.find((e) => e.store === "results").value.splits = ["bad"];
  await assert.rejects(s.importBackup(bad), /saved result/);
  assert.equal((await s.get("best:trial-key")).result.elapsedMs, 90000);
  s.close();
});
