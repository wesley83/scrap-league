import { profiledInput } from "./ai-profile.js";
import { RULES } from "./builds.js";
import { advanceBodies } from "./collision.js";
import { clamp, wrap } from "./model.js";
import { nearest, atDistance, surfaceAt } from "./track.js";
export const DT = 1 / 120;
export const dot = (a, b) => a.x * b.x + a.z * b.z;
export function sweepCircle(a, delta, r, w) {
  const vx = w.b.x - w.a.x,
    vz = w.b.z - w.a.z,
    len = Math.hypot(vx, vz);
  if (!len) return null;
  const tx = vx / len,
    tz = vz / len,
    nx = -tz,
    nz = tx,
    ax = a.x - w.a.x,
    az = a.z - w.a.z,
    d = ax * nx + az * nz,
    vd = delta.x * nx + delta.z * nz;
  let best = null;
  const put = (time, nx, nz) => {
    if (
      time >= -1e-8 &&
      time <= 1 &&
      (!best || time < best.time) &&
      delta.x * nx + delta.z * nz < 0
    )
      best = { time: Math.max(0, time), nx, nz };
  };
  if (Math.abs(vd) > 1e-12)
    for (const sign of [-1, 1]) {
      const t = (sign * r - d) / vd,
        u = (ax + delta.x * t) * tx + (az + delta.z * t) * tz;
      if (u >= 0 && u <= len) put(t, nx * sign, nz * sign);
    }
  for (const p of [w.a, w.b]) {
    const x = a.x - p.x,
      z = a.z - p.z,
      A = dot(delta, delta),
      B = 2 * (x * delta.x + z * delta.z),
      C = x * x + z * z - r * r,
      disc = B * B - 4 * A * C;
    if (A > 1e-12 && disc >= 0) {
      const t = (-B - Math.sqrt(disc)) / (2 * A),
        px = x + delta.x * t,
        pz = z + delta.z * t,
        l = Math.hypot(px, pz) || 1;
      put(t, px / l, pz / l);
    }
  }
  return best;
}
function wallIndex(track) {
  if (track.collisionIndex) return track.collisionIndex;
  const walls = [...track.walls];
  for (const p of (track.props || track.source.props).filter((p) =>
    ["barrier", "island"].includes(p.kind),
  )) {
    const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([a, b]) => ({
      x:
        p.x +
        (Math.cos(p.heading) * a * p.length) / 2 -
        (Math.sin(p.heading) * b * p.width) / 2,
      z:
        p.z +
        (Math.sin(p.heading) * a * p.length) / 2 +
        (Math.cos(p.heading) * b * p.width) / 2,
    }));
    for (let i = 0; i < 4; i++)
      walls.push({
        a: corners[i],
        b: corners[(i + 1) % 4],
        damping: p.kind === "barrier" ? p.damping : 0,
      });
  }
  const cells = new Map();
  walls.forEach((w, i) => {
    for (
      let x = Math.floor(Math.min(w.a.x, w.b.x) / 16);
      x <= Math.floor(Math.max(w.a.x, w.b.x) / 16);
      x++
    )
      for (
        let z = Math.floor(Math.min(w.a.z, w.b.z) / 16);
        z <= Math.floor(Math.max(w.a.z, w.b.z) / 16);
        z++
      ) {
        const k = x + "," + z;
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(i);
      }
  });
  return (track.collisionIndex = { walls, cells });
}
function nearbyWalls(track, x, z, r) {
  const { walls, cells } = wallIndex(track),
    ids = new Set();
  for (let a = Math.floor((x - r) / 16); a <= Math.floor((x + r) / 16); a++)
    for (let b = Math.floor((z - r) / 16); b <= Math.floor((z + r) / 16); b++)
      for (const i of cells.get(a + "," + b) || []) ids.add(i);
  return [...ids].map((i) => walls[i]);
}
export function moveColliding(car, track, dt) {
  return advanceBodies([car], track, dt, nearbyWalls);
}
export function createCar(spec, spawn, id = "player", grid = 0) {
  return {
    id,
    spec,
    x: spawn.x,
    z: spawn.z,
    heading: spawn.heading,
    vx: 0,
    vz: 0,
    yaw: 0,
    steer: 0,
    charge: spec.utility.charge,
    padTime: 0,
    padInside: new Set(),
    padCooldown: new Map(),
    recovery: 1,
    reverseHold: 0,
    resetTime: 0,
    ghostTime: 0,
    lap: 0,
    nextGate: 1,
    lastGate: 0,
    lapTimes: [],
    finishTime: null,
    contacts: 0,
    resets: 0,
    grid,
    s: 0,
    surface: "asphalt",
    boosting: false,
    wrongTime: 0,
    stuckTime: 0,
    lastProgress: 0,
    gateCount: 0,
  };
}
export function resetCar(car, track) {
  if (car.finishTime !== null || car.resetTime > 0) return;
  const gate = track.gates[car.lastGate],
    spawn = track.source.spawns.find(
      (s) => s.role === "respawn" && s.gateId === gate.id,
    );
  if (!spawn) return;
  car.x = spawn.x;
  car.z = spawn.z;
  car.heading = spawn.heading;
  car.vx = car.vz = car.yaw = 0;
  car.resetTime = 2;
  car.ghostTime = 3;
  car.padTime = 0;
  car.stuckTime = 0;
  car.resets++;
  car.s = (gate.s + 5) % track.length;
}
export function crossing(a, b, g) {
  const nx = Math.cos(g.heading),
    nz = Math.sin(g.heading),
    da = (a.x - g.x) * nx + (a.z - g.z) * nz,
    db = (b.x - g.x) * nx + (b.z - g.z) * nz;
  if (da >= 0 || db < 0 || db - da < 1e-9) return null;
  const f = -da / (db - da),
    x = a.x + (b.x - a.x) * f,
    z = a.z + (b.z - a.z) * f,
    lateral = -(x - g.x) * nz + (z - g.z) * nx;
  return Math.abs(lateral) <= g.width / 2 ? f : null;
}
export function processGates(car, previous, track, startTime, dt, laps) {
  if (car.resetTime > 0 || car.finishTime !== null) return;
  let lastFraction = -1;
  for (let attempts = 0; attempts < track.gates.length; attempts++) {
    const gate = track.gates[car.nextGate],
      fraction = crossing(previous, car, gate);
    if (fraction === null || fraction <= lastFraction) break;
    lastFraction = fraction;
    car.lastGate = car.nextGate;
    car.gateCount++;
    if (car.nextGate === 0) {
      const exact = startTime + fraction * dt;
      car.lap++;
      const prior = car.lapTimes.reduce((a, b) => a + b, 0);
      car.lapTimes.push(exact - prior);
      if (car.lap >= laps) {
        car.finishTime = exact;
        return;
      }
    }
    car.charge = Math.min(car.spec.utility.capacity, car.charge + 10);
    car.nextGate = (car.nextGate + 1) % track.gates.length;
  }
}
export function drive(car, input, track, dt = DT, deferMotion = false) {
  if (car.finishTime !== null) return;
  car.ghostTime = Math.max(0, car.ghostTime - dt);
  if (car.resetTime > 0) {
    car.resetTime = Math.max(0, car.resetTime - dt);
    return;
  }
  if (input.reset) {
    resetCar(car, track);
    return;
  }
  const spec = car.spec,
    c = Math.cos(car.heading),
    s = Math.sin(car.heading),
    forward = car.vx * c + car.vz * s,
    lateral = -car.vx * s + car.vz * c;
  const near = nearest(track, car.x, car.z);
  car.s = near?.s || 0;
  let grip = 0,
    drag = 0;
  const counts = { asphalt: 0, gravel: 0, mud: 0 };
  for (const a of [-0.85, 0.85])
    for (const b of [-0.65, 0.65]) {
      const surface = surfaceAt(
        track,
        car.x + c * a - s * b,
        car.z + s * a + c * b,
      );
      counts[surface]++;
      grip += spec.tires[surface] / 4;
      drag += { asphalt: 0, gravel: 140, mud: 380 }[surface] / 4;
    }
  car.surface = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const target = clamp(input.steer || 0, -1, 1),
    ramp = Math.abs(target) > Math.abs(car.steer) ? 0.12 : 0.09;
  car.steer += clamp(target - car.steer, -dt / ramp, dt / ramp);
  const hand = !!input.handbrake;
  car.recovery = hand
    ? 0.45
    : Math.min(1, car.recovery + dt / spec.utility.recovery);
  let throttle = clamp(input.throttle || 0, 0, 1),
    brake = clamp(input.brake || 0, 0, 1);
  if (throttle && brake) throttle = brake = 0;
  car.reverseHold = brake && Math.abs(forward) < 0.5 ? car.reverseHold + dt : 0;
  const boost = !!input.boost && car.charge > 0 && forward > 3 && !hand;
  car.boosting = boost;
  const boostFraction = boost ? Math.min(1, car.charge / (30 * dt)) : 0;
  if (boost) car.charge = Math.max(0, car.charge - 30 * dt);
  car.padTime = Math.max(0, car.padTime - dt);
  for (const pad of (track.props || track.source.props).filter(
    (p) => p.kind === "pad",
  )) {
    const dx = car.x - pad.x,
      dz = car.z - pad.z,
      px = dx * Math.cos(pad.heading) + dz * Math.sin(pad.heading),
      pz = -dx * Math.sin(pad.heading) + dz * Math.cos(pad.heading),
      inside = Math.abs(px) < pad.length / 2 && Math.abs(pz) < pad.width / 2;
    const cooldown = Math.max(0, (car.padCooldown.get(pad.id) || 0) - dt);
    car.padCooldown.set(pad.id, cooldown);
    if (
      inside &&
      !car.padInside.has(pad.id) &&
      !cooldown &&
      car.vx * Math.cos(pad.heading) + car.vz * Math.sin(pad.heading) > 0
    ) {
      car.padTime = pad.duration;
      car.padCooldown.set(pad.id, 1);
    }
    if (inside) car.padInside.add(pad.id);
    else car.padInside.delete(pad.id);
  }
  const multiplier = Math.max(
      1 + 0.35 * boostFraction,
      car.padTime > 0 ? 1.25 : 1,
    ),
    governor = spec.engine.governor * (boost ? 1.15 : 1),
    taper = clamp((governor - forward) / 2, 0, 1);
  let acceleration =
    ((throttle *
      Math.min(
        spec.engine.force,
        spec.engine.power / Math.max(Math.abs(forward), 5),
      ) *
      multiplier) /
      spec.mass) *
    taper *
    (hand ? 0.25 : 1);
  if (brake) {
    if (forward > 0.5) acceleration = -9 * brake;
    else if (car.reverseHold >= 0.3 || forward < -0.1)
      acceleration = -Math.min(4, (8 + forward) * 3) * brake;
    else acceleration = -forward / dt;
  }
  if (Math.abs(forward) > 0.01)
    acceleration -=
      Math.sign(forward) *
      ((0.6 * forward * forward) / spec.mass + 0.015 * 9.81 + drag / spec.mass);
  else if (!throttle && !brake) acceleration = 0;
  const maxAccel = grip * 9.81;
  acceleration = clamp(acceleration, -maxAccel, maxAccel);
  const lateralBudget =
    Math.sqrt(Math.max(0, maxAccel * maxAccel - acceleration * acceleration)) *
    (hand ? 0.45 : car.recovery);
  const latAccel = clamp(
    -lateral / Math.max(0.08, spec.utility.recovery),
    -lateralBudget,
    lateralBudget,
  );
  const steerLimit =
      (spec.chassis.steer * Math.PI) / 180 / (1 + Math.abs(forward) * 0.055),
    wantYaw =
      (forward / spec.chassis.wheelbase) * Math.tan(car.steer * steerLimit),
    yawLimit =
      ((grip * 9.81) / Math.max(Math.abs(forward), 5)) * (hand ? 1.8 : 1.18);
  car.yaw +=
    (clamp(wantYaw, -yawLimit, yawLimit) - car.yaw) *
    Math.min(1, dt * spec.chassis.yaw);
  car.vx += (c * acceleration - s * latAccel) * dt;
  car.vz += (s * acceleration + c * latAccel) * dt;
  if (!deferMotion) moveColliding(car, track, dt);
  const diff = Math.abs(wrap(car.heading - (near?.heading || 0)));
  car.wrongTime = forward > 3 && diff > Math.PI * 0.65 ? car.wrongTime + dt : 0;
  const progress = car.gateCount * 100 + (near?.s || 0);
  car.stuckTime =
    throttle > 0.5 && Math.hypot(car.vx, car.vz) < 1 ? car.stuckTime + dt : 0;
  if (
    !Number.isFinite(car.x) ||
    !Number.isFinite(car.z) ||
    Math.abs(car.x) > 1000 ||
    Math.abs(car.z) > 1000
  )
    resetCar(car, track);
}
function capsuleEnds(c) {
  const d = (c.spec.chassis.length - c.spec.chassis.width) / 2;
  return [-d, d].map((t) => ({
    x: c.x + Math.cos(c.heading) * t,
    z: c.z + Math.sin(c.heading) * t,
  }));
}
export function carContacts(cars) {
  for (let i = 0; i < cars.length; i++)
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i],
        b = cars[j];
      if (
        a.ghostTime ||
        b.ghostTime ||
        a.finishTime !== null ||
        b.finishTime !== null ||
        Math.hypot(a.x - b.x, a.z - b.z) > 5
      )
        continue;
      const ae = capsuleEnds(a),
        be = capsuleEnds(b);
      let closest = null;
      for (const [p, ends, swapped] of [
        ...ae.map((p) => [p, be, false]),
        ...be.map((p) => [p, ae, true]),
      ]) {
        const dx = ends[1].x - ends[0].x,
          dz = ends[1].z - ends[0].z,
          u = clamp(
            ((p.x - ends[0].x) * dx + (p.z - ends[0].z) * dz) /
              (dx * dx + dz * dz || 1),
            0,
            1,
          ),
          q = { x: ends[0].x + dx * u, z: ends[0].z + dz * u },
          d = Math.hypot(p.x - q.x, p.z - q.z);
        if (!closest || d < closest.d)
          closest = {
            d,
            x: (p.x - q.x) * (swapped ? -1 : 1),
            z: (p.z - q.z) * (swapped ? -1 : 1),
          };
      }
      const radius = (a.spec.chassis.width + b.spec.chassis.width) / 2;
      if (closest.d < radius) {
        const nx = closest.d > 1e-8 ? closest.x / closest.d : 1,
          nz = closest.d > 1e-8 ? closest.z / closest.d : 0,
          depth = radius - closest.d + 0.001,
          ia = 1 / a.spec.mass,
          ib = 1 / b.spec.mass;
        a.x += (nx * depth * ia) / (ia + ib);
        a.z += (nz * depth * ia) / (ia + ib);
        b.x -= (nx * depth * ib) / (ia + ib);
        b.z -= (nz * depth * ib) / (ia + ib);
        const v = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        if (v < 0) {
          const impulse = (-1.15 * v) / (ia + ib);
          a.vx += impulse * ia * nx;
          a.vz += impulse * ia * nz;
          b.vx -= impulse * ib * nx;
          b.vz -= impulse * ib * nz;
          a.yaw += v * 0.025 * (1 - a.spec.utility.yawProtection);
          b.yaw -= v * 0.025 * (1 - b.spec.utility.yawProtection);
          a.contacts++;
          b.contacts++;
        }
      }
    }
}
export function aiInput(
  car,
  track,
  difficulty = "club",
  personality = 1,
  cars = [],
) {
  const q = nearest(track, car.x, car.z),
    speed = Math.hypot(car.vx, car.vz),
    look = 8 + speed * 0.65,
    goal = atDistance(track, q.s + look),
    pace =
      ({ relaxed: 0.76, club: 0.88, expert: 0.99 }[difficulty] || 0.88) *
      personality;
  let lane = Math.sin(car.grid * 2.4) * 1.0;
  for (const other of cars)
    if (
      other !== car &&
      Math.hypot(other.x - car.x, other.z - car.z) < 11 &&
      dot(
        { x: other.x - car.x, z: other.z - car.z },
        { x: Math.cos(car.heading), z: Math.sin(car.heading) },
      ) > 0
    )
      lane = (car.grid % 2 ? 1 : -1) * 2.4;
  for (const prop of track.props || track.source.props)
    if (
      ["barrier", "island"].includes(prop.kind) &&
      Math.hypot(prop.x - goal.x, prop.z - goal.z) < 12
    ) {
      const side =
        -(prop.x - goal.x) * Math.sin(goal.heading) +
        (prop.z - goal.z) * Math.cos(goal.heading);
      lane = side > 0 ? -3 : 3;
    }
  goal.x -= Math.sin(goal.heading) * lane;
  goal.z += Math.cos(goal.heading) * lane;
  const error = wrap(Math.atan2(goal.z - car.z, goal.x - car.x) - car.heading),
    actualLook = Math.hypot(goal.x - car.x, goal.z - car.z),
    steerAngle = Math.atan2(
      2 * car.spec.chassis.wheelbase * Math.sin(error),
      actualLook,
    ),
    limit = (car.spec.chassis.steer * Math.PI) / 180 / (1 + speed * 0.055);
  let target = car.spec.engine.governor * 0.93;
  for (let ahead = 0; ahead <= 95; ahead += 5) {
    const a = atDistance(track, q.s + ahead),
      b = atDistance(track, q.s + ahead + 4),
      curve = Math.abs(wrap(b.heading - a.heading)) / 4,
      grip = car.spec.tires[surfaceAt(track, a.x, a.z)];
    if (curve > 0.001) {
      const turnSpeed = Math.sqrt((grip * 9.81 * 0.72) / curve) * pace;
      target = Math.min(
        target,
        Math.sqrt(turnSpeed * turnSpeed + 2 * 5 * Math.max(0, ahead - 7)),
      );
    }
  }
  if (Math.abs(error) > 0.6) target = Math.min(target, 10);
  return {
    throttle: speed < target + 0.5 ? 1 : 0,
    brake: speed > target + 1 ? clamp((speed - target) / 4, 0, 1) : 0,
    steer: clamp((steerAngle / limit) * 1.45, -1, 1),
    boost:
      target > 30 && Math.abs(error) < 0.08 && speed > 15 && car.charge > 25,
    reset: car.stuckTime > 5,
  };
}
export function stepRace(r, input, dt = DT) {
  if (r.state !== "racing") return;

  for (const c of r.cars)
    drive(
      c,
      c.id === "player"
        ? input
        : profiledInput(c, r, () =>
            aiInput(c, r.track, r.difficulty, c.personality, r.cars),
          ),
      r.track,
      dt,
      true,
    );
  const paths = advanceBodies(r.cars, r.track, dt, nearbyWalls);
  for (const c of r.cars) {
    const final = { x: c.x, z: c.z };
    for (const segment of paths.get(c)) {
      c.x = segment.to.x;
      c.z = segment.to.z;
      processGates(
        c,
        segment.from,
        r.track,
        r.time + segment.start,
        segment.dt,
        r.laps,
      );
    }
    Object.assign(c, final);
  }
  r.collisionOverload = r.cars.some((c) => c.collisionLimited)
    ? (r.collisionOverload || 0) + dt
    : 0;
  if (r.collisionOverload >= 2) r.performanceDegraded = true;
  r.time += dt;
  const player = r.cars.find((c) => c.id === "player");
  if (player.finishTime !== null || r.time >= 480) {
    r.state = "finished";
    r.dnf = player.finishTime === null;
    r.time = player.finishTime ?? 480;
  }
  if (r.tick++ % 6 === 0)
    r.ghost.push([
      Math.round(r.time * 1000),
      player.x,
      player.z,
      player.heading,
    ]);
}
export function classification(r) {
  return [...r.cars].sort((a, b) => {
    if (a.finishTime !== null || b.finishTime !== null)
      return (
        (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity) ||
        a.grid - b.grid
      );
    return progress(b, r.track) - progress(a, r.track) || a.grid - b.grid;
  });
}
export function progress(c, t) {
  const next = t.gates[c.nextGate],
    last = t.gates[c.lastGate],
    q = nearest(t, c.x, c.z),
    interval = (next.s - last.s + t.length) % t.length,
    d = clamp((q.s - last.s + t.length) % t.length, 0, interval);
  return c.gateCount * 1000 + (d / interval) * 999;
}
export function resultOf(r) {
  const p = r.cars.find((c) => c.id === "player"),
    total = Math.round((p.finishTime ?? r.time) * 1000),
    splits = p.lapTimes.map((t) => Math.round(t * 1000));
  if (splits.length && !r.dnf)
    splits[splits.length - 1] =
      total - splits.slice(0, -1).reduce((a, b) => a + b, 0);
  return {
    id: r.id,
    mode: r.mode,
    key: r.key,
    trackId: r.track.source.id,
    trackName: r.track.source.name,
    build: r.build,
    challenge: r.challenge || "",
    challengeDate: r.challengeDate || "",
    trackRevision: r.trackRevision,
    rulesRevision: r.rulesRevision || RULES,
    buildRevision: r.buildRevision,
    assistance: r.settingsSnapshot
      ? (r.settingsSnapshot.assist ? "steering-on" : "steering-off") +
        ":" +
        (r.settingsSnapshot.autoAccelerate ? "auto" : "manual")
      : "",
    performanceDegraded: !!r.performanceDegraded,
    seed: r.seed,
    laps: r.laps,
    difficulty: r.difficulty,
    elapsedMs: total,
    splits,
    dnf: r.dnf,
    classification: classification(r).map((c) => ({
      id: c.id,
      name: c.name || "You",
      time: c.finishTime === null ? null : Math.round(c.finishTime * 1000),
    })),
    contacts: p.contacts,
    resets: p.resets,
    createdAt: new Date().toISOString(),
  };
}
