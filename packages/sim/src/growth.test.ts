import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, createWorld, step } from "./index";
import type { ContentPack } from "./index";

const GROWTH_PACK: ContentPack = {
  id: "growth",
  schemaVersion: 1,
  enemies: [],
  abilities: [
    {
      id: "blade",
      behavior: "sweep",
      params: { arc: 1.2 },
      maxLevel: 5,
      base: {
        damage: 10,
        cooldown: 60,
        area: 44,
        speed: 0,
        duration: 0,
        amount: 1,
        pierce: 99,
        hitCooldown: 12,
        knockback: 4,
        lifetime: 0,
      },
      levels: [{ delta: { damage: 4 } }],
      damageType: "physical",
    },
  ],
  passives: [],
  characters: [
    { id: "champion", startingAbility: "blade", growth: { everyLevels: 1, mods: { might: 0.1 } } },
  ],
  powerUps: [],
  synergies: [],
};

describe("growth", () => {
  it("applies character growth every N levels", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: GROWTH_PACK }, 1);
    expect(world.playerStat(0, "might", 1)).toBeCloseTo(1);

    world.partyXp = 100;
    step(world, []);
    expect(world.stores.players.field("level")[0]).toBe(2);
    // everyLevels = 1 => stacks = 2 => +0.2 might
    expect(world.playerStat(0, "might", 1)).toBeCloseTo(1.2);
  });
});
