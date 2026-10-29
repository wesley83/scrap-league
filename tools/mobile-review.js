const output = document.querySelector("#results"),
  frame = document.querySelector("#game");
// The production worker deliberately leaves query URLs to the network. Pin
// this diagnostic document to the current build; offline updating is separate.
frame.src = "/?review=" + document.querySelector("#release").textContent;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const check = (ok, message) => {
  if (!ok) throw Error(message);
};
async function until(fn) {
  const end = performance.now() + 15000;
  while (!fn()) {
    if (performance.now() > end)
      throw Error("Timed out waiting for game state");
    await wait(50);
  }
}
const rows = [];
const button = (doc, label) =>
  [...doc.querySelectorAll("button")].find((b) => b.textContent === label);
async function run(name, fn) {
  output.textContent = "Running " + name;
  try {
    await until(() => frame.contentDocument?.querySelector("#loading")?.hidden);
    check(
      frame.contentDocument
        .querySelector("base")
        .getAttribute("href")
        .includes(document.querySelector("#release").textContent),
      "Installed game differs from fixture release; close and reopen the local tabs to activate the update",
    );
    rows.push({ name, status: "passed", detail: await fn() });
  } catch (e) {
    rows.push({ name, status: "failed", error: e.message });
  }
  output.textContent = JSON.stringify(
    {
      utc: new Date().toISOString(),
      release: document.querySelector("#release").textContent,
      userAgent: navigator.userAgent,
      rows,
    },
    null,
    2,
  );
}
const actions = {
  "All circuits and scenes in both graphics profiles": async () => {
    const prefix =
      "/releases/" + document.querySelector("#release").textContent + "/";
    const [{ World }, { compile }, { assemble }, { defaultSettings }] =
      await Promise.all(
        ["renderer.js", "track.js", "builds.js", "preferences.js"].map(
          (f) => import(prefix + f),
        ),
      );
    const content = await (await fetch(prefix + "content.json")).json(),
      detail = [];
    for (const safeGraphics of [true, false]) {
      const canvas = document.createElement("canvas");
      canvas.style.cssText = "width:412px;height:855px";
      document.body.append(canvas);
      const world = new World(canvas, null, null, { safeGraphics }),
        settings = defaultSettings();
      try {
        for (const entry of content.tracks) {
          world.load(compile(entry.track));
          world.setCars(
            content.rivals
              .slice(0, 6)
              .map((r) => ({ spec: assemble(r, content.parts) })),
          );
          check(
            world.render(null, "start", settings, 0),
            "Circuit failed: " + entry.track.slug,
          );
          detail.push({
            safeGraphics,
            circuit: entry.track.slug,
            calls: world.renderer.info.render.calls,
            triangles: world.renderer.info.render.triangles,
          });
        }
        world.garage();
        world.setCars([{ spec: assemble(content.rivals[0], content.parts) }]);
        check(world.render(null, "garage", settings, 0), "Garage failed");
        for (let i = 0; i < 5; i++) {
          world.cinematic(
            compile(content.tracks[i === 4 ? 11 : i * 3].track),
            assemble(content.rivals[0], content.parts),
            i === 4,
          );
          check(world.render(null, "scene", settings, 0.5), "Cinematic failed");
          await world.rebuild(null, "scene", settings);
        }
      } finally {
        world.dispose();
        canvas.remove();
      }
    }
    return { detail, garages: 2, cinematicRebuilds: 10 };
  },
  "Portrait racing and missed graphics event": async () => {
    frame.style.width = "412px";
    frame.style.height = "915px";
    const win = frame.contentWindow,
      doc = win.document;
    await until(() => doc.querySelector("#loading").hidden);
    doc.querySelector("#settings-button").click();
    const touch = doc.querySelector('[data-setting="touch"]');
    touch.checked = true;
    touch.dispatchEvent(new win.Event("change", { bubbles: true }));
    const safe = doc.querySelector('[data-setting="safeGraphics"]');
    safe.checked = true;
    safe.dispatchEvent(new win.Event("change", { bubbles: true }));
    await until(() =>
      /Graphics restored/.test(doc.querySelector("#toast").textContent),
    );
    doc.querySelector("#modal").close();
    doc.querySelector("#daily-button").click();
    await until(() => button(doc, "Race this specification"));
    button(doc, "Race this specification").click();
    await until(() =>
      doc.querySelector("#stage").classList.contains("view-race"),
    );
    await until(
      () => doc.querySelector("#hud-time").textContent !== "00:00.000",
    );
    win.dispatchEvent(
      new win.KeyboardEvent("keydown", { code: "KeyW", bubbles: true }),
    );
    await wait(800);
    win.dispatchEvent(
      new win.KeyboardEvent("keyup", { code: "KeyW", bubbles: true }),
    );
    const canvas = doc.querySelector("#world"),
      gl = canvas.getContext("webgl2");
    check(gl && !gl.isContextLost(), "Normal graphics missing");
    const size = [canvas.width, canvas.height];
    check(
      size[0] * size[1] <= 1000000,
      "Safe graphics allocation exceeds budget",
    );
    check(
      gl.getContextAttributes().antialias === false,
      "Safe graphics still uses multisampling",
    );
    const extension = gl.getExtension("WEBGL_lose_context");
    check(extension, "Loss extension unavailable");
    canvas.addEventListener(
      "webglcontextlost",
      (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
      },
      { capture: true },
    );
    extension.loseContext();
    await until(
      () => doc.querySelector("#modal").open && button(doc, "Repair graphics"),
    );
    const time = doc.querySelector("#hud-time").textContent,
      title = doc.querySelector("#race-title").textContent;
    await wait(350);
    check(
      doc.querySelector("#hud-time").textContent === time,
      "Missed event allowed clock to continue",
    );
    button(doc, "Repair graphics").click();
    await until(() =>
      /Graphics restored/.test(doc.querySelector("#modal-content").textContent),
    );
    check(doc.querySelector("#world") !== canvas, "Failed canvas was reused");
    check(
      !doc.querySelector("#world").getContext("webgl2").isContextLost(),
      "Replacement context is lost",
    );
    check(
      doc.querySelector("#hud-time").textContent === time,
      "Repair changed race time",
    );
    check(
      doc.querySelector("#race-title").textContent === title,
      "Repair replaced attempt",
    );
    await wait(250);
    check(
      doc.querySelector("#hud-time").textContent === time,
      "Repair resumed without user action",
    );
    button(doc, "Resume").click();
    await until(() => doc.querySelector("#hud-time").textContent !== time);
    check(
      doc.activeElement === doc.querySelector("#world"),
      "Repair lost keyboard focus",
    );
    return {
      size,
      title,
      stoppedTime: time,
      missedEventPaused: true,
      freshCanvas: true,
      explicitResume: true,
      scope:
        "Desktop browser with 412x915 iframe; real WEBGL_lose_context fault, propagation intentionally suppressed. Not a physical Pixel/Edge test.",
    };
  },
  "Failed repair stays paused and retry recovers": async () => {
    const win = frame.contentWindow,
      doc = win.document;
    doc.querySelector("#pause-button").click();
    const time = doc.querySelector("#hud-time").textContent;
    button(doc, "Settings").click();
    const original = win.HTMLCanvasElement.prototype.getContext;
    win.HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (this.id === "world" && type === "webgl2") return null;
      return original.call(this, type, ...args);
    };
    try {
      button(doc, "Repair graphics").click();
      await until(() =>
        /could not restart/.test(
          doc.querySelector("#modal-content").textContent,
        ),
      );
      await wait(250);
      check(
        doc.querySelector("#hud-time").textContent === time,
        "Failed repair advanced race",
      );
      check(!button(doc, "Resume"), "Failed repair allows Resume");
    } finally {
      win.HTMLCanvasElement.prototype.getContext = original;
    }
    button(doc, "Repair graphics").click();
    await until(() =>
      /Graphics restored/.test(doc.querySelector("#modal-content").textContent),
    );
    check(
      doc.querySelector("#hud-time").textContent === time,
      "Retry changed race time",
    );
    button(doc, "Resume").click();
    await until(() => doc.querySelector("#hud-time").textContent !== time);
    return {
      injectedCreationFailure: true,
      timePreserved: true,
      retryRecovered: true,
    };
  },
  "Landscape, normal restoration and settings repair": async () => {
    const doc = frame.contentDocument;
    frame.style.width = "915px";
    frame.style.height = "412px";
    await wait(200);
    if (!doc.querySelector("#modal").open)
      doc.querySelector("#pause-button").click();
    button(doc, "Resume").click();
    await wait(900);
    const gl = doc.querySelector("#world").getContext("webgl2"),
      extension = gl.getExtension("WEBGL_lose_context");
    extension.loseContext();
    await until(() => doc.querySelector("#modal").open);
    const time = doc.querySelector("#hud-time").textContent;
    extension.restoreContext();
    await until(() =>
      /Graphics restored/.test(doc.querySelector("#modal-content").textContent),
    );
    check(
      doc.querySelector("#hud-time").textContent === time,
      "Automatic restoration advanced race",
    );
    button(doc, "Settings").click();
    button(doc, "Repair graphics").click();
    await until(() =>
      /Graphics restored/.test(doc.querySelector("#modal-content").textContent),
    );
    button(doc, "Resume").click();
    await until(() => doc.querySelector("#hud-time").textContent !== time);
    return {
      ordinaryContextRestore: true,
      settingsRepair: true,
      size: [
        doc.querySelector("#world").width,
        doc.querySelector("#world").height,
      ],
    };
  },
};
for (const [name, fn] of Object.entries(actions)) {
  const control = document.createElement("button");
  control.textContent = name;
  control.style.cssText = "padding:12px;margin:6px";
  control.onclick = () => run(name, fn);
  document.querySelector("#actions").append(control);
}
