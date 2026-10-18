import { STARTER, SLOTS } from "./builds.js";
import { structuralErrors, stable } from "./model.js";

export const DATABASE_VERSION = 2;
const STORES = [
  "settings",
  "progression",
  "cups",
  "presets",
  "drafts",
  "snapshots",
  "results",
  "bests",
  "ghosts",
  "outbox",
  "boards",
  "meta",
  "archive",
];
export const freshProgress = () => ({
  version: 1,
  revision: 0,
  completed: [],
  medals: {},
  cup: null,
  build: { ...STARTER },
  presets: [],
  history: [],
});
export function applyResult(progress, result, cupId, round) {
  const p = structuredClone(progress);
  if (p.history.includes(result.id)) return p;
  p.history.push(result.id);
  p.history = p.history.slice(-500);
  p.revision = (p.revision || 0) + 1;
  if (result.dnf || result.mode !== "league") return p;
  if (!p.cup || p.cup.id !== cupId || p.cup.rounds.length !== round) return p;
  const event = p.cup.index * 3 + round + 1;
  if (!p.completed.includes(event)) p.completed.push(event);
  const place = result.classification.findIndex((c) => c.id === "player");
  const key = event + ":" + result.difficulty;
  p.medals[key] = Math.max(
    p.medals[key] || 0,
    place === 0 ? 3 : place < 3 ? 2 : 1,
  );
  p.cup.rounds.push(result);
  p.cup.pending = null;
  return p;
}
function bucket(key) {
  if (key === "settings") return "settings";
  if (key === "progress") return "progression";
  return {
    draft: "drafts",
    snapshot: "snapshots",
    result: "results",
    best: "bests",
    outbox: "outbox",
    board: "boards",
    meta: "meta",
    archive: "archive",
  }[key.split(":")[0]];
}
function put(tx, key, value) {
  const name = bucket(key);
  if (!name) throw Error("Unknown saved record category.");
  if (key === "progress") {
    const { cup, presets, ...core } = value;
    tx.objectStore("progression").put(core, key);
    tx.objectStore("cups").put(cup || null, "current");
    tx.objectStore("presets").put(presets || [], "garage");
  } else if (key.startsWith("best:")) {
    const { ghost, ...best } = value;
    tx.objectStore("bests").put(best, key);
    if (ghost) tx.objectStore("ghosts").put(ghost, key);
    else tx.objectStore("ghosts").delete(key);
  } else tx.objectStore(name).put(value, key);
}
function read(tx, key, done) {
  const name = bucket(key);
  if (!name) throw Error("Unknown saved record category.");
  const req = tx.objectStore(name).get(key);
  req.onsuccess = () => {
    if (key === "progress") {
      const cup = tx.objectStore("cups").get("current"),
        presets = tx.objectStore("presets").get("garage");
      let n = 0;
      const finish = () => {
        if (++n === 2)
          done({
            ...(req.result || freshProgress()),
            cup: cup.result || null,
            presets: presets.result || [],
          });
      };
      cup.onsuccess = finish;
      presets.onsuccess = finish;
    } else if (req.result === undefined) done(undefined);
    else if (key.startsWith("best:")) {
      const ghost = tx.objectStore("ghosts").get(key);
      ghost.onsuccess = () =>
        done({ ...req.result, ghost: ghost.result || null });
    } else done(req.result);
  };
}
function rawEntries(tx, name, done) {
  const store = tx.objectStore(name),
    keys = store.getAllKeys(),
    values = store.getAll();
  let count = 0;
  const finish = () => {
    if (++count === 2)
      done(keys.result.map((key, i) => [key, values.result[i]]));
  };
  keys.onsuccess = finish;
  values.onsuccess = finish;
}
function validateRecord(key, value) {
  if (
    typeof key !== "string" ||
    !bucket(key) ||
    !value ||
    typeof value !== "object"
  )
    throw Error("Invalid saved record.");
  if (key === "progress") {
    if (
      value.version !== 1 ||
      !Array.isArray(value.completed) ||
      value.completed.length > 12 ||
      new Set(value.completed).size !== value.completed.length ||
      value.completed.some((x) => !Number.isInteger(x) || x < 1 || x > 12) ||
      !Array.isArray(value.history) ||
      value.history.length > 500 ||
      value.history.some((id) => typeof id !== "string" || id.length > 100) ||
      !SLOTS.every((s) => typeof value.build?.[s] === "string")
    )
      throw Error(
        "Unsupported progression record; original preserved for export.",
      );
    if (
      value.cup &&
      (typeof value.cup.id !== "string" ||
        !Number.isInteger(value.cup.index) ||
        value.cup.index < 0 ||
        value.cup.index > 3 ||
        !Array.isArray(value.cup.rounds) ||
        value.cup.rounds.length > 3)
    )
      throw Error("Invalid saved cup.");
    if (
      !Array.isArray(value.presets) ||
      value.presets.length > 12 ||
      value.presets.some(
        (p) =>
          typeof p.name !== "string" ||
          !SLOTS.every((s) => typeof p.build?.[s] === "string"),
      )
    )
      throw Error("Invalid saved presets.");
    if (
      !value.medals ||
      typeof value.medals !== "object" ||
      Array.isArray(value.medals) ||
      Object.entries(value.medals).some(
        ([key, medal]) =>
          !/^(?:[1-9]|1[0-2]):(?:relaxed|club|expert)$/.test(key) ||
          ![1, 2, 3].includes(medal),
      )
    )
      throw Error("Invalid saved medals.");
    for (const result of value.cup?.rounds || []) validateResult(result);
  }
  if (
    key.startsWith("draft:") &&
    (value.version > 1 || !value.track || structuralErrors(value.track).length)
  )
    throw Error("Unsupported draft format; original preserved for export.");
  if (key.startsWith("best:")) {
    if (!value.result || !Number.isFinite(value.result.elapsedMs))
      throw Error("Invalid personal best.");
    if (value.ghost && !validGhost(value.ghost))
      throw Error("Invalid ghost data.");
    validateResult(value.result);
  }
  if (key.startsWith("result:")) validateResult(value);
}
function validateResult(value) {
  if (
    !value ||
    typeof value.id !== "string" ||
    value.id.length > 100 ||
    typeof value.key !== "string" ||
    value.key.length > 600 ||
    !["league", "trial", "daily", "lesson", "workshop", "exhibition"].includes(
      value.mode,
    ) ||
    typeof value.dnf !== "boolean" ||
    (!value.dnf &&
      (!Number.isFinite(value.elapsedMs) ||
        value.elapsedMs <= 0 ||
        value.elapsedMs > 1800000)) ||
    !Array.isArray(value.splits) ||
    value.splits.length > 9 ||
    value.splits.some((n) => !Number.isFinite(n) || n <= 0) ||
    !Array.isArray(value.classification) ||
    value.classification.length > 6 ||
    value.classification.some(
      (c) => !c || typeof c.id !== "string" || c.id.length > 100,
    )
  )
    throw Error("Invalid saved result.");
}
function validGhost(ghost) {
  if (
    !(ghost instanceof Float32Array) ||
    ghost.byteLength > 512 * 1024 ||
    ghost.length % 4 ||
    ghost.some((n) => !Number.isFinite(n))
  )
    return false;
  for (let i = 0; i < ghost.length; i += 4)
    if (
      ghost[i] < 0 ||
      (i && ghost[i] <= ghost[i - 4]) ||
      Math.abs(ghost[i + 1]) > 1000 ||
      Math.abs(ghost[i + 2]) > 1000
    )
      return false;
  return true;
}
export async function openStore({
  name = "scrap-league",
  factory = globalThis.indexedDB,
} = {}) {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, DATABASE_VERSION);
    let rejected = false;
    request.onblocked = () => {
      rejected = true;
      reject(
        Error(
          "Close another old game tab to finish the storage upgrade. Your data is kept.",
        ),
      );
    };
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result,
        tx = request.transaction;
      for (const store of STORES)
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
      if (db.objectStoreNames.contains("records")) {
        const cursor = tx.objectStore("records").openCursor();
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (!c) return;
          try {
            validateRecord(c.key, c.value);
            put(tx, c.key, c.value);
          } catch (e) {
            tx.objectStore("archive").put(
              { originalKey: c.key, original: c.value, reason: e.message },
              "archive:" + c.key,
            );
          }
          c.continue();
        };
      }
      tx.objectStore("meta").put(
        { version: DATABASE_VERSION, migratedAt: new Date().toISOString() },
        "meta:schema",
      );
    };
    request.onsuccess = () => {
      if (rejected) request.result.close();
      else resolve(new Store(request.result));
    };
  });
}
export class Store {
  constructor(db) {
    this.db = db;
    this.closed = false;
    db.onversionchange = () => {
      this.closed = true;
      db.close();
    };
  }
  close() {
    this.closed = true;
    this.db.close();
  }
  atomic(body, mode = "readwrite") {
    return new Promise((resolve, reject) => {
      if (this.closed) {
        reject(
          Error(
            "Storage changed in another tab. Reload to reconnect; export any unsaved work first.",
          ),
        );
        return;
      }
      let tx, result, failure;
      const fail = (e) => {
        failure = e;
        try {
          tx.abort();
        } catch {
          reject(e);
        }
      };
      try {
        tx = this.db.transaction(STORES, mode);
        body(tx, (v) => (result = v), fail);
      } catch (e) {
        if (tx) fail(e);
        else reject(e);
        return;
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => {};
      tx.onabort = () =>
        reject(failure || tx.error || Error("Save transaction aborted."));
    });
  }
  get(key) {
    return this.atomic(
      (tx, done, fail) =>
        read(tx, key, (value) => {
          try {
            if (value !== undefined) validateRecord(key, value);
            done(value);
          } catch (e) {
            fail(e);
          }
        }),
      "readonly",
    );
  }
  set(key, value) {
    return this.update(key, () => value);
  }
  archiveAndRecoverProgress(original, recovered) {
    validateRecord("progress", recovered);
    return this.atomic((tx, done, fail) =>
      read(tx, "progress", (current) => {
        if (stable(current) !== stable(original)) {
          fail(
            Error("Progress changed in another tab; reload before recovery."),
          );
          return;
        }
        const key = "archive:progress:" + crypto.randomUUID();
        put(tx, key, {
          originalKey: "progress",
          original,
          reason: "Unsupported content references",
          archivedAt: new Date().toISOString(),
        });
        put(tx, "progress", recovered);
        done(recovered);
      }),
    );
  }
  update(key, fn) {
    return this.atomic((tx, done, fail) =>
      read(tx, key, (old) => {
        try {
          const value = fn(old);
          validateRecord(key, value);
          put(tx, key, value);
          done(value);
        } catch (e) {
          fail(e);
        }
      }),
    );
  }
  keys(prefix) {
    const name = bucket(prefix.endsWith(":") ? prefix + "x" : prefix);
    return this.atomic((tx, done) => {
      const req = tx.objectStore(name).getAllKeys();
      req.onsuccess = () =>
        done(req.result.filter((k) => k.startsWith(prefix)));
    }, "readonly");
  }
  trashDraft(id, baseline) {
    return this.update("draft:" + id, (old) => {
      if (!old || old.revision !== baseline)
        throw Error(
          "Draft changed in another tab. Save a copy or reload before moving it to Trash.",
        );
      return {
        ...old,
        revision: old.revision + 1,
        deletedAt: Date.now(),
        expiresAt: Date.now() + 7 * 86400000,
      };
    });
  }
  restoreDraft(id) {
    return this.update("draft:" + id, (old) => {
      if (!old?.deletedAt || old.expiresAt <= Date.now())
        throw Error("This draft is outside the seven-day recovery window.");
      const { deletedAt, expiresAt, ...rest } = old;
      return { ...rest, revision: old.revision + 1 };
    });
  }
  saveDraft(track, baseline, view, tested) {
    return this.update("draft:" + track.id, (old) => {
      if (old?.deletedAt)
        throw Error(
          "This draft is in Trash. Restore it or save a separate copy.",
        );
      if ((old?.revision || 0) !== baseline)
        throw Error(
          "This draft changed in another tab. Export your work or save a separate copy.",
        );
      return {
        version: 1,
        revision: baseline + 1,
        track,
        view,
        tested,
        updatedAt: new Date().toISOString(),
        previous: old
          ? [
              { track: old.track, tested: old.tested },
              ...(old.previous || []),
            ].slice(0, 2)
          : [],
      };
    });
  }
  commitResult(result, ghost, cupId, round, { fault } = {}) {
    if (ghost && !validGhost(ghost))
      return Promise.reject(Error("Ghost exceeded its storage limit."));
    return this.atomic((tx, done, fail) =>
      read(tx, "result:" + result.id, (existing) =>
        read(tx, "progress", (old) => {
          try {
            const progress = old || freshProgress();
            if (existing) {
              done(progress);
              return;
            }
            const next = applyResult(progress, result, cupId, round);
            put(tx, "progress", next);
            put(tx, "result:" + result.id, result);
            if (!result.dnf && result.mode !== "lesson")
              read(tx, "best:" + result.key, (best) => {
                try {
                  if (!best || result.elapsedMs < best.result.elapsedMs)
                    put(tx, "best:" + result.key, { result, ghost });
                  fault?.(tx, "after-best");
                } catch (e) {
                  fail(e);
                }
              });
            fault?.(tx, "after-result");
            done(next);
          } catch (e) {
            fail(e);
          }
        }),
      ),
    );
  }
  exportBackup() {
    return this.atomic((tx, done) => {
      const entries = [];
      let remaining = STORES.length;
      for (const name of STORES)
        rawEntries(tx, name, (rows) => {
          entries.push(
            ...rows.map(([key, value]) => ({
              store: name,
              key,
              value:
                value instanceof Float32Array
                  ? { type: "Float32Array", data: Array.from(value) }
                  : value,
            })),
          );
          if (!--remaining)
            done({
              format: "scrap-league-backup",
              version: 2,
              createdAt: new Date().toISOString(),
              entries,
            });
        });
    }, "readonly");
  }
  async importBackup(backup) {
    if (
      backup?.format !== "scrap-league-backup" ||
      backup.version !== 2 ||
      !Array.isArray(backup.entries) ||
      backup.entries.length > 20000
    )
      throw Error("Unsupported backup format.");
    if (JSON.stringify(backup).length > 64 * 1024 * 1024)
      throw Error("Backup exceeds 64 MiB.");
    const seen = new Set(),
      entries = backup.entries.map((entry) => {
        if (
          !STORES.includes(entry.store) ||
          typeof entry.key !== "string" ||
          entry.key.length > 600 ||
          seen.has(entry.store + ":" + entry.key)
        )
          throw Error("Invalid or duplicate backup record.");
        seen.add(entry.store + ":" + entry.key);
        let value = structuredClone(entry.value);
        if (entry.store === "ghosts") {
          if (
            value?.type !== "Float32Array" ||
            !Array.isArray(value.data) ||
            value.data.length > 131072 ||
            value.data.some((n) => typeof n !== "number" || !Number.isFinite(n))
          )
            throw Error("Invalid backup ghost.");
          value = new Float32Array(value.data);
        }
        const expected = {
          settings: "settings",
          progression: "progress",
          cups: "current",
          presets: "garage",
        }[entry.store];
        if (
          expected
            ? entry.key !== expected
            : entry.store === "ghosts"
              ? !entry.key.startsWith("best:")
              : bucket(entry.key) !== entry.store
        )
          throw Error("Backup key does not belong to its store.");
        if (
          [
            "drafts",
            "settings",
            "results",
            "outbox",
            "boards",
            "meta",
            "archive",
          ].includes(entry.store)
        )
          validateRecord(entry.key, value);
        return { ...entry, value };
      });
    const records = new Map(
      entries.map((e) => [e.store + ":" + e.key, e.value]),
    );
    const progress = records.get("progression:progress");
    if (
      progress ||
      records.has("cups:current") ||
      records.has("presets:garage")
    )
      validateRecord("progress", {
        ...(progress || freshProgress()),
        cup: records.get("cups:current") || null,
        presets: records.get("presets:garage") || [],
      });
    for (const e of entries) {
      if (e.store === "ghosts" && !records.has("bests:" + e.key))
        throw Error("Backup ghost has no matching personal best.");
      if (e.store === "bests")
        validateRecord(e.key, {
          ...e.value,
          ghost: records.get("ghosts:" + e.key) || null,
        });
    }
    await this.atomic((tx, done) => {
      for (const name of STORES) tx.objectStore(name).clear();
      for (const e of entries) tx.objectStore(e.store).put(e.value, e.key);
      done(entries.length);
    });
    return entries.length;
  }
  reset(category) {
    const targets = {
      settings: ["settings"],
      progression: ["progression", "cups"],
      presets: ["presets"],
      bests: ["bests", "ghosts"],
      drafts: ["drafts", "snapshots"],
      outbox: ["outbox"],
      boards: ["boards"],
    }[category];
    if (!targets) return Promise.reject(Error("Unknown reset category."));
    return this.atomic((tx, done) => {
      targets.forEach((name) => tx.objectStore(name).clear());
      done(true);
    });
  }
  prune(now = Date.now()) {
    return this.atomic((tx, done) => {
      const all = {};
      let left = 5;
      for (const name of ["drafts", "results", "bests", "cups", "outbox"])
        rawEntries(tx, name, (rows) => {
          all[name] = rows;
          if (--left) return;
          let removed = 0;
          for (const [key, d] of all.drafts)
            if (d.deletedAt && d.expiresAt <= now) {
              tx.objectStore("drafts").delete(key);
              removed++;
            }
          const keep = new Set([
            ...all.bests.map(([, v]) => v.result.id),
            ...all.cups.flatMap(([, v]) => (v?.rounds || []).map((r) => r.id)),
            ...all.outbox.map(([, v]) => v.run?.id),
          ]);
          const history = all.results.sort((a, b) =>
            String(b[1].createdAt).localeCompare(String(a[1].createdAt)),
          );
          for (const [key, r] of history.slice(500))
            if (!keep.has(r.id)) {
              tx.objectStore("results").delete(key);
              removed++;
            }
          done(removed);
        });
    });
  }
  enqueueRun(run) {
    return this.atomic((tx, done, fail) => {
      const s = tx.objectStore("outbox"),
        existing = s.get("outbox:" + run.id);
      existing.onsuccess = () => {
        if (existing.result) {
          done(existing.result);
          return;
        }
        const count = s.getAll();
        count.onsuccess = () => {
          if (
            count.result.filter((v) =>
              ["pending", "retry", "sending"].includes(v.state),
            ).length >= 100
          ) {
            fail(
              Error(
                "The pending score queue is full. Keep your result and retry after connecting.",
              ),
            );
            return;
          }
          const terminal = count.result
            .filter((v) => ["confirmed", "rejected"].includes(v.state))
            .sort((a, b) => b.createdAt - a.createdAt);
          for (const old of terminal.slice(50))
            s.delete("outbox:" + old.run.id);
          const value = {
            version: 1,
            run,
            state: "pending",
            attempts: 0,
            createdAt: Date.now(),
            nextAttemptAt: 0,
            lease: null,
          };
          s.put(value, "outbox:" + run.id);
          done(value);
        };
      };
    });
  }
  claimRun(owner, now = Date.now()) {
    return this.atomic((tx, done) => {
      const cursor = tx.objectStore("outbox").openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) {
          done(null);
          return;
        }
        const v = c.value;
        if (
          ["pending", "retry", "sending"].includes(v.state) &&
          (v.nextAttemptAt || 0) <= now &&
          (!v.lease || v.lease.expiresAt <= now)
        ) {
          v.lease = { owner, id: crypto.randomUUID(), expiresAt: now + 30000 };
          v.state = "sending";
          v.attempts++;
          c.update(v);
          done(v);
        } else c.continue();
      };
    });
  }
  settleRun(id, leaseId, state, message = "", now = Date.now()) {
    if (!["confirmed", "retry", "rejected"].includes(state))
      return Promise.reject(Error("Invalid submission state."));
    return this.update("outbox:" + id, (old) => {
      if (!old || old.lease?.id !== leaseId || old.lease.expiresAt <= now)
        throw Error(
          "This score response belongs to an expired submission lease.",
        );
      return {
        ...old,
        state,
        message,
        lease: null,
        nextAttemptAt:
          state === "retry"
            ? now + Math.min(300000, 1000 * 2 ** Math.min(old.attempts, 8))
            : 0,
      };
    });
  }
}
