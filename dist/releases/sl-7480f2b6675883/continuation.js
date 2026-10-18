import { clone } from "./model.js";
import { RULES, assemble, STARTER } from "./builds.js";
export function recoverProgressContent(saved, content) {
  const progress = clone(saved),
    reasons = [];
  const supported = (build) => {
    try {
      assemble(build, content.parts);
      return true;
    } catch {
      return false;
    }
  };
  if (!supported(progress.build)) {
    progress.build = { ...STARTER };
    reasons.push("Equipped parts are unavailable; restored the starter build.");
  }
  const presets = progress.presets.filter((p) => supported(p.build));
  if (presets.length !== progress.presets.length) {
    progress.presets = presets;
    reasons.push("Unsupported presets were archived.");
  }
  const cup = progress.cup,
    ids = new Set(content.rivals.map((r) => r.id));
  if (
    cup &&
    (!Array.isArray(cup.rivals) ||
      cup.rivals.length !== 5 ||
      new Set(cup.rivals).size !== 5 ||
      cup.rivals.some((id) => !ids.has(id)) ||
      cup.rounds.some((r) =>
        r.classification.some((c) => c.id !== "player" && !ids.has(c.id)),
      ))
  ) {
    progress.cup = null;
    reasons.push(
      "Unsupported unfinished cup was archived; completed event rewards remain.",
    );
  }
  return { progress, reasons };
}

export function captureAttempt(race, parts) {
  return {
    version: 1,
    id: race.id,
    index: race.index,
    track: clone(race.track.source),
    trackRevision: race.trackRevision,
    build: clone(race.build),
    parts: clone(parts),
    settings: clone(race.settingsSnapshot),
    seed: race.seed,
    rules: RULES,
    rivals: clone(race.rivals || []),
    difficulty: race.difficulty,
  };
}

export function resolveAttempt(cup, index, track, build) {
  const pending = cup?.pending;
  if (!pending || pending.index !== index)
    return {
      track: clone(track),
      build: clone(build),
      seed: (cup?.seed || 1) + index,
    };
  if (
    pending.version !== 1 ||
    !pending.track ||
    !pending.parts ||
    pending.rules !== RULES
  ) {
    throw Error(
      "This unfinished attempt belongs to different racing rules. Your completed rounds are safe. Restart this round with the current rules to continue.",
    );
  }
  return {
    track: clone(pending.track),
    build: clone(pending.build),
    seed: pending.seed,
    parts: clone(pending.parts),
    settings: clone(pending.settings),
    rivals: clone(pending.rivals),
    resumed: true,
  };
}

export function updateDegradation(race, wallSeconds, simulatedSeconds) {
  const behind = wallSeconds - simulatedSeconds > 1 / 120;
  race.overloadSeconds = behind ? (race.overloadSeconds || 0) + wallSeconds : 0;
  if (race.overloadSeconds >= 2) race.performanceDegraded = true;
  return !!race.performanceDegraded;
}
