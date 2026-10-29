import { uiChecks } from "/__review__/ui.js";
const release = document.querySelector("#release").textContent,
  prefix = "/releases/" + release + "/",
  results = [];
const output = document.querySelector("#results"),
  frame = document.querySelector("#game");
navigator.serviceWorker?.addEventListener("message", (e) => {
  if (e.data?.type === "PREPARE_UPDATE")
    e.ports[0]?.postMessage({ token: e.data.token, safe: true });
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (fn, timeout = 15000) => {
  const end = performance.now() + timeout;
  while (!fn()) {
    if (performance.now() > end) throw Error("Observation timed out");
    await wait(40);
  }
};
const check = (value, message) => {
  if (!value) throw Error(message);
};
async function record(name, run) {
  output.textContent = "Running " + name + "…";
  try {
    const detail = await run();
    results.push({
      name,
      status: detail?.withinFrameBudget === false ? "failed" : "passed",
      detail,
      utc: new Date().toISOString(),
    });
  } catch (error) {
    results.push({
      name,
      status: "failed",
      error: error.message,
      utc: new Date().toISOString(),
    });
  }
  output.textContent = JSON.stringify(results, null, 2);
}
const actions = {
  ...uiChecks({ frame, prefix, wait, until, check }),
  "Scorecard and icon visual sheet": async () => {
    const { scorecard, resultInvitation } = await import(prefix + "sharing.js");
    const content = await (await fetch(prefix + "content.json")).json();
    const result = {
      id: crypto.randomUUID(),
      trackId: content.tracks[0].track.id,
      trackName: "Yard Loop",
      laps: 3,
      mode: "daily",
      challenge: "daily-v1:2026-10-16",
      elapsedMs: 123456,
      classification: [{ id: "player" }],
      dnf: false,
    };
    const invite = resultInvitation(result, {
        date: "2026-10-16",
        slug: "yard-loop",
      }),
      blob = await scorecard(result, invite, {
        document: frame.contentDocument,
      });
    const response = await fetch("/__review__/scorecard", {
      method: "POST",
      body: blob,
    });
    check(response.ok, "Could not save scorecard");
    document.querySelector("#visual-sheet")?.remove();
    const sheet = document.createElement("div");
    sheet.id = "visual-sheet";
    const img = new Image();
    img.alt = "Synthetic daily result scorecard";
    img.src = URL.createObjectURL(blob);
    img.style.cssText = "width:1200px;max-width:100%";
    sheet.append(img);
    for (const bg of ["#fff", "#17201b"]) {
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;gap:30px;align-items:center;padding:24px;background:" +
        bg;
      for (const size of [16, 32, 48, 180]) {
        const icon = new Image();
        icon.src = prefix + "icons/icon-" + size + ".png";
        icon.width = icon.height = size;
        icon.alt = size + " pixel icon";
        row.append(icon);
      }
      const mask = new Image();
      mask.src = prefix + "icons/icon-maskable-512.png";
      mask.width = mask.height = 180;
      mask.style.borderRadius = "50%";
      mask.alt = "Circular maskable crop";
      row.append(mask);
      sheet.append(row);
    }
    document.body.append(sheet);
    await img.decode();
    return {
      file: "audit/screenshots/remediation-scorecard.png",
      url: invite.url,
      dimensions: [1200, 630],
      scope:
        "Synthetic result using production generator; visual/decoder review separate",
    };
  },
  "One-minute performance diagnostic": async () => {
    document.querySelector("#visual-sheet")?.remove();
    frame.style.display = "none";
    frame.src = "about:blank";
    try {
      const { measurePerformance } = await import("/__review__/performance.js");
      return await measurePerformance(
        prefix,
        await (await fetch(prefix + "content.json")).json(),
        output,
        60000,
      );
    } finally {
      frame.style.display = "";
      frame.src = "/";
    }
  },
  "Twenty-minute rendering and simulation soak": async () => {
    document.querySelector("#visual-sheet")?.remove();
    frame.style.display = "none";
    frame.src = "about:blank";
    try {
      const { measurePerformance } = await import("/__review__/performance.js");
      return await measurePerformance(
        prefix,
        await (await fetch(prefix + "content.json")).json(),
        output,
      );
    } finally {
      frame.style.display = "";
      frame.src = "/";
    }
  },
  "Scene and renderer budgets": async () => {
    const [
      { World },
      { compile },
      { assemble, allBuilds },
      { defaultSettings },
      { CUP_SCENES, FINAL_SCENE },
    ] = await Promise.all(
      [
        "renderer.js",
        "track.js",
        "builds.js",
        "preferences.js",
        "scenes.js",
      ].map((p) => import(prefix + p)),
    );
    const content = await (await fetch(prefix + "content.json")).json(),
      canvas = document.createElement("canvas");
    canvas.style.cssText = "width:640px;max-width:100%;height:400px";
    document.body.append(canvas);
    const world = new World(canvas),
      settings = defaultSettings({}),
      rows = [];
    try {
      for (let i = 0; i < 12; i++) {
        const track = compile(content.tracks[i].track);
        world.load(track);
        world.setCars(
          content.rivals
            .slice(0, 6)
            .map((r) => ({ spec: assemble(r, content.parts) })),
        );
        const start = performance.now();
        world.render(null, "start", settings, 0);
        rows.push({
          track: track.source.slug,
          coldRenderMs: performance.now() - start,
          calls: world.renderer.info.render.calls,
          triangles: world.renderer.info.render.triangles,
        });
      }
      for (const build of allBuilds(content.parts)) {
        world.garage();
        world.setCars([{ spec: assemble(build, content.parts) }]);
        world.render(null, "garage", settings, 0);
      }
      const scenes = [];
      for (let i = 0; i < 5; i++) {
        const scene = i === 4 ? FINAL_SCENE : CUP_SCENES[i];
        world.cinematic(
          compile(content.tracks[i === 4 ? 11 : i * 3].track),
          assemble(content.rivals[0], content.parts),
          i === 4,
        );
        world.render(null, "scene", { ...settings, reducedMotion: true }, 0);
        await world.rebuild(null, "scene", {
          ...settings,
          reducedMotion: true,
        });
        scenes.push({
          title: scene.title,
          held: true,
          calls: world.renderer.info.render.calls,
        });
      }
      return {
        rows,
        scenes,
        allBuilds: 81,
        gpuWithinBudget: rows.every(
          (r) => r.calls <= 200 && r.triangles <= 200000,
        ),
        scope:
          "Real WebGL rendering with source modules; scene fixture does not grant campaign completion",
      };
    } finally {
      world.clear();
      world.renderer.dispose();
      canvas.remove();
    }
  },

  "Apply verified update between runs": async () => {
    const expected = (
      await (await fetch("/release.json", { cache: "no-store" })).json()
    ).release;
    const doc = frame.contentDocument;
    doc.querySelector("#home").click();
    const before = doc.querySelector("base").getAttribute("href");
    doc.querySelector("#settings-button").click();
    doc.querySelector("#update-app").click();
    await until(() =>
      [...doc.querySelectorAll("#modal-actions button")].some(
        (b) => b.textContent === "Apply update",
      ),
    );
    [...doc.querySelectorAll("#modal-actions button")]
      .find((b) => b.textContent === "Apply update")
      .click();
    await until(
      () =>
        frame.contentDocument !== doc &&
        frame.contentDocument?.querySelector("#loading")?.hidden,
      20000,
    );
    const after = frame.contentDocument
      .querySelector("base")
      .getAttribute("href");
    check(
      after.includes(expected),
      `Update release mismatch: ${JSON.stringify({ before, expected, after })}`,
    );
    check(before !== after, "No version transition was observed");
    return { before, expected, after, explicitSafeActivation: true };
  },
  "Storage abort, reopen and backup": async () => {
    const { openStore, freshProgress } = await import(prefix + "storage.js"),
      content = await (await fetch(prefix + "content.json")).json();
    const name = "scrap-review-" + crypto.randomUUID();
    let store = await openStore({ name });
    const track = content.tracks[0].track;
    const first = await store.saveDraft(
      track,
      0,
      { zoom: 2, pan: { x: 10, y: 20 } },
      "",
    );
    let conflict = false;
    try {
      await store.saveDraft({ ...track, name: "conflict" }, 0, {}, "");
    } catch {
      conflict = true;
    }
    check(conflict, "Stale draft unexpectedly overwrote");
    const progress = freshProgress();
    progress.cup = { id: "fixture", index: 0, rounds: [] };
    await store.set("progress", progress);
    const result = {
      id: crypto.randomUUID(),
      key: "fixture",
      mode: "league",
      difficulty: "club",
      dnf: false,
      elapsedMs: 90000,
      splits: [30000, 30000, 30000],
      classification: [{ id: "player" }],
      createdAt: new Date().toISOString(),
    };
    let aborted = false;
    try {
      await store.commitResult(
        result,
        new Float32Array([0, 1, 2, 3]),
        "fixture",
        0,
        { fault: (tx) => tx.abort() },
      );
    } catch {
      aborted = true;
    }
    check(aborted, "Abort not observed");
    check(
      (await store.get("progress")).completed.length === 0,
      "Aborted rewards escaped",
    );
    check(!(await store.get("result:" + result.id)), "Aborted result escaped");
    await store.commitResult(
      result,
      new Float32Array([0, 1, 2, 3]),
      "fixture",
      0,
    );
    const backup = await store.exportBackup();
    store.close();
    store = await openStore({ name });
    check(
      (await store.get("progress")).completed.length === 1,
      "Progress did not survive reopen",
    );
    await store.reset("settings");
    check(
      (await store.get("draft:" + track.id)).revision === first.revision,
      "Settings reset erased draft",
    );
    await store.importBackup(backup);
    check(
      (await store.get("best:fixture")).ghost.length === 4,
      "Best/ghost restore diverged",
    );
    store.close();
    indexedDB.deleteDatabase(name);
    return {
      database: "Real browser IndexedDB; isolated disposable database",
      abort: true,
      conflict: true,
      reopen: true,
      backup: true,
    };
  },
  "Audio signal and voice budget": async () => {
    const { Sound } = await import(prefix + "audio.js"),
      measure = [];
    for (const scene of ["yard", "docks", "foundry", "final"]) {
      const context = new OfflineAudioContext(2, 44100 * 2, 44100);
      const proxy = new Proxy(context, {
        get(target, key) {
          if (key === "state") return "running";
          if (key === "resume" || key === "suspend") return async () => {};
          const value = target[key];
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      function Context() {
        return proxy;
      }
      const sound = new Sound({ Context });
      sound.enabled = true;
      await sound.activate();
      for (let i = 0; i < 40; i++) {
        sound.update(
          {
            vx: 32,
            vz: 8,
            heading: 0,
            boosting: i % 2 === 0,
            surface: ["asphalt", "mud", "gravel"][i % 3],
            contacts: i,
          },
          true,
          scene,
          i / 2,
        );
        sound.tone(80 + i * 40, 0.3, 0.25);
      }
      check(sound.voices.size + 2 <= 24, "Voice budget exceeded");
      const voiceCount = sound.voices.size + 2,
        buffer = await context.startRendering();
      let peak = 0,
        sum = 0;
      for (const sample of buffer.getChannelData(0)) {
        check(Number.isFinite(sample), "Nonfinite audio sample");
        peak = Math.max(peak, Math.abs(sample));
        sum += sample * sample;
      }
      check(peak < 0.99 && sum > 0, "Clipped or silent audio");
      measure.push({
        scene,
        voices: voiceCount,
        peak,
        rms: Math.sqrt(sum / buffer.length),
      });
    }
    return measure;
  },
  "Settings, input and graphics interruption": async () => {
    const win = frame.contentWindow,
      doc = win.document;
    await until(() => doc.querySelector("#loading")?.hidden);
    doc.querySelector("#lesson-button").click();
    await until(() => doc.querySelector("#stage").className === "view-race");
    await until(() => doc.querySelector("#countdown").textContent === "");
    win.dispatchEvent(
      new win.KeyboardEvent("keydown", { code: "KeyW", bubbles: true }),
    );
    await wait(500);
    win.dispatchEvent(
      new win.KeyboardEvent("keyup", { code: "KeyW", bubbles: true }),
    );
    doc.querySelector("#pause-button").click();
    await until(() => doc.querySelector("#modal").open);
    const stopped = doc.querySelector("#hud-time").textContent;
    await wait(150);
    check(
      doc.querySelector("#hud-time").textContent === stopped,
      "Pause advanced time",
    );
    [...doc.querySelectorAll("#modal-actions button")]
      .find((b) => b.textContent === "Settings")
      .click();
    await until(
      () => doc.querySelector("#modal-title").textContent === "SETTINGS",
    );
    [...doc.querySelectorAll("#modal-actions button")]
      .find((b) => /pause/i.test(b.textContent))
      .click();
    await until(
      () => doc.querySelector("#modal-title").textContent !== "SETTINGS",
    );
    [...doc.querySelectorAll("#modal-actions button")]
      .find((b) => b.textContent === "Resume")
      .click();
    await until(() => !doc.querySelector("#modal").open);
    await wait(850);
    const gl = doc.querySelector("#world").getContext("webgl2"),
      extension = gl.getExtension("WEBGL_lose_context");
    check(extension, "Context-loss injection unavailable");
    extension.loseContext();
    await until(() => doc.querySelector("#modal").open);
    const lostTime = doc.querySelector("#hud-time").textContent;
    await wait(200);
    check(
      doc.querySelector("#hud-time").textContent === lostTime,
      "Lost graphics advanced time",
    );
    extension.restoreContext();
    await until(() =>
      /restored/i.test(doc.querySelector("#modal-content").textContent),
    );
    check(
      doc.querySelector("#modal").open,
      "Restoration resumed without consent",
    );
    [...doc.querySelectorAll("#modal-actions button")]
      .find((b) => b.textContent === "Resume")
      .click();
    await wait(850);
    check(
      doc.activeElement === doc.querySelector("#world"),
      "Resume lost driving focus",
    );
    return {
      pause: true,
      settingsReturnedToPause: true,
      contextRebuilt: true,
      explicitResume: true,
      focus: true,
    };
  },
  "Startup import failure fallback": async () => {
    const bad = document.createElement("iframe");
    bad.title = "Startup failure fixture";
    bad.src = "/startup-fault/";
    document.body.append(bad);
    try {
      await until(() =>
        /could not/i.test(
          bad.contentDocument?.querySelector("#loading-message")?.textContent ||
            "",
        ),
      );
      check(
        bad.contentDocument.querySelector("#startup-retry")?.getClientRects()
          .length,
        "Reload control missing",
      );
      return {
        failure:
          bad.contentDocument.querySelector("#loading-message").textContent,
        reloadVisible: true,
      };
    } finally {
      bad.remove();
    }
  },
  "Offline corruption and repair": async () => {
    const { workerRequest } = await import(prefix + "offline.js");
    const registration = await navigator.serviceWorker.ready;
    const worker = registration.waiting || registration.active;
    const status = await workerRequest(worker, "STATUS");
    check(status.release === release, "Review page and worker release differ");
    const cache = await caches.open(release);
    const key = new URL(prefix + "preferences.js", location.origin).href;
    await cache.delete(key);
    let refused = false;
    try {
      await workerRequest(worker, "STATUS");
    } catch {
      refused = true;
    }
    check(refused, "Missing cache entry falsely reported ready");
    await workerRequest(worker, "REPAIR", { timeout: 90000 });
    await workerRequest(worker, "STATUS");
    return { missingEntryRefused: true, repairVerified: true };
  },
  "Offline reload with network unavailable": async () => {
    await fetch("/__review__/network?offline=true", { method: "POST" });
    try {
      frame.contentWindow.location.reload();
      await wait(500);
      await until(
        () => frame.contentDocument?.querySelector("#loading")?.hidden,
        20000,
      );
      check(
        frame.contentDocument.querySelector("#race-button").textContent.length >
          0,
        "Game unavailable offline",
      );
      frame.contentDocument.querySelector("#workshop-button").click();
      await until(
        () => !frame.contentDocument.querySelector("#screen-workshop").hidden,
      );
      return {
        network503: true,
        offlineGame: true,
        workshop: true,
        scope: "Existing browser process, newly loaded document",
      };
    } finally {
      await fetch("/__review__/network?offline=false", { method: "POST" });
    }
  },
  "Save browser evidence": async () => {
    const receipt = {
      release,
      utc: new Date().toISOString(),
      userAgent: navigator.userAgent,
      viewport: { width: innerWidth, height: innerHeight },
      method:
        "Browser-executed source tests via local review controls; injected faults are labeled",
      results: [...results],
    };
    const response = await fetch("/__review__/receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(receipt),
    });
    check(response.ok, "Receipt write failed");
    return await response.text();
  },
};
for (const [name, run] of Object.entries(actions)) {
  const button = document.createElement("button");
  button.textContent = name;
  button.style.cssText = "padding:10px;margin:4px";
  button.onclick = () => record(name, run);
  document.querySelector("#actions").append(button);
}
