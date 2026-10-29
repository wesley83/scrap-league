import { readFile, readdir } from "node:fs/promises";
import { DOMParser } from "linkedom";
import { parseTrack, parseEntities, hash, gameplay } from "../app/model.js";
import { compile } from "../app/track.js";
import { RULES, SLOTS, assemble } from "../app/builds.js";
export async function loadContent({ includeTargets = true } = {}) {
  const root = new URL("../content/", import.meta.url),
    read = (p) => readFile(new URL(p, root), "utf8");
  const catalog = parseEntities(
    await read("catalog.html"),
    "CatalogEntry",
    DOMParser,
  );
  const tracks = [];
  for (const c of catalog) {
    const track = parseTrack(await read(c.path), DOMParser),
      compiled = compile(track);
    if (!compiled.valid)
      throw Error(
        track.name + ": " + compiled.problems.map((p) => p.message).join("; "),
      );
    if (c.id !== track.id) throw Error("Catalog identity mismatch");
    tracks.push({ track, revision: await hash(gameplay(track)) });
  }
  const parts = [];
  for (const f of (await readdir(new URL("parts/", root))).sort())
    parts.push(...parseEntities(await read("parts/" + f), "Part", DOMParser));
  const cups = [];
  for (const f of (await readdir(new URL("cups/", root))).sort())
    cups.push(...parseEntities(await read("cups/" + f), "Cup", DOMParser));
  cups.sort(
    (a, b) =>
      catalog.find((c) => a.tracks.includes(c.id)).cup -
      catalog.find((c) => b.tracks.includes(c.id)).cup,
  );
  const rivals = parseEntities(await read("rivals.html"), "Rival", DOMParser),
    daily = parseEntities(
      await read("daily/daily-v1.html"),
      "Challenge",
      DOMParser,
    );
  if (
    catalog.length !== 12 ||
    parts.length !== 12 ||
    cups.length !== 4 ||
    rivals.length !== 8
  )
    throw Error("Incomplete content catalog.");
  for (const cup of cups)
    if (
      cup.tracks.split(" ").length !== 3 ||
      cup.tracks.split(" ").some((id) => !tracks.some((t) => t.track.id === id))
    )
      throw Error("Invalid cup references");
  for (const b of [...rivals, ...daily])
    for (const slot of ["chassis", "engine", "tires", "utility"])
      if (!parts.some((p) => p.id === b[slot] && p.slot === slot))
        throw Error("Invalid build reference");
  for (const d of daily)
    if (!tracks.some((t) => t.track.id === d.track))
      throw Error("Invalid daily track");
  const targets = includeTargets
    ? JSON.parse(
        await readFile(
          new URL("../references/target-runs.json", import.meta.url),
          "utf8",
        ),
      )
    : [];
  for (const target of targets) {
    const track = tracks.find((t) => t.track.slug === target.slug);
    if (
      target.rulesRevision !== RULES ||
      track?.revision !== target.trackRevision
    )
      throw Error("Re-record incompatible target runs: " + target.slug);
    const spec = assemble(target.build, parts);
    const revision = await hash(
      SLOTS.map((s) => {
        const { name, description, unlock, ...physical } = spec[s];
        return physical;
      }),
    );
    if (
      revision !== target.buildRevision ||
      target.laps !== 3 ||
      target.assist !== "steering-off:manual"
    )
      throw Error("Unsupported target setup.");
    for (const tier of ["bronze", "silver", "gold"]) {
      const { result, ghost } = target.runs[tier];
      if (
        result.trackRevision !== target.trackRevision ||
        result.buildRevision !== revision ||
        result.rulesRevision !== RULES ||
        result.laps !== 3 ||
        result.dnf ||
        result.resets ||
        result.incidents ||
        !Number.isSafeInteger(result.elapsedMs) ||
        result.elapsedMs < 1000 ||
        result.elapsedMs > 480000 ||
        !Array.isArray(ghost) ||
        ghost.length < 2 ||
        ghost.length > 10000
      )
        throw Error("Invalid target recording: " + target.slug);
      for (let i = 0; i < ghost.length; i++) {
        const frame = ghost[i];
        if (
          !Array.isArray(frame) ||
          frame.length !== 4 ||
          frame.some((n) => !Number.isFinite(n)) ||
          frame[0] < 0 ||
          frame[0] > result.elapsedMs ||
          (i && frame[0] <= ghost[i - 1][0]) ||
          Math.abs(frame[1]) > 1000 ||
          Math.abs(frame[2]) > 1000
        )
          throw Error("Invalid target replay frame.");
      }
    }
    if (!(
      target.runs.gold.result.elapsedMs < target.runs.silver.result.elapsedMs &&
      target.runs.silver.result.elapsedMs < target.runs.bronze.result.elapsedMs
    ))
      throw Error("Unordered target ladder.");
  }
  return { catalog, tracks, parts, cups, rivals, daily, targets };
}
