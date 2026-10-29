import {
  publishOwnerTrack,
  loadOwnerTrack,
  listTrack,
  discoverTracks,
  readPublishedTrack,
} from "./publication.js";
import { shareInvitation } from "./sharing.js";
import {
  transformSelection,
  addPatch,
  createRecipe,
  placeRecipe,
  deleteRecipe,
  editRecipe,
  assignRecipe,
} from "./editor-commands.js";
import {
  uid,
  clone,
  esc,
  serializeTrack,
  parseTrack,
  duplicateTrack,
  gameplay,
  hash,
} from "./model.js";
import {
  compile,
  appendPiece,
  closeLoop,
  reflow,
  suggestRaceSetup,
  pointAtPiece,
  pieceLength,
  nearest,
  atDistance,
} from "./track.js";
import { TrackDocument } from "./track-document.js";
export async function readWorkshopDrafts(store, Parser = DOMParser) {
  const records = [],
    errors = [];
  try {
    const keys = (await store?.keys("draft:")) || [];
    const reads = await Promise.allSettled(keys.map((key) => store.get(key)));
    for (const read of reads) {
      try {
        if (read.status === "rejected") throw read.reason;
        const record = read.value;
        if (record?.deletedAt) continue;
        if (
          !record ||
          !Number.isSafeInteger(record.revision) ||
          record.revision < 1 ||
          typeof record.updatedAt !== "string" ||
          !Number.isFinite(Date.parse(record.updatedAt))
        )
          throw Error("Invalid saved draft metadata.");
        // Exercise the same semantic source boundary used when opening a draft.
        parseTrack(serializeTrack(record.track), Parser);
        records.push(record);
      } catch (error) {
        errors.push(error);
      }
    }
  } catch (error) {
    errors.push(error);
  }
  records.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  return { records, errors };
}
export class Workshop {
  get track() {
    return this.sourceDocument
      ? this.sourceDocument.read()
      : this.headlessTrack;
  }
  set track(value) {
    if (this.sourceDocument) this.sourceDocument.replace(value);
    else this.headlessTrack = value;
  }
  constructor(
    root,
    { store, templates, onTest, notify, dialog, download, build },
  ) {
    Object.assign(this, {
      root,
      store,
      templates,
      onTest,
      notify,
      dialog,
      download,
      build,
    });
    this.history = [];
    this.publications = new Map();
    this.future = [];
    this.baseline = 0;
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.tool = "select";
    this.tested = "";
    this.saveChain = Promise.resolve();
    this.generation = 0;
    this.root.innerHTML = `<div class="workshop-bar"><div><span class="eyebrow">TRACK WORKSHOP</span><input id="track-name" aria-label="Track name" maxlength="60"></div><div class="command-row"><button id="work-undo">Undo</button><button id="work-redo">Redo</button><button id="work-file">Files</button><button id="work-test" class="primary">Test drive</button></div></div><div class="workbench"><aside class="palette"><label>Road piece<select id="piece-kind"><option value="straight">Straight</option><option value="quarter">Quarter bend</option><option value="hairpin">Hairpin</option><option value="taper">Width transition</option><option value="start">Start straight</option></select></label><label>Length<select id="piece-length"><option>60</option><option>40</option><option>20</option></select></label><label>Bend radius<select id="piece-radius"><option>40</option><option>20</option></select></label><label>Turn<select id="piece-turn"><option value="1">Right</option><option value="-1">Left</option></select></label><button id="place-road">Append road</button><button id="close-loop">Connect last to first</button><button id="setup-race">Suggest gates & grid</button><hr><label>Canvas tool<select id="editor-tool"><option value="select">Select</option><option value="pan">Pan</option><option value="pad">Place boost pad</option><option value="barrier">Place tire barrier</option><option value="island">Place scrap island</option></select></label><button id="add-prop">Place object on selected road</button><button id="add-gate">Add checkpoint on selected road</button><button id="fit-track">Fit track</button><label class="check"><input type="checkbox" id="test-ai"> Five AI rivals</label><label>Test laps<input id="track-laps" type="number" min="1" max="9"></label><label>Scene<select id="track-scene"><option value="yard">The yard</option><option value="docks">Dockside</option><option value="foundry">Foundry</option><option value="night">Night shift</option></select></label><button id="work-garage">Choose test car</button></aside><div class="draft-canvas"><canvas id="track-canvas" tabindex="0" aria-label="Track editing canvas. Select pieces with the object list; use numeric fields for keyboard editing."></canvas><div class="canvas-label">METERS / TOP VIEW <span id="zoom-label"></span></div><div class="canvas-buttons"><button id="zoom-in" aria-label="Zoom in">+</button><button id="zoom-out" aria-label="Zoom out">−</button></div></div><aside class="inspector"><label>Objects<select id="object-list" size="5" aria-label="Track objects"></select></label><div id="object-fields"></div><div id="validation"></div></aside></div><div class="workshop-status"><span id="draft-status" role="status">Unsaved draft</span><span id="track-validity"></span><span id="test-status">No test lap yet</span></div><input id="import-track" type="file" accept=".html,text/html" hidden>`;
    const q = (id) => root.querySelector("#" + id);
    this.q = q;
    this.canvas = q("track-canvas");
    this.ctx = this.canvas.getContext("2d");
    this.selection = new Set();
    this.setupAdvanced();
    const sourceRoot = document.createElement("div");
    sourceRoot.hidden = true;
    sourceRoot.dataset.authoringSource = "track";
    this.root.append(sourceRoot);
    this.sourceDocument = new TrackDocument(sourceRoot);
    const help = document.createElement("div");
    help.className = "workshop-help";
    help.textContent =
      "Start with a complete circuit. Select a road or object to edit it. Files opens templates and HTML import/export. Test drive returns to this draft; changes save automatically.";
    this.root.querySelector(".workshop-bar").after(help);
    q("track-name").onchange = () =>
      this.command((t) => {
        t.name = q("track-name").value.trim() || "Untitled circuit";
      });
    q("track-laps").onchange = () =>
      this.command((t) => {
        const n = Number(q("track-laps").value);
        if (!Number.isInteger(n) || n < 1 || n > 9)
          throw Error("Choose 1–9 laps.");
        t.laps = n;
      });
    q("track-scene").onchange = () =>
      this.command((t) => {
        t.scenePreset = q("track-scene").value;
      }, false);
    q("work-undo").onclick = () => this.undo();
    q("work-redo").onclick = () => this.redo();
    q("piece-kind").onchange = () => {};
    q("track-name").onblur = () => {
      if (q("track-name").value.trim() !== this.track.name)
        q("track-name").onchange();
    };
    q("track-laps").onblur = () => {
      if (Number(q("track-laps").value) !== this.track.laps)
        q("track-laps").onchange();
    };
    q("place-road").onclick = () =>
      this.command((t) => {
        const p = appendPiece(t, q("piece-kind").value, {
          length:
            q("piece-kind").value === "start"
              ? 60
              : q("piece-kind").value === "taper"
                ? 40
                : Number(q("piece-length").value),
          radius: Number(q("piece-radius").value),
          turn: Number(q("piece-turn").value),
        });
        this.selected = p.id;
      });
    q("close-loop").onclick = () => this.command(closeLoop);
    q("setup-race").onclick = () => this.command(suggestRaceSetup);
    q("fit-track").onclick = () => {
      this.fit();
      this.draw();
    };
    q("editor-tool").onchange = () => (this.tool = q("editor-tool").value);
    q("object-list").onchange = () => {
      this.selection = new Set(
        [...q("object-list").selectedOptions].map((o) => o.value),
      );
      this.selected = [...this.selection].at(-1);
      this.inspect();
      this.draw();
    };
    q("add-prop").onclick = () =>
      this.command((t) => {
        const p = t.pieces.find((p) => p.id === this.selected);
        if (!p) throw Error("Select a road piece first.");
        const at = pointAtPiece(p, pieceLength(p) / 2),
          kind = ["pad", "barrier", "island"].includes(this.tool)
            ? this.tool
            : "pad";
        const prop = {
          id: uid(),
          kind,
          x: at.x,
          z: at.z,
          heading: at.heading,
          length: kind === "pad" ? 8 : 4,
          width: kind === "pad" ? 6 : 1.5,
          duration: 1,
          damping: 0.2,
        };
        t.props.push(prop);
        this.selected = prop.id;
      });
    q("add-gate").onclick = () =>
      this.command((t) => {
        const p = t.pieces.find((p) => p.id === this.selected);
        if (!p) throw Error("Select a road piece first.");
        const gate = {
          id: uid(),
          kind: "checkpoint",
          pieceId: p.id,
          distance: pieceLength(p) / 2,
          order: t.gates.length,
        };
        t.gates.push(gate);
        const c = compile(t),
          finish = t.gates.find((g) => g.kind === "finish"),
          rest = t.gates
            .filter((g) => g !== finish)
            .sort(
              (a, b) =>
                c.offsets.get(a.pieceId) +
                a.distance -
                (c.offsets.get(b.pieceId) + b.distance),
            );
        t.gates = [finish, ...rest].filter(Boolean);
        t.gates.forEach((g, i) => (g.order = i));
        const at = pointAtPiece(p, Math.min(pieceLength(p), gate.distance + 5));
        t.spawns.push({
          id: uid(),
          role: "respawn",
          x: at.x,
          z: at.z,
          heading: at.heading,
          slot: 0,
          gateId: gate.id,
        });
        this.selected = gate.id;
      });
    q("work-test").onclick = () => this.test();
    q("work-file").onclick = () => this.files();
    q("work-garage").onclick = () => this.build();
    q("zoom-in").onclick = () => {
      this.zoom *= 1.3;
      this.draw();
    };
    q("zoom-out").onclick = () => {
      this.zoom /= 1.3;
      this.draw();
    };
    q("import-track").onchange = async () => {
      const file = q("import-track").files[0];
      q("import-track").value = "";
      if (!file) return;
      try {
        if (file.size > 1048576) throw Error("Import limit is 1 MiB.");
        const t = parseTrack(await file.text()),
          c = compile(t);
        await this.dialog(
          "Import " + t.name,
          `${t.pieces.length} road pieces · ${Math.round(c.length)} m · ${c.valid ? "Race-ready" : "Draft with " + c.problems.length + " problems"}. Your current draft remains saved.`,
          [
            {
              label: "Import as a new copy",
              action: () => this.open(duplicateTrack(t)),
            },
            { label: "Cancel" },
          ],
        );
      } catch (e) {
        this.notify(e.message, true);
      }
    };
    this.pointers = new Map();
    this.canvas.addEventListener("pointerdown", (e) => {
      this.canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size > 1) {
        if (this.drag?.snapshot) {
          this.track = this.drag.snapshot;
          this.refresh();
        }
        this.drag = {
          x: e.clientX,
          y: e.clientY,
          pan: { ...this.pan },
          moved: true,
          pinch: true,
          snapshot: null,
        };
        return;
      }
      this.drag = {
        x: e.clientX,
        y: e.clientY,
        pan: { ...this.pan },
        moved: false,
        snapshot: this.tool === "move" ? clone(this.track) : null,
      };
    });
    this.canvas.addEventListener("pointermove", (e) => {
      if (!this.pointers.has(e.pointerId) || !this.drag) return;
      const prior = this.pointers.get(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size > 1) {
        const other = [...this.pointers.entries()].find(
            ([id]) => id !== e.pointerId,
          )[1],
          old = Math.hypot(prior.x - other.x, prior.y - other.y),
          next = Math.hypot(e.clientX - other.x, e.clientY - other.y);
        if (old > 0)
          this.zoom = Math.max(0.2, Math.min(10, (this.zoom * next) / old));
        this.drag.moved = true;
      } else if (this.tool === "move" && this.drag?.snapshot) {
        const grid = this.track.pieces.some((p) => this.selection.has(p.id))
          ? 20
          : 0.5;
        const dx =
            Math.round((e.clientX - this.drag.x) / this.scale / grid) * grid,
          dz = Math.round((e.clientY - this.drag.y) / this.scale / grid) * grid;
        const nextTrack = clone(this.drag.snapshot);
        try {
          transformSelection(nextTrack, this.selection, { dx, dz });
          this.track = nextTrack;
          this.compiled = compile(this.track);
          this.drag.moved = dx !== 0 || dz !== 0;
        } catch {}
      } else if (this.tool === "pan" || e.buttons === 4) {
        this.pan.x += e.clientX - prior.x;
        this.pan.y += e.clientY - prior.y;
        this.drag.moved = true;
      } else if (
        Math.hypot(e.clientX - this.drag.x, e.clientY - this.drag.y) > 6
      )
        this.drag.moved = true;
      this.draw();
    });
    this.canvas.addEventListener("pointerup", (e) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size) return;
      if (this.drag?.snapshot && this.drag.moved) {
        const moved = clone(this.track);
        this.track = this.drag.snapshot;
        this.command((t) => Object.assign(t, moved));
        this.drag = null;
        return;
      }
      if (!this.drag?.moved) {
        const r = this.canvas.getBoundingClientRect(),
          p = this.toWorld(e.clientX - r.left, e.clientY - r.top);
        if (this.tool === "select") {
          let best = null,
            dist = 12 / this.scale;
          for (const prop of this.track.props) {
            const d = Math.hypot(p.x - prop.x, p.z - prop.z);
            if (d < dist) {
              dist = d;
              best = prop.id;
            }
          }
          const selected = best || nearest(this.compiled, p.x, p.z)?.pieceId;
          if (e.shiftKey) {
            this.selection.has(selected)
              ? this.selection.delete(selected)
              : this.selection.add(selected);
            this.selected = [...this.selection].at(-1);
          } else {
            this.selected = selected;
            this.selection = new Set([selected].filter(Boolean));
          }
          this.refresh();
        } else if (["pad", "barrier", "island"].includes(this.tool)) {
          const road = nearest(this.compiled, p.x, p.z);
          this.command((t) => {
            const prop = {
              id: uid(),
              kind: this.tool,
              x: Math.round(p.x * 2) / 2,
              z: Math.round(p.z * 2) / 2,
              heading: road?.heading || 0,
              length: this.tool === "pad" ? 8 : 4,
              width: this.tool === "pad" ? 6 : 1.5,
              duration: 1,
              damping: 0.2,
            };
            t.props.push(prop);
            this.selected = prop.id;
          });
        }
      }
      this.drag = null;
    });
    const cancelPointer = (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.clear();
      if (this.drag?.snapshot) {
        this.track = this.drag.snapshot;
        this.refresh();
      }
      this.drag = null;
    };
    this.canvas.addEventListener("pointercancel", cancelPointer);
    this.canvas.addEventListener("lostpointercapture", cancelPointer);
    this.canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoom = Math.max(
          0.2,
          Math.min(10, this.zoom * Math.exp(-e.deltaY * 0.001)),
        );
        this.draw();
      },
      { passive: false },
    );
    this.canvas.onkeydown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? this.redo() : this.undo();
      }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        if (this.tool === "move" && !e.altKey) {
          const step = this.track.pieces.some((p) => this.selection.has(p.id))
            ? 20
            : 0.5;
          this.command((t) =>
            transformSelection(t, this.selection, {
              dx:
                e.key === "ArrowLeft"
                  ? -step
                  : e.key === "ArrowRight"
                    ? step
                    : 0,
              dz:
                e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0,
            }),
          );
          return;
        }
        this.pan.x +=
          e.key === "ArrowLeft" ? 20 : e.key === "ArrowRight" ? -20 : 0;
        this.pan.y +=
          e.key === "ArrowUp" ? 20 : e.key === "ArrowDown" ? -20 : 0;
        this.draw();
      }
    };
    new ResizeObserver(() => this.draw()).observe(this.canvas);
  }
  setupAdvanced() {
    const q = this.q;
    q("object-list").multiple = true;
    q("editor-tool").insertAdjacentHTML(
      "beforeend",
      '<option value="move">Move selection</option>',
    );
    const controls = document.createElement("div");
    controls.className = "editor-advanced";
    controls.innerHTML =
      '<h3>Selection</h3><button id="select-all">Select all objects</button><div class="command-row"><button id="rotate-left">Rotate −90°</button><button id="rotate-right">Rotate +90°</button></div><div class="field-grid"><label>Move X (m)<input id="move-x" type="number" step="0.5" value="0"></label><label>Move Z (m)<input id="move-z" type="number" step="0.5" value="0"></label></div><button id="move-group">Move selection</button><button id="partial-patch">Add partial surface</button><button id="recipes">Custom recipes</button><button id="source-preview">Preview HTML</button><button id="publish-track">Publish with owner key</button><button id="discover-tracks">Browse published circuits</button>';
    this.root.querySelector(".palette").append(controls);
    q("select-all").onclick = () => {
      this.selection = new Set(
        [...this.track.pieces, ...this.track.props, ...this.track.spawns].map(
          (p) => p.id,
        ),
      );
      this.selected = [...this.selection][0];
      this.refresh();
    };
    q("rotate-left").onclick = () =>
      this.command((t) =>
        transformSelection(t, this.selection, { angle: -Math.PI / 2 }),
      );
    q("rotate-right").onclick = () =>
      this.command((t) =>
        transformSelection(t, this.selection, { angle: Math.PI / 2 }),
      );
    q("move-group").onclick = () =>
      this.command((t) =>
        transformSelection(t, this.selection, {
          dx: Number(q("move-x").value),
          dz: Number(q("move-z").value),
        }),
      );
    q("partial-patch").onclick = () =>
      this.command((t) => {
        this.selected = addPatch(t, this.selected).id;
      });
    q("recipes").onclick = () => this.recipeDialog();
    q("publish-track").onclick = () =>
      this.publicationDialog().catch((e) => this.notify(e.message, true));
    q("discover-tracks").onclick = () => this.discoveryDialog();
    q("source-preview").onclick = () => {
      const text = document.createElement("textarea");
      text.readOnly = true;
      text.rows = 15;
      text.value = serializeTrack(this.track);
      text.setAttribute("aria-label", "Canonical track HTML");
      this.dialog("Track source", text);
    };
    const tabs = document.createElement("nav");
    tabs.className = "editor-sheets";
    tabs.setAttribute("aria-label", "Workshop panels");
    for (const [label, panel] of [
      ["Track", "canvas"],
      ["Tools", "tools"],
      ["Inspector", "inspector"],
    ]) {
      const button = document.createElement("button");
      button.textContent = label;
      button.onclick = () => {
        this.root.dataset.panel = panel;
        this.draw();
      };
      tabs.append(button);
    }
    this.root.querySelector(".workshop-bar").after(tabs);
    this.root.dataset.panel = "canvas";
  }
  async publicationDialog() {
    await this.flush();
    const body = document.createElement("div");
    body.innerHTML =
      '<p>Publish to hire-poker-8313.onpagelove.com. The owner key is sent only to its pinned DAV host and is never saved.</p><label>Public slug<input id="publish-slug" maxlength="48"></label><label>Description<input id="publish-description" maxlength="240"></label><label>Owner key<input id="owner-key" type="password" autocomplete="off" spellcheck="false"></label><label>Published track ID to open<input id="published-id" autocomplete="off"></label>';
    body.querySelector("#publish-slug").value = this.track.slug;
    body.querySelector("#publish-description").value = this.track.description;
    body.querySelector("#published-id").value = this.track.id;
    const takeKey = () => {
      const field = body.querySelector("#owner-key"),
        key = field.value;
      field.value = "";
      return key;
    };
    this.dialog("Owner publication", body, [
      {
        label: "Publish current track",
        action: async () => {
          const key = takeKey(),
            snapshot = clone(this.track);
          snapshot.slug = body.querySelector("#publish-slug").value.trim();
          snapshot.description = body
            .querySelector("#publish-description")
            .value.trim();
          if (this.tested !== (await hash(gameplay(snapshot))))
            throw Error(
              "Complete a valid test lap of this gameplay revision before publishing.",
            );
          this.publications ||= new Map();
          const baseline =
            this.publications.get(snapshot.id) ||
            (await this.store?.get("meta:published:" + snapshot.id));
          const result = await publishOwnerTrack(snapshot, key, baseline);
          const savedPublication = {
            baseline: result.baseline,
            etag: result.etag,
            revision: result.revision,
            url: result.url,
            listed: result.listed,
          };
          this.publications.set(snapshot.id, savedPublication);
          let localWarning = "";
          try {
            await this.store?.set(
              "meta:published:" + snapshot.id,
              savedPublication,
            );
          } catch (e) {
            localWarning =
              " The local publication receipt could not save; keep this exact link.";
          }
          if (this.track.id === snapshot.id) {
            this.command((t) => {
              t.slug = snapshot.slug;
              t.description = snapshot.description;
            }, false);
            try {
              await this.flush();
            } catch (e) {
              localWarning += " Local draft save needs retry.";
            }
          }
          const link = document.createElement("a");
          link.href = result.url;
          link.textContent = result.url;
          const status = document.createElement("div");
          const p = document.createElement("p");
          p.textContent = result.listed
            ? "Published and listed."
            : "Published. Listing needs retry: " + result.listingError;
          p.textContent += localWarning;
          status.append(p, link);
          this.dialog("Track published", status, [
            {
              label: "Share track",
              action: () =>
                shareInvitation(
                  {
                    title: snapshot.name,
                    text:
                      "Race " +
                      snapshot.name +
                      " in Scrap League, then build your own circuit.",
                    url: result.url,
                    complete:
                      snapshot.name +
                      " — race this circuit in Scrap League.\n" +
                      result.url,
                  },
                  {
                    manual: (text) =>
                      this.dialog("Copy track invitation", text),
                    copied: () => this.notify("Track invitation copied."),
                  },
                ),
            },
            { label: "Close" },
          ]);
        },
      },
      {
        label: "Open owner track",
        action: async () => {
          const key = takeKey(),
            record = await loadOwnerTrack(
              body.querySelector("#published-id").value.trim(),
              key,
            );
          const saved = await this.store?.get("draft:" + record.track.id);
          if (saved || this.track?.id === record.track.id) {
            this.dialog(
              "Local draft exists",
              "Opening the published revision would replace local draft content. Export or duplicate the local draft first.",
              [{ label: "Keep draft" }],
            );
            return;
          }
          await this.open(record.track);
          const receipt = {
            baseline: record.baseline,
            etag: record.etag,
            revision: record.revision,
          };
          this.publications.set(record.track.id, receipt);
          await this.store?.set("meta:published:" + record.track.id, receipt);
        },
      },
      {
        label: "Retry listing",
        action: async () => {
          const key = takeKey(),
            record =
              this.publications?.get(this.track.id) ||
              (await this.store?.get("meta:published:" + this.track.id));
          if (!record?.baseline) throw Error("Publish this track first.");
          await listTrack(record.baseline, record.revision, key);
          await this.store.set("meta:published:" + this.track.id, {
            ...record,
            listed: true,
          });
          this.notify("Published track listing confirmed.");
        },
      },
      {
        label: "Cancel",
        action: () => {
          takeKey();
        },
      },
    ]);
  }
  async discoveryDialog() {
    try {
      const entries = await discoverTracks(),
        body = document.createElement("div");
      if (!entries.length)
        body.textContent =
          "No published circuits yet. Your local drafts and official copies remain available.";
      for (const entry of entries) {
        const button = document.createElement("button");
        button.textContent = entry.name;
        button.onclick = async () => {
          try {
            const track = await readPublishedTrack(entry.id);
            await this.store?.set("meta:published-snapshot:" + entry.id, {
              track,
              downloadedAt: new Date().toISOString(),
            });
            await this.open(duplicateTrack(track));
            document.querySelector("#modal").close();
          } catch (e) {
            this.notify(e.message, true);
          }
        };
        body.append(button);
      }
      this.dialog("Published circuits", body);
    } catch (error) {
      const keys = (await this.store?.keys("meta:")) || [],
        body = document.createElement("div");
      const p = document.createElement("p");
      p.textContent =
        error.message + " Saved downloaded copies are labeled below.";
      body.append(p);
      for (const key of keys.filter((k) =>
        k.startsWith("meta:published-snapshot:"),
      )) {
        const record = await this.store.get(key),
          button = document.createElement("button");
        button.textContent =
          record.track.name + " · cached " + record.downloadedAt.slice(0, 10);
        button.onclick = async () => {
          try {
            await this.open(duplicateTrack(record.track));
            document.querySelector("#modal").close();
          } catch (e) {
            this.notify(e.message, true);
          }
        };
        body.append(button);
      }
      this.dialog("Published circuits offline", body);
    }
  }
  recipeDialog() {
    const body = document.createElement("div");
    body.innerHTML =
      '<p>Bounded variants use the same physics as standard objects. Lights are decorative.</p><label>Base behavior<select id="recipe-kind"><option value="pad">Boost pad</option><option value="barrier">Tire barrier</option><option value="light-warm">Warm light</option><option value="light-cool">Cool light</option></select></label><label>Pad seconds (0.5–1.5)<input id="recipe-duration" type="number" min="0.5" max="1.5" step="0.1" value="1"></label><label>Barrier damping (0–0.8)<input id="recipe-damping" type="number" min="0" max="0.8" step="0.1" value="0.2"></label>';
    const create = document.createElement("button");
    create.textContent = "Create recipe";
    create.onclick = () => {
      this.command((t) =>
        createRecipe(t, {
          kind: body.querySelector("#recipe-kind").value,
          duration: Number(body.querySelector("#recipe-duration").value),
          damping: Number(body.querySelector("#recipe-damping").value),
        }),
      );
      this.recipeDialog();
    };
    body.append(create);
    for (const recipe of this.track.recipes) {
      const row = document.createElement("div");
      row.className = "command-row";
      const place = document.createElement("button");
      place.textContent =
        "Place " +
        recipe.kind +
        " · " +
        recipe.duration +
        "s / " +
        recipe.damping;
      place.onclick = () => {
        this.command((t) => {
          this.selected = placeRecipe(t, this.selected, recipe.id).id;
        });
        document.querySelector("#modal").close();
      };
      const remove = document.createElement("button");
      remove.textContent = "Delete recipe";
      remove.onclick = () => {
        this.command((t) => deleteRecipe(t, recipe.id));
        this.recipeDialog();
      };
      const edit = document.createElement("button");
      edit.textContent = "Edit recipe";
      edit.onclick = () => {
        body.querySelector("#recipe-kind").value = recipe.kind;
        body.querySelector("#recipe-duration").value = recipe.duration;
        body.querySelector("#recipe-damping").value = recipe.damping;
        create.textContent = "Save recipe changes";
        create.onclick = () => {
          this.command((t) =>
            editRecipe(t, recipe.id, {
              kind: body.querySelector("#recipe-kind").value,
              duration: Number(body.querySelector("#recipe-duration").value),
              damping: Number(body.querySelector("#recipe-damping").value),
            }),
          );
          this.recipeDialog();
        };
        body.querySelector("#recipe-kind").focus();
      };
      const assign = document.createElement("button");
      assign.textContent = "Assign to selected objects";
      assign.onclick = () => {
        this.command((t) => assignRecipe(t, [...this.selection], recipe.id));
        this.recipeDialog();
      };
      row.append(place, edit, assign, remove);
      body.append(row);
    }
    this.dialog("Custom recipes", body);
  }
  inspectPatch(patch, root) {
    root.innerHTML =
      '<h3>Surface patch</h3><label>Surface<select data-patch="surface"><option value="gravel">Gravel</option><option value="mud">Mud</option></select></label>' +
      [
        ["start", "Start along road (m)"],
        ["end", "End along road (m)"],
        ["lateralMin", "Left edge (m)"],
        ["lateralMax", "Right edge (m)"],
      ]
        .map(
          ([field, label]) =>
            "<label>" +
            label +
            '<input type="number" step="0.1" data-patch="' +
            field +
            '" value="' +
            patch[field] +
            '"></label>',
        )
        .join("") +
      '<button id="patch-apply">Apply patch</button><button id="patch-delete">Delete patch</button>';
    root.querySelector("select").value = patch.surface;
    root.querySelector("#patch-apply").onclick = () =>
      this.command((t) => {
        const values = { id: patch.id };
        for (const input of root.querySelectorAll("[data-patch]")) {
          if (!input.value.trim()) throw Error("Enter a value.");
          values[input.dataset.patch] =
            input.dataset.patch === "surface"
              ? input.value
              : Number(input.value);
        }
        t.patches = t.patches.filter((p) => p.id !== patch.id);
        addPatch(t, patch.pieceId, values);
      });
    root.querySelector("#patch-delete").onclick = () =>
      this.command((t) => {
        t.patches = t.patches.filter((p) => p.id !== patch.id);
        this.selected = patch.pieceId;
      });
  }
  async open(track, stored = null) {
    await this.flush();
    this.generation++;
    this.track = clone(track);
    this.historyTrimmed = false;
    this.baseline = stored?.revision || 0;
    this.tested = stored?.tested || "";
    this.history = [];
    this.future = [];
    this.selected = stored?.view?.selected || track.pieces[0]?.id;
    this.selection = new Set(
      stored?.view?.selection || [this.selected].filter(Boolean),
    );
    this.compiled = compile(this.track);
    this.zoom = stored?.view?.zoom || 1;
    this.pan = stored?.view?.pan || { x: 0, y: 0 };
    this.refresh();
    if (!stored?.view) this.fit();
    this.save();
  }
  command(fn, game = true) {
    try {
      const next = clone(this.track);
      fn(next);
      const previous = clone(this.track);
      this.track = next;
      this.history.push(previous);
      while (
        this.history.length > 100 ||
        JSON.stringify(this.history).length > 10 * 1024 * 1024
      ) {
        this.history.shift();
        this.historyTrimmed = true;
      }
      this.future = [];
      if (game) this.tested = "";
      this.refresh();
      this.save();
    } catch (e) {
      this.notify(e.message, true);
    }
  }
  undo() {
    if (!this.history.length) return;
    this.future.push(clone(this.track));
    this.track = this.history.pop();
    this.tested = "";
    this.refresh();
    this.save();
  }
  redo() {
    if (!this.future.length) return;
    this.history.push(clone(this.track));
    this.track = this.future.pop();
    this.tested = "";
    this.refresh();
    this.save();
  }
  refresh() {
    this.compiled = compile(this.track);
    const q = this.q;
    q("track-name").value = this.track.name;
    q("track-laps").value = this.track.laps;
    q("track-scene").value = this.track.scenePreset;
    q("work-undo").disabled = !this.history.length;
    q("work-undo").title =
      !this.history.length && this.historyTrimmed
        ? "Oldest retained edit reached (100 edits / 10 MiB)"
        : "Undo the previous edit";
    q("work-redo").disabled = !this.future.length;
    q("object-list").innerHTML = [
      ...this.track.pieces.map(
        (p, i) =>
          `<option value="${p.id}">Road ${i + 1} · ${esc(p.kind)}</option>`,
      ),
      ...this.track.props.map(
        (p, i) =>
          `<option value="${p.id}">Object ${i + 1} · ${esc(p.kind)}</option>`,
      ),
      ...this.track.spawns.map(
        (s) =>
          `<option value="${s.id}">${s.role === "grid" ? "Grid " + s.slot : "Respawn " + (this.track.gates.find((g) => g.id === s.gateId)?.order ?? "?")}</option>`,
      ),
      ...this.track.patches.map(
        (p, i) =>
          `<option value="${p.id}">Surface ${i + 1} · ${esc(p.surface)}</option>`,
      ),
      ...this.track.gates.map(
        (g) =>
          `<option value="${g.id}">${g.order ? "Gate " + g.order : "Finish"}</option>`,
      ),
    ].join("");
    if (!this.selection?.has(this.selected))
      this.selection = new Set([this.selected].filter(Boolean));
    for (const option of q("object-list").options)
      option.selected = this.selection.has(option.value);
    q("track-validity").textContent =
      `${Math.round(this.compiled.length)} m · ${this.track.pieces.length} pieces · ${this.compiled.valid ? "Race-ready" : this.compiled.problems.length + " problems"}`;
    q("test-status").textContent = this.tested
      ? "Test lap completed"
      : "No test lap yet";
    q("work-test").disabled = !this.compiled.valid;
    q("validation").innerHTML =
      "<h3>" +
      (this.compiled.valid ? "Ready to drive" : "Problems") +
      "</h3>" +
      (this.compiled.valid
        ? '<p class="muted">One closed route. Six grid positions. Gates checked.</p>'
        : this.compiled.problems
            .slice(0, 12)
            .map(
              (p) =>
                `<button class="problem" data-select="${p.id || ""}">${esc(p.message)}</button>`,
            )
            .join(""));
    q("validation")
      .querySelectorAll("button")
      .forEach(
        (b) =>
          (b.onclick = () => {
            this.selected = b.dataset.select;
            this.refresh();
          }),
      );
    this.inspect();
    this.draw();
  }
  inspect() {
    const patch = this.track.patches.find((p) => p.id === this.selected);
    if (patch) {
      this.inspectPatch(patch, this.q("object-fields"));
      return;
    }
    const p = this.track.pieces.find((p) => p.id === this.selected),
      o = this.track.props.find((p) => p.id === this.selected),
      g = this.track.gates.find((p) => p.id === this.selected),
      spawn = this.track.spawns.find((p) => p.id === this.selected),
      target = p || o || g || spawn,
      root = this.q("object-fields");
    if (!target) {
      root.innerHTML =
        '<p class="muted">Choose an object, or append your first road piece.</p>';
      return;
    }
    const numeric = (key, label, value) =>
      `<label>${label}<input type="number" step="0.1" data-field="${key}" value="${value}"></label>`;
    root.innerHTML = `<h3>${p ? "Road inspector" : o ? "Object inspector" : spawn ? "Spawn inspector" : "Gate inspector"}</h3><div class="field-grid">${p || o || spawn ? numeric("x", "X (m)", target.x) + numeric("z", "Z (m)", target.z) + numeric("heading", "Heading (°)", Math.round(((target.heading * 180) / Math.PI) * 10) / 10) : ""}${p ? (p.kind === "quarter" || p.kind === "hairpin" ? numeric("radius", "Radius (m)", p.radius) + numeric("turn", "Turn (−1 / 1)", p.turn) : numeric("length", "Length (m)", p.length)) + numeric("width", "Entry width", p.width) + numeric("exitWidth", "Exit width", p.exitWidth) : o ? numeric("length", "Length (m)", o.length) + numeric("width", "Width (m)", o.width) : spawn ? (spawn.role === "grid" ? numeric("slot", "Grid slot", spawn.slot) : "") : numeric("distance", "Along piece (m)", g.distance) + numeric("order", "Order", g.order)}</div>${g ? `<label>Road piece<select data-field="pieceId">${this.track.pieces.map((p, i) => `<option value="${p.id}" ${p.id === g.pieceId ? "selected" : ""}>Road ${i + 1}</option>`).join("")}</select></label>` : ""}<button id="apply-object">Apply fields</button>${p ? '<button id="reflow-road">Snap following pieces</button><label>Surface<select id="road-surface"><option value="asphalt">Asphalt</option><option value="gravel">Gravel</option><option value="mud">Mud</option></select></label><button id="apply-surface">Paint entire piece</button>' : ""}<button id="delete-object" class="quiet">Delete selected</button>`;
    if (p)
      root.querySelector("#road-surface").value =
        this.track.patches.find((s) => s.pieceId === p.id)?.surface ||
        "asphalt";
    root.querySelector("#apply-object").onclick = () =>
      this.command((t) => {
        const item = [...t.pieces, ...t.props, ...t.gates, ...t.spawns].find(
          (v) => v.id === target.id,
        );
        for (const input of root.querySelectorAll("[data-field]")) {
          let value =
            input.dataset.field === "pieceId"
              ? input.value
              : Number(input.value);
          if (
            typeof value === "number" &&
            (!input.value.trim() || !Number.isFinite(value))
          )
            throw Error("Enter a finite number.");
          if (input.dataset.field === "heading") value *= Math.PI / 180;
          item[input.dataset.field] = value;
        }
      });
    if (p) {
      root.querySelector("#reflow-road").onclick = () => this.command(reflow);
      root.querySelector("#apply-surface").onclick = () => {
        const surface = root.querySelector("#road-surface").value;
        this.command((t) => {
          t.patches = t.patches.filter((s) => s.pieceId !== p.id);
          if (surface !== "asphalt")
            t.patches.push({
              id: uid(),
              pieceId: p.id,
              surface,
              start: 0,
              end: pieceLength(p),
              lateralMin: -p.width / 2,
              lateralMax: p.width / 2,
            });
        });
      };
    }
    root.querySelector("#delete-object").onclick = () =>
      this.dialog(
        "Delete selected object?",
        p
          ? "Its surface patches and gates will also be removed. The draft can become incomplete; Undo restores the whole change."
          : "This can be undone.",
        [
          {
            label: "Delete",
            action: () =>
              this.command((t) => {
                const gateIds = t.gates
                  .filter((g) => g.id === target.id || g.pieceId === target.id)
                  .map((g) => g.id);
                t.pieces = t.pieces.filter((v) => v.id !== target.id);
                for (const road of t.pieces)
                  if (road.nextPiece === target.id) road.nextPiece = "";
                t.props = t.props.filter((v) => v.id !== target.id);
                t.patches = t.patches.filter((v) => v.pieceId !== target.id);
                t.gates = t.gates.filter((v) => !gateIds.includes(v.id));
                t.spawns = t.spawns.filter(
                  (v) => v.id !== target.id && !gateIds.includes(v.gateId),
                );
                this.selected = t.pieces[0]?.id;
              }),
          },
          { label: "Keep it" },
        ],
      );
  }
  fit() {
    this.pan = { x: 0, y: 0 };
    this.zoom = 1;
    this.draw();
  }
  toWorld(x, y) {
    return {
      x: (x - this.cw / 2 - this.pan.x) / this.scale + this.center.x,
      z: (y - this.ch / 2 - this.pan.y) / this.scale + this.center.z,
    };
  }
  draw() {
    if (!this.track || !this.canvas.clientWidth) return;
    const w = this.canvas.clientWidth,
      h = this.canvas.clientHeight,
      d = Math.min(devicePixelRatio, 2);
    this.canvas.width = w * d;
    this.canvas.height = h * d;
    this.cw = w;
    this.ch = h;
    const ctx = this.ctx;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.fillStyle = "#303a32";
    ctx.fillRect(0, 0, w, h);
    const samples = this.compiled.samples,
      minX = Math.min(0, ...samples.map((p) => p.x)),
      maxX = Math.max(100, ...samples.map((p) => p.x)),
      minZ = Math.min(0, ...samples.map((p) => p.z)),
      maxZ = Math.max(100, ...samples.map((p) => p.z));
    this.center = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
    this.scale =
      Math.min((w - 70) / (maxX - minX + 25), (h - 70) / (maxZ - minZ + 25)) *
      this.zoom;
    const pos = (p) => ({
      x: (p.x - this.center.x) * this.scale + w / 2 + this.pan.x,
      y: (p.z - this.center.z) * this.scale + h / 2 + this.pan.y,
    });
    ctx.save();
    const a = pos({ x: 0, z: 0 }),
      step = 20 * this.scale;
    ctx.strokeStyle = "#455044";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = a.x % step; x < w; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = a.y % step; y < h; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
    ctx.lineCap = "butt";
    for (const p of this.track.pieces) {
      const len = pieceLength(p);
      if (!Number.isFinite(len) || len <= 0 || len > 200) continue;
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const q = pos(pointAtPiece(p, (len * i) / 40));
        i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
      }
      ctx.strokeStyle = this.selection?.has(p.id) ? "#f1d36b" : "#a4ab94";
      ctx.lineWidth = (p.width + 1) * this.scale;
      ctx.stroke();
      ctx.strokeStyle = "#4b5149";
      ctx.lineWidth = Math.max(1, (p.width - 1) * this.scale);
      ctx.stroke();
      for (const patch of this.track.patches.filter(
        (v) => v.pieceId === p.id,
      )) {
        const points = [];
        for (const lateral of [patch.lateralMin, patch.lateralMax]) {
          const edge = [];
          for (let i = 0; i <= 20; i++) {
            const q = pointAtPiece(
              p,
              patch.start + ((patch.end - patch.start) * i) / 20,
            );
            edge.push(
              pos({
                x: q.x - Math.sin(q.heading) * lateral,
                z: q.z + Math.cos(q.heading) * lateral,
              }),
            );
          }
          points.push(
            ...(lateral === patch.lateralMax ? edge.reverse() : edge),
          );
        }
        ctx.beginPath();
        points.forEach((q, i) =>
          i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y),
        );
        ctx.closePath();
        ctx.fillStyle = patch.surface === "mud" ? "#79614a" : "#a49678";
        ctx.fill();
      }
      const start = pos(p);
      ctx.fillStyle = "#e9e0c7";
      ctx.beginPath();
      ctx.arc(start.x, start.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const prop of this.compiled.props || this.track.props) {
      const p = pos(prop);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(prop.heading);
      ctx.fillStyle =
        prop.kind === "pad"
          ? "#d7bb4e"
          : prop.kind === "barrier"
            ? "#151d18"
            : "#926952";
      ctx.fillRect(
        (-prop.length * this.scale) / 2,
        (-prop.width * this.scale) / 2,
        prop.length * this.scale,
        prop.width * this.scale,
      );
      if (prop.id === this.selected) {
        ctx.strokeStyle = "#f2e8c9";
        ctx.lineWidth = 2;
        ctx.strokeRect(
          (-prop.length * this.scale) / 2 - 3,
          (-prop.width * this.scale) / 2 - 3,
          prop.length * this.scale + 6,
          prop.width * this.scale + 6,
        );
      }
      ctx.restore();
    }
    for (const g of this.compiled.gates) {
      const p = pos(g);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(g.heading);
      ctx.strokeStyle = g.order ? "#e3ca6b" : "#f0ead8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, (-g.width * this.scale) / 2);
      ctx.lineTo(0, (g.width * this.scale) / 2);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "#f4edda";
      ctx.font = "10px system-ui";
      ctx.fillText(g.order ? String(g.order) : "FINISH", p.x + 5, p.y - 5);
    }
    for (const s of this.track.spawns.filter((s) => s.role === "grid")) {
      const p = pos(s);
      ctx.fillStyle = "#b6c0a7";
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.restore();
    this.q("zoom-label").textContent = Math.round(this.zoom * 100) + "%";
  }
  save() {
    clearTimeout(this.saveTimer);
    this.q("draft-status").textContent = "Saving draft…";
    this.saveTimer = setTimeout(() => this.persist().catch(() => {}), 350);
  }
  persist() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const generation = this.generation,
      track = clone(this.track),
      view = {
        zoom: this.zoom,
        pan: { ...this.pan },
        selected: this.selected,
        selection: [...(this.selection || [])],
      },
      tested = this.tested;
    this.saveChain = this.saveChain
      .catch(() => {})
      .then(async () => {
        try {
          if (!this.store)
            throw Error("Storage unavailable. Export your draft to keep it.");
          const saved = await this.store.saveDraft(
            track,
            this.baseline,
            view,
            tested,
          );
          if (generation === this.generation) {
            this.saveError = null;
            this.baseline = saved.revision;
            this.q("draft-status").textContent =
              "Draft saved · " +
              new Date(saved.updatedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });
          }
        } catch (e) {
          if (generation === this.generation) {
            this.saveError = e;
            this.q("draft-status").textContent = e.message;
            this.notify(e.message, true);
          }
          throw e;
        }
      });
    return this.saveChain;
  }
  async flush() {
    if (this.saveTimer && this.track) await this.persist();
    else await this.saveChain;
  }
  async saveCopy() {
    if (!this.store)
      throw Error("Storage unavailable. Export HTML to keep your work.");
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    await this.saveChain.catch(() => {});
    const copy = duplicateTrack(this.track);
    const saved = await this.store.saveDraft(
      copy,
      0,
      { zoom: this.zoom, pan: { ...this.pan } },
      "",
    );
    // Explicit Save a copy resolves the failed baseline only after the copy commits.
    this.saveChain = Promise.resolve();
    this.saveError = null;
    await this.open(copy, saved);
    this.notify("Your work was saved as a separate draft.");
  }
  async test() {
    if (!this.compiled.valid) return;
    await this.flush();
    this.onTest(clone(this.track), this.q("test-ai").checked);
  }
  async markTest(revision) {
    if ((await hash(gameplay(this.track))) === revision) {
      this.tested = revision;
      this.refresh();
      this.save();
    }
  }
  export() {
    this.download(
      this.track.slug + (this.compiled.valid ? "" : ".draft") + ".html",
      this.sourceDocument
        ? this.sourceDocument.html()
        : serializeTrack(this.track),
      "text/html",
    );
  }
  async files() {
    // Recovery actions must stay reachable even when the normal save failed.
    await this.flush().catch(() => {});
    const records = [],
      readErrors = [];
    if (this.store) {
      try {
        const keys = await this.store.keys("draft:"),
          reads = await Promise.allSettled(keys.map((k) => this.store.get(k)));
        for (const read of reads) {
          if (read.status === "fulfilled" && read.value)
            records.push(read.value);
          else if (read.status === "rejected") readErrors.push(read.reason);
        }
      } catch (error) {
        readErrors.push(error);
      }
    }
    const drafts = records.filter((d) => !d.deletedAt),
      trash = records.filter((d) => d.deletedAt && d.expiresAt > Date.now());
    const body = document.createElement("div");
    body.innerHTML = `<p>Track definitions contain editable geometry. They contain no game code or account data.</p><div class="file-actions"><button data-file="starter">New starter loop</button><button data-file="blank">New blank track</button><button data-file="technical">New technical loop</button><button data-file="duplicate">Duplicate current</button><button data-file="export">Export HTML</button><button data-file="import">Import HTML</button><button data-file="recover">Recover previous save</button></div><h3>Saved drafts</h3><div class="file-actions">${drafts.map((d, i) => `<button data-draft="${i}">${esc(d.track.name)}<small>Revision ${d.revision}</small></button>`).join("") || "<p>No saved drafts yet.</p>"}</div><h3>Official circuit copies</h3><div class="file-actions">${this.templates.map((t, i) => `<button data-template="${i}">${esc(t.name)}</button>`).join("")}</div><p class="muted">Use Publish with owner key in the Tools panel for the configured Pagelove host. HTML export remains available offline.</p>`;
    const close = () => document.querySelector("#modal").close();
    if (readErrors.length) {
      const message = document.createElement("p");
      message.setAttribute("role", "alert");
      message.textContent =
        "Some saved drafts could not be read. Your current working track is kept; Export HTML remains available. " +
        (readErrors[0]?.message || "Device storage could not be read.");
      body.prepend(message);
    }
    if (this.saveError) {
      const message = document.createElement("p");
      message.setAttribute("role", "alert");
      message.textContent =
        "Your latest changes are not saved. Export HTML, retry, or save a separate copy before opening another track.";
      body.prepend(message);
    }
    for (const [label, action] of [
      ["Retry save", () => this.persist()],
      ["Save a separate copy", () => this.saveCopy()],
    ]) {
      const button = document.createElement("button");
      button.textContent = label;
      button.onclick = async () => {
        try {
          await action();
          close();
        } catch (e) {
          this.notify(e.message, true);
        }
      };
      body.querySelector(".file-actions").prepend(button);
    }
    const trashButton = document.createElement("button");
    trashButton.textContent = "Move current draft to Trash";
    trashButton.disabled = !this.store || !this.baseline;
    trashButton.onclick = () => {
      close();
      this.dialog(
        "Move draft to Trash?",
        "You can restore it from Track files for seven days. The exported HTML remains available independently.",
        [
          {
            label: "Move to Trash",
            action: async () => {
              await this.flush();
              await this.store.trashDraft(this.track.id, this.baseline);
              this.track = null;
              await this.open(duplicateTrack(this.templates[0]));
            },
          },
          { label: "Keep draft" },
        ],
      );
    };
    body.querySelector(".file-actions").append(trashButton);
    if (trash.length) {
      const heading = document.createElement("h3");
      heading.textContent = "Trash · recoverable for seven days";
      body.append(heading);
      for (const d of trash) {
        const b = document.createElement("button");
        b.textContent = "Restore " + d.track.name;
        b.onclick = async () => {
          close();
          const restored = await this.store.restoreDraft(d.track.id);
          await this.open(restored.track, restored);
        };
        body.append(b);
      }
    }
    body.querySelectorAll("[data-file]").forEach(
      (b) =>
        (b.onclick = async () => {
          close();
          switch (b.dataset.file) {
            case "starter":
              await this.open(duplicateTrack(this.templates[0]));
              break;
            case "blank": {
              const t = duplicateTrack(this.templates[0]);
              t.name = "Untitled circuit";
              for (const k of [
                "pieces",
                "props",
                "patches",
                "gates",
                "spawns",
                "recipes",
              ])
                t[k] = [];
              await this.open(t);
              break;
            }
            case "technical": {
              const source =
                this.templates.find((t) => t.slug.includes("switchback")) ||
                this.templates[3];
              const copy = duplicateTrack(source);
              copy.name = "Technical loop";
              copy.description =
                "A tighter practice template with mixed surfaces.";
              await this.open(copy);
              break;
            }
            case "duplicate":
              await this.open(duplicateTrack(this.track));
              break;
            case "export":
              this.export();
              break;
            case "import":
              this.q("import-track").click();
              break;
            case "recover": {
              const d = await this.store?.get("draft:" + this.track.id);
              if (d?.previous?.[0])
                this.command((t) => {
                  Object.assign(t, clone(d.previous[0].track));
                });
              else this.notify("No previous committed snapshot yet.");
              break;
            }
          }
        }),
    );
    body.querySelectorAll("[data-draft]").forEach(
      (b) =>
        (b.onclick = () => {
          close();
          const d = drafts[+b.dataset.draft];
          this.open(d.track, d);
        }),
    );
    body.querySelectorAll("[data-template]").forEach(
      (b) =>
        (b.onclick = () => {
          close();
          this.open(duplicateTrack(this.templates[+b.dataset.template]));
        }),
    );
    await this.dialog("Track files", body, [{ label: "Close" }]);
  }
}
