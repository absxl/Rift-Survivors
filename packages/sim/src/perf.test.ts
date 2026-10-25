import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, createWorld, step } from "./index";
import type { ContentPack } from "./index";

const PERF_PACK: ContentPack = {
  id: "perf",
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
  weapons: [
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
  characters: [{ id: "champion", startingWeapon: "blade" }],
  powerUps: [],
  synergies: [],
};

describe("performance", () => {
  it("steps 600 simultaneous enemies well inside budget", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: PERF_PACK }, 11);
    const players = world.stores.players;
    players.field("maxHp")[0] = 1_000_000;
    players.field("hp")[0] = 1_000_000;

    const enemies = world.stores.enemies;
    const px = players.field("x")[0];
    const py = players.field("y")[0];
    for (let i = 0; i < 600; i++) {
      const slot = enemies.alloc();
      const angle = (i / 600) * Math.PI * 2;
      const radius = 40 + (i % 20) * 12;
      enemies.field("x")[slot] = px + Math.cos(angle) * radius;
      enemies.field("y")[slot] = py + Math.sin(angle) * radius;
      enemies.field("hp")[slot] = 1e9;
      enemies.field("maxHp")[slot] = 1e9;
      enemies.field("kind")[slot] = 0;
    }
    expect(enemies.liveSlots().length).toBeGreaterThanOrEqual(600);

    const started = performance.now();
    for (let t = 0; t < 120; t++) step(world, []);
    const elapsedMs = performance.now() - started;

    // Deliberately generous: this catches accidental O(n^2) regressions rather than
    // micro-benchmarking CI hardware. 120 ticks (4 s of sim) should be far under 10 s.
    expect(elapsedMs).toBeLessThan(10_000);
    for (const slot of enemies.liveSlots()) {
      expect(Number.isFinite(enemies.field("x")[slot])).toBe(true);
      expect(Number.isFinite(enemies.field("y")[slot])).toBe(true);
    }
  }, 60_000);
});
