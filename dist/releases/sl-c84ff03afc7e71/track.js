import { clamp, wrap, structuralErrors, uid } from "./model.js";
export const TAU = Math.PI * 2;
export function pieceLength(p) {
  return ["quarter", "hairpin"].includes(p.kind)
    ? p.radius * Math.PI * (p.kind === "hairpin" ? 1 : 0.5)
    : p.length;
}
export function pointAtPiece(p, s) {
  const length = pieceLength(p),
    u = clamp(s, 0, length),
    c = Math.cos(p.heading),
    n = Math.sin(p.heading);
  if (["quarter", "hairpin"].includes(p.kind)) {
    const a = u / p.radius;
    return {
      x:
        p.x +
        c * p.radius * Math.sin(a) -
        n * p.turn * p.radius * (1 - Math.cos(a)),
      z:
        p.z +
        n * p.radius * Math.sin(a) +
        c * p.turn * p.radius * (1 - Math.cos(a)),
      heading: p.heading + p.turn * a,
      width: p.width,
    };
  }
  return {
    x: p.x + c * u,
    z: p.z + n * u,
    heading: p.heading,
    width: p.width + ((p.exitWidth - p.width) * u) / length,
  };
}
export function compile(t) {
  const problems = structuralErrors(t).map((message) => ({
    message,
    severity: "error",
  }));
  const err = (message, id) =>
      problems.push({ message, id, severity: "error" }),
    map = new Map(t.pieces.map((p) => [p.id, p]));
  const route = [],
    visited = new Set();
  let cur = t.pieces.find((p) => p.kind === "start") || t.pieces[0];
  while (cur && !visited.has(cur.id)) {
    visited.add(cur.id);
    route.push(cur);
    cur = map.get(cur.nextPiece);
  }
  if (!cur || route.length !== t.pieces.length || cur !== route[0])
    err("Road must form one closed loop containing every piece.");
  if (t.pieces.filter((p) => p.kind === "start").length !== 1)
    err("Use exactly one start straight.");
  let length = 0;
  const samples = [],
    offsets = new Map(),
    walls = [];
  for (const p of route) {
    if (
      !["start", "straight", "quarter", "hairpin", "taper"].includes(p.kind)
    ) {
      err("Unknown road piece.", p.id);
      continue;
    }
    if (![8, 10, 12].includes(p.width) || ![8, 10, 12].includes(p.exitWidth))
      err("Road widths must be 8, 10 or 12 m.", p.id);
    if (p.kind === "start" && (p.length !== 60 || p.width < 10))
      err("Start must be 60 m long and at least 10 m wide.", p.id);
    if (p.kind === "straight" && ![20, 40, 60].includes(p.length))
      err("Straight length must be 20, 40 or 60 m.", p.id);
    if (p.kind === "taper" && p.length !== 40)
      err("Tapers are 40 m long.", p.id);
    if (
      ["quarter", "hairpin"].includes(p.kind) &&
      (![20, 40].includes(p.radius) || ![-1, 1].includes(p.turn))
    )
      err("Bend requires radius 20/40 m and left/right turn.", p.id);
    if (p.kind !== "taper" && p.exitWidth !== p.width)
      err("Use a taper to change width.", p.id);
    if (
      ![p.x, p.z, p.heading, p.length, p.radius].every(Number.isFinite) ||
      Math.max(Math.abs(p.x), Math.abs(p.z)) > 1000
    ) {
      err("Road transform is outside bounds.", p.id);
      continue;
    }
    const len = pieceLength(p);
    if (!(len > 0 && len <= 200)) {
      err("Invalid piece length.", p.id);
      continue;
    }
    offsets.set(p.id, length);
    const count = Math.ceil(len / 2);
    for (let i = 0; i < count; i++) {
      const at = pointAtPiece(p, (len * i) / count);
      samples.push({
        ...at,
        s: length + (len * i) / count,
        pieceId: p.id,
        local: (len * i) / count,
      });
    }
    length += len;
    const end = pointAtPiece(p, len),
      next = map.get(p.nextPiece);
    if (
      next &&
      (Math.hypot(end.x - next.x, end.z - next.z) > 0.02 ||
        Math.abs(wrap(end.heading - next.heading)) > Math.PI / 1800 ||
        Math.abs(end.width - next.width) > 0.01)
    )
      err("Connector gap, direction or width mismatch.", p.id);
  }
  if (length < 200 || length > 4000) err("Route length must be 200–4,000 m.");
  if (samples.length > 4096) err("Route exceeds 4,096 samples.");
  const segs = samples.map((a, i) => {
    const b = samples[(i + 1) % samples.length],
      len = (b.s || length) - a.s;
    return { a, b, len, index: i };
  });
  for (const seg of segs) {
    for (const sign of [-1, 1]) {
      const side = (q) => ({
        x: q.x - Math.sin(q.heading) * q.width * 0.5 * sign,
        z: q.z + Math.cos(q.heading) * q.width * 0.5 * sign,
      });
      walls.push({ a: side(seg.a), b: side(seg.b) });
    }
  }
  // Nonadjacent corridors must not cross; route-distance exclusion allows neighboring arc chords.
  for (let i = 0; i < samples.length; i += 3) {
    const a = samples[i];
    for (let j = i + 3; j < samples.length; j += 3) {
      const b = samples[j],
        ds = Math.min(Math.abs(a.s - b.s), length - Math.abs(a.s - b.s));
      if (
        ds > Math.max(a.width, b.width) * 2 + 4 &&
        Math.hypot(a.x - b.x, a.z - b.z) < (a.width + b.width) / 2 + 0.5
      ) {
        err(
          "Nonadjacent roads overlap or have insufficient clearance.",
          b.pieceId,
        );
        i = samples.length;
        break;
      }
    }
  }
  const track = {
    source: t,
    props: t.props.map((p) => {
      const r = t.recipes.find((r) => p.kind === "recipe:" + r.id);
      return r
        ? {
            ...p,
            kind: r.kind.startsWith("light-") ? "light" : r.kind,
            duration: r.duration,
            damping: r.damping,
            lightPreset: r.kind,
          }
        : p;
    }),
    length,
    samples,
    segs,
    walls,
    offsets,
    problems,
    route,
  };
  const gates = t.gates
    .map((g) => {
      const p = map.get(g.pieceId);
      if (!p || g.distance < 0 || g.distance > pieceLength(p)) {
        err("Gate must lie on its referenced piece.", g.id);
        return null;
      }
      return {
        ...g,
        ...pointAtPiece(p, g.distance),
        s: (offsets.get(p.id) || 0) + g.distance,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order);
  if (
    gates.filter((g) => g.kind === "finish").length !== 1 ||
    gates[0]?.kind !== "finish"
  )
    err("Gate zero must be the single finish.");
  if (gates.length < 4 || gates.length > 33)
    err("Use 3–32 checkpoints plus finish.");
  gates.forEach((g, i) => {
    if (g.order !== i || !["finish", "checkpoint"].includes(g.kind))
      err("Gate orders must be contiguous from zero.", g.id);
    if (i > 0 && g.s <= gates[i - 1].s)
      err("Checkpoints must follow route order.", g.id);
    const next = gates[(i + 1) % gates.length],
      gap = (next.s - g.s + length) % length;
    if (gap < 20 || gap > 200) err("Gate spacing must be 20–200 m.", g.id);
  });
  track.gates = gates;
  const grid = t.spawns
    .filter((s) => s.role === "grid")
    .sort((a, b) => a.slot - b.slot);
  if (grid.length !== 6 || grid.some((s, i) => s.slot !== i + 1))
    err("Provide six ordered grid positions.");
  for (const s of t.spawns) {
    if (!["grid", "respawn"].includes(s.role)) err("Unknown spawn role.", s.id);
    const q = nearest(track, s.x, s.z);
    if (!q || q.distance > q.width / 2 - 2.6)
      err("Spawn does not clear the road edge.", s.id);
    if (Math.abs(wrap(s.heading - (q?.heading || 0))) > 0.1)
      err("Spawn must face forward.", s.id);
    if (s.role === "respawn" && !gates.some((g) => g.id === s.gateId))
      err("Respawn references a missing gate.", s.id);
  }
  for (let i = 0; i < grid.length; i++)
    for (let j = i + 1; j < grid.length; j++)
      if (Math.hypot(grid[i].x - grid[j].x, grid[i].z - grid[j].z) < 4.6)
        err("Grid cars overlap.", grid[j].id);
  for (const g of gates)
    if (
      t.spawns.filter((s) => s.role === "respawn" && s.gateId === g.id)
        .length !== 1
    )
      err("Each gate needs one safe respawn.", g.id);
  for (const p of t.patches) {
    const road = map.get(p.pieceId);
    if (
      !road ||
      !["gravel", "mud"].includes(p.surface) ||
      p.start < 0 ||
      p.end <= p.start ||
      p.end > pieceLength(road) ||
      p.lateralMin >= p.lateralMax ||
      p.lateralMin < -road.width / 2 ||
      p.lateralMax > road.width / 2
    )
      err("Surface patch is outside its road.", p.id);
    for (const b of t.patches)
      if (
        p.id < b.id &&
        p.pieceId === b.pieceId &&
        p.surface !== b.surface &&
        p.start < b.end &&
        b.start < p.end &&
        p.lateralMin < b.lateralMax &&
        b.lateralMin < p.lateralMax
      )
        err("Different surfaces overlap.", p.id);
  }
  for (const p of track.props) {
    if (
      !["barrier", "island", "pad", "light"].includes(p.kind) ||
      p.length < 1 ||
      p.length > 12 ||
      p.width < 0.5 ||
      p.width > 6 ||
      p.duration < 0.5 ||
      p.duration > 1.5 ||
      p.damping < 0 ||
      p.damping > 0.8
    )
      err("Unsupported prop or parameter bounds.", p.id);
    const q = nearest(track, p.x, p.z);
    if (!q) continue;
    const footprint =
      Math.abs(Math.sin(p.heading - q.heading)) * p.length +
      Math.abs(Math.cos(p.heading - q.heading)) * p.width;
    if (p.kind === "pad") {
      if (q.distance + footprint / 2 > q.width / 2)
        err("Boost pad must fit inside the road.", p.id);
    } else if (p.kind !== "light") {
      if (q.distance < q.width / 2 && q.width - footprint < 4)
        err("Obstacle must leave at least 4 m of passage.", p.id);
      for (const g of gates)
        if (Math.hypot(g.x - p.x, g.z - p.z) < p.length / 2 + 3)
          err("Solid prop obstructs a gate.", p.id);
      for (const s of t.spawns)
        if (Math.hypot(s.x - p.x, s.z - p.z) < p.length / 2 + 5)
          err("Solid prop obstructs a spawn.", p.id);
    }
  }
  for (const r of t.recipes)
    if (
      !["pad", "barrier", "light-warm", "light-cool"].includes(r.kind) ||
      !Number.isFinite(r.duration) ||
      r.duration < 0.5 ||
      r.duration > 1.5 ||
      !Number.isFinite(r.damping) ||
      r.damping < 0 ||
      r.damping > 0.8
    )
      err("Recipe contains unsupported behavior or parameters.", r.id);
  if (
    !route.some(
      (p) =>
        ["straight", "start"].includes(p.kind) &&
        p.length >= 60 &&
        p.width >= 10 &&
        !track.props.some(
          (o) =>
            ["barrier", "island"].includes(o.kind) &&
            Math.hypot(
              o.x - (p.x + Math.cos(p.heading) * 30),
              o.z - (p.z + Math.sin(p.heading) * 30),
            ) < 34,
        ),
    )
  )
    err("Keep one clear 60 m passing straight at least 10 m wide.");
  for (const s of grid) {
    const q = nearest(track, s.x, s.z);
    if (gates[0] && q && (q.s >= gates[0].s || gates[0].s - q.s > 45))
      err("Grid positions must be before the finish on its approach.", s.id);
  }
  for (const s of t.spawns.filter((s) => s.role === "respawn")) {
    const g = gates.find((g) => g.id === s.gateId),
      q = nearest(track, s.x, s.z);
    if (g && q) {
      const ahead = (q.s - g.s + length) % length;
      if (ahead < 3 || ahead > 12)
        err("Respawn must be 3–12 m beyond its gate.", s.id);
    }
  }
  track.grid = grid;
  track.valid = !problems.some((p) => p.severity === "error");
  return track;
}
export function nearest(track, x, z, from = -Infinity, to = Infinity) {
  if (!track.nearIndex) {
    track.nearIndex = new Map();
    for (const seg of track.segs) {
      const key = Math.floor(seg.a.x / 20) + "," + Math.floor(seg.a.z / 20);
      if (!track.nearIndex.has(key)) track.nearIndex.set(key, []);
      track.nearIndex.get(key).push(seg);
    }
  }
  const cellX = Math.floor(x / 20),
    cellZ = Math.floor(z / 20),
    key = cellX + "," + cellZ;
  track.nearCandidates ||= new Map();
  let candidates = track.nearCandidates.get(key);
  if (!candidates) {
    candidates = [];
    for (let a = cellX - 1; a <= cellX + 1; a++)
      for (let b = cellZ - 1; b <= cellZ + 1; b++)
        candidates.push(...(track.nearIndex.get(a + "," + b) || []));
    if (track.nearCandidates.size >= 256)
      track.nearCandidates.delete(track.nearCandidates.keys().next().value);
    track.nearCandidates.set(key, candidates);
  }
  let best = null,
    bestDistance = Infinity,
    bestU = 0;
  for (const seg of candidates.length ? candidates : track.segs) {
    const { a, b } = seg;
    if (a.s < from - 2 || a.s > to + 2) continue;
    const dx = b.x - a.x,
      dz = b.z - a.z,
      d2 = dx * dx + dz * dz,
      u = clamp(((x - a.x) * dx + (z - a.z) * dz) / (d2 || 1), 0, 1),
      px = a.x + dx * u,
      pz = a.z + dz * u,
      d = (x - px) ** 2 + (z - pz) ** 2;
    if (d < bestDistance) {
      best = seg;
      bestDistance = d;
      bestU = u;
    }
  }
  if (!best) return null;
  const { a, b } = best,
    u = bestU,
    px = a.x + (b.x - a.x) * u,
    pz = a.z + (b.z - a.z) * u,
    heading = a.heading + wrap(b.heading - a.heading) * u;
  return {
    x: px,
    z: pz,
    distance: Math.sqrt(bestDistance),
    s: a.s + best.len * u,
    heading,
    width: a.width + (b.width - a.width) * u,
    lateral: -(x - px) * Math.sin(heading) + (z - pz) * Math.cos(heading),
    pieceId: a.pieceId,
    local: a.local + best.len * u,
    index: best.index,
  };
}
export function atDistance(track, s) {
  s = ((s % track.length) + track.length) % track.length;
  let lo = 0,
    hi = track.samples.length - 1;
  while (lo < hi) {
    const m = Math.ceil((lo + hi) / 2);
    if (track.samples[m].s <= s) lo = m;
    else hi = m - 1;
  }
  const seg = track.segs[lo],
    u = clamp((s - seg.a.s) / seg.len, 0, 1),
    a = seg.a,
    b = seg.b;
  return {
    x: a.x + (b.x - a.x) * u,
    z: a.z + (b.z - a.z) * u,
    heading: a.heading + wrap(b.heading - a.heading) * u,
    width: a.width + (b.width - a.width) * u,
    s,
  };
}
export function surfaceAt(track, x, z) {
  const q = nearest(track, x, z);
  if (!q) return "asphalt";
  for (const p of track.source.patches)
    if (
      p.pieceId === q.pieceId &&
      q.local >= p.start &&
      q.local <= p.end &&
      q.lateral >= p.lateralMin &&
      q.lateral <= p.lateralMax
    )
      return p.surface;
  return "asphalt";
}
export function suggestRaceSetup(t, newId = uid) {
  const provisional = compile({ ...t, gates: [], spawns: [] }),
    gates = [],
    spawns = [];
  if (!provisional.samples.length) return;
  const count = Math.max(4, Math.ceil(provisional.length / 100));
  for (let i = 0; i < count; i++) {
    const s = (45 + (i * provisional.length) / count) % provisional.length,
      q = atDistance(provisional, s),
      n = nearest(provisional, q.x, q.z),
      g = {
        id: newId(),
        kind: i ? "checkpoint" : "finish",
        pieceId: n.pieceId,
        distance: n.local,
        order: i,
      };
    gates.push(g);
    const r = atDistance(provisional, s + 5);
    spawns.push({
      id: newId(),
      role: "respawn",
      x: r.x,
      z: r.z,
      heading: r.heading,
      slot: 0,
      gateId: g.id,
    });
  }
  gates.sort((a, b) => a.order - b.order);
  for (let i = 0; i < 6; i++) {
    const q = atDistance(provisional, 36 - Math.floor(i / 2) * 8),
      side = i % 2 ? 2.5 : -2.5;
    spawns.push({
      id: newId(),
      role: "grid",
      x: q.x - Math.sin(q.heading) * side,
      z: q.z + Math.cos(q.heading) * side,
      heading: q.heading,
      slot: i + 1,
      gateId: "",
    });
  }
  t.gates = gates;
  t.spawns = spawns;
}
export function appendPiece(t, kind, options = {}, newId = uid) {
  const prev = t.pieces.at(-1),
    end = prev
      ? pointAtPiece(prev, pieceLength(prev))
      : { x: 0, z: 0, heading: 0, width: 12 };
  const p = {
    id: newId(),
    kind,
    x: end.x,
    z: end.z,
    heading: end.heading,
    width: end.width,
    exitWidth: end.width,
    length: kind === "start" ? 60 : 40,
    radius: 40,
    turn: 1,
    nextPiece: "",
    ...options,
  };
  if (prev) prev.nextPiece = p.id;
  t.pieces.push(p);
  return p;
}
export function closeLoop(t) {
  if (t.pieces.length) t.pieces.at(-1).nextPiece = t.pieces[0].id;
}
export function reflow(t) {
  for (let i = 1; i < t.pieces.length; i++) {
    const p = t.pieces[i],
      prev = t.pieces[i - 1],
      end = pointAtPiece(prev, pieceLength(prev));
    p.x = end.x;
    p.z = end.z;
    p.heading = end.heading;
    prev.nextPiece = p.id;
  }
  closeLoop(t);
}
