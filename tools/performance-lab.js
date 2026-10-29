export async function measurePerformance(
  prefix,
  content,
  output,
  duration = 1200000,
) {
  const [
    { World },
    { compile },
    { assemble, STARTER },
    { createCar, aiInput, stepRace, DT },
    { defaultSettings },
  ] = await Promise.all(
    [
      "renderer.js",
      "track.js",
      "builds.js",
      "simulation.js",
      "preferences.js",
    ].map((p) => import(prefix + p)),
  );
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "display:block;width:100%;height:720px";
  document.body.append(canvas);
  canvas.scrollIntoView({ block: "start" });
  const world = new World(canvas),
    settings = defaultSettings({}),
    samples = [],
    work = [],
    simulations = [],
    renders = [],
    sceneLoads = [],
    heaps = [],
    budgets = { calls: 0, triangles: 0 },
    start = performance.now();
  let race,
    segment = -1,
    last = 0,
    frames = 0,
    hidden = 0,
    accumulator = 0,
    cycles = 0;
  const load = (index) => {
    const loadStart = performance.now();
    const track = compile(content.tracks[index % 12].track);
    race = {
      id: "performance-fixture",
      state: "racing",
      mode: "exhibition",
      track,
      difficulty: "club",
      seed: 811 + index,
      laps: 3,
      time: 0,
      tick: 0,
      ghost: [],
      cars: ["player", ...content.rivals.slice(0, 5).map((r) => r.id)].map(
        (id, i) =>
          createCar(
            assemble(i ? content.rivals[i - 1] : STARTER, content.parts),
            track.grid[i],
            id,
            i,
          ),
      ),
    };
    world.load(track);
    world.setCars(race.cars);
    world.render(race, "race", settings, 0);
    sceneLoads.push({ index, durationMs: performance.now() - loadStart });
    accumulator = 0;
  };
  try {
    await new Promise((resolve, reject) => {
      const frame = (now) => {
        try {
          const elapsed = Math.max(0, now - start);
          if (elapsed >= duration) {
            resolve();
            return;
          }
          const index = Math.floor(elapsed / 30000);
          if (!race || index !== segment) {
            segment = index;
            load(index);
            cycles++;
            heaps.push({
              ms: elapsed,
              heap: performance.memory?.usedJSHeapSize ?? null,
              geometries: world.renderer.info.memory.geometries,
              textures: world.renderer.info.memory.textures,
            });
            last = now;
          }
          const gap = last ? now - last : 0;
          last = now;
          if (document.hidden) {
            hidden += gap;
            requestAnimationFrame(frame);
            return;
          }
          if (frames > 20 && gap > 0) samples.push(gap);
          const began = performance.now();
          accumulator += Math.min(0.1, gap / 1000);
          let steps = 0;
          while (accumulator >= DT && steps < 8 && race.state === "racing") {
            stepRace(
              race,
              aiInput(race.cars[0], race.track, "club", 1, race.cars),
            );
            accumulator -= DT;
            steps++;
          }
          if (race.state === "finished") load(index);
          simulations.push(performance.now() - began);
          const renderStart = performance.now();
          world.render(race, "race", settings, gap / 1000);
          renders.push(performance.now() - renderStart);
          work.push(performance.now() - began);
          frames++;
          budgets.calls = Math.max(
            budgets.calls,
            world.renderer.info.render.calls,
          );
          budgets.triangles = Math.max(
            budgets.triangles,
            world.renderer.info.render.triangles,
          );
          if (frames % 120 === 0)
            output.textContent = `Performance lab: ${Math.floor(elapsed / 1000)} / ${duration / 1000} seconds · ${cycles} scenes · ${frames} frames`;
          requestAnimationFrame(frame);
        } catch (error) {
          reject(error);
        }
      };
      requestAnimationFrame(frame);
    });
    const percentile = (list, p) =>
      [...list].sort((a, b) => a - b)[Math.floor((list.length - 1) * p)] ??
      null;
    return {
      durationMs: performance.now() - start,
      hiddenMs: hidden,
      frames,
      sceneCycles: cycles,
      longestFrameMs: samples.reduce((maximum, ms) => Math.max(maximum, ms), 0),
      framesOver50Ms: samples.filter((ms) => ms > 50).length,
      framesOver1000Ms: samples.filter((ms) => ms > 1000).length,
      sceneLoads,
      viewport: { width: canvas.clientWidth, height: canvas.clientHeight },
      visibleCanvas: (() => {
        const r = canvas.getBoundingClientRect();
        return {
          left: r.left,
          top: r.top,
          right: r.right,
          bottom: r.bottom,
          windowWidth: innerWidth,
          windowHeight: innerHeight,
        };
      })(),
      p95FrameMs: percentile(samples, 0.95),
      p99FrameMs: percentile(samples, 0.99),
      p95WorkMs: percentile(work, 0.95),
      p99WorkMs: percentile(work, 0.99),
      p95SimulationMs: percentile(simulations, 0.95),
      p95RenderMs: percentile(renders, 0.95),
      budgets,
      heaps,
      scope:
        "Available-browser WebGL and real six-car fixed-step simulation with legal AI input; no stored rewards, no hardware/human requirement",
      withinFrameBudget:
        percentile(samples, 0.95) <= 20 && percentile(samples, 0.99) <= 33,
    };
  } finally {
    world.clear();
    world.renderer.dispose();
    canvas.remove();
  }
}
