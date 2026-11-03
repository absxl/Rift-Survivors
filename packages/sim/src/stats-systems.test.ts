import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, createWorld, step } from "./index";
import type { ContentPack } from "./index";
import { damagePlayer } from "./systems/combat";
import { PICKUP_GOLD } from "./systems/pickups";

const EMPTY_PACK: ContentPack = {
  id: "stats-empty",
  schemaVersion: 1,
  enemies: [],
  abilities: [],
  passives: [],
  characters: [{ id: "champion", startingAbility: "none" }],
  powerUps: [],
  synergies: [],
};

function projectilePack(behavior: "shoot-nearest" | "ground-pool", duration = 0): ContentPack {
  return {
    ...EMPTY_PACK,
    id: `stats-${behavior}`,
    abilities: [
      {
        id: "test-ability",
        behavior,
        params: {},
        maxLevel: 5,
        base: {
          damage: 10,
          cooldown: 60,
          area: 44,
          speed: 5,
          duration,
          amount: 1,
          pierce: 0,
          hitCooldown: 12,
          knockback: 1,
          lifetime: 100,
        },
        levels: [],
        damageType: "physical",
      },
    ],
    characters: [{ id: "champion", startingAbility: "test-ability" }],
  };
}

function makeWorld(content: ContentPack) {
  return createWorld(DEFAULT_RULESET, { playerCount: 1, content }, 1);
}

describe("stat systems", () => {
  it("growth multiplies gem XP", () => {
    const world = makeWorld(EMPTY_PACK);
    world.playerModifiers[0]?.add("growth", { op: "add", value: 0.5, source: "test" });
    const gems = world.stores.gems;
    const slot = gems.alloc();
    gems.field("x")[slot] = world.stores.players.field("x")[0];
    gems.field("y")[slot] = world.stores.players.field("y")[0];
    gems.field("value")[slot] = 2;
    step(world, []);
    expect(world.partyXp).toBeCloseTo(3);
  });

  it("regen heals per second up to max", () => {
    const world = makeWorld(EMPTY_PACK);
    world.stores.players.field("hp")[0] = 50;
    world.playerModifiers[0]?.add("regen", { op: "add", value: 3, source: "test" });
    for (let i = 0; i < 30; i++) step(world, []);
    expect(world.stores.players.field("hp")[0]).toBeCloseTo(53, 1);
  });

  it("resist then armor reduce player damage", () => {
    const world = makeWorld(EMPTY_PACK);
    world.playerModifiers[0]?.add("resist", { op: "add", value: 0.5, source: "test" });
    world.playerModifiers[0]?.add("armor", { op: "add", value: 2, source: "test" });
    damagePlayer(world, 0, 20, 0, 0, "test");
    expect(world.stores.players.field("hp")[0]).toBeCloseTo(92);
  });

  it("greed multiplies gold pickups", () => {
    const world = makeWorld(EMPTY_PACK);
    world.playerModifiers[0]?.add("greed", { op: "add", value: 1, source: "test" });
    const pickups = world.stores.pickups;
    const slot = pickups.alloc();
    pickups.field("x")[slot] = world.stores.players.field("x")[0];
    pickups.field("y")[slot] = world.stores.players.field("y")[0];
    pickups.field("kind")[slot] = PICKUP_GOLD;
    pickups.field("value")[slot] = 5;
    step(world, []);
    expect(world.stores.players.field("gold")[0]).toBe(10);
  });

  it("max HP sync heals the gained amount", () => {
    const world = makeWorld(EMPTY_PACK);
    world.playerModifiers[0]?.add("maxHp", { op: "add", value: 0.5, source: "test" });
    world.syncPlayerMaxHp(0);
    expect(world.stores.players.field("maxHp")[0]).toBeCloseTo(150);
    expect(world.stores.players.field("hp")[0]).toBeCloseTo(150);
  });

  it("projectile speed and pierce scale projectiles", () => {
    const world = makeWorld(projectilePack("shoot-nearest"));
    world.playerModifiers[0]?.add("projectileSpeed", { op: "add", value: 0.5, source: "test" });
    world.playerModifiers[0]?.add("pierce", { op: "add", value: 2, source: "test" });
    step(world, []);
    const projectiles = world.stores.projectiles;
    const slot = projectiles.liveSlots()[0];
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(Math.hypot(projectiles.field("vx")[slot], projectiles.field("vy")[slot])).toBeCloseTo(
      7.5,
    );
    expect(projectiles.field("pierce")[slot]).toBe(2);
  });

  it("duration extends ground pools", () => {
    const world = makeWorld(projectilePack("ground-pool", 100));
    world.playerModifiers[0]?.add("duration", { op: "add", value: 0.5, source: "test" });
    step(world, []);
    const zones = world.stores.zones;
    const slot = zones.liveSlots()[0];
    expect(slot).toBeGreaterThanOrEqual(0);
    // The zones system decrements once in the same tick.
    expect(zones.field("lifetime")[slot]).toBe(149);
  });

  it("knockback scales hit impulse", () => {
    const world = makeWorld(EMPTY_PACK);
    world.playerModifiers[0]?.add("knockback", { op: "add", value: 0.5, source: "test" });
    const enemies = world.stores.enemies;
    const slot = enemies.alloc();
    enemies.field("hp")[slot] = 10;
    enemies.field("maxHp")[slot] = 10;
    world.applyHit(slot, 1, 1, 0, 4, 1, 0);
    expect(enemies.field("vx")[slot]).toBeCloseTo(6);
  });

  it("lifesteal heals the owner, capped per hit", () => {
    const world = makeWorld(EMPTY_PACK);
    const players = world.stores.players;
    players.field("hp")[0] = 50;
    world.playerModifiers[0]?.add("lifesteal", { op: "add", value: 0.5, source: "test" });
    const enemies = world.stores.enemies;
    const slot = enemies.alloc();
    enemies.field("hp")[slot] = 500;
    enemies.field("maxHp")[slot] = 500;
    world.applyHit(slot, 100, 1, 0, 0, 1, 0);
    expect(players.field("hp")[0]).toBeCloseTo(52);
  });
});
