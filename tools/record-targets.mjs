// Explicit maintenance operation. Records legal controls; never part of normal build.
import fs from "node:fs/promises";
import { loadContent } from "./content.mjs";
import { RULES, STARTER, SLOTS, assemble } from "../app/builds.js";
import { hash, gameplay } from "../app/model.js";
import { compile } from "../app/track.js";
import {
  DT,
  createCar,
  aiInput,
  stepRace,
  resultOf,
} from "../app/simulation.js";
const content = await loadContent({ includeTargets: false });
const spec = assemble(STARTER, content.parts);
const buildRevision = await hash(
  SLOTS.map((s) => {
    const { name, description, unlock, ...physical } = spec[s];
    return physical;
  }),
);
const recordings = [];
for (const slug of ["yard-loop", "dockside-dash", "furnace-bend"]) {
  const source = content.tracks.find((t) => t.track.slug === slug).track;
  const trackRevision = await hash(gameplay(source));
  const runs = {};
  for (const [tier, pace] of [
    ["bronze", 0.65],
    ["silver", 0.83],
    ["gold", 1],
  ]) {
    const track = compile(source);
    const car = createCar(spec, track.grid[0]);
    const r = {
      id: `target-${slug}-${tier}`,
      state: "racing",
      time: 0,
      tick: 0,
      track,
      trackRevision,
      rulesRevision: RULES,
      buildRevision,
      mode: "workshop",
      build: STARTER,
      laps: 3,
      cars: [car],
      difficulty: "expert",
      seed: 1,
      settingsSnapshot: { assist: false, autoAccelerate: false },
      ghost: [],
    };
    while (r.state === "racing") {
      const controls = aiInput(car, track, "expert", pace, []);
      if (tier === "bronze") controls.boost = false;
      stepRace(r, controls, DT);
    }
    const result = resultOf(r);
    if (
      result.dnf ||
      result.resets ||
      result.incidents ||
      result.performanceDegraded
    )
      throw Error(
        `${slug}/${tier} is not a clean completed legal recording: ${JSON.stringify(result)}`,
      );
    runs[tier] = {
      result,
      ghost: r.ghost.map((sample) =>
        sample.map((v, i) => (i ? Number(v.toFixed(4)) : v)),
      ),
    };
    console.log(
      slug,
      tier,
      result.elapsedMs,
      `${result.cleanExits} clean exits`,
    );
  }
  if (!(
    runs.gold.result.elapsedMs < runs.silver.result.elapsedMs &&
    runs.silver.result.elapsedMs < runs.bronze.result.elapsedMs
  ))
    throw Error("Target ladder must be ordered.");
  recordings.push({
    slug,
    creator: "Scrap League crew",
    trackRevision,
    buildRevision,
    rulesRevision: RULES,
    build: STARTER,
    laps: 3,
    assist: "steering-off:manual",
    runs,
  });
}
await fs.writeFile(
  new URL("../references/target-runs.json", import.meta.url),
  JSON.stringify(recordings),
);
