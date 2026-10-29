import { readFile, writeFile } from "node:fs/promises";
import { DOMParser } from "linkedom";
import { parseTrack, serializeTrack } from "../app/model.js";
import { compile, atDistance, nearest } from "../app/track.js";
const file = new URL(
    "../content/tracks/crusher-circuit/definition.html",
    import.meta.url,
  ),
  t = parseTrack(await readFile(file, "utf8"), DOMParser);
t.props = [];
const c = compile(t);
for (let s = 115; s < c.length && t.props.length < 2; s += 20) {
  const p = atDistance(c, s),
    road = t.pieces.find((r) => r.id === nearest(c, p.x, p.z).pieceId);
  if (
    road.kind !== "straight" ||
    c.gates.some((g) => Math.hypot(g.x - p.x, g.z - p.z) < 17) ||
    t.spawns.some((g) => Math.hypot(g.x - p.x, g.z - p.z) < 17) ||
    t.props.some((g) => Math.hypot(g.x - p.x, g.z - p.z) < 35)
  )
    continue;
  const side = t.props.length ? 2.7 : -2.7;
  t.props.push({
    id: "51000000-0000-4000-8000-00009000000" + (t.props.length + 1),
    kind: "island",
    x: p.x - Math.sin(p.heading) * side,
    z: p.z + Math.cos(p.heading) * side,
    heading: p.heading,
    length: 5,
    width: 2.4,
    duration: 1,
    damping: 0.2,
  });
}
const result = compile(t);
if (!result.valid) throw Error(result.problems.map((p) => p.message).join(";"));
await writeFile(file, serializeTrack(t));
console.log(
  "Authored",
  t.props.length,
  "solid scrap islands using shared track geometry.",
);
