import { HOST_CONFIG, validateRun } from "./pagelove.js";
import { esc, stable, hash } from "./model.js";
import { RULES, SLOTS, assemble, allBuilds, comparisonKey } from "./builds.js";
export const RETENTION_MS = 5 * 86400000;
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
    Object.entries(run)
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
      expires !== received + RETENTION_MS ||
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
    return !!this.config?.readinessRevision;
  }
  async request(mode, options = {}) {
    if (!this.enabled)
      throw Error(
        "Shared boards await verified provider policy activation. Your local results are kept.",
      );
    const path = this.config.paths?.[mode];
    if (!["/boards/trial.html", "/boards/daily.html"].includes(path))
      throw Error("Unsupported board endpoint.");
    return this.fetcher(HOST_CONFIG.publicOrigin + path, {
      ...options,
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
  }
  async lookup(run) {
    const response = await this.request(run.mode, {
      headers: {
        Range:
          'selector=#runs > li:has(meta[itemprop="id"][content="' +
          run.id +
          '"])',
      },
    });
    if (response.status === 404) return null;
    if (!response.ok) throw Error("Could not reconcile submitted run.");
    const rows = parseRuns(await boundedText(response), this.Parser),
      found = rows.find((r) => r.id === run.id);
    if (!found) return null;
    const { receivedAt, expiresAt, ...stored } = found;
    if (stable(stored) !== stable(run))
      throw Error("Server identity conflicts with the queued result.");
    return found;
  }
  async pump() {
    if (!this.enabled || this.running || !this.store) return;
    this.running = true;
    const outcomes = [];
    try {
      for (let n = 0; n < 100; n++) {
        const entry = await this.store.claimRun(this.owner, this.clock());
        if (!entry) break;
        let state = "retry",
          message = "";
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
        }
        try {
          await this.store.settleRun(
            entry.run.id,
            entry.lease.id,
            state,
            message,
            this.clock(),
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
    const key = boardKey(run);
    try {
      const response = await this.request(run.mode, {
        headers: { Range: "selector=#runs" },
      });
      if (!response.ok)
        throw Error("Board refresh failed (" + response.status + ").");
      const rows = parseRuns(await boundedText(response), this.Parser),
        serverDate = Date.parse(response.headers.get("Date") || ""),
        now = Number.isFinite(serverDate) ? serverDate : this.clock();
      const cached = {
        version: 1,
        rows,
        refreshedAt: this.clock(),
        serverOffset: now - this.clock(),
      };
      await this.store?.set("board:" + key, cached);
      return {
        rows: ranked(rows, key, now),
        stale: false,
        refreshedAt: cached.refreshedAt,
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
