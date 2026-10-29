import { assemble } from "./builds.js";
import { compile, nearest } from "./track.js";
import { createCar, aiInput, stepRace, DT } from "./simulation.js";

// Identical 20-second, standing-start section for every build. No driver bonus.
export function measureBuild(track, build, parts) {
  const t = compile(track);
  if (!t.valid) throw Error("Comparison track is invalid.");
  const car = createCar(assemble(build, parts), t.grid[0]);
  const r = {
    state: "racing",
    time: 0,
    tick: 0,
    track: t,
    laps: 9,
    cars: [car],
    ghost: [],
    difficulty: "expert",
    seed: 1,
  };
  let distance = 0,
    previous = t.gates[0].s - 9,
    slip = 0;
  // Use the actual grid coordinate; signed route distance rejects backward gain.
  previous = nearest(t, car.x, car.z).s;
  for (let tick = 0; tick < 20 / DT; tick++) {
    stepRace(r, aiInput(car, t, "expert", 1, []));
    const q = nearest(t, car.x, car.z);
    let delta = q.s - previous;
    if (delta < -t.length / 2) delta += t.length;
    if (delta > t.length / 2) delta -= t.length;
    distance += delta;
    previous = q.s;
    slip = Math.max(
      slip,
      Math.abs(
        -car.vx * Math.sin(car.heading) + car.vz * Math.cos(car.heading),
      ),
    );
  }
  return {
    meters: Math.round(distance),
    exitKmh: Math.round(Math.hypot(car.vx, car.vz) * 3.6),
    incidents: car.insights?.incidents || 0,
    maxSlip: Math.round(slip * 10) / 10,
  };
}
