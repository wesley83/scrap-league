import { wrap, clamp } from "./model.js";
import { nearest, pieceLength } from "./track.js";

// Bounded derived telemetry. Physics remains the only authority for movement.
export function recordDriving(car, track, input, now, dt) {
  const m = (car.insights ||= {
    incidents: 0,
    quiet: 1,
    contacts: 0,
    cleanExits: 0,
    attempted: new Set(),
    corner: null,
    stopped: 0,
  });
  const contact = car.contacts > m.contacts;
  m.contacts = car.contacts;
  if (contact) {
    if (m.quiet >= 0.6) m.incidents++;
    m.quiet = 0;
  } else m.quiet += dt;
  const q = nearest(track, car.x, car.z);
  if (!q) return;
  const piece = track.source.pieces.find((p) => p.id === q.pieceId);
  const forward =
    car.vx * Math.cos(car.heading) + car.vz * Math.sin(car.heading);
  if (Math.hypot(car.vx, car.vz) < 1) m.stopped += dt;
  const slip = Math.abs(
    -car.vx * Math.sin(car.heading) + car.vz * Math.cos(car.heading),
  );
  const last = track.gates[car.lastGate],
    next = track.gates[car.nextGate];
  const interval = (next.s - last.s + track.length) % track.length;
  const routeProgress = (q.s - last.s + track.length) % track.length;
  const clean =
    !contact &&
    !car.resetTime &&
    !car.ghostTime &&
    routeProgress <= interval + 2 &&
    Math.abs(q.lateral) <= q.width / 2 - car.spec.chassis.width / 2 &&
    forward > 3 &&
    Math.abs(wrap(car.heading - q.heading)) < 0.5 &&
    slip < 4 &&
    !input.handbrake;
  const corner = m.corner;
  if (corner) {
    corner.clean &&=
      clean && car.resets === corner.resets && car.lap === corner.lap;
    if (q.pieceId === corner.id) {
      if (q.local < corner.local - 0.25) corner.clean = false;
      corner.local = Math.max(corner.local, q.local);
    }
    // Complete at the actual exit; adjacent-segment rounding cannot skip it.
    if (q.pieceId !== corner.id || q.local >= corner.length - 2) {
      if (
        corner.clean &&
        corner.local >= corner.length - 8 &&
        corner.local - corner.start >= corner.length * 0.7 &&
        forward >= 12 &&
        slip < 2.5 &&
        input.throttle > 0.5 &&
        !input.brake &&
        Math.abs(wrap(car.heading - q.heading)) < 0.22
      ) {
        const gain = Math.min(6, car.spec.utility.capacity - car.charge);
        car.charge += gain;
        m.cleanExits++;
        m.feedback =
          gain > 0
            ? `CLEAN EXIT · +${gain.toFixed(0)} BOOST`
            : "CLEAN EXIT · BOOST FULL";
        m.feedbackUntil = now + 2;
      }
      m.corner = null;
    }
  }
  if (
    !m.corner &&
    ["quarter", "hairpin"].includes(piece?.kind) &&
    q.local <= 8 &&
    clean
  ) {
    const key = `${car.lap}:${piece.id}`;
    if (!m.attempted.has(key)) {
      m.attempted.add(key);
      m.corner = {
        id: piece.id,
        length: pieceLength(piece),
        start: q.local,
        local: q.local,
        clean: true,
        lap: car.lap,
        resets: car.resets,
      };
    }
  }
}

export function recordSector(car, exact, order) {
  car.sectors ||= [];
  const endMs = Math.round(exact * 1000);
  const previous = car.sectors.at(-1);
  if (car.sectors.length < 300)
    car.sectors.push({
      order,
      lap: car.lap,
      endMs,
      durationMs: endMs - (previous?.endMs || 0),
      stoppedMs: Math.round((car.insights?.stopped || 0) * 1000),
      incidents: car.insights?.incidents || 0,
      resets: car.resets,
    });
}

export function coaching(result, previous) {
  if (result.dnf)
    return "Attempt ended. Retry with the same setup; brake before the bend and keep each checkpoint in order.";
  if (result.resets)
    return `${result.resets} reset${result.resets === 1 ? "" : "s"} kept the clock running. Brake earlier on the next run and finish without a reset.`;
  const sectors = result.sectors || [];
  const losses = sectors
    .flatMap((s) => {
      const old = previous?.sectors?.find(
        (p) => p.order === s.order && p.lap === s.lap,
      );
      return old ? [{ ...s, loss: s.durationMs - old.durationMs }] : [];
    })
    .sort((a, b) => b.loss - a.loss);
  if (losses[0]?.loss >= 100) {
    const s = losses[0];
    const i = sectors.indexOf(
      sectors.find((x) => x.order === s.order && x.lap === s.lap),
    );
    const stopped = (s.stoppedMs || 0) - (sectors[i - 1]?.stoppedMs || 0);
    if (stopped > 1000)
      return `Lap ${s.lap + 1}, sector ${s.order || "finish"}: ${(stopped / 1000).toFixed(1)}s stationary. Keep moving between checkpoints; pause stops the clock when you need a break.`;
    return `Lap ${s.lap + 1}, sector ${s.order || "finish"}: ${(s.loss / 1000).toFixed(2)}s behind the comparison run. Try an earlier brake and a straighter exit here.`;
  }
  if (result.incidents)
    return `${result.incidents} contact incident${result.incidents === 1 ? "" : "s"} recorded (sustained rubbing counts once). Leave a little more room on entry.`;
  return `${result.cleanExits || 0} clean corner exits. Aim for a controlled exit above 43 km/h to earn up to 6 boost per bend per lap.`;
}

export function nextGoal(elapsedMs, targets) {
  const ladder = ["bronze", "silver", "gold"].map((tier) => ({
    tier,
    ms: targets[tier],
  }));
  const achieved = ladder.filter((t) => elapsedMs <= t.ms).at(-1);
  const next = ladder.find((t) => elapsedMs > t.ms);
  return {
    achieved: achieved?.tier || null,
    next: next || null,
    gapMs: next ? clamp(elapsedMs - next.ms, 0, 480000) : 0,
  };
}
