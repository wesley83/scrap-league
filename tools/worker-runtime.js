/* CACHE and INVENTORY are injected from the verified build. */
const hex = (b) =>
  Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join(
    "",
  );
const absolute = (item) => new URL(item.url, self.location).href;
const metadataURL = new URL("./__offline_pack__", self.location).href;
const releasePattern = /^sl-[a-f0-9]{14}$/;
const cancelled = new Set();
let activating = false;
async function valid(response, entry) {
  return (
    !!response?.ok &&
    hex(
      await crypto.subtle.digest(
        "SHA-256",
        await response.clone().arrayBuffer(),
      ),
    ) === entry.hash
  );
}
async function verify(cache) {
  for (const entry of INVENTORY)
    if (!(await valid(await cache.match(absolute(entry)), entry)))
      throw Error("Offline file missing or corrupt: " + entry.url);
}
async function installPack() {
  const temporary = CACHE + "-staging";
  await caches.delete(temporary);
  const staging = await caches.open(temporary);
  try {
    for (const [i, entry] of INVENTORY.entries()) {
      const response = await fetch(absolute(entry), { cache: "reload" });
      if (!(await valid(response, entry)))
        throw Error("Release integrity failure: " + entry.url);
      await staging.put(absolute(entry), response);
      for (const client of await self.clients.matchAll({
        includeUncontrolled: true,
      }))
        client.postMessage({
          type: "PACK_PROGRESS",
          release: CACHE,
          completed: i + 1,
          total: INVENTORY.length,
        });
    }
    await verify(staging);
    const destination = await caches.open(CACHE);
    for (const entry of INVENTORY)
      await destination.put(
        absolute(entry),
        await staging.match(absolute(entry)),
      );
    await verify(destination);
    await destination.put(
      metadataURL,
      new Response(
        JSON.stringify({
          release: CACHE,
          installedAt: Date.now(),
          entries: INVENTORY,
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
  } finally {
    await caches.delete(temporary);
  }
}
self.addEventListener("install", (event) => event.waitUntil(installPack()));
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      await retireUnusedPacks();
    })(),
  ),
);

async function metadata(name) {
  if (!releasePattern.test(name)) return null;
  try {
    const response = await (await caches.open(name)).match(metadataURL);
    if (!response || Number(response.headers.get("content-length")) > 262144)
      return null;
    const text = await response.text();
    if (text.length > 262144) return null;
    const data = JSON.parse(text);
    if (
      data.release !== name ||
      !Number.isFinite(data.installedAt) ||
      !Array.isArray(data.entries) ||
      !data.entries.length ||
      data.entries.length > 1000
    )
      return null;
    const seen = new Set();
    for (const item of data.entries) {
      if (
        typeof item.url !== "string" ||
        !/^[a-f0-9]{64}$/.test(item.hash) ||
        (item.url !== "./" && !item.url.startsWith(`./releases/${name}/`)) ||
        item.url.includes("..") ||
        item.url.includes("?") ||
        item.url.includes("#") ||
        seen.has(item.url)
      )
        return null;
      seen.add(item.url);
    }
    return data;
  } catch {
    return null;
  }
}

async function clientRelease(client) {
  return new Promise((resolve) => {
    const channel = new MessageChannel(),
      token = crypto.randomUUID();
    const finish = (release) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(release);
    };
    const timer = setTimeout(() => finish(null), 1200);
    channel.port1.onmessage = (event) =>
      finish(
        event.data?.token === token && releasePattern.test(event.data.release)
          ? event.data.release
          : null,
      );
    try {
      client.postMessage({ type: "RELEASE_QUERY", token }, [channel.port2]);
    } catch {
      finish(null);
    }
  });
}

async function retireUnusedPacks() {
  const clients = await self.clients.matchAll({
    includeUncontrolled: true,
    type: "window",
  });
  const releases = await Promise.all(clients.map(clientRelease));
  // An old or unresponsive client is not evidence that its pack is unused.
  if (releases.some((release) => !release)) return;
  const packs = (await Promise.all((await caches.keys()).map(metadata))).filter(
    Boolean,
  );
  const keep = new Set([CACHE, ...releases]);
  const previous = packs
    .filter((pack) => pack.release !== CACHE)
    .sort(
      (a, b) =>
        b.installedAt - a.installedAt || a.release.localeCompare(b.release),
    )[0];
  if (previous) keep.add(previous.release);
  const currentClients = await self.clients.matchAll({
    includeUncontrolled: true,
    type: "window",
  });
  if (
    currentClients.some(
      (client) => !clients.some((old) => old.id === client.id),
    )
  )
    return;
  for (const pack of packs)
    if (!keep.has(pack.release)) await caches.delete(pack.release);
}

