import { clamp } from "./model.js";
export const AI_PROFILES = Object.freeze({
  relaxed: { reaction: 0.22, mistake: 0.12, error: 0.12 },
  club: { reaction: 0.14, mistake: 0.06, error: 0.08 },
  expert: { reaction: 0.075, mistake: 0.02, error: 0.04 },
});
const DEFAULT_TACTIC = Object.freeze({
  brakeMargin: 7,
  reserve: 25,
  pass: 2.4,
  wander: 1,
  description: "Looks for room on the straight.",
});
export const RIVAL_BEHAVIORS = Object.freeze({
  bea: {
    brakeMargin: 15,
    reserve: 35,
    pass: 1.6,
    wander: 0.2,
    description: "Bea brakes early and protects a clean exit.",
  },
  kit: {
    brakeMargin: 3,
    reserve: 25,
    pass: 2.6,
    wander: 0.4,
    description: "Kit commits to an inside pass near a bend.",
  },
  mags: {
    brakeMargin: 10,
    reserve: 55,
    pass: 2.4,
    wander: 0.5,
    description: "Mags stores boost for a straight-line overtake.",
  },
  otto: {
    ...DEFAULT_TACTIC,
    pass: 1.2,
    wander: 0.1,
    description: "Otto holds a steady central line.",
  },
  sol: {
    ...DEFAULT_TACTIC,
    brakeMargin: 14,
    description: "Sol leaves a wide braking margin.",
  },
  patch: {
    ...DEFAULT_TACTIC,
    brakeMargin: 16,
    pass: 1.5,
    description: "Patch gives traffic space on loose roads.",
  },
  pip: {
    ...DEFAULT_TACTIC,
    brakeMargin: 4,
    pass: 2.8,
    reserve: 15,
    description: "Pip takes passing opportunities early.",
  },
});
export const rivalBehavior = (id) => RIVAL_BEHAVIORS[id] || DEFAULT_TACTIC;
export function seededValue(seed, id, decision) {
  let hash = 2166136261;
  for (const char of `${seed}:${id}:${decision}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  return (hash >>> 0) / 4294967296;
}
export function profiledInput(car, race, plan) {
  const profile = AI_PROFILES[race.difficulty] || AI_PROFILES.club;
  if (car.aiControl && race.time < car.aiNextAt) return car.aiControl;
  const decision = car.aiDecision || 0;
  car.aiDecision = decision + 1;
  const control = plan(),
    noise = seededValue(race.seed ?? 0, car.id, decision);
  if (noise < profile.mistake) {
    control.steer = clamp(
      control.steer + (noise / profile.mistake - 0.5) * profile.error * 2,
      -1,
      1,
    );
    control.throttle = Math.min(control.throttle, 0.75);
    control.boost = false;
  }
  car.aiNextAt = race.time + profile.reaction;
  car.aiControl = control;
  return control;
}
