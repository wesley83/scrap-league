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
async function runToFinish(slow = false) {
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
      if (slow) controls.throttle *= 0.55;
      stepRace(r, controls);
      practiceStep(r.practice, p, controls);
    }
    await delay(0);
  }
  check(!r.dnf, "Controller did not finish");
  await api.finish();
  await waitFor(
    () =>
      r.saved ||
      doc()
        .querySelector("#result-save")
        ?.textContent.startsWith("Result not saved"),
  );
  check(api.view === "result" && r.saved, "Result not persisted");
  return {
    elapsedMs: r.result.elapsedMs,
    laps: r.result.splits.length,
    place: r.result.classification.findIndex((c) => c.id === "player") + 1,
    contacts: r.result.contacts,
  };
}
async function extraChecks() {
  const { uiChecks } = await import("/__audit__/ui.js");
  const inherited = uiChecks({
    frame,
    prefix,
    wait: delay,
    until: waitFor,
    check,
  });
  return {
    "Garage compare and test": async () => {
      await home();
      frame.style.width = "1100px";
      frame.style.height = "800px";
      return inherited["Garage comparison, equip and ordinary-input test"]();
    },
    "Sharing and fallback":
      inherited["Browser invitation success, cancellation and fallbacks"],
    "Twelve events, reload and ending": async () => {
      await home();
      // This loopback-only review origin owns its disposable save. Begin a
      // genuinely fresh campaign; completion still uses only legal car inputs.
      const { freshProgress } = await import(prefix + "storage.js");
      Object.assign(api.progress, freshProgress());
      await api.store.set("progress", api.progress);
      api.settings.reducedMotion = true;
      api.settings.lowEffects = true;
      api.settings.sound = false;
      api.applyPreferences();
      await api.store.set("settings", api.settings);
      const rows = [];
      click("race-button");
      doc().querySelector("#difficulty").value = "relaxed";
      click("continue-cup");
      for (let i = 0; i < 12; i++) {
        await waitFor(() => ["race", "scene"].includes(api.view));
        if (api.view === "scene") {
          check(
            doc().querySelector("#scene-copy").textContent.length > 20,
            "Missing scene caption",
          );
          click("scene-continue");
        }
        await waitFor(() => api.view === "race");
        const expected = api.progress.cup.rounds.length;
        const row = await runToFinish();
        check(
          api.progress.cup.rounds.length === expected + 1,
          "Round advanced incorrectly",
        );
        check(
          api.progress.completed.length === i + 1,
          "Event progression mismatch",
        );
        rows.push({ event: i + 1, ...row });
        if (i === 0) {
          const cupId = api.progress.cup.id;
          frame.src = "/?reload-cup=1";
          await delay(150);
          await connect();
          check(
            api.progress.cup.id === cupId &&
              api.progress.cup.rounds.length === 1,
            "Cup lost across ordinary reload",
          );
          click("race-button");
          doc().querySelector("#difficulty").value = "relaxed";
          click("continue-cup");
        } else if ((i + 1) % 3 === 0) {
          button("Cup standings").click();
          if (i < 11) {
            check(
              doc()
                .querySelector("#modal-content")
                .textContent.includes("points"),
              "Missing standings",
            );
            button("Next cup").click();
          }
        } else button("Next race").click();
      }
      check(
        api.view === "scene" &&
          doc()
            .querySelector("#scene-kicker")
            .textContent.includes("12 EVENTS"),
        "Final scene missing",
      );
      const caption = doc().querySelector("#scene-copy").textContent;
      await delay(5500);
      check(
        api.view === "scene" &&
          doc().querySelector("#scene-copy").textContent === caption,
        "Ending did not hold",
      );
      const before = JSON.stringify(api.progress.completed);
      click("scene-continue");
      await waitFor(() => api.view === "workshop");
      check(
        JSON.stringify(api.progress.completed) === before,
        "Ending duplicated awards",
      );
      return {
        rows,
        reloadAfterFirstRound: true,
        allFourScenes: true,
        heldEnding: true,
        reducedMotion: true,
        lowEffects: true,
        muted: true,
        scope:
          "Legal synthetic controller through actual UI/persistence; no human enjoyment claim",
      };
    },
    "Gamepad menu, race and interruption": async () => {
      await home();
      api.settings.autoAccelerate = false;
      api.settings.touch = true;
      api.applyPreferences();
      const nav = win().navigator,
        original = Object.getOwnPropertyDescriptor(nav, "getGamepads"),
        pad = {
          axes: [0, 0],
          buttons: Array.from({ length: 17 }, () => ({
            pressed: false,
            value: 0,
          })),
        };
      Object.defineProperty(nav, "getGamepads", {
        configurable: true,
        value: () => [pad],
      });
      const press = async (n) => {
        pad.buttons[n] = { pressed: true, value: 1 };
        await delay(120);
        pad.buttons[n] = { pressed: false, value: 0 };
        await delay(250);
      };
      try {
        doc().querySelector("#settings-button").focus();
        await press(0);
        check(
          doc().querySelector("#modal-title").textContent === "SETTINGS",
          "Gamepad confirm failed",
        );
        const range = doc().querySelector('[data-range="sensitivity"]');
        range.value = "1";
        range.focus();
        await press(15);
        check(+range.value > 1, "D-pad range failed");
        await press(1);
        check(!doc().querySelector("dialog").open, "Back failed");
        click("quick-race");
        await waitFor(() => api.view === "race");
        await waitFor(() => api.race.state === "racing");
        pad.buttons[7] = { pressed: true, value: 1 };
        await delay(900);
        pad.buttons[7] = { pressed: false, value: 0 };
        check(
          +doc().querySelector("#hud-speed").textContent > 0,
          "Trigger failed",
        );
        await press(9);
        check(api.race.state === "paused", "Start pause failed");
        const t = api.race.time;
        await delay(150);
        check(api.race.time === t, "Paused clock moved");
        await press(9);
        await waitFor(() => api.race.state === "racing");
        win().dispatchEvent(new (win().Event)("gamepaddisconnected"));
        check(api.race.state === "paused", "Disconnect did not pause");
        button("Resume").click();
        await waitFor(() => api.race.state === "racing");
        const boost = doc().querySelector('[data-hold="boost"]');
        boost.focus();
        boost.dispatchEvent(
          new (win().KeyboardEvent)("keydown", { key: "Enter", bubbles: true }),
        );
        check(api.input().boost, "Held key did not engage");
        doc().querySelector("#world").focus();
        check(!api.input().boost, "Focus change left held action");
        api.pause();
        return {
          menuConfirm: true,
          range: true,
          trigger: true,
          startPauseResume: true,
          disconnect: true,
          heldFocusCancellation: true,
          syntheticGamepad: true,
        };
      } finally {
        if (original) Object.defineProperty(nav, "getGamepads", original);
        else delete nav.getGamepads;
      }
    },
    "New circuit, source and failed save": async () => {
      await home();
      await api.openWorkshop();
      await api.workshop.flush();
      click("work-file");
      await waitFor(() => doc().querySelector('[data-file="blank"]'));
      doc().querySelector('[data-file="blank"]').click();
      await waitFor(() => api.workshop.track.pieces.length === 0);
      const w = api.workshop;
      const set = (id, value) => {
        const el = doc().getElementById(id);
        el.value = value;
        el.dispatchEvent(new (win().Event)("change"));
      };
      set("track-name", "Handbook circuit & <safe>");
      // Four 60 m straights and four 40 m quarter bends, authored only via controls.
      for (let i = 0; i < 4; i++) {
        set("piece-kind", i === 0 ? "start" : "straight");
        set("piece-length", "60");
        click("place-road");
        set("piece-kind", "quarter");
        set("piece-radius", "40");
        set("piece-turn", "1");
        click("place-road");
      }
      click("close-loop");
      click("setup-race");
      await w.flush();
      check(
        w.compiled.valid,
        "New circuit not race ready: " + JSON.stringify(w.compiled.errors),
      );
      const originalName = w.track.name,
        id = w.track.id,
        saved = await api.store.get("draft:" + id);
      const original = w.store.saveDraft;
      w.store.saveDraft = async () => {
        throw Error("Injected quota failure");
      };
      set("track-name", "Unsaved edit preserved");
      await w.flush().catch(() => {});
      click("home");
      await delay(100);
      check(
        api.view === "workshop" && w.track.name === "Unsaved edit preserved",
        "Navigation lost failed draft",
      );
      check(
        (await api.store.get("draft:" + id)).track.name === originalName,
        "Failed write changed durable source",
      );
      click("source-preview");
      check(
        doc()
          .querySelector("#modal-content textarea")
          .value.includes("Unsaved edit preserved"),
        "Recovery source unavailable",
      );
      dismiss();
      w.store.saveDraft = original;
      click("work-file");
      await waitFor(() => button("Retry save"));
      button("Retry save").click();
      await waitFor(() => !w.saveError && !doc().querySelector("dialog").open);
      doc().querySelector("#test-ai").checked = true;
      click("work-test");
      await waitFor(() => api.view === "race");
      check(api.race.cars.length === 6, "Five rivals missing");
      const completed = await runToFinish();
      button("Return to editor").click();
      check(
        api.view === "workshop" &&
          w.track.id === id &&
          w.track.name === "Unsaved edit preserved",
        "Test return lost source",
      );
      click("work-undo");
      click("work-redo");
      await w.flush();
      const { parseTrack } = await import(prefix + "model.js");
      const parsed = parseTrack(w.sourceDocument.html());
      check(
        parsed.name === w.track.name && parsed.pieces.length === 8,
        "Source round-trip changed data",
      );
      return {
        id,
        pieces: 8,
        semanticSource: true,
        saveFailureNavigation: true,
        exportRecovery: true,
        fiveAI: true,
        completed,
        undoRedo: true,
        scope:
          "Native form/button route; canvas dragging is a separate fixture",
      };
    },
    "Solo improvement and submission form": async () => {
      await home();
      api.settings.autoAccelerate = false;
      api.applyPreferences();
      await api.startTrack(0, "trial");
      const first = await runToFinish(true);
      button("Race again").click();
      await waitFor(() => api.race.state === "countdown");
      check(api.race.bestGhost?.length > 0, "Prior ghost not offered");
      const second = await runToFinish();
      check(
        second.elapsedMs < first.elapsedMs,
        "Controlled improved lap not faster",
      );
      const id = api.race.id;
      const transport = api.boards.fetcher;
      api.boards.fetcher = async () => {
        throw Error("Injected offline transport");
      };
      try {
        button("Add to leaderboard").click();
        await waitFor(() => doc().querySelector(".driver-profile input"));
        const form = doc().querySelector(".driver-profile"),
          field = form.querySelector("input");
        field.value = "  ";
        form.requestSubmit();
        await delay(100);
        check(
          field.getAttribute("aria-invalid") === "true" &&
            doc().querySelector("dialog").open,
          "Invalid input lost form",
        );
        field.value = "Audit 🏎 <driver>";
        form.requestSubmit();
        await waitFor(() => field.readOnly);
        await delay(150);
        const entry = await api.store.get("outbox:" + id);
        check(
          entry.run.alias === "Audit 🏎 <driver>" && entry.state === "retry",
          "Offline submission not durable",
        );
        check(
          doc()
            .querySelector("[data-submission-status]")
            .textContent.includes("queued"),
          "Queue status missing",
        );
        dismiss();
        await api.showSharedTimes();
        check(
          doc().querySelector(".driver-profile input").value ===
            "Audit 🏎 <driver>",
          "Queued name not preserved",
        );
        return {
          first,
          second,
          ghost: true,
          id,
          offlineQueue: true,
          invalidFormPreserved: true,
          escapedName: true,
        };
      } finally {
        api.boards.fetcher = transport;
      }
    },
    "Name form 200 percent reflow": async () => {
      await home();
      frame.style.width = "320px";
      frame.style.height = "568px";
      await api.openLeaderboards();
      const modal = doc().querySelector("dialog"),
        elements = [modal, ...modal.querySelectorAll("*")];
      const originals = elements.map((e) => e.style.fontSize);
      const sizes = elements.map((e) =>
        parseFloat(win().getComputedStyle(e).fontSize),
      );
      elements.forEach((e, i) => (e.style.fontSize = sizes[i] * 2 + "px"));
      await delay(100);
      const overflow = modal.scrollWidth - modal.clientWidth;
      const field = modal.querySelector("input");
      field.focus();
      field.scrollIntoView({ block: "center" });
      const r = field.getBoundingClientRect(),
        m = modal.getBoundingClientRect();
      const visible =
        r.left >= m.left &&
        r.right <= m.right &&
        r.top >= m.top &&
        r.bottom <= m.bottom;
      elements.forEach((e, i) => (e.style.fontSize = originals[i]));
      check(overflow <= 1, "Enlarged text overflows by " + overflow + "px");
      check(visible, "Focused name field clipped");
      return {
        width: 320,
        height: 568,
        fontScale: 2,
        allComputedFontsDoubled: true,
        overflow,
        focusedNameVisible: visible,
      };
    },
    "Foreground update discovery": async () => {
      await home();
      const nav = win().navigator,
        descriptor = Object.getOwnPropertyDescriptor(nav, "serviceWorker");
      let updates = 0,
        activations = 0;
      const worker = {
        postMessage(message, ports) {
          if (message.type === "ACTIVATE") activations++;
          ports?.[0]?.postMessage({
            token: message.token,
            ok: true,
            release: "sl-review-candidate",
          });
        },
      };
      const registration = {
        active: worker,
        waiting: worker,
        update: async () => {
          updates++;
        },
      };
      const serviceWorker = {
        register: async () => registration,
        ready: Promise.resolve(registration),
      };
      Object.defineProperty(nav, "serviceWorker", {
        configurable: true,
        value: serviceWorker,
      });
      try {
        win().dispatchEvent(new (win().Event)("online"));
        await waitFor(() => !doc().querySelector("#update-ready").hidden);
        check(
          updates === 1,
          "Reconnect did not explicitly check for an update",
        );
        win().dispatchEvent(new (win().Event)("online"));
        await delay(50);
        check(updates === 1, "Foreground discovery was not throttled");
        click("update-ready");
        await waitFor(
          () =>
            doc().querySelector("#modal-title").textContent ===
            "New release ready",
        );
        check(activations === 0, "Discovery activated without consent");
        button("Later").click();
        return {
          reconnectChecks: 1,
          repeatedEventCoalesced: true,
          visibleUpdateButton: true,
          manualReview: true,
          noAutomaticActivation: true,
          scope:
            "Injected worker adapter through production lifecycle and visible controls; natural real-worker update checked separately",
        };
      } finally {
        if (descriptor) Object.defineProperty(nav, "serviceWorker", descriptor);
        else delete nav.serviceWorker;
        doc().querySelector("#update-ready").hidden = true;
        dismiss();
      }
    },
  };
}
const actions = {
  ...(await extraChecks()),
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
    check(api.input().throttle === 1, "Touch BOOST did not include throttle");
    win().dispatchEvent(new (win().Event)("resize"));
    check(
      !api.input().boost && api.input().brake === 0,
      "Resize retained contacts",
    );
    send(boost, "pointerdown", 12);
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
    check(
      trial.includes("Times unavailable") || trial.includes("times"),
      trial,
    );
    const mode = doc().querySelector("#board-mode");
    mode.value = "daily";
    mode.dispatchEvent(new (win().Event)("change"));
    await waitFor(
      () =>
        doc().querySelector("#board-state").textContent !== "Loading times…",
    );
    const daily = doc().querySelector("#board-state").textContent;
    check(
      daily.includes("Times unavailable") || daily.includes("times"),
      daily,
    );
    dismiss();
    return {
      trial,
      daily,
      scope:
        "Local-origin unavailable/read states only; same-origin reads are verified after deployment",
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
    const response = await fetch("/__audit__/receipt", {
      method: "POST",
      body: JSON.stringify(receipt),
    });
    check(response.ok, "Receipt save failed");
    return { saved: true };
  },
};
actions["Remaining browser checks"] = async () => {
  const start = results.length;
  for (const name of [
    "Garage compare and test",
    "Sharing and fallback",
    "Gamepad menu, race and interruption",
    "New circuit, source and failed save",
    "Solo improvement and submission form",
    "Name form 200 percent reflow",
    "Quick race journey",
    "Input ownership and camera",
    "Manual throttle layout",
    "Workshop round trip",
    "Practice and ghost",
    "All tracks and recovery",
    "Render budget",
    "Foreground update discovery",
  ])
    await record(name, actions[name]);
  await actions["Save report"]();
  check(
    results.slice(start).every((r) => r.status === "passed"),
    "One or more browser checks failed; receipt retained",
  );
  return { checks: results.length - start };
};
actions["Twenty-minute live-loop soak"] = async () => {
  await home();
  const { soak } = await import("/__audit__/soak.js");
  return soak({ api, frame, prefix, output });
};
actions["Default-resolution full race"] = async () => {
  await home();
  const { defaultQualityRace } = await import("/__audit__/soak.js");
  return defaultQualityRace({ api, frame, prefix, output });
};
for (const [name, fn] of Object.entries(actions)) {
  const button = document.createElement("button");
  button.textContent = name;
  button.onclick = () => record(name, fn);
  document.querySelector("#actions").append(button);
}
