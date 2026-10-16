import { parseTrack, gameplay, hash, stable, esc, UUID } from "./model.js";
import { compile } from "./track.js";
import { publishTrack, HOST_CONFIG } from "./pagelove.js";
const entryFields = ["id", "slug", "name", "revision"];
export function catalogDocument(entries) {
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Scrap League Workshop</title></head><body><h1>Community circuits</h1><ul id="tracks">' +
    entries
      .map(
        (e) =>
          '<li itemscope itemtype="urn:ScrapLeague:PublishedTrack">' +
          entryFields
            .map((k) => `<span itemprop="${k}">${esc(e[k])}</span>`)
            .join("") +
          "</li>",
      )
      .join("") +
    "</ul></body></html>"
  );
}
export function parseCatalog(html, Parser = DOMParser, owner = false) {
  if (new TextEncoder().encode(html).length > 1048576)
    throw Error("Catalog is too large.");
  const doc = new Parser().parseFromString(html, "text/html"),
    list = doc.querySelector("#tracks");
  if (!list) throw Error("Catalog format is unsupported.");
  const entries = [...list.children].map((li) => {
    if (li.getAttribute("itemtype") !== "urn:ScrapLeague:PublishedTrack")
      throw Error("Unknown catalog record.");
    const e = {};
    for (const field of li.querySelectorAll("[itemprop]")) {
      const key = field.getAttribute("itemprop");
      if (!entryFields.includes(key) || key in e)
        throw Error("Invalid catalog field.");
      e[key] = field.textContent;
    }
    if (
      !UUID.test(e.id) ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(e.slug) ||
      e.slug.length > 48 ||
      !e.name ||
      [...e.name].length > 60 ||
      !/^[a-f0-9]{64}$/.test(e.revision)
    )
      throw Error("Invalid catalog entry.");
    return e;
  });
  if (
    entries.length > 1000 ||
    new Set(entries.map((e) => e.id)).size !== entries.length ||
    new Set(entries.map((e) => e.slug)).size !== entries.length
  )
    throw Error("Catalog entries exceed limits or conflict.");
  if (owner) {
    // Whole-document replacement must never erase policies or unrelated owner content.
    const canonical = new Parser().parseFromString(
      catalogDocument(entries),
      "text/html",
    );
    const shape = (node) => ({
      tag: node.tagName,
      attrs: [...node.attributes].map((a) => [a.name, a.value]).sort(),
      children: [...node.childNodes]
        .filter((n) => n.nodeType !== 3 || n.textContent.trim())
        .map((n) =>
          n.nodeType === 1
            ? shape(n)
            : { type: n.nodeType, text: n.textContent },
        ),
    });
    if (
      stable(shape(doc.documentElement)) !==
      stable(shape(canonical.documentElement))
    )
      throw Error(
        "Catalog contains unsupported owner content; preserved without writing.",
      );
  }
  return entries;
}
function authorFetch(key, fetcher = fetch) {
  return (pathname, options = {}) => {
    if (
      !pathname.startsWith("/workshop-tracks/") ||
      pathname.includes("..") ||
      pathname.includes("?") ||
      pathname.includes("#")
    )
      throw Error("Unsupported authoring path.");
    return fetcher(HOST_CONFIG.authoringOrigin + pathname, {
      ...options,
      cache: "no-store",
      redirect: "error",
      headers: { Authorization: "Bearer " + key, ...options.headers },
      signal: AbortSignal.timeout(15000),
    });
  };
}
export async function loadOwnerTrack(
  id,
  key,
  { fetcher = fetch, Parser = DOMParser } = {},
) {
  if (!UUID.test(id)) throw Error("Enter a valid published track ID.");
  const response = await authorFetch(
    key,
    fetcher,
  )(`/workshop-tracks/${id}/definition.html`);
  if (!response.ok) throw Error("Owner read failed: " + response.status);
  const track = parseTrack(await response.text(), Parser),
    etag = response.headers.get("ETag");
  if (track.id !== id || !etag)
    throw Error("Publication identity or revision is missing.");
  return {
    track,
    baseline: structuredClone(track),
    etag,
    revision: await hash(gameplay(track)),
  };
}
export async function listTrack(
  track,
  revision,
  key,
  { fetcher = fetch, Parser = DOMParser } = {},
) {
  const request = authorFetch(key, fetcher),
    pathname = "/workshop-tracks/catalog.html";
  const before = await request(pathname);
  if (!before.ok && before.status !== 404)
    throw Error("Catalog read failed: " + before.status);
  const entries = before.ok
      ? parseCatalog(await before.text(), Parser, true)
      : [],
    existing = entries.find((e) => e.id === track.id);
  const next = { id: track.id, slug: track.slug, name: track.name, revision };
  if (entries.some((e) => e.id !== track.id && e.slug === track.slug))
    throw Error(
      "That public slug belongs to another track. Change this draft slug and retry listing.",
    );
  if (existing) Object.assign(existing, next);
  else entries.push(next);
  const etag = before.headers.get("ETag");
  if (before.ok && !etag) throw Error("Catalog revision is unavailable.");
  let response;
  try {
    response = await request(pathname, {
      method: "PUT",
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        ...(before.ok ? { "If-Match": etag } : { "If-None-Match": "*" }),
      },
      body: catalogDocument(entries),
    });
  } catch {}
  if (response?.status === 412)
    throw Error(
      "Catalog changed in another editor. The track is published; retry listing.",
    );
  if (response && !response.ok)
    throw Error("Catalog write failed: " + response.status);
  const after = await request(pathname);
  if (!after.ok) throw Error("Listing is unconfirmed; retry after connecting.");
  const confirmed = parseCatalog(await after.text(), Parser).find(
    (e) => e.id === track.id,
  );
  if (stable(confirmed) !== stable(next))
    throw Error("Listing readback differs; keep the exact track link.");
  return next;
}
export async function publishOwnerTrack(
  track,
  key,
  baseline = null,
  { fetcher = fetch, Parser = DOMParser } = {},
) {
  if (!compile(track).valid)
    throw Error("Fix the track validation problems before publishing.");
  if (!key?.startsWith("pk_"))
    throw Error("Enter the owner key for the pinned authoring host.");
  const request = authorFetch(key, fetcher);
  for (const dir of ["/workshop-tracks/", `/workshop-tracks/${track.id}/`]) {
    const response = await request(dir, { method: "MKCOL" });
    if (![201, 405].includes(response.status))
      throw Error("Collection creation failed: " + response.status);
  }
  const published = await publishTrack({
    url:
      HOST_CONFIG.authoringOrigin +
      `/workshop-tracks/${track.id}/definition.html`,
    pinnedOrigin: HOST_CONFIG.authoringOrigin,
    key,
    track,
    baseline: baseline?.baseline,
    etag: baseline?.etag,
    fetcher: (url, options) =>
      fetcher(url, {
        ...options,
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      }),
    Parser,
  });
  const url = HOST_CONFIG.publicOrigin + "/#workshop=" + track.id;
  try {
    await listTrack(track, published.revision, key, { fetcher, Parser });
    return { ...published, url, listed: true };
  } catch (error) {
    return { ...published, url, listed: false, listingError: error.message };
  }
}
export async function discoverTracks({
  fetcher = fetch,
  Parser = DOMParser,
} = {}) {
  const response = await fetcher(
    HOST_CONFIG.publicOrigin + "/workshop-tracks/catalog.html",
    {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    },
  );
  if (response.status === 404) return [];
  if (!response.ok)
    throw Error("Published circuits are temporarily unavailable.");
  return parseCatalog(await response.text(), Parser);
}
export async function readPublishedTrack(
  id,
  { fetcher = fetch, Parser = DOMParser } = {},
) {
  if (!UUID.test(id)) throw Error("Invalid track identity.");
  const response = await fetcher(
    HOST_CONFIG.publicOrigin + `/workshop-tracks/${id}/definition.html`,
    {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    },
  );
  if (!response.ok) throw Error("Published track could not load.");
  // The public host adds its own branding. Extract the inert authoritative article.
  const doc = new Parser().parseFromString(await response.text(), "text/html"),
    article = doc.querySelector('[itemtype="urn:ScrapLeague:Track"]');
  if (!article) throw Error("Published definition is missing.");
  const track = parseTrack(
    "<!doctype html><html><head><title>Track</title></head><body>" +
      article.outerHTML +
      "</body></html>",
    Parser,
  );
  if (track.id !== id || !compile(track).valid)
    throw Error("Published track identity or geometry is invalid.");
  return track;
}
