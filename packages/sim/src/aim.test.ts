import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, createWorld, step } from "./index";
import type { ContentPack, EnemyDef, WeaponDef } from "./index";

const SWEEP: WeaponDef = {
  id: "test-sweep",
  behavior: "sweep",
  params: { arc: 2.4 },
  maxLevel: 1,
  base: {
    damage: 25,
    cooldown: 1,
    area: 100,
    speed: 1,
    duration: 0,
    amount: 1,
    pierce: 0,
    hitCooldown: 0,
    knockback: 0,
    lifetime: 1,
  },
  levels: [],
};

const ENEMY: EnemyDef = {
  id: "target",
  category: "minion",
  hp: 100,
  damage: 0,
  moveSpeed: 0,
  radius: 6,
  xp: 1,
  behavior: "chase",
  params: {},
};

const PACK: ContentPack = {
  id: "aim-test",
  schemaVersion: 1,
  enemies: [ENEMY],
  weapons: [SWEEP],
  passives: [],
  characters: [{ id: "hero", startingWeapon: SWEEP.id }],
  powerUps: [],
  synergies: [],
};

function quietRules(): typeof DEFAULT_RULESET {
  return {
    ...DEFAULT_RULESET,
    pipeline: DEFAULT_RULESET.pipeline,
    rules: {
      ...DEFAULT_RULESET.rules,
      "director.maxEnemies": 0,
      "director.eliteInterval": 1_000_000,
      "timeline.bossIntervalSec": 1_000_000,
      "timeline.finalThreatSec": 1_000_000,
      "chest.firstSpawnSec": 1_000_000,
    },
  };
}

describe("consistent auto-aim", () => {
  it("sweeps toward an enemy behind the movement facing direction", () => {
    const world = createWorld(quietRules(), { playerCount: 1, content: PACK }, 7);
    const players = world.stores.players;
    const enemies = world.stores.enemies;
    const slot = enemies.alloc();
    enemies.field("x")[slot] = players.field("x")[0] - 40;
    enemies.field("y")[slot] = players.field("y")[0];
    enemies.field("hp")[slot] = 100;
    enemies.field("maxHp")[slot] = 100;
    enemies.field("kind")[slot] = 0;
    // Facing right would make the old sweep miss the enemy on the left.
    players.field("facingX")[0] = 1;
    players.field("facingY")[0] = 0;

    step(world, []);
    expect(enemies.field("hp")[slot]).toBeLessThan(100);
  });

  it("breaks a bush in the auto-aimed sweep cone", () => {
    const world = createWorld(quietRules(), { playerCount: 1, content: PACK }, 8);
    const players = world.stores.players;
    const bushes = world.stores.bushes;
    const slot = bushes.alloc();
    bushes.field("x")[slot] = players.field("x")[0] - 35;
    bushes.field("y")[slot] = players.field("y")[0];
    bushes.field("hp")[slot] = 1;
    bushes.field("tx")[slot] = 1;
    bushes.field("ty")[slot] = 1;
    players.field("facingX")[0] = -1;
    players.field("facingY")[0] = 0;

    step(world, []);
    expect(bushes.isAlive(slot)).toBe(false);
    expect(world.brokenBushes.has("1,1")).toBe(true);
  });
});
