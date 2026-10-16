// One-time content authoring. Uses the exact Workshop placement/setup/serialization commands.
// Reviewed exports in content/ are build inputs; the build never regenerates them.
import { mkdir, writeFile } from "node:fs/promises";
import { serializeTrack, serializeEntities } from "../app/model.js";
import {
  appendPiece,
  closeLoop,
  suggestRaceSetup,
  compile,
} from "../app/track.js";
let serial = 0;
const id = () =>
  `51000000-0000-4000-8000-${(++serial).toString(16).padStart(12, "0")}`;
const write = async (p, s) => {
  await mkdir(
    new URL(
      "../content/" + p.substring(0, p.lastIndexOf("/") + 1),
      import.meta.url,
    ),
    { recursive: true },
  );
  await writeFile(new URL("../content/" + p, import.meta.url), s);
};
const trackSpecs = [
  [
    "yard-loop",
    "Yard Loop",
    [
      [0, 0],
      [220, 0],
      [220, 140],
      [0, 140],
    ],
    40,
    "Brake before the bend. Accelerate as the road opens.",
  ],
  [
    "tin-can-alley",
    "Tin Can Alley",
    [
      [0, 0],
      [240, 0],
      [240, 80],
      [180, 80],
      [180, 180],
      [0, 180],
    ],
    20,
    "Set up early for the linked corners.",
  ],
  [
    "gravel-shift",
    "Gravel Shift",
    [
      [0, 0],
      [240, 0],
      [240, 160],
      [0, 160],
    ],
    40,
    "Gravel needs a gentler steering hand.",
  ],
  [
    "dockside-dash",
    "Dockside Dash",
    [
      [0, 0],
      [320, 0],
      [320, 160],
      [0, 160],
    ],
    40,
    "Save boost for the long dockside straight.",
  ],
  [
    "container-switchback",
    "Container Switchback",
    [
      [0, 0],
      [220, 0],
      [220, 140],
      [140, 140],
      [140, 60],
      [80, 60],
      [80, 140],
      [0, 140],
    ],
    20,
    "Brake early, leave room through the return bends.",
  ],
  [
    "salt-flat-sprint",
    "Salt Flat Sprint",
    [
      [0, 0],
      [340, 0],
      [340, 220],
      [0, 220],
    ],
    40,
    "Rally tires trade paved grip for a better loose-surface line.",
  ],
  [
    "furnace-bend",
    "Furnace Bend",
    [
      [0, 0],
      [200, 0],
      [200, 140],
      [120, 140],
      [120, 60],
      [60, 60],
      [60, 140],
      [0, 140],
    ],
    20,
    "Ease off the throttle to bring a slide back.",
  ],
  [
    "mudworks",
    "Mudworks",
    [
      [0, 0],
      [280, 0],
      [280, 200],
      [0, 200],
    ],
    40,
    "There is a clean line beside the mud.",
  ],
  [
    "crusher-circuit",
    "Crusher Circuit",
    [
      [0, 0],
      [260, 0],
      [260, 180],
      [180, 180],
      [180, 100],
      [100, 100],
      [100, 180],
      [0, 180],
    ],
    20,
    "Look through the chicane before committing to a pass.",
  ],
  [
    "night-sort",
    "Night Sort",
    [
      [0, 0],
      [280, 0],
      [280, 120],
      [220, 120],
      [220, 220],
      [0, 220],
    ],
    20,
    "Follow the cream edge paint through the sorting yard.",
  ],
  [
    "redline-ridge",
    "Redline Ridge",
    [
      [0, 0],
      [360, 0],
      [360, 220],
      [0, 220],
    ],
    40,
    "Long straights demand earlier braking.",
  ],
  [
    "the-big-salvage",
    "The Big Salvage",
    [
      [0, 0],
      [300, 0],
      [300, 200],
      [200, 200],
      [200, 120],
      [100, 120],
      [100, 200],
      [0, 200],
    ],
    20,
    "One final lap. Link your exits and bring it home.",
  ],
];
const scenes = ["yard", "docks", "foundry", "night"],
  music = ["yard", "docks", "foundry", "final"];
