// Isolated owner-authoring and read-only composition experiment. Never touches live entry points or policies.
import fs from "node:fs/promises";
import { DOMParser } from "linkedom";
import { loadContent } from "./content.mjs";
import { duplicateTrack, serializeTrack, esc, stable } from "../app/model.js";
import { publishTrack, HOST_CONFIG } from "../app/pagelove.js";
const log = [],
  owned = [],
  fixture = duplicateTrack((await loadContent()).tracks[0].track),
  collection = "/workshop-tracks/" + fixture.id,
  definition = collection + "/definition.html";
let key = "";
async function request(path, options = {}, publicRead = false) {
  if (
    !path.startsWith(collection + "/") &&
    path !== collection + "/" &&
    path !== "/workshop-tracks/"
  )
    throw Error("Outside isolated fixture");
  const response = await fetch(
    (publicRead ? HOST_CONFIG.publicOrigin : HOST_CONFIG.authoringOrigin) +
      path,
    {
      ...options,
      headers: {
        ...(publicRead ? {} : { Authorization: "Bearer " + key }),
        ...options.headers,
      },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    },
  );
  const bytes = await response.arrayBuffer();
  log.push({
    utc: new Date().toISOString(),
    host: publicRead ? "public" : "authoring",
    path,
    method: options.method || "GET",
    status: response.status,
    bytes: bytes.byteLength,
    etag: response.headers.get("etag"),
    correlation: response.headers.get("x-request-id"),
  });
  return new Response(
    [204, 205, 304].includes(response.status) ? null : bytes,
    { status: response.status, headers: response.headers },
  );
}
async function create(path, body) {
  const response = await request(path, {
    method: "PUT",
    headers: { "Content-Type": "text/html", "If-None-Match": "*" },
    body,
  });
  if (!response.ok) throw Error("Create refused " + response.status);
  owned.push(path);
}
async function run() {
  const report = {
    utc: new Date().toISOString(),
    fixtureId: fixture.id,
    scope:
      "Disposable DAV track and read-only native composition; no public mutation policy activation claimed",
    checks: {},
    log,
  };
  try {
    for (const dir of [
      "/workshop-tracks/",
      collection + "/",
      collection + "/editor/",
    ]) {
      const r = await request(dir, { method: "MKCOL" });
      if (![201, 405].includes(r.status))
        throw Error("Collection creation refused " + r.status);
    }
    const fetcher = async (url, opts) => request(new URL(url).pathname, opts);
    const base = {
      url: HOST_CONFIG.authoringOrigin + definition,
      pinnedOrigin: HOST_CONFIG.authoringOrigin,
      key,
      Parser: DOMParser,
      fetcher,
    };
    fixture.name = "Disposable Scrap League verification";
    if (!process.argv.includes("--composition-only")) {
      const first = await publishTrack({ ...base, track: fixture });
      owned.push(definition);
      report.checks.create = first.state;
      const second = { ...fixture, name: "Verified owner revision B" };
      const accepted = await publishTrack({
        ...base,
        track: second,
        baseline: first.baseline,
        etag: first.etag,
      });
      report.checks.conditionalUpdate = accepted.state;
      try {
        await publishTrack({
          ...base,
          track: { ...fixture, name: "Stale editor" },
          baseline: first.baseline,
          etag: first.etag,
        });
        throw Error("Stale write unexpectedly succeeded");
      } catch (e) {
        if (!/Conflict/.test(e.message)) throw e;
        report.checks.staleEditorRefused = true;
      }
      const third = { ...second, name: "Ambiguous response reconciled" };
      const reconciled = await publishTrack({
        ...base,
        track: third,
        baseline: accepted.baseline,
        etag: accepted.etag,
        fetcher: async (url, opts) => {
          const r = await fetcher(url, opts);
          if (opts.method === "PUT" && r.ok)
            throw Error("Injected lost response after real server acceptance");
          return r;
        },
      });
      report.checks.ambiguous = reconciled.state;
      const invalid = await request(definition, {
        headers: { Authorization: "Bearer invalid-review-credential" },
      });
      report.checks.wrongCredentialRefused = [401, 403].includes(
        invalid.status,
      );
      if (!report.checks.wrongCredentialRefused)
        throw Error("Wrong credential was not refused");
    } else await create(definition, serializeTrack(fixture));
    await create(
      collection + "/shell.html",
      '<!doctype html><html><head><title>Fixture shell</title></head><body><main id="shell"><h1>Native fixture shell</h1><p>Return to the game Workshop if a circuit is unavailable.</p></main></body></html>',
    );
    const namespace = "urn:ScrapLeague:Review:" + fixture.id;
    const source = `export default () => {if(Context.request.params.slug!=='safe-circuit')return null;return new DOMParser().parseFromString('<p:include xmlns:p="https://pagelove.org/1.0" resource="${definition}" selector="article"></p:include>','text/html').querySelector('[resource]');};`;
    const route = `<!doctype html><html xmlns:p="https://pagelove.org/1.0" xmlns:s="${namespace}"><head><title>Native fixture editor</title></head><body><p:include resource="${collection}/shell.html" selector="#shell"></p:include><section id="definition"><s:track></s:track></section><div hidden itemscope itemtype="https://pagelove.org/Schema"><meta itemprop="type" content="${namespace}"><div itemprop="property" itemscope itemtype="https://pagelove.org/Method"><meta itemprop="name" content="track"><meta itemprop="returns" content="https://pagelove.org/Element"><div itemprop="implementation" itemscope itemtype="https://pagelove.org/JavaScript/Module"><script itemprop="source" type="text/plain">${source}</script></div></div></div></body></html>`;
    await create(collection + "/editor/:slug", route);
    report.checks.composition = [];
    for (const slug of ["safe-circuit", "unknown", "%3Cscript%3E"]) {
      const response = await request(collection + "/editor/" + slug, {}, true),
        html = await response.text(),
        doc = new DOMParser().parseFromString(html, "text/html");
      report.checks.composition.push({
        slug,
        status: response.status,
        shell: !!doc.querySelector("#shell"),
        track: !!doc.querySelector(
          '#definition [itemtype="urn:ScrapLeague:Track"]',
        ),
        bodyPreview: response.ok ? undefined : html.slice(0, 1200),
      });
    }
    const [valid, ...invalids] = report.checks.composition;
    report.checks.nativeCompositionPassed =
      valid.status === 200 &&
      valid.shell &&
      valid.track &&
      invalids.every((r) => r.status === 200 && r.shell && !r.track);
    const includeShell =
      '<p:include resource="' +
      collection +
      '/shell.html" selector="#shell"></p:include>';
    await create(
      collection + "/editor/chooser",
      '<!doctype html><html xmlns:p="https://pagelove.org/1.0"><head><title>Chooser</title></head><body>' +
        includeShell +
        "</body></html>",
    );
    // Replace only our disposable parameter route with the static fallback, using its current ETag.
    const prior = await request(collection + "/editor/:slug");
    const changed = await request(collection + "/editor/:slug", {
      method: "PUT",
      headers: {
        "If-Match": prior.headers.get("etag"),
        "Content-Type": "text/html",
      },
      body:
        '<!doctype html><html xmlns:p="https://pagelove.org/1.0"><head><title>Safe chooser</title></head><body>' +
        includeShell +
        "</body></html>",
    });
    if (!changed.ok) throw Error("Static fallback write failed");
    report.checks.staticFallback = [];
    for (const slug of ["unknown", "%3Cscript%3E", "another-circuit"]) {
      const r = await request(collection + "/editor/" + slug, {}, true),
        body = await r.text(),
        doc = new DOMParser().parseFromString(body, "text/html");
      report.checks.staticFallback.push({
        slug,
        status: r.status,
        shell: !!doc.querySelector("#shell"),
        hasTrack: !!doc.querySelector('[itemtype="urn:ScrapLeague:Track"]'),
      });
    }
    report.checks.staticFallbackPassed = report.checks.staticFallback.every(
      (r) => r.status === 200 && r.shell && !r.hasTrack,
    );
  } catch (error) {
    report.error = error.message;
    process.exitCode = 1;
  } finally {
    report.cleanup = [];
    for (const path of owned.reverse()) {
      try {
        const before = await request(path);
        if (before.status === 200) {
          const removed = await request(path, {
            method: "DELETE",
            headers: { "If-Match": before.headers.get("etag") },
          });
          report.cleanup.push({ path, status: removed.status });
        }
      } catch (error) {
        report.cleanup.push({ path, error: error.message });
      }
    }
    if (report.cleanup.every((r) => [200, 204, 404].includes(r.status))) {
      for (const dir of [collection + "/editor/", collection + "/"]) {
        try {
          const r = await request(dir, { method: "DELETE" });
          report.cleanup.push({ path: dir, status: r.status });
        } catch {}
      }
    }
    key = "";
    await fs.writeFile(
      new URL("../audit/remediation-provider-probe.json", import.meta.url),
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify({
        checks: report.checks,
        error: report.error,
        cleanup: report.cleanup,
        receipt: "audit/remediation-provider-probe.json",
      }),
    );
  }
}
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.setEncoding("utf8");
let buffer = "";
console.log("Ready for hidden owner key input.");
process.stdin.on("data", async (chunk) => {
  if (chunk.includes("\u0003")) process.exit(1);
  buffer += chunk;
  const end = buffer.search(/[\r\n]/);
  if (end < 0) return;
  key = buffer.slice(0, end).trim();
  buffer = "";
  process.stdin.pause();
  if (!key.startsWith("pk_")) throw Error("Missing owner key");
  await run();
  process.exit(process.exitCode || 0);
});
