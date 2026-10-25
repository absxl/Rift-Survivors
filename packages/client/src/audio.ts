// Tiny procedural 8-bit SFX (WebAudio, no external assets). Per-sound rate limit
// so a swarm of hits doesn't turn into noise (docs/13 §14).
export type SfxKind = "hit" | "kill" | "levelup" | "pickup" | "chest" | "fire";

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
};

export class Sfx {
  private ctx: AudioContext | null = null;
  private volume = 0.22;
  private readonly last: Partial<Record<SfxKind, number>> = {};

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
  }

  /** Call from a user gesture (PLAY click) so the audio context can start. */
  unlock(): void {
    const ctx = this.ensure();
    if (ctx && ctx.state === "suspended") void ctx.resume();
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
