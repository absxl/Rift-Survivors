import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, createWorld, snapshot, step } from "./index";
import type { ContentPack } from "./index";
import type { PlayerInput } from "./types";

// Inline pack (the sim can't import @rift/content); mirrors the core pack.
const TEST_PACK: ContentPack = {
  id: "test",
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
  abilities: [
    {
      id: "blade",
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
  passives: [],
  characters: [{ id: "champion", startingAbility: "blade" }],
  powerUps: [],
  synergies: [],
};

function run(
  seed: number,
  ticks: number,
): { maxEnemies: number; deaths: number; fires: number; pickups: number } {
  const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: TEST_PACK }, seed);
  let maxEnemies = 0;
  let deaths = 0;
  let fires = 0;
  let pickups = 0;
  for (let t = 0; t < ticks; t++) {
    const input: PlayerInput = { playerId: 0, moveX: 0, moveY: 0 };
    const events = step(world, [input]);
    for (const e of events) {
      if (e.type === "enemy-died") deaths++;
      else if (e.type === "ability-fire") fires++;
      else if (e.type === "gem-pickup") pickups++;
    }
    maxEnemies = Math.max(maxEnemies, world.stores.enemies.liveSlots().length);
  }
  return { maxEnemies, deaths, fires, pickups };
}

describe("gameplay integration", () => {
  it("spawns enemies, fires abilities, kills enemies, and collects gems", () => {
    const r = run(42, 3000);
    expect(r.maxEnemies).toBeGreaterThan(0);
    expect(r.fires).toBeGreaterThan(0);
    expect(r.deaths).toBeGreaterThan(0);
    expect(r.pickups).toBeGreaterThan(0);
  });

  it("is deterministic with content + inputs", () => {
    const worldA = createWorld(DEFAULT_RULESET, { playerCount: 1, content: TEST_PACK }, 7);
    const worldB = createWorld(DEFAULT_RULESET, { playerCount: 1, content: TEST_PACK }, 7);
    for (let t = 0; t < 2000; t++) {
      const input: PlayerInput = { playerId: 0, moveX: 1, moveY: 0 };
      step(worldA, [input]);
      step(worldB, [input]);
    }
    expect(snapshot(worldA)).toEqual(snapshot(worldB));
  });

  it("player death sets world.over", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: TEST_PACK }, 5);
    // Stand still so enemies pile on and kill the player.
    for (let t = 0; t < 5000 && !world.over; t++) {
      step(world, []);
    }
    expect(world.over).toBe(true);
  });

  it("burn status damages an enemy over time", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: TEST_PACK }, 3);
    const slot = world.stores.enemies.alloc();
    world.stores.enemies.field("x")[slot] = 200;
    world.stores.enemies.field("y")[slot] = 200;
    world.stores.enemies.field("hp")[slot] = 1000;
    world.stores.enemies.field("maxHp")[slot] = 1000;
    world.stores.enemies.field("kind")[slot] = 0;
    world.applyStatus(slot, { id: "burn", ticks: 30 });

    const before = world.stores.enemies.field("hp")[slot];
    for (let t = 0; t < 30; t++) step(world, []);
    expect(world.stores.enemies.field("hp")[slot]).toBeLessThan(before);
  });
});
