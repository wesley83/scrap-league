import { atDistance, nearest, pointAtPiece } from "./track.js";
import { clamp, wrap } from "./model.js";

// Derived presentation only. Physics, content and editor remain authoritative.
export function surfaceSize(w, h, dpr = 1, low = false) {
  const scale = Math.min(
    low ? 1 : 2,
    Number.isFinite(dpr) ? Math.max(1, dpr) : 1,
    Math.sqrt(2400000 / Math.max(1, w * h)),
    4096 / Math.max(1, w, h),
  );
  return {
    width: Math.max(1, Math.floor(w * scale)),
    height: Math.max(1, Math.floor(h * scale)),
  };
}
const palettes = {
  yard: ["#b9b39a", "#a6a28b", "#364549", "#427a78"],
  docks: ["#9bb9b7", "#86a8a6", "#33474f", "#c3704d"],
  foundry: ["#c6a38b", "#b58e78", "#443e42", "#677c77"],
  night: ["#30484b", "#385255", "#1d2d34", "#547e7c"],
};
function polygon(points) {
  const p = new Path2D();
  points.forEach((q, i) => (i ? p.lineTo(q.x, q.z) : p.moveTo(q.x, q.z)));
  p.closePath();
  return p;
}
const offset = (p, d) => ({
  x: p.x - Math.sin(p.heading) * d,
  z: p.z + Math.cos(p.heading) * d,
});
const road = (samples, extra = 0) =>
  polygon(
    [1, -1].flatMap((sign) =>
      (sign === 1 ? samples : [...samples].reverse()).map((p) =>
        offset(p, sign * (p.width / 2 + extra)),
      ),
    ),
  );
