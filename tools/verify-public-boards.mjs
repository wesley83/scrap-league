import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";
import { DOMParser } from "linkedom";
import { Boards, runHTML } from "../app/boards.js";
import { stable } from "../app/model.js";
import { HOST_CONFIG, validateRun } from "../app/pagelove.js";
import {
  BOARD_ORIGIN,
  BOARD_PATHS,
  loadOfficialBoardIdentities,
} from "./board-policy.mjs";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
let ownerKey = "";
const endpoints = new Boards(null, { Parser: DOMParser });
const attempted = new Map(
  Object.keys(BOARD_PATHS).map((mode) => [mode, new Set()]),
);
const failures = [];
const checks = [];
const publicMutationGapMs = 1500;
let lastPublicMutation = 0;

function url(base, pathname) {
  return new URL(pathname, base).href;
}
async function request(base, pathname, options = {}) {
  if (base === BOARD_ORIGIN && options.method && options.method !== "GET") {
    const wait = lastPublicMutation + publicMutationGapMs - Date.now();
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    lastPublicMutation = Date.now();
  }
  return fetch(url(base, pathname), {
    ...options,
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
}
function makeRun(mode, id, identities) {
  const challenge = mode === "daily" ? Object.entries(identities.daily)[0] : null,
    daily = challenge?.[1],
    trackId = daily?.trackId || Object.keys(identities.tracks)[0];
  const run = {
    id,
    alias: "Policy check",
    mode,
    trackId,
    trackRevision: daily?.trackRevision || identities.tracks[trackId],
    rulesRevision: identities.rulesRevision,
    buildRevision: daily?.buildRevision || identities.builds[0],
    assist: "steering-off:manual",
    laps: 3,
    challenge: challenge?.[0] || "",
    elapsedMs: 480000,
    splits: [160000, 160000, 160000],
  };
  validateRun(run);
  return run;
}
async function post(mode, body) {
  return request(BOARD_ORIGIN, BOARD_PATHS[mode], {
    method: "POST",
    credentials: "omit",
    headers: {
      "Content-Type": "text/html",
      Range: "selector=#runs",
    },
    body,
  });
}
async function readOwner(mode) {
  return request(HOST_CONFIG.authoringOrigin, BOARD_PATHS[mode], {
    headers: { Authorization: "Bearer " + ownerKey },
  });
}
async function policySnapshot(mode) {
  const response = await readOwner(mode);
  if (!response.ok) throw Error("Policy baseline unavailable: " + mode);
  const doc = new DOMParser().parseFromString(await response.text(), "text/html");
  const rules = [...doc.querySelectorAll('[hidden][itemscope]')];
  if (rules.length < 5) throw Error("Established policy definitions missing: " + mode);
  const source = rules.map(rule => rule.outerHTML).join("\n");
  return { etag: response.headers.get("ETag"), rules: rules.length,
    sha256: createHash("sha256").update(source).digest("hex") };
}
async function cleanupMode(mode) {
  const ids = attempted.get(mode), response = await readOwner(mode);
  if (response.status === 404) return { removed: 0, state: "already-absent" };
  if (!response.ok) throw Error("Owner cleanup read failed for " + mode + ".");
  const etag = response.headers.get("ETag");
  if (!etag) throw Error("Owner cleanup readback lacks an ETag.");
  let html = await response.text(), removed = 0;
  for (const id of ids) {
    const marker = 'itemprop="id" content="' + id + '"';
    let index = html.indexOf(marker);
    while (index >= 0) {
      const start = html.lastIndexOf(
          '<li itemscope itemtype="urn:ScrapLeague:Run">',
          index,
        ),
        close = html.indexOf("</li>", index),
        finish = close < 0 ? -1 : close + 5;
      if (start < 0 || finish < 0)
        throw Error("Could not isolate a synthetic board row for cleanup.");
      html = html.slice(0, start) + html.slice(finish);
      removed++;
      index = html.indexOf(marker);
    }
  }
  if (!removed) return { removed: 0, state: "no-test-rows-stored" };
  const write = await request(HOST_CONFIG.authoringOrigin, BOARD_PATHS[mode], {
    method: "PUT",
    headers: {
      Authorization: "Bearer " + ownerKey,
      "Content-Type": "text/html; charset=utf-8",
      "If-Match": etag,
    },
    body: html,
  });
  if (!write.ok)
    throw Error(
      "Conditional cleanup refused with " + write.status + "; synthetic rows expire in five days.",
    );
  const verify = await readOwner(mode);
  if (!verify.ok) throw Error("Owner cleanup readback failed for " + mode + ".");
  const after = await verify.text();
  for (const id of ids)
    if (after.includes('itemprop="id" content="' + id + '"'))
      throw Error("A synthetic row remains after conditional cleanup.");
  return { removed, state: "conditionally-removed", etagConfirmed: true };
}
function recordCheck(name, mode, runId, state, status) {
  checks.push({ name, mode, testId: runId, state, status });
  if (state !== "passed") failures.push(name + " failed for " + mode + ".");
}
async function checkMode(mode, identities) {
  const policyRows = await endpoints.readRows(mode);
  checks.push({ name: "bounded-page-read", mode, state: "passed", rows: policyRows.rows.length });

  const positive = makeRun(mode, randomUUID(), identities),
    positiveBody = runHTML(positive);
  attempted.get(mode).add(positive.id);
  let accepted = false,
    acceptedByLookup = false;
  try {
    let response = await post(mode, positiveBody);
    const statuses = [response.status];
    if (response.status === 503) {
      try {
        acceptedByLookup = !!(await endpoints.lookup(positive));
      } catch {}
      if (!acceptedByLookup) {
        response = await post(mode, positiveBody);
        statuses.push(response.status);
        if (response.status === 503) {
          try {
            acceptedByLookup = !!(await endpoints.lookup(positive));
          } catch {}
        }
      }
    }
    accepted = response.ok || acceptedByLookup;
    recordCheck("valid-public-write", mode, positive.id, accepted ? "passed" : "failed", response.status);
    checks.at(-1).attemptStatuses = statuses;
    if (!accepted) {
      checks.at(-1).response = (await response.text()).slice(0, 1500);
      return;
    }

    const after = await endpoints.readRows(mode),
      stored = after.rows.filter((row) => row.id === positive.id);
    const {
      receivedAt = NaN,
      expiresAt = NaN,
      ...storedRun
    } = stored[0] || {};
    const match = stored.length === 1 &&
      stable(storedRun) === stable(positive) &&
      Number.isSafeInteger(receivedAt) &&
      Number.isSafeInteger(expiresAt) &&
      Math.abs(expiresAt - receivedAt - 5 * 86400000) <= 5000;
    recordCheck("public-write-readback", mode, positive.id, match ? "passed" : "failed", stored.length);
    checks.at(-1).diagnostics = {
      oneRow: stored.length === 1,
      runIdentityMatches: stable(storedRun) === stable(positive),
      serverReceiptPresent: Number.isSafeInteger(receivedAt),
      fiveDayExpiry: Number.isSafeInteger(expiresAt)
        ? Math.abs(expiresAt - receivedAt - 5 * 86400000) <= 5000
        : false,
    };

    const duplicate = await post(mode, positiveBody);
    const duplicateStatus = duplicate.status,
      duplicateResponse = !duplicate.ok
        ? (await duplicate.text()).slice(0, 500)
        : "";
    const uniqueConflict =
      duplicateStatus === 409 ||
      duplicateStatus === 422 ||
      (duplicateStatus === 500 && /unique|duplicate|already exists/i.test(duplicateResponse));
    recordCheck("duplicate-run-rejected", mode, positive.id, uniqueConflict ? "passed" : "failed", duplicateStatus);
    if (!duplicate.ok) checks.at(-1).response = duplicateResponse;
    if (!duplicate.ok) {
      const afterDuplicate = await endpoints.readRows(mode),
        copies = afterDuplicate.rows.filter((row) => row.id === positive.id).length;
      recordCheck("duplicate-not-appended", mode, positive.id, copies === 1 ? "passed" : "failed", copies);
    }

    const second = makeRun(mode, randomUUID(), identities),
      secondBody = runHTML(second);
    attempted.get(mode).add(second.id);
    const secondResponse = await post(mode, secondBody),
      secondStatus = secondResponse.status,
      secondResponseBody = !secondResponse.ok
        ? (await secondResponse.text()).slice(0, 500)
        : "";
    let secondStored = [];
    if (secondResponse.ok) {
      const afterSecond = await endpoints.readRows(mode);
      secondStored = afterSecond.rows.filter((row) => row.id === second.id);
    }
    const secondAccepted = secondResponse.ok && secondStored.length === 1;
    recordCheck(
      "second-distinct-public-write",
      mode,
      second.id,
      secondAccepted ? "passed" : "failed",
      secondStatus,
    );
    if (!secondAccepted)
      checks.at(-1).response = secondResponseBody || "Second run missing from public readback.";
  } catch (error) {
    recordCheck("valid-public-write-readback", mode, positive.id, "failed", 0);
    checks.at(-1).detail = error.message;
  }

  const invalid = [
    { name: "missing-field-rejected", body: positiveBody.replace(/<meta itemprop="alias" content="[^"]*">/, "") },
    { name: "extra-field-rejected", body: positiveBody.replace("</li>", '<meta itemprop="unknown" content="extra"></li>') },
    { name: "wrong-type-rejected", body: positiveBody.replace('itemprop="elapsedMs" content="480000"', 'itemprop="elapsedMs" content="not-a-number"') },
    { name: "unsupported-track-rejected", body: positiveBody.replace('itemprop="trackId" content="'+positive.trackId+'"', 'itemprop="trackId" content="00000000-0000-4000-8000-000000000000"') },
    { name: "unsupported-rules-rejected", body: positiveBody.replace('itemprop="rulesRevision" content="'+positive.rulesRevision+'"', 'itemprop="rulesRevision" content="unsupported"') },
    { name: "invalid-split-shape-rejected", body: positiveBody.replace('itemprop="splits" content="[160000,160000,160000]"', 'itemprop="splits" content="[240000,240000]"') },
    {
      name: "split-arithmetic-rejected",
      body: positiveBody.replace(
        'itemprop="elapsedMs" content="480000"',
        'itemprop="elapsedMs" content="479999"',
      ),
    },
    {
      name: "client-expiry-rejected",
      body: positiveBody.replace(
        "</li>",
        '<meta itemprop="expiresAt" content="1"></li>',
      ),
    },
    {
      name: "unsupported-build-rejected",
      body: positiveBody.replace(
        'itemprop="buildRevision" content="' + positive.buildRevision + '"',
        'itemprop="buildRevision" content="' + "f".repeat(64) + '"',
      ),
    },
  ];
  for (const check of invalid) {
    const id = randomUUID();
    attempted.get(mode).add(id);
    const body = check.body.replace(
      'itemprop="id" content="' + positive.id + '"',
      'itemprop="id" content="' + id + '"',
    );
    try {
      const response = await post(mode, body);
      const responseStatus = response.status,
        responseBody = !response.ok
          ? (await response.text()).slice(0, 500)
          : "";
      recordCheck(
        check.name,
        mode,
        id,
        responseStatus === 422 ? "passed" : "failed",
        responseStatus,
      );
      if (!response.ok) checks.at(-1).response = responseBody;
    } catch (error) {
      recordCheck(check.name, mode, id, "failed", 0);
      checks.at(-1).detail = error.message;
    }
  }
  // Address only this fixture's active row. Never submit a document-wide
  // mutation or an expiry selector that can select another player's time.
  const selector = '#runs > li:has(meta[itemprop="id"][content="' + positive.id + '"])';
  for (const method of ["PUT", "PATCH", "DELETE"]) {
    try {
      const response = await request(BOARD_ORIGIN, BOARD_PATHS[mode], {
        method, headers: { "Content-Type": "text/html", Range: "selector=" + selector },
        ...(method === "DELETE" ? {} : { body: positiveBody }),
      });
      recordCheck("prohibited-" + method.toLowerCase(), mode, positive.id,
        [401,403,405,422].includes(response.status) ? "passed" : "failed", response.status);
      const after = await endpoints.readRows(mode);
      const matches = after.rows.filter(row => row.id === positive.id);
      recordCheck("active-row-preserved-after-" + method.toLowerCase(), mode, positive.id,
        matches.length === 1 && matches[0].alias === positive.alias ? "passed" : "failed", matches.length);
    } catch (error) {
      recordCheck("prohibited-" + method.toLowerCase(), mode, positive.id, "failed", 0);
      checks.at(-1).detail = error.message;
    }
  }
}
async function run(key) {
  ownerKey = key;
  if (typeof key !== "string" || !key.startsWith("pk_"))
    throw Error("Provide the Pagelove owner key through hidden input.");
  const auth = await request(HOST_CONFIG.authoringOrigin, "/", {
    method: "PROPFIND",
    headers: { Authorization: "Bearer " + ownerKey, Depth: "0" },
  });
  if (auth.status !== 207) throw Error("Pagelove owner authentication failed.");
  const identities = await loadOfficialBoardIdentities(), cleanup = {}, policyPreservation = {};
  for (const mode of Object.keys(BOARD_PATHS))
    policyPreservation[mode] = { before: await policySnapshot(mode) };
  try {
    for (const mode of Object.keys(BOARD_PATHS)) await checkMode(mode, identities);
  } finally {
    for (const mode of Object.keys(BOARD_PATHS)) {
      try {
        cleanup[mode] = await cleanupMode(mode);
      } catch (error) {
        cleanup[mode] = { state: "failed", detail: error.message };
        failures.push("Synthetic cleanup failed for " + mode + ".");
      }
    }
    for (const mode of Object.keys(BOARD_PATHS)) {
      try {
        policyPreservation[mode].after = await policySnapshot(mode);
        policyPreservation[mode].unchanged = policyPreservation[mode].before.sha256 === policyPreservation[mode].after.sha256;
        if (!policyPreservation[mode].unchanged) failures.push("Established policy changed for " + mode);
      } catch (error) { failures.push("Policy preservation readback failed: " + mode); }
    }
    ownerKey = "";
  }
  const receipt = {
    utc: new Date().toISOString(),
    origin: BOARD_ORIGIN,
    policyRevision: "scrap-league-casual-v1",
    tests: checks,
    cleanup,
    policyPreservation,
    publicMutationGapMs,
    pacingScope: "Predeclared low-rate comparison after retained burst failures; no warmup/activation/global-readiness inference and no server-error-as-validation-pass substitution",
    providerWideReadiness: "not available; endpoint observations are not a global guarantee",
    passed: failures.length === 0,
    failures,
    scope: "Anonymous public endpoint checks; local results remain authoritative; synthetic run rows are conditionally removed when ETags permit",
  };
  const file = path.join(
    root,
    "audit",
    "boards-public-check-" + receipt.utc.replace(/[:.]/g, "-") + ".json",
  );
  await fs.writeFile(file, JSON.stringify(receipt, null, 2));
  return { ...receipt, receipt: path.relative(root, file).replaceAll("\\", "/") };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.setEncoding("utf8");
  let buffer = "", busy = false;
  console.log("Ready for hidden JSON input: verify, quit.");
  process.stdin.on("data", async (chunk) => {
    if (chunk.includes("\u0003")) process.exit(0);
    buffer += chunk;
    const boundary = buffer.search(/[\r\n]/);
    if (boundary < 0) return;
    const line = buffer.slice(0, boundary).trim();
    buffer = buffer.slice(boundary + 1);
    if (!line) return;
    if (busy) {
      console.log(JSON.stringify({ error: "A verification is already running." }));
      return;
    }
    busy = true;
    try {
      const command = JSON.parse(line);
      if (command.op === "quit") process.exit(0);
      if (command.op !== "verify") throw Error("Unsupported operation.");
      const receipt = await run(command.key);
      console.log(JSON.stringify(receipt));
      if (!receipt.passed) process.exitCode = 1;
    } catch (error) {
      ownerKey = "";
      console.log(JSON.stringify({ error: error.message }));
      process.exitCode = 1;
    } finally {
      busy = false;
    }
  });
}
