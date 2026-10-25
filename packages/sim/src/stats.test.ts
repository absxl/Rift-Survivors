import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, createWorld, snapshot } from "./index";
import type { ContentPack } from "./index";

const STATS_PACK: ContentPack = {
  id: "stats",
  schemaVersion: 1,
  enemies: [],
  weapons: [],
  passives: [],
  characters: [
    {
      id: "champion",
      startingWeapon: "none",
      baseStats: { might: 0.25, cooldown: 0.1 },
    },
  ],
  powerUps: [],
  synergies: [],
};

describe("snapshot stats", () => {
  it("exposes evaluated character + item stats for the HUD", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: STATS_PACK }, 1);
    expect(snapshot(world).stats.might).toBeCloseTo(1.25);
    expect(snapshot(world).stats.cooldown).toBeCloseTo(1.1);

    world.modifiers.add("might", { op: "add", value: 0.2, source: "test" });
    world.modifiers.add("armor", { op: "add", value: 3, source: "test" });

    const stats = snapshot(world).stats;
    expect(stats.might).toBeCloseTo(1.45);
    expect(stats.cooldown).toBeCloseTo(1.1);
    expect(stats.area).toBe(1);
    expect(stats.moveSpeed).toBe(1);
    expect(stats.magnet).toBe(1);
    expect(stats.armor).toBe(3);
    expect(stats.luck).toBe(0);
  });
});