function seeded(seed) {
  let x = [...seed].reduce((n, c) => (n * 31 + c.charCodeAt(0)) | 0, 17);
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}
export class World {
  constructor(canvas, onLost, onRestored, { safeGraphics = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    if (!this.ctx)
      throw Error("The browser could not create the racing canvas.");
    this.onLost = onLost;
    this.safeGraphics = safeGraphics;
    this.target = {
      x: 0,
      z: 0,
      set(x, y, z) {
        this.x = x;
        this.z = z;
      },
    };
    this.angle = 0;
    this.sourceCars = [];
    this.trails = [];
    this.lastTrail = new Map();
    this.dirty = true;
    this.resizeObserver = new ResizeObserver(() => {
      this.dirty = true;
    });
    this.resizeObserver.observe(canvas);
    this.lostListener = (e) => {
      e.preventDefault();
      this.fail("The racing canvas was interrupted.");
    };
    this.restoredListener = () => onRestored?.();
    canvas.addEventListener("contextlost", this.lostListener);
    canvas.addEventListener("contextrestored", this.restoredListener);
  }
  fail(reason) {
    if (!this.contextLost) {
      this.contextLost = true;
      this.onLost?.(reason);
    }
    return false;
  }
  available() {
    return !this.disposed && !this.contextLost && !this.ctx.isContextLost?.();
  }
  dispose() {
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener("contextlost", this.lostListener);
    this.canvas.removeEventListener("contextrestored", this.restoredListener);
    this.trails = [];
    this.sourceCars = [];
    this.decor = [];
    this.lastTrail.clear();
  }
  async rebuild(race, view, settings) {
    this.contextLost = false;
    if (race && ["race", "result"].includes(view)) this.load(race.track);
    else if (this.track) this.load(this.track);
    if (view === "garage") this.garage();
    this.setCars(
      race && ["race", "result"].includes(view) ? race.cars : this.sourceCars,
    );
    if (!this.render(race, view, settings, 0))
      throw Error("Canvas recovery failed.");
  }
  load(track) {
    this.track = track;
    this.colors = palettes[track.source.scenePreset] || palettes.yard;
    const xs = track.samples.map((p) => p.x),
      zs = track.samples.map((p) => p.z);
    this.bounds = {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      z: (Math.min(...zs) + Math.max(...zs)) / 2,
      w: Math.max(...xs) - Math.min(...xs) + 48,
      h: Math.max(...zs) - Math.min(...zs) + 48,
    };
    this.road = road(track.samples);
    this.shoulder = road(track.samples, 2.4);
    this.outline = road(track.samples, 0.7);
    this.patches = track.source.patches.map((p) => {
      const piece = track.route.find((r) => r.id === p.pieceId),
        samples = [];
      for (let i = 0; i <= 24; i++)
        samples.push(
          pointAtPiece(piece, p.start + ((p.end - p.start) * i) / 24),
        );
      return {
        path: polygon([
          ...samples.map((q) => offset(q, p.lateralMin)),
          ...samples.reverse().map((q) => offset(q, p.lateralMax)),
        ]),
        surface: p.surface,
      };
    });
    const rand = seeded(track.source.id),
      b = this.bounds;
    this.decor = [];
    for (let i = 0; i < 140; i++) {
      const x = b.x + (rand() - 0.5) * (b.w + 100),
        z = b.z + (rand() - 0.5) * (b.h + 100);
      if (nearest(track, x, z).distance < 17) continue;
      this.decor.push({
        x,
        z,
        kind: i % 4,
        angle: (Math.round(rand() * 3) * Math.PI) / 2,
        size: 3 + rand() * 4,
      });
    }
    this.trails = [];
    this.lastTrail.clear();
    this.cameraReady = false;
    this.cinematicState = null;
    this.resultElapsed = 0;
    this.dirty = true;
  }
  setCars(cars) {
    this.sourceCars = cars;
    this.cameraReady = false;
  }
  setGhost(spec, frames) {
    this.ghostFrames = frames;
  }
  garage() {
    this.view = "garage";
    this.cameraReady = false;
    this.dirty = true;
  }
  cinematic(track, spec, final = false) {
    this.load(track);
    this.setCars([{ spec }]);
    this.cinematicState = { elapsed: 0, final };
  }
  resize() {
    if (!this.dirty) return;
    this.width = Math.max(1, this.canvas.clientWidth);
    this.height = Math.max(1, this.canvas.clientHeight);
    const size = surfaceSize(
      this.width,
      this.height,
      globalThis.devicePixelRatio,
      this.safeGraphics,
    );
    if (
      size.width !== this.canvas.width ||
      size.height !== this.canvas.height
    ) {
      this.canvas.width = size.width;
      this.canvas.height = size.height;
    }
    this.dirty = false;
  }
  render(race, view, settings, dt = 1 / 60) {
    if (!this.available())
      return this.fail("The racing canvas stopped drawing.");
    try {
      this.draw(race, view, settings, dt);
      return true;
    } catch (e) {
      console.error("Canvas rendering failed", e);
      return this.fail(e.message);
    }
  }
  draw(race, view, settings, dt) {
    this.resize();
    const ctx = this.ctx,
      w = this.width,
      h = this.height;
    ctx.setTransform(this.canvas.width / w, 0, 0, this.canvas.height / h, 0, 0);
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    ctx.fillStyle = (this.colors || palettes.yard)[0];
    ctx.fillRect(0, 0, w, h);
    if (view === "garage") {
      this.drawGarage(w, h);
      this.view = view;
      return;
    }
    if (!this.track) return;
    const active = race && ["race", "result"].includes(view),
      b = this.bounds;
    let zoom,
      x,
      z,
      angle = 0;
    const p = active && race.cars.find((c) => c.id === "player");
    if (active) {
      const short = h < 280 && w > h * 1.4;
      zoom = Math.min(w / 62, Math.max(h / 70, short ? 5 : 0), 12);
      const fixed = settings.northUp || settings.reducedMotion,
        goal = fixed ? 0 : p.heading + (short ? 0 : Math.PI / 2);
      const look = fixed ? 7 : short ? 18 : 12;
      const tx = p.x + Math.cos(p.heading) * look,
        tz = p.z + Math.sin(p.heading) * look;
      const snap = !this.cameraReady || this.view !== view || p.resetTime > 1.9;
      const f = snap ? 1 : 1 - Math.exp(-8 * Math.min(dt, 0.1));
      this.target.x += (tx - this.target.x) * f;
      this.target.z += (tz - this.target.z) * f;
      this.angle +=
        wrap(goal - this.angle) *
        (snap ? 1 : 1 - Math.exp(-5 * Math.min(dt, 0.1)));
      this.cameraReady = true;
      x = this.target.x;
      z = this.target.z;
      angle = this.angle;
    } else {
      zoom = Math.min(w / (b.w + 18), h / (b.h + 18));
      x = b.x;
      z = b.z;
    }
    this.projection = { x, z, zoom, angle, width: w, height: h };
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(zoom, zoom);
    ctx.rotate(-angle);
    ctx.translate(-x, -z);
    this.drawTrack(ctx, settings);
    if (active) {
      if (
        !settings.lowEffects &&
        !settings.reducedMotion &&
        race.state === "racing"
      )
        this.addTrails(race);
      for (const t of this.trails) {
        ctx.strokeStyle = "#14252b70";
        ctx.lineWidth = 0.18;
        ctx.beginPath();
        ctx.moveTo(t.ax, t.az);
        ctx.lineTo(t.bx, t.bz);
        ctx.stroke();
      }
      this.drawGate(ctx, race.track.gates[p.nextGate], true);
      const ghost = this.ghostAt(race.time);
      if (ghost && settings.ghost)
        this.drawCar(
          ctx,
          { ...ghost, spec: p.spec, color: "#c5fff2", number: "" },
          true,
        );
      for (const c of race.cars) this.drawCar(ctx, c);
      ctx.save();
      ctx.translate(p.x, p.z);
      ctx.rotate(angle);
      ctx.fillStyle = "#18343bf0";
      ctx.fillRect(2.6, -1.2, 30 / zoom, 16 / zoom);
      ctx.fillStyle = "#fff6cf";
      ctx.font = `700 ${11 / zoom}px LeagueText, sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText("YOU", 2.6 + 4 / zoom, -1.2 + 12 / zoom);
      ctx.restore();
    } else {
      const spec = this.sourceCars?.[0]?.spec;
      if (spec)
        this.drawCar(ctx, {
          ...this.track.grid[0],
          spec,
          color: "#ffd34e",
          number: "04",
        });
      else
        for (let i = 0; i < 5; i++)
          this.drawCar(ctx, {
            ...atDistance(this.track, this.track.length * (0.08 + i * 0.14)),
            spec: { chassis: { length: 5, width: 2.5, wheelbase: 3 } },
            color: ["#ffd34e", "#ed7a59", "#96c8bf", "#e9e4d4", "#8ca9c7"][i],
            number: String(i + 1).padStart(2, "0"),
          });
      if (this.cinematicState)
        this.cinematicState.elapsed = Math.min(
          4.5,
          this.cinematicState.elapsed + dt,
        );
    }
    ctx.restore();
    this.view = view;
    if (view === "result")
      this.resultElapsed = Math.min(1.5, this.resultElapsed + dt);
  }
  drawTrack(ctx, settings) {
    const t = this.track,
      colors = this.colors,
      projection = this.projection;
    if (!settings.lowEffects)
      for (const o of this.decor) {
        const radius =
          Math.hypot(projection.width, projection.height) / projection.zoom;
        if (
          Math.abs(o.x - projection.x) > radius ||
          Math.abs(o.z - projection.z) > radius
        )
          continue;
        ctx.save();
        ctx.translate(o.x, o.z);
        ctx.rotate(o.angle);
        if (o.kind === 0 || o.kind === 3) {
          ctx.fillStyle = "#142d322b";
          ctx.fillRect(-o.size + 1, -2, o.size * 2, 5);
          ctx.fillStyle = o.kind === 0 ? colors[3] : "#bd7958";
          ctx.fillRect(-o.size, -3, o.size * 2, 5);
          ctx.strokeStyle = "#ffffff35";
          ctx.lineWidth = 0.18;
          for (let j = -o.size + 0.8; j < o.size; j += 1) {
            ctx.beginPath();
            ctx.moveTo(j, -2.6);
            ctx.lineTo(j, 1.6);
            ctx.stroke();
          }
        } else if (o.kind === 1) {
          ctx.fillStyle = colors[1];
          ctx.beginPath();
          ctx.arc(0, 0, o.size, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.strokeStyle = "#253b3b";
          ctx.lineWidth = 0.65;
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(i * 1.5, 0, 0.75, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    ctx.fillStyle = colors[1];
    ctx.fill(this.shoulder);
    ctx.fillStyle = "#1b2e34";
    ctx.fill(this.outline);
    ctx.fillStyle = colors[2];
    ctx.fill(this.road);
    for (const p of this.patches) {
      ctx.fillStyle = p.surface === "mud" ? "#756354" : "#a59672";
      ctx.fill(p.path);
    }
    for (let i = 0; i < t.samples.length; i += 3) {
      const a = t.samples[i],
        b = t.samples[(i + 3) % t.samples.length];
      ctx.strokeStyle = i % 6 === 0 ? "#e4dcca" : "#dc765c";
      ctx.lineWidth = 0.65;
      for (const side of [-1, 1]) {
        const aa = offset(a, (a.width / 2) * side),
          bb = offset(b, (b.width / 2) * side);
        ctx.beginPath();
        ctx.moveTo(aa.x, aa.z);
        ctx.lineTo(bb.x, bb.z);
        ctx.stroke();
      }
    }
    for (let s = 15; s < t.length; s += 24) {
      const p = atDistance(t, s);
      ctx.save();
      ctx.translate(p.x, p.z);
      ctx.rotate(p.heading);
      ctx.strokeStyle = "#ccd5cf65";
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      ctx.moveTo(-1.4, -1);
      ctx.lineTo(0, 0);
      ctx.lineTo(-1.4, 1);
      ctx.stroke();
      ctx.restore();
    }
    for (const p of t.props) {
      ctx.save();
      ctx.translate(p.x, p.z);
      ctx.rotate(p.heading);
      ctx.fillStyle =
        p.kind === "pad"
          ? "#63c5b5"
          : p.kind === "barrier"
            ? "#182c30"
            : "#73826d";
      ctx.fillRect(-p.length / 2, -p.width / 2, p.length, p.width);
      ctx.strokeStyle = p.kind === "pad" ? "#e9f8d5" : "#f0d481";
      ctx.lineWidth = 0.25;
      ctx.strokeRect(-p.length / 2, -p.width / 2, p.length, p.width);
      if (p.kind === "pad")
        for (let x = -p.length / 2 + 1; x < p.length / 2; x += 2) {
          ctx.beginPath();
          ctx.moveTo(x - 0.8, -p.width * 0.3);
          ctx.lineTo(x + 0.6, 0);
          ctx.lineTo(x - 0.8, p.width * 0.3);
          ctx.stroke();
        }
      ctx.restore();
    }
    this.drawGate(ctx, t.gates[0]);
    for (const s of t.grid) {
      ctx.save();
      ctx.translate(s.x, s.z);
      ctx.rotate(s.heading);
      ctx.strokeStyle = "#b4c1b78c";
      ctx.lineWidth = 0.15;
      ctx.strokeRect(-2.3, -1.5, 4.6, 3);
      ctx.restore();
    }
  }
  drawGate(ctx, g, active = false) {
    ctx.save();
    ctx.translate(g.x, g.z);
    ctx.rotate(g.heading);
    if (g.kind === "finish") {
      for (let x = 0; x < 3; x++)
        for (let y = 0; y < Math.ceil(g.width); y++) {
          ctx.fillStyle = (x + y) % 2 ? "#f1ead9" : "#182b32";
          ctx.fillRect(x - 1.5, y - g.width / 2, 1, Math.min(1, g.width - y));
        }
    } else if (active) {
      ctx.strokeStyle = "#c4f1d0b0";
      ctx.lineWidth = 0.28;
      ctx.setLineDash([0.7, 0.7]);
      ctx.beginPath();
      ctx.moveTo(0, -g.width / 2);
      ctx.lineTo(0, g.width / 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (active)
      for (const sign of [-1, 1]) {
        ctx.fillStyle = "#fff0b0";
        ctx.beginPath();
        ctx.moveTo(0, sign * (g.width / 2 - 0.1));
        ctx.lineTo(-1, sign * (g.width / 2 + 2));
        ctx.lineTo(1, sign * (g.width / 2 + 2));
        ctx.closePath();
        ctx.fill();
      }
    ctx.restore();
  }
  addTrails(race) {
    for (const c of race.cars) {
      const last = this.lastTrail.get(c.id),
        distance = last ? Math.hypot(c.x - last.x, c.z - last.z) : 0;
      if (last && distance < 0.45) continue;
      if (
        last &&
        distance < 4 &&
        Math.abs(-c.vx * Math.sin(c.heading) + c.vz * Math.cos(c.heading)) > 2
      )
        for (const sign of [-1, 1]) {
          const a = offset(last, sign * 0.8),
            b = offset(c, sign * 0.8);
          this.trails.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z });
        }
      this.lastTrail.set(c.id, { x: c.x, z: c.z, heading: c.heading });
    }
    if (this.trails.length > 360)
      this.trails.splice(0, this.trails.length - 360);
  }
  ghostAt(time) {
    const f = this.ghostFrames;
    if (!f?.length || time * 1000 > f[f.length - 4]) return null;
    const a = Math.min(Math.max(0, f.length - 8), Math.floor(time * 20) * 4),
      b = Math.min(f.length - 4, a + 4);
    const t = clamp((time * 1000 - f[a]) / (f[b] - f[a] || 1), 0, 1);
    return {
      x: f[a + 1] + (f[b + 1] - f[a + 1]) * t,
      z: f[a + 2] + (f[b + 2] - f[a + 2]) * t,
      heading: f[a + 3] + wrap(f[b + 3] - f[a + 3]) * t,
    };
  }
  drawCar(ctx, c, ghost = false) {
    const ch = c.spec.chassis,
      l = ch.length,
      w = ch.width;
    ctx.save();
    ctx.translate(c.x, c.z);
    ctx.rotate(c.heading);
    if (ghost) ctx.globalAlpha = 0.35;
    if (c.boosting || c.padTime > 0) {
      ctx.fillStyle = "#ffbd4f";
      ctx.beginPath();
      ctx.moveTo(-l / 2, -w * 0.32);
      ctx.lineTo(-l / 2 - 2.4, 0);
      ctx.lineTo(-l / 2, w * 0.32);
      ctx.fill();
    }
    ctx.fillStyle = "#10242a65";
    ctx.fillRect(-l / 2 + 0.3, -w / 2 + 0.4, l, w);
    ctx.fillStyle = "#14242b";
    for (const a of [-1, 1])
      for (const b of [-1, 1])
        ctx.fillRect(
          (a * ch.wheelbase) / 2 - 0.55,
          (b * w) / 2 - 0.2,
          1.1,
          0.45,
        );
    ctx.fillStyle = c.color || "#ffd34e";
    ctx.strokeStyle = "#17272d";
    ctx.lineWidth = 0.14;
    ctx.beginPath();
    ctx.roundRect(-l / 2, -w / 2, l, w, 0.35);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f8eed6";
    ctx.fillRect(-l * 0.3, -w * 0.1, l * 0.72, w * 0.2);
    ctx.fillStyle = "#24474d";
    ctx.fillRect(0.3, -w * 0.39, l * 0.17, w * 0.78);
    ctx.fillRect(-l * 0.32, -w * 0.34, l * 0.14, w * 0.68);
    ctx.fillStyle = "#f6e8c0";
    ctx.fillRect(l / 2 - 0.3, -w * 0.38, 0.23, 0.35);
    ctx.fillRect(l / 2 - 0.3, w * 0.38 - 0.35, 0.23, 0.35);
    ctx.fillStyle = "#182f35";
    ctx.font = "bold 1.1px LeagueText, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.rotate(Math.PI / 2);
    ctx.fillText(c.number ?? "04", 0, 0);
    ctx.restore();
  }
  drawGarage(w, h) {
    const ctx = this.ctx;
    ctx.fillStyle = "#214044";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#ffffff0d";
    ctx.lineWidth = 1;
    for (let i = 0; i < Math.max(w, h); i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, h);
      ctx.moveTo(0, i);
      ctx.lineTo(w, i);
      ctx.stroke();
    }
    const spec = this.sourceCars[0]?.spec;
    if (!spec) return;
    const scale = Math.min(w / 10, h / 11);
    ctx.save();
    ctx.translate(w * 0.5, h * 0.32);
    ctx.scale(scale, scale);
    this.drawCar(ctx, {
      x: 0,
      z: 0,
      heading: -0.5,
      spec,
      color: "#ffd34e",
      number: "04",
    });
    ctx.restore();
  }
}
