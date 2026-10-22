import { describe, expect, it } from "vitest";
import { Rng } from "./rng";

describe("Rng", () => {
  it("is deterministic for a fixed seed", () => {
    const a = new Rng(1234);
    const b = new Rng(1234);
    for (let i = 0; i < 1000; i++) {
      expect(a.nextU32()).toBe(b.nextU32());
    }
  });

  it("produces different sequences for different seeds", () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const seqA = Array.from({ length: 10 }, () => a.nextU32());
    const seqB = Array.from({ length: 10 }, () => b.nextU32());
    expect(seqA).not.toEqual(seqB);
  });

  it("next() stays in [0, 1)", () => {
    const r = new Rng(42);
    for (let i = 0; i < 10000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("int() stays within bounds and covers the range", () => {
    const r = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = r.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      seen.add(v);
    }
    expect(seen.size).toBe(5);
  });

  it("fork() produces an independent stream", () => {
    const r = new Rng(9);
    const parent = Array.from({ length: 10 }, () => r.nextU32());
    const f1 = r.fork();
    const f2 = r.fork();
    const seq1 = Array.from({ length: 10 }, () => f1.nextU32());
    const seq2 = Array.from({ length: 10 }, () => f2.nextU32());
    expect(seq1).not.toEqual(seq2);
    expect(seq1).not.toEqual(parent);
  });

  it("shuffle() permutes without losing elements", () => {
    const r = new Rng(5);
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = r.shuffle([...items]);
    expect([...shuffled].sort((x, y) => x - y)).toEqual(items);
  });
});
