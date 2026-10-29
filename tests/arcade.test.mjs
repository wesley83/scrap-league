import test from "node:test";
import assert from "node:assert/strict";
import {
  ContactActions,
  steeringAxis,
  practiceStep,
  practicePrompt,
} from "../app/driving-controls.js";
import { surfaceSize } from "../app/arcade-renderer.js";
import { defaultSettings } from "../app/preferences.js";
import { TrackDocument } from "../app/track-document.js";
import { DOMParser } from "linkedom";
import { loadContent } from "../tools/content.mjs";
import { parseTrack, stable } from "../app/model.js";

test("touch contacts retain ownership across duplicate presses, cancellation and pause", () => {
  const c = new ContactActions();
  c.press(1, "boost");
  c.press(2, "brake");
  c.press(3, "boost");
  c.press(1, "left");
  assert.equal(c.has("left"), false);
  c.release(2);
  assert.equal(c.has("brake"), false);
  assert.equal(c.has("boost"), true);
  c.release(1);
  assert.equal(c.has("boost"), true);
  c.release(1);
  assert.equal(c.has("boost"), true);
  c.clear();
  assert.equal(c.has("boost"), false);
  assert.equal(c.contacts.size, 0);
});
test("steering uses the contact rectangle, a dead zone and clamped travel", () => {
  const r = { left: 10, width: 100 };
  assert.equal(steeringAxis(60, r), 0);
  assert.equal(steeringAxis(63, r), 0);
  assert.equal(steeringAxis(10, r), -1);
  assert.equal(steeringAxis(110, r), 1);
  assert.ok(steeringAxis(80, r) > 0 && steeringAxis(80, r) < 1);
  assert.equal(
    steeringAxis(80, r),
    steeringAxis(180, { left: 110, width: 100 }),
  );
});
test("lessons follow accepted driving, not elapsed time or an attempted boost", () => {
  const p = {
      heading: 0,
      accelerate: false,
      steer: false,
      brake: false,
      boost: false,
    },
    car = { vx: 0, vz: 0, heading: 0, boosting: false };
  practiceStep(p, car, { throttle: 1, steer: 1, brake: 1, boost: true });
  assert.equal(Object.values(p).filter((x) => x === true).length, 0);
  Object.assign(car, { vx: 10, heading: 0.4 });
  practiceStep(p, car, { throttle: 1, steer: 0.5, brake: 0, boost: true });
  assert.equal(p.accelerate, true);
  assert.equal(p.steer, true);
  assert.equal(p.boost, false);
  const settings = defaultSettings();
  settings.bindings.brake = "KeyB";
  assert.match(practicePrompt(p, settings), /Hold B/);
  practiceStep(p, car, { brake: 1 });
  assert.equal(p.brake, true);
  settings.touch = true;
  assert.match(practicePrompt(p, settings), /BOOST/);
  car.boosting = true;
  practiceStep(p, car, {});
  assert.equal(p.boost, true);
  assert.match(practicePrompt(p, settings), /All four/);
  settings.autoAccelerate = false;
  assert.match(practicePrompt({ accelerate: false }, settings), /Hold GAS/);
  settings.touch = false;
  settings.bindings.throttle = "KeyI";
  assert.match(practicePrompt({ accelerate: false }, settings), /Hold I/);
});
test("Canvas 2D buffers remain bounded without changing CSS input geometry", () => {
  for (const [w, h] of [
    [320, 568],
    [412, 915],
    [844, 390],
    [1280, 720],
    [7680, 4320],
    [0, 0],
  ])
    for (const dpr of [1, 2.625, 4, 8, NaN])
      for (const low of [true, false]) {
        const size = surfaceSize(w, h, dpr, low);
        assert.ok(size.width >= 1 && size.height >= 1);
        assert.ok(
          size.width <= 4096 &&
            size.height <= 4096 &&
            size.width * size.height <= 2400000,
        );
      }
  assert.deepEqual(surfaceSize(412, 915, 3, true), { width: 412, height: 915 });
});
test("Workshop commits semantic source atomically and exposes an immutable projection", async () => {
  const content = await loadContent(),
    root = new DOMParser()
      .parseFromString("<html><body><div></div></body></html>", "text/html")
      .querySelector("div");
  const source = new TrackDocument(root, DOMParser);
  source.replace(content.tracks[0].track);
  const original = source.html();
  assert.throws(() => (source.read().pieces[0].length = 20), TypeError);
  const candidate = structuredClone(source.read());
  candidate.name = "Edited circuit";
  source.replace(candidate);
  assert.equal(
    root.querySelector('[itemprop="name"]').textContent,
    candidate.name,
  );
  assert.equal(stable(parseTrack(source.html(), DOMParser)), stable(candidate));
  candidate.schemaVersion = 99;
  assert.throws(() => source.replace(candidate), /Unsupported/);
  assert.equal(source.read().name, "Edited circuit");
  assert.notEqual(source.html(), original);
  const draft = structuredClone(source.read());
  draft.pieces = [];
  draft.gates = [];
  draft.spawns = [];
  draft.patches = [];
  source.replace(draft);
  assert.equal(source.read().pieces.length, 0);
});
