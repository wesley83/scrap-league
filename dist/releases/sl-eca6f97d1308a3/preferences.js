export const DEFAULT_BINDINGS = Object.freeze({
  throttle: "KeyW",
  brake: "KeyS",
  left: "KeyA",
  right: "KeyD",
  handbrake: "Space",
  boost: "ShiftLeft",
  reset: "KeyR",
  pause: "Escape",
});
const RESERVED_BINDINGS = {
  ArrowUp: "throttle",
  ArrowDown: "brake",
  ArrowLeft: "left",
  ArrowRight: "right",
  Escape: "pause",
};
export function defaultSettings({
  coarse = false,
  reducedMotion = false,
} = {}) {
  return {
    sound: false,
    music: true,
    effectsVolume: 0.7,
    musicVolume: 0.35,
    autoAccelerate: coarse,
    assist: false,
    northUp: false,
    lowEffects: false,
    reducedMotion,
    ghost: true,
    touch: coarse,
    touchLayout: "pad",
    leftHanded: false,
    largeHud: false,
    sensitivity: 1,
    bindings: { ...DEFAULT_BINDINGS },
  };
}
export function normalizeSettings(saved = {}, defaults = defaultSettings()) {
  saved = saved && typeof saved === "object" ? saved : {};
  const next = structuredClone(defaults);
  for (const [key, value] of Object.entries(next)) {
    if (typeof value === "boolean" && typeof saved[key] === "boolean")
      next[key] = saved[key];
  }
  for (const key of ["effectsVolume", "musicVolume"])
    if (Number.isFinite(saved[key]))
      next[key] = Math.max(0, Math.min(1, saved[key]));
  if (Number.isFinite(saved.sensitivity))
    next.sensitivity = Math.max(0.5, Math.min(1.5, saved.sensitivity));
  if (["pad", "buttons"].includes(saved.touchLayout))
    next.touchLayout = saved.touchLayout;
  if (
    saved.bindings &&
    Object.keys(saved.bindings).length === 8 &&
    Object.keys(DEFAULT_BINDINGS).every(
      (k) =>
        validBinding(saved.bindings[k]) &&
        (!RESERVED_BINDINGS[saved.bindings[k]] ||
          RESERVED_BINDINGS[saved.bindings[k]] === k),
    ) &&
    new Set(Object.values(saved.bindings)).size === 8
  )
    next.bindings = { ...saved.bindings };
  return next;
}
export function validBinding(code) {
  return /^(Key[A-Z]|Digit[0-9]|Arrow(?:Left|Right|Up|Down)|Space|Escape|ShiftLeft|ShiftRight|ControlLeft|ControlRight)$/.test(
    code,
  );
}
export function bindKey(settings, action, code) {
  if (!(action in DEFAULT_BINDINGS) || !validBinding(code))
    throw Error(
      "Choose a letter, number, arrow, Shift, Control, Space or Escape.",
    );
  const reserved = RESERVED_BINDINGS;
  if (reserved[code] && reserved[code] !== action)
    throw Error("That key is reserved for " + reserved[code] + ".");
  if (
    Object.entries(settings.bindings).some(
      ([key, value]) => key !== action && value === code,
    )
  )
    throw Error("That key already has another action.");
  settings.bindings[action] = code;
}
export function bindingHint(settings) {
  const label = (code) =>
    code
      .replace(/^Key/, "")
      .replace(/^Digit/, "")
      .replace("ShiftLeft", "Left Shift")
      .replace("ShiftRight", "Right Shift");
  return Object.entries(settings.bindings)
    .map(([action, code]) => label(code) + " " + action)
    .join(" · ");
}
