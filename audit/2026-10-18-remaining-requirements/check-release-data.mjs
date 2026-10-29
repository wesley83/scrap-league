// A bounded, owned public row proves that publication preserves populated data.
// Credentials stay in hidden terminal input and memory. No existing row is edited.
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { DOMParser } from "linkedom";
import { Boards, runHTML } from "../../app/boards.js";
import { stable } from "../../app/model.js";
import { HOST_CONFIG } from "../../app/pagelove.js";
import {
  BOARD_ORIGIN,
  BOARD_PATHS,
  loadOfficialBoardIdentities,
} from "../../tools/board-policy.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const receiptPath = path.join(root, "audit/2026-10-18-remaining-requirements/data-preservation.json");
const boards = new Boards(null, { Parser: DOMParser });
const hash = (value) => createHash("sha256").update(value).digest("hex");
let key = "";
async function owner(method = "GET", extra = {}) {
  const response = await fetch(
    new URL(BOARD_PATHS.trial, HOST_CONFIG.authoringOrigin),
    {
      method,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      ...extra,
      headers: { Authorization: "Bearer " + key, ...extra.headers },
    },
  );
  if (!response.ok) throw Error(`Owner ${method} returned ${response.status}`);
  return response;
}
function records(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return [...doc.querySelectorAll("#runs > li")].map((row) => ({
    id: row.querySelector("[itemprop=id]")?.getAttribute("content"),
    hash: hash(row.outerHTML),
  }));
}
async function save(receipt) {
  await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
}
async function seed() {
  try {
    await fs.access(receiptPath);
    return resumeSeed();
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const identities = await loadOfficialBoardIdentities();
  const trackId = Object.keys(identities.tracks)[0];
  const run = {
    id: randomUUID(),
    alias: "Release check",
    mode: "trial",
    trackId,
    trackRevision: identities.tracks[trackId],
    rulesRevision: identities.rulesRevision,
    buildRevision: identities.builds[0],
    assist: "steering-off:manual",
    laps: 3,
    challenge: "",
    elapsedMs: 480000,
    splits: [160000, 160000, 160000],
  };
  const before = await owner();
  const receipt = {
    utc: new Date().toISOString(),
    origin: BOARD_ORIGIN,
    path: BOARD_PATHS.trial,
    synthetic: run,
    before: {
      etag: before.headers.get("etag"),
      rows: records(await before.text()),
    },
    state: "seed-attempted",
    scope:
      "Owned synthetic row and unchanged hashes of pre-existing rows; no private row payload recorded.",
  };
  // Persist the ID first so ambiguous acceptance can always be reconciled/cleaned.
  await save(receipt);
  return resumeSeed();
}
async function resumeSeed() {
  const receipt = JSON.parse(await fs.readFile(receiptPath, "utf8"));
  if (receipt.state === "awaiting-publication") return { state: receipt.state };
  if (!["seed-attempted", "seed-not-confirmed"].includes(receipt.state))
    throw Error("Receipt is already final");
  const run = receipt.synthetic;
  receipt.attempts ||= receipt.postStatus
    ? [{ status: receipt.postStatus, note: "First response body not retained" }]
    : [];
  let stored = await boards.lookup(run);
  if (!stored && receipt.attempts.length >= 3)
    throw Error("Bounded seed attempts exhausted");
  if (!stored) {
    const posted = await fetch(new URL(BOARD_PATHS.trial, BOARD_ORIGIN), {
      method: "POST",
      redirect: "error",
      credentials: "omit",
      signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "text/html", Range: "selector=#runs" },
      body: runHTML(run),
    });
    receipt.attempts.push({
      utc: new Date().toISOString(),
      status: posted.status,
      detail: posted.ok ? "" : (await posted.text()).slice(0, 1500),
    });
    if (posted.ok) await posted.body?.cancel();
    stored = await boards.lookup(run);
  }
  if (!stored) {
    receipt.state = "seed-not-confirmed";
    await save(receipt);
    throw Error("Synthetic seed not confirmed");
  }
  const { receivedAt, expiresAt, ...payload } = stored;
  if (stable(payload) !== stable(run)) throw Error("Seed payload differs");
  const populated = await owner();
  receipt.populated = {
    utc: new Date().toISOString(),
    etag: populated.headers.get("etag"),
    rows: records(await populated.text()),
  };
  receipt.state = "awaiting-publication";
  await save(receipt);
  return {
    state: receipt.state,
    rows: receipt.populated.rows.length,
    syntheticId: run.id,
  };
}
async function verifyAndClean() {
  const receipt = JSON.parse(await fs.readFile(receiptPath, "utf8"));
  const response = await owner(),
    etag = response.headers.get("etag"),
    html = await response.text();
  if (!etag) throw Error("Missing conditional-write ETag");
  const current = records(html),
    expected = receipt.populated?.rows || [];
  receipt.after = {
    utc: new Date().toISOString(),
    etag,
    rows: current,
    preserved:
      expected.length > 0 &&
      expected.every((row) =>
        current.some((now) => now.id === row.id && now.hash === row.hash),
      ),
  };
  // Cleanup only the owned ID and retain every other byte, conditional on the read.
  const marker = `itemprop="id" content="${receipt.synthetic.id}"`;
  const index = html.indexOf(marker);
  if (index >= 0) {
    const start = html.lastIndexOf(
      '<li itemscope itemtype="urn:ScrapLeague:Run">',
      index,
    );
    const end = html.indexOf("</li>", index);
    if (start < 0 || end < 0) throw Error("Could not isolate owned row");
    await owner("PUT", {
      headers: { "If-Match": etag, "Content-Type": "text/html; charset=utf-8" },
      body: html.slice(0, start) + html.slice(end + 5),
    });
  }
  const cleaned = records(await (await owner()).text());
  receipt.cleanup = {
    utc: new Date().toISOString(),
    ownedRowAbsent: !cleaned.some((row) => row.id === receipt.synthetic.id),
    otherRowsPreserved: current
      .filter((row) => row.id !== receipt.synthetic.id)
      .every((row) =>
        cleaned.some((now) => now.id === row.id && now.hash === row.hash),
      ),
  };
  receipt.state =
    receipt.after.preserved &&
    receipt.cleanup.ownedRowAbsent &&
    receipt.cleanup.otherRowsPreserved
      ? "passed"
      : "failed";
  await save(receipt);
  return {
    state: receipt.state,
    preservedRows: expected.length,
    cleanup: receipt.cleanup,
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
      throw Error("Owner key required through hidden input");
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
