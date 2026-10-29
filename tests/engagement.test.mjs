import test from "node:test";
import assert from "node:assert/strict";
import { DOMParser } from "linkedom";
import { loadContent } from "../tools/content.mjs";
import {
  compile,
  pointAtPiece,
  pieceLength,
  surfaceAt,
  nearest,
  atDistance,
} from "../app/track.js";
import {
  parseTrack,
  serializeTrack,
  hash,
  gameplay,
  duplicateTrack,
  wrap,
  clamp,
} from "../app/model.js";
import {
  RULES,
  STARTER,
  assemble,
  BUILD_PRESETS,
  unlocked,
  comparisonKey,
} from "../app/builds.js";
import { createCar, aiInput, stepRace, DT } from "../app/simulation.js";
import { recordDriving, coaching, nextGoal } from "../app/race-insights.js";
import { measureBuild } from "../app/build-lab.js";
import {
  targetFromResult,
  resolveChallenge,
  challengeErrors,
  importTrackCopy,
} from "../app/challenges.js";
import { freshProgress, openStore } from "../app/storage.js";
import { IDBFactory } from "fake-indexeddb";
import { publishOwnerTrack, loadOwnerTrack } from "../app/publication.js";
import { profiledInput, rivalBehavior } from "../app/ai-profile.js";
import { TrackDocument } from "../app/track-document.js";
import { resultInvitation } from "../app/sharing.js";
import { retainEvidence } from "./evidence.mjs";
const content = await loadContent();
const track = compile(content.tracks[0].track),
  spec = assemble(STARTER, content.parts);
