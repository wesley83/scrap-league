import {
  parseTrack,
  serializeTrack,
  stable,
  gameplay,
  hash,
  UUID,
} from "./model.js";
// Owner authoring and the anonymous casual-board documents are pinned to this game host.
export const HOST_CONFIG = Object.freeze({
  authoringOrigin: "https://dav-hire-poker-8313.onpagelove.com",
  publicOrigin: "https://hire-poker-8313.onpagelove.com",
  publicBoards: Object.freeze({
    policyRevision: "scrap-league-casual-v1",
    paths: Object.freeze({
      trial: "/boards/trial.html",
      daily: "/boards/daily.html",
    }),
  }),
});
export async function publishTrack({
  url,
  pinnedOrigin,
  key,
  track,
  baseline,
  etag,
  fetcher = fetch,
  Parser = DOMParser,
}) {
  const target = new URL(url);
  if (
    target.protocol !== "https:" ||
    target.origin !== pinnedOrigin ||
    target.username ||
    target.password
  )
    throw Error("Authoring target does not match the pinned HTTPS host.");
  if (
    !/^\/workshop-tracks\/[0-9a-f-]{36}\/definition\.html$/.test(
      target.pathname,
    ) ||
    target.search ||
    target.hash
  )
    throw Error("Unsupported authoring path.");
  const body = serializeTrack(track),
    auth = { Authorization: "Bearer " + key };
  let current = await fetcher(url, { headers: auth, cache: "no-store" });
  if (current.status !== 404 && !current.ok)
    throw Error("Could not read authoring baseline: " + current.status);
  if (current.ok) {
    const remote = parseTrack(await current.text(), Parser);
    if (
      !baseline ||
      stable(remote) !== stable(baseline) ||
      !etag ||
      current.headers.get("ETag") !== etag
    )
      throw Error("Conflict: remote track changed. Your draft is preserved.");
  } else if (baseline)
    throw Error("Conflict: the baseline resource disappeared.");
  const headers = {
    ...auth,
    "Content-Type": "text/html; charset=utf-8",
    ...(current.status === 404
      ? { "If-None-Match": "*" }
      : { "If-Match": etag }),
  };
  let response;
  try {
    response = await fetcher(url, { method: "PUT", headers, body });
  } catch {
    /* Ambiguous writes are reconciled by readback below, never blindly retried. */
  }
  if (response?.status === 412)
    throw Error(
      "Conflict: conditional write rejected. Your draft is preserved.",
    );
  if (response && !response.ok)
    throw Error("Publication rejected: " + response.status);
  const verify = await fetcher(url, { headers: auth, cache: "no-store" });
  if (!verify.ok)
    throw Error(
      "Publication unconfirmed. Keep the draft and reconcile before retrying.",
    );
  const confirmed = parseTrack(await verify.text(), Parser);
  if (stable(confirmed) !== stable(track))
    throw Error("Publication unconfirmed: readback differs.");
  return {
    state: "Published",
    etag: verify.headers.get("ETag"),
    baseline: confirmed,
    revision: await hash(gameplay(confirmed)),
  };
}
export function validateRun(run) {
  const allowed = [
    "id",
    "alias",
    "mode",
    "trackId",
    "trackRevision",
    "rulesRevision",
    "buildRevision",
    "assist",
    "laps",
    "challenge",
    "elapsedMs",
    "splits",
  ];
  if (
    !run ||
    typeof run !== "object" ||
    Object.keys(run).length !== allowed.length ||
    allowed.some((k) => !(k in run)) ||
    Object.keys(run).some((k) => !allowed.includes(k))
  )
    throw Error("Unknown run fields.");
  if (
    !UUID.test(run.id) ||
    !UUID.test(run.trackId) ||
    !/^[a-f0-9]{64}$/.test(run.trackRevision) ||
    !/^[a-f0-9]{64}$/.test(run.buildRevision) ||
    !/^scrap-physics-v\d+\.\d+\.\d+$/.test(run.rulesRevision) ||
    !/^steering-(on|off):(auto|manual)$/.test(run.assist) ||
    (run.mode === "trial"
      ? run.challenge !== ""
      : !/^daily-v\d+:\d{4}-\d{2}-\d{2}$/.test(run.challenge))
  )
    throw Error("Invalid run identity or comparison fields.");
  if (
    !["trial", "daily"].includes(run.mode) ||
    !Number.isInteger(run.elapsedMs) ||
    run.elapsedMs <= 0 ||
    run.elapsedMs > 480000 ||
    !Number.isInteger(run.laps) ||
    run.laps !== 3 ||
    !Array.isArray(run.splits) ||
    run.splits.length !== run.laps ||
    run.splits.some((n) => !Number.isInteger(n) || n <= 0) ||
    run.splits.reduce((a, b) => a + b, 0) !== run.elapsedMs
  )
    throw Error("Invalid run timing.");
  if (
    typeof run.alias !== "string" ||
    run.alias !== run.alias.normalize("NFC").trim() ||
    [...run.alias.trim()].length < 1 ||
    [...run.alias].length > 24 ||
    /[\u0000-\u001f\u007f]/.test(run.alias)
  )
    throw Error("Invalid alias.");
  return true;
}
