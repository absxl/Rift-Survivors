import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, createWorld } from "./index";
import type { AbilityDef, ContentPack } from "./index";

function scaledAbility(id: string, scale?: { ap?: number; ad?: number }): AbilityDef {
  return {
    id,
    behavior: "shoot-nearest",
    params: {},
    maxLevel: 5,
    base: {
      damage: 10,
      cooldown: 60,
      area: 5,
      speed: 5,
      duration: 0,
      amount: 1,
      pierce: 0,
      hitCooldown: 10,
      knockback: 1,
      lifetime: 60,
    },
    levels: [
      { delta: { damage: 2 } },
      { delta: { damage: 2 } },
      { delta: { damage: 2 } },
      { delta: { damage: 2 } },
    ],
    damageType: "magic",
    scale,
  };
}

const PACK: ContentPack = {
  id: "scale-test",
  schemaVersion: 1,
  enemies: [],
  abilities: [
    scaledAbility("plain"),
    scaledAbility("ap-only", { ap: 0.5 }),
    scaledAbility("ad-only", { ad: 0.8 }),
    scaledAbility("hybrid", { ap: 0.66, ad: 0.33 }),
  ],
  passives: [],
  characters: [
    {
      id: "battle-mage",
      startingAbility: "ap-only",
      baseStats: { abilityPower: 100, attackDamage: 50 },
    },
  ],
  powerUps: [],
  synergies: [],
};

describe("AP/AD ability scaling", () => {
  it("multiplies damage by 1 + stat × ratio, mirroring the real game", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: PACK }, 1);
    // Base stats: 100 AP and 50 AD.
    expect(world.statsFor(0).abilityPower).toBe(100);
    expect(world.statsFor(0).attackDamage).toBe(50);
    // Level 1 base damage 10, might 1.
    expect(world.abilityDamage(PACK.abilities[0], 1, 0)).toBe(10); // no scale
    expect(world.abilityDamage(PACK.abilities[1], 1, 0)).toBeCloseTo(10 * (1 + 100 * 0.5)); // 510
    expect(world.abilityDamage(PACK.abilities[2], 1, 0)).toBeCloseTo(10 * (1 + 50 * 0.8)); // 410
    expect(world.abilityDamage(PACK.abilities[3], 1, 0)).toBeCloseTo(
      10 * (1 + 100 * 0.66) * (1 + 50 * 0.33),
    );
  });

  it("scales level deltas too (tooltip and sim agree)", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: PACK }, 1);
    const def = PACK.abilities[1];
    // Level 5: damage 10 + 4*2 = 18 → ×51 with 100 AP at 0.5.
    expect(world.abilityDamage(def, 5, 0)).toBeCloseTo(18 * (1 + 100 * 0.5));
  });
});