const catalog = [];
for (let ti = 0; ti < trackSpecs.length; ti++) {
  const [slug, name, poly, r, tip] = trackSpecs[ti],
    t = {
      id: id(),
      slug,
      schemaVersion: 1,
      name,
      description: tip,
      pieceCatalogRevision: "pieces-v1",
      laps: 3,
      scenePreset: scenes[Math.floor(ti / 3)],
      musicPreset: music[Math.floor(ti / 3)],
      pieces: [],
      patches: [],
      props: [],
      gates: [],
      spawns: [],
      recipes: [],
    };
  for (let j = 0; j < poly.length; j++) {
    const a = poly[j],
      b = poly[(j + 1) % poly.length],
      c = poly[(j + 2) % poly.length],
      dx = b[0] - a[0],
      dz = b[1] - a[1],
      len = Math.hypot(dx, dz);
    let remaining = len - 2 * r;
    if (remaining < 0) throw Error("Invalid polygon radius");
    while (remaining > 0) {
      const n = Math.min(60, remaining),
        p = appendPiece(
          t,
          j === 0 && remaining === len - 2 * r ? "start" : "straight",
          { length: n, width: 12, exitWidth: 12 },
          id,
        );
      if (t.pieces.length === 1) {
        p.x = a[0] + (dx / len) * r;
        p.z = a[1] + (dz / len) * r;
        p.heading = Math.atan2(dz, dx);
      }
      remaining -= n;
    }
    const turn = Math.sign(dx * (c[1] - b[1]) - dz * (c[0] - b[0]));
    appendPiece(
      t,
      "quarter",
      { radius: r, turn, width: 12, exitWidth: 12 },
      id,
    );
  }
  closeLoop(t);
  suggestRaceSetup(t, id);
  if (ti >= 2) {
    const selected = t.pieces.filter(
      (p, i) => p.kind === "quarter" && (i % 3 === 0 || ti === 5 || ti === 11),
    );
    for (const p of selected.slice(0, ti === 5 ? 4 : 2))
      t.patches.push({
        id: id(),
        pieceId: p.id,
        surface: "gravel",
        start: 0,
        end: (p.radius * Math.PI) / 2,
        lateralMin: -6,
        lateralMax: 6,
      });
  }
  if ([7, 11].includes(ti)) {
    for (const p of t.pieces.filter((p) => p.kind === "straight").slice(2, 4))
      t.patches.push({
        id: id(),
        pieceId: p.id,
        surface: "mud",
        start: 5,
        end: Math.min(p.length - 3, 25),
        lateralMin: -5.5,
        lateralMax: 1,
      });
  }
  if ([3, 5, 10, 11].includes(ti)) {
    const p = t.pieces.find(
      (p, i) => i > 1 && p.kind === "straight" && p.length === 60,
    );
    if (p)
      t.props.push({
        id: id(),
        kind: "pad",
        x: p.x + Math.cos(p.heading) * 30,
        z: p.z + Math.sin(p.heading) * 30,
        heading: p.heading,
        length: 8,
        width: 6,
        duration: 1,
        damping: 0.2,
      });
  }
  const compiled = compile(t);
  if (!compiled.valid)
    throw Error(
      name + ": " + compiled.problems.map((p) => p.message).join("; "),
    );
  await write(`tracks/${slug}/definition.html`, serializeTrack(t));
  catalog.push({
    id: t.id,
    name,
    path: `tracks/${slug}/definition.html`,
    cup: Math.floor(ti / 3),
    order: ti + 1,
    tip,
  });
  console.log(
    name,
    Math.round(compiled.length) + " m",
    t.pieces.length + " pieces",
  );
}
const blank = {
  id: "",
  slot: "",
  name: "",
  description: "",
  mass: 0,
  wheelbase: 0,
  length: 0,
  width: 0,
  steer: 0,
  yaw: 0,
  force: 0,
  power: 0,
  governor: 0,
  asphalt: 0,
  gravel: 0,
  mud: 0,
  capacity: 100,
  charge: 60,
  recovery: 0.15,
  yawProtection: 0,
  unlock: 0,
};
const parts = [
  {
    id: "mule",
    slot: "chassis",
    name: "Mule",
    mass: 760,
    wheelbase: 2.45,
    length: 3.7,
    width: 1.8,
    steer: 30,
    yaw: 6,
    description: "Predictable handling. A broad window to recover a slide.",
  },
  {
    id: "kite",
    slot: "chassis",
    name: "Kite",
    mass: 640,
    wheelbase: 2.2,
    length: 3.3,
    width: 1.7,
    steer: 33,
    yaw: 7.5,
    unlock: 3,
    description: "Light and quick to rotate. More sensitive to contact.",
  },
  {
    id: "anvil",
    slot: "chassis",
    name: "Anvil",
    mass: 920,
    wheelbase: 2.7,
    length: 4.1,
    width: 1.9,
    steer: 28,
    yaw: 5,
    unlock: 9,
    description: "Stable at speed. Slower to change direction.",
  },
  {
    id: "courier",
    slot: "engine",
    name: "Courier",
    mass: 100,
    force: 5000,
    power: 85000,
    governor: 38,
    description: "Light and controllable. Reaches its speed limit earlier.",
  },
  {
    id: "torque-box",
    slot: "engine",
    name: "Torque Box",
    mass: 150,
    force: 6500,
    power: 100000,
    governor: 40,
    unlock: 5,
    description:
      "Strong corner exits. The extra mass asks for earlier braking.",
  },
  {
    id: "longrunner",
    slot: "engine",
    name: "Longrunner",
    mass: 190,
    force: 5200,
    power: 135000,
    governor: 46,
    unlock: 1,
    description: "Strong on fast straights. Heavier through slow corners.",
  },
  {
    id: "road",
    slot: "tires",
    name: "Road",
    mass: 40,
    asphalt: 1.1,
    gravel: 0.72,
    mud: 0.48,
    description: "The strongest paved-road grip.",
  },
  {
    id: "mixed",
    slot: "tires",
    name: "Mixed",
    mass: 40,
    asphalt: 1,
    gravel: 0.88,
    mud: 0.66,
    unlock: 2,
    description: "Predictable grip across mixed surfaces.",
  },
  {
    id: "rally",
    slot: "tires",
    name: "Rally",
    mass: 40,
    asphalt: 0.92,
    gravel: 1.02,
    mud: 0.82,
    unlock: 6,
    description: "Better loose-surface control, less asphalt peak grip.",
  },
  {
    id: "roll-cage",
    slot: "utility",
    name: "Roll Cage",
    mass: 60,
    yawProtection: 0.25,
    description: "25% less collision-induced rotation. Carries extra mass.",
  },
  {
    id: "flywheel",
    slot: "utility",
    name: "Flywheel",
    mass: 30,
    recovery: 0.1,
    unlock: 8,
    description: "Lighter kit. Grip recovers more quickly after handbraking.",
  },
  {
    id: "capacitor",
    slot: "utility",
    name: "Capacitor",
    mass: 70,
    capacity: 120,
    charge: 80,
    unlock: 4,
    description: "A longer boost reserve, with additional weight.",
  },
].map((p) => ({ ...blank, ...p }));
for (const p of parts)
  await write(
    "parts/" + p.id + ".html",
    serializeEntities("Part", [p], p.name),
  );
