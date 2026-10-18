import test from "node:test";
import assert from "node:assert/strict";
import {
  drawingSize,
  graphicsProfile,
  surfaceFailure,
} from "../app/graphics-policy.js";
import { defaultSettings, normalizeSettings } from "../app/preferences.js";

test("high-DPR and large surfaces stay within pixel and hardware budgets", () => {
  for (const safe of [false, true]) {
    const profile = graphicsProfile(safe);
    for (const [width, height] of [
      [412, 915],
      [915, 412],
      [7680, 4320],
      [0, 0],
    ]) {
      for (const dpr of [1, 2.625, 3.5, 8, NaN]) {
        const size = drawingSize(width, height, dpr, profile, 2048);
        assert.ok(size.width > 0 && size.height > 0);
        assert.ok(size.width <= 2048 && size.height <= 2048);
        assert.ok(size.width * size.height <= profile.maxPixels);
      }
    }
  }
  assert.deepEqual(drawingSize(412, 915, 3, graphicsProfile(true)), {
    width: 412,
    height: 915,
  });
  assert.equal(graphicsProfile(true).antialias, false);
});

test("mobile defaults migrate old preferences and preserve explicit graphics choice", () => {
  const mobile = defaultSettings({ coarse: true });
  assert.equal(mobile.safeGraphics, true);
  assert.equal(
    normalizeSettings({ lowEffects: false }, mobile).safeGraphics,
    true,
  );
  assert.equal(
    normalizeSettings({ safeGraphics: false }, mobile).safeGraphics,
    false,
  );
  assert.equal(defaultSettings().safeGraphics, false);
});

test("surface checks detect loss without relying on browser events and reject empty allocation", () => {
  const gl = {
    isContextLost: () => false,
    drawingBufferWidth: 412,
    drawingBufferHeight: 915,
  };
  assert.equal(surfaceFailure(gl), null);
  assert.match(surfaceFailure({ ...gl, isContextLost: () => true }), /lost/);
  assert.match(surfaceFailure({ ...gl, drawingBufferWidth: 0 }), /allocate/);
  assert.match(surfaceFailure({ ...gl, drawingBufferHeight: 0 }), /allocate/);
  assert.match(surfaceFailure(null), /lost/);
});
