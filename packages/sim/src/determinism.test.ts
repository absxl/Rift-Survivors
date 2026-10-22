import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, createWorld, snapshot, step } from "./index";
import { Rng } from "./rng";
import type { PlayerInput } from "./types";

function makeInputs(rng: Rng, count: number, players: number): PlayerInput[][] {
  const frames: PlayerInput[][] = [];
  for (let f = 0; f < count; f++) {
    const frame: PlayerInput[] = [];
    for (let p = 0; p < players; p++) {
      frame.push({ playerId: p, moveX: rng.range(-1, 1), moveY: rng.range(-1, 1) });
    }
    frames.push(frame);
  }
  return frames;
}

describe("determinism", () => {
  it("produces bit-identical snapshots for identical seed + input stream", () => {
    const seed = 12345;
    const players = 2;
    const inputRng = new Rng(999);
    const frames = makeInputs(inputRng, 5000, players);

    const a = createWorld(DEFAULT_RULESET, { playerCount: players }, seed);
    const b = createWorld(DEFAULT_RULESET, { playerCount: players }, seed);

    for (let i = 0; i < 5000; i++) {
      step(a, frames[i]);
      step(b, frames[i]);
    }

    expect(snapshot(a)).toEqual(snapshot(b));
  });

  it("produces different snapshots for different seeds", () => {
    const players = 1;
    const inputRng = new Rng(7);
    const frames = makeInputs(inputRng, 200, players);

    const a = createWorld(DEFAULT_RULESET, { playerCount: players }, 1);
    const b = createWorld(DEFAULT_RULESET, { playerCount: players }, 2);

    for (let i = 0; i < 200; i++) {
      step(a, frames[i]);
      step(b, frames[i]);
    }

    expect(snapshot(a)).not.toEqual(snapshot(b));
  });
});
