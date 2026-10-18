const frame = document.querySelector("iframe"),
  output = document.querySelector("#results");
const results = [],
  delay = (ms) => new Promise((r) => setTimeout(r, ms));
let api, release, prefix;
const check = (condition, message) => {
  if (!condition) throw Error(message);
};
const waitFor = async (fn, ms = 20000) => {
  const end = performance.now() + ms;
  while (!fn()) {
    if (performance.now() > end) throw Error("Timed out");
    await delay(50);
  }
};
async function connect() {
  await waitFor(() => frame.contentDocument?.querySelector("base"));
  prefix = frame.contentDocument.querySelector("base").href;
  const mod = await frame.contentWindow.eval(
    `import(${JSON.stringify(prefix + "main.js")})`,
  );
  await mod.ready;
  api = mod.review;
  release = prefix.split("/").filter(Boolean).at(-1);
}
await connect();
const doc = () => frame.contentDocument,
  win = () => frame.contentWindow;
async function record(name, fn) {
  output.textContent = "Running " + name;
  const start = performance.now();
  try {
    const details = await fn();
    results.push({
      name,
      status: "passed",
      durationMs: Math.round(performance.now() - start),
      details,
    });
  } catch (e) {
    results.push({ name, status: "failed", error: e.message, stack: e.stack });
  }
  output.textContent = JSON.stringify(results, null, 2);
}
const click = (id) => doc().getElementById(id).click();
const button = (name) =>
  [...doc().querySelectorAll("button")].find(
    (b) => !b.closest("[hidden]") && b.textContent.trim() === name,
  );
