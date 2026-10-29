// Available-browser scheduling measurement through the real app frame loop.
export async function soak({ api, frame, prefix, output }) {
  const { aiInput } = await import(prefix + "simulation.js");
  const duration = 1200000,
    intervals = [],
    loads = [],
    resources = [],
    longTasks = [];
  let last = 0,
    frames = 0,
    hiddenMs = 0,
    maxTrails = 0,
    segment = -1;
  const originalTransport = api.boards.fetcher;
  api.boards.fetcher = async () => {
    throw Error("Soak isolates public transport");
  };
  frame.style.width = "1280px";
  frame.style.height = "720px";
  frame.scrollIntoView({ block: "start" });
  Object.assign(api.settings, {
    touch: false,
    sound: false,
    reducedMotion: false,
    safeGraphics: false,
  });
  api.applyPreferences();
  api.setController(() =>
    aiInput(api.race.cars[0], api.race.track, "club", 1, api.race.cars),
  );
  let observer;
  try {
    observer = new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        longTasks.push({ start: e.startTime, duration: e.duration });
    });
    observer.observe({ type: "longtask" });
  } catch {}
  const start = performance.now();
  try {
    await new Promise((resolve, reject) => {
      const tick = async (now) => {
        try {
          const elapsed = now - start,
            gap = last ? now - last : 0;
          last = now;
          if (document.hidden) hiddenMs += gap;
          if (frames > 20 && gap > 0) intervals.push(gap);
          if (elapsed >= duration) {
            resolve();
            return;
          }
          const next = Math.floor(elapsed / 30000);
          if (next !== segment) {
            segment = next;
            const began = performance.now();
            await api.startTrack(next % 12, "exhibition", { seed: 811 + next });
            loads.push({ track: next % 12, ms: performance.now() - began });
            resources.push({
              ms: elapsed,
              heap: performance.memory?.usedJSHeapSize ?? null,
              canvas: [api.world.canvas.width, api.world.canvas.height],
              cars: api.world.sourceCars.length,
            });
          }
          if (api.race.state === "paused")
            throw Error("Soak interrupted: race paused");
          if (api.view !== "race") throw Error("Soak unexpectedly left racing");
          maxTrails = Math.max(maxTrails, api.world.trails.length);
          if (api.world.trails.length > 360)
            throw Error("Trail pool exceeded bound");
          if (++frames % 120 === 0)
            output.textContent = `Twenty-minute live-loop soak: ${Math.floor(elapsed / 1000)} / 1200 s · ${loads.length} scenes · ${frames} frames`;
          requestAnimationFrame(tick);
        } catch (error) {
          reject(error);
        }
      };
      requestAnimationFrame(tick);
    });
    const sorted = [...intervals].sort((a, b) => a - b),
      p = (n) => sorted[Math.ceil(n * sorted.length) - 1];
    const result = {
      release: prefix.split("/").filter(Boolean).at(-1),
      utc: new Date().toISOString(),
      userAgent: navigator.userAgent,
      durationMs: performance.now() - start,
      frames,
      hiddenMs,
      sceneCycles: loads.length,
      p95FrameMs: p(0.95),
      p99FrameMs: p(0.99),
      longestFrameMs: sorted.at(-1),
      framesOver50Ms: intervals.filter((n) => n > 50).length,
      maxTrails,
      loads,
      resources,
      longTasks,
      intervals,
      scope:
        "Real application requestAnimationFrame, fixed-step simulation, HUD and Canvas2D rendering; legal injected controller; actual canvas allocations retained. The initial 2026-10-17 run inherited the repaired renderer at 1x resolution despite resetting the setting; default resolution is measured separately. Scheduling intervals, not physical input latency or GPU timing",
      passed:
        hiddenMs === 0 && p(0.95) <= 20 && p(0.99) <= 33 && loads.length >= 40,
    };
    const saved = await fetch("/__audit__/soak-receipt", {
      method: "POST",
      body: JSON.stringify(result),
    });
    if (!saved.ok) throw Error("Could not retain soak receipt");
    if (!result.passed)
      throw Error(
        `Soak missed target: p95 ${p(0.95)}, p99 ${p(0.99)}, hidden ${hiddenMs}`,
      );
    const { intervals: raw, ...summary } = result;
    return summary;
  } finally {
    observer?.disconnect();
    api.setController(null);
    api.boards.fetcher = originalTransport;
    api.pause();
  }
}

export async function defaultQualityRace({ api, frame, prefix, output }) {
  const { aiInput } = await import(prefix + "simulation.js");
  frame.style.width = "1280px";
  frame.style.height = "720px";
  frame.scrollIntoView({ block: "start" });
  Object.assign(api.settings, {
    touch: false,
    sound: false,
    lowEffects: false,
    reducedMotion: false,
  });
  api.applyPreferences();
  await api.repairGraphics(false);
  api.setController(() =>
    aiInput(api.race.cars[0], api.race.track, "club", 1, api.race.cars),
  );
  const gaps = [],
    start = performance.now();
  let last = 0,
    frames = 0,
    hiddenMs = 0;
  try {
    await api.startTrack(0, "exhibition", { seed: 1401 });
    await new Promise((resolve, reject) => {
      const tick = (now) => {
        const gap = last ? now - last : 0;
        last = now;
        if (document.hidden) hiddenMs += gap;
        if (frames++ > 20 && gap > 0) gaps.push(gap);
        if (api.view === "result" && api.race.saved) return resolve();
        if (api.race.state === "paused" || now - start > 300000)
          return reject(
            Error("Default-quality full race interrupted or timed out"),
          );
        if (frames % 120 === 0)
          output.textContent = `Default-resolution full race: ${Math.floor((now - start) / 1000)} s · ${frames} frames`;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const ordered = [...gaps].sort((a, b) => a - b),
      p = (n) => ordered[Math.ceil(ordered.length * n) - 1];
    const receipt = {
      utc: new Date().toISOString(),
      release: prefix.split("/").filter(Boolean).at(-1),
      userAgent: navigator.userAgent,
      devicePixelRatio: devicePixelRatio,
      safeGraphics: api.world.safeGraphics,
      lowEffects: api.settings.lowEffects,
      canvas: [api.world.canvas.width, api.world.canvas.height],
      cssCanvas: [api.world.canvas.clientWidth, api.world.canvas.clientHeight],
      durationMs: performance.now() - start,
      frames,
      hiddenMs,
      p95FrameMs: p(0.95),
      p99FrameMs: p(0.99),
      longestFrameMs: ordered.at(-1),
      cars: api.race.cars.length,
      result: {
        dnf: api.race.result.dnf,
        laps: api.race.result.splits.length,
        elapsedMs: api.race.result.elapsedMs,
        saved: api.race.saved,
      },
      intervals: gaps,
      scope:
        "One complete six-car race through the real app loop at default renderer resolution and full effects; legal injected controller.",
      passed:
        !api.world.safeGraphics &&
        !api.settings.lowEffects &&
        !api.race.result.dnf &&
        api.race.cars.length === 6 &&
        hiddenMs === 0 &&
        p(0.95) <= 20 &&
        p(0.99) <= 33,
    };
    const saved = await fetch("/__audit__/quality-receipt", {
      method: "POST",
      body: JSON.stringify(receipt),
    });
    if (!saved.ok) throw Error("Could not retain default-quality receipt");
    if (!receipt.passed)
      throw Error("Default quality missed its declared frame target");
    const { intervals, ...summary } = receipt;
    return summary;
  } finally {
    api.setController(null);
  }
}
