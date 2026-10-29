import { RULES, SLOTS, assemble } from "./builds.js";
import { gameplay, hash, stable, duplicateTrack } from "./model.js";
import { challengeErrors } from "./challenge-schema.js";
export { challengeErrors } from "./challenge-schema.js";

export async function assertChallengeSource(track) {
  const c = track.challenge;
  if (!c) return null;
  const errors = challengeErrors(c);
  if (errors.length) throw Error(errors.join(" "));
  if (
    c.rulesRevision !== RULES ||
    c.laps !== track.laps ||
    c.trackRevision !== (await hash(gameplay(track)))
  )
    throw Error(
      "This target belongs to an older track or driving revision. An ordinary test drive is still available.",
    );
  return c;
}
export async function resolveChallenge(track, parts) {
  const c = await assertChallengeSource(track);
  if (!c) return null;
  const build = Object.fromEntries(SLOTS.map((s) => [s, c[s]]));
  const spec = assemble(build, parts);
  const revision = await hash(
    SLOTS.map((s) => {
      const { name, description, unlock, ...physical } = spec[s];
      return physical;
    }),
  );
  if (revision !== c.buildRevision)
    throw Error(
      "This target belongs to older car specifications. An ordinary test drive is still available.",
    );
  return {
    build,
    settings: { assist: !!c.assist, autoAccelerate: !!c.autoAccelerate },
    challenge: "workshop-" + (await hash(stable(c))),
    targetMs: c.targetMs,
    creator: c.creator,
  };
}
export function targetFromResult(track, result, creator, settings) {
  if (
    result.dnf ||
    result.performanceDegraded ||
    result.trackId !== track.id ||
    result.laps !== track.laps ||
    result.rulesRevision !== RULES
  )
    throw Error(
      "Finish a valid test with this track and lap count before setting a target.",
    );
  const c = {
    creator: creator.trim(),
    targetMs: result.elapsedMs,
    trackRevision: result.trackRevision,
    buildRevision: result.buildRevision,
    rulesRevision: result.rulesRevision,
    ...result.build,
    assist: settings.assist ? 1 : 0,
    autoAccelerate: settings.autoAccelerate ? 1 : 0,
    laps: result.laps,
  };
  const errors = challengeErrors(c);
  if (errors.length) throw Error(errors.join(" "));
  return c;
}
// Import keeps a shared challenge playable while protecting existing local IDs.
// A remix intentionally drops the target; an import preserves its fixed setup.
export async function importTrackCopy(track, parts) {
  if (track.challenge) await resolveChallenge(track, parts);
  const copy = duplicateTrack(track);
  if (track.challenge)
    copy.challenge = {
      ...track.challenge,
      trackRevision: await hash(gameplay(copy)),
    };
  return copy;
}
