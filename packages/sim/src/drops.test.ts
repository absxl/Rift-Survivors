import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, createWorld, step } from "./index";
import type { ContentPack, EnemyDef, RulesetDef, World } from "./index";
import { PICKUP_CHEST, PICKUP_GOLD, PICKUP_NUKE, dropPickup } from "./systems/pickups";

function enemy(overrides: Partial<EnemyDef> & Pick<EnemyDef, "id" | "category">): EnemyDef {
  return {
    hp: 5,
    damage: 1,
    moveSpeed: 0.6,
    radius: 6,
    xp: 1,
    behavior: "chase",
    params: {},
    ...overrides,
  };
}

const MINION_PACK: ContentPack = {
  id: "drops-minion",
  schemaVersion: 1,
  enemies: [enemy({ id: "chaser", category: "minion" })],
  weapons: [],
  passives: [],
  characters: [{ id: "champion", startingWeapon: "none" }],
  powerUps: [],
  synergies: [],
};

const ELITE_PACK: ContentPack = {
  ...MINION_PACK,
  id: "drops-elite",
  enemies: [enemy({ id: "brute", category: "elite", hp: 40, chestChance: 0.5 })],
};

const BOSS_PACK: ContentPack = {
  ...MINION_PACK,
  id: "drops-boss",
  enemies: [enemy({ id: "baron", category: "boss", hp: 800, dropsChest: true })],
};

function quietRules(overrides: Record<string, number> = {}): RulesetDef {
  return {
    ...DEFAULT_RULESET,
    rules: {
      ...DEFAULT_RULESET.rules,
      "director.maxEnemies": 0,
      "director.recycleDistance": 1_000_000,
      "director.eliteInterval": 1_000_000,
      "timeline.bossIntervalSec": 1_000_000,
      "timeline.finalThreatSec": 1_000_000,
      "pickup.dropChance": 0,
      "pickup.nukeDropChance": 0,
      ...overrides,
    },
  };
}

function killMany(world: World, kind: number, count: number, x = 5000, y = 5000): void {
  const enemies = world.stores.enemies;
  for (let i = 0; i < count; i++) {
    const slot = enemies.alloc();
    if (slot < 0) break;
    enemies.field("x")[slot] = x + (i % 10);
    enemies.field("y")[slot] = y + Math.floor(i / 10);
    enemies.field("hp")[slot] = 1;
    enemies.field("maxHp")[slot] = 1;
    enemies.field("kind")[slot] = kind;
    world.applyHit(slot, 999, 0, 0, 0, 0, 0);
  }
}

function countDrops(world: World): { gold: number; chests: number; goldValues: number[] } {
  const pickups = world.stores.pickups;
  let gold = 0;
  let chests = 0;
  const goldValues: number[] = [];
  pickups.forEachAlive((slot) => {
    const kind = pickups.field("kind")[slot];
    if (kind === PICKUP_GOLD) {
      gold++;
      goldValues.push(pickups.field("value")[slot]);
    } else if (kind === PICKUP_CHEST) {
      chests++;
    }
  });
  return { gold, chests, goldValues };
}

function minionRun(luck: number, seed: number): { gold: number; chests: number } {
  const world = createWorld(quietRules(), { playerCount: 1, content: MINION_PACK }, seed);
  if (luck > 0) world.playerModifiers[0]?.add("luck", { op: "add", value: luck, source: "test" });
  killMany(world, 0, 1000);
  step(world, []);
  const { gold, chests } = countDrops(world);
  return { gold, chests };
}

describe("loot drops", () => {
  it("luck increases minion gold and chest drops", () => {
    const low = minionRun(0, 11);
    const high = minionRun(1, 11);
    expect(low.gold).toBeGreaterThan(0);
    expect(low.chests).toBeGreaterThan(0);
    expect(high.gold).toBeGreaterThan(low.gold);
    expect(high.chests).toBeGreaterThan(low.chests);
  });

  it("elites always drop gold and their chest chance scales with luck", () => {
    const world = createWorld(quietRules(), { playerCount: 1, content: ELITE_PACK }, 12);
    world.playerModifiers[0]?.add("luck", { op: "add", value: 1, source: "test" });
    killMany(world, 0, 10);
    step(world, []);
    const drops = countDrops(world);
    expect(drops.gold).toBe(10);
    expect(drops.goldValues.every((v) => v === 10)).toBe(true);
    // 0.5 chance * (1 + luck 1) = guaranteed.
    expect(drops.chests).toBe(10);
  });

  it("bosses guarantee a chest and luck-scaled gold", () => {
    const world = createWorld(quietRules(), { playerCount: 1, content: BOSS_PACK }, 13);
    world.playerModifiers[0]?.add("luck", { op: "add", value: 1, source: "test" });
    killMany(world, 0, 1);
    step(world, []);
    const drops = countDrops(world);
    expect(drops.chests).toBe(1);
    expect(drops.gold).toBe(1);
    expect(drops.goldValues[0]).toBe(50);
  });

  it("chest pickups are saved for the shop instead of opening an offer", () => {
    const world = createWorld(quietRules(), { playerCount: 1, content: MINION_PACK }, 14);
    const players = world.stores.players;
    const px = players.field("x")[0];
    const py = players.field("y")[0];
    dropPickup(world, px, py, PICKUP_CHEST);

    const events = step(world, []);
    expect(players.field("chests")[0]).toBe(1);
    expect(world.pendingOffers().length).toBe(0);
    expect(events.some((e) => e.type === "chest-found")).toBe(true);
  });

  it("nuke pickups emit an event and damage the swarm", () => {
    const world = createWorld(quietRules(), { playerCount: 1, content: MINION_PACK }, 15);
    const players = world.stores.players;
    const enemies = world.stores.enemies;
    const px = players.field("x")[0];
    const py = players.field("y")[0];
    const slot = enemies.alloc();
    enemies.field("x")[slot] = px + 30;
    enemies.field("y")[slot] = py;
    enemies.field("hp")[slot] = 100;
    enemies.field("maxHp")[slot] = 100;
    enemies.field("kind")[slot] = 0;
    dropPickup(world, px, py, PICKUP_NUKE);

    const events = step(world, []);
    expect(events.some((e) => e.type === "nuke")).toBe(true);
    expect(enemies.field("hp")[slot]).toBeLessThan(100);
  });
});
