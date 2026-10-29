import { challengeErrors } from "./challenge-schema.js";
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const uid = () => crypto.randomUUID();
export const clone = (x) => structuredClone(x);
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function stable(value) {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + stable(value[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export async function hash(value) {
  const bytes = new TextEncoder().encode(
    typeof value === "string" ? value : stable(value),
  );
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export function gameplay(t) {
  const {
    name,
    description,
    slug,
    scenePreset,
    musicPreset,
    challenge,
    ...rest
  } = t;
  return rest;
}
export const schemas = {
  Track: {
    id: "uuid",
    slug: "str",
    schemaVersion: "num",
    name: "str",
    description: "str",
    pieceCatalogRevision: "str",
    laps: "num",
    scenePreset: "str",
    musicPreset: "str",
  },
  RoadPiece: {
    id: "uuid",
    kind: "str",
    x: "num",
    z: "num",
    heading: "num",
    width: "num",
    exitWidth: "num",
    length: "num",
    radius: "num",
    turn: "num",
    nextPiece: "str",
  },
  SurfacePatch: {
    id: "uuid",
    pieceId: "uuid",
    surface: "str",
    start: "num",
    end: "num",
    lateralMin: "num",
    lateralMax: "num",
  },
  Checkpoint: {
    id: "uuid",
    kind: "str",
    pieceId: "uuid",
    distance: "num",
    order: "num",
  },
  Spawn: {
    id: "uuid",
    role: "str",
    x: "num",
    z: "num",
    heading: "num",
    slot: "num",
    gateId: "str",
  },
  Prop: {
    id: "uuid",
    kind: "str",
    x: "num",
    z: "num",
    heading: "num",
    length: "num",
    width: "num",
    duration: "num",
    damping: "num",
  },
  Recipe: { id: "uuid", kind: "str", duration: "num", damping: "num" },
  Part: {
    id: "str",
    slot: "str",
    name: "str",
    description: "str",
    mass: "num",
    wheelbase: "num",
    length: "num",
    width: "num",
    steer: "num",
    yaw: "num",
    force: "num",
    power: "num",
    governor: "num",
    asphalt: "num",
    gravel: "num",
    mud: "num",
    capacity: "num",
    charge: "num",
    recovery: "num",
    yawProtection: "num",
    unlock: "num",
  },
  Rival: {
    id: "str",
    name: "str",
    number: "str",
    chassis: "str",
    engine: "str",
    tires: "str",
    utility: "str",
    pace: "num",
    color: "str",
  },
  Cup: { id: "str", name: "str", tracks: "str" },
  CatalogEntry: {
    id: "str",
    name: "str",
    path: "str",
    cup: "num",
    order: "num",
    tip: "str",
  },
  Challenge: {
    id: "str",
    date: "str",
    track: "str",
    chassis: "str",
    engine: "str",
    tires: "str",
    utility: "str",
    scheduleRevision: "str",
  },
  TrackChallenge: {
    creator: "str",
    targetMs: "num",
    trackRevision: "str",
    buildRevision: "str",
    rulesRevision: "str",
    chassis: "str",
    engine: "str",
    tires: "str",
    utility: "str",
    assist: "num",
    autoAccelerate: "num",
    laps: "num",
  },
};
export const collections = {
  pieces: "RoadPiece",
  patches: "SurfacePatch",
  gates: "Checkpoint",
  spawns: "Spawn",
  props: "Prop",
  recipes: "Recipe",
};
function entityHTML(type, v) {
  const fields = Object.entries(v).filter(([k]) => schemas[type][k]);
  return `<li itemscope itemtype="urn:ScrapLeague:${type}">${fields.map(([k, x]) => `<span itemprop="${k}">${esc(x)}</span>`).join("")}</li>`;
}
export function serializeTrack(t) {
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>${esc(t.name)}</title></head><body>\n<article itemscope itemtype="urn:ScrapLeague:Track">\n${Object.keys(
    schemas.Track,
  )
    .map(
      (k) =>
        `<${k === "name" ? "h1" : "p"} itemprop="${k}">${esc(t[k])}</${k === "name" ? "h1" : "p"}>`,
    )
    .join(
      "\n",
    )}\n${t.challenge ? entityHTML("TrackChallenge", t.challenge) : ""}\n${Object.entries(
    collections,
  )
    .map(
      ([key, type]) =>
        `<section><h2>${key}</h2><ol data-collection="${key}">${t[key].map((v) => entityHTML(type, v)).join("\n")}</ol></section>`,
    )
    .join("\n")}\n</article></body></html>\n`;
}
export function serializeEntities(type, items, title = type) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title></head><body><h1>${esc(title)}</h1><ol>${items.map((v) => entityHTML(type, v)).join("\n")}</ol></body></html>`;
}
function inert(html, Parser) {
  if (new TextEncoder().encode(html).length > 1048576)
    throw Error("Document exceeds the 1 MiB limit.");
  const doc = new Parser().parseFromString(html, "text/html");
  for (const e of doc.querySelectorAll("*")) {
    if (
      [
        "SCRIPT",
        "IFRAME",
        "OBJECT",
        "EMBED",
        "STYLE",
        "LINK",
        "SVG",
        "MATH",
        "BASE",
        "FORM",
        "INPUT",
        "BUTTON",
        "VIDEO",
        "AUDIO",
        "IMG",
        "TEMPLATE",
      ].includes(e.tagName)
    )
      throw Error(
        `Unsupported executable or resource element: ${e.tagName.toLowerCase()}.`,
      );
    for (const a of e.attributes) {
      if (
        ![
          "lang",
          "charset",
          "itemprop",
          "itemscope",
          "itemtype",
          "data-collection",
        ].includes(a.name)
      )
        throw Error(`Unsupported attribute: ${a.name}.`);
    }
  }
  return doc;
}
function readEntity(e, type) {
  const schema = schemas[type],
    o = {};
  for (const p of e.querySelectorAll("[itemprop]")) {
    if (p.closest("[itemscope]") !== e) continue;
    const k = p.getAttribute("itemprop");
    if (!schema[k]) throw Error(`Unsupported ${type} field: ${k}.`);
    if (k in o) throw Error(`Duplicate ${type} field: ${k}.`);
    let v = p.textContent;
    if (schema[k] === "num") {
      if (!v.trim() || !Number.isFinite(Number(v)))
        throw Error(`${k} must be finite.`);
      v = Number(v);
    }
    if (schema[k] === "uuid" && !UUID.test(v))
      throw Error(`${k} must be a UUID.`);
    o[k] = v;
  }
  for (const k in schema) if (!(k in o)) throw Error(`Missing ${type}.${k}.`);
  return o;
}
export function parseTrack(html, Parser = DOMParser) {
  const d = inert(html, Parser),
    roots = d.querySelectorAll('[itemtype="urn:ScrapLeague:Track"]');
  if (roots.length !== 1) throw Error("Expected exactly one track.");
  const root = roots[0],
    t = readEntity(root, "Track");
  for (const e of d.querySelectorAll("[itemscope]")) {
    const type = e.getAttribute("itemtype")?.replace("urn:ScrapLeague:", "");
    if (
      !schemas[type] ||
      (!Object.values(collections).includes(type) &&
        !["Track", "TrackChallenge"].includes(type))
    )
      throw Error("Unsupported entity type.");
    if (e !== root && !root.contains(e)) throw Error("Entity outside track.");
  }
  const challenges = root.querySelectorAll(
    '[itemtype="urn:ScrapLeague:TrackChallenge"]',
  );
  if (challenges.length > 1) throw Error("Expected at most one challenge.");
  if (challenges.length)
    t.challenge = readEntity(challenges[0], "TrackChallenge");
  for (const [key, type] of Object.entries(collections)) {
    const lists = root.querySelectorAll(`[data-collection="${key}"]`);
    if (lists.length !== 1) throw Error(`Expected one ${key} list.`);
    t[key] = [...lists[0].children].map((e) => {
      if (e.getAttribute("itemtype") !== `urn:ScrapLeague:${type}`)
        throw Error(`Wrong type in ${key}.`);
      return readEntity(e, type);
    });
  }
  for (const c of root.querySelectorAll("[data-collection]"))
    if (!collections[c.getAttribute("data-collection")])
      throw Error("Unsupported collection.");
  const errors = structuralErrors(t);
  if (errors.length) throw Error(errors.join(" "));
  return t;
}
export function parseEntities(html, type, Parser = DOMParser) {
  const d = inert(html, Parser);
  for (const e of d.querySelectorAll("[itemscope]"))
    if (e.getAttribute("itemtype") !== `urn:ScrapLeague:${type}`)
      throw Error("Unexpected entity.");
  return [...d.querySelectorAll("[itemscope]")].map((e) => readEntity(e, type));
}
export function structuralErrors(t) {
  const e = [];
  if (t.challenge) e.push(...challengeErrors(t.challenge));
  if (t.schemaVersion !== 1) e.push("Unsupported track schema.");
  if (t.pieceCatalogRevision !== "pieces-v1")
    e.push("Unsupported piece catalog.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t.slug) || t.slug.length > 48)
    e.push("Use a lowercase slug up to 48 characters.");
  if (
    !t.name.trim() ||
    [...t.name].length > 60 ||
    [...t.description].length > 240
  )
    e.push("Track name or description is too long or empty.");
  if (!Number.isInteger(t.laps) || t.laps < 1 || t.laps > 9)
    e.push("Laps must be 1–9.");
  if (
    !["yard", "docks", "foundry", "night"].includes(t.scenePreset) ||
    !["yard", "docks", "foundry", "final"].includes(t.musicPreset)
  )
    e.push("Unknown scene or music preset.");
  const all = [t.id];
  for (const [key, type] of Object.entries(collections)) {
    if (!Array.isArray(t[key])) {
      e.push(`Missing ${key}.`);
      continue;
    }
    for (const v of t[key]) {
      all.push(v.id);
      for (const [k, value] of Object.entries(v)) {
        if (!schemas[type][k]) e.push(`Unknown ${type}.${k}.`);
        if (typeof value === "number" && !Number.isFinite(value))
          e.push("Nonfinite value.");
      }
      for (const k in schemas[type])
        if (!(k in v)) e.push(`Missing ${type}.${k}.`);
    }
  }
  if (new Set(all).size !== all.length || all.some((id) => !UUID.test(id)))
    e.push("IDs must be unique UUIDs.");
  for (const [key, max] of Object.entries({
    pieces: 128,
    patches: 64,
    props: 128,
    recipes: 16,
    gates: 33,
    spawns: 39,
  }))
    if (t[key]?.length > max) e.push(`${key} exceeds limit ${max}.`);
  return e;
}
export function duplicateTrack(t, newId = uid) {
  const copy = clone(t),
    ids = new Map();
  delete copy.challenge;
  [copy, ...Object.keys(collections).flatMap((k) => copy[k])].forEach((o) => {
    const id = newId();
    ids.set(o.id, id);
    o.id = id;
  });
  for (const p of copy.pieces) p.nextPiece = ids.get(p.nextPiece) || "";
  for (const p of copy.props)
    if (p.kind.startsWith("recipe:"))
      p.kind = "recipe:" + (ids.get(p.kind.slice(7)) || p.kind.slice(7));
  for (const p of [...copy.patches, ...copy.gates])
    p.pieceId = ids.get(p.pieceId);
  for (const s of copy.spawns) if (s.gateId) s.gateId = ids.get(s.gateId);
  copy.name = [...t.name].slice(0, 52).join("") + " — copy";
  copy.slug = "track-" + copy.id.slice(0, 8);
  return copy;
}
