import { uid } from "./model.js";
import { pieceLength, pointAtPiece } from "./track.js";
export function transformSelection(
  track,
  ids,
  { dx = 0, dz = 0, angle = 0 } = {},
) {
  if (![dx, dz, angle].every(Number.isFinite))
    throw Error("Enter finite transform values.");
  const selected = new Set(ids);
  const gates = new Set(
    track.gates.filter((g) => selected.has(g.pieceId)).map((g) => g.id),
  );
  const objects = [...track.pieces, ...track.props, ...track.spawns].filter(
    (p) => selected.has(p.id) || gates.has(p.gateId),
  );
  if (!objects.length)
    throw Error("Select a road, prop or spawn to transform.");
  const center = objects.reduce(
    (a, p) => ({
      x: a.x + p.x / objects.length,
      z: a.z + p.z / objects.length,
    }),
    { x: 0, z: 0 },
  );
  const c = Math.cos(angle),
    s = Math.sin(angle);
  for (const p of objects) {
    const x = p.x - center.x,
      z = p.z - center.z;
    p.x = center.x + x * c - z * s + dx;
    p.z = center.z + x * s + z * c + dz;
    p.heading += angle;
  }
}
export function addPatch(track, pieceId, values = {}) {
  const piece = track.pieces.find((p) => p.id === pieceId);
  if (!piece) throw Error("Select a road first.");
  const patch = {
    id: uid(),
    pieceId,
    surface: "gravel",
    start: 0,
    end: Math.min(20, pieceLength(piece)),
    lateralMin: -piece.width / 2,
    lateralMax: 0,
    ...values,
  };
  if (
    !["mud", "gravel"].includes(patch.surface) ||
    ![patch.start, patch.end, patch.lateralMin, patch.lateralMax].every(
      Number.isFinite,
    ) ||
    patch.start < 0 ||
    patch.end <= patch.start ||
    patch.end > pieceLength(piece) ||
    patch.lateralMin >= patch.lateralMax ||
    patch.lateralMin < -Math.min(piece.width, piece.exitWidth) / 2 ||
    patch.lateralMax > Math.min(piece.width, piece.exitWidth) / 2
  )
    throw Error("Patch must fit within the selected road.");
  track.patches.push(patch);
  return patch;
}
export function createRecipe(
  track,
  { kind = "pad", duration = 1, damping = 0.2 } = {},
) {
  if (
    !["pad", "barrier", "light-warm", "light-cool"].includes(kind) ||
    !Number.isFinite(duration) ||
    duration < 0.5 ||
    duration > 1.5 ||
    !Number.isFinite(damping) ||
    damping < 0 ||
    damping > 0.8
  )
    throw Error("Recipe is outside the supported bounds.");
  if (track.recipes.length >= 16) throw Error("The limit is 16 recipes.");
  const recipe = { id: uid(), kind, duration, damping };
  track.recipes.push(recipe);
  return recipe;
}
export function placeRecipe(track, pieceId, recipeId) {
  const piece = track.pieces.find((p) => p.id === pieceId),
    recipe = track.recipes.find((r) => r.id === recipeId);
  if (!piece || !recipe) throw Error("Select a road and a recipe.");
  const at = pointAtPiece(piece, pieceLength(piece) / 2);
  const prop = {
    id: uid(),
    kind: "recipe:" + recipe.id,
    x: at.x,
    z: at.z,
    heading: at.heading,
    length: recipe.kind === "pad" ? 8 : 2,
    width: recipe.kind === "pad" ? 6 : 1,
    duration: recipe.duration,
    damping: recipe.damping,
  };
  if (recipe.kind.startsWith("light")) {
    prop.x -= Math.sin(at.heading) * (piece.width / 2 + 2);
    prop.z += Math.cos(at.heading) * (piece.width / 2 + 2);
  }
  track.props.push(prop);
  return prop;
}
export function deleteRecipe(track, id) {
  if (track.props.some((p) => p.kind === "recipe:" + id))
    throw Error("Remove or reassign the objects using this recipe first.");
  track.recipes = track.recipes.filter((r) => r.id !== id);
}
export function editRecipe(track, id, values) {
  const recipe = track.recipes.find((r) => r.id === id);
  if (!recipe) throw Error("Choose an existing recipe.");
  // Reuse the creation validator without consuming a slot or changing identity.
  const checked = createRecipe({ recipes: [] }, { ...recipe, ...values });
  Object.assign(recipe, {
    kind: checked.kind,
    duration: checked.duration,
    damping: checked.damping,
  });
}
export function assignRecipe(track, ids, recipeId) {
  const recipe = track.recipes.find((r) => r.id === recipeId);
  const selected = track.props.filter((p) => ids.includes(p.id));
  if (!recipe || !selected.length)
    throw Error("Select one or more objects and an existing recipe.");
  for (const prop of selected) {
    prop.kind = "recipe:" + recipe.id;
    prop.duration = recipe.duration;
    prop.damping = recipe.damping;
  }
}
