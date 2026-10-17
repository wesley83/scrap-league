import { clamp, wrap } from "./model.js";

// Each contact owns an action; another release cannot cancel it.
export class ContactActions {
  constructor() {
    this.contacts = new Map();
  }
  press(id, action) {
    if (!this.contacts.has(id)) this.contacts.set(id, action);
  }
  release(id) {
    this.contacts.delete(id);
  }
  has(action) {
    return [...this.contacts.values()].includes(action);
  }
  clear() {
    this.contacts.clear();
  }
}
export function steeringAxis(clientX, rect) {
  const axis = clamp(
    (clientX - rect.left - rect.width / 2) / (rect.width * 0.4),
    -1,
    1,
  );
  return Math.abs(axis) <= 0.08
    ? 0
    : (Math.sign(axis) * (Math.abs(axis) - 0.08)) / 0.92;
}
export function bindTouchControls(root, { held, steer, active }) {
  const contacts = new Map();
  let padId = null,
    rect;
  const pad = root.querySelector("#steering-pad");
  const axis = (value) => {
    steer(value);
    pad.style.setProperty("--steer", value);
    pad.setAttribute("aria-valuenow", value.toFixed(2));
  };
  const release = (id) => {
    const button = contacts.get(id);
    if (!button) return;
    contacts.delete(id);
    held.release(id);
    button.dataset.pressed = String([...contacts.values()].includes(button));
    if (id === padId) {
      padId = null;
      axis(0);
    }
  };
  for (const button of [...root.querySelectorAll("[data-hold]"), pad]) {
    button.addEventListener("pointerdown", (e) => {
      if (
        !active() ||
        (e.pointerType === "mouse" && e.button !== 0) ||
        (button === pad && padId !== null)
      )
        return;
      e.preventDefault();
      contacts.set(e.pointerId, button);
      button.setPointerCapture(e.pointerId);
      button.dataset.pressed = "true";
      if (button === pad) {
        padId = e.pointerId;
        rect = pad.getBoundingClientRect();
        axis(steeringAxis(e.clientX, rect));
      } else held.press(e.pointerId, button.dataset.hold);
    });
    button.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse" && e.buttons === 0) {
        release(e.pointerId);
        return;
      }
      if (e.pointerId === padId) axis(steeringAxis(e.clientX, rect));
    });
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
      button.addEventListener(event, (e) => release(e.pointerId));
    button.addEventListener("keydown", (e) => {
      if (!active()) return;
      if (button === pad && ["ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        axis(e.key === "ArrowLeft" ? -1 : 1);
      } else if (button !== pad && [" ", "Enter"].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        held.press("key:" + button.dataset.hold, button.dataset.hold);
        button.dataset.pressed = "true";
      }
    });
    button.addEventListener("keyup", (e) => {
      if (button === pad) axis(0);
      else if ([" ", "Enter"].includes(e.key)) {
        held.release("key:" + button.dataset.hold);
        button.dataset.pressed = "false";
      }
    });
    button.addEventListener("blur", () => {
      held.release("key:" + button.dataset.hold);
      if (button === pad && padId === null) axis(0);
      if (![...contacts.values()].includes(button))
        button.dataset.pressed = "false";
    });
  }
  const reset = () => {
    const entries = [...contacts];
    contacts.clear();
    held.clear();
    padId = null;
    axis(0);
    for (const [id, button] of entries) {
      button.dataset.pressed = "false";
      if (button.hasPointerCapture(id)) button.releasePointerCapture(id);
    }
    root
      .querySelectorAll("[data-pressed]")
      .forEach((b) => (b.dataset.pressed = "false"));
  };
  // A new coordinate mapping requires a new contact, including browser-chrome
  // resizing that does not emit orientationchange.
  new ResizeObserver(reset).observe(root);
  window.addEventListener("resize", reset);
  window.visualViewport?.addEventListener("resize", reset);
  return reset;
}
export function practiceStep(practice, car, input) {
  if (!practice) return;
  const speed = Math.hypot(car.vx, car.vz);
  if (speed > 5 && input.throttle > 0) practice.accelerate = true;
  if (
    speed > 3 &&
    Math.abs(input.steer) > 0.2 &&
    Math.abs(wrap(car.heading - practice.heading)) > 0.2
  )
    practice.steer = true;
  if (speed > 3 && input.brake > 0) practice.brake = true;
  if (car.boosting) practice.boost = true;
}
export function practicePrompt(practice, settings) {
  const key = (action) =>
    settings.bindings[action]
      .replace("Key", "")
      .replace("ShiftLeft", "Shift")
      .replace("ShiftRight", "Shift");
  if (!practice.accelerate)
    return settings.autoAccelerate
      ? "Auto throttle is on. Your car accelerates for you."
      : settings.touch
        ? "Hold GAS to accelerate."
        : `Hold ${key("throttle")} to accelerate.`;
  if (!practice.steer)
    return settings.touch
      ? "Steer into the bend with the wheel or arrow buttons."
      : `Use ${key("left")} / ${key("right")} to follow the road into the bend.`;
  if (!practice.brake)
    return settings.touch
      ? "Hold BRAKE before a bend. Release it to accelerate again."
      : `Hold ${key("brake")} before a bend. Slow down before you turn.`;
  if (!practice.boost)
    return settings.touch
      ? "On a straight, hold BOOST; it also accelerates. Checkpoints refill your charge."
      : `On a straight, hold ${key("boost")} to boost. Checkpoints refill your charge.`;
  return "All four skills tried. Follow every checkpoint and finish your lap.";
}
