// Real public application requests against nonce-owned policy mirrors and routes.
// Empty mirrors prevent destructive negative tests from touching player records.
import fs from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { DOMParser } from "linkedom";
import { runHTML } from "../app/boards.js";
import { HOST_CONFIG } from "../app/pagelove.js";
import {
  BOARD_PATHS,
  BOARD_RETENTION_MS,
  loadOfficialBoardIdentities,
} from "./board-policy.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
let key = "",
  report,
  reportURL;
const writeReport = () =>
  fs.writeFile(reportURL, JSON.stringify(report, null, 2) + "\n");
const parse = (html) => new DOMParser().parseFromString(html, "text/html");
async function request(path, options = {}, owner = false) {
  if (!path.startsWith("/") || path.includes(".."))
    throw Error("Invalid fixture path");
  const response = await fetch(
    (owner ? HOST_CONFIG.authoringOrigin : HOST_CONFIG.publicOrigin) + path,
    {
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      ...options,
      headers: {
        ...(owner ? { Authorization: "Bearer " + key } : {}),
        ...options.headers,
      },
    },
  );
  return response;
}
async function check(name, fn) {
  const started = Date.now();
  try {
    report.checks.push({
      name,
      state: "passed",
      ...(await fn()),
      durationMs: Date.now() - started,
    });
  } catch (error) {
    report.checks.push({
      name,
      state: "failed",
      detail: error.message,
      durationMs: Date.now() - started,
    });
  }
  await writeReport();
}
function ensure(value, message) {
  if (!value) throw Error(message);
}
async function publicRead(path) {
  const attempts = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await request(path),
      body = await response.text();
    attempts.push({
      status: response.status,
      detail: response.ok ? "" : body.slice(0, 800),
    });
    if (
      response.ok ||
      ![500, 502, 503, 504].includes(response.status) ||
      attempt === 2
    ) {
      report.attempts.push({ name: "retention public read", attempts });
      await writeReport();
      return new Response(body, {
        status: response.status,
        headers: response.headers,
      });
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}
async function create(path, body) {
  report.owned.push(path);
  await writeReport();
  const response = await request(
    path,
    {
      method: "PUT",
      headers: {
        "If-None-Match": "*",
        "Content-Type": "text/html; charset=utf-8",
      },
      body,
    },
    true,
  );
  ensure(response.ok, "Fixture create refused: " + response.status);
  report.created.push(path);
  await writeReport();
  await response.body?.cancel();
}
async function readOwner(path) {
  const response = await request(path, {}, true);
  ensure(response.ok, "Fixture read failed: " + response.status);
  const etag = response.headers.get("etag");
  ensure(etag, "Conditional-write ETag missing");
  return { html: await response.text(), etag };
}
function emptyRows(html) {
  const matches = [
    ...html.matchAll(/<ul\b[^>]*\bid="runs"[^>]*>[\s\S]*?<\/ul>/g),
  ];
  ensure(matches.length === 1, "Expected one runs list");
  return html.replace(
    matches[0][0],
    matches[0][0].slice(0, matches[0][0].indexOf(">") + 1) + "</ul>",
  );
}
function makeRun(mode, identities) {
  const challenge =
    mode === "daily" ? Object.entries(identities.daily)[0] : null;
  const trackId = challenge?.[1].trackId || Object.keys(identities.tracks)[0];
  return {
    id: randomUUID(),
    alias: "Handbook probe",
    mode,
    trackId,
    trackRevision: identities.tracks[trackId],
    rulesRevision: identities.rulesRevision,
    buildRevision: challenge?.[1].buildRevision || identities.builds[0],
    assist: "steering-off:manual",
    laps: 3,
    challenge: challenge?.[0] || "",
    elapsedMs: 480000,
    splits: [160000, 160000, 160000],
  };
}
const ids = (html) =>
  [...parse(html).querySelectorAll('#runs [itemprop="id"]')].map(
    (el) => el.getAttribute("content") || el.textContent,
  );
async function board(mode, identities, suffix) {
  const source = await readOwner(BOARD_PATHS[mode]);
  const path = `/boards/audit-${suffix}-${mode}.html`,
    type = `urn:ScrapLeague:ProbeRun:${suffix}:${mode}`;
  const template = emptyRows(source.html),
    mirror = template
      .replaceAll(BOARD_PATHS[mode], path)
      .replaceAll("urn:ScrapLeague:Run", type);
  ensure(
    mirror
      .replaceAll(path, BOARD_PATHS[mode])
      .replaceAll(type, "urn:ScrapLeague:Run") === template,
    "Policy mirror differs beyond path/type isolation",
  );
  report.mirrors.push({
    mode,
    path,
    type,
    sourceETag: source.etag,
    emptyPolicySha256: hash(template),
    normalizedMirrorSha256: hash(
      mirror
        .replaceAll(path, BOARD_PATHS[mode])
        .replaceAll(type, "urn:ScrapLeague:Run"),
    ),
  });
  await create(path, mirror);
  const encode = (run) => runHTML(run).replaceAll("urn:ScrapLeague:Run", type);
  const post = (body) =>
    request(path, {
      method: "POST",
      headers: { "Content-Type": "text/html", Range: "selector=#runs" },
      body,
    });
  const positive = makeRun(mode, identities);
  let accepted = false;
  await check(mode + ": positive public write/readback", async () => {
    const attempts = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await post(encode(positive)),
        status = response.status;
      const detail = response.ok ? "" : (await response.text()).slice(0, 800);
      if (response.ok) await response.body?.cancel();
      attempts.push({ status, detail });
      const stored = await readOwner(path);
      accepted =
        ids(stored.html).filter((id) => id === positive.id).length === 1;
      if (accepted) break;
      if (![500, 502, 503, 504].includes(status)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    report.attempts.push({
      name: mode + ": positive public write/readback",
      attempts,
    });
    ensure(
      accepted,
      "Positive control not confirmed: " + JSON.stringify(attempts),
    );
    return { attempts, oneCopy: true };
  });
  if (!accepted) return;
  const duplicate = () =>
    check(mode + ": duplicate identity", async () => {
      const response = await post(encode(positive)),
        status = response.status;
      await response.body?.cancel();
      const stored = await readOwner(path);
      const oneCopy =
        ids(stored.html).filter((id) => id === positive.id).length === 1;
      ensure(
        [400, 403, 409, 422].includes(status) && oneCopy,
        "Duplicate was not rejected with one copy preserved: " +
          JSON.stringify({ status, oneCopy }),
      );
      return {
        status,
        oneCopy,
        rejectionKind:
          status === 403 ? "request denied" : "validation/conflict",
      };
    });
  if (report.only === "duplicate") {
    await duplicate();
    return;
  }
  if (report.only === "retention") {
    await retention(path, positive, encode);
    return;
  }
  const cases = [
    [
      "missing field",
      (b) => b.replace(/<meta itemprop="alias" content="[^"]*">/, ""),
    ],
    [
      "extra field",
      (b) => b.replace("</li>", '<meta itemprop="extra" content="1"></li>'),
    ],
    [
      "wrong numeric type",
      (b) =>
        b.replace(
          'itemprop="elapsedMs" content="480000"',
          'itemprop="elapsedMs" content="not-a-number"',
        ),
    ],
    [
      "invalid splits",
      (b) =>
        b.replace(
          'itemprop="splits" content="[160000,160000,160000]"',
          'itemprop="splits" content="[]"',
        ),
    ],
    [
      "wrong content revision",
      (b) => b.replace(positive.trackRevision, "f".repeat(64)),
    ],
    [
      "client receipt",
      (b) =>
        b.replace("</li>", '<meta itemprop="receivedAt" content="1"></li>'),
    ],
    [
      "client expiry",
      (b) => b.replace("</li>", '<meta itemprop="expiresAt" content="1"></li>'),
    ],
    [
      "injected markup",
      (b) =>
        b.replace(
          "</li>",
          '<script type="text/plain">inert probe</script></li>',
        ),
    ],
  ];
  for (const [name, mutate] of cases)
    await check(mode + ": reject " + name, async () => {
      const row = { ...positive, id: randomUUID() },
        attempts = [];
      let status;
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await post(mutate(encode(row)));
        status = response.status;
        attempts.push({
          status,
          detail: status === 422 ? "" : (await response.text()).slice(0, 800),
        });
        if (status === 422) await response.body?.cancel();
        const stored = await readOwner(path);
        ensure(!ids(stored.html).includes(row.id), "Invalid row was appended");
        if (
          [400, 403, 422].includes(status) ||
          ![500, 502, 503, 504].includes(status)
        )
          break;
        await new Promise((r) => setTimeout(r, 500));
      }
      report.attempts.push({ name: mode + ": reject " + name, attempts });
      ensure(
        [400, 403, 422].includes(status),
        "No application rejection observed: " + JSON.stringify(attempts),
      );
      return {
        status,
        rejectionKind:
          status === 422 ? "validation" : "permission or request rejection",
        attempts,
        notStored: true,
      };
    });
  await duplicate();
  for (const method of ["PUT", "PATCH"])
    await check(mode + ": anonymous " + method + " denied", async () => {
      const prior = await readOwner(path);
      const response = await request(path, {
          method,
          headers: { "If-Match": prior.etag, "Content-Type": "text/html" },
          body: prior.html,
        }),
        status = response.status;
      await response.body?.cancel();
      const after = await readOwner(path);
      ensure(
        [401, 403, 405, 422].includes(status) &&
          hash(prior.html) === hash(after.html),
        "Prohibited mutation not rejected without changing state: " + status,
      );
      return { status, unchanged: true };
    });
  await check(mode + ": active deletion denied", async () => {
    const prior = await readOwner(path),
      cutoff = Date.now() + BOARD_RETENTION_MS + 86400000;
    const response = await request(path, {
        method: "DELETE",
        headers: {
          Range: `selector=#runs > li:has(meta[itemprop="expiresAt"]:value-less-than("${cutoff}"))`,
        },
      }),
      status = response.status;
    await response.body?.cancel();
    const after = await readOwner(path);
    ensure(
      status === 403 && hash(prior.html) === hash(after.html),
      "Future cutoff did not preserve active records: " + status,
    );
    return { status, unchanged: true };
  });
  if (!report.retentionRan) {
    report.retentionRan = true;
    await retention(path, positive, encode);
  }
  await check(mode + ": unscoped anonymous DELETE denied", async () => {
    const prior = await readOwner(path),
      response = await request(path, { method: "DELETE" }),
      status = response.status;
    await response.body?.cancel();
    const after = await readOwner(path);
    ensure(
      [401, 403].includes(status) && hash(prior.html) === hash(after.html),
      "Unscoped deletion not safely denied: " + status,
    );
    return { status, unchanged: true };
  });
}
async function retention(path, positive, encode) {
  await check(
    "retention: interleaved physical cleanup and eligibility boundary",
    async () => {
      const now = Date.now(),
        boundary = now + 30000;
      const fixtures = [
        [-60000, "expired-a"],
        [3600000, "active-a"],
        [-5000, "expired-b"],
        [30000, "boundary"],
        [86400000, "active-b"],
      ].map(([delta, label]) => ({
        run: { ...positive, id: randomUUID(), alias: label },
        label,
        expiry: now + delta,
      }));
      const before = await readOwner(path);
      const body = before.html.replace(
        "</ul>",
        fixtures
          .map((f) =>
            encode(f.run).replace(
              "</li>",
              `<meta itemprop="receivedAt" content="${f.expiry - BOARD_RETENTION_MS}"><meta itemprop="expiresAt" content="${f.expiry}"></li>`,
            ),
          )
          .join("") + "</ul>",
      );
      const seeded = await request(
        path,
        {
          method: "PUT",
          headers: {
            "If-Match": before.etag,
            "Content-Type": "text/html; charset=utf-8",
          },
          body,
        },
        true,
      );
      ensure(seeded.ok, "Retention seed failed: " + seeded.status);
      await seeded.body?.cancel();
      const physicalBefore = ids((await readOwner(path)).html);
      ensure(
        fixtures.every((f) => physicalBefore.includes(f.run.id)),
        "Physical baseline is missing owned retention rows",
      );
      const read = await publicRead(path),
        status = read.status;
      await read.text();
      ensure(read.ok, "Public retention read failed: " + status);
      let after = ids((await readOwner(path)).html);
      for (
        let attempt = 0;
        attempt < 3 &&
        fixtures
          .filter((f) => f.label.startsWith("expired"))
          .some((f) => after.includes(f.run.id));
        attempt++
      ) {
        await new Promise((r) => setTimeout(r, 500));
        const repeatedRead = await publicRead(path);
        await repeatedRead.text();
        after = ids((await readOwner(path)).html);
      }
      const expiredRemoved = fixtures
        .filter((f) => f.label.startsWith("expired"))
        .every((f) => !after.includes(f.run.id));
      const activeKept =
        fixtures
          .filter((f) => !f.label.startsWith("expired"))
          .every((f) => after.includes(f.run.id)) &&
        after.includes(positive.id);
      const beforeBoundary = Date.now() < boundary;
      report.retentionObservation = {
        path,
        physicalBefore,
        afterFirstRead: after,
        expiredRemoved,
        activeKept,
        beforeBoundary,
        fixtures: fixtures.map((f) => ({
          id: f.run.id,
          label: f.label,
          expiresAt: f.expiry,
        })),
      };
      await writeReport();
      if (!expiredRemoved) {
        const cutoff = Date.parse(read.headers.get("date") || "") || now;
        const explicit = await request(path, {
          method: "DELETE",
          headers: {
            Range: `selector=#runs > li:has(meta[itemprop="expiresAt"]:value-less-than("${cutoff}"))`,
          },
        });
        const detail = explicit.ok
          ? ""
          : (await explicit.text()).slice(0, 1200);
        if (explicit.ok) await explicit.body?.cancel();
        report.retentionObservation.explicitDelete = {
          status: explicit.status,
          detail,
          after: ids((await readOwner(path)).html),
        };
        await writeReport();
      }
      ensure(
        expiredRemoved && activeKept && beforeBoundary,
        "Access cleanup did not remove only expired rows before boundary",
      );
      await new Promise((r) =>
        setTimeout(r, Math.max(0, boundary - Date.now() + 100)),
      );
      const again = await publicRead(path);
      await again.text();
      ensure(again.ok, "Boundary cleanup read failed: " + again.status);
      let final = ids((await readOwner(path)).html);
      for (
        let attempt = 0;
        attempt < 3 &&
        final.includes(fixtures.find((f) => f.label === "boundary").run.id);
        attempt++
      ) {
        await new Promise((r) => setTimeout(r, 500));
        const repeatedRead = await publicRead(path);
        await repeatedRead.text();
        final = ids((await readOwner(path)).html);
      }
      const boundaryRemoved = !final.includes(
        fixtures.find((f) => f.label === "boundary").run.id,
      );
      const controlsKept =
        fixtures
          .filter((f) => f.label.startsWith("active"))
          .every((f) => final.includes(f.run.id)) &&
        final.includes(positive.id);
      const repeated = await publicRead(path);
      await repeated.text();
      const repeatedIds = ids((await readOwner(path)).html);
      ensure(
        boundaryRemoved &&
          controlsKept &&
          JSON.stringify(final) === JSON.stringify(repeatedIds),
        "Boundary/repeat cleanup failed or touched active controls",
      );
      return {
        status,
        seededExpiry: true,
        expiredRemoved,
        activeKept,
        beforeBoundary,
        boundaryRemoved,
        controlsKept,
        repeatStable: true,
        scope:
          "Owner-seeded timestamps exercise the actual application cleanup; this is not five days of elapsed wall time. Exact inclusive eligibility is checked independently.",
      };
    },
  );
}
async function composition(suffix) {
  const source = (await readOwner("/editor/yard-loop")).html;
  const releaseResponse = await request("/release.json");
  ensure(releaseResponse.ok, "Published release identity unavailable");
  const release = await releaseResponse.json();
  for (const kind of ["valid", "missing-track", "missing-shell"]) {
    const path = `/editor/qa-${suffix.slice(0, 8)}-${kind}`;
    let html = source;
    if (kind === "missing-track")
      html = html.replace(
        "/content/tracks/yard-loop/definition.html",
        `/missing-${suffix}/definition.html`,
      );
    if (kind === "missing-shell")
      html = html.replace(
        `/releases/${release.release}/native-shell.html`,
        `/missing-${suffix}/shell.html`,
      );
    await create(path, html);
    await check("native composition: " + kind, async () => {
      const response = await request(path),
        status = response.status,
        body = await response.text(),
        doc = parse(body);
      const gameShell = !!doc.querySelector("#game-shell"),
        track = !!doc.querySelector("#routed-track article"),
        recovery = !!doc.querySelector('#route-recovery a[href="/"]');
      report.routes.push({
        kind,
        path,
        status,
        gameShell,
        track,
        recovery,
        release: release.release,
      });
      if (kind === "valid")
        ensure(
          status === 200 && gameShell && track,
          "Valid native composition failed: " + status,
        );
      if (kind === "missing-track")
        ensure(
          status === 404,
          "Missing-track failure differs from documented include contract: " +
            status,
        );
      if (kind === "missing-shell")
        ensure(
          status === 404,
          "Missing-shell failure differs from documented include contract: " +
            status,
        );
      return {
        status,
        gameShell,
        track,
        recovery,
        requiresInstalledClientRecovery: kind !== "valid",
        bodyPreview: status === 200 ? undefined : body.slice(0, 1200),
      };
    });
  }
}
async function run(only) {
  const suffix = randomUUID(),
    utc = new Date().toISOString();
  reportURL = new URL(
    `../audit/provider-gap-probe-${utc.replace(/[:.]/g, "-")}.json`,
    import.meta.url,
  );
  report = {
    utc,
    origin: HOST_CONFIG.publicOrigin,
    owned: [],
    created: [],
    mirrors: [],
    routes: [],
    checks: [],
    only,
    attempts: [],
    cleanup: [],
    scope:
      "Actual public application endpoints on this host, using nonce-owned empty policy mirrors with unique run namespaces. Only resource paths/type namespaces differ from retained production policy; no live policy or player record is changed.",
  };
  await writeReport();
  try {
    const identities = await loadOfficialBoardIdentities();
    for (const mode of only === "retention"
      ? ["trial"]
      : only === "duplicate"
        ? ["daily"]
        : Object.keys(BOARD_PATHS))
      await check("complete " + mode + " boundary fixture", () =>
        board(mode, identities, suffix).then(() => ({ executed: true })),
      );
    if (!only) await composition(suffix);
  } finally {
    for (const path of [...report.created].reverse()) {
      try {
        const before = await request(path, {}, true);
        if (before.status === 404) {
          report.cleanup.push({ path, absent: true });
          continue;
        }
        ensure(
          before.ok && before.headers.get("etag"),
          "Cleanup baseline unavailable",
        );
        const removed = await request(
          path,
          {
            method: "DELETE",
            headers: { "If-Match": before.headers.get("etag") },
          },
          true,
        );
        await removed.body?.cancel();
        const absent = await request(path, {}, true);
        await absent.body?.cancel();
        report.cleanup.push({
          path,
          status: removed.status,
          absent: absent.status === 404,
        });
      } catch (error) {
        report.cleanup.push({ path, absent: false, detail: error.message });
      }
    }
    report.passed =
      report.checks.every((c) => c.state === "passed") &&
      report.cleanup.every((c) => c.absent);
    await writeReport();
    key = "";
  }
  return {
    receipt: reportURL.pathname.split("/audit/")[1],
    passed: report.passed,
    checks: report.checks.map(({ name, state, detail }) => ({
      name,
      state,
      detail,
    })),
    cleanup: report.cleanup,
  };
}
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.setEncoding("utf8");
let input = "";
console.log("Ready for hidden JSON owner key.");
process.stdin.on("data", async (chunk) => {
  if (chunk.includes("\u0003")) process.exit(0);
  input += chunk;
  const boundary = input.search(/[\r\n]/);
  if (boundary < 0) return;
  process.stdin.pause();
  try {
    const command = JSON.parse(input.slice(0, boundary));
    key = command.key;
    ensure(
      typeof key === "string" && key.startsWith("pk_"),
      "Hidden owner key required",
    );
    console.log(JSON.stringify(await run(command.only)));
  } catch (error) {
    key = "";
    console.log(
      JSON.stringify({
        error: error.message,
        receipt: reportURL?.pathname.split("/audit/")[1],
      }),
    );
    process.exitCode = 1;
  } finally {
    key = "";
    process.exit(process.exitCode || 0);
  }
});
