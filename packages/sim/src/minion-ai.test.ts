import { describe, expect, it } from "vitest";
import type { CharacterDef, ContentPack, EnemyDef } from "./index";
import { DEFAULT_RULESET, createWorld, step } from "./index";
import { spawnEnemyAt } from "./systems/spawn";

const PLAYER: CharacterDef = {
  id: "tester",
  name: "Tester",
  startingAbility: "none",
};

function enemy(
  id: string,
  behavior: string,
  params: Record<string, number | string> = {},
  category: EnemyDef["category"] = "minion",
): EnemyDef {
  return {
    id,
    name: id,
    category,
    hp: 20,
    damage: 1,
    moveSpeed: 0,
    radius: 6,
    xp: 0,
    behavior,
    params,
    tint: 0xffffff,
  };
}

const PACK: ContentPack = {
  id: "ai-test",
  schemaVersion: 1,
  enemies: [
    enemy("chaser", "chase"),
    enemy("healer", "healer", {
      period: 1,
      healRadius: 150,
      healAmount: 5,
      preferredRange: 1000,
    }),
    enemy("shielder", "shielder", {
      period: 1,
      shieldRadius: 150,
      shieldAmount: 7,
      preferredRange: 1000,
    }),
    enemy("summoner", "summoner", { minion: "chaser", period: 1 }),
    enemy(
      "fan",
      "fan",
      {
        period: 1,
        range: 1000,
        preferredRange: 500,
        amount: 3,
        spread: 0.5,
        speed: 1,
        lifetime: 10,
        damage: 0,
      },
      "elite",
    ),
  ],
  abilities: [],
  passives: [],
  characters: [PLAYER],
  powerUps: [],
  synergies: [],
  stages: [],
};

function makeWorld(): ReturnType<typeof createWorld> {
  return createWorld(DEFAULT_RULESET, { playerCount: 1, content: PACK, characterId: "tester" }, 77);
}

function indexOf(world: ReturnType<typeof createWorld>, id: string): number {
  return world.content.enemies.findIndex((candidate) => candidate.id === id);
}

describe("minion support behaviors", () => {
  it("healers mend wounded nearby minions", () => {
    const world = makeWorld();
    const healer = spawnEnemyAt(world, indexOf(world, "healer"), 540, 360);
    const ally = spawnEnemyAt(world, indexOf(world, "chaser"), 560, 360);
    world.stores.enemies.field("hp")[ally] = 5;
    step(world, [{ playerId: 0, moveX: 0, moveY: 0 }]);
    expect(world.stores.enemies.field("hp")[ally]).toBeGreaterThan(5);
    expect(world.stores.enemies.field("hp")[healer]).toBe(20);
  });

  it("shielders grant absorb shields to nearby minions", () => {
    const world = makeWorld();
    spawnEnemyAt(world, indexOf(world, "shielder"), 540, 360);
    const ally = spawnEnemyAt(world, indexOf(world, "chaser"), 560, 360);
    step(world, [{ playerId: 0, moveX: 0, moveY: 0 }]);
    expect(world.stores.enemies.field("shield")[ally]).toBeGreaterThanOrEqual(7);
  });

  it("summoners call minions to the field", () => {
    const world = makeWorld();
    spawnEnemyAt(world, indexOf(world, "summoner"), 540, 360);
    step(world, [{ playerId: 0, moveX: 0, moveY: 0 }]);
    expect(world.stores.enemies.count).toBeGreaterThan(1);
  });

  it("fan casters fire several projectiles in one volley", () => {
    const world = makeWorld();
    spawnEnemyAt(world, indexOf(world, "fan"), 540, 360);
    step(world, [{ playerId: 0, moveX: 0, moveY: 0 }]);
    expect(world.stores.projectiles.count).toBeGreaterThanOrEqual(3);
  });
});
