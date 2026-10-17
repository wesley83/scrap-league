import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { DOMParser } from "linkedom";
import { openStore } from "../app/storage.js";
import { Boards, contentKeys, retryAfterAt } from "../app/boards.js";
import { normalizeSettings } from "../app/preferences.js";
import { driverAlias, rememberDriver } from "../app/driver-profile.js";
import { showSubmission } from "../app/submission-ui.js";
import { loadContent } from "../tools/content.mjs";
import { RULES } from "../app/builds.js";
const content = await loadContent(),
  keys = await contentKeys(content);
const result = () => ({
  id: crypto.randomUUID(),
  mode: "trial",
  trackId: content.tracks[0].track.id,
  trackName: "Yard Loop",
  trackRevision: content.tracks[0].revision,
  rulesRevision: RULES,
  buildRevision: [...keys.builds][0],
  assistance: "steering-off:manual",
  laps: 3,
  elapsedMs: 90000,
  splits: [30000, 30000, 30000],
});
const config = {
  policyRevision: "fixture",
  paths: { trial: "/boards/trial.html", daily: "/boards/daily.html" },
};
test("a failed optional board cache does not turn a successful read into an unavailable board", async () => {
  const board = new Boards(
    {
      set: async () => {
        throw Error("quota");
      },
      get: async () => null,
    },
    {
      config,
      Parser: DOMParser,
      fetcher: async () => new Response(""),
    },
  );
  const { submission } = await import("../app/boards.js");
  const value = await board.refresh(submission(result(), "Driver"));
  assert.equal(value.stale, false);
  assert.deepEqual(value.rows, []);
  assert.equal(value.cacheError, "quota");
});

test("nickname normalization preserves Unicode and invalid/storage failures preserve the saved preference", async () => {
  assert.equal(driverAlias("  Jose\u0301  "), "José");
  assert.equal(driverAlias("🏎".repeat(24)), "🏎".repeat(24));
  assert.throws(() => driverAlias("🏎".repeat(25)), /1–24/);
  assert.throws(() => driverAlias("a\nb"), /control/);
  assert.equal(
    normalizeSettings({ driverAlias: "\u0000", sound: true }).driverAlias,
    "Driver",
  );
  const settings = normalizeSettings({ driverAlias: "First" });
  await assert.rejects(
    rememberDriver(
      settings,
      { set: () => Promise.reject(Error("quota")) },
      "Second",
    ),
    /quota/,
  );
  assert.equal(settings.driverAlias, "First");
});

test("unavailable board never blocks name entry, invalid input stays open, queue survives reopen", async () => {
  const factory = new IDBFactory(),
    store = await openStore({ factory }),
    settings = normalizeSettings();
  const document = new DOMParser().parseFromString(
    "<!doctype html><html><body></body></html>",
    "text/html",
  );
  let pumpCalls = 0;
  const boards = {
    refresh: async () => {
      throw Error("offline");
    },
    pump: async () => {
      pumpCalls++;
    },
  };
  const r = result();
  const open = () =>
    showSubmission({
      document,
      result: r,
      settings,
      store,
      boards,
      identities: keys,
      current: () => true,
      dialog: (_title, body) => document.body.replaceChildren(body),
    });
  await open();
  await new Promise((r) => setTimeout(r, 0));
  const form = document.querySelector("form"),
    input = form.querySelector("input");
  assert.match(document.body.textContent, /Times unavailable/);
  input.value = "  ";
  await form.onsubmit({ preventDefault() {} });
  assert.equal(input.value, "  ");
  assert.equal(input.getAttribute("aria-invalid"), "true");
  assert.equal((await store.keys("outbox:")).length, 0);
  input.value = "Wesley 🏎";
  await form.onsubmit({ preventDefault() {} });
  assert.equal((await store.get("outbox:" + r.id)).run.alias, "Wesley 🏎");
  assert.equal((await store.get("settings")).driverAlias, "Wesley 🏎");
  assert.equal(pumpCalls, 1);
  await open();
  assert.equal(document.querySelector("input").readOnly, true);
  assert.equal(document.querySelector("input").value, "Wesley 🏎");
  assert.match(document.body.textContent, /Time queued/);
  store.close();
  const reopened = await openStore({ factory });
  assert.equal((await reopened.get("outbox:" + r.id)).run.alias, "Wesley 🏎");
  reopened.close();
});

test("queued identity cannot change payload; manual retry respects server delay and another tab's lease", async () => {
  const store = await openStore({ factory: new IDBFactory() });
  const run = { id: crypto.randomUUID(), alias: "Original" };
  await store.enqueueRun(run);
  await assert.rejects(
    store.enqueueRun({ ...run, alias: "Changed" }),
    /original driver name/,
  );
  const claim = await store.claimRun("one", 100);
  await store.retryRuns(null, 200);
  assert.equal(await store.claimRun("two", 201), null);
  await store.settleRun(run.id, claim.lease.id, "retry", "offline", 300, 10000);
  await store.retryRuns(run.id, 400);
  assert.equal(await store.claimRun("two", 401), null);
  const next = await store.claimRun("two", 10001);
  assert.ok(next);
  await store.settleRun(run.id, next.lease.id, "retry", "offline", 10002);
  await store.retryRuns(run.id, 10003);
  assert.ok(await store.claimRun("three", 10004));
  store.close();
});

test("a request outliving its lease is attempted once per pump and stays recoverable", async () => {
  const store = await openStore({ factory: new IDBFactory() });
  const r = result(),
    { submission } = await import("../app/boards.js"),
    run = submission(r, "Driver");
  await store.enqueueRun(run);
  let clock = 100,
    calls = 0;
  const board = new Boards(store, {
    config,
    Parser: DOMParser,
    clock: () => clock,
    fetcher: async () => {
      calls++;
      clock += 31000;
      throw Error("slow connection");
    },
  });
  await board.pump();
  assert.equal(calls, 1);
  assert.equal((await store.get("outbox:" + run.id)).state, "sending");
  assert.ok(await store.claimRun("other", clock));
  store.close();
});

test("server Retry-After dates and seconds defer a queue read without a retry storm", async () => {
  assert.equal(
    retryAfterAt(new Response("", { headers: { "Retry-After": "60" } }), 1000),
    61000,
  );
  const when = Date.parse("2026-10-17T21:00:00Z");
  assert.equal(
    retryAfterAt(
      new Response("", {
        headers: { "Retry-After": new Date(when).toUTCString() },
      }),
      when - 1000,
    ),
    when,
  );
  const store = await openStore({ factory: new IDBFactory() }),
    { submission } = await import("../app/boards.js");
  const run = submission(result(), "Driver");
  await store.enqueueRun(run);
  let calls = 0;
  const board = new Boards(store, {
    config,
    Parser: DOMParser,
    clock: () => 1000,
    fetcher: async () => {
      calls++;
      return new Response("Slow down", {
        status: 429,
        headers: { "Retry-After": "60" },
      });
    },
  });
  await board.pump();
  await store.retryRuns(run.id, 2000);
  assert.equal(calls, 1);
  assert.equal((await store.get("outbox:" + run.id)).nextAttemptAt, 61000);
  store.close();
});
