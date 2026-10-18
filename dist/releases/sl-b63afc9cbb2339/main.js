import { CUP_SCENES, FINAL_SCENE } from "./scenes.js";
import { Boards, contentKeys } from "./boards.js";
import { nameField, rememberDriver } from "./driver-profile.js";
import { showSubmission } from "./submission-ui.js";
import { readPublishedTrack, discoverTracks } from "./publication.js";
import { resultInvitation, shareInvitation, scorecard } from "./sharing.js";
import { workerRequest } from "./offline.js";
import { World } from "./arcade-renderer.js";
import {
  ContactActions,
  bindTouchControls,
  practiceStep,
  practicePrompt,
} from "./driving-controls.js";
import {
  defaultSettings,
  normalizeSettings,
  bindKey,
  bindingHint,
} from "./preferences.js";
import {
  captureAttempt,
  resolveAttempt,
  updateDegradation,
  recoverProgressContent,
} from "./continuation.js";
import { Sound } from "./audio.js";
import { Workshop, readWorkshopDrafts } from "./workshop.js";
import {
  uid,
  clone,
  esc,
  hash,
  gameplay,
  wrap,
  clamp,
  duplicateTrack,
  parseTrack,
} from "./model.js";
import { compile, nearest, atDistance } from "./track.js";
import {
  STARTER,
  SLOTS,
  assemble,
  unlocked,
  comparisonKey,
  time,
  standings,
} from "./builds.js";
import { openStore, freshProgress } from "./storage.js";
import {
  DT,
  createCar,
  stepRace,
  classification,
  resultOf,
  resetCar,
} from "./simulation.js";
const $ = (s) => document.querySelector(s),
  q = (id) => document.getElementById(id);
let content,
  boards,
  recognizedContent,
  store,
  progress = freshProgress(),
  settings = defaultSettings({
    coarse: matchMedia("(pointer:coarse)").matches,
    reducedMotion: matchMedia("(prefers-reduced-motion:reduce)").matches,
  }),
  world,
  workshop,
  race,
  view = "start",
  eventMode = "league",
  garageOrigin = "start",
  garageBuild = { ...STARTER },
  garageUndo = null,
  prepareToken = 0,
  lastTime = 0,
  accumulator = 0,
  lastHUD = 0,
  lastRender = 0,
  savingResult = false,
  toastTimer,
  installPrompt,
  waitingWorker;
const keys = new Set(),
  held = new ContactActions();