await write(
  "catalog.html",
  serializeEntities("CatalogEntry", catalog, "Scrap League circuits"),
);
const rivals = [
  [
    "bea",
    "Bea Bolts",
    "12",
    "mule",
    "courier",
    "mixed",
    "roll-cage",
    0.94,
    "#da7950",
  ],
  [
    "otto",
    "Otto",
    "07",
    "anvil",
    "torque-box",
    "road",
    "roll-cage",
    0.98,
    "#85a5ac",
  ],
  ["kit", "Kit", "24", "kite", "courier", "road", "flywheel", 1.01, "#e3dfc7"],
  [
    "mags",
    "Mags",
    "31",
    "mule",
    "longrunner",
    "mixed",
    "capacitor",
    0.96,
    "#cc755e",
  ],
  ["riv", "Riv", "18", "kite", "torque-box", "rally", "flywheel", 1, "#9eaa70"],
  [
    "sol",
    "Sol",
    "45",
    "anvil",
    "longrunner",
    "road",
    "capacitor",
    0.97,
    "#9b8ca7",
  ],
  [
    "patch",
    "Patch",
    "63",
    "mule",
    "torque-box",
    "rally",
    "roll-cage",
    0.92,
    "#c7b294",
  ],
  [
    "pip",
    "Pip",
    "88",
    "kite",
    "longrunner",
    "mixed",
    "flywheel",
    1.03,
    "#7da997",
  ],
].map((a) =>
  Object.fromEntries(
    [
      "id",
      "name",
      "number",
      "chassis",
      "engine",
      "tires",
      "utility",
      "pace",
      "color",
    ].map((k, i) => [k, a[i]]),
  ),
);
await write("rivals.html", serializeEntities("Rival", rivals));
for (let i = 0; i < 4; i++)
  await write(
    "cups/" +
      ["yard-shift", "dock-circuit", "foundry-run", "scrap-league-final"][i] +
      ".html",
    serializeEntities("Cup", [
      {
        id: ["yard-shift", "dock-circuit", "foundry-run", "scrap-league-final"][
          i
        ],
        name: [
          "Yard Shift",
          "Dock Circuit",
          "Foundry Run",
          "Scrap League Final",
        ][i],
        tracks: catalog
          .slice(i * 3, i * 3 + 3)
          .map((t) => t.id)
          .join(" "),
      },
    ]),
  );
const rand = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let a = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  a ^= a + Math.imul(a ^ (a >>> 7), 61 | a);
  return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
};
const shuffle = (b) => {
  const a = [...Array(12).keys()],
    r = rand(b + 84281);
  for (let i = 11; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const daily = [];
for (let d = -30; d <= 90; d++) {
  const day = Math.floor(Date.parse("2026-10-16T00:00:00Z") / 86400000) + d,
    block = Math.floor(day / 12),
    a = shuffle(block),
    prev = shuffle(block - 1);
  if (a[0] === prev[11]) [a[0], a[1]] = [a[1], a[0]];
  const date = new Date(day * 86400000).toISOString().slice(0, 10),
    r = rand(day + 8243),
    build = {};
  for (const slot of ["chassis", "engine", "tires", "utility"])
    build[slot] = parts.filter((p) => p.slot === slot)[Math.floor(r() * 3)].id;
  daily.push({
    id: "daily-v1:" + date,
    date,
    track: catalog[a[day % 12]].id,
    ...build,
    scheduleRevision: "daily-v1",
  });
}
await write("daily/daily-v1.html", serializeEntities("Challenge", daily));
