import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { webcrypto, createHash } from "node:crypto";
import { MessageChannel } from "node:worker_threads";
const source = await readFile(
    new URL("../tools/worker-runtime.js", import.meta.url),
    "utf8",
  ),
  sha = (x) => createHash("sha256").update(x).digest("hex");
function lab(
  release = "sl-aaaaaaaaaaaaaa",
  shared = new Map(),
  index = "index " + release,
) {
  const handlers = {},
    network = new Map(),
    fault = { quota: false, offline: false, corrupt: false },
    clients = [];
  const entries = [
    { url: "./", hash: sha(index) },
    { url: "./releases/" + release + "/main.js", hash: sha("main " + release) },
  ];
  entries.forEach((e, i) =>
    network.set(
      new URL(e.url, "https://game.test/sw.js").href,
      i ? "main " + release : index,
    ),
  );
  const caches = {
    async open(name) {
      if (!shared.has(name)) shared.set(name, new Map());
      const map = shared.get(name);
      return {
        async match(key) {
          return map.get(typeof key === "string" ? key : key.url)?.clone();
        },
        async put(key, response) {
          if (fault.quota)
            throw new DOMException("Quota", "QuotaExceededError");
          map.set(typeof key === "string" ? key : key.url, response.clone());
        },
        async keys() {
          return [...map.keys()].map((url) => new Request(url));
        },
      };
    },
    async delete(name) {
      return shared.delete(name);
    },
    async keys() {
      return [...shared.keys()];
    },
    async match(key) {
      for (const name of shared.keys()) {
        const r = await (await caches.open(name)).match(key);
        if (r) return r;
      }
    },
  };
  const self = {
    location: new URL("https://game.test/sw.js"),
    clients: { matchAll: async () => [...clients], claim: async () => {} },
    skipWaiting: async () => {
      state.activated++;
    },
    addEventListener: (name, fn) => (handlers[name] = fn),
  };
  const state = { activated: 0 };
  vm.runInNewContext(
    `const CACHE=${JSON.stringify(release)},INVENTORY=${JSON.stringify(entries)};\n` +
      source,
    {
      self,
      caches,
      crypto: webcrypto,
      fetch: async (key) => {
        if (fault.offline) throw Error("Offline");
        const url = typeof key === "string" ? key : key.url;
        if (fault.routeStatus && /\/(editor|track)\//.test(url))
          return new Response("Route unavailable", {
            status: fault.routeStatus,
          });
        return new Response(
          fault.corrupt
            ? "corrupt"
            : network.get(typeof key === "string" ? key : key.url) || "",
          {
            status: network.has(typeof key === "string" ? key : key.url)
              ? 200
              : 404,
          },
        );
      },
      MessageChannel,
      URL,
      Response,
      Request,
      Headers,
      AbortSignal,
      Uint8Array,
      Date,
      setTimeout,
      clearTimeout,
      console,
    },
  );
  async function event(name, data) {
    let work, response;
    handlers[name]({
      ...data,
      waitUntil: (p) => (work = p),
      respondWith: (p) => (response = p),
    });
    await work;
    return response;
  }
  async function message(type, extra = {}) {
    let reply;
    await event("message", {
      data: {
        type,
        token: crypto.randomUUID(),
        deadline: Date.now() + 1000,
        ...extra,
      },
      ports: [{ postMessage: (r) => (reply = r) }],
    });
    return reply;
  }
  return {
    release,
    entries,
    shared,
    caches,
    clients,
    fault,
    network,
    state,
    install: () => event("install", {}),
    message,
    event,
  };
}
test("worker checks actual cached bytes, repairs corruption, and survives runtime restart", async () => {
  const l = lab();
  await l.install();
  assert.equal((await l.message("STATUS")).ok, true);
  const cache = await l.caches.open(l.release);
  await cache.put("https://game.test/", new Response("corrupt"));
  assert.equal((await l.message("STATUS")).ok, false);
  assert.equal((await l.message("REPAIR")).ok, true);
  const restarted = lab(l.release, l.shared);
  restarted.fault.offline = true;
  assert.equal((await restarted.message("STATUS")).ok, true);
  const response = await restarted.event("fetch", {
    request: new Request("https://game.test/"),
  });
  assert.equal(await response.text(), "index " + l.release);
});

test("installed native-route fallback preserves URL meaning and verified cache bytes", async () => {
  const release = "sl-aaaaaaaaaaaaaa",
    index = `<html><head><base href="./releases/${release}/"></head><body><main>Installed yard</main></body></html>`;
  for (const failure of ["offline", 404, 503]) {
    const l = lab(release, new Map(), index);
    await l.install();
    if (failure === "offline") l.fault.offline = true;
    else l.fault.routeStatus = failure;
    for (const path of [
      "/editor/yard-loop",
      "/track/yard-loop",
      "/editor/%3Cscript%3E",
    ]) {
      const response = await l.event("fetch", {
        request: {
          url: "https://game.test" + path,
          method: "GET",
          mode: "navigate",
        },
      });
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.ok(html.includes(`<base href="/releases/${release}/">`));
      assert.ok(html.includes('name="scrap-league-route-fallback"'));
      assert.ok(!html.includes("%3Cscript%3E"));
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    assert.equal(
      await (
        await (await l.caches.open(release)).match("https://game.test/")
      ).text(),
      index,
    );
    assert.equal((await l.message("STATUS")).ok, true);
    for (const [url, mode] of [
      ["https://game.test/boards/trial.html", "navigate"],
      ["https://game.test/editor/yard-loop", "cors"],
      ["https://game.test/editor/yard-loop?owner=1", "navigate"],
    ])
      assert.equal(
        await l.event("fetch", { request: { url, method: "GET", mode } }),
        undefined,
      );
  }
});

test("native-route fallback preserves success/authorization responses and refuses corrupt shells", async () => {
  const release = "sl-aaaaaaaaaaaaaa",
    index = `<html><head><base href="./releases/${release}/"></head><body>Installed yard</body></html>`,
    l = lab(release, new Map(), index),
    url = "https://game.test/editor/yard-loop",
    request = { url, method: "GET", mode: "navigate" };
  await l.install();
  l.network.set(url, "Composed live circuit");
  assert.equal(
    await (await l.event("fetch", { request })).text(),
    "Composed live circuit",
  );
  l.fault.routeStatus = 403;
  const denied = await l.event("fetch", { request });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("X-Scrap-League-Route-Fallback"), null);
  await (
    await l.caches.open(release)
  ).put("https://game.test/", new Response("corrupt"));
  l.fault.offline = true;
  await assert.rejects(
    l.event("fetch", { request }),
    /No intact installed game shell/,
  );
});
test("failed B installation preserves complete A; missing, corrupt and quota-failed B never report readiness", async () => {
  const a = lab();
  await a.install();
  for (const failure of ["offline", "corrupt", "quota"]) {
    const b = lab("sl-bbbbbbbbbbbbbb", a.shared);
    b.fault[failure] = true;
    await assert.rejects(b.install());
    assert.equal((await b.message("STATUS")).ok, false);
    assert.equal((await a.message("STATUS")).ok, true);
  }
});
test("activation rejects stale acknowledgement, cancellation, expired request and newly opened window", async () => {
  for (const kind of ["stale", "cancel", "expired", "new-window"]) {
    const l = lab();
    await l.install();
    let token = "operation";
    l.clients.push({
      id: "1",
      postMessage(data, ports) {
        if (data.type !== "PREPARE_UPDATE") return;
        if (kind === "cancel")
          l.event("message", {
            data: { type: "CANCEL_UPDATE", token },
            ports: [],
          });
        if (kind === "new-window")
          l.clients.push({ id: "2", postMessage() {} });
        ports[0].postMessage({
          safe: true,
          token: kind === "stale" ? "old" : data.token,
        });
        ports[0].close();
      },
    });
    const reply = await l.message("ACTIVATE", {
      token,
      deadline: Date.now() + (kind === "expired" ? -1 : 1000),
    });
    assert.equal(reply.ok, false, kind);
    assert.equal(l.state.activated, 0);
  }
});
test("duplicate activation clicks do not skip waiting twice; unsafe other tab blocks update", async () => {
  const l = lab();
  await l.install();
  let release;
  l.clients.push({
    id: "1",
    postMessage(data, ports) {
      if (data.type === "PREPARE_UPDATE")
        release = () => {
          ports[0].postMessage({ token: data.token, safe: true });
          ports[0].close();
        };
    },
  });
  const first = l.message("ACTIVATE");
  await new Promise((r) => setTimeout(r, 5));
  assert.equal((await l.message("ACTIVATE")).ok, false);
  release();
  assert.equal((await first).ok, true);
  assert.equal(l.state.activated, 1);
  l.clients[0].postMessage = (data, ports) => {
    if (data.type === "PREPARE_UPDATE") {
      ports[0].postMessage({ token: data.token, safe: false });
      ports[0].close();
    }
  };
  assert.equal((await l.message("ACTIVATE")).ok, false);
  assert.equal(l.state.activated, 1);
});
test("rollback to retained A restores A resources with server absent and does not touch application storage", async () => {
  const a = lab();
  await a.install();
  const b = lab("sl-bbbbbbbbbbbbbb", a.shared);
  await b.install();
  const rollback = lab(a.release, a.shared);
  rollback.fault.offline = true;
  assert.equal((await rollback.message("STATUS")).ok, true);
  assert.equal(
    await (
      await rollback.event("fetch", {
        request: new Request("https://game.test/"),
      })
    ).text(),
    "index " + a.release,
  );
  assert.ok(a.shared.has(b.release));
});

test("new worker verifies retained release bytes and refuses corrupt or inventory-less offline responses", async () => {
  const a = lab();
  await a.install();
  const b = lab("sl-bbbbbbbbbbbbbb", a.shared);
  await b.install();
  b.fault.offline = true;
  const request = new Request(
    `https://game.test/releases/${a.release}/main.js`,
  );
  assert.equal(
    await (await b.event("fetch", { request })).text(),
    "main " + a.release,
  );
  await (
    await a.caches.open(a.release)
  ).put(request.url, new Response("corrupt"));
  await assert.rejects(b.event("fetch", { request }), /Offline/);
  a.shared.get(a.release).delete("https://game.test/__offline_pack__");
  await (
    await a.caches.open(a.release)
  ).put(request.url, new Response("unverified legacy bytes"));
  await assert.rejects(b.event("fetch", { request }), /Offline/);
});

test("retirement keeps current, previous, open-client and legacy packs; a nonresponding client vetoes cleanup", async () => {
  const a = lab();
  await a.install();
  const b = lab("sl-bbbbbbbbbbbbbb", a.shared);
  await b.install();
  const c = lab("sl-cccccccccccccc", a.shared);
  await c.install();
  // Explicit timestamps make retention independent of wall-clock scheduling.
  for (const [index, item] of [a, b, c].entries()) {
    const cache = await item.caches.open(item.release);
    const data = await (
      await cache.match("https://game.test/__offline_pack__")
    ).json();
    data.installedAt = index + 1;
    await cache.put(
      "https://game.test/__offline_pack__",
      new Response(JSON.stringify(data)),
    );
  }
  a.shared.set("sl-dddddddddddddd", new Map());
  c.clients.push({ id: "legacy-client", postMessage() {} });
  await c.event("activate", {});
  assert.ok(
    a.shared.has(a.release),
    "silence must not delete an old client's pack",
  );
  c.clients[0] = {
    id: "active-a",
    postMessage(data, ports) {
      if (data.type === "RELEASE_QUERY") {
        ports[0].postMessage({ token: data.token, release: a.release });
        ports[0].close();
      }
    },
  };
  await c.event("activate", {});
  assert.ok(a.shared.has(a.release));
  assert.ok(a.shared.has(b.release));
  c.clients.length = 0;
  await c.event("activate", {});
  assert.equal(a.shared.has(a.release), false);
  assert.ok(a.shared.has(b.release));
  assert.ok(a.shared.has(c.release));
  assert.ok(
    a.shared.has("sl-dddddddddddddd"),
    "do not touch legacy caches without verified metadata",
  );
});

test("legacy client without update acknowledgement blocks explicit activation safely", async () => {
  const l = lab();
  await l.install();
  l.clients.push({ id: "old-game", postMessage() {} });
  const reply = await l.message("ACTIVATE", { deadline: Date.now() + 30 });
  assert.equal(reply.ok, false);
  assert.match(reply.error, /did not confirm/);
  assert.equal(l.state.activated, 0);
});
