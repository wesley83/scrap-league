import test from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { IDBFactory } from "fake-indexeddb";
import { openStore, freshProgress } from "../app/storage.js";
import { loadContent } from "../tools/content.mjs";
import { compile } from "../app/track.js";
import { assemble, STARTER, standings } from "../app/builds.js";
import { createCar, aiInput, stepRace, resultOf } from "../app/simulation.js";
import { captureAttempt, resolveAttempt } from "../app/continuation.js";
import { profiledInput, seededValue } from "../app/ai-profile.js";
const content = await loadContent();
test("seeded AI holds legal decisions for its reaction interval and varies reproducibly", () => {
  const c = { id: "bea" },
    race = { time: 0, seed: 53, difficulty: "club" };
  let count = 0;
  const plan = () => {
    count++;
    return { steer: 0.5, throttle: 1, brake: 0, boost: true };
  };
  const first = profiledInput(c, race, plan);
  race.time = 0.1;
  assert.equal(profiledInput(c, race, plan), first);
  assert.equal(count, 1);
  race.time = 0.2;
  profiledInput(c, race, plan);
  assert.equal(count, 2);
  assert.equal(seededValue(53, "bea", 1), seededValue(53, "bea", 1));
  assert.notEqual(seededValue(53, "bea", 1), seededValue(54, "bea", 1));
});
test(
  "continuous twelve-event campaign persists every three-lap race and resumes captured attempts after database reopen",
  { timeout: 600000 },
  async () => {
    const reports = [];
    for (const [seed, difficulty] of [
      [531, "relaxed"],
      [137, "club"],
      [911, "expert"],
    ]) {
      const factory = new IDBFactory();
      let store = await openStore({ factory }),
        progress = freshProgress();
      const rows = [];
      for (let index = 0; index < 12; index++) {
        if (index % 3 === 0)
          progress.cup = {
            id: `cup-${seed}-${index / 3}`,
            index: index / 3,
            seed,
            difficulty,
            rivals: content.rivals.slice(0, 5).map((r) => r.id),
            rounds: [],
            pending: null,
          };
        const entry = content.tracks[index],
          roster = ["player", ...progress.cup.rivals],
          ct = compile(entry.track);
        let r = {
          id: crypto.randomUUID(),
          index,
          mode: "league",
          key: `campaign-${seed}-${index}`,
          state: "racing",
          track: ct,
          trackRevision: entry.revision,
          build: STARTER,
          settingsSnapshot: { assist: false, autoAccelerate: false },
          seed: seed + index,
          difficulty,
          laps: 3,
          time: 0,
          tick: 0,
          ghost: [],
          rivals: progress.cup.rivals,
          cars: roster.map((id, i) => {
            const rival = content.rivals.find((v) => v.id === id),
              car = createCar(
                assemble(rival || STARTER, content.parts),
                ct.grid[i],
                id,
                i,
              );
            car.personality = rival?.pace || 1;
            return car;
          }),
        };
        progress.cup.pending = captureAttempt(r, content.parts);
        await store.set("progress", progress);
        store.close();
        store = await openStore({ factory });
        progress = await store.get("progress");
        const resumed = resolveAttempt(
          progress.cup,
          index,
          { ...entry.track, name: "changed current default" },
          {},
        );
        assert.equal(resumed.seed, seed + index);
        assert.equal(resumed.track.name, entry.track.name);
        while (r.state === "racing")
          stepRace(r, aiInput(r.cars[0], ct, difficulty, 1, r.cars));
        const result = resultOf(r);
        assert.equal(result.dnf, false, `${difficulty} ${entry.track.slug}`);
        assert.equal(result.splits.length, 3);
        const cup = progress.cup.id,
          round = index % 3;
        progress = await store.commitResult(
          result,
          new Float32Array(r.ghost.flat()),
          cup,
          round,
        );
        progress = await store.commitResult(
          result,
          new Float32Array(r.ghost.flat()),
          cup,
          round,
        );
        store.close();
        store = await openStore({ factory });
        progress = await store.get("progress");
        assert.deepEqual(
          progress.completed,
          Array.from({ length: index + 1 }, (_, i) => i + 1),
        );
        assert.equal(progress.cup.rounds.length, round + 1);
        assert.equal(progress.cup.pending, null);
        rows.push({
          track: entry.track.slug,
          laps: 3,
          elapsedMs: result.elapsedMs,
          resets: result.resets,
          contacts: result.contacts,
          performanceDegraded: result.performanceDegraded,
        });
        if (round === 2)
          assert.equal(
            standings(progress.cup.rounds, roster).reduce(
              (sum, row) => sum + row.points,
              0,
            ),
            84,
          );
      }
      assert.equal(new Set(progress.history).size, 12);
      reports.push({
        seed,
        difficulty,
        completed: progress.completed,
        races: rows,
      });
      store.close();
    }
    await writeFile(
      new URL("../audit/remediation-persisted-campaigns.json", import.meta.url),
      JSON.stringify(
        {
          utc: new Date().toISOString(),
          method:
            "Continuous legal-input fixed-step races with fake-indexeddb commit/reopen after every round; not a browser campaign",
          campaigns: reports,
        },
        null,
        2,
      ),
    );
  },
);