const control = { throttle: 1, brake: 0, steer: 0 };
function cornerRun({
  disrupt,
  lap = 0,
  speed = 15,
  car = createCar(spec, track.grid[0]),
} = {}) {
  const bend = track.source.pieces.find((p) => p.kind === "quarter");
  car.lap = lap;
  car.lastGate = 1;
  car.nextGate = 2;
  for (let local = 1; local < pieceLength(bend); local++) {
    const p = pointAtPiece(bend, local);
    Object.assign(car, p, {
      vx: Math.cos(p.heading) * speed,
      vz: Math.sin(p.heading) * speed,
    });
    let input = control;
    if (local === 20) input = disrupt?.(car) || control;
    recordDriving(car, track, input, local / 15, DT);
  }
  return car;
}
test("E2 clean exits award six at most once per bend/lap; contacts, reverse, reset and sliding invalidate", () => {
  const car = cornerRun();
  assert.equal(car.insights.cleanExits, 1);
  assert.equal(car.charge, 66);
  cornerRun({ car });
  assert.equal(car.charge, 66, "repeat traversal cannot farm this lap");
  cornerRun({ car, lap: 1 });
  assert.equal(car.charge, 72);
  for (const disrupt of [
    (c) => {
      c.contacts++;
    },
    (c) => {
      c.resets++;
    },
    (c) => {
      c.resetTime = 2;
    },
    (c) => {
      c.nextGate = 1;
    },
    (c) => {
      c.x += 100;
    },
    (c) => {
      c.vx *= -1;
      c.vz *= -1;
    },
    () => ({ ...control, handbrake: true }),
  ]) {
    const invalid = cornerRun({ disrupt });
    assert.equal(invalid.insights.cleanExits, 0);
    assert.equal(invalid.charge, 60);
  }
  const full = createCar(spec, track.grid[0]);
  assert.equal(cornerRun({ speed: 10 }).insights.cleanExits, 0);
  full.charge = 99;
  cornerRun({ car: full });
  assert.equal(full.charge, 100);
  assert.match(full.insights.feedback, /\+1 BOOST/);
});
test("E1 sustained contact is one incident and coaching uses the actual compatible sector loss", () => {
  const c = createCar(spec, track.grid[0]);
  for (let i = 0; i < 120; i++) {
    c.contacts++;
    recordDriving(c, track, {}, i * DT, DT);
  }
  assert.equal(c.insights.incidents, 1);
  for (let i = 0; i < 80; i++) recordDriving(c, track, {}, i * DT, DT);
  c.contacts++;
  recordDriving(c, track, {}, 3, DT);
  assert.equal(c.insights.incidents, 2);
  const result = {
    sectors: [{ lap: 1, order: 2, durationMs: 6500 }],
    incidents: 2,
    resets: 0,
  };
  assert.match(
    coaching(result, { sectors: [{ lap: 1, order: 2, durationMs: 6100 }] }),
    /Lap 2, sector 2: 0.40s/,
  );
  assert.match(coaching(result, null), /2 contact incidents/);
  assert.deepEqual(nextGoal(110, { bronze: 120, silver: 100, gold: 90 }), {
    achieved: "bronze",
    next: { tier: "silver", ms: 100 },
    gapMs: 10,
  });
  assert.equal(
    nextGoal(90, { bronze: 120, silver: 100, gold: 90 }).achieved,
    "gold",
  );
});
test("E1/E3 every shipped target reproduces a clean ordinary-control finish and ordered medals", async () => {
  const rows = [];
  for (const target of content.targets) {
    const source = content.tracks.find(
      (t) => t.track.slug === target.slug,
    ).track;
    assert.equal(await hash(gameplay(source)), target.trackRevision);
    assert.equal(target.rulesRevision, RULES);
    assert.ok(
      target.runs.gold.result.elapsedMs < target.runs.silver.result.elapsedMs,
    );
    assert.ok(
      target.runs.silver.result.elapsedMs < target.runs.bronze.result.elapsedMs,
    );
    for (const [tier, pace] of [
      ["bronze", 0.65],
      ["silver", 0.83],
      ["gold", 1],
    ]) {
      const t = compile(source),
        c = createCar(spec, t.grid[0]);
      const r = {
        state: "racing",
        time: 0,
        tick: 0,
        track: t,
        laps: 3,
        cars: [c],
        ghost: [],
        difficulty: "expert",
        seed: 1,
        build: STARTER,
      };
      while (r.state === "racing") {
        const input = aiInput(c, t, "expert", pace, []);
        if (tier === "bronze") input.boost = false;
        stepRace(r, input);
      }
      assert.equal(r.dnf, false);
      assert.equal(c.resets, 0);
      assert.equal(c.insights.incidents, 0);
      assert.equal(
        Math.round(r.time * 1000),
        target.runs[tier].result.elapsedMs,
      );
      assert.equal(r.ghost.length, target.runs[tier].ghost.length);
      for (let i = 0; i < r.ghost.length; i += 173)
        r.ghost[i].forEach((v, n) =>
          assert.ok(Math.abs(v - target.runs[tier].ghost[i][n]) <= 0.000051),
        );
      assert.ok(c.sectors.length >= 18);
      assert.equal(
        c.sectors.reduce((sum, s) => sum + s.durationMs, 0),
        Math.round(r.time * 1000),
      );
      rows.push({
        slug: target.slug,
        tier,
        elapsedMs: Math.round(r.time * 1000),
        cleanExits: c.insights.cleanExits,
        incidents: c.insights.incidents,
      });
    }
    const strip = source.props.filter((p) => p.kind === "pad").at(-1);
    assert.equal(surfaceAt(compile(source), strip.x, strip.z), "gravel");
    assert.match(source.description, /asphalt/);
    assert.ok(source.props.filter((p) => p.kind === "light").length >= 2);
  }
  await retainEvidence(
    new URL("../audit/engagement-target-replays.json", import.meta.url),
    JSON.stringify(rows, null, 2),
  );
});
test("E4 same-section comparison is repeatable, differentiates builds and does not unlock parts", async () => {
  const before = freshProgress();
  const rows = BUILD_PRESETS.map((p) => ({
    name: p.name,
    ...measureBuild(track.source, p.build, content.parts),
  }));
  assert.ok(new Set(rows.map((r) => r.meters)).size > 1);
  assert.deepEqual(
    measureBuild(track.source, BUILD_PRESETS[0].build, content.parts),
    measureBuild(track.source, BUILD_PRESETS[0].build, content.parts),
  );
  for (const p of BUILD_PRESETS)
    assert.ok(Object.values(assemble(p.build, content.parts)).length);
  assert.ok(
    BUILD_PRESETS.some((p) =>
      Object.values(assemble(p.build, content.parts)).some(
        (part) => part?.unlock && !unlocked(part, before),
      ),
    ),
  );
  assert.deepEqual(before, freshProgress());
  await retainEvidence(
    new URL("../audit/engagement-build-comparison.json", import.meta.url),
    JSON.stringify(rows, null, 2),
  );
});
test("E5 rival strategies produce different legal inputs, deterministic reactions and bounded lanes", () => {
  const t = compile(track.source),
    straight = t.samples.find((p) => p.s > 75 && p.s < 100);
  const cars = ["bea", "kit", "mags"].map((id, i) => {
    const c = createCar(spec, straight, id, i);
    c.vx = 22;
    c.charge = 60;
    return c;
  });
  const plan = cars.map((c) => aiInput(c, t, "expert", 1, cars));
  assert.notDeepEqual(plan[0], plan[1]);
  assert.equal(
    aiInput(cars[2], t, "expert", 1, []).boost,
    false,
    "Mags reserves a partial tank without a passing target",
  );
  for (const input of plan) {
    assert.ok(
      Math.abs(input.steer) <= 1 &&
        input.throttle >= 0 &&
        input.throttle <= 1 &&
        input.brake >= 0 &&
        input.brake <= 1,
    );
  }
  for (const id of ["bea", "kit", "mags"]) {
    const a = createCar(spec, straight, id),
      b = structuredClone(a);
    const race = { difficulty: "club", seed: 17, time: 0 };
    assert.deepEqual(
      profiledInput(a, race, () => aiInput(a, t)),
      profiledInput(b, race, () => aiInput(b, t)),
    );
    assert.deepEqual(a.spec, spec);
    assert.ok(
      rivalBehavior(id).description.includes(
        id === "bea" ? "Bea" : id === "kit" ? "Kit" : "Mags",
      ),
    );
  }
});
test("E6 challenge HTML round-trips fixed setup, refuses stale targets, and duplication requires a new run", async () => {
  const t = structuredClone(track.source);
  const result = content.targets[0].runs.gold.result;
  t.challenge = targetFromResult(t, result, "Ada & Co", {
    assist: false,
    autoAccelerate: false,
  });
  const decoded = parseTrack(serializeTrack(t), DOMParser);
  assert.deepEqual(decoded, t);
  const doc = new DOMParser().parseFromString(
    "<div id='source'></div>",
    "text/html",
  );
  const owner = new TrackDocument(doc.querySelector("div"), DOMParser);
  owner.replace(t);
  assert.equal(
    parseTrack(owner.html(), DOMParser).challenge.creator,
    "Ada & Co",
  );
  const fixed = await resolveChallenge(decoded, content.parts);
  assert.deepEqual(fixed.build, STARTER);
  assert.equal(fixed.targetMs, result.elapsedMs);
  assert.equal(duplicateTrack(t).challenge, undefined);
  const imported = await importTrackCopy(decoded, content.parts);
  assert.notEqual(imported.id, t.id);
  assert.equal(imported.challenge.creator, "Ada & Co");
  assert.equal(
    (await resolveChallenge(imported, content.parts)).targetMs,
    result.elapsedMs,
  );
  const altered = structuredClone(t);
  altered.patches[0].start++;
  await assert.rejects(resolveChallenge(altered, content.parts), /older track/);
  await assert.rejects(importTrackCopy(altered, content.parts), /older track/);
  const old = structuredClone(t);
  old.challenge.rulesRevision = "scrap-physics-v1.1.0";
  await assert.rejects(resolveChallenge(old, content.parts), /older track/);
  const changedParts = structuredClone(content.parts);
  changedParts.find((p) => p.id === STARTER.engine).mass++;
  await assert.rejects(
    resolveChallenge(t, changedParts),
    /older car specifications/,
  );
  assert.throws(
    () => targetFromResult(t, { ...result, dnf: true }, "Ada", {}),
    /Finish a valid/,
  );
  assert.ok(challengeErrors({ ...t.challenge, targetMs: NaN }).length);
  assert.ok(challengeErrors({ ...t.challenge, engine: "script" }).length);
  const invite = resultInvitation(result, {
    crew: { slug: "yard-loop", tier: "bronze" },
  });
  assert.match(invite.url, /#crew=yard-loop:bronze$/);
  assert.notEqual(
    comparisonKey({
      mode: "workshop",
      trackRevision: "a",
      buildRevision: "b",
      laps: 3,
      assist: "off",
      challenge: fixed.challenge,
    }),
    comparisonKey({
      mode: "workshop",
      trackRevision: "a",
      buildRevision: "b",
      laps: 3,
      assist: "off",
    }),
  );
});
test("E6 imported challenge survives database reopen and owner publication round-trip without score submission", async () => {
  const source = structuredClone(track.source);
  source.challenge = targetFromResult(
    source,
    content.targets[0].runs.gold.result,
    "Fixture Crew",
    { assist: false, autoAccelerate: false },
  );
  const imported = await importTrackCopy(source, content.parts);
  const factory = new IDBFactory();
  let store = await openStore({ factory });
  await store.set("draft:" + imported.id, {
    version: 1,
    revision: 1,
    updatedAt: new Date().toISOString(),
    track: imported,
  });
  store.close();
  store = await openStore({ factory });
  const saved = await store.get("draft:" + imported.id);
  assert.deepEqual(saved.track.challenge, imported.challenge);
  assert.equal(
    (await resolveChallenge(saved.track, content.parts)).creator,
    "Fixture Crew",
  );
  let html = null,
    puts = 0;
  const fetcher = async (url, opts = {}) => {
    if (opts.method === "MKCOL") return new Response(null, { status: 201 });
    if (url.endsWith("/catalog.html"))
      return new Response(null, { status: 503 });
    if (opts.method === "PUT") {
      html = opts.body;
      puts++;
      return new Response(null, { status: 201 });
    }
    return html
      ? new Response(html, { headers: { ETag: '"fixture1"' } })
      : new Response(null, { status: 404 });
  };
  const publication = await publishOwnerTrack(imported, "pk_fixture", null, {
    Parser: DOMParser,
    fetcher,
  });
  const readback = await loadOwnerTrack(imported.id, "fixture-only", {
    Parser: DOMParser,
    fetcher,
  });
  assert.equal(puts, 1);
  assert.equal(publication.state, "Published");
  assert.equal(
    (await resolveChallenge(readback.track, content.parts)).targetMs,
    imported.challenge.targetMs,
  );
  store.close();
});

test("E3 inside line has a measured payoff and lower-grip exposure on three legal corridors", async () => {
  const rows = [];
  for (const target of content.targets) {
    const source = content.tracks.find(
      (t) => t.track.slug === target.slug,
    ).track;
    const bend = source.patches.at(-2).pieceId,
      exit = source.patches.at(-1).pieceId;
    for (const build of [STARTER, BUILD_PRESETS[2].build]) {
      const pair = [];
      for (const choice of ["safe", "inside"]) {
        const t = compile(source),
          car = createCar(assemble(build, content.parts), t.grid[0]);
        const r = {
          state: "racing",
          time: 0,
          tick: 0,
          track: t,
          laps: 1,
          cars: [car],
          ghost: [],
          difficulty: "expert",
          seed: 1,
        };
        let gravel = 0,
          pads = 0;
        while (r.state === "racing") {
          const input = aiInput(car, t, "expert", 0.9, []),
            q = nearest(t, car.x, car.z),
            speed = Math.hypot(car.vx, car.vz);
          const goal = atDistance(t, q.s + 8 + speed * 0.65),
            local = nearest(t, goal.x, goal.z);
          const lane =
            choice === "inside" &&
            (local.pieceId === bend ||
              (local.pieceId === exit && local.local < 35))
              ? 3.1
              : 0;
          goal.x -= Math.sin(goal.heading) * lane;
          goal.z += Math.cos(goal.heading) * lane;
          const error = wrap(
              Math.atan2(goal.z - car.z, goal.x - car.x) - car.heading,
            ),
            look = Math.hypot(goal.x - car.x, goal.z - car.z);
          const angle = Math.atan2(
              2 * car.spec.chassis.wheelbase * Math.sin(error),
              look,
            ),
            limit =
              (car.spec.chassis.steer * Math.PI) / 180 / (1 + speed * 0.055);
          input.steer = clamp((angle / limit) * 1.45, -1, 1);
          stepRace(r, input);
          if (car.surface === "gravel") gravel += DT;
          if (car.padTime > 0) pads += DT;
        }
        assert.equal(r.dnf, false);
        assert.equal(car.resets, 0);
        assert.equal(car.insights.incidents, 0);
        pair.push({
          slug: target.slug,
          tires: build.tires,
          choice,
          elapsedMs: Math.round(r.time * 1000),
          gravel,
          pads,
        });
      }
      assert.ok(pair[1].elapsedMs < pair[0].elapsedMs);
      assert.ok(pair[1].gravel > pair[0].gravel);
      assert.ok(pair[1].pads > pair[0].pads + 0.9);
      rows.push(...pair);
    }
  }
  await retainEvidence(
    new URL("../audit/engagement-line-choices.json", import.meta.url),
    JSON.stringify(rows, null, 2),
  );
});

test("E1 saved telemetry is bounded and legacy results remain readable", async () => {
  const store = await openStore({ factory: new IDBFactory() });
  const result = {
    ...structuredClone(content.targets[0].runs.gold.result),
    id: "telemetry-fixture",
    key: "telemetry-fixture",
  };
  for (const mutate of [
    (r) => {
      r.sectors[0].durationMs++;
    },
    (r) => {
      r.sectors = Array(301).fill(r.sectors[0]);
    },
    (r) => {
      r.incidents = NaN;
    },
    (r) => {
      r.sectors[0].stoppedMs = 900000;
    },
  ]) {
    const bad = structuredClone(result);
    mutate(bad);
    await assert.rejects(store.commitResult(bad, null), /telemetry/);
    assert.equal(await store.get("result:" + bad.id), undefined);
  }
  const legacy = structuredClone(result);
  delete legacy.sectors;
  delete legacy.incidents;
  delete legacy.cleanExits;
  await store.commitResult(legacy, null);
  assert.equal(
    (await store.get("result:" + legacy.id)).elapsedMs,
    legacy.elapsedMs,
  );
  store.close();
});
