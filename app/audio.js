import { clamp } from "./model.js";
export class Sound {
  constructor({ Context = globalThis.AudioContext } = {}) {
    this.Context = Context;
    this.enabled = false;
    this.musicEnabled = true;
    this.effectsVolume = 0.7;
    this.musicVolume = 0.35;
    this.voices = new Set();
    this.started = false;
    this.operation = 0;
  }
  async activate() {
    const operation = ++this.operation;
    this.wantsAudio = this.enabled;
    if (!this.enabled) return this.stop();
    try {
      if (!this.ctx) {
        this.ctx = new this.Context();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.16;
        const limiter = this.ctx.createDynamicsCompressor();
        limiter.threshold.value = -14;
        limiter.ratio.value = 8;
        this.master.connect(limiter).connect(this.ctx.destination);
        this.effects = this.ctx.createGain();
        this.music = this.ctx.createGain();
        this.effects.connect(this.master);
        this.music.connect(this.master);
        this.engine = this.ctx.createOscillator();
        this.engine.type = "sawtooth";
        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0;
        const filter = this.ctx.createBiquadFilter();
        filter.frequency.value = 600;
        this.engine
          .connect(filter)
          .connect(this.engineGain)
          .connect(this.effects);
        this.engine.start();
        const buffer = this.ctx.createBuffer(
            1,
            this.ctx.sampleRate,
            this.ctx.sampleRate,
          ),
          samples = buffer.getChannelData(0);
        let seed = 8128,
          last = 0;
        for (let i = 0; i < samples.length; i++) {
          seed = (1664525 * seed + 1013904223) >>> 0;
          last = (last + ((seed / 4294967296) * 2 - 1) * 0.12) / 1.12;
          samples[i] = last;
        }
        this.road = this.ctx.createBufferSource();
        this.road.buffer = buffer;
        this.road.loop = true;
        this.roadGain = this.ctx.createGain();
        this.roadGain.gain.value = 0;
        this.roadFilter = this.ctx.createBiquadFilter();
        this.roadFilter.type = "bandpass";
        this.road
          .connect(this.roadFilter)
          .connect(this.roadGain)
          .connect(this.effects);
        this.road.start();
      }
      this.levels();
      await this.ctx.resume();
      if (operation !== this.operation || !this.enabled) {
        if (!this.wantsAudio) await this.ctx.suspend();
        return;
      }
      this.started = true;
    } catch {
      this.enabled = false;
    }
  }
  async celebrate(final = false) {
    await this.activate();
    if (!this.started || !this.wantsAudio) return;
    const operation = this.operation;
    this.engineGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.roadGain.gain.setValueAtTime(0, this.ctx.currentTime);
    for (const [i, note] of (final
      ? [261.63, 329.63, 392, 523.25]
      : [261.63, 329.63, 392]
    ).entries()) {
      setTimeout(() => {
        if (this.operation === operation) this.tone(note, 0.5, 0.12, "music");
      }, i * 140);
    }
    setTimeout(() => {
      if (this.operation === operation) this.stop();
    }, 1100);
  }
  levels() {
    if (!this.ctx) return;
    this.effects.gain.setTargetAtTime(
      clamp(this.effectsVolume, 0, 1),
      this.ctx.currentTime,
      0.03,
    );
    this.music.gain.setTargetAtTime(
      this.musicEnabled ? clamp(this.musicVolume, 0, 1) : 0,
      this.ctx.currentTime,
      0.03,
    );
  }
  tone(freq, duration = 0.12, volume = 0.16, bus = "effects") {
    if (
      !this.ctx ||
      !this.enabled ||
      this.ctx.state !== "running" ||
      this.voices.size >= 22
    )
      return;
    if (
      !Number.isFinite(freq) ||
      !Number.isFinite(duration) ||
      !Number.isFinite(volume)
    )
      return;
    const t = this.ctx.currentTime,
      o = this.ctx.createOscillator(),
      g = this.ctx.createGain();
    o.type = "triangle";
    o.frequency.value = clamp(freq, 30, 4000);
    g.gain.setValueAtTime(clamp(volume, 0.001, 0.3), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + clamp(duration, 0.02, 1));
    o.connect(g).connect(bus === "music" ? this.music : this.effects);
    this.voices.add(o);
    o.onended = () => {
      this.voices.delete(o);
      o.disconnect();
      g.disconnect();
    };
    o.start();
    o.stop(t + clamp(duration, 0.02, 1));
  }
  update(car, active, scene, time) {
    if (!active || !this.enabled) {
      if (this.ctx?.state === "running") this.stop();
      return;
    }
    if (!this.ctx || this.ctx.state !== "running") return;
    this.levels();
    const t = this.ctx.currentTime,
      speed = Math.hypot(car.vx, car.vz);
    this.engineGain.gain.setTargetAtTime(0.12, t, 0.06);
    this.engine.frequency.setTargetAtTime(
      45 + speed * 4 + (car.boosting ? 35 : 0),
      t,
      0.07,
    );
    const slip = Math.abs(
      -car.vx * Math.sin(car.heading) + car.vz * Math.cos(car.heading),
    );
    this.roadFilter.frequency.setTargetAtTime(
      car.surface === "gravel" ? 1600 : car.surface === "mud" ? 350 : 2200,
      t,
      0.06,
    );
    this.roadGain.gain.setTargetAtTime(
      Math.min(0.6, car.surface === "asphalt" ? slip / 15 : speed / 45),
      t,
      0.06,
    );
    if (this.car !== car) {
      this.car = car;
      this.contacts = car.contacts;
      this.boosting = car.boosting;
    }
    if (car.contacts > this.contacts) this.tone(75, 0.09, 0.2);
    if (car.boosting && !this.boosting) this.tone(660, 0.18, 0.12);
    this.contacts = car.contacts;
    this.boosting = car.boosting;
    const beat = Math.floor(time * 2);
    if (beat !== this.beat && this.musicEnabled) {
      this.beat = beat;
      const notes = {
        yard: [55, 55, 82.4, 65.4],
        docks: [65.4, 82.4, 73.4, 55],
        foundry: [49, 58.3, 73.4, 58.3],
        final: [65.4, 98, 82.4, 73.4],
      }[scene] || [55];
      this.tone(notes[beat % notes.length], 0.18, 0.12, "music");
    }
  }
  stop() {
    ++this.operation;
    this.wantsAudio = false;
    this.started = false;
    for (const voice of this.voices) {
      try {
        voice.stop();
      } catch {}
    }
    this.voices.clear();
    if (this.ctx) {
      this.engineGain.gain.setValueAtTime(0, this.ctx.currentTime);
      this.roadGain.gain.setValueAtTime(0, this.ctx.currentTime);
      return this.ctx.suspend().catch(() => {});
    }
    return Promise.resolve();
  }
}
