import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, applyChoice, createWorld, step } from "./index";
import type { ContentPack } from "./index";

const SYNERGY_PACK: ContentPack = {
  id: "syn",
  schemaVersion: 1,
  enemies: [
    {
      id: "chaser",
      category: "minion",
      hp: 10,
      damage: 5,
      moveSpeed: 0.6,
      radius: 6,
      xp: 1,
      behavior: "chase",
      params: {},
    },
  ],
  weapons: [
    {
      id: "fire-a",
      tags: ["damage:fire"],
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
      damageType: "magic",
    },
    {
      id: "fire-b",
      tags: ["damage:fire"],
      behavior: "shoot-nearest",
      params: {},
      maxLevel: 5,
      base: {
        damage: 8,
        cooldown: 45,
        area: 5,
        speed: 5,
        duration: 0,
        amount: 1,
        pierce: 0,
        hitCooldown: 10,
        knockback: 2,
        lifetime: 90,
      },
      levels: [{ delta: { damage: 3 } }],
      damageType: "magic",
    },
  ],
  passives: [],
  characters: [{ id: "mage", tags: ["role:mage"], startingWeapon: "fire-a" }],
  powerUps: [],
  synergies: [
    {
      id: "ignite",
      source: { kind: "tagCount", tag: "damage:fire", tiers: [{ count: 2, mods: { area: 0.1 } }] },
    },
  ],
};

describe("synergy", () => {
  it("activates a tag-count synergy when enough tagged items are owned", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: SYNERGY_PACK }, 1);
    expect(world.stat("area", 1)).toBeCloseTo(1);

    world.stores.players.field("xp")[0] = 100;
    step(world, []); // level up
    const offer = world.pendingOffers()[0];
    const idx = offer.options.findIndex((o) => o.ref.id === "fire-b");
    expect(idx).toBeGreaterThanOrEqual(0);
    applyChoice(world, 0, idx);

    // Two fire weapons now → ignite active → +0.1 area.
    expect(world.stat("area", 1)).toBeCloseTo(1.1);
  });

  it("keeps stats finite over many ticks with the synergy pack", () => {
    for (const seed of [1, 2, 3]) {
      const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: SYNERGY_PACK }, seed);
      world.stores.players.field("xp")[0] = 100;
      for (let t = 0; t < 600 && !world.over; t++)
        step(world, [{ playerId: 0, moveX: 0, moveY: 0 }]);
      expect(Number.isFinite(world.stat("area", 1))).toBe(true);
      expect(Number.isFinite(world.stat("might", 1))).toBe(true);
    }
  });
});
