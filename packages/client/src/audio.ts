// Tiny procedural 8-bit SFX + soundtrack (WebAudio, no external assets).
// Per-sound rate limit so a swarm of hits doesn't turn into noise (docs/13 §14).
// The soundtrack is a scheduled pentatonic loop whose intensity scales with
// party level — menu calm, combat driving (docs/10 D-053).
export type SfxKind = "hit" | "kill" | "levelup" | "pickup" | "chest" | "fire" | "buy" | "dash";

const TONES: Record<
  SfxKind,
  { freq: number; dur: number; type: OscillatorType; slide?: number; gap: number }
> = {
  hit: { freq: 320, dur: 0.03, type: "square", gap: 45 },
  kill: { freq: 180, dur: 0.05, type: "square", slide: 120, gap: 45 },
  levelup: { freq: 520, dur: 0.14, type: "triangle", slide: 880, gap: 200 },
  pickup: { freq: 660, dur: 0.04, type: "square", gap: 55 },
  chest: { freq: 440, dur: 0.16, type: "triangle", slide: 990, gap: 200 },
  fire: { freq: 240, dur: 0.02, type: "square", gap: 90 },
  buy: { freq: 720, dur: 0.09, type: "triangle", slide: 1080, gap: 120 },
  dash: { freq: 300, dur: 0.08, type: "sawtooth", slide: 90, gap: 140 },
};

export class Sfx {
  private ctx: AudioContext | null = null;
  private volume = 0.5;
  private readonly last: Partial<Record<SfxKind, number>> = {};

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
  }

  /** Call from a user gesture (PLAY click) so the audio context can start. */
  unlock(): void {
    const ctx = this.ensure();
    if (ctx && ctx.state === "suspended") void ctx.resume();
  }

  /** Shared context for the music system. */
  context(): AudioContext | null {
    return this.ensure();
  }

  play(kind: SfxKind): void {
    if (this.volume <= 0) return;
    const now = performance.now();
    const tone = TONES[kind];
    if ((this.last[kind] ?? 0) + tone.gap > now) return;
    this.last[kind] = now;

    const ctx = this.ensure();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tone.type;
    osc.frequency.setValueAtTime(tone.freq, ctx.currentTime);
    if (tone.slide) osc.frequency.linearRampToValueAtTime(tone.slide, ctx.currentTime + tone.dur);
    gain.gain.setValueAtTime(this.volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + tone.dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + tone.dur);
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      this.ctx = new AudioContext();
    } catch {
      return null;
    }
    return this.ctx;
  }
}

// --- Procedural soundtrack ---------------------------------------------------

/** A minor pentatonic, two octaves — reads heroic on square/triangle voices. */
const MELODY_SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99];
const BASS_ROOTS = [110, 110, 130.81, 98]; // A2 A2 C3 G2 — a simple i-i-III-VII walk

export class Music {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private timer: number | null = null;
  private step = 0;
  private volume = 0.35;
  /** 0 = menu calm, 1 = full combat drive. */
  private intensity = 0;

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.gain && this.ctx) {
      this.gain.gain.setTargetAtTime(this.volume * 0.16, this.ctx.currentTime, 0.2);
    }
  }

  setIntensity(value: number): void {
    this.intensity = Math.max(0, Math.min(1, value));
  }

  start(ctx: AudioContext): void {
    if (this.timer !== null) return;
    this.ctx = ctx;
    this.gain = ctx.createGain();
    this.gain.gain.value = this.volume * 0.16;
    this.gain.connect(ctx.destination);
    // 8th-note pulse at ~112 BPM.
    this.timer = window.setInterval(() => this.tick(), 268);
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    const ctx = this.ctx;
    const gain = this.gain;
    if (!ctx || !gain || this.volume <= 0) return;
    const t = ctx.currentTime;

    // Bass every 4 steps; melody picks scale notes whose density scales with
    // intensity (menu plays sparser, combat drives).
    if (this.step % 4 === 0) {
      this.note(BASS_ROOTS[(this.step / 4) % BASS_ROOTS.length], t, 0.9, "triangle", 0.9);
    }
    const density = 0.35 + this.intensity * 0.5;
    if ((this.step * 7919) % 100 < density * 100) {
      const idx = (this.step * 3 + (this.step % 5)) % MELODY_SCALE.length;
      this.note(MELODY_SCALE[idx], t, 0.16, "square", 0.35 + this.intensity * 0.3);
    }
    this.step++;
  }

  private note(freq: number, t: number, dur: number, type: OscillatorType, level: number): void {
    const ctx = this.ctx;
    const gain = this.gain;
    if (!ctx || !gain) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    env.gain.setValueAtTime(level, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(env);
    env.connect(gain);
    osc.start(t);
    osc.stop(t + dur);
  }
}
