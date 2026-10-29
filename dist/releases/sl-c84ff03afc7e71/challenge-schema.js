export function challengeErrors(c) {
  if (!c || typeof c !== "object" || Array.isArray(c))
    return ["Invalid challenge."];
  const fields = [
    "creator",
    "targetMs",
    "trackRevision",
    "buildRevision",
    "rulesRevision",
    "chassis",
    "engine",
    "tires",
    "utility",
    "assist",
    "autoAccelerate",
    "laps",
  ];
  if (
    Object.keys(c).some((k) => !fields.includes(k)) ||
    fields.some((k) => !(k in c))
  )
    return ["Unsupported or missing challenge fields."];
  const errors = [];
  if (
    typeof c.creator !== "string" ||
    !c.creator.trim() ||
    [...c.creator].length > 40 ||
    /[\x00-\x1f\x7f]/.test(c.creator)
  )
    errors.push("Creator must be 1–40 printable characters.");
  if (
    !Number.isSafeInteger(c.targetMs) ||
    c.targetMs < 1000 ||
    c.targetMs > 480000
  )
    errors.push("Challenge target must be 1–480 seconds.");
  if (
    !/^[a-f0-9]{64}$/.test(c.trackRevision) ||
    !/^[a-f0-9]{64}$/.test(c.buildRevision) ||
    !/^scrap-physics-v\d+\.\d+\.\d+$/.test(c.rulesRevision)
  )
    errors.push("Invalid challenge revision.");
  for (const [slot, allowed] of Object.entries({
    chassis: ["mule", "kite", "anvil"],
    engine: ["courier", "longrunner", "torque-box"],
    tires: ["road", "mixed", "rally"],
    utility: ["roll-cage", "capacitor", "flywheel"],
  }))
    if (!allowed.includes(c[slot]))
      errors.push("Invalid challenge " + slot + ".");
  if (
    ![0, 1].includes(c.assist) ||
    ![0, 1].includes(c.autoAccelerate) ||
    !Number.isInteger(c.laps) ||
    c.laps < 1 ||
    c.laps > 9
  )
    errors.push("Invalid fixed challenge settings.");
  return errors;
}
