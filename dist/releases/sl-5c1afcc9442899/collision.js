import { clamp, wrap } from "./model.js";
const EPS = 1e-5;
// Closest points on two finite segments, including crossing and degenerate segments.
export function closestSegments(p, q, r, s) {
  const ux = q.x - p.x,
    uz = q.z - p.z,
    vx = s.x - r.x,
    vz = s.z - r.z,
    wx = p.x - r.x,
    wz = p.z - r.z;
  const a = ux * ux + uz * uz,
    b = ux * vx + uz * vz,
    c = vx * vx + vz * vz,
    d = ux * wx + uz * wz,
    e = vx * wx + vz * wz;
  let u = 0,
    v = 0;
  if (a < EPS && c < EPS) {
  } else if (a < EPS) v = clamp(e / c, 0, 1);
  else if (c < EPS) u = clamp(-d / a, 0, 1);
  else {
    const den = a * c - b * b;
    u = den > EPS ? clamp((b * e - c * d) / den, 0, 1) : 0;
    v = (b * u + e) / c;
    if (v < 0) {
      v = 0;
      u = clamp(-d / a, 0, 1);
    } else if (v > 1) {
      v = 1;
      u = clamp((b - d) / a, 0, 1);
    }
  }
  const A = { x: p.x + u * ux, z: p.z + u * uz },
    B = { x: r.x + v * vx, z: r.z + v * vz };
  return { a: A, b: B, distance: Math.hypot(A.x - B.x, A.z - B.z) };
}
function shape(car, t = 0) {
  const half = Math.max(
      0,
      (car.spec.chassis.length - car.spec.chassis.width) / 2,
    ),
    angle = car.heading + car.yaw * t,
    x = car.x + car.vx * t,
    z = car.z + car.vz * t;
  return {
    a: { x: x - Math.cos(angle) * half, z: z - Math.sin(angle) * half },
    b: { x: x + Math.cos(angle) * half, z: z + Math.sin(angle) * half },
    radius: car.spec.chassis.width / 2,
    half,
    x,
    z,
  };
}
export function separation(a, b, t = 0, wall = false) {
  const A = shape(a, t),
    B = wall
      ? { ...b, radius: 0, x: (b.a.x + b.b.x) / 2, z: (b.a.z + b.b.z) / 2 }
      : shape(b, t);
  const pair = closestSegments(A.a, A.b, B.a, B.b);
  let nx = pair.a.x - pair.b.x,
    nz = pair.a.z - pair.b.z;
  if (pair.distance > EPS) {
    nx /= pair.distance;
    nz /= pair.distance;
  } else if (wall) {
    nx = -(B.b.z - B.a.z);
    nz = B.b.x - B.a.x;
    const length = Math.hypot(nx, nz) || 1;
    nx /= length;
    nz /= length;
    const side = (A.x - B.a.x) * nx + (A.z - B.a.z) * nz;
    if (side < 0 || (Math.abs(side) < EPS && a.vx * nx + a.vz * nz > 0)) {
      nx = -nx;
      nz = -nz;
    }
  } else {
    nx = A.x - B.x;
    nz = A.z - B.z;
    let len = Math.hypot(nx, nz);
    if (len < EPS) {
      nx = -(B.b.z - B.a.z);
      nz = B.b.x - B.a.x;
      len = Math.hypot(nx, nz) || 1;
    }
    nx /= len;
    nz /= len;
  }
  return {
    gap: pair.distance - A.radius - B.radius,
    nx,
    nz,
    point: { x: pair.a.x - nx * A.radius, z: pair.a.z - nz * A.radius },
  };
}
function velocity(car, p) {
  return {
    x: car.vx - car.yaw * (p.z - car.z),
    z: car.vz + car.yaw * (p.x - car.x),
  };
}
export function capsuleImpact(a, b, duration, wall = false) {
  const halfA = Math.max(0, (a.spec.chassis.length - a.spec.chassis.width) / 2),
    halfB = wall
      ? 0
      : Math.max(0, (b.spec.chassis.length - b.spec.chassis.width) / 2);
  const bound =
    Math.hypot(a.vx - (wall ? 0 : b.vx), a.vz - (wall ? 0 : b.vz)) +
    Math.abs(a.yaw) * halfA +
    (wall ? 0 : Math.abs(b.yaw) * halfB);
  let t = 0;
  for (let i = 0; i < 80; i++) {
    const hit = separation(a, b, t, wall);
    if (hit.gap <= EPS) {
      const va = velocity(
          { ...a, x: a.x + a.vx * t, z: a.z + a.vz * t },
          hit.point,
        ),
        vb = wall
          ? { x: 0, z: 0 }
          : velocity({ ...b, x: b.x + b.vx * t, z: b.z + b.vz * t }, hit.point);
      if (
        hit.gap < -EPS ||
        (va.x - vb.x) * hit.nx + (va.z - vb.z) * hit.nz < -EPS
      )
        return { ...hit, time: t };
      // A touching, separating pair cannot be allowed to trap the event loop.
      t += Math.max(duration / 64, EPS / Math.max(bound, EPS));
    } else {
      // Project translation onto the current separating axis. Rotation can
      // close that axis by at most angular speed × centerline half-length.
      // Using total tangential speed here stalls otherwise valid wall sliding.
      const closing =
        Math.max(
          0,
          -(
            (a.vx - (wall ? 0 : b.vx)) * hit.nx +
            (a.vz - (wall ? 0 : b.vz)) * hit.nz
          ),
        ) +
        Math.abs(a.yaw) * halfA +
        (wall ? 0 : Math.abs(b.yaw) * halfB);
      if (closing < EPS || hit.gap > closing * (duration - t) + EPS)
        return null;
      t += Math.max(EPS / Math.max(bound, EPS), (hit.gap / closing) * 0.9);
    }
    if (t > duration) return null;
  }
  // Conservative exhaustion: stop at the last proven-safe point, never tunnel.
  return {
    ...separation(a, b, t, wall),
    time: Math.min(t, duration),
    exhausted: true,
  };
}
function resolve(a, b, hit, wall) {
  const ia = 1 / a.spec.mass,
    ib = wall ? 0 : 1 / b.spec.mass,
    sum = ia + ib;
  const push = Math.max(0, -hit.gap) + 0.001;
  a.x += (hit.nx * push * ia) / sum;
  a.z += (hit.nz * push * ia) / sum;
  if (!wall) {
    b.x -= (hit.nx * push * ib) / sum;
    b.z -= (hit.nz * push * ib) / sum;
  }
  const va = velocity(a, hit.point),
    vb = wall ? { x: 0, z: 0 } : velocity(b, hit.point),
    normal = (va.x - vb.x) * hit.nx + (va.z - vb.z) * hit.nz;
  if (normal >= 0) return;
  const inertia = (c) =>
    (12 /
      (c.spec.mass *
        (c.spec.chassis.length ** 2 + c.spec.chassis.width ** 2))) *
    (1 - c.spec.utility.yawProtection);
  const aa = (hit.point.x - a.x) * hit.nz - (hit.point.z - a.z) * hit.nx,
    ab = wall ? 0 : (hit.point.x - b.x) * hit.nz - (hit.point.z - b.z) * hit.nx;
  const invA = inertia(a),
    invB = wall ? 0 : inertia(b),
    impulse =
      (-(1 + (wall ? 0.08 : 0.15)) * normal) /
      (sum + aa * aa * invA + ab * ab * invB);
  a.vx += hit.nx * impulse * ia;
  a.vz += hit.nz * impulse * ia;
  a.yaw = clamp(a.yaw + aa * impulse * invA, -5, 5);
  a.contacts++;
  if (!wall) {
    b.vx -= hit.nx * impulse * ib;
    b.vz -= hit.nz * impulse * ib;
    b.yaw = clamp(b.yaw - ab * impulse * invB, -5, 5);
    b.contacts++;
  } else if (b.damping) {
    const tangent = -a.vx * hit.nz + a.vz * hit.nx;
    a.vx += hit.nz * tangent * b.damping;
    a.vz -= hit.nx * tangent * b.damping;
  }
}
export function advanceBodies(cars, track, duration, nearbyWalls) {
  for (const c of cars) c.collisionLimited = false;
  const active = cars.filter((c) => c.resetTime <= 0 && c.finishTime === null),
    paths = new Map(cars.map((c) => [c, []]));
  let elapsed = 0,
    events = 0;
  const advance = (dt) => {
    for (const c of active) {
      const from = { x: c.x, z: c.z };
      c.x += c.vx * dt;
      c.z += c.vz * dt;
      c.heading = wrap(c.heading + c.yaw * dt);
      if (dt > 0)
        paths.get(c).push({ from, to: { x: c.x, z: c.z }, start: elapsed, dt });
    }
    elapsed += dt;
  };
  while (elapsed < duration - EPS * EPS && events++ < 32) {
    const remain = duration - elapsed;
    let first = null;
    const consider = (a, b, wall) => {
      const hit = capsuleImpact(a, b, remain, wall);
      if (hit && (!first || hit.time < first.hit.time))
        first = { a, b, wall, hit };
    };
    for (let i = 0; i < active.length; i++) {
      const a = active[i],
        range = a.spec.chassis.length + Math.hypot(a.vx, a.vz) * remain;
      for (const wall of nearbyWalls(track, a.x, a.z, range))
        consider(a, wall, true);
      if (a.ghostTime) continue;
      for (let j = i + 1; j < active.length; j++) {
        const b = active[j];
        if (b.ghostTime) continue;
        const reach =
          (a.spec.chassis.length + b.spec.chassis.length) / 2 +
          Math.hypot(a.vx - b.vx, a.vz - b.vz) * remain;
        if (Math.hypot(a.x - b.x, a.z - b.z) <= reach) consider(a, b, false);
      }
    }
    if (!first) {
      advance(remain);
      break;
    }
    advance(first.hit.time);
    if (first.hit.exhausted) {
      for (const c of active) c.collisionLimited = true;
      break;
    }
    resolve(
      first.a,
      first.b,
      separation(first.a, first.b, 0, first.wall),
      first.wall,
    );
  }
  if (elapsed < duration - EPS * EPS)
    for (const c of active) c.collisionLimited = true;
  return paths;
}