async function ask(client, token, deadline) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(
      () => {
        channel.port1.close();
        reject(
          Error(
            "Another game window did not confirm a safe update. Close older or unresponsive game windows, then retry from the yard.",
          ),
        );
      },
      Math.max(1, deadline - Date.now()),
    );
    channel.port1.onmessage = (e) => {
      clearTimeout(timer);
      channel.port1.close();
      if (e.data?.token === token && e.data.safe) resolve(e.data);
      else
        reject(
          Error(
            "Finish or leave the race and return every game window to the yard.",
          ),
        );
    };
    client.postMessage({ type: "PREPARE_UPDATE", token, deadline }, [
      channel.port2,
    ]);
  });
}
self.addEventListener("message", (event) => {
  const { type, token, deadline } = event.data || {};
  if (type === "CANCEL_UPDATE") {
    cancelled.add(token);
    return;
  }
  if (!event.ports[0] || !token) return;
  event.waitUntil(
    (async () => {
      const reply = (data) => event.ports[0].postMessage({ token, ...data });
      try {
        if (type === "STATUS") {
          await verify(await caches.open(CACHE));
          reply({ ok: true, release: CACHE, count: INVENTORY.length });
        } else if (type === "REPAIR") {
          await installPack();
          reply({ ok: true, release: CACHE });
        } else if (type === "ACTIVATE") {
          if (activating) throw Error("An update is already in progress.");
          if (
            !Number.isFinite(deadline) ||
            deadline > Date.now() + 15000 ||
            deadline <= Date.now()
          )
            throw Error("Expired update request.");
          activating = true;
          const clients = await self.clients.matchAll({
            includeUncontrolled: true,
            type: "window",
          });
          try {
            await Promise.all(clients.map((c) => ask(c, token, deadline)));
            await verify(await caches.open(CACHE));
            const current = await self.clients.matchAll({
              includeUncontrolled: true,
              type: "window",
            });
            if (current.some((c) => !clients.some((old) => old.id === c.id)))
              throw Error("A new window opened; retry the update.");
            if (cancelled.has(token) || Date.now() >= deadline)
              throw Error("Update request expired.");
            reply({ ok: true, release: CACHE });
            await self.skipWaiting();
          } catch (e) {
            for (const client of clients)
              client.postMessage({ type: "CANCEL_UPDATE", token });
            throw e;
          } finally {
            activating = false;
            cancelled.delete(token);
          }
        }
      } catch (e) {
        reply({ ok: false, error: e.message });
      }
    })(),
  );
});
async function nativeNavigation(request) {
  let response;
  try {
    response = await fetch(request, { signal: AbortSignal.timeout(8000) });
    if (![404, 410, 500, 502, 503, 504].includes(response.status))
      return response;
  } catch {
    // An installed, verified shell can recover an unavailable composed page.
  }
  const root = INVENTORY[0],
    cache = await caches.open(CACHE),
    stored = await cache.match(absolute(root));
  if (!(await valid(stored, root))) {
    if (response) return response;
    throw Error("No intact installed game shell is available for this route.");
  }
  const oldBase = '<base href="./releases/' + CACHE + '/">',
    releaseBase = new URL("./releases/" + CACHE + "/", self.location).pathname;
  let html = await stored.text();
  if (!html.includes(oldBase)) {
    if (response) return response;
    throw Error("The installed game shell has an unsupported asset base.");
  }
  const reason = response ? "http-" + response.status : "offline";
  html = html
    .replace(oldBase, '<base href="' + releaseBase + '">')
    .replace(
      /<\/head>/i,
      '<meta name="scrap-league-route-fallback" content="' +
        reason +
        '"></head>',
    );
  const headers = new Headers(stored.headers);
  for (const name of [
    "content-length",
    "content-encoding",
    "etag",
    "last-modified",
  ])
    headers.delete(name);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Scrap-League-Route-Fallback", reason);
  return new Response(html, { status: 200, headers });
}
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.search
  )
    return;
  const base = new URL("./", self.location).pathname,
    relative = url.pathname.slice(base.length);
  if (!url.pathname.startsWith(base)) return;
  if (
    event.request.mode === "navigate" &&
    /^(editor|track)(?:\/[^/]*)?\/?$/.test(relative)
  ) {
    event.respondWith(nativeNavigation(event.request));
    return;
  }
  const entry =
    url.pathname === base || relative === "index.html"
      ? INVENTORY[0]
      : INVENTORY.find((item) => absolute(item) === url.href);
  if (entry) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE),
          stored = await cache.match(absolute(entry));
        if (await valid(stored, entry)) return stored;
        const response = await fetch(absolute(entry), { cache: "reload" });
        if (!(await valid(response, entry)))
          throw Error("No intact copy of this release file is available.");
        await cache.put(absolute(entry), response.clone());
        return response;
      })(),
    );
  } else if (relative.startsWith("releases/")) {
    event.respondWith(
      (async () => {
        const name = relative.split("/")[1];
        const pack = await metadata(name);
        const entry = pack?.entries.find((item) => absolute(item) === url.href);
        // Legacy caches have no trusted inventory. Use the pinned network URL instead.
        if (!entry) return fetch(event.request);
        const cache = await caches.open(name),
          stored = await cache.match(url.href);
        if (await valid(stored, entry)) return stored;
        const response = await fetch(event.request, { cache: "reload" });
        if (!(await valid(response, entry)))
          throw Error("Retained release file failed integrity verification.");
        await cache.put(url.href, response.clone());
        return response;
      })(),
    );
  }
});
