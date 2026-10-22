// Deterministic PRNG: xoshiro128** (32-bit) seeded via splitmix32.
// The sim uses ONLY this RNG — never Math.random — so runs are reproducible
// and tests/netcode/replays are deterministic.

function rotl32(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

function splitmix32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

export type RngState = [number, number, number, number];

export class Rng {
  private s: [number, number, number, number];

  constructor(seed: number) {
    const next = splitmix32(seed);
    this.s = [next(), next(), next(), next()];
    // xoshiro must not be all-zero.
    if ((this.s[0] | this.s[1] | this.s[2] | this.s[3]) === 0) {
      this.s = [0x9e3779b9, 0x7f4a7c15, 0xf39cc060, 0x1f123bb5];
    }
  }

  private static fromState(s: RngState): Rng {
    const r = Object.create(Rng.prototype) as Rng;
    r.s = [s[0], s[1], s[2], s[3]];
    return r;
  }

  nextU32(): number {
    const s = this.s;
    const result = Math.imul(rotl32(Math.imul(s[0], 5), 7), 9);
    const t = (s[1] << 9) >>> 0;
    s[2] = (s[2] ^ s[0]) >>> 0;
    s[3] = (s[3] ^ s[1]) >>> 0;
    s[1] = (s[1] ^ s[2]) >>> 0;
    s[0] = (s[0] ^ s[3]) >>> 0;
    s[2] = (s[2] ^ t) >>> 0;
    s[3] = rotl32(s[3], 11);
    return result >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** true with probability p in [0, 1]. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Pick a uniformly random element. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("Rng.pick: empty array");
    return items[this.int(0, items.length - 1)];
  }

  /** Fisher-Yates shuffle in place. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = items[i];
      items[i] = items[j];
      items[j] = tmp;
    }
    return items;
  }

  /** Independent stream derived from this one (for subsystems). */
  fork(): Rng {
    return Rng.fromState([this.nextU32(), this.nextU32(), this.nextU32(), this.nextU32()]);
  }

  getState(): RngState {
    return [this.s[0], this.s[1], this.s[2], this.s[3]];
  }

  setState(state: RngState): void {
    this.s = [state[0], state[1], state[2], state[3]];
  }
}
