import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, applyChoice, createWorld, snapshot, step } from "./index";
import type { AbilityDef, ContentPack } from "./index";

function ability(id: string, tag: string): AbilityDef {
  return {
    id,
    tags: [tag],
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
    levels: [
      { delta: { damage: 4 } },
      { delta: { damage: 4 } },
      { delta: { damage: 6 } },
      { delta: { damage: 8 } },
    ],
    damageType: "physical",
  };
}

const COOP_STATS_PACK: ContentPack = {
  id: "coop-stats",
  schemaVersion: 1,
  enemies: [],
  abilities: [ability("flame", "damage:fire"), ability("arcane", "damage:arcane")],
  passives: [],
  items: [
    {
      id: "power-token",
      name: "Power Token",
      tier: "component",
      cost: 10,
      stats: { might: 0.2, maxHp: 0.25 },
    },
  ],
  characters: [
    {
      id: "mage-a",
      startingAbility: "flame",
      baseStats: { might: 0.25 },
      growth: { everyLevels: 2, mods: { might: 0.1 } },
    },
    {
      id: "mage-b",
      startingAbility: "arcane",
      baseStats: { area: 0.5 },
      growth: { everyLevels: 2, mods: { area: 0.1 } },
    },
  ],
  powerUps: [],
  synergies: [
    {
      id: "fire-affinity",
      source: {
        kind: "tagCount",
        tag: "damage:fire",
        tiers: [{ count: 1, mods: { might: 0.1 } }],
      },
    },
  ],
};

describe("per-player co-op stats", () => {
  it("applies per-player meta bonuses (per-champion trees) independently", () => {
    const world = createWorld(
      DEFAULT_RULESET,
      {
        playerCount: 2,
        content: COOP_STATS_PACK,
        characterIds: ["mage-a", "mage-b"],
        playerMetaBonuses: [{ might: 0.5 }, { maxHp: 0.2 }],
      },
      3,
    );
    expect(world.playerStat(0, "might", 1)).toBeCloseTo(1.85);
    expect(world.playerStat(1, "might", 1)).toBeCloseTo(1);
    expect(world.playerStat(1, "maxHp", 1)).toBeCloseTo(1.2);
    expect(world.stores.players.field("maxHp")[1]).toBeCloseTo(120);
  });

  it("keeps base stats, growth, and synergies independent per player", () => {
    const world = createWorld(
      DEFAULT_RULESET,
      {
        playerCount: 2,
        content: COOP_STATS_PACK,
        characterIds: ["mage-a", "mage-b"],
      },
      1,
    );

    // Base stats + only player 0's fire tag triggers the fire synergy.
    expect(world.playerStat(0, "might", 1)).toBeCloseTo(1.35);
    expect(world.playerStat(1, "might", 1)).toBeCloseTo(1);
    expect(world.playerStat(1, "area", 1)).toBeCloseTo(1.5);
    expect(world.playerStat(0, "area", 1)).toBeCloseTo(1);

    // Shared level-up applies each character's own growth once.
    world.partyXp = world.partyXpToNext;
    step(world, []);
    expect(world.playerStat(0, "might", 1)).toBeCloseTo(1.45);
    expect(world.playerStat(1, "area", 1)).toBeCloseTo(1.6);

    // Player 0 buys the stat item; player 1 must not inherit it.
    world.stores.players.field("gold")[0] = 100;
    expect(world.buyItem(0, "power-token")).toBe(true);

    expect(world.playerStat(0, "might", 1)).toBeCloseTo(1.65);
    expect(world.playerStat(1, "might", 1)).toBeCloseTo(1);
    expect(world.stores.players.field("maxHp")[0]).toBeCloseTo(125);
    expect(world.stores.players.field("maxHp")[1]).toBeCloseTo(100);

    // Ability scaling uses the owner's stats.
    const flame = world.content.abilities[0];
    expect(world.abilityDamage(flame, 1, 0)).toBeCloseTo(flame.base.damage * 1.65);
    expect(world.abilityDamage(flame, 1, 1)).toBeCloseTo(flame.base.damage * 1);

    const snap = snapshot(world);
    expect(snap.playerStats[0].might).toBeCloseTo(1.65);
    expect(snap.playerStats[1].might).toBeCloseTo(1);
    expect(snap.playerStats[1].area).toBeCloseTo(1.6);
  });
});
