import test from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { loadContent } from "../tools/content.mjs";
import { allBuilds, assemble } from "../app/builds.js";
import {
  createCar,
  drive,
  DT,
  processGates,
  resetCar,
  stepRace,
} from "../app/simulation.js";
const content = await loadContent();
// An analytical open proving ground, with no track boundaries or checkpoint progress.
function ground(surface = "asphalt") {
  const a = {
      x: -900,
      z: 0,
      s: 0,
      local: 0,
      heading: 0,
      width: 1800,
      pieceId: "ground",
    },
    b = { ...a, x: 900, s: 1800, local: 1800 };
  return {
    length: 1800,
    walls: [],
    props: [],
    segs: [{ a, b, len: 1800, index: 0 }],
    source: {
      props: [],
      patches: [
        {
          pieceId: "ground",
          start: 0,
          end: 1800,
          lateralMin: -900,
          lateralMax: 900,
          surface,
        },
      ],
      spawns: [],
    },
  };
}
function run(spec, surface, input, seconds, initial = 0) {
  const t = ground(surface),
    c = createCar(spec, { x: 0, z: 0, heading: 0 });
  c.vx = initial;
  let distance = 0,
    maxSlip = 0,
    maxYaw = 0;
  for (let i = 0; i < seconds / DT; i++) {
    // Moving-origin dynamometer: preserve velocities/heading/charge, measure motion before recentering.
    drive(c, typeof input === "function" ? input(i * DT, c) : input, t);
    distance += Math.hypot(c.x, c.z);
    c.x = c.z = 0;
    maxSlip = Math.max(
      maxSlip,
      Math.abs(-c.vx * Math.sin(c.heading) + c.vz * Math.cos(c.heading)),
    );
    maxYaw = Math.max(maxYaw, Math.abs(c.yaw));
    assert.ok(
      [c.vx, c.vz, c.heading, c.yaw, c.charge, c.recovery].every(
        Number.isFinite,
      ),
    );
    assert.ok(c.charge >= 0 && c.charge <= spec.utility.capacity);
    assert.ok(c.padTime <= 2);
  }
  return {
    speed: Math.hypot(c.vx, c.vz),
    distance,
    maxSlip,
    maxYaw,
    charge: c.charge,
    recovery: c.recovery,
  };
}
test("all 81 builds have measured acceleration, governed speed, braking, skidpad, slalom and surface recovery", async () => {
  const rows = [];
  for (const build of allBuilds(content.parts)) {
    const spec = assemble(build, content.parts),
      acceleration = run(spec, "asphalt", { throttle: 1 }, 3),
      governed = run(spec, "asphalt", { throttle: 1 }, 30);
    const braking = run(
      spec,
      "asphalt",
      (_, c) => (Math.hypot(c.vx, c.vz) > 0.6 ? { brake: 1 } : {}),
      3,
      20,
    );
    assert.ok(
      governed.speed <= spec.engine.governor + 0.01 &&
        governed.speed > spec.engine.governor - 2,
    );
    assert.ok(braking.speed < 0.7 && braking.distance < 40);
    const surfaces = {};
    for (const surface of ["asphalt", "gravel", "mud"])
      surfaces[surface] = {
        skidpad: run(spec, surface, { throttle: 0.3, steer: 0.7 }, 12, 15),
        slalom: run(
          spec,
          surface,
          (t) => ({ throttle: 0.5, steer: Math.sin(t * 2) }),
          12,
          12,
        ),
        recovery: run(
          spec,
          surface,
          (t) => ({ throttle: 0.4, steer: t < 1 ? 0.6 : 0, handbrake: t < 1 }),
          5,
          15,
        ),
      };
    for (const values of Object.values(surfaces))
      assert.equal(values.recovery.recovery, 1);
    rows.push({
      build,
      mass: spec.mass,
      acceleration,
      governed,
      braking,
      surfaces,
    });
  }
  // Same other parts: road tires must retain the authored asphalt advantage; mud tires the mud advantage.
  const tires = content.parts.filter((p) => p.slot === "tires");
  for (const surface of ["asphalt", "gravel", "mud"]) {
    const ordered = [...tires].sort((a, b) => b[surface] - a[surface]);
    const groups = new Map();
    for (const row of rows) {
      const key = [row.build.chassis, row.build.engine, row.build.utility].join(
        "|",
      );
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    for (const group of groups.values()) {
      const best = group.find((r) => r.build.tires === ordered[0].id),
        worst = group.find((r) => r.build.tires === ordered.at(-1).id);
      assert.ok(
        best.surfaces[surface].skidpad.maxYaw >=
          worst.surfaces[surface].skidpad.maxYaw * 0.9,
        `Grip tradeoff contradicted for ${surface}`,
      );
    }
  }
  await writeFile(
    new URL("../audit/remediation-handling.json", import.meta.url),
    JSON.stringify(
      {
        utc: new Date().toISOString(),
        method:
          "Moving-origin fixed-step analytical open proving ground; no finish/reward injection; all 81 builds and three surfaces",
        rows,
      },
      null,
      2,
    ),
  );
});
test("boost, pad, handbrake, reset, pause and finish interactions remain bounded", () => {
  const spec = assemble(allBuilds(content.parts)[0], content.parts),
    t = ground(),
    c = createCar(spec, { x: 0, z: 0, heading: 0 });
  c.vx = 10;
  t.props = [
    {
      id: "pad",
      kind: "pad",
      x: 0,
      z: 0,
      heading: 0,
      length: 20,
      width: 20,
      duration: 1,
    },
  ];
  drive(c, { throttle: 1, boost: true }, t);
  assert.equal(c.padTime, 1);
  assert.ok(c.charge < spec.utility.charge);
  const initial = c.padTime;
  drive(c, { throttle: 1, boost: true }, t);
  assert.ok(c.padTime < initial, "inside pad must not retrigger");
  drive(c, { throttle: 1, boost: true, handbrake: true }, t);
  assert.equal(c.boosting, false);
  assert.equal(c.recovery, 0.45);
  c.charge = 0;
  drive(c, { throttle: 1, boost: true }, t);
  assert.equal(c.boosting, false);
  assert.equal(c.charge, 0);
  const paused = structuredClone(c);
  stepRace(
    { state: "paused", cars: [c], track: t, time: 2 },
    { throttle: 1, boost: true },
  );
  assert.deepEqual(c, paused);
  const gate = { id: "finish", x: 0, z: 0, heading: 0, width: 20, s: 0 };
  t.gates = [gate];
  t.source.spawns = [
    { role: "respawn", gateId: "finish", x: 5, z: 0, heading: 0 },
  ];
  c.lastGate = 0;
  c.nextGate = 0;
  c.x = 1;
  c.lap = 0;
  processGates(c, { x: -1, z: 0 }, t, 1, DT, 1);
  assert.equal(c.lap, 1);
  assert.equal(c.charge, 0, "finish does not grant usable post-finish charge");
  const fresh = createCar(spec, { x: 0, z: 0, heading: 0 });
  fresh.padTime = 1;
  resetCar(fresh, t);
  assert.equal(fresh.padTime, 0);
  const charge = fresh.charge;
  drive(fresh, { throttle: 1, boost: true }, t);
  assert.equal(fresh.charge, charge);
  assert.equal(fresh.gateCount, 0);
});
