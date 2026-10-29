import test from "node:test";
import assert from "node:assert/strict";
import {
  closestSegments,
  capsuleImpact,
  separation,
  advanceBodies,
} from "../app/collision.js";
const spec = {
  mass: 1000,
  chassis: { length: 4, width: 2 },
  utility: { yawProtection: 0.2 },
};
const body = (x, z, vx = 0, vz = 0) => ({
  spec,
  x,
  z,
  vx,
  vz,
  yaw: 0,
  heading: 0,
  contacts: 0,
  resetTime: 0,
  ghostTime: 0,
  finishTime: null,
});
test("segment oracle handles crossing centers, parallel overlap, endpoints and degenerate points", () => {
  assert.equal(
    closestSegments(
      { x: -2, z: 0 },
      { x: 2, z: 0 },
      { x: 0, z: -2 },
      { x: 0, z: 2 },
    ).distance,
    0,
  );
  assert.equal(
    closestSegments(
      { x: -2, z: 0 },
      { x: 2, z: 0 },
      { x: -1, z: 3 },
      { x: 1, z: 3 },
    ).distance,
    3,
  );
  assert.equal(
    closestSegments(
      { x: 0, z: 0 },
      { x: 0, z: 0 },
      { x: 3, z: 4 },
      { x: 3, z: 4 },
    ).distance,
    5,
  );
});
test("full capsule side hits a wall between old sample circles", () => {
  const car = body(0, 0, 0, 10),
    wall = { a: { x: 0.5, z: 2 }, b: { x: 0.6, z: 2 } };
  const hit = capsuleImpact(car, wall, 0.3, true);
  assert.ok(hit);
  assert.ok(Math.abs(hit.time - 0.1) < 1e-4);
});
test("pure rotation reaches a wall at the analytic first contact angle", () => {
  const car = body(0, 0);
  car.yaw = Math.PI / 2;
  const wall = { a: { x: -10, z: 1.5 }, b: { x: 10, z: 1.5 } };
  const hit = capsuleImpact(car, wall, 1, true);
  assert.ok(hit);
  assert.ok(Math.abs(hit.time - Math.asin(0.5) / (Math.PI / 2)) < 1e-4);
});
test("high-speed head-on cars collide before crossing and conserve linear momentum", () => {
  const a = body(-10, 0, 120),
    b = body(10, 0, -120);
  const paths = advanceBodies([a, b], {}, 0.1, () => []);
  assert.ok(a.x < b.x);
  assert.ok(separation(a, b).gap >= -1e-3);
  assert.ok(Math.abs(a.vx + b.vx) < 1e-8);
  assert.ok(a.contacts && b.contacts);
  assert.ok(paths.get(a).length >= 2);
});
test("initial wall penetration resolves on the wall normal without a checkpoint motion segment", () => {
  const car = body(0, 0),
    wall = { a: { x: -10, z: 0 }, b: { x: 10, z: 0 } };
  const paths = advanceBodies([car], {}, 1 / 120, () => [wall]);
  assert.ok(Math.abs(car.z) >= 1);
  assert.ok(paths.get(car).every((p) => p.from.z === p.to.z));
});
test("wall impact followed by a car impact is resolved in the remaining step", () => {
  const a = body(0, 0, 40, 6),
    b = body(5, 1, 0),
    wall = { a: { x: -10, z: 2.1 }, b: { x: 20, z: 2.1 } };
  const paths = advanceBodies([a, b], {}, 0.2, () => [wall]);
  assert.ok(a.contacts > 0);
  assert.ok(b.contacts > 0);
  assert.ok(separation(a, b).gap > -1e-3);
  assert.ok(paths.get(a).length > 1);
});
test("parallel true miss and separating tangent do not invent a contact", () => {
  const wall = { a: { x: -100, z: 2 }, b: { x: 100, z: 2 } };
  assert.equal(capsuleImpact(body(0, 0, 50), wall, 0.01, true), null);
  assert.equal(capsuleImpact(body(0, 1, 0, -5), wall, 0.01, true), null);
});
