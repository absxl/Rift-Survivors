import { describe, expect, it } from "vitest";
import { type ContentPack, DEFAULT_RULESET, type RulesetDef, createWorld, step } from "./index";

const PACK: ContentPack = {
  id: "separation",
  schemaVersion: 1,
  enemies: [
    {
      id: "minion",
      category: "minion",
      hp: 100,
      damage: 0,
      moveSpeed: 0,
      radius: 6,
      xp: 0,
      behavior: "chase",
      params: {},
    },
    {
      id: "boss",
      category: "boss",
      hp: 1000,
      damage: 0,
      moveSpeed: 0,
      radius: 20,
      xp: 0,
      behavior: "chase",
      params: {},
    },
  ],
  weapons: [],
  passives: [],
  characters: [],
  powerUps: [],
  synergies: [],
};

const RULES: RulesetDef = {
  ...DEFAULT_RULESET,
  rules: { ...DEFAULT_RULESET.rules, "director.maxEnemies": 0 },
};

function addEnemy(
  world: ReturnType<typeof createWorld>,
  kind: number,
  x: number,
  y: number,
): number {
  const enemies = world.stores.enemies;
  const slot = enemies.alloc();
  enemies.field("kind")[slot] = kind;
  enemies.field("x")[slot] = x;
  enemies.field("y")[slot] = y;
  enemies.field("hp")[slot] = 1000;
  enemies.field("maxHp")[slot] = 1000;
  return slot;
}

describe("enemy body separation", () => {
  it("pushes overlapping minions apart until they no longer share a body", () => {
    const world = createWorld(RULES, { playerCount: 1, content: PACK }, 1);
    const a = addEnemy(world, 0, 200, 200);
    const b = addEnemy(world, 0, 200, 200);
    for (let i = 0; i < 40; i++) step(world, []);
    const enemies = world.stores.enemies;
    const distance = Math.hypot(
      enemies.field("x")[a] - enemies.field("x")[b],
      enemies.field("y")[a] - enemies.field("y")[b],
    );
    expect(distance).toBeGreaterThan(11.5);
  });

  it("moves a minion much farther than a boss (radius-squared mass)", () => {
    const world = createWorld(RULES, { playerCount: 1, content: PACK }, 1);
    const minion = addEnemy(world, 0, 200, 200);
    const boss = addEnemy(world, 1, 200, 200);
    step(world, []);
    const enemies = world.stores.enemies;
    const minionMoved = Math.hypot(
      enemies.field("x")[minion] - 200,
      enemies.field("y")[minion] - 200,
    );
    const bossMoved = Math.hypot(enemies.field("x")[boss] - 200, enemies.field("y")[boss] - 200);
    expect(minionMoved).toBeGreaterThan(bossMoved * 5);
    expect(bossMoved).toBeGreaterThan(0);
  });

  it("is deterministic for identical placements", () => {
    const run = (): Array<[number, number]> => {
      const world = createWorld(RULES, { playerCount: 1, content: PACK }, 7);
      addEnemy(world, 0, 150, 150);
      addEnemy(world, 0, 150, 150);
      addEnemy(world, 1, 150, 150);
      for (let i = 0; i < 12; i++) step(world, []);
      const enemies = world.stores.enemies;
      return enemies
        .liveSlots()
        .map((slot) => [enemies.field("x")[slot], enemies.field("y")[slot]]);
    };
    expect(run()).toEqual(run());
  });
});