function dismiss() {
  if (doc().querySelector("dialog").open) doc().querySelector("dialog").close();
}
async function home() {
  dismiss();
  if (api.race?.state === "racing") api.pause();
  dismiss();
  api.show("start");
  await delay(60);
}
async function runToFinish() {
  const { stepRace, aiInput } = await import(prefix + "simulation.js");
  const { practiceStep } = await import(prefix + "driving-controls.js");
  api.race.state = "racing";
  const r = api.race;
  const start = r.time;
  // The controller drives the same simulation object through normal physics.
  // Accelerated ticks are not a browser latency or human enjoyment measurement.
  while (r.state === "racing" && r.time - start < 480) {
    for (let i = 0; i < 240 && r.state === "racing"; i++) {
      const p = r.cars.find((c) => c.id === "player"),
        controls = aiInput(p, r.track, "club", 1, r.cars);
      if (r.practice && r.tick % 240 < 60 && Math.abs(controls.steer) < 0.1)
        controls.boost = true;
      stepRace(r, controls);
      practiceStep(r.practice, p, controls);
    }
    await delay(0);
  }
  check(!r.dnf, "Controller did not finish");
  await api.finish();
  check(api.view === "result" && r.saved, "Result not persisted");
  return {
    elapsedMs: r.result.elapsedMs,
    laps: r.result.splits.length,
    place: r.result.classification.findIndex((c) => c.id === "player") + 1,
    contacts: r.result.contacts,
  };
}
const actions = {
  "Quick race journey": async () => {
    await home();
    const before = JSON.stringify(api.progress.completed);
    click("quick-race");
    await waitFor(() => api.view === "race");
    check(
      api.race.laps === 2 && api.race.cars.length === 6,
      "Quick race contract",
    );
    click("pause-button");
    const t = api.race.time;
    await delay(180);
    check(api.race.time === t, "Pause clock moved");
    button("Resume").click();
    await waitFor(() => api.race.state !== "resuming");
    const finish = await runToFinish();
    check(
      JSON.stringify(api.progress.completed) === before,
      "Quick race changed campaign",
    );
    button("Race again").click();
    await waitFor(() => api.race.state === "countdown");
    check(api.race.time === 0, "Retry clock");
    api.pause();
    return { finish, pauseAndRetry: true, simulationController: true };
  },
  "Input ownership and camera": async () => {
    await home();
    api.settings.touch = true;
    api.settings.autoAccelerate = true;
    api.applyPreferences();
    click("quick-race");
    await waitFor(() => api.view === "race");
    api.race.state = "racing";
    const send = (el, type, id, x = 0) =>
      el.dispatchEvent(
        new (win().PointerEvent)(type, {
          pointerId: id,
          pointerType: "touch",
          clientX: x,
          buttons: type === "pointerdown" ? 1 : 0,
          bubbles: true,
        }),
      );
    // Synthetic contacts cannot acquire native capture. Stub only the native
    // capture call; handlers, ownership, state and cancellation are real.
    const boost = doc().querySelector('[data-hold="boost"]'),
      brake = doc().querySelector('[data-hold="brake"]');
    const originals = [boost, brake].map((el) => el.setPointerCapture);
    for (const el of [boost, brake]) el.setPointerCapture = () => {};
    send(boost, "pointerdown", 10);
    send(brake, "pointerdown", 11);
    check(api.input().boost && api.input().brake === 1, "Two contacts lost");
    send(brake, "pointercancel", 11);
    check(
      api.input().boost && api.input().brake === 0,
      "Cancel affected other thumb",
    );
    api.pause();
    check(!api.input().boost, "Pause left held boost");
    [boost, brake].forEach((el, i) => (el.setPointerCapture = originals[i]));
    dismiss();
    const before = {
      x: api.race.cars[0].x,
      z: api.race.cars[0].z,
      time: api.race.time,
    };
    const sizes = [];
    for (const [w, h] of [
      [320, 568],
      [390, 844],
      [412, 915],
      [568, 320],
      [844, 390],
      [1280, 720],
    ]) {
      frame.style.width = w + "px";
      frame.style.height = h + "px";
      await delay(80);
      api.world.render(api.race, "race", api.settings, 0);
      const boxes = {};
      for (const selector of [
        "#world",
        "#pause-button",
        "#steering-pad",
        '[data-hold="brake"]',
        '[data-hold="handbrake"]',
        '[data-hold="boost"]',
      ]) {
        const e = doc().querySelector(selector),
          r = e.getBoundingClientRect();
        boxes[selector] = { x: r.x, y: r.y, w: r.width, h: r.height };
        check(r.width > 0 && r.height > 0, "Invisible " + selector);
        check(
          r.left >= -1 && r.right <= w + 1 && r.top >= -1 && r.bottom <= h + 1,
          "Clipped " + selector + " at " + w + "x" + h,
        );
        if (selector !== "#world")
          check(r.width >= 44 && r.height >= 44, "Small target " + selector);
      }
      const c = boxes["#world"],
        p = boxes["#steering-pad"];
      check(c.y + c.h <= p.y, "Touch controls cover play");
      const canvas = doc().querySelector("#world"),
        pixels = canvas
          .getContext("2d")
          .getImageData(0, 0, canvas.width, canvas.height).data;
      const colors = new Set();
      for (let i = 0; i < pixels.length; i += 1024)
        colors.add(pixels[i] + "," + pixels[i + 1] + "," + pixels[i + 2]);
      check(colors.size > 8, "Blank race surface");
      sizes.push({
        w,
        h,
        boxes,
        colors: colors.size,
        backing: [canvas.width, canvas.height],
      });
    }
    check(
      api.race.time === before.time && api.race.cars[0].x === before.x,
      "Rendering changed simulation",
    );
    return { sizes, syntheticPointerFixture: true };
  },
  "Manual throttle layout": async () => {
    await home();
    api.settings.touch = true;
    api.settings.autoAccelerate = false;
    api.applyPreferences();
    click("quick-race");
    await waitFor(() => api.view === "race");
    api.pause();
    dismiss();
    const sizes = [];
    for (const [w, h] of [
      [320, 568],
      [390, 844],
      [568, 320],
      [844, 390],
    ]) {
      frame.style.width = w + "px";
      frame.style.height = h + "px";
      await delay(80);
      const targets = [
        ...doc().querySelectorAll("#touch-controls [data-hold]"),
      ].filter((e) => e.getBoundingClientRect().width > 0);
      check(
        targets.some((e) => e.dataset.hold === "throttle"),
        "Manual GAS missing",
      );
      const bounds = targets.map((e) => ({
        action: e.dataset.hold,
        box: e.getBoundingClientRect(),
      }));
      for (const { action, box: r } of bounds)
        check(
          r.width >= 44 &&
            r.height >= 44 &&
            r.left >= 0 &&
            r.right <= w &&
            r.top >= 0 &&
            r.bottom <= h,
          "Manual control clipped: " + action + " at " + w + "x" + h,
        );
      sizes.push({ w, h, actions: bounds.map((b) => b.action) });
    }
    return { sizes };
  },
  "Leaderboard browse": async () => {
    await home();
    click("leaderboard-button");
    await waitFor(
      () =>
        doc().querySelector("#board-state")?.textContent !== "Loading times…",
    );
    const trial = doc().querySelector("#board-state").textContent;
    check(!trial.startsWith("Times unavailable"), trial);
    const mode = doc().querySelector("#board-mode");
    mode.value = "daily";
    mode.dispatchEvent(new (win().Event)("change"));
    await waitFor(
      () =>
        doc().querySelector("#board-state").textContent !== "Loading times…",
    );
    const daily = doc().querySelector("#board-state").textContent;
    check(!daily.startsWith("Times unavailable"), daily);
    dismiss();
    return {
      trial,
      daily,
      scope:
        "Anonymous read of the configured public boards; no synthetic score posted",
    };
  },
  "Workshop round trip": async () => {
    await home();
    frame.style.width = "1100px";
    frame.style.height = "800px";
    await api.openWorkshop();
    const w = api.workshop;
    await w.flush();
    const original = w.track.name;
    const input = doc().querySelector("#track-name");
    input.value = "Remake verification circuit";
    input.dispatchEvent(new (win().Event)("change"));
    await w.flush();
    click("work-undo");
    check(w.track.name === original, "Undo failed");
    click("work-redo");
    check(w.track.name === "Remake verification circuit", "Redo failed");
    await w.flush();
    doc().querySelector("#road-surface").value = "gravel";
    click("apply-surface");
    check(
      w.track.patches.some((p) => p.surface === "gravel"),
      "Surface edit failed",
    );
    click("work-undo");
    click("work-redo");
    await w.flush();
    check(
      w.sourceDocument.root.querySelector('[itemprop="surface"]')
        ?.textContent === "gravel",
      "DOM source did not receive edit",
    );
    const saved = await api.store.get("draft:" + w.track.id);
    check(saved.track.name === w.track.name, "Draft not durable");
    const { serializeTrack, parseTrack } = await import(prefix + "model.js"),
      { compile } = await import(prefix + "track.js");
    const roundtrip = parseTrack(serializeTrack(w.track));
    check(compile(roundtrip).valid, "Export/import invalid");
    const id = w.track.id;
    click("work-test");
    await waitFor(() => api.view === "race");
    click("pause-button");
    button("Return to editor").click();
    check(
      api.view === "workshop" && w.track.id === id,
      "Test drive lost draft",
    );
    await w.open(saved.track, saved);
    check(w.track.name === saved.track.name, "Reload lost draft");
    return {
      id,
      valid: true,
      undoRedo: true,
      durable: true,
      exportImport: true,
      testReturn: true,
    };
  },
  "Practice and ghost": async () => {
    await home();
    api.settings.touch = false;
    api.settings.autoAccelerate = false;
    api.applyPreferences();
    click("lesson-button");
    await waitFor(() => api.view === "race");
    const practice = await runToFinish();
    const learned = { ...api.race.practice };
    check(
      learned.accelerate && learned.steer && learned.brake && learned.boost,
      "Practice skills not observed",
    );
    await home();
    await api.startTrack(0, "trial");
    const previous = api.race.previousBest?.elapsedMs ?? Infinity;
    const first = await runToFinish();
    button("Race again").click();
    await waitFor(() => api.race.state === "countdown");
    check(api.race.bestGhost?.length > 0, "Compatible ghost missing");
    check(
      api.race.previousBest.elapsedMs === Math.min(previous, first.elapsedMs),
      "Best time mismatch",
    );
    api.pause();
    return {
      practice,
      learned,
      trial: first,
      ghostFrames: api.race.bestGhost.length / 4,
    };
  },
  "All tracks and recovery": async () => {
    await home();
    frame.style.width = "1280px";
    frame.style.height = "720px";
    const { compile } = await import(prefix + "track.js");
    const rows = [];
    for (const item of api.content.tracks) {
      const c = compile(item.track);
      api.world.load(c);
      api.world.setCars([]);
      api.world.render(null, "start", api.settings, 0);
      check(api.world.available(), "Renderer failed " + item.track.name);
      rows.push({
        name: item.track.name,
        valid: c.valid,
        samples: c.samples.length,
      });
    }
    click("quick-race");
    await waitFor(() => api.view === "race");
    api.pause();
    dismiss();
    const id = api.race.id,
      time = api.race.time;
    api.world.fail("Injected canvas failure");
    await api.repairGraphics(true);
    check(
      api.race.id === id && api.race.time === time && api.world.available(),
      "Recovery changed race or stayed blank",
    );
    return { tracks: rows, recovery: true };
  },
  "Render budget": async () => {
    await home();
    frame.style.width = "1280px";
    frame.style.height = "720px";
    click("quick-race");
    await waitFor(() => api.view === "race");
    api.pause();
    dismiss();
    const times = [];
    for (let i = 0; i < 180; i++) {
      const start = performance.now();
      api.world.render(api.race, "race", api.settings, 1 / 60);
      times.push(performance.now() - start);
      await new Promise((r) => requestAnimationFrame(r));
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)];
    check(p95 < 16.7, "Renderer exceeds 16.7ms p95");
    return {
      frames: times.length,
      medianMs: times[90],
      p95Ms: p95,
      maxMs: times.at(-1),
      scope: "Canvas render cost, not physical phone FPS",
    };
  },
  "Save report": async () => {
    const receipt = {
      release,
      at: new Date().toISOString(),
      userAgent: navigator.userAgent,
      results,
    };
    const response = await fetch("/__remake__/receipt", {
      method: "POST",
      body: JSON.stringify(receipt),
    });
    check(response.ok, "Receipt save failed");
    return { saved: true };
  },
};
for (const [name, fn] of Object.entries(actions)) {
  const button = document.createElement("button");
  button.textContent = name;
  button.onclick = () => record(name, fn);
  document.querySelector("#actions").append(button);
}
