import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, createWorld, step } from "./index";
import type { ContentPack, EnemyDef, RulesetDef } from "./index";
import { NO_ABILITY } from "./systems/enemy-abilities";
import { spawnEnemyAt } from "./systems/spawn";

function enemy(overrides: Partial<EnemyDef> & Pick<EnemyDef, "id" | "category">): EnemyDef {
  return {
    hp: 10,
    damage: 2,
    moveSpeed: 0.5,
    radius: 6,
    xp: 1,
    behavior: "chase",
    params: {},
    ...overrides,
  };
}

const PACK: ContentPack = {
  id: "enemy-ability-test",
  schemaVersion: 1,
  enemies: [
    enemy({ id: "caster", category: "minion", behavior: "ranged" }),
    enemy({ id: "melee", category: "minion" }),
    enemy({ id: "elite", category: "elite" }),
    enemy({ id: "boss", category: "boss" }),
    enemy({ id: "final", category: "final-threat" }),
  ],
  abilities: [],
  passives: [],
  characters: [{ id: "hero", startingAbility: "none" }],
  powerUps: [],
  synergies: [],
};

function quietRules(overrides: Record<string, number> = {}): RulesetDef {
  return {
    ...DEFAULT_RULESET,
    rules: {
      ...DEFAULT_RULESET.rules,
      "director.maxEnemies": 0,
      "director.eliteInterval": 1_000_000,
      "timeline.bossIntervalSec": 1_000_000,
      "timeline.finalThreatSec": 1_000_000,
      "chest.firstSpawnSec": 1_000_000,
      "enemy.rangedAbilityChance": 1,
      ...overrides,
    },
  };
}

function abilityCount(kind: number, seed: number): number {
  const world = createWorld(quietRules(), { playerCount: 1, content: PACK }, seed);
  const slot = spawnEnemyAt(world, kind, 240, 135);
  expect(slot).toBeGreaterThanOrEqual(0);
  let count = 0;
  for (let i = 0; i < 5; i++) {
    if (world.stores.enemies.field(`ability${i}`)[slot] !== NO_ABILITY) count++;
  }
  return count;
}

describe("random enemy abilities", () => {
  it("gives minions one, elites two, bosses four, and final threats five", () => {
    expect(abilityCount(0, 1)).toBe(1);
    expect(abilityCount(1, 2)).toBe(1);
    expect(abilityCount(2, 3)).toBe(2);
    expect(abilityCount(3, 4)).toBe(4);
    expect(abilityCount(4, 5)).toBe(5);
  });

  it("telegraphs and resolves a damaging ground hazard", () => {
    const world = createWorld(quietRules(), { playerCount: 1, content: PACK }, 55);
    const players = world.stores.players;
    const enemies = world.stores.enemies;
    const px = players.field("x")[0];
    const py = players.field("y")[0];
    const slot = spawnEnemyAt(world, 4, px + 200, py);
    for (let i = 0; i < 5; i++) {
      enemies.field(`ability${i}`)[slot] = NO_ABILITY;
      enemies.field(`abilityCd${i}`)[slot] = 0;
    }
    // Force Rune Mine; it creates a delayed circle at the player's position.
    enemies.field("ability0")[slot] = 2;
    const before = players.field("hp")[0];
    for (let i = 0; i < 50; i++) step(world, []);
    expect(players.field("hp")[0]).toBeLessThan(before);
  });

  it("scales enemy speed and damage with elapsed run time", () => {
    const world = createWorld(quietRules(), { playerCount: 1, content: PACK }, 66);
    expect(world.enemySpeedScale()).toBeCloseTo(1.05);
    expect(world.enemyDamageScale()).toBeCloseTo(1);
    world.tick = 30 * 60 * 10;
    expect(world.enemySpeedScale()).toBeCloseTo(1.05 * 1.18);
    expect(world.enemyDamageScale()).toBeCloseTo(1.5);
    expect(world.enemyDamage(10)).toBeCloseTo(15);
  });

  it("assigns deterministic non-duplicate abilities", () => {
    const worldA = createWorld(quietRules(), { playerCount: 1, content: PACK }, 44);
    const worldB = createWorld(quietRules(), { playerCount: 1, content: PACK }, 44);
    const a = spawnEnemyAt(worldA, 4, 240, 135);
    const b = spawnEnemyAt(worldB, 4, 240, 135);
    const idsA: number[] = [];
    const idsB: number[] = [];
    for (let i = 0; i < 5; i++) {
      idsA.push(worldA.stores.enemies.field(`ability${i}`)[a]);
      idsB.push(worldB.stores.enemies.field(`ability${i}`)[b]);
    }
    expect(idsA).toEqual(idsB);
    expect(new Set(idsA).size).toBe(5);
  });
});
