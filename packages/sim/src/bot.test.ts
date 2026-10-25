import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, createWorld, step } from "./index";
import type { ContentPack, RulesetDef } from "./index";

const BOT_PACK: ContentPack = {
  id: "bot",
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
    {
      id: "brute",
      category: "elite",
      hp: 40,
      damage: 10,
      moveSpeed: 0.4,
      radius: 10,
      xp: 5,
      behavior: "chase",
      params: {},
      dropsChest: true,
    },
    {
      id: "herald",
      category: "boss",
      hp: 200,
      damage: 15,
      moveSpeed: 0.35,
      radius: 14,
      xp: 50,
      behavior: "chase",
      params: {},
      dropsChest: true,
    },
    {
      id: "void-threat",
      category: "final-threat",
      hp: 1500,
      damage: 30,
      moveSpeed: 0.5,
      radius: 20,
      xp: 500,
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
      levels: [
        { delta: { damage: 4 } },
        { delta: { damage: 4 } },
        { delta: { damage: 6 } },
        { delta: { damage: 8 } },
      ],
      damageType: "physical",
    },
  ],
  passives: [],
  characters: [{ id: "champion", startingWeapon: "blade" }],
  powerUps: [],
  synergies: [],
};

const BOT_RULESET: RulesetDef = {
  ...DEFAULT_RULESET,
  rules: {
    ...DEFAULT_RULESET.rules,
    "timeline.bossIntervalSec": 10,
    "timeline.finalThreatSec": 60,
    "timeline.bossRushIntervalSec": 5,
  },
};

describe("bot", () => {
  it("runs a full short timeline without crashing and stays in budget", () => {
    const world = createWorld(BOT_RULESET, { playerCount: 1, content: BOT_PACK }, 123);
    for (let t = 0; t < 90 * 30; t++) {
      step(world, [{ playerId: 0, moveX: 0.5, moveY: 0.3 }]);
      if (world.over) break;
      expect(world.stores.enemies.liveSlots().length).toBeLessThanOrEqual(1500);
    }
    expect(world.finalThreatSpawned).toBe(true);
  });

  it("is deterministic over a full run", () => {
    const a = createWorld(BOT_RULESET, { playerCount: 1, content: BOT_PACK }, 7);
    const b = createWorld(BOT_RULESET, { playerCount: 1, content: BOT_PACK }, 7);
    for (let t = 0; t < 60 * 30; t++) {
      const input = [{ playerId: 0, moveX: 0.5, moveY: 0.3 }];
      step(a, input);
      step(b, input);
    }
    expect(a.stores.players.field("kills")[0]).toBe(b.stores.players.field("kills")[0]);
    expect(a.stores.enemies.liveSlots().length).toBe(b.stores.enemies.liveSlots().length);
  });
});
