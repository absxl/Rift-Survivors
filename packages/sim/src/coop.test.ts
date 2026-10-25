import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, createWorld, step } from "./index";
import type { ContentPack } from "./index";

const COOP_PACK: ContentPack = {
  id: "coop",
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
  characters: [{ id: "champion", startingWeapon: "blade" }],
  powerUps: [],
  synergies: [],
};

describe("co-op sim", () => {
  it("creates one starting weapon per player", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 2, content: COOP_PACK }, 1);
    const weapons = world.stores.weapons.liveSlots();
    expect(weapons.length).toBe(2);
    const owners = weapons.map((s) => world.stores.weapons.field("owner")[s]).sort();
    expect(owners).toEqual([0, 1]);
  });

  it("runs deterministically with two independent input streams", () => {
    const a = createWorld(DEFAULT_RULESET, { playerCount: 2, content: COOP_PACK }, 1);
    const b = createWorld(DEFAULT_RULESET, { playerCount: 2, content: COOP_PACK }, 1);
    for (let t = 0; t < 600; t++) {
      const inputs = [
        { playerId: 0, moveX: 1, moveY: 0 },
        { playerId: 1, moveX: 0, moveY: 1 },
      ];
      step(a, inputs);
      step(b, inputs);
    }
    expect(a.stores.players.field("x")[0]).toBe(b.stores.players.field("x")[0]);
    expect(a.stores.players.field("y")[1]).toBe(b.stores.players.field("y")[1]);
    // Player 0 moved +x, player 1 moved +y.
    expect(a.stores.players.field("x")[0]).toBeGreaterThan(a.stores.players.field("x")[1]);
    expect(a.stores.players.field("y")[1]).toBeGreaterThan(a.stores.players.field("y")[0]);
  });
});
