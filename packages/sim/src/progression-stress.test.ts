import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, applyChoice, createWorld, step } from "./index";
import type { ContentPack } from "./index";

// Minimal pack with maxLevel-1 items so we can exhaust the level-up pool.
const MINIMAL_PACK: ContentPack = {
  id: "stress",
  schemaVersion: 1,
  enemies: [],
  abilities: [
    {
      id: "w",
      behavior: "sweep",
      params: { arc: 1.2 },
      maxLevel: 1,
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
      levels: [],
      damageType: "physical",
    },
  ],
  passives: [{ id: "p", maxLevel: 1, perLevel: { cooldown: 0.12 } }],
  characters: [{ id: "c", startingAbility: "w" }],
  powerUps: [],
  synergies: [],
};

describe("progression stress", () => {
  it("falls back to a non-empty offer when no options remain", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: MINIMAL_PACK }, 1);

    world.partyXp = world.partyXpToNext;
    step(world, []);
    let offer = world.pendingOffers()[0];
    expect(offer.options.length).toBeGreaterThanOrEqual(1);
    applyChoice(world, 0, 0);

    // Everything is maxed → must still produce a card.
    world.partyXp = world.partyXpToNext;
    step(world, []);
    offer = world.pendingOffers()[0];
    expect(offer.options.length).toBeGreaterThanOrEqual(1);
    applyChoice(world, 0, 0);
    expect(world.pendingOffers().length).toBe(0);
  });

  it("survives many co-op level-ups without throwing or wedging", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 2, content: MINIMAL_PACK }, 2);

    for (let i = 0; i < 300; i++) {
      world.partyXp += 1000;
      step(world, []);
      while (world.pendingOffers().length > 0) {
        const offer = world.pendingOffers()[0];
        expect(offer.options.length).toBeGreaterThanOrEqual(1);
        applyChoice(world, offer.playerId, 0);
      }
    }

    for (let t = 0; t < 600; t++) step(world, []);
    while (world.pendingOffers().length > 0) {
      const offer = world.pendingOffers()[0];
      applyChoice(world, offer.playerId, 0);
    }
    expect(world.pendingOffers().length).toBe(0);
    expect(Number.isFinite(world.playerStat(0, "cooldown", 1))).toBe(true);
    expect(Number.isFinite(world.playerStat(0, "area", 1))).toBe(true);
  });
});
