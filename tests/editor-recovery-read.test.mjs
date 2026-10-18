import test from "node:test";
import assert from "node:assert/strict";
import { DOMParser } from "linkedom";
import { Workshop, readWorkshopDrafts } from "../app/workshop.js";
import { loadContent } from "../tools/content.mjs";
import { parseTrack, stable } from "../app/model.js";
import { compile } from "../app/track.js";

test("Files keeps export and readable drafts available after storage read failure", async (t) => {
  const previousDocument = globalThis.document;
  t.after(() => {
    globalThis.document = previousDocument;
  });
  const track = structuredClone((await loadContent()).tracks[0].track);
  track.name = "Working recovery circuit";
  for (const failure of ["closed connection", "corrupt saved record"]) {
    const document = new DOMParser().parseFromString(
      "<html><body><dialog id=modal></dialog></body></html>",
      "text/html",
    );
    globalThis.document = document;
    document.querySelector("dialog").close = () => {};
    let body, exported;
    const workshop = Object.assign(Object.create(Workshop.prototype), {
      headlessTrack: structuredClone(track),
      compiled: compile(track),
      templates: [track],
      baseline: 1,
      saveError: Error("Unsaved edit"),
      flush: async () => {
        throw Error("Save unavailable");
      },
      store: {
        keys: async () => {
          if (failure === "closed connection") throw Error("Connection closed");
          return ["draft:readable", "draft:unreadable"];
        },
        get: async (key) => {
          if (key.endsWith("unreadable")) throw Error("Invalid saved record");
          return { track, revision: 2 };
        },
      },
      dialog: (_title, value) => {
        body = value;
        document.body.append(value);
      },
      download: (_name, html) => {
        exported = html;
      },
    });
    const before = stable(workshop.track);
    await workshop.files();
    assert.match(body.textContent, /Some saved drafts could not be read/);
    assert.match(body.textContent, /Export HTML remains available/);
    assert.equal(
      body.querySelectorAll("[data-draft]").length,
      failure === "closed connection" ? 0 : 1,
    );
    await body.querySelector('[data-file="export"]').onclick();
    assert.equal(stable(parseTrack(exported, DOMParser)), before);
    assert.equal(stable(workshop.track), before);
    assert.ok(body.textContent.includes("Retry save"));
  }
});

test("draft entry validates sources, preserves corrupt records and reports incomplete reads", async () => {
  const track = structuredClone((await loadContent()).tracks[0].track);
  const rows = {
    "draft:good": { track, revision: 2, updatedAt: "2026-10-17T00:00:00Z" },
    "draft:bad": {
      track: null,
      revision: 3,
      updatedAt: "2026-10-17T01:00:00Z",
    },
    "draft:bad-date": { track, revision: 1, updatedAt: 2020 },
    "draft:trash": { deletedAt: "2026-10-16T00:00:00Z" },
  };
  const before = stable(rows);
  const store = {
    keys: async () => [...Object.keys(rows), "draft:unreadable"],
    get: async (key) => {
      if (!(key in rows)) throw Error("Read failed");
      return rows[key];
    },
  };
  const read = await readWorkshopDrafts(store, DOMParser);
  assert.deepEqual(read.records, [rows["draft:good"]]);
  assert.equal(read.errors.length, 3);
  assert.equal(stable(rows), before);
  const closed = await readWorkshopDrafts(
    {
      keys: async () => {
        throw Error("Closed");
      },
    },
    DOMParser,
  );
  assert.equal(closed.records.length, 0);
  assert.match(closed.errors[0].message, /Closed/);
});
