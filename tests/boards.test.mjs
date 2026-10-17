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
import { resultOf } from "../app/simulation.js";
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
    policyRevision: "isolated-fixture-only",
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

test("standings keep the captured physics revision in their comparison key", () => {
  const at = 1700000000000;
  const old = {
    ...run,
    id: crypto.randomUUID(),
    rulesRevision: "scrap-physics-v1.0.0",
    elapsedMs: 60000,
    splits: [20000, 20000, 20000],
  };
  const rows = parseRuns(
    "<ul>" + record(old, at) + record(run, at) + "</ul>",
    DOMParser,
  );
  assert.notEqual(boardKey(old), boardKey(run));
  assert.deepEqual(
    ranked(rows, boardKey(run), at).map((x) => x.id),
    [run.id],
  );
  assert.deepEqual(
    ranked(rows, boardKey(old), at).map((x) => x.id),
    [old.id],
  );
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

test("public board reads paginate safely and rank records across page boundaries", async () => {
  const store = await openStore({ factory: new IDBFactory() }),
    now = 1700000000000,
    all = Array.from({ length: 101 }, (_, index) => ({
      ...run,
      id: crypto.randomUUID(),
      alias: "Driver " + index,
      elapsedMs: 90000 + index,
      splits: [30000, 30000, 30000 + index],
    }));
  let calls = 0;
  const board = new Boards(store, {
    config,
    Parser: DOMParser,
    clock: () => now,
    fetcher: async (url, options) => {
      const target = new URL(url),
        page = Number(target.searchParams.get("paginate:runs:page"));
      assert.equal(target.origin, "https://hire-poker-8313.onpagelove.com");
      assert.equal(target.pathname, "/boards/trial.html");
      assert.equal(target.searchParams.get("paginate:runs:length"), "100");
      assert.equal(options.headers.Range, "selector=#runs");
      calls++;
      return new Response(
        all
          .slice((page - 1) * 100, page * 100)
          .map((row) => record(row, now))
          .join(""),
        {
          status: 206,
          headers: {
            Date: new Date(now).toUTCString(),
            ...(page === 1
              ? {
                  Link: '<https://hire-poker-8313.onpagelove.com/boards/trial.html?paginate:runs:page=2>; rel="last"',
                }
              : {}),
          },
        },
      );
    },
  });
  const result = await board.refresh(run);
  assert.equal(result.rows.length, 25);
  assert.equal(result.rows[0].elapsedMs, 90000);
  assert.equal(calls, 2);
  store.close();
});

test("empty Pagelove paginator sentinel reads as an empty board", async () => {
  const store = await openStore({ factory: new IDBFactory() });
  let calls = 0;
  const board = new Boards(store, {
    config,
    Parser: DOMParser,
    fetcher: async (url) => {
      const target = new URL(url);
      assert.equal(
        target.searchParams.get("paginate:runs:page"),
        "1",
      );
      assert.equal(
        target.searchParams.get("paginate:runs:length"),
        "100",
      );
      calls++;
      return new Response("<ul id=\"runs\"></ul>", {
        headers: {
          Link: '</boards/trial.html?paginate:runs:page=0>; rel="last"; title="runs"',
        },
      });
    },
  });
  const { rows, stale } = await board.refresh(run);
  assert.equal(rows.length, 0);
  assert.equal(stale, false);
  assert.equal(calls, 1);
  store.close();
});

test("bounded reads retry temporary provider errors, while writes remain single-shot", async () => {
  const store = await openStore({ factory: new IDBFactory() });
  let reads = 0;
  const board = new Boards(store, {
    config,
    Parser: DOMParser,
    fetcher: async () => {
      reads++;
      return reads < 3
        ? new Response("temporarily unavailable", { status: 503 })
        : new Response("<ul id=\"runs\"></ul>", {
            headers: {
              Link: '</boards/trial.html?paginate:runs:page=0>; rel="last"; title="runs"',
            },
          });
    },
  });
  assert.equal((await board.readRows("trial")).rows.length, 0);
  assert.equal(reads, 3);
  let writes = 0;
  const writer = new Boards(store, {
    config,
    Parser: DOMParser,
    fetcher: async () => {
      writes++;
      return new Response("temporarily unavailable", { status: 503 });
    },
  });
  const response = await writer.request("trial", {
    method: "POST",
    headers: { Range: "selector=#runs" },
    body: "<li></li>",
  });
  assert.equal(response.status, 503);
  assert.equal(writes, 1);
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
  await assert.rejects(board.refresh(run), /configured/);
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

test("daily captured before UTC midnight survives finish, reopen and upload two days later", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: Date.parse("2026-10-16T23:59:30Z"),
  });
  const day = new Date().toISOString().slice(0, 10);
  const challenge = content.daily.find((d) => d.date === day),
    captured = keys.daily.get(challenge.id);
  const race = {
    id: crypto.randomUUID(),
    mode: "daily",
    key: "captured-daily",
    laps: 3,
    challenge: challenge.id,
    challengeDate: day,
    buildRevision: captured.buildRevision,
    trackRevision: keys.tracks.get(captured.trackId),
    settingsSnapshot: { assist: false, autoAccelerate: false },
    track: {
      source: content.tracks.find((x) => x.track.id === captured.trackId).track,
    },
    cars: [
      {
        id: "player",
        finishTime: 90,
        lapTimes: [30, 30, 30],
        contacts: 0,
        resets: 0,
        grid: 0,
      },
    ],
  };
  t.mock.timers.tick(90000);
  const result = resultOf(race),
    payload = submission(result, "Midnight fixture");
  assert.equal(result.createdAt.slice(0, 10), "2026-10-17");
  assert.equal(result.challengeDate, "2026-10-16");
  assert.equal(recognized(payload, keys), true);
  const factory = new IDBFactory();
  let store = await openStore({ factory });
  await store.enqueueRun(payload);
  store.close();
  t.mock.timers.tick(2 * 86400000);
  store = await openStore({ factory });
  let accepted = "",
    requests = 0;
  const board = new Boards(store, {
    config,
    Parser: DOMParser,
    fetcher: async (_url, options) => {
      if (options.method === "POST") {
        requests++;
        assert.match(options.body, new RegExp(challenge.id));
        accepted = record(payload, Date.now());
        return new Response("", { status: 201 });
      }
      return new Response(accepted, {
        headers: { Date: new Date().toUTCString() },
      });
    },
  });
  await board.pump();
  assert.equal(requests, 1);
  assert.equal(
    (await store.get("outbox:" + payload.id)).run.challenge,
    challenge.id,
  );
  assert.equal((await store.get("outbox:" + payload.id)).state, "confirmed");
  store.close();
});

test("pending capacity preserves all queued identities and a permanent rejection is not retried", async () => {
  const store = await openStore({ factory: new IDBFactory() });
  for (let i = 0; i < 100; i++)
    await store.enqueueRun({ ...run, id: crypto.randomUUID() });
  const before = (await store.keys("outbox:")).sort();
  await assert.rejects(
    store.enqueueRun({ ...run, id: crypto.randomUUID() }),
    /queue is full/,
  );
  assert.deepEqual((await store.keys("outbox:")).sort(), before);
  await store.reset("outbox");
  await store.enqueueRun(run);
  let writes = 0;
  const board = new Boards(store, {
    config,
    Parser: DOMParser,
    fetcher: async (_url, options) => {
      if (options.method === "POST") {
        writes++;
        return new Response("Invalid", { status: 422 });
      }
      return new Response("");
    },
  });
  await board.pump();
  await board.pump();
  assert.equal(writes, 1);
  const rejected = await store.get("outbox:" + run.id);
  assert.equal(rejected.state, "rejected");
  assert.deepEqual(rejected.run, run);
  store.close();
});
