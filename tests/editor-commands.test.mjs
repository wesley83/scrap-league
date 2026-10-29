import test from "node:test";
import assert from "node:assert/strict";
import { loadContent } from "../tools/content.mjs";
import { compile, surfaceAt, pointAtPiece } from "../app/track.js";
import {
  clone,
  duplicateTrack,
  serializeTrack,
  parseTrack,
  stable,
} from "../app/model.js";
import { DOMParser } from "linkedom";
import {
  transformSelection,
  addPatch,
  createRecipe,
  placeRecipe,
  deleteRecipe,
  editRecipe,
  assignRecipe,
} from "../app/editor-commands.js";
const content = await loadContent();
test("group rigid transform preserves topology and IDs and inverse restores coordinates", () => {
  const track = clone(content.tracks[0].track),
    before = clone(track);
  const ids = [...track.pieces, ...track.props, ...track.spawns].map(
    (p) => p.id,
  );
  transformSelection(track, ids, { angle: Math.PI / 2 });
  assert.ok(compile(track).valid);
  transformSelection(track, ids, { angle: -Math.PI / 2 });
  for (let i = 0; i < track.pieces.length; i++) {
    assert.equal(track.pieces[i].id, before.pieces[i].id);
    assert.ok(
      Math.hypot(
        track.pieces[i].x - before.pieces[i].x,
        track.pieces[i].z - before.pieces[i].z,
      ) < 1e-8,
    );
  }
});
test("recipe edits preserve references and reassignment releases an in-use recipe", () => {
  const track = clone(content.tracks[0].track);
  const first = createRecipe(track, { kind: "pad" });
  const prop = placeRecipe(track, track.pieces[1].id, first.id);
  editRecipe(track, first.id, { duration: 1.5 });
  assert.equal(
    compile(track).props.find((p) => p.id === prop.id).duration,
    1.5,
  );
  assert.throws(
    () => editRecipe(track, first.id, { duration: 8 }),
    /supported/,
  );
  assert.equal(first.duration, 1.5);
  const second = createRecipe(track, { kind: "pad", duration: 0.5 });
  assignRecipe(track, [prop.id], second.id);
  deleteRecipe(track, first.id);
  assert.equal(
    compile(track).props.find((p) => p.id === prop.id).duration,
    0.5,
  );
  assert.equal(
    stable(parseTrack(serializeTrack(track), DOMParser)),
    stable(track),
  );
});
test("partial surface only changes its bounded span and survives HTML round trip", () => {
  const track = clone(content.tracks[0].track),
    p = track.pieces[0];
  addPatch(track, p.id, {
    start: 5,
    end: 15,
    lateralMin: -4,
    lateralMax: -1,
    surface: "mud",
  });
  const compiled = compile(track);
  assert.ok(compiled.valid);
  const q = pointAtPiece(p, 10);
  assert.equal(surfaceAt(compiled, q.x, q.z - 2), "mud");
  assert.equal(surfaceAt(compiled, q.x, q.z + 2), "asphalt");
  assert.equal(surfaceAt(compiled, p.x + 20, p.z - 2), "asphalt");
  assert.equal(
    stable(parseTrack(serializeTrack(track), DOMParser)),
    stable(track),
  );
});
test("recipes resolve bounded native behavior, duplicate references and reject executable or in-use deletion", () => {
  const track = clone(content.tracks[0].track),
    recipe = createRecipe(track, { kind: "pad", duration: 1.4, damping: 0.2 });
  const prop = placeRecipe(track, track.pieces[1].id, recipe.id);
  assert.equal(
    compile(track).props.find((p) => p.id === prop.id).duration,
    1.4,
  );
  assert.throws(() => deleteRecipe(track, recipe.id), /reassign/);
  const copy = duplicateTrack(track);
  const copiedRecipeProp = copy.props.find((p) => p.kind.startsWith("recipe:"));
  assert.equal(copiedRecipeProp.kind, "recipe:" + copy.recipes[0].id);
  assert.equal(copy.props.length, track.props.length);
  assert.equal(
    track.props.find((p) => p.id === prop.id).kind,
    "recipe:" + recipe.id,
  );
  assert.ok(compile(copy).valid);
  assert.throws(
    () => createRecipe(track, { kind: "eval", duration: 1, damping: 0.2 }),
    /supported/,
  );
  assert.throws(
    () => createRecipe(track, { kind: "pad", duration: 99, damping: 0.2 }),
    /supported/,
  );
});
