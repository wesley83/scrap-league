import test from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { loadContent } from "../tools/content.mjs";
import { compile } from "../app/track.js";
import { assemble, allBuilds, STARTER, standings } from "../app/builds.js";
import {
  createCar,
  drive,
  aiInput,
  stepRace,
  DT,
  resultOf,
} from "../app/simulation.js";
import { freshProgress, applyResult } from "../app/storage.js";
const content = await loadContent();
test("all 81 builds accelerate, brake, remain finite and respect boost capacity", () => {
  const t = compile(content.tracks[0].track),
    measure = [];
  for (const build of allBuilds(content.parts)) {
    const spec = assemble(build, content.parts),
      c = createCar(spec, t.grid[0]);
    for (let n = 0; n < 360; n++) drive(c, { throttle: 1 }, t);
    const speed = Math.hypot(c.vx, c.vz);
    assert.ok(speed > 8 && speed < 24);
    for (let n = 0; n < 240; n++) drive(c, { brake: 1 }, t);
    assert.ok(Math.hypot(c.vx, c.vz) < 3);
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.heading));
    assert.ok(c.charge >= 0 && c.charge <= spec.utility.capacity);
    measure.push({ build, mass: spec.mass, speedAt3s: speed });
  }
  const starter = measure.find(
    (m) => JSON.stringify(m.build) === JSON.stringify(STARTER),
  );
  assert.ok(starter);
});
test(
  "six-car races across twelve tracks: three laps at Club, one at Relaxed and Expert",
  { timeout: 300000 },
  async () => {
    const evidence = [];
    for (const difficulty of ["relaxed", "club", "expert"])
      for (const { track } of content.tracks) {
        const ct = compile(track),
          roster = ["player", ...content.rivals.slice(0, 5).map((r) => r.id)],
          r = {
            id: "fixture-" + track.slug,
            mode: "league",
            key: "fixture",
            state: "racing",
            track: ct,
            build: STARTER,
            difficulty,
            laps: difficulty === "club" ? 3 : 1,
            time: 0,
            tick: 0,
            ghost: [],
            cars: roster.map((id, i) => {
              const rival = content.rivals.find((r) => r.id === id),
                c = createCar(
                  assemble(rival || STARTER, content.parts),
                  ct.grid[i],
                  id,
                  i,
                );
              c.personality = rival?.pace || 1;
              return c;
            }),
          };
        for (let n = 0; n < 120 * 400 && r.state === "racing"; n++)
          stepRace(r, aiInput(r.cars[0], ct, difficulty, 1, r.cars));
        const result = resultOf(r);
        evidence.push({
          track: track.slug,
          difficulty,
          laps: r.laps,
          elapsedMs: result.elapsedMs,
          dnf: r.dnf,
          finishes: r.cars.filter((c) => c.finishTime !== null).length,
          contacts: r.cars.reduce((n, c) => n + c.contacts, 0),
          resets: r.cars.reduce((n, c) => n + c.resets, 0),
        });
        assert.equal(r.state, "finished", JSON.stringify(evidence.at(-1)));
        assert.equal(r.dnf, false, JSON.stringify(evidence.at(-1)));
        assert.equal(result.splits.length, r.laps);
        assert.equal(
          result.splits.reduce((a, b) => a + b, 0),
          result.elapsedMs,
        );
      }
    await writeFile(
      new URL("../audit/remediation-simulation-races.json", import.meta.url),
      JSON.stringify(
        {
          kind: "Headless real simulation; player driven by legal AI controls. Not a human/browser completion.",
          utc: new Date().toISOString(),
          races: evidence,
        },
        null,
        2,
      ),
    );
    console.log(
      "Completed",
      evidence.length,
      "six-car races without a forced finish.",
    );
  },
);
test("campaign commits once, DNF does not advance, standings use points and wins", () => {
  let p = freshProgress();
  p.cup = { id: "cup", index: 0, rounds: [] };
  const classification = ["player", "bea", "otto", "kit", "mags", "riv"].map(
    (id) => ({ id }),
  );
  const result = {
    id: "run",
    mode: "league",
    dnf: false,
    difficulty: "club",
    classification,
  };
  p = applyResult(p, result, "cup", 0);
  assert.deepEqual(p.completed, [1]);
  assert.equal(p.cup.rounds.length, 1);
  assert.deepEqual(applyResult(p, result, "cup", 0), p);
  const dnf = applyResult(p, { ...result, id: "dnf", dnf: true }, "cup", 1);
  assert.equal(dnf.cup.rounds.length, 1);
  assert.deepEqual(dnf.completed, [1]);
  const standingsResult = standings(
    [result],
    classification.map((c) => c.id),
  );
  assert.equal(standingsResult[0].id, "player");
  assert.equal(standingsResult[0].points, 10);
  assert.equal(standingsResult.at(-1).points, 1);
});
test("daily schedule covers every 12-day block with no consecutive duplicate", () => {
  for (let i = 1; i < content.daily.length; i++)
    assert.notEqual(content.daily[i].track, content.daily[i - 1].track);
  const blocks = new Map();
  for (const d of content.daily) {
    const b = Math.floor(Date.parse(d.date) / 86400000 / 12);
    if (!blocks.has(b)) blocks.set(b, []);
    blocks.get(b).push(d);
  }
  for (const dates of blocks.values())
    if (dates.length === 12)
      assert.equal(new Set(dates.map((d) => d.track)).size, 12);
});
