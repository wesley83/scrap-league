import { HOST_CONFIG, validateRun } from "./pagelove.js";
import { esc, stable, hash } from "./model.js";
import { RULES, SLOTS, assemble, allBuilds, comparisonKey } from "./builds.js";
export const RETENTION_MS = 5 * 86400000;
export const BOARD_PAGE_SIZE = 100;
export const BOARD_MAX_PAGES = 10;
const RUN_FIELDS = Object.freeze([
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
]);
export function retryAfterAt(response, now = Date.now()) {
  const value = response?.headers.get("Retry-After");
  if (!value) return 0;
  const at = /^\d+$/.test(value)
    ? now + Number(value) * 1000
    : Date.parse(value);
  return Number.isFinite(at) && at > now ? at : 0;
}
export function boardKey(run) {
  return comparisonKey({
    mode: run.mode,
    trackRevision: run.trackRevision,
    rulesRevision: run.rulesRevision,
    buildRevision: run.buildRevision,
    laps: run.laps,
    assist: run.assist,
    challenge: run.challenge,
  });
}
export function submission(result, alias) {
  if (
    result.dnf ||
    result.performanceDegraded ||
    !["trial", "daily"].includes(result.mode)
  )
    throw Error(
      "Only completed comparable official solo runs can be submitted.",
    );
  const run = {
    id: result.id,
    alias: alias.normalize("NFC").trim(),
    mode: result.mode,
    trackId: result.trackId,
    trackRevision: result.trackRevision,
    rulesRevision: result.rulesRevision,
    buildRevision: result.buildRevision,
    assist: result.assistance,
    laps: result.laps,
    challenge: result.challenge || "",
    elapsedMs: result.elapsedMs,
    splits: [...result.splits],
  };
  validateRun(run);
  return run;
}
export async function contentKeys(content) {
  const builds = new Map();
  for (const build of allBuilds(content.parts)) {
    const spec = assemble(build, content.parts),
      revision = await hash(
        SLOTS.map((s) => {
          const { name, description, unlock, ...physical } = spec[s];
          return physical;
        }),
      );
    builds.set(stable(build), revision);
  }
  return {
    tracks: new Map(content.tracks.map((t) => [t.track.id, t.revision])),
    builds: new Set(builds.values()),
    daily: new Map(
      content.daily.map((d) => [
        d.id,
        {
          trackId: d.track,
          buildRevision: builds.get(
            stable(Object.fromEntries(SLOTS.map((s) => [s, d[s]]))),
          ),
        },
      ]),
    ),
  };
}
export function recognized(run, keys) {
  validateRun(run);
  if (
    run.rulesRevision !== RULES ||
    keys.tracks.get(run.trackId) !== run.trackRevision ||
    !keys.builds.has(run.buildRevision)
  )
    throw Error("This result uses an unsupported content revision.");
  if (run.mode === "daily") {
    const daily = keys.daily.get(run.challenge);
    if (
      !daily ||
      daily.trackId !== run.trackId ||
      daily.buildRevision !== run.buildRevision
    )
      throw Error("Daily identity does not match its captured specification.");
  }
  return true;
}
export function runHTML(run) {
  validateRun(run);
  return (
    '<li itemscope itemtype="urn:ScrapLeague:Run">' +
    RUN_FIELDS.map((key) => [key, run[key]])
      .map(
        ([key, value]) =>
          '<meta itemprop="' +
          key +
          '" content="' +
          esc(key === "splits" ? JSON.stringify(value) : value) +
          '">',
      )
      .join("") +
    "</li>"
  );
}
export function parseRuns(html, Parser = DOMParser) {
  if (new TextEncoder().encode(html).length > 1048576)
    throw Error("Board response exceeds its limit.");
  const doc = new Parser().parseFromString(html, "text/html"),
    rows = [...doc.querySelectorAll('[itemtype="urn:ScrapLeague:Run"]')];
  if (rows.length > 1000)
    throw Error("Board response contains too many records.");
  const seen = new Set();
  return rows.map((row) => {
    const record = {};
    for (const field of row.querySelectorAll("[itemprop]")) {
      const name = field.getAttribute("itemprop");
      if (name in record) throw Error("Duplicate board field.");
      record[name] = field.getAttribute("content");
    }
    const { receivedAt, expiresAt, ...run } = record;
    run.laps = Number(run.laps);
    run.elapsedMs = Number(run.elapsedMs);
    run.splits = JSON.parse(run.splits);
    validateRun(run);
    const received = Number(receivedAt),
      expires = Number(expiresAt);
    if (
      !Number.isSafeInteger(received) ||
      received < 0 ||
      !Number.isSafeInteger(expires) ||
      Math.abs(expires - received - RETENTION_MS) > 5000 ||
      seen.has(run.id)
    )
      throw Error("Invalid server record identity or retention.");
    seen.add(run.id);
    return { ...run, receivedAt: received, expiresAt: expires };
  });
}
export function ranked(rows, key, now = Date.now()) {
  return rows
    .filter((r) => r.expiresAt > now && boardKey(r) === key)
    .sort(
      (a, b) =>
        a.elapsedMs - b.elapsedMs ||
        Math.min(...a.splits) - Math.min(...b.splits) ||
        a.receivedAt - b.receivedAt ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 25);
}
async function boundedText(response) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1048576) throw Error("Board response exceeds 1 MiB.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}
export class Boards {
  constructor(
    store,
    {
      config = HOST_CONFIG.publicBoards,
      fetcher = fetch,
      Parser = DOMParser,
      clock = () => Date.now(),
    } = {},
  ) {
    Object.assign(this, { store, config, fetcher, Parser, clock });
    this.owner = crypto.randomUUID();
  }
  get enabled() {
    return !!this.config?.policyRevision;
  }
  async request(mode, options = {}) {
    if (!this.enabled)
      throw Error(
        "Shared boards are not configured on this game host. Your local results are kept.",
      );
    const path = this.config.paths?.[mode],
      { page = 1, ...fetchOptions } = options;
    if (!["/boards/trial.html", "/boards/daily.html"].includes(path))
      throw Error("Unsupported board endpoint.");
    const url = new URL(HOST_CONFIG.publicOrigin + path);
    if (fetchOptions.method !== "POST") {
      if (!Number.isSafeInteger(page) || page < 1 || page > BOARD_MAX_PAGES + 1)
        throw Error("Board page exceeds the safe-read limit.");
      url.searchParams.set("paginate:runs:page", String(page));
      url.searchParams.set("paginate:runs:length", String(BOARD_PAGE_SIZE));
    }
    const init = {
      ...fetchOptions,
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    };
    const retryable = !fetchOptions.method || fetchOptions.method === "GET";
    for (let attempt = 0; ; attempt++) {
      // Browser fetch requires the Window receiver; injected transports retain
      // the same call contract instead of receiving the Boards instance.
      const response = await this.fetcher.call(globalThis, url.href, init);
      if (
        !retryable ||
        ![429, 502, 503, 504].includes(response.status) ||
        retryAfterAt(response, this.clock()) > this.clock() + 1000 ||
        attempt >= 2
      )
        return response;
      const delay = Math.max(
        retryAfterAt(response, this.clock()) - this.clock(),
        250 * (attempt + 1) + Math.random() * 100,
      );
      await response.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  async lookup(run) {
    const { rows } = await this.readRows(run.mode),
      found = rows.find((r) => r.id === run.id);
    if (!found) return null;
    const { receivedAt, expiresAt, ...stored } = found;
    if (stable(stored) !== stable(run))
      throw Error("Server identity conflicts with the queued result.");
    return found;
  }
  async readRows(mode) {
    const rows = [],
      seen = new Set();
    let page = 1,
      serverTime = null;
    while (page <= BOARD_MAX_PAGES) {
      const response = await this.request(mode, {
        page,
        headers: { Range: "selector=#runs" },
      });
      if (!response.ok) {
        const error = Error("Board read failed (" + response.status + ").");
        error.retryAt = retryAfterAt(response, this.clock());
        await response.body?.cancel();
        throw error;
      }
      const responseTime = Date.parse(response.headers.get("Date") || "");
      if (Number.isFinite(responseTime)) serverTime = responseTime;
      const batch = parseRuns(await boundedText(response), this.Parser);
      if (batch.length > BOARD_PAGE_SIZE)
        throw Error("Board page exceeds its configured row limit.");
      for (const row of batch) {
        if (seen.has(row.id))
          throw Error("Board pages changed during reading; retry the refresh.");
        seen.add(row.id);
        rows.push(row);
      }
      const link = response.headers.get("Link") || "",
        last = [...link.matchAll(/<([^>]+)>\s*;\s*rel="?last"?/gi)].at(-1);
      if (last) {
        const target = new URL(
          last[1],
          response.url || HOST_CONFIG.publicOrigin,
        );
        const pageKey = "paginate:runs:page",
          lengthKey = "paginate:runs:length",
          linkedPages = target.searchParams.getAll(pageKey),
          linkedLengths = target.searchParams.getAll(lengthKey);
        if (
          target.origin !== HOST_CONFIG.publicOrigin ||
          target.pathname !== this.config.paths[mode] ||
          linkedPages.length !== 1 ||
          linkedLengths.length > 1 ||
          (linkedLengths.length === 1 &&
            linkedLengths[0] !== String(BOARD_PAGE_SIZE)) ||
          [...target.searchParams.keys()].some(
            (key) => key !== pageKey && key !== lengthKey,
          )
        )
          throw Error("Board pagination link is outside the pinned endpoint.");
        const lastPage = Number(linkedPages[0]);
        if (page === 1 && batch.length === 0 && lastPage === 0) break;
        if (!Number.isSafeInteger(lastPage) || lastPage < page)
          throw Error("Board pagination link is invalid.");
        if (lastPage > BOARD_MAX_PAGES)
          throw Error("Board exceeds the 1,000-row safe-read limit.");
        if (page >= lastPage) break;
      } else if (batch.length < BOARD_PAGE_SIZE) break;
      if (page === BOARD_MAX_PAGES) {
        const probe = await this.request(mode, {
          page: page + 1,
          headers: { Range: "selector=#runs" },
        });
        if (
          !probe.ok ||
          parseRuns(await boundedText(probe), this.Parser).length
        )
          throw Error("Board exceeds the 1,000-row safe-read limit.");
        break;
      }
      page++;
    }
    return { rows, serverTime };
  }
  async pump() {
    if (!this.enabled || this.running || !this.store) return;
    this.running = true;
    const outcomes = [],
      attempted = new Set();
    try {
      for (let n = 0; n < 100; n++) {
        const entry = await this.store.claimRun(
          this.owner,
          this.clock(),
          attempted,
        );
        if (!entry) break;
        attempted.add(entry.run.id);
        let state = "retry",
          message = "",
          serverRetryAt = 0;
        try {
          const run = entry.run;
          try {
            validateRun(run);
          } catch (error) {
            state = "rejected";
            throw error;
          }
          let accepted = await this.lookup(run);
          if (!accepted) {
            let response;
            try {
              response = await this.request(run.mode, {
                method: "POST",
                headers: {
                  "Content-Type": "text/html",
                  Range: "selector=#runs",
                },
                body: runHTML(run),
              });
              serverRetryAt = retryAfterAt(response, this.clock());
              await response.body?.cancel();
            } catch {}
            // Reconcile even a rejection: a retry may have collided with earlier acceptance.
            accepted = await this.lookup(run);
            if (
              !accepted &&
              response &&
              [400, 401, 403, 409, 422].includes(response.status)
            ) {
              state = "rejected";
              message =
                "The server rejected this run (" +
                response.status +
                "). Your local result is retained.";
            }
          }
          if (accepted) {
            state = "confirmed";
            message = "Confirmed by server readback.";
          }
        } catch (error) {
          message = error.message;
          serverRetryAt = Math.max(serverRetryAt, error.retryAt || 0);
        }
        try {
          await this.store.settleRun(
            entry.run.id,
            entry.lease.id,
            state,
            message,
            this.clock(),
            serverRetryAt,
          );
          outcomes.push({ id: entry.run.id, state });
        } catch {
          /* Lease expiry or closed DB leaves the same durable ID for reconciliation. */
        }
      }
    } finally {
      this.running = false;
    }
    return outcomes;
  }
  async refresh(run) {
    validateRun(run);
    return this.browse(run);
  }
  async browse(run) {
    if (
      !["trial", "daily"].includes(run?.mode) ||
      !/^[a-f0-9]{64}$/.test(run.trackRevision) ||
      !/^[a-f0-9]{64}$/.test(run.buildRevision) ||
      (run.rulesRevision !== undefined && run.rulesRevision !== RULES) ||
      run.laps !== 3 ||
      !/^steering-(on|off):(auto|manual)$/.test(run.assist) ||
      (run.mode === "trial"
        ? run.challenge !== ""
        : !/^daily-v\d+:\d{4}-\d{2}-\d{2}$/.test(run.challenge))
    )
      throw Error("Invalid leaderboard comparison.");
    const key = boardKey(run);
    try {
      const { rows, serverTime } = await this.readRows(run.mode),
        now = serverTime ?? this.clock();
      const cached = {
        version: 1,
        rows,
        refreshedAt: this.clock(),
        serverOffset: now - this.clock(),
      };
      // A cache quota failure must not hide a successful public read.
      let cacheError = null;
      try {
        await this.store?.set("board:" + key, cached);
      } catch (error) {
        cacheError = error.message;
      }
      return {
        rows: ranked(rows, key, now),
        stale: false,
        refreshedAt: cached.refreshedAt,
        cacheError,
      };
    } catch (error) {
      const cached = await this.store?.get("board:" + key);
      if (!cached) throw error;
      return {
        rows: ranked(
          cached.rows,
          key,
          this.clock() + (cached.serverOffset || 0),
        ),
        stale: true,
        refreshedAt: cached.refreshedAt,
        error: error.message,
      };
    }
  }
}
