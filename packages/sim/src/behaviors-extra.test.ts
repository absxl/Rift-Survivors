import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, createWorld, step } from "./index";
import type { AbilityDef, ContentPack, EnemyDef, RulesetDef } from "./index";
import { spawnEnemyAt } from "./systems/spawn";

function enemy(): EnemyDef {
  return {
    id: "dummy",
    name: "Dummy",
    category: "minion",
    hp: 500,
    damage: 2,
    moveSpeed: 0,
    radius: 6,
    xp: 1,
    behavior: "chase",
    params: {},
  };
}

function ability(overrides: Partial<AbilityDef> & Pick<AbilityDef, "id" | "behavior">): AbilityDef {
  return {
    params: {},
    maxLevel: 5,
    base: {
      damage: 10,
      cooldown: 1,
      area: 100,
      speed: 4,
      duration: 30,
      amount: 1,
      pierce: 0,
      hitCooldown: 10,
      knockback: 0,
      lifetime: 40,
    },
    levels: [],
    damageType: "magic",
    ...overrides,
  };
}

const PACK: ContentPack = {
  id: "behaviors-extra-test",
  schemaVersion: 1,
  enemies: [enemy()],
  abilities: [
    ability({
      id: "cone",
      behavior: "cone-burst",
      base: {
        damage: 10,
        cooldown: 1,
        area: 100,
        speed: 4,
        duration: 0,
        amount: 3,
        pierce: 0,
        hitCooldown: 10,
        knockback: 0,
        lifetime: 40,
      },
      params: { spread: 1 },
    }),
    ability({
      id: "ring",
      behavior: "nova",
      base: {
        damage: 10,
        cooldown: 1,
        area: 100,
        speed: 4,
        duration: 0,
        amount: 1,
        pierce: 0,
        hitCooldown: 10,
        knockback: 0,
        lifetime: 40,
      },
    }),
    ability({
      id: "arc",
      behavior: "chain",
      base: {
        damage: 10,
        cooldown: 1,
        area: 120,
        speed: 0,
        duration: 0,
        amount: 2,
        pierce: 0,
        hitCooldown: 10,
        knockback: 0,
        lifetime: 0,
      },
      params: { jumpRange: 100, falloff: 0.5 },
    }),
    ability({
      id: "ray",
      behavior: "beam",
      base: {
        damage: 10,
        cooldown: 1,
        area: 140,
        speed: 0,
        duration: 30,
        amount: 1,
        pierce: 0,
        hitCooldown: 10,
        knockback: 0,
        lifetime: 0,
      },
    }),
    ability({
      id: "grab",
      behavior: "hook-pull",
      base: {
        damage: 10,
        cooldown: 1,
        area: 100,
        speed: 6,
        duration: 0,
        amount: 1,
        pierce: 0,
        hitCooldown: 10,
        knockback: 0,
        lifetime: 60,
      },
      params: { pull: 90 },
    }),
    ability({
      id: "seek",
      behavior: "homing-orb",
      base: {
        damage: 10,
        cooldown: 1,
        area: 100,
        speed: 3,
        duration: 0,
        amount: 1,
        pierce: 0,
        hitCooldown: 10,
        knockback: 0,
        lifetime: 90,
      },
      params: { turn: 0.3, seekRange: 260 },
    }),
    ability({
      id: "blink",
      behavior: "dash-strike",
      base: {
        damage: 10,
        cooldown: 1,
        area: 80,
        speed: 0,
        duration: 0,
        amount: 1,
        pierce: 0,
        hitCooldown: 10,
        knockback: 0,
        lifetime: 0,
      },
      params: { range: 240 },
    }),
    ability({
      id: "toss",
      behavior: "fling-knockup",
      base: {
        damage: 10,
        cooldown: 1,
        area: 90,
        speed: 0,
        duration: 0,
        amount: 1,
        pierce: 0,
        hitCooldown: 10,
        knockback: 2,
        lifetime: 0,
      },
      params: { knockMultiplier: 3, stunTicks: 20 },
    }),
    ability({
      id: "ward",
      behavior: "shield-pulse",
      base: {
        damage: 50,
        cooldown: 300,
        area: 0,
        speed: 0,
        duration: 0,
        amount: 1,
        pierce: 0,
        hitCooldown: 0,
        knockback: 0,
        lifetime: 0,
      },
    }),
    ability({
      id: "pod",
      behavior: "turret",
      base: {
        damage: 10,
        cooldown: 1,
        area: 200,
        speed: 0,
        duration: 120,
        amount: 1,
        pierce: 0,
        hitCooldown: 0,
        knockback: 0,
        lifetime: 0,
      },
      params: { range: 220 },
    }),
  ],
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
      ...overrides,
    },
  };
}

function makeWorld(rules: RulesetDef = quietRules()) {
  return createWorld(rules, { playerCount: 1, content: PACK }, 7);
}

function giveAbility(world: ReturnType<typeof makeWorld>, defIndex: number): number {
  const slot = world.stores.abilities.alloc();
  world.stores.abilities.field("owner")[slot] = 0;
  world.stores.abilities.field("defIndex")[slot] = defIndex;
  world.stores.abilities.field("cooldown")[slot] = 0;
  world.stores.abilities.field("level")[slot] = 1;
  return slot;
}

