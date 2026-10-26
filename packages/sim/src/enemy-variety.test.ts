import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, createWorld, step } from "./index";
import type { ContentPack, EnemyDef, RulesetDef } from "./index";

function enemy(overrides: Partial<EnemyDef> & Pick<EnemyDef, "id" | "behavior">): EnemyDef {
  return {
    category: "minion",
    hp: 20,
    damage: 5,
    moveSpeed: 0.5,
    radius: 6,
    xp: 1,
    params: {},
    ...overrides,
  };
}

const VARIETY_PACK: ContentPack = {
  id: "variety",
  schemaVersion: 1,
  enemies: [
    enemy({
      id: "hexer",
      behavior: "ranged",
      params: { period: 1, range: 400, preferredRange: 100, speed: 3, lifetime: 120, damage: 7 },
    }),
    enemy({ id: "bloater", behavior: "chase", params: { explodeRadius: 60, explodeDamage: 20 } }),
    enemy({
      id: "sparker",
      behavior: "charge",
      params: { period: 10, dashTicks: 5, dashSpeed: 2 },
      moveSpeed: 0.2,
    }),
    enemy({ id: "weaver", behavior: "weaver", params: { amplitude: 0.8, frequency: 0.07 } }),
  ],
  weapons: [],
  passives: [],
  characters: [{ id: "champion", startingWeapon: "none" }],
  powerUps: [],
  synergies: [],
};

function quietRules(overrides: Record<string, number> = {}): RulesetDef {
  return {
    ...DEFAULT_RULESET,
    rules: {
      ...DEFAULT_RULESET.rules,
      "director.spawnInterval": 100000,
      "director.eliteInterval": 100000,
      "director.maxEnemies": 0,
      "timeline.bossIntervalSec": 100000,
      "timeline.finalThreatSec": 100000,
      ...overrides,
    },
  };
}

function spawn(world: ReturnType<typeof createWorld>, kind: number, x: number, y: number): number {
  const enemies = world.stores.enemies;
  const slot = enemies.alloc();
  enemies.field("x")[slot] = x;
  enemies.field("y")[slot] = y;
  enemies.field("hp")[slot] = 500;
  enemies.field("maxHp")[slot] = 500;
  enemies.field("kind")[slot] = kind;
  return slot;
}

describe("enemy behaviors", () => {
  it("ranged enemies fire a hostile projectile that damages the player", () => {
    const world = createWorld(quietRules(), { playerCount: 1, content: VARIETY_PACK }, 1);
    const players = world.stores.players;
    const px = players.field("x")[0];
    const py = players.field("y")[0];
    spawn(world, 0, px - 100, py);

    let sawProjectile = false;
    let sawExplosion = false;
    for (let t = 0; t < 80; t++) {
      const events = step(world, []);
      if (world.stores.projectiles.liveSlots().length > 0) sawProjectile = true;
      if (events.some((e) => e.type === "explosion")) sawExplosion = true;
    }
    expect(sawProjectile).toBe(true);
    expect(sawExplosion).toBe(false);
    expect(players.field("hp")[0]).toBeLessThan(100);
  });

  it("exploders damage players in radius when they die", () => {
    const world = createWorld(quietRules(), { playerCount: 1, content: VARIETY_PACK }, 2);
    const players = world.stores.players;
    const px = players.field("x")[0];
    const py = players.field("y")[0];
    const slot = spawn(world, 1, px + 30, py);

    world.applyHit(slot, 9999, 0, 0, 0, 0, 0);
    const events = step(world, []);
    expect(events.some((e) => e.type === "explosion")).toBe(true);
    expect(players.field("hp")[0]).toBeLessThan(100);
  });

  it("chargers dash periodically instead of only drifting", () => {
    const world = createWorld(quietRules(), { playerCount: 1, content: VARIETY_PACK }, 3);
    const players = world.stores.players;
    const px = players.field("x")[0];
    const py = players.field("y")[0];
    const slot = spawn(world, 2, px - 100, py);

    for (let t = 0; t < 10; t++) step(world, []);
    const moved = Math.abs(world.stores.enemies.field("x")[slot] - (px - 100));
    expect(moved).toBeGreaterThan(5);
  });

  it("weavers are deterministic and move toward the player", () => {
    const a = createWorld(quietRules(), { playerCount: 1, content: VARIETY_PACK }, 4);
    const b = createWorld(quietRules(), { playerCount: 1, content: VARIETY_PACK }, 4);
    const ax = a.stores.players.field("x")[0];
    const ay = a.stores.players.field("y")[0];
    const sa = spawn(a, 3, ax - 120, ay);
    const sb = spawn(b, 3, ax - 120, ay);
    for (let t = 0; t < 40; t++) {
      step(a, []);
      step(b, []);
    }
    expect(a.stores.enemies.field("x")[sa]).toBe(b.stores.enemies.field("x")[sb]);
    expect(a.stores.enemies.field("y")[sa]).toBe(b.stores.enemies.field("y")[sb]);
    expect(a.stores.enemies.field("x")[sa]).toBeGreaterThan(ax - 120);
  });

  it("spawns later-minute minion types alongside early ones", () => {
    const pack: ContentPack = {
      ...VARIETY_PACK,
      enemies: [
        enemy({ id: "early", behavior: "chase", spawnWeight: 1 }),
        enemy({ id: "mid", behavior: "chase", spawnWeight: 1, minMinute: 1 }),
        enemy({ id: "late", behavior: "chase", spawnWeight: 1, minMinute: 2 }),
      ],
    };
    const rules: RulesetDef = {
      ...DEFAULT_RULESET,
      rules: {
        ...DEFAULT_RULESET.rules,
        "director.spawnInterval": 30,
        "director.batchSize": 1,
        "director.maxEnemies": 2000,
        "director.eliteInterval": 100000,
        "timeline.bossIntervalSec": 100000,
        "timeline.finalThreatSec": 100000,
      },
    };
    const world = createWorld(rules, { playerCount: 1, content: pack }, 5);
    const players = world.stores.players;
    for (let t = 0; t < 3700; t++) {
      players.field("iFrames")[0] = 2; // test invulnerability
      step(world, []);
    }
    const kinds = new Set<number>();
    const enemies = world.stores.enemies;
    enemies.forEachAlive((slot) => kinds.add(enemies.field("kind")[slot]));
    expect(kinds.has(0)).toBe(true);
    expect(kinds.has(1)).toBe(true);
    expect(kinds.has(2)).toBe(true);
  });
});
