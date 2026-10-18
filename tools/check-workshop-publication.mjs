// Production publication functions against one disposable owner-authored circuit.
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { DOMParser } from "linkedom";
import { loadContent } from "./content.mjs";
import { duplicateTrack, gameplay, stable } from "../app/model.js";
import { HOST_CONFIG, publishTrack } from "../app/pagelove.js";
import {
  publishOwnerTrack,
  listTrack,
  readPublishedTrack,
  parseCatalog,
} from "../app/publication.js";

const file = new URL(
  "../audit/handbook-workshop-publication.json",
  import.meta.url,
);
const digest = (value) => createHash("sha256").update(value).digest("hex");
let key = "";
const save = (report) =>
  fs.writeFile(file, JSON.stringify(report, null, 2) + "\n");
async function request(path, options = {}) {
  if (!path.startsWith("/workshop-tracks/") || path.includes(".."))
    throw Error("Unsupported path");
  return fetch(HOST_CONFIG.authoringOrigin + path, {
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
    ...options,
    headers: { Authorization: "Bearer " + key, ...options.headers },
  });
}
async function snapshot(id) {
  const definition = await request(`/workshop-tracks/${id}/definition.html`);
  if (!definition.ok)
    throw Error("Definition snapshot failed: " + definition.status);
  const catalog = await request("/workshop-tracks/catalog.html");
  const entries = catalog.ok
    ? parseCatalog(await catalog.text(), DOMParser)
    : [];
  return {
    utc: new Date().toISOString(),
    definitionHash: digest(await definition.text()),
    catalogRows: entries.map((entry) => ({
      id: entry.id,
      hash: digest(stable(entry)),
    })),
  };
}
async function seed() {
  try {
    await fs.access(file);
    throw Error("Existing fixture receipt must be reconciled first");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const track = duplicateTrack((await loadContent()).tracks[0].track);
  track.name = "Release preservation check";
  track.slug = "release-check-" + track.id.slice(0, 8);
  const report = {
    utc: new Date().toISOString(),
    id: track.id,
    state: "started",
    checks: {},
    scope:
      "Real pinned owner/public endpoints; injected stale catalog ETag and lost accepted response; only owned circuit is changed.",
  };
  await save(report);
  let conflictInjected = false;
  const first = await publishOwnerTrack(track, key, null, {
    Parser: DOMParser,
    fetcher: async (url, options) => {
      if (
        url.endsWith("/catalog.html") &&
        options.method === "PUT" &&
        !conflictInjected
      ) {
        conflictInjected = true;
        options = {
          ...options,
          headers: {
            ...options.headers,
            "If-Match": '"deliberately-stale-fixture"',
          },
        };
        delete options.headers["If-None-Match"];
      }
      return fetch(url, options);
    },
  });
  report.checks.catalogConflictPreservesExactLink =
    !first.listed &&
    /Catalog changed/.test(first.listingError) &&
    stable(
      gameplay(await readPublishedTrack(track.id, { Parser: DOMParser })),
    ) === stable(gameplay(track));
  await save(report);
  await listTrack(track, first.revision, key, { Parser: DOMParser });
  report.checks.listingRetry = true;
  const base = {
    url:
      HOST_CONFIG.authoringOrigin +
      `/workshop-tracks/${track.id}/definition.html`,
    pinnedOrigin: HOST_CONFIG.authoringOrigin,
    key,
    Parser: DOMParser,
  };
  let conflict = false;
  try {
    await publishTrack({
      ...base,
      track,
      etag: '"deliberately-stale-fixture"',
      baseline: track,
    });
  } catch (error) {
    conflict = /Conflict/.test(error.message);
  }
  report.checks.staleTrackRefused = conflict;
  const changed = { ...track, name: "Release preservation check B" };
  const accepted = await publishTrack({
    ...base,
    track: changed,
    baseline: first.baseline,
    etag: first.etag,
    fetcher: async (url, options) => {
      const response = await fetch(url, options);
      if (options.method === "PUT" && response.ok) {
        await response.body?.cancel();
        throw Error("Injected lost response after actual acceptance");
      }
      return response;
    },
  });
  report.checks.ambiguousWrite = accepted.state;
  report.checks.ambiguousSemanticReadback =
    stable(
      gameplay(await readPublishedTrack(track.id, { Parser: DOMParser })),
    ) === stable(gameplay(changed));
  const wrong = await request(`/workshop-tracks/${track.id}/definition.html`, {
    headers: { Authorization: "Bearer deliberately-invalid-fixture" },
  });
  report.checks.wrongCredentialRefused = [401, 403].includes(wrong.status);
  await wrong.body?.cancel();
  await listTrack(changed, accepted.revision, key, { Parser: DOMParser });
  report.before = await snapshot(track.id);
  report.state = "awaiting-publication";
  await save(report);
  return { state: report.state, checks: report.checks, id: track.id };
}
async function verifyAndClean() {
  const report = JSON.parse(await fs.readFile(file, "utf8"));
  report.after = await snapshot(report.id);
  report.preserved =
    report.before.definitionHash === report.after.definitionHash &&
    report.before.catalogRows.every((row) =>
      report.after.catalogRows.some(
        (now) => now.id === row.id && now.hash === row.hash,
      ),
    );
  await save(report);
  const definitionPath = `/workshop-tracks/${report.id}/definition.html`;
  const createBaseline = await request(definitionPath);
  const createConflict = await request(definitionPath, {
    method: "PUT",
    headers: {
      "If-None-Match": "*",
      "Content-Type": "text/html; charset=utf-8",
    },
    body: await createBaseline.text(),
  });
  report.checks.createOnlyConflictRefused = createConflict.status === 412;
  await createConflict.body?.cancel();
  await save(report);
  const catalog = await request("/workshop-tracks/catalog.html"),
    etag = catalog.headers.get("etag"),
    html = await catalog.text();
  const marker = `<span itemprop="id">${report.id}</span>`,
    index = html.indexOf(marker);
  if (!catalog.ok || !etag || index < 0)
    throw Error("Cannot isolate owned catalog entry");
  const start = html.lastIndexOf(
      '<li itemscope itemtype="urn:ScrapLeague:PublishedTrack">',
      index,
    ),
    end = html.indexOf("</li>", index);
  if (start < 0 || end < 0) throw Error("Owned catalog row bounds unavailable");
  const write = await request("/workshop-tracks/catalog.html", {
    method: "PUT",
    headers: { "If-Match": etag, "Content-Type": "text/html; charset=utf-8" },
    body: html.slice(0, start) + html.slice(end + 5),
  });
  if (!write.ok)
    throw Error("Conditional catalog cleanup failed: " + write.status);
  const path = `/workshop-tracks/${report.id}/definition.html`,
    definition = await request(path);
  const removed = await request(path, {
    method: "DELETE",
    headers: { "If-Match": definition.headers.get("etag") },
  });
  const absent = await request(path);
  const remaining = parseCatalog(
    await (await request("/workshop-tracks/catalog.html")).text(),
    DOMParser,
  );
  report.cleanup = {
    definitionAbsent: absent.status === 404,
    deletionStatus: removed.status,
    ownedListingAbsent: !remaining.some((row) => row.id === report.id),
    otherListingsPreserved: report.after.catalogRows
      .filter((row) => row.id !== report.id)
      .every((row) =>
        remaining.some(
          (now) => now.id === row.id && digest(stable(now)) === row.hash,
        ),
      ),
  };
  report.state =
    report.preserved &&
    report.checks.createOnlyConflictRefused &&
    report.cleanup.definitionAbsent &&
    report.cleanup.ownedListingAbsent &&
    report.cleanup.otherListingsPreserved
      ? "passed"
      : "failed";
  await save(report);
  return {
    state: report.state,
    preserved: report.preserved,
    cleanup: report.cleanup,
  };
}
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.setEncoding("utf8");
let input = "",
  busy = false;
console.log("Ready for hidden JSON: seed, verify-clean, quit.");
process.stdin.on("data", async (chunk) => {
  if (chunk.includes("\u0003")) process.exit(0);
  input += chunk;
  const end = input.search(/[\r\n]/);
  if (end < 0) return;
  const line = input.slice(0, end).trim();
  input = input.slice(end + 1);
  if (!line || busy) return;
  busy = true;
  try {
    const command = JSON.parse(line);
    if (command.op === "quit") process.exit(0);
    key = command.key;
    if (typeof key !== "string" || !key.startsWith("pk_"))
      throw Error("Hidden owner key required");
    if (!["seed", "verify-clean"].includes(command.op))
      throw Error("Unsupported operation");
    console.log(
      JSON.stringify(await (command.op === "seed" ? seed() : verifyAndClean())),
    );
  } catch (error) {
    console.log(JSON.stringify({ error: error.message }));
  } finally {
    key = "";
    busy = false;
  }
});
