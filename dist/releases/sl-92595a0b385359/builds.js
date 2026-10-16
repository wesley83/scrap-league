export const STARTER = {
  chassis: "mule",
  engine: "courier",
  tires: "road",
  utility: "roll-cage",
};
export const SLOTS = ["chassis", "engine", "tires", "utility"];
export const RULES = "scrap-physics-v1.1.0";
export function assemble(build, parts) {
  const p = {};
  for (const slot of SLOTS) {
    p[slot] = parts.find((p) => p.id === build[slot] && p.slot === slot);
    if (!p[slot]) throw Error("Unknown " + slot + " part.");
  }
  return {
    ...p,
    mass: Object.values(p).reduce((n, p) => n + p.mass, 0),
    build: { ...build },
  };
}
export function allBuilds(parts) {
  return SLOTS.reduce(
    (builds, slot) =>
      builds.flatMap((b) =>
        parts
          .filter((p) => p.slot === slot)
          .map((p) => ({ ...b, [slot]: p.id })),
      ),
    [{}],
  );
}
export function unlocked(part, progress) {
  return part.unlock === 0 || (progress.completed || []).includes(part.unlock);
}
export function comparisonKey({
  mode,
  trackRevision,
  buildRevision,
  laps,
  assist,
  challenge = "",
}) {
  return [
    mode,
    trackRevision,
    RULES,
    buildRevision,
    laps,
    assist,
    challenge,
  ].join("|");
}
export function time(ms) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  return `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${((ms / 1000) % 60).toFixed(3).padStart(6, "0")}`;
}
export const POINTS = [10, 7, 5, 3, 2, 1];
export function standings(rounds, roster) {
  return roster
    .map((id) => {
      const ranks = rounds.map((r) =>
        r.classification.findIndex((c) => c.id === id),
      );
      return {
        id,
        points: ranks.reduce((n, r) => n + (POINTS[r] || 0), 0),
        wins: ranks.filter((x) => x === 0).length,
        seconds: ranks.filter((x) => x === 1).length,
        thirds: ranks.filter((x) => x === 2).length,
        last: ranks.at(-1) ?? 99,
      };
    })
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.wins - a.wins ||
        b.seconds - a.seconds ||
        b.thirds - a.thirds ||
        a.last - b.last ||
        a.id.localeCompare(b.id),
    );
}