function dummyAt(world: ReturnType<typeof makeWorld>, x: number, y: number): number {
  return spawnEnemyAt(world, 0, x, y);
}

function aliveProjectiles(world: ReturnType<typeof makeWorld>): number {
  let count = 0;
  world.stores.projectiles.forEachAlive(() => {
    count++;
  });
  return count;
}

describe("extended ability archetypes", () => {
  it("cone-burst fires the full spread at once", () => {
    const world = makeWorld();
    giveAbility(world, 0);
    step(world, []);
    expect(aliveProjectiles(world)).toBe(3);
  });

  it("nova fires a full ring", () => {
    const world = makeWorld();
    giveAbility(world, 1);
    step(world, []);
    expect(aliveProjectiles(world)).toBe(4);
  });

  it("chain jumps to a second enemy with falloff", () => {
    const world = makeWorld();
    giveAbility(world, 2);
    const players = world.stores.players;
    const a = dummyAt(world, players.field("x")[0] + 80, players.field("y")[0]);
    const b = dummyAt(world, players.field("x")[0] + 150, players.field("y")[0]);
    step(world, []);
    const enemies = world.stores.enemies;
    expect(enemies.field("hp")[a]).toBeLessThan(500);
    expect(enemies.field("hp")[b]).toBeLessThan(500);
    // Falloff: the jump target takes half damage.
    expect(enemies.field("hp")[a]).toBe(490);
    expect(enemies.field("hp")[b]).toBe(495);
  });

  it("beam damages along its line every hitCooldown window", () => {
    const world = makeWorld();
    giveAbility(world, 3);
    const players = world.stores.players;
    const slot = dummyAt(world, players.field("x")[0] + 100, players.field("y")[0]);
    for (let i = 0; i < 6; i++) step(world, []);
    const enemies = world.stores.enemies;
    expect(enemies.field("hp")[slot]).toBeLessThan(500);
  });

  it("hook-pull drags the victim toward the caster", () => {
    const world = makeWorld();
    giveAbility(world, 4);
    const players = world.stores.players;
    const px = players.field("x")[0];
    const slot = dummyAt(world, px + 160, players.field("y")[0]);
    for (let i = 0; i < 45; i++) step(world, []);
    const ex = world.stores.enemies.field("x")[slot];
    expect(px + 160 - ex).toBeGreaterThan(30);
  });

  it("homing-orb steers toward enemies spawned off its initial line", () => {
    const world = makeWorld();
    giveAbility(world, 5);
    step(world, []); // fires with no enemies: flies straight right
    const enemies = world.stores.enemies;
    const slot = dummyAt(
      world,
      world.stores.players.field("x")[0] + 90,
      world.stores.players.field("y")[0] - 90,
    );
    const initialHp = enemies.field("hp")[slot];
    let steered = false;
    for (let i = 0; i < 45; i++) {
      step(world, []);
      world.stores.projectiles.forEachAlive((p) => {
        if (world.stores.projectiles.field("vy")[p] !== 0) steered = true;
      });
    }
    expect(steered).toBe(true);
    expect(enemies.field("hp")[slot]).toBeLessThan(initialHp);
  });

  it("dash-strike moves the player onto the target and bursts", () => {
    const world = makeWorld();
    giveAbility(world, 6);
    const players = world.stores.players;
    const startX = players.field("x")[0];
    const slot = dummyAt(world, startX + 150, players.field("y")[0]);
    step(world, []);
    expect(players.field("x")[0]).toBeGreaterThan(startX + 80);
    expect(world.stores.enemies.field("hp")[slot]).toBeLessThan(500);
  });

  it("fling-knockup displaces and briefly stuns", () => {
    const world = makeWorld();
    giveAbility(world, 7);
    const players = world.stores.players;
    const px = players.field("x")[0];
    const slot = dummyAt(world, px + 30, players.field("y")[0]);
    // Impulse knockback applies on the tick after the hit (enemy-ai order).
    step(world, []);
    step(world, []);
    step(world, []);
    const enemies = world.stores.enemies;
    expect(enemies.field("hp")[slot]).toBeLessThan(500);
    expect(enemies.field("freezeTicks")[slot]).toBeGreaterThan(0);
    expect(enemies.field("x")[slot]).toBeGreaterThan(px + 30);
  });

  it("shield-pulse absorbs contact damage before HP", () => {
    const world = makeWorld();
    giveAbility(world, 8);
    const players = world.stores.players;
    step(world, []);
    expect(players.field("shield")[0]).toBe(50);
    dummyAt(world, players.field("x")[0] + 2, players.field("y")[0]);
    // A few ticks of contact with i-frame windows: HP must stay full while the
    // shield soaks hits, then shield drops below its initial value.
    for (let i = 0; i < 40; i++) step(world, []);
    expect(players.field("hp")[0]).toBe(100);
    expect(players.field("shield")[0]).toBeLessThan(50);
  });

  it("turret zones fire projectiles at enemies in range", () => {
    const world = makeWorld(quietRules({ "ability.turretFireEvery": 2 }));
    giveAbility(world, 9);
    const players = world.stores.players;
    dummyAt(world, players.field("x")[0] + 90, players.field("y")[0]);
    for (let i = 0; i < 8; i++) step(world, []);
    expect(aliveProjectiles(world)).toBeGreaterThan(0);
  });
});