let steering = 0;
let resetTouch;
let repairingGraphics = false;
let graphicsSnapshot;
const sound = new Sound();
function graphicsInterrupted(reason = "The racing view stopped drawing.") {
  accumulator = 0;
  clearInput();
  sound.stop();
  if (view === "race")
    pause(reason + " Your race clock is stopped. Repair graphics to continue.");
  else
    notify(
      reason + " Open Settings and choose Repair graphics. Saved work is kept.",
      true,
    );
}
function createWorld(canvas) {
  const created = new World(
    canvas,
    graphicsInterrupted,
    async () => {
      if (world !== created || created.disposed) return;
      // Restored drivers can leave old program/buffer handles invalid. Use the
      // same fresh-surface path as an explicit repair, with conservative detail.
      await repairGraphics(true);
    },
    { safeGraphics: settings.safeGraphics },
  );
  return created;
}
async function repairGraphics(safe = true) {
  if (repairingGraphics) return;
  repairingGraphics = true;
  const old = world;
  if (old && !old.disposed)
    graphicsSnapshot = {
      track: old?.track,
      sourceCars: old?.sourceCars,
      cinematicState: old?.cinematicState,
      angle: old?.angle,
    };
  if (view === "race")
    pause("Rebuilding the racing view. Your race clock is stopped.");
  clearInput();
  accumulator = 0;
  settings.safeGraphics = safe;
  try {
    // A failed canvas can remain unusable after a context restore. Replace the
    // surface and renderer together; keep the live simulation and saved data.
    old?.dispose();
    world = null;
    const canvas = q("world").cloneNode(false);
    canvas.width = canvas.height = 1;
    q("world").replaceWith(canvas);
    world = createWorld(canvas);
    Object.assign(world, graphicsSnapshot);
    await world.rebuild(race, view, settings);
    lastTime = performance.now();
    lastRender = 0;
    if (view === "race") pause("Graphics restored. Resume when you are ready.");
    else notify("Graphics restored" + (safe ? " with safer graphics." : "."));
  } catch (error) {
    if (world) world.contextLost = true;
    graphicsInterrupted(
      "Graphics could not restart. Try Repair graphics again or reload the game.",
    );
    console.error("Graphics repair failed", error);
  } finally {
    repairingGraphics = false;
    try {
      await store?.set("settings", settings);
    } catch {
      notify("Graphics settings could not be saved.", true);
    }
  }
}
function notify(message, error = false) {
  q("toast").textContent = message;
  q("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => (q("toast").hidden = true),
    error ? 9000 : 4500,
  );
}
function download(name, text, type = "application/json") {
  const a = document.createElement("a"),
    url = URL.createObjectURL(new Blob([text], { type }));
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
let dialogOrigin;
let updateLock = null,
  updateUnlockTimer;
function unlockUpdate(token) {
  if (updateLock !== token) return;
  updateLock = null;
  clearTimeout(updateUnlockTimer);
  q("stage").inert = false;
  q("header").inert = false;
}
navigator.serviceWorker?.addEventListener("message", async (event) => {
  const message = event.data || {};
  if (message.type === "RELEASE_QUERY") {
    event.ports[0]?.postMessage({
      token: message.token,
      release: new URL(".", import.meta.url).pathname
        .split("/")
        .filter(Boolean)
        .at(-1),
    });
    return;
  }
  if (message.type === "PACK_PROGRESS")
    q("offline-state").textContent =
      `Downloading offline pack ${message.completed}/${message.total}`;
  if (message.type === "CANCEL_UPDATE") unlockUpdate(message.token);
  if (message.type !== "PREPARE_UPDATE") return;
  let safe =
    view === "start" &&
    !savingResult &&
    !updateLock &&
    Date.now() < message.deadline;
  if (safe) {
    try {
      await workshop?.flush();
    } catch {
      safe = false;
    }
  }
  safe =
    safe && view === "start" && !updateLock && Date.now() < message.deadline;
  if (safe) {
    updateLock = message.token;
    q("modal").close();
    q("stage").inert = true;
    q("header").inert = true;
    updateUnlockTimer = setTimeout(
      () => unlockUpdate(message.token),
      Math.max(0, message.deadline - Date.now()),
    );
  }
  event.ports[0]?.postMessage({ token: message.token, safe });
});
function dialog(title, body, actions = [{ label: "Close" }]) {
  const modal = q("modal");
  if (modal.open) modal.close();
  dialogOrigin = document.activeElement;
  q("modal-title").textContent = title;
  q("modal-content").replaceChildren();
  if (typeof body === "string") {
    const p = document.createElement("p");
    p.textContent = body;
    q("modal-content").append(p);
  } else q("modal-content").append(body);
  q("modal-actions").replaceChildren();
  for (const [i, item] of actions.entries()) {
    const b = document.createElement("button");
    b.textContent = item.label;
    if (i === 0) b.className = "primary";
    b.onclick = async () => {
      if (!item.keep) modal.close();
      try {
        await item.action?.();
      } catch (e) {
        notify(e.message, true);
      }
    };
    q("modal-actions").append(b);
  }
  modal.showModal();
  q("modal-actions").querySelector("button").focus();
}
q("modal").addEventListener("close", () => {
  q("modal")
    .querySelectorAll('input[type="password"]')
    .forEach((input) => (input.value = ""));
  if (view === "race" && race?.state === "racing") q("world").focus();
  else dialogOrigin?.focus?.();
});
q("modal").addEventListener("cancel", (e) => {
  if (view === "race" && race?.state === "paused") {
    e.preventDefault();
    if (q("modal-title").textContent === "SETTINGS") pause();
    else resume();
  }
});
function clearInput() {
  keys.clear();
  held.clear();
  steering = 0;
  resetTouch?.();
}
function show(next) {
  if (updateLock)
    throw Error("Update in progress; wait for the yard to reopen.");
  prepareToken++;
  clearInput();
  if (["race", "result", "scene"].includes(view) && next !== view) sound.stop();
  view = next;
  document.body.dataset.view = next;
  lastRender = 0;
  q("stage").className = "view-" + next;
  document
    .querySelectorAll(".screen")
    .forEach((e) => (e.hidden = e.id !== "screen-" + next));
  q("footer").hidden = ["race", "result"].includes(next);
  q("context").textContent = {
    start: "THE YARD IS YOURS.",
    events: "CHOOSE YOUR CIRCUIT.",
    garage: "ASSEMBLE / COMPARE / TEST",
    workshop: "MAKE YOUR OWN LINE.",
    race: "RACING CLUB / 04",
    result: "EVERY LAP TEACHES YOU SOMETHING.",
    scene: "THE SCRAPYARD RACING CLUB.",
  }[next];
  if (next === "start") {
    world.load(compile(content.tracks[0].track));
    world.setCars([]);
    updateHome();
  }
  if (next === "workshop") requestAnimationFrame(() => workshop.draw());
  if (next === "race") q("world").focus();
}
function updateHome() {
  const equipped = assemble(progress.build, content.parts);
  q("home-build").textContent = SLOTS.map((s) => equipped[s].name).join(" / ");
  q("home-progress").textContent =
    content.parts.filter((p) => unlocked(p, progress)).length +
    " of 12 parts · " +
    progress.completed.length +
    "/12 events";
  const next = Math.min(12, Math.max(0, ...progress.completed) + 1);
  q("next-event").textContent =
    content.cups[Math.floor((next - 1) / 3)].name.toUpperCase();
  q("race-button").firstChild.textContent = progress.completed.length
    ? "Continue the league "
    : "Race the league ";
  q("daily-date").textContent =
    new Date().toISOString().slice(5, 10) + " · UTC";
  q("storage-state").textContent = store
    ? "Progress saved on this device"
    : "Storage unavailable · session play";
}
function miniSVG(track) {
  const c = compile(track),
    xs = c.samples.map((p) => p.x),
    zs = c.samples.map((p) => p.z),
    x = Math.min(...xs) - 15,
    z = Math.min(...zs) - 15,
    w = Math.max(...xs) - x + 15,
    h = Math.max(...zs) - z + 15;
  return `<svg viewBox="${x} ${z} ${w} ${h}" aria-label="${esc(track.name)} circuit layout" role="img"><path d="M${c.samples.map((p) => p.x + "," + p.z).join(" L")}Z" fill="none" stroke="#8b9775" stroke-width="15" stroke-linejoin="round"/><path d="M${c.samples.map((p) => p.x + "," + p.z).join(" L")}Z" fill="none" stroke="#d7c987" stroke-width="3"/><circle cx="${c.gates[0].x}" cy="${c.gates[0].z}" r="7" fill="#efe7c8"/></svg>`;
}
function events(mode) {
  eventMode = mode;
  show("events");
  q("events-title").textContent =
    mode === "league" ? "THE LEAGUE" : "TIME TRIAL";
  q("events-description").textContent =
    mode === "league"
      ? "Three races. Five rivals. Every finish moves you forward."
      : "Three laps, one car. Find a cleaner line against your personal-best ghost.";
  q("continue-cup").hidden = mode !== "league";
  q("restart-cup").hidden = mode !== "league";
  q("event-list").innerHTML = content.cups
    .map(
      (cup, ci) =>
        `<div class="cup-label"><span>0${ci + 1} /</span><h2>${esc(cup.name.toUpperCase())}</h2><span>${progress.completed.filter((n) => Math.floor((n - 1) / 3) === ci).length}/3 FINISHED</span></div><div class="track-grid">${content.tracks
          .slice(ci * 3, ci * 3 + 3)
          .map(({ track }, j) => {
            const i = ci * 3 + j,
              locked =
                mode === "league" && i > Math.max(0, ...progress.completed);
            return `<button class="track-card" data-track="${i}" ${locked ? "disabled" : ""}><span class="map">${miniSVG(track)}</span><span class="card-top"><span>RACE ${String(i + 1).padStart(2, "0")}</span><span>${locked ? "FINISH PREVIOUS EVENT" : progress.completed.includes(i + 1) ? "COMPLETED" : "3 LAPS"}</span></span><h3>${esc(track.name)}</h3><p>${Math.round(compile(track).length)} m · ${esc(track.scenePreset)} · ${track.patches.length ? "Mixed surface" : "Asphalt"}</p></button>`;
          })
          .join("")}</div>`,
    )
    .join("");
  q("event-list")
    .querySelectorAll("[data-track]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          const i = +b.dataset.track;
          if (mode === "trial") startTrack(i, "trial");
          else enterLeague(i);
        }),
    );
}
async function saveProgress() {
  if (!store) return;
  progress = await store.update("progress", (old) => {
    if ((old?.revision || 0) !== (progress.revision || 0))
      throw Error(
        "Progress changed in another tab. Reload before saving another garage or cup change.",
      );
    return { ...progress, revision: (progress.revision || 0) + 1 };
  });
}
async function newCup(index, difficulty) {
  progress.cup = {
    id: uid(),
    index,
    difficulty,
    seed: Math.floor(Math.random() * 2147483647),
    rivals: content.rivals
      .slice(index, index + 5)
      .concat(content.rivals)
      .slice(0, 5)
      .map((r) => r.id),
    rounds: [],
    pending: null,
  };
  await saveProgress();
}
async function enterLeague(index = null) {
  const difficulty = q("difficulty").value;
  const next = Math.min(11, Math.max(0, ...progress.completed));
  if (index === null)
    index =
      progress.cup && progress.cup.rounds.length < 3
        ? progress.cup.index * 3 + progress.cup.rounds.length
        : next;
  const ci = Math.floor(index / 3),
    pendingIndex =
      progress.cup && progress.cup.rounds.length < 3
        ? progress.cup.index * 3 + progress.cup.rounds.length
        : -1;
  if (index !== pendingIndex && progress.completed.includes(index + 1)) {
    await startTrack(index, "exhibition");
    return;
  }
  if (
    !progress.cup ||
    progress.cup.index !== ci ||
    progress.cup.rounds.length === 3
  ) {
    if (index % 3 !== 0 && progress.completed.includes(index + 1)) {
      await startTrack(index, "exhibition");
      return;
    }
    await newCup(ci, difficulty);
  } else if (progress.cup.difficulty !== difficulty) {
    dialog(
      "Start a new cup at this difficulty?",
      "The current cup standings will restart. Collected parts, completed events, and medals stay saved.",
      [
        {
          label: "Restart cup",
          action: async () => {
            await newCup(ci, difficulty);
            enterLeague(ci * 3);
          },
        },
        {
          label: "Keep current cup",
          action: () => {
            q("difficulty").value = progress.cup.difficulty;
            enterLeague();
          },
        },
      ],
    );
    return;
  }
  const current = progress.cup.index * 3 + progress.cup.rounds.length;
  if (index !== current) {
    await startTrack(index, "exhibition");
    return;
  }
  if (current % 3 === 0 && !progress.cup.pending && !progress.cup.openingSeen) {
    showStory(false, progress.cup.index, async () => {
      progress.cup.openingSeen = true;
      await saveProgress();
      await startTrack(current, "league");
    });
    return;
  }
  await startTrack(current, "league");
}
async function startTrack(index, mode, extra = {}) {
  try {
    const captured =
      mode === "league"
        ? resolveAttempt(
            progress.cup,
            index,
            content.tracks[index].track,
            progress.build,
          )
        : {
            track: clone(content.tracks[index].track),
            build: extra.build || progress.build,
          };
    const { track, ...options } = captured;
    await beginRace(track, mode, { ...options, ...extra, index });
  } catch (e) {
    if (mode !== "league" || !progress.cup) {
      notify(e.message, true);
      return;
    }
    dialog("Resume needs a fresh round", e.message, [
      {
        label: "Restart unfinished round",
        action: async () => {
          progress.cup.pending = null;
          await saveProgress();
          await startTrack(index, mode, extra);
        },
      },
      { label: "Keep saved attempt" },
    ]);
  }
}
async function daily(date = new Date().toISOString().slice(0, 10)) {
  const d = content.daily.find((d) => d.date === date);
  if (!d) {
    dialog(
      "This daily edition has ended",
      "This downloaded schedule does not include " +
        date +
        ". Time Trial and Workshop remain available. Install a newer release to get the next schedule.",
    );
    return;
  }
  const i = content.tracks.findIndex((t) => t.track.id === d.track),
    body = document.createElement("div");
  body.innerHTML = `<p class="eyebrow">${esc(date)} / UTC / DOWNLOADED EDITION</p><h3>${esc(content.tracks[i].track.name)}</h3><p>${SLOTS.map((s) => esc(content.parts.find((p) => p.id === d[s]).name)).join(" / ")}<br>3 laps · Standing start · Personal times on this device</p><p class="muted">The challenge date and build are fixed at the start, including if you cross midnight.</p>`;
  dialog("DAILY SPEC", body, [
    {
      label: "Race this specification",
      action: () =>
        startTrack(i, "daily", {
          build: Object.fromEntries(SLOTS.map((s) => [s, d[s]])),
          challenge: d.id,
          challengeDate: d.date,
        }),
    },
    { label: "Back" },
  ]);
}
async function beginRace(track, mode, options = {}) {
  const c = compile(track);
  if (!c.valid) {
    notify(c.problems[0].message, true);
    return;
  }
  clearInput();
  const token = ++prepareToken;
  try {
    const parts = options.parts || content.parts,
      raceSettings = {
        ...settings,
        ...(options.settings
          ? {
              assist: options.settings.assist,
              autoAccelerate: options.settings.autoAccelerate,
            }
          : {}),
      },
      build = clone(options.build || garageBuild),
      spec = assemble(build, parts),
      trackRevision = await hash(gameplay(track)),
      buildRevision = await hash(
        SLOTS.map((s) => {
          const { name, description, unlock, ...physical } = spec[s];
          return physical;
        }),
      ),
      assist =
        (raceSettings.assist ? "steering-on" : "steering-off") +
        ":" +
        (raceSettings.autoAccelerate ? "auto" : "manual"),
      laps =
        mode === "lesson"
          ? 1
          : mode === "exhibition"
            ? 2
            : mode === "workshop"
              ? track.laps
              : 3,
      key = comparisonKey({
        mode,
        trackRevision,
        buildRevision,
        laps,
        assist,
        challenge: options.challenge,
        challengeDate: options.challengeDate,
      }),
      best = await store?.get("best:" + key);
    if (token !== prepareToken) return;
    const cup = mode === "league" ? progress.cup : null,
      ai = mode === "league" || mode === "exhibition" || options.ai,
      roster = ai
        ? cup?.rivals || content.rivals.slice(0, 5).map((r) => r.id)
        : [],
      order = cup?.rounds.length
        ? [...cup.rounds.at(-1).classification].reverse().map((c) => c.id)
        : [...roster.slice(0, 3), "player", ...roster.slice(3)];
    const ids = ai ? order : ["player"],
      cars = ids.map((id, grid) => {
        const rival = (options.rivals || content.rivals).find(
            (r) => r.id === id,
          ),
          cs = id === "player" ? spec : assemble(rival, parts),
          car = createCar(cs, c.grid[ai ? grid : 0], id, grid);
        Object.assign(car, {
          name: rival?.name || "You",
          color: rival?.color || "#e8c64c",
          number: rival?.number || "04",
          personality: rival?.pace || 1,
        });
        return car;
      });
    race = {
      id: uid(),
      state: "countdown",
      countdown: 3,
      time: 0,
      tick: 0,
      track: c,
      trackRevision,
      buildRevision,
      mode,
      key,
      build,
      laps,
      difficulty:
        mode === "exhibition"
          ? "relaxed"
          : cup?.difficulty || q("difficulty").value,
      cars,
      ghost: [],
      bestGhost: best?.ghost || null,
      previousBest: best?.result || null,
      challenge: options.challenge,
      challengeDate: options.challengeDate,
      cupId: cup?.id,
      round: cup?.rounds.length,
      index: options.index,
      ai,
      settingsSnapshot: clone(raceSettings),
      seed: options.seed ?? (cup?.seed || 1) + (options.index || 0),
      rivals: clone(options.rivals || content.rivals),
      options: clone(options),
      degraded: 0,
      practice:
        mode === "lesson"
          ? {
              heading: cars[0].heading,
              accelerate: false,
              steer: false,
              brake: false,
              boost: false,
            }
          : null,
    };
    if (cup) {
      cup.pending = captureAttempt(race, parts);
      await saveProgress();
    }
    if (token !== prepareToken) return;
    world.load(c);
    world.setCars(cars);
    world.setGhost(spec, race.bestGhost);
    world.target.set(
      cars.find((c) => c.id === "player").x,
      0,
      cars.find((c) => c.id === "player").z,
    );
    show("race");
    accumulator = 0;
    lastTime = performance.now();
    q("countdown").textContent = "3";
    q("race-title").textContent =
      track.name.toUpperCase() +
      " / " +
      {
        trial: "TIME TRIAL",
        daily: "DAILY SPEC",
        workshop: "WORKSHOP TEST",
        lesson: "DRIVING LESSON",
        exhibition: "QUICK RACE · 2 LAPS",
        league: race.difficulty.toUpperCase(),
      }[mode];
    document.body.classList.toggle("touch", settings.touch);
    document.body.dataset.auto = String(raceSettings.autoAccelerate);
    q("practice-progress").hidden = mode !== "lesson";
    sound.enabled = settings.sound;
    sound.musicEnabled = settings.music;
    await sound.activate();
    updateHUD();
  } catch (e) {
    notify("Could not prepare race: " + e.message, true);
  }
}
function pause(reason = "Take a breath. The race clock is stopped.") {
  if (view !== "race" || !race || race.state === "finished") return;
  if (race.state !== "paused")
    race.beforePause =
      race.state === "resuming" ? race.resumeState : race.state;
  race.state = "paused";
  updateHUD();
  clearInput();
  sound.stop();
  const actions = [
    world && !world.contextLost
      ? { label: "Resume", action: resume }
      : { label: "Repair graphics", action: () => repairGraphics() },
    { label: "Settings", action: settingsDialog },
    {
      label: "Reset car to checkpoint",
      action: () => {
        resetCar(
          race.cars.find((c) => c.id === "player"),
          race.track,
        );
        resume();
      },
    },
    { label: "Restart race", action: () => restart() },
    {
      label: race.mode === "workshop" ? "Return to editor" : "Leave race",
      action: abandon,
    },
  ];
  dialog("PAUSED", reason, actions);
}
function resume() {
  if (!world?.available() || !world.render(race, view, settings, 0)) {
    graphicsInterrupted();
    return;
  }
  q("modal").close();
  if (race) {
    race.resumeState = race.beforePause || "racing";
    race.resumeRemaining = 0.7;
    race.state = "resuming";
    q("countdown").textContent = "READY";
    lastTime = performance.now();
    accumulator = 0;
    clearInput();
    q("world").focus();
    sound.activate();
  }
}
function restart() {
  q("modal").close();
  beginRace(clone(race.track.source), race.mode, {
    ...race.options,
    build: race.build,
  });
}
function abandon() {
  if (race.mode === "workshop") {
    q("modal").close();
    const fromGarage = race.options.garageTest;
    race = null;
    if (fromGarage) openGarage(garageOrigin);
    else show("workshop");
    return;
  }
  dialog(
    "Leave this attempt?",
    "Your completed cup rounds stay saved. This unfinished round can be restarted from the beginning.",
    [
      {
        label: "Leave race",
        action: async () => {
          const abandoned = race;
          abandoned.dnf = true;
          abandoned.state = "finished";
          try {
            if (store)
              progress = await store.commitResult(
                resultOf(abandoned),
                null,
                abandoned.cupId,
                abandoned.round,
              );
          } catch (e) {
            notify(
              "Attempt history was not saved. Completed rounds remain unchanged.",
              true,
            );
          }
          race = null;
          show("start");
        },
      },
      { label: "Keep racing", action: resume },
    ],
  );
}
function input() {
  const down = (action) => keys.has(settings.bindings[action]);
  let steer =
      (down("right") || keys.has("ArrowRight") || held.has("right") ? 1 : 0) -
      (down("left") || keys.has("ArrowLeft") || held.has("left") ? 1 : 0) +
      steering,
    throttle =
      down("throttle") ||
      keys.has("ArrowUp") ||
      held.has("throttle") ||
      held.has("boost")
        ? 1
        : 0,
    brake = down("brake") || keys.has("ArrowDown") || held.has("brake") ? 1 : 0,
    handbrake = down("handbrake") || held.has("handbrake"),
    boost =
      down("boost") ||
      (settings.bindings.boost === "ShiftLeft" && keys.has("ShiftRight")) ||
      held.has("boost");
  const pad = [...(navigator.getGamepads?.() || [])].find(Boolean);
  if (pad) {
    if (Math.abs(pad.axes[0]) > 0.12) steer = pad.axes[0];
    throttle = Math.max(throttle, pad.buttons[7]?.value || 0);
    brake = Math.max(brake, pad.buttons[6]?.value || 0);
    handbrake ||= pad.buttons[0]?.pressed;
    boost ||= pad.buttons[1]?.pressed;
  }
  if (race.settingsSnapshot.autoAccelerate && !brake) throttle = 1;
  steer *= settings.sensitivity;
  if (race.settingsSnapshot.assist && !handbrake) {
    const p = race.cars.find((c) => c.id === "player");
    if (Math.hypot(p.vx, p.vz) > 3) {
      const n = nearest(race.track, p.x, p.z);
      steer += clamp(wrap(n.heading - p.heading) * 0.35, -0.15, 0.15);
    }
  }
  return { steer: clamp(steer, -1, 1), throttle, brake, handbrake, boost };
}
function pollGamepadPause() {
  const pad = [...(navigator.getGamepads?.() || [])].find(Boolean);
  const pressed = !!pad?.buttons[9]?.pressed;
  if (pressed && !pollGamepadPause.held) {
    if (race.state === "paused") {
      if (q("modal-title").textContent === "SETTINGS") pause();
      else resume();
    } else pause();
  }
  pollGamepadPause.held = pressed;
}
function updateHUD() {
  if (!race) return;
  const p = race.cars.find((c) => c.id === "player"),
    position = classification(race).findIndex((c) => c.id === "player") + 1;
  q("hud-place").innerHTML =
    position + "<small>/" + race.cars.length + "</small>";
  q("hud-lap").innerHTML =
    Math.min(p.lap + 1, race.laps) + "<small>/" + race.laps + "</small>";
  q("hud-time").textContent = time(Math.round(race.time * 1000));
  q("hud-speed").textContent = Math.round(Math.hypot(p.vx, p.vz) * 3.6);
  q("boost-bar").max = p.spec.utility.capacity;
  q("boost-bar").value = p.charge;
  q("charge-value").textContent = Math.round(p.charge);
  let message =
    p.resetTime > 0
      ? "RESETTING · " + p.resetTime.toFixed(1) + "s"
      : p.wrongTime > 1
        ? "Wrong way · follow the checkpoint markers"
        : p.stuckTime > 4
          ? "Stuck? Press R or Reset car."
          : race.mode === "lesson"
            ? practicePrompt(race.practice, {
                ...settings,
                autoAccelerate: race.settingsSnapshot.autoAccelerate,
              })
            : "";
  q("race-message").textContent = message;
  if (race.practice)
    q("practice-progress").textContent = [
      "accelerate",
      "steer",
      "brake",
      "boost",
    ]
      .map((k) => (race.practice[k] ? "✓ " : "○ ") + k)
      .join("   ");
  const here = nearest(race.track, p.x, p.z),
    ahead = atDistance(race.track, here.s + 28),
    turn = wrap(ahead.heading - here.heading);
  q("corner-hint").textContent = p.boosting
    ? "BOOSTING"
    : p.surface !== "asphalt"
      ? p.surface.toUpperCase() + " · easy on the throttle"
      : Math.abs(turn) > 0.18
        ? (turn > 0 ? "↱ Right bend" : "↰ Left bend") + " · brake early"
        : "Straight · find your line";
  const canvas = q("minimap"),
    ctx = canvas.getContext("2d"),
    samples = race.track.samples,
    minX = Math.min(...samples.map((p) => p.x)) - 15,
    minZ = Math.min(...samples.map((p) => p.z)) - 15,
    w = Math.max(...samples.map((p) => p.x)) - minX + 15,
    h = Math.max(...samples.map((p) => p.z)) - minZ + 15,
    scale = Math.min(220 / w, 160 / h),
    offX = (240 - w * scale) / 2,
    offZ = (180 - h * scale) / 2;
  ctx.clearRect(0, 0, 240, 180);
  const xy = (c) => [offX + (c.x - minX) * scale, offZ + (c.z - minZ) * scale];
  ctx.beginPath();
  samples.forEach((p, i) => {
    const [x, y] = xy(p);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.closePath();
  ctx.strokeStyle = "#8d9c78";
  ctx.lineWidth = 6;
  ctx.stroke();
  const g = race.track.gates[p.nextGate],
    [gx, gy] = xy(g);
  ctx.fillStyle = "#f1d36c";
  ctx.fillRect(gx - 4, gy - 4, 8, 8);
  for (const car of race.cars) {
    const [x, y] = xy(car);
    ctx.fillStyle = car.id === "player" ? "#ffe8a6" : car.color;
    ctx.beginPath();
    ctx.arc(x, y, car.id === "player" ? 4 : 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
async function finish() {
  if (savingResult || !race || race.state !== "finished" || typeof race.dnf !== "boolean") return;
  savingResult = true;
  sound.stop();
  q("countdown").textContent = "";
  const result = resultOf(race);
  race.result = result;
  world.resultElapsed = 0;
  show("result");
  q("result-kicker").textContent = result.dnf
    ? "ATTEMPT ENDED"
    : race.mode === "workshop"
      ? "WORKSHOP / TEST COMPLETE"
      : race.mode === "lesson"
        ? "YOU KNOW THE WAY"
        : "FINISH LINE / " + race.mode.toUpperCase();
  const place = result.classification.findIndex((c) => c.id === "player") + 1;
  q("result-title").textContent = result.dnf
    ? "TRY THAT AGAIN."
    : race.mode === "lesson"
      ? Object.values(race.practice).filter((v) => v === true).length === 4
        ? "READY TO RACE."
        : "LAP COMPLETE."
      : place === 1 && race.cars.length > 1
        ? "FIRST HOME."
        : race.previousBest && result.elapsedMs < race.previousBest.elapsedMs
          ? "NEW BEST."
          : "NICE RUN.";
  q("result-track").textContent =
    result.trackName +
    " · " +
    result.laps +
    " laps · " +
    (race.settingsSnapshot.autoAccelerate
      ? "Auto accelerate"
      : "Manual throttle");
  q("result-stats").innerHTML =
    `<div><span>RACE TIME</span><strong>${result.dnf ? "DNF" : time(result.elapsedMs)}</strong></div><div><span>BEST LAP</span><strong>${result.splits.length ? time(Math.min(...result.splits)) : "—"}</strong></div><div><span>PLACE</span><strong>${place} / ${race.cars.length}</strong></div>`;
  q("result-ranking").innerHTML =
    `<table class="ranking"><tbody>${result.classification.map((c, i) => `<tr class="${c.id === "player" ? "player" : ""}"><td>${i + 1}</td><td>${esc(c.name)}</td><td>${c.time === null ? "Behind" : time(c.time)}</td></tr>`).join("")}</tbody></table><p class="muted">${result.splits.map((s, i) => "Lap " + (i + 1) + " · " + time(s)).join(" / ")}</p>`;
  q("result-tip").textContent = result.dnf
    ? "The cup remains before this round. Retry whenever you are ready."
    : result.contacts === 0
      ? "A clean run. No solid contacts recorded."
      : result.resets
        ? `${result.resets} reset${result.resets === 1 ? "" : "s"} this run. Each reset kept the race clock running.`
        : `${result.contacts} contact steps recorded. Try braking before the bend.`;
  q("result-reward").textContent = "";
  q("result-save").textContent = "Saving result…";
  renderResultActions();
  await persistResult();
  if (view === "result" && race?.result === result && !result.dnf)
    sound.celebrate();
  savingResult = false;
}
function renderResultActions() {
  const root = q("result-actions");
  root.replaceChildren();
  const button = (label, action, primary = false) => {
    const b = document.createElement("button");
    b.textContent = label;
    if (primary) b.className = "primary";
    b.onclick = action;
    root.append(b);
  };
  if (race.mode === "workshop")
    button(
      race.options.published
        ? "Back to yard"
        : race.options.garageTest
          ? "Return to garage"
          : "Return to editor",
      () => {
        const fromGarage = race.options.garageTest,
          published = race.options.published;
        race = null;
        if (published) {
          show("start");
          return;
        }
        if (fromGarage) openGarage(garageOrigin);
        else show("workshop");
      },
      true,
    );
  else if (race.mode === "league" && !race.result.dnf && race.saved)
    button(
      progress.cup?.rounds.length === 3 ? "Cup standings" : "Next race",
      () => (progress.cup.rounds.length === 3 ? cupResult() : enterLeague()),
      true,
    );
  else if (race.mode === "lesson")
    button("Enter the league", () => enterLeague(), true);
  button(
    "Race again",
    restart,
    ["trial", "daily", "exhibition"].includes(race.mode),
  );
  if (!race.saved) button("Retry save", persistResult);
  button("Share result", shareResult);
  if (
    ["trial", "daily"].includes(race.mode) &&
    !race.result.dnf &&
    !race.result.performanceDegraded
  )
    button("Add to leaderboard", showSharedTimes);
  button("Download scorecard", async () => {
    try {
      const invitation = invitationForRace();
      const blob = await scorecard(race.result, invitation);
      download("scrap-league-scorecard.png", blob, "image/png");
    } catch (e) {
      notify(e.message, true);
    }
  });
  button("Download result", () =>
    download("scrap-league-result.json", JSON.stringify(race.result, null, 2)),
  );
  if (race.mode !== "workshop")
    button("Back to yard", () => {
      race = null;
      show("start");
    });
}
async function persistResult() {
  const finished = race;
  try {
    const result = finished.result;
    if (!store)
      throw Error("Storage is unavailable. Download your result to keep it.");
    const before = [...progress.completed],
      ghost = new Float32Array(race.ghost.flat());
    if (ghost.byteLength > 512 * 1024)
      throw Error("Ghost exceeded its storage limit.");
    progress = await store.commitResult(
      result,
      ghost,
      finished.cupId,
      finished.round,
    );
    if (race !== finished) return;
    race.saved = true;
    q("result-save").textContent = "Result saved on this device.";
    if (
      race.mode === "workshop" &&
      !result.dnf &&
      workshop.track &&
      !race.options.garageTest &&
      !race.options.published
    )
      await workshop.markTest(race.trackRevision);
    const newly = progress.completed.filter((n) => !before.includes(n)),
      rewards =
        result.mode === "league"
          ? content.parts.filter((p) => newly.includes(p.unlock))
          : [];
    if (rewards.length)
      q("result-reward").textContent =
        "UNLOCKED · " + rewards.map((p) => p.name).join(" + ");
    renderResultActions();
  } catch (e) {
    if (race !== finished) return;
    q("result-save").textContent = "Result not saved: " + e.message;
    race.saved = false;
    renderResultActions();
  }
}
function showStory(final, index, continueAction) {
  const text = final ? FINAL_SCENE : CUP_SCENES[index];
  show("scene");
  world.cinematic(
    compile(content.tracks[final ? 11 : index * 3].track),
    assemble(progress.build, content.parts),
    final,
  );
  sound.celebrate(final);
  q("scene-kicker").textContent = final
    ? "12 EVENTS / 4 CUPS / YOUR CLUB"
    : content.cups[index].name;
  q("scene-title").textContent = text.title;
  q("scene-copy").textContent = text.caption;
  q("scene-badges").textContent = final
    ? content.cups.map((c) => c.name + " ✓").join(" · ")
    : "";
  q("scene-continue").textContent = final
    ? "Build the next circuit"
    : "Skip to the race";
  q("scene-continue").onclick = async () => {
    try {
      await continueAction();
    } catch (e) {
      notify(e.message, true);
    }
  };
  q("scene-continue").focus();
}
function cupResult() {
  if (progress.cup.index === 3 && progress.cup.rounds.length === 3) {
    showStory(true, 3, () => openWorkshop());
    return;
  }
  const cup = progress.cup,
    rows = standings(cup.rounds, ["player", ...cup.rivals]),
    place = rows.findIndex((r) => r.id === "player") + 1,
    body = document.createElement("div");
  body.innerHTML = `<p>${esc(content.cups[cup.index].name)} · ${esc(cup.difficulty)} · All three rounds complete</p><table class="ranking">${rows.map((r, i) => `<tr class="${r.id === "player" ? "player" : ""}"><td>${i + 1}</td><td>${r.id === "player" ? "You" : esc(content.rivals.find((c) => c.id === r.id).name)}</td><td>${r.points} points</td></tr>`).join("")}</table><p>${cup.index === 3 ? "The grandstand is open. All twelve circuits are behind you. Now build something of your own." : "Your next cup is ready. Collected parts stay with you."}</p>`;
  dialog(
    cup.index === 3
      ? "THE YARD IS YOURS."
      : place === 1
        ? "CUP WINNER."
        : "CUP COMPLETE.",
    body,
    [
      {
        label: cup.index === 3 ? "Build your circuit" : "Next cup",
        action: async () => {
          if (cup.index === 3) openWorkshop();
          else {
            await newCup(cup.index + 1, cup.difficulty);
            enterLeague((cup.index + 1) * 3);
          }
        },
      },
      {
        label: "Back to yard",
        action: () => {
          race = null;
          show("start");
        },
      },
    ],
  );
}
function invitationForRace() {
  return resultInvitation(race.result, {
    date:
      race.result.challengeDate ||
      content.daily.find((d) => d.id === race.result.challenge)?.date ||
      "",
    slug: race.track.source.slug,
    publishedId: race.options.published ? race.track.source.id : "",
  });
}
async function shareResult() {
  return shareInvitation(invitationForRace(), {
    copied: () => notify("Invitation and link copied."),
    manual: (complete) => {
      const body = document.createElement("label");
      body.textContent = "Copy the invitation and link";
      const text = document.createElement("textarea");
      text.value = complete;
      text.readOnly = true;
      text.rows = 8;
      body.append(text);
      dialog("Share your result", body, [
        {
          label: "Select invitation",
          action: () => {
            dialog("Copy invitation", body, [
              {
                label: "Download text",
                action: () =>
                  download("scrap-league-result.txt", complete, "text/plain"),
              },
              { label: "Close" },
            ]);
            text.focus();
            text.select();
          },
        },
        {
          label: "Download text",
          action: () =>
            download("scrap-league-result.txt", complete, "text/plain"),
        },
        { label: "Close" },
      ]);
      text.focus();
      text.select();
    },
  });
}
function openGarage(origin = "start") {
  garageOrigin = origin;
  garageBuild = clone(
    origin === "workshop"
      ? workshop.testBuild || progress.build
      : progress.build,
  );
  garageUndo = clone(garageBuild);
  show("garage");
  world.garage();
  refreshGarage();
}
function refreshGarage() {
  const spec = assemble(garageBuild, content.parts);
  world.setCars([{ spec }]);
  q("garage-name").textContent = spec.chassis.name.toUpperCase();
  q("garage-context").textContent =
    garageOrigin === "workshop"
      ? "WORKSHOP / EVERY PART AVAILABLE"
      : "LEAGUE BUILD";
  q("garage-build").textContent = [
    spec.engine.name,
    spec.tires.name,
    spec.utility.name,
  ].join(" / ");
  q("garage-stats").innerHTML = [
    ["MASS", spec.mass, "KG"],
    ["GOVERNOR", Math.round(spec.engine.governor * 3.6), "KM/H"],
    ["ASPHALT GRIP", spec.tires.asphalt.toFixed(2), "μ"],
    ["BOOST", spec.utility.capacity, "MAX"],
  ]
    .map(
      ([a, b, c]) =>
        `<div><span>${a}</span><strong>${b} <small>${c}</small></strong></div>`,
    )
    .join("");
  q("part-slots").innerHTML = SLOTS.map(
    (slot) =>
      `<div class="part-slot"><label>${slot[0].toUpperCase() + slot.slice(1)}<select data-slot="${slot}">${content.parts
        .filter((p) => p.slot === slot)
        .map(
          (p) =>
            `<option value="${p.id}" ${p.id === garageBuild[slot] ? "selected" : ""}>${esc(p.name)}${garageOrigin !== "workshop" && !unlocked(p, progress) ? " · Finish event " + p.unlock : ""}</option>`,
        )
        .join(
          "",
        )}</select></label><p>${esc(spec[slot].description)}</p>${garageOrigin !== "workshop" && !unlocked(spec[slot], progress) ? '<p class="locked">Preview only · finish event ' + spec[slot].unlock + " to equip. All parts can be tested in Workshop.</p>" : ""}</div>`,
  ).join("");
  q("part-slots")
    .querySelectorAll("select")
    .forEach(
      (s) =>
        (s.onchange = () => {
          garageBuild[s.dataset.slot] = s.value;
          refreshGarage();
        }),
    );
  q("garage-status").textContent =
    "Values are physical specifications, not an overall performance rating.";
}
async function closeGarage() {
  const legal = SLOTS.every((s) =>
    unlocked(assemble(garageBuild, content.parts)[s], progress),
  );
  if (garageOrigin === "workshop") {
    workshop.testBuild = clone(garageBuild);
    show("workshop");
    return;
  }
  if (!legal) {
    notify(
      "That build contains locked parts. Preview it in Workshop or choose unlocked parts.",
      true,
    );
    return;
  }
  progress.build = clone(garageBuild);
  q("garage-status").textContent = "Saving build…";
  try {
    await saveProgress();
    show("start");
  } catch (e) {
    notify(e.message, true);
  }
}
let openingWorkshop, openingWorkshopToken;
function openWorkshop() {
  if (openingWorkshop && openingWorkshopToken === prepareToken)
    return openingWorkshop;
  const entryToken = ++prepareToken;
  openingWorkshopToken = entryToken;
  const pending = (async () => {
    await workshop.flush();
    let recovery = false;
    if (!workshop.track) {
      const { records, errors } = await readWorkshopDrafts(store);
      if (prepareToken !== entryToken) return;
      // On an incomplete listing, avoid silently selecting an older saved draft.
      // A new identity preserves every existing record for backup/recovery.
      recovery = errors.length > 0;
      const saved = recovery ? null : records.at(-1) || null;
      await workshop.open(
        saved?.track || duplicateTrack(content.tracks[0].track),
        saved,
      );
    }
    if (prepareToken !== entryToken) return;
    show("workshop");
    workshop.draw();
    if (recovery)
      dialog(
        "Saved drafts need recovery",
        "Some saved drafts could not be read. They have been kept unchanged. This is a separate working copy. Files still offers readable drafts and Export HTML; Settings offers Download backup.",
        [{ label: "Continue with separate copy" }],
      );
  })().finally(() => {
    if (openingWorkshop === pending) openingWorkshop = null;
  });
  openingWorkshop = pending;
  return pending;
}
function settingsDialog() {
  if (view === "race" && race?.state !== "paused") {
    race.beforePause = race.state;
    race.state = "paused";
    clearInput();
    sound.stop();
  }
  const body = document.createElement("div");
  body.className = "settings-grid";
  const labels = {
    sound: "Sound",
    music: "Music",
    autoAccelerate: "Auto accelerate (next race)",
    assist: "Gentle steering assistance (next race)",
    northUp: "Fixed north-up camera",
    lowEffects: "Reduced visual effects",
    safeGraphics: "Lower canvas resolution",
    reducedMotion: "Reduced motion",
    ghost: "Show compatible personal-best ghost",
    touch: "Show touch controls",
    leftHanded: "Swap touch control sides",
    largeHud: "Larger race display",
  };
  body.innerHTML =
    Object.entries(labels)
      .map(
        ([k, v]) =>
          `<label class="check"><input type="checkbox" data-setting="${k}" ${settings[k] ? "checked" : ""}>${v}</label>`,
      )
      .join("") +
    '<p class="muted">Assistance choices are captured when the race starts and separate personal-best comparisons. The current keyboard bindings are listed below. Gamepad uses the left stick, triggers, A to slide, B to boost and Start to pause.</p><div class="command-row"><button id="install-app">Install game</button><button id="update-app">Check offline pack</button></div><p class="muted">Owner publishing and shared casual Trial/Daily boards are available on this Pagelove host. Times are community-submitted and may be forged; they are not competitive verification.</p>';
  body.querySelectorAll("[data-setting]").forEach(
    (c) =>
      (c.onchange = async () => {
        settings[c.dataset.setting] = c.checked;
        if (c.dataset.setting === "safeGraphics") {
          await repairGraphics(c.checked);
          return;
        }
        sound.enabled = settings.sound;
        sound.musicEnabled = settings.music;
        document.body.classList.toggle("touch", settings.touch);
        q("sound-toggle").textContent = settings.sound
          ? "Sound on"
          : "Sound off";
        if (settings.sound) await sound.activate();
        applyPreferences();
        try {
          await store?.set("settings", settings);
        } catch (e) {
          notify("Settings could not be saved.", true);
        }
      }),
  );
  const controls = document.createElement("div");
  controls.className = "preference-controls";
  controls.innerHTML = `<h3>Sound and controls</h3>${[
    ["effectsVolume", "Effects volume", 0, 1, 0.05],
    ["musicVolume", "Music volume", 0, 1, 0.05],
    ["sensitivity", "Steering sensitivity", 0.5, 1.5, 0.05],
  ]
    .map(
      ([key, label, min, max, step]) =>
        `<label>${label}<input type="range" data-range="${key}" min="${min}" max="${max}" step="${step}" value="${settings[key]}"><output data-value="${key}">${settings[key]}</output></label>`,
    )
    .join(
      "",
    )}<label>Touch steering<select id="touch-layout"><option value="pad">Analog pad</option><option value="buttons">Two buttons</option></select></label><h3>Keyboard bindings</h3><p class="muted">Select a field and press a key. Arrow keys also remain available for driving.</p><div class="binding-grid">${Object.entries(
    settings.bindings,
  )
    .map(
      ([action, code]) =>
        `<label>${action}<input data-binding="${action}" value="${esc(code)}" readonly aria-label="Key for ${action}"></label>`,
    )
    .join("")}</div>`;
  body.append(controls);
  body.prepend(driverProfile());
  const repair = document.createElement("button"),
    graphicsStatus = document.createElement("p");
  repair.textContent = "Repair graphics";
  repair.onclick = () => repairGraphics();
  graphicsStatus.className = "muted";
  graphicsStatus.textContent =
    "Canvas 2D racing. Repair graphics recreates the view and keeps your progress. Release " +
    new URL(".", import.meta.url).pathname.split("/").filter(Boolean).at(-1) +
    ".";
  body.prepend(repair, graphicsStatus);
  controls.querySelector("#touch-layout").value = settings.touchLayout;
  const persistPreferences = async () => {
    applyPreferences();
    try {
      await store?.set("settings", settings);
    } catch {
      notify("Settings could not be saved.", true);
    }
  };
  controls.querySelectorAll("[data-range]").forEach(
    (input) =>
      (input.oninput = () => {
        settings[input.dataset.range] = Number(input.value);
        controls.querySelector(
          `[data-value="${input.dataset.range}"]`,
        ).textContent = input.value;
        persistPreferences();
      }),
  );
  controls.querySelector("#touch-layout").onchange = (e) => {
    settings.touchLayout = e.target.value;
    persistPreferences();
  };
  controls.querySelectorAll("[data-binding]").forEach(
    (input) =>
      (input.onkeydown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          bindKey(settings, input.dataset.binding, e.code);
          input.value = e.code;
          persistPreferences();
        } catch (error) {
          notify(error.message, true);
        }
      }),
  );
  appendDataControls(body);
  body.querySelector("#install-app").onclick = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      installPrompt = null;
    } else
      notify(
        "Use your browser’s Install app or Add to Home Screen command when available.",
      );
  };
  body.querySelector("#update-app").onclick = () => checkOffline(true);
  dialog("SETTINGS", body, [
    {
      label: view === "race" ? "Back to pause" : "Done",
      action: () => {
        if (view === "race") pause();
      },
    },
  ]);
}
function applyPreferences() {
  const hint = bindingHint(settings);
  document.querySelector(".keyboard-hint").textContent = hint;
  q("world").setAttribute("aria-label", "Overhead racing view. " + hint);
  document.querySelector(".start-controls").textContent = settings.touch
    ? "Use the steering wheel and brake before bends. " +
      (settings.autoAccelerate
        ? "Auto throttle is on."
        : "Hold GAS to accelerate. BOOST also holds the throttle, so you can steer with your other thumb.")
    : hint;
  document.body.classList.toggle("touch", settings.touch);
  document.body.classList.toggle("large-hud", settings.largeHud);
  document.body.classList.toggle("left-handed", settings.leftHanded);
  document.body.dataset.touchLayout = settings.touchLayout;
  sound.enabled = settings.sound;
  sound.musicEnabled = settings.music;
  sound.effectsVolume = settings.effectsVolume;
  sound.musicVolume = settings.musicVolume;
  sound.levels();
  if (!settings.sound) sound.stop();
}
function appendDataControls(body) {
  const root = document.createElement("section");
  root.className = "data-controls";
  const heading = document.createElement("h3");
  heading.textContent = "Saves and recovery";
  root.append(heading);
  const add = (text, action) => {
    const button = document.createElement("button");
    button.textContent = text;
    button.disabled = !store;
    button.onclick = async () => {
      try {
        await action();
      } catch (e) {
        notify(e.message, true);
      }
    };
    root.append(button);
    return button;
  };
  add("Download full backup", async () =>
    download(
      "scrap-league-backup.json",
      JSON.stringify(await store.exportBackup()),
    ),
  );
  add("Submission status", async () => {
    const entries = await Promise.all(
        (await store.keys("outbox:")).map((k) => store.get(k)),
      ),
      body = document.createElement("div");
    if (!entries.length) body.textContent = "No times are queued.";
    for (const entry of entries) {
      const p = document.createElement("p");
      p.textContent =
        entry.run.alias +
        " · " +
        time(entry.run.elapsedMs) +
        " · " +
        entry.state +
        (entry.message ? " · " + entry.message : "");
      body.append(p);
    }
    dialog("Submission status", body, [
      {
        label: "Retry connection",
        action: async () => {
          if (!boards.enabled)
            throw Error("Shared boards are not configured on this host yet.");
          await store.retryRuns();
          await boards.pump();
          notify("Submission queue checked.");
        },
      },
      { label: "Close" },
    ]);
  });
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.hidden = true;
  root.append(input);
  const restore = add("Restore backup", () => input.click());
  restore.disabled = !store || view === "race" || view === "result";
  input.onchange = async () => {
    const file = input.files[0];
    input.value = "";
    if (!file) return;
    try {
      if (file.size > 64 * 1024 * 1024) throw Error("Backup limit is 64 MiB.");
      const backup = JSON.parse(await file.text());
      dialog(
        "Restore this backup?",
        "This replaces saved progress, preferences, drafts and personal records. A backup of the current saves will download first.",
        [
          {
            label: "Back up and restore",
            action: async () => {
              await workshop.flush();
              download(
                "scrap-league-before-restore.json",
                JSON.stringify(await store.exportBackup()),
              );
              await store.importBackup(backup);
              await reloadSavedState();
              notify("Backup restored.");
            },
          },
          { label: "Keep current saves", action: settingsDialog },
        ],
      );
    } catch (e) {
      notify(e.message, true);
    }
  };
  const choices = [
    ["settings", "Reset preferences", "preferences"],
    [
      "progression",
      "Reset League progress",
      "League progress and the current cup",
    ],
    ["presets", "Reset garage presets", "saved garage presets"],
    ["bests", "Reset personal records", "personal bests and their ghosts"],
    ["drafts", "Reset Workshop drafts", "Workshop drafts, snapshots and Trash"],
  ];
  for (const [category, label, description] of choices) {
    const button = add(label, () =>
      dialog(
        label + "?",
        "This clears only " +
          description +
          ". Download a full backup first if you want to keep a copy.",
        [
          {
            label: "Reset",
            action: async () => {
              await workshop.flush();
              await store.reset(category);
              await reloadSavedState();
              notify(label + " completed.");
            },
          },
          { label: "Keep saves", action: settingsDialog },
        ],
      ),
    );
    button.disabled = !store || view === "race" || view === "result";
  }
  body.append(root);
}
async function reloadSavedState() {
  progress = await store.get("progress");
  settings = normalizeSettings(await store.get("settings"));
  workshop.track = null;
  workshop.saveChain = Promise.resolve();
  workshop.saveError = null;
  workshop.generation++;
  race = null;
  applyPreferences();
  show("start");
}
q("home").onclick = async () => {
  if (view === "race") {
    pause();
    return;
  }
  const homeToken = ++prepareToken;
  try {
    await workshop?.flush();
    if (prepareToken === homeToken) show("start");
  } catch (error) {
    notify(
      error.message +
        " Your draft remains open. Export it or save a copy before leaving.",
      true,
    );
  }
};
document
  .querySelectorAll("[data-home]")
  .forEach((b) => (b.onclick = () => show("start")));
q("quick-race").onclick = () =>
  beginRace(clone(content.tracks[0].track), "exhibition", {
    build: progress.build,
  });
q("leaderboard-button").onclick = openLeaderboards;
q("race-button").onclick = () => events("league");
q("trial-button").onclick = () => events("trial");
q("continue-cup").onclick = () => enterLeague();
q("restart-cup").onclick = () => {
  if (!progress.cup) {
    enterLeague();
    return;
  }
  dialog(
    "Restart this cup?",
    "Current cup points will restart. Collected parts, medals and completed events stay saved.",
    [
      {
        label: "Restart cup",
        action: async () => {
          const index = progress.cup.index;
          await newCup(index, q("difficulty").value);
          await startTrack(index * 3, "league");
        },
      },
      { label: "Keep current cup" },
    ],
  );
};
q("daily-button").onclick = () => daily();
q("garage-button").onclick = () => openGarage();
q("workshop-button").onclick = openWorkshop;
q("lesson-button").onclick = () => startTrack(0, "lesson");
q("garage-back").onclick = closeGarage;
q("garage-test").onclick = () =>
  beginRace(
    clone(
      garageOrigin === "workshop" ? workshop.track : content.tracks[0].track,
    ),
    "workshop",
    { build: garageBuild, ai: false, garageTest: true },
  );
q("restore-build").onclick = () => {
  const prior = clone(garageBuild);
  garageBuild = clone(garageUndo || STARTER);
  garageUndo = prior;
  refreshGarage();
};
q("save-build").onclick = () => {
  const body = document.createElement("label");
  body.textContent = "Preset name";
  const input = document.createElement("input");
  input.maxLength = 32;
  input.value = "My " + assemble(garageBuild, content.parts).chassis.name;
  body.append(input);
  dialog("Save build", body, [
    {
      label: "Save preset",
      action: async () => {
        const name = input.value.trim();
        if (!name || [...name].length > 32)
          throw Error("Enter a name up to 32 characters.");
        if (progress.presets.length >= 12)
          throw Error("12 presets are already saved.");
        progress.presets.push({ id: uid(), name, build: clone(garageBuild) });
        await saveProgress();
        notify("Build saved.");
      },
    },
    { label: "Cancel" },
  ]);
};
q("load-build").onclick = () => {
  const body = document.createElement("div");
  body.className = "file-actions";
  if (!progress.presets.length) body.textContent = "No saved presets yet.";
  for (const p of progress.presets) {
    const b = document.createElement("button");
    b.textContent = p.name;
    b.onclick = () => {
      q("modal").close();
      garageBuild = clone(p.build);
      refreshGarage();
    };
    body.append(b);
  }
  dialog("Saved builds", body);
};
q("pause-button").onclick = () => pause();
q("race-reset").onclick = () => {
  if (race?.state === "racing")
    resetCar(
      race.cars.find((c) => c.id === "player"),
      race.track,
    );
};
q("settings-button").onclick = settingsDialog;
q("sound-toggle").onclick = async () => {
  settings.sound = !settings.sound;
  sound.enabled = settings.sound;
  q("sound-toggle").textContent = settings.sound ? "Sound on" : "Sound off";
  await sound.activate();
  store?.set("settings", settings).catch(() => {});
};
q("fullscreen").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    notify("Full screen is unavailable in this browser.");
  }
};
window.addEventListener("keydown", (e) => {
  if (
    ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName) ||
    e.target.isContentEditable
  )
    return;
  if (view === "race") {
    if (e.code === settings.bindings.pause || e.code === "Escape") {
      e.preventDefault();
      race.state === "paused"
        ? q("modal-title").textContent === "SETTINGS"
          ? pause()
          : resume()
        : pause();
      return;
    }
    if (q("modal").open) return;
    if (
      [
        "KeyW",
        "KeyS",
        "KeyA",
        "KeyD",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Space",
        "ShiftLeft",
        "ShiftRight",
        "KeyR",
      ].includes(e.code) ||
      Object.values(settings.bindings).includes(e.code)
    ) {
      e.preventDefault();
      keys.add(e.code);
      if (
        e.code === settings.bindings.reset &&
        !e.repeat &&
        race.state === "racing"
      )
        resetCar(
          race.cars.find((c) => c.id === "player"),
          race.track,
        );
    }
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => {
  clearInput();
  if (
    view === "race" &&
    ["racing", "countdown", "resuming"].includes(race?.state)
  )
    pause("The game lost focus. Resume when you are ready.");
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && view === "race" && race?.state !== "paused")
    pause("The game was hidden. The clock stopped.");
});
window.addEventListener("gamepaddisconnected", () => {
  if (view === "race")
    pause("Gamepad disconnected. Reconnect or use the keyboard.");
});
const orientationPause = () => {
  if (view === "race")
    pause(
      "Screen orientation changed. Resume when the controls are comfortable.",
    );
};
screen.orientation?.addEventListener("change", orientationPause);
window.addEventListener("orientationchange", orientationPause);
resetTouch = bindTouchControls(q("touch-controls"), {
  held,
  steer: (value) => (steering = value),
  active: () =>
    view === "race" &&
    ["countdown", "racing"].includes(race?.state) &&
    !q("modal").open,
});
window.addEventListener("unhandledrejection", (e) => {
  notify(
    "Action could not finish: " + (e.reason?.message || "Unknown error"),
    true,
  );
});
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
});
window.addEventListener("beforeunload", (e) => {
  if (
    workshop?.track &&
    (workshop.saveError || q("draft-status").textContent.startsWith("Saving"))
  ) {
    e.preventDefault();
    e.returnValue = "";
  }
});
let offlineCheckPromise = null,
  offlineFollowUp = false;
