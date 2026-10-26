import type { EnemyDef, StoreSnapshot, WorldSnapshot } from "@rift/sim";
import { describe, expect, it } from "vitest";
import { pickBossBar } from "./hud-boss";

function store(kind: string, fields: Record<string, number[]>): StoreSnapshot {
  return {
    kind,
    slots: fields.x?.map((_, i) => i) ?? [],
    generations: fields.x?.map(() => 1) ?? [],
    fields,
  } as StoreSnapshot;
}

function snapshot(playerX: number, playerY: number, enemies: StoreSnapshot): WorldSnapshot {
  return {
    stores: [store("player", { x: [playerX], y: [playerY], hp: [100], maxHp: [100] }), enemies],
  } as unknown as WorldSnapshot;
}

const DEFS: EnemyDef[] = [
  {
    id: "chaser",
    category: "minion",
    hp: 10,
    damage: 1,
    moveSpeed: 1,
    radius: 1,
    xp: 1,
    behavior: "chase",
    params: {},
  },
  {
    id: "herald",
    category: "boss",
    hp: 200,
    damage: 10,
    moveSpeed: 1,
    radius: 14,
    xp: 1,
    behavior: "chase",
    params: {},
  },
  {
    id: "void-threat",
    category: "final-threat",
    hp: 1000,
    damage: 10,
    moveSpeed: 1,
    radius: 20,
    xp: 1,
    behavior: "chase",
    params: {},
  },
];

describe("boss bar target", () => {
  it("returns null when only minions are alive", () => {
    const enemies = store("enemy", {
      x: [100],
      y: [100],
      hp: [10],
      maxHp: [10],
      kind: [0],
    });
    expect(pickBossBar(snapshot(0, 0, enemies), DEFS, 0)).toBeNull();
  });

  it("picks the nearest boss or final threat", () => {
    const enemies = store("enemy", {
      x: [10, 400, 50],
      y: [0, 0, 0],
      hp: [200, 400, 500],
      maxHp: [200, 1000, 500],
      kind: [1, 2, 0],
    });
    const target = pickBossBar(snapshot(0, 0, enemies), DEFS, 0);
    expect(target?.name).toBe("HERALD");
    expect(target?.final).toBe(false);
    expect(target?.hp).toBe(200);
  });

  it("flags the final threat", () => {
    const enemies = store("enemy", {
      x: [10],
      y: [0],
      hp: [500],
      maxHp: [1000],
      kind: [2],
    });
    const target = pickBossBar(snapshot(0, 0, enemies), DEFS, 0);
    expect(target?.name).toBe("VOID-THREAT");
    expect(target?.final).toBe(true);
  });
});
