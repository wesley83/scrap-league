import { clamp } from "./model.js";
export const AI_PROFILES = Object.freeze({
  relaxed: { reaction: 0.22, mistake: 0.12, error: 0.12 },
  club: { reaction: 0.14, mistake: 0.06, error: 0.08 },
  expert: { reaction: 0.075, mistake: 0.02, error: 0.04 },
});
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
