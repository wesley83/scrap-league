import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { DOMParser } from "linkedom";
import {
  Boards,
  RETENTION_MS,
  parseRuns,
  ranked,
  boardKey,
  runHTML,
  contentKeys,
  recognized,
  submission,
} from "../app/boards.js";
import { openStore } from "../app/storage.js";
import { loadContent } from "../tools/content.mjs";
import { RULES } from "../app/builds.js";
const content = await loadContent(),
  keys = await contentKeys(content),
  run = {
    id: crypto.randomUUID(),
    alias: "Fixture",
    mode: "trial",
    trackId: content.tracks[0].track.id,
    trackRevision: content.tracks[0].revision,
    rulesRevision: RULES,
    buildRevision: [...keys.builds][0],
    assist: "steering-off:manual",
    laps: 3,
    challenge: "",
    elapsedMs: 90000,
    splits: [30000, 30000, 30000],
  },
  config = {
    readinessRevision: "isolated-fixture-only",
    paths: { trial: "/boards/trial.html", daily: "/boards/daily.html" },
  };
function record(run, at) {
  return runHTML(run).replace(
    "</li>",
    '<meta itemprop="receivedAt" content="' +
      at +
      '"><meta itemprop="expiresAt" content="' +
      (at + RETENTION_MS) +
      '"></li>',
  );
}
test("strict run boundary rejects missing identifiers, unsupported content and mismatched captured daily", () => {
  assert.equal(recognized(run, keys), true);
  for (const patch of [
    { id: 'x"] ) *' },
    { buildRevision: "x" },
    { assist: "anything" },
    { rulesRevision: "old" },
    { alias: "  " },
    { expiresAt: 1 },
    { trackRevision: "f".repeat(64) },
    { mode: "daily", challenge: content.daily[0].id },
  ])
    assert.throws(() => recognized({ ...run, ...patch }, keys));
  const challenge = content.daily[0],
    daily = keys.daily.get(challenge.id);
  assert.equal(
    recognized(
      {
        ...run,
        ...daily,
        trackRevision: keys.tracks.get(daily.trackId),
        mode: "daily",
        challenge: challenge.id,
      },
      keys,
    ),
    true,
  );
  const result = { ...run, assistance: run.assist, dnf: false };
  assert.equal(submission(result, " Ada ").alias, "Ada");
  assert.throws(() =>
    submission({ ...result, performanceDegraded: true }, "Ada"),
  );
});
test("retention uses exact expiry and preserves active interleaved records and principal-time ties", () => {
  const at = 1700000000000,
    rows = parseRuns(
      "<ul>" +
        [
          record(
            { ...run, id: crypto.randomUUID(), alias: "Expired" },
            at - RETENTION_MS,
          ),
          record({ ...run, alias: "Active" }, at),
          record({ ...run, id: crypto.randomUUID(), alias: "Earlier" }, at - 1),
        ].join("") +
        "</ul>",
      DOMParser,
    );
  assert.equal(ranked(rows, boardKey(run), at - 1).length, 3);
  assert.deepEqual(
    ranked(rows, boardKey(run), at).map((r) => r.alias),
    ["Earlier", "Active"],
  );
  assert.equal(ranked(rows, boardKey(run), at + RETENTION_MS).length, 0);
});
test("two outbox clients reconcile timeout-after-acceptance once with original id", async () => {
  const store = await openStore({ factory: new IDBFactory() }),
    now = 1700000000000;
  await store.enqueueRun(run);
  let html = "",
    writes = 0;
  const fetcher = async (url, options) => {
    assert.equal(options.credentials, "omit");
    if (options.method === "POST") {
      writes++;
      html = record(run, now);
      throw Error("Response lost after acceptance");
    }
    return new Response(html, {
      headers: { Date: new Date(now).toUTCString() },
    });
  };
  const a = new Boards(store, {
      config,
      fetcher,
      Parser: DOMParser,
      clock: () => now,
    }),
    b = new Boards(store, {
      config,
      fetcher,
      Parser: DOMParser,
      clock: () => now,
    });
  await Promise.all([a.pump(), b.pump()]);
  assert.equal(writes, 1);
  assert.equal((await store.get("outbox:" + run.id)).state, "confirmed");
  store.close();
});
test("failed refresh retains cached standings and removes expired rows offline", async () => {
  const store = await openStore({ factory: new IDBFactory() });
  let now = 1700000000000,
    fail = false;
  const board = new Boards(store, {
    config,
    Parser: DOMParser,
    clock: () => now,
    fetcher: async () => {
      if (fail) throw Error("Offline");
      return new Response(record(run, now), {
        headers: { Date: new Date(now).toUTCString() },
      });
    },
  });
  assert.equal((await board.refresh(run)).stale, false);
  fail = true;
  assert.equal((await board.refresh(run)).rows.length, 1);
  now += RETENTION_MS;
  const saved = await board.refresh(run);
  assert.equal(saved.stale, true);
  assert.equal(saved.rows.length, 0);
  store.close();
});
test("unconfigured board makes no network request and terminal history does not fill pending capacity", async () => {
  const store = await openStore({ factory: new IDBFactory() }),
    board = new Boards(store, {
      config: null,
      Parser: DOMParser,
      fetcher: () => {
        throw Error("Unexpected network");
      },
    });
  await board.pump();
  await assert.rejects(board.refresh(run), /activation/);
  for (let i = 0; i < 105; i++)
    await store.set("outbox:terminal-" + i, {
      run: { ...run, id: "terminal-" + i },
      state: "confirmed",
      createdAt: i,
    });
  await store.enqueueRun(run);
  assert.ok((await store.keys("outbox:")).length <= 51);
  store.close();
});
