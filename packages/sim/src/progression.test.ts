import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, applyChoice, createWorld, step } from "./index";
import type { ContentPack } from "./index";

// 2 weapons + 1 passive + 1 character → exactly 3 level-up options (deterministic).
const PROG_PACK: ContentPack = {
  id: "prog",
  schemaVersion: 1,
  enemies: [],
  weapons: [
    {
      id: "blade",
      behavior: "sweep",
      params: { arc: 1.2 },
      maxLevel: 8,
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
    {
      id: "bolt",
      behavior: "shoot-nearest",
      params: {},
      maxLevel: 8,
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
  passives: [{ id: "might", maxLevel: 5, perLevel: { might: 0.2 } }],
  characters: [{ id: "champion", startingWeapon: "blade" }],
  powerUps: [],
  synergies: [],
};

describe("progression", () => {
  it("levels up on XP threshold and offers exactly 3 cards", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: PROG_PACK }, 1);
    world.stores.players.field("xp")[0] = 100;
    step(world, []);
    expect(world.stores.players.field("level")[0]).toBe(2);
    expect(world.pendingOffers().length).toBe(1);
    expect(world.pendingOffers()[0].options.length).toBe(3);
  });

  it("applying a passive adds it and applies its modifier via the stack", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: PROG_PACK }, 1);
    world.stores.players.field("xp")[0] = 100;
    step(world, []);
    const offer = world.pendingOffers()[0];
    const idx = offer.options.findIndex((o) => o.ref.id === "might");
    expect(idx).toBeGreaterThanOrEqual(0);

    applyChoice(world, 0, idx);
    expect(world.pendingOffers().length).toBe(0);
    expect(world.stores.passives.liveSlots().length).toBe(1);
    expect(world.stat("might", 1)).toBeCloseTo(1.2);
  });

  it("upgrading a weapon raises its level", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: PROG_PACK }, 1);
    world.stores.players.field("xp")[0] = 100;
    step(world, []);
    const offer = world.pendingOffers()[0];
    const idx = offer.options.findIndex((o) => o.ref.type === "weapon" && o.level !== undefined);
    expect(idx).toBeGreaterThanOrEqual(0);

    applyChoice(world, 0, idx);
    expect(world.stores.weapons.field("level")[0]).toBe(2);
  });
});