async function checkOffline(manual = false, discover = false) {
  if (offlineCheckPromise) {
    if (manual) {
      await offlineCheckPromise;
      return checkOffline(true, discover);
    }
    offlineFollowUp = true;
    return offlineCheckPromise;
  }
  offlineCheckPromise = performOfflineCheck(manual, discover);
  try {
    await offlineCheckPromise;
  } finally {
    offlineCheckPromise = null;
    if (offlineFollowUp) {
      offlineFollowUp = false;
      void checkOffline();
    }
  }
}
async function performOfflineCheck(manual = false, discover = false) {
  if (!("serviceWorker" in navigator)) {
    q("offline-state").textContent = "Offline installation unavailable";
    return;
  }
  let registration;
  try {
    registration = await navigator.serviceWorker.register(
      new URL("../../sw.js", import.meta.url),
      { scope: new URL("../../", import.meta.url).pathname },
    );
    registration.onupdatefound = () => {
      const installing = registration.installing;
      installing?.addEventListener("statechange", () => {
        if (installing.state === "installed") checkOffline(false);
        if (installing.state === "redundant")
          q("offline-state").textContent =
            "New pack failed · previous release retained";
      });
    };
    if (manual || discover) await registration.update();
    let timer;
    try {
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(Error("Installation timed out.")),
            15000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    const worker = registration.waiting || registration.active;
    const status = await workerRequest(worker, "STATUS");
    const currentRelease = new URL(".", import.meta.url).pathname
      .split("/")
      .filter(Boolean)
      .at(-1);
    q("offline-state").textContent =
      status.release === currentRelease
        ? "Offline pack verified"
        : "Earlier offline release retained";
    if (registration.waiting) {
      waitingWorker = registration.waiting;
      q("update-ready").hidden = false;
      q("offline-state").textContent = "Update verified · apply from the yard";
      if (view === "start" && manual)
        dialog(
          "New release ready",
          "Return every game window to the yard before applying. Saved progress and drafts stay intact.",
          [
            {
              label: "Apply update",
              action: async () => {
                if (view !== "start") throw Error("Return to the yard first.");
                await workerRequest(waitingWorker, "ACTIVATE");
              },
            },
            { label: "Later" },
          ],
        );
    } else {
      q("update-ready").hidden = true;
      if (manual) notify("Offline files checked and verified.");
    }
  } catch (e) {
    q("offline-state").textContent =
      "Offline pack unverified · check or repair from Settings";
    if (manual)
      dialog("Offline pack needs attention", e.message, [
        {
          label: "Repair download",
          action: async () => {
            await workerRequest(
              registration?.waiting || registration?.active,
              "REPAIR",
              { timeout: 90000 },
            );
            await checkOffline(true);
          },
        },
        { label: "Close" },
      ]);
  }
}
navigator.serviceWorker?.addEventListener("controllerchange", () => {
  // Only a still-live, explicitly confirmed activation request may reload this tab.
  if (updateLock && view === "start") location.reload();
});
let lastForegroundCheck = 0;
function refreshForeground() {
  if (document.hidden || !content) return;
  if (view === "start") updateHome(); // Recompute the UTC day after suspension.
  boards?.pump().catch((e) => notify(e.message, true));
  if (Date.now() - lastForegroundCheck < 60000) return;
  lastForegroundCheck = Date.now();
  void checkOffline(false, true);
}
window.addEventListener("online", refreshForeground);
window.addEventListener("pageshow", refreshForeground);
document.addEventListener("visibilitychange", refreshForeground);
q("update-ready").onclick = () => checkOffline(true);
setInterval(() => {
  if (!document.hidden) boards?.pump().catch(() => {});
}, 30000);
let gamepadMenuButtons = [],
  gamepadNavAt = 0;
function gamepadMenus(now) {
  const pad = Array.from(navigator.getGamepads?.() || []).find(Boolean);
  if (!pad) {
    gamepadMenuButtons = [];
    return;
  }
  const down = pad.buttons.map((b) => b.pressed);
  const menu = view !== "race" || race?.state === "paused";
  if (menu) {
    const root = q("modal").open ? q("modal") : document;
    const controls = [
      ...root.querySelectorAll("button,input,select,textarea,a[href]"),
    ].filter(
      (e) => !e.disabled && e.getClientRects().length && !e.closest("[inert]"),
    );
    const move = down[12]
      ? -1
      : down[13]
        ? 1
        : Math.abs(pad.axes[1]) > 0.6
          ? Math.sign(pad.axes[1])
          : 0;
    if (move && now > gamepadNavAt) {
      const index = controls.indexOf(document.activeElement);
      controls[(index + move + controls.length) % controls.length]?.focus();
      gamepadNavAt = now + 220;
    }
    const horizontal = down[14]
      ? -1
      : down[15]
        ? 1
        : Math.abs(pad.axes[0] || 0) > 0.6
          ? Math.sign(pad.axes[0])
          : 0;
    const focused = document.activeElement;
    if (horizontal && now > gamepadNavAt) {
      if (focused?.tagName === "SELECT") {
        focused.selectedIndex = Math.max(
          0,
          Math.min(
            focused.options.length - 1,
            focused.selectedIndex + horizontal,
          ),
        );
        focused.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (focused?.matches("input[type=range],input[type=number]")) {
        horizontal > 0 ? focused.stepUp() : focused.stepDown();
        focused.dispatchEvent(new Event("input", { bubbles: true }));
        focused.dispatchEvent(new Event("change", { bubbles: true }));
      }
      gamepadNavAt = now + 220;
    }
    if (down[0] && !gamepadMenuButtons[0]) document.activeElement?.click?.();
    if (down[1] && !gamepadMenuButtons[1]) {
      if (q("modal").open) {
        if (view === "race") pause();
        else q("modal").close();
      } else if (view === "garage") closeGarage();
      else if (view !== "start") q("home").click();
    }
  }
  gamepadMenuButtons = down;
}
function frame(now) {
  if (document.hidden) {
    lastTime = now;
    requestAnimationFrame(frame);
    return;
  }
  gamepadMenus(now);
  const wallElapsed = Math.max(0, (now - (lastTime || now)) / 1000);
  const elapsed = Math.min(0.1, wallElapsed);
  lastTime = now;
  try {
    if (
      race &&
      view === "race" &&
      !world?.available() &&
      race.state !== "paused"
    )
      graphicsInterrupted();
    if (race && view === "race") {
      pollGamepadPause();
      if (race.state === "resuming") {
        race.resumeRemaining -= elapsed;
        if (race.resumeRemaining <= 0) {
          race.state = race.resumeState;
          accumulator = 0;
          q("countdown").textContent = "";
        }
      } else if (race.state === "countdown") {
        const previous = Math.ceil(race.countdown);
        race.countdown -= elapsed;
        q("countdown").textContent =
          race.countdown > 0 ? String(Math.ceil(race.countdown)) : "GO";
        if (Math.ceil(race.countdown) !== previous)
          sound.tone(race.countdown > 0 ? 330 : 660, 0.2);
        if (race.countdown <= 0) {
          race.state = "racing";
          accumulator = 0;
        }
      } else if (race.state === "racing") {
        if (race.time > 0.7) q("countdown").textContent = "";
        accumulator += elapsed;
        const controls = input();
        let steps = 0;
        while (accumulator >= DT && steps < 8 && race.state === "racing") {
          stepRace(race, controls);
          practiceStep(
            race.practice,
            race.cars.find((c) => c.id === "player"),
            controls,
          );
          accumulator -= DT;
          steps++;
        }
        if (accumulator > DT) {
          race.degraded += elapsed;
          accumulator = 0;
        }
        const wasDegraded = race.performanceDegraded;
        updateDegradation(race, wallElapsed, steps * DT);
        if (!wasDegraded && race.performanceDegraded)
          notify(
            "This device is struggling to keep up. This attempt stays local. Reduced effects may help.",
            true,
          );
        if (race.state === "finished") finish();
      }
      const p = race.cars.find((c) => c.id === "player");
      sound.update(
        p,
        ["racing", "countdown", "resuming"].includes(race.state),
        race.track.source.musicPreset,
        race.time,
      );
      if (now - lastHUD > 80) {
        updateHUD();
        lastHUD = now;
      }
    }
    const animated =
      (view === "race" && race?.state !== "paused") ||
      (view === "scene" &&
        !settings.reducedMotion &&
        world?.cinematicState?.elapsed < 4.5) ||
      (view === "result" &&
        !settings.reducedMotion &&
        world?.resultElapsed < 1.5);
    if (
      world &&
      !world.contextLost &&
      view !== "workshop" &&
      view !== "events" &&
      (animated || !lastRender || now - lastRender >= 200)
    ) {
      world.render(
        race,
        view,
        settings,
        lastRender ? Math.min(0.2, (now - lastRender) / 1000) : elapsed,
      );
      lastRender = now;
    }
  } catch (e) {
    console.error(e);
    if (view === "race") pause("The simulation stopped safely: " + e.message);
  }
  requestAnimationFrame(frame);
}
function driverProfile() {
  const field = nameField(document, settings.driverAlias),
    save = document.createElement("button");
  save.type = "submit";
  save.textContent = "Save driver name";
  field.form.append(save);
  field.form.onsubmit = async (event) => {
    event.preventDefault();
    if (save.disabled) return;
    save.disabled = true;
    try {
      const alias = await rememberDriver(settings, store, field.read());
      field.input.value = alias;
      field.status.textContent =
        "Driver name saved on this device. Finish Time Trial or Daily Spec, then choose Add to leaderboard.";
    } catch (error) {
      field.status.textContent = error.message;
    } finally {
      save.disabled = false;
    }
  };
  return field.form;
}
async function showSharedTimes() {
  const result = race?.result && clone(race.result);
  if (!result) return;
  try {
    await showSubmission({
      document,
      result,
      settings,
      store,
      boards,
      identities: recognizedContent,
      dialog,
      current: () => view === "result" && race?.result?.id === result.id,
    });
  } catch (error) {
    notify(error.message, true);
  }
}
async function openLeaderboards() {
  const body = document.createElement("div");
  body.innerHTML = `<p>Three laps. The same circuit, car and assists. Set your time in Time Trial or try today's fixed Daily Spec.</p><div class="board-controls"><label>Board<select id="board-mode"><option value="trial">Time Trial</option><option value="daily">Daily Spec</option></select></label><label>Circuit<select id="board-track">${content.tracks.map((t, i) => `<option value="${i}">${esc(t.track.name)}</option>`).join("")}</select></label></div><p id="board-spec" class="muted"></p><p id="board-state" role="status">Loading times…</p><ol class="board-list"></ol><p class="muted">Community times are client-reported. Entries remain on the board for five days. Your local bests stay on your device.</p>`;
  body.prepend(driverProfile());
  const mode = body.querySelector("#board-mode"),
    track = body.querySelector("#board-track"),
    state = body.querySelector("#board-state"),
    list = body.querySelector("ol");
  let revision = 0,
    selection = null;
  const refresh = async () => {
    const token = ++revision;
    selection = null;
    const previousSelection = list.dataset.selection;
    const selectedKey = mode.value + ":" + track.value;
    if (previousSelection !== selectedKey) list.replaceChildren();
    state.textContent = list.children.length
      ? "Refreshing displayed times…"
      : "Loading times…";
    const date = new Date().toISOString().slice(0, 10),
      d = content.daily.find((d) => d.date === date);
    track.disabled = mode.value === "daily";
    if (mode.value === "daily" && !d) {
      state.textContent =
        "No Daily Spec is included for today. Time Trial is available.";
      return;
    }
    const index =
      mode.value === "daily"
        ? content.tracks.findIndex((t) => t.track.id === d.track)
        : Number(track.value);
    track.value = String(index);
    const build =
        mode.value === "daily"
          ? Object.fromEntries(SLOTS.map((s) => [s, d[s]]))
          : clone(progress.build),
      spec = assemble(build, content.parts);
    const options =
      mode.value === "daily"
        ? { build, challenge: d.id, challengeDate: d.date }
        : { build };
    const capturedMode = mode.value;
    body.querySelector("#board-spec").textContent =
      SLOTS.map((s) => spec[s].name).join(" / ") +
      " · " +
      (settings.autoAccelerate ? "Auto throttle" : "Manual throttle") +
      " · Steering assist " +
      (settings.assist ? "on" : "off") +
      (capturedMode === "daily" ? " · " + date + " UTC" : "");
    try {
      const buildRevision = await hash(
        SLOTS.map((s) => {
          const { name, description, unlock, ...physical } = spec[s];
          return physical;
        }),
      );
      if (token !== revision || !body.isConnected) return;
      const query = {
        mode: capturedMode,
        trackRevision: content.tracks[index].revision,
        buildRevision,
        laps: 3,
        assist:
          (settings.assist ? "steering-on" : "steering-off") +
          ":" +
          (settings.autoAccelerate ? "auto" : "manual"),
        challenge: options.challenge || "",
      };
      selection = { index, mode: capturedMode, options };
      const board = await boards.browse(query);
      if (token !== revision || !body.isConnected) return;
      state.textContent = board.stale
        ? "Saved times · could not refresh. " + board.error
        : board.rows.length
          ? "Latest confirmed times"
          : "No times for this combination yet. Set the first one.";
      list.replaceChildren();
      list.dataset.selection = mode.value + ":" + track.value;
      for (const [i, row] of board.rows.entries()) {
        const li = document.createElement("li"),
          name = document.createElement("bdi"),
          value = document.createElement("strong");
        name.textContent = i + 1 + ". " + row.alias;
        value.textContent = time(row.elapsedMs);
        li.append(name, value);
        list.append(li);
      }
    } catch (e) {
      if (token === revision && body.isConnected)
        state.textContent =
          (list.children.length
            ? "Displayed times may be stale. Refresh failed: "
            : "Times unavailable: ") +
          e.message +
          " You can still race and keep your result locally.";
    }
  };
  mode.onchange = track.onchange = refresh;
  dialog("LEADERBOARDS", body, [
    {
      label: "Set a time",
      action: () => {
        if (selection)
          startTrack(selection.index, selection.mode, selection.options);
      },
    },
    { label: "Refresh", keep: true, action: refresh },
    { label: "Close" },
  ]);
  await refresh();
}
async function openNativeRoute() {
  const mode = location.pathname.split("/")[1];
  const installedFallback = !!document.querySelector(
    'meta[name="scrap-league-route-fallback"]',
  );
  let slug = "",
    track;
  try {
    slug = decodeURIComponent(location.pathname.split("/")[2] || "");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 48)
      throw Error("Choose a circuit from the catalog.");
    const source = q("routed-track"),
      article = source?.querySelector('[itemtype="urn:ScrapLeague:Track"]');
    if (article) {
      track = parseTrack(
        "<!doctype html><html><head><title>Native track</title></head><body>" +
          article.outerHTML +
          "</body></html>",
      );
      if (track.id !== source.dataset.trackId || !compile(track).valid)
        throw Error("The composed circuit failed validation.");
    } else {
      track = content.tracks.find((t) => t.track.slug === slug)?.track;
      if (!track) {
        const entry = (await discoverTracks()).find((e) => e.slug === slug);
        if (entry) track = await readPublishedTrack(entry.id);
      }
    }
    if (!track)
      throw Error(
        "That circuit is unavailable. Choose another or open a saved draft.",
      );
    if (mode === "editor") {
      await openWorkshop();
      await workshop.open(duplicateTrack(track));
      notify(
        installedFallback
          ? "Online circuit page unavailable. Opened an editable copy of " +
              track.name +
              " from the installed pack."
          : "Opened an editable copy of " + track.name + ".",
      );
    } else {
      const index = content.tracks.findIndex((t) => t.track.id === track.id);
      dialog(
        track.name,
        (installedFallback
          ? "Online circuit page unavailable. This circuit is from the installed pack. "
          : "") + "Race this circuit or open an editable copy.",
        [
          {
            label: "Race circuit",
            action: () =>
              index >= 0
                ? startTrack(index, "trial")
                : beginRace(track, "workshop", { published: true }),
          },
          {
            label: "Edit a copy",
            action: async () => {
              await openWorkshop();
              await workshop.open(duplicateTrack(track));
            },
          },
          { label: "Back to yard" },
        ],
      );
    }
  } catch (error) {
    const body = document.createElement("div"),
      message = document.createElement("p");
    message.textContent = error.message;
    body.append(message);
    for (const entry of content.tracks) {
      const button = document.createElement("button");
      button.textContent = entry.track.name;
      button.onclick = async () => {
        q("modal").close();
        if (mode === "editor") {
          await openWorkshop();
          await workshop.open(duplicateTrack(entry.track));
        } else startTrack(content.tracks.indexOf(entry), "trial");
      };
      body.append(button);
    }
    body.className = "file-actions";
    dialog("Choose a circuit", body, [
      { label: "Open saved Workshop", action: openWorkshop },
      { label: "Back to yard" },
    ]);
  }
}
async function init() {
  try {
    const response = await fetch(new URL("./content.json", import.meta.url));
    if (!response.ok) throw Error("Track bundle could not load.");
    content = await response.json();
    recognizedContent = contentKeys(content);
    try {
      store = await openStore();
      progress = (await store.get("progress")) || freshProgress();
      const recovered = recoverProgressContent(progress, content);
      if (recovered.reasons.length) {
        progress = await store.archiveAndRecoverProgress(
          progress,
          recovered.progress,
        );
        notify(
          recovered.reasons.join(" ") +
            " The original is kept in full backups.",
          true,
        );
      }
      settings = normalizeSettings(await store.get("settings"), settings);
      await store.prune();
    } catch (e) {
      notify(
        "Browser storage is unavailable. Play works for this session; export drafts to keep them.",
        true,
      );
    }
    boards = new Boards(store);
    if (boards.enabled) boards.pump().catch((e) => notify(e.message, true));
    await document.fonts.load("100px LeagueDisplay");
    world = createWorld(q("world"));
    workshop = new Workshop(q("screen-workshop"), {
      store,
      templates: content.tracks.map((t) => t.track),
      onTest: (t, ai) =>
        beginRace(t, "workshop", {
          ai,
          build: workshop.testBuild || progress.build,
        }),
      notify,
      dialog,
      download,
      build: () => openGarage("workshop"),
    });
    q("sound-toggle").textContent = settings.sound ? "Sound on" : "Sound off";
    sound.enabled = settings.sound;
    sound.musicEnabled = settings.music;
    document.body.classList.toggle("touch", settings.touch);
    applyPreferences();
    show("start");
    checkOffline();
    requestAnimationFrame(frame);
    if (/^\/(editor|track)(\/|$)/.test(location.pathname))
      await openNativeRoute();
    if (/^#daily=\d{4}-\d{2}-\d{2}$/.test(location.hash))
      await daily(location.hash.slice(7));
    if (location.hash.startsWith("#workshop=")) {
      try {
        const track = await readPublishedTrack(location.hash.slice(10));
        await store?.set("meta:published-snapshot:" + track.id, {
          track,
          downloadedAt: new Date().toISOString(),
        });
        dialog(
          track.name,
          "Race this published circuit or open an editable copy.",
          [
            {
              label: "Race circuit",
              action: () =>
                beginRace(track, "workshop", {
                  build: progress.build,
                  ai: false,
                  published: true,
                }),
            },
            {
              label: "Edit a copy",
              action: async () => {
                await openWorkshop();
                await workshop.open(duplicateTrack(track));
              },
            },
            { label: "Back to yard" },
          ],
        );
      } catch (error) {
        dialog(
          "Track could not load",
          error.message + " Open Workshop to use a saved downloaded copy.",
        );
      }
    }
    if (location.hash.startsWith("#track=")) {
      const slug = decodeURIComponent(location.hash.slice(7)),
        i = content.tracks.findIndex((t) => t.track.slug === slug);
      if (i >= 0)
        dialog(
          content.tracks[i].track.name,
          "Race this shared circuit in Time Trial.",
          [
            {
              label: "Race this circuit",
              action: () => startTrack(i, "trial"),
            },
            { label: "Explore the yard" },
          ],
        );
    }
  } catch (e) {
    q("loading-message").textContent = "Could not open the yard: " + e.message;
    console.error(e);
    throw e;
  }
}
export const ready = init();
