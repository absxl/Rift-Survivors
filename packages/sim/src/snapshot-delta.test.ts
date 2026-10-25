import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULESET,
  applySnapshotDelta,
  buildSnapshotDelta,
  createWorld,
  snapshot,
  step,
} from "./index";
import type { ContentPack } from "./index";

const MOVE_PACK: ContentPack = {
  id: "delta",
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
      maxLevel: 5,
      base: {
        damage: 10,
        cooldown: 20,
        area: 44,
        speed: 0,
        duration: 0,
        amount: 1,
        pierce: 99,
        hitCooldown: 12,
        knockback: 4,
        lifetime: 0,
      },
      levels: [{ delta: { damage: 4 } }],
      damageType: "physical",
    },
  ],
  passives: [],
  characters: [{ id: "champion", startingWeapon: "blade" }],
  powerUps: [],
  synergies: [],
};

const EMPTY_PACK: ContentPack = {
  id: "delta-empty",
  schemaVersion: 1,
  enemies: [],
  weapons: [],
  passives: [],
  characters: [{ id: "champion", startingWeapon: "none" }],
  powerUps: [],
  synergies: [],
};

describe("snapshot deltas", () => {
  it("round-trips a full snapshot through one delta", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: MOVE_PACK }, 1);
    for (let t = 0; t < 30; t++) step(world, [{ playerId: 0, moveX: 1, moveY: 0.2 }]);
    const before = snapshot(world);
    for (let t = 0; t < 20; t++) step(world, [{ playerId: 0, moveX: -0.4, moveY: 1 }]);
    const after = snapshot(world);

    const delta = buildSnapshotDelta(before, after);
    expect(delta.baseTick).toBe(before.tick);
    expect(delta.tick).toBe(after.tick);
    expect(applySnapshotDelta(before, delta)).toEqual(after);
  });

  it("chains multiple deltas", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 2, content: MOVE_PACK }, 2);
    const frames = [snapshot(world)];
    for (let i = 0; i < 3; i++) {
      for (let t = 0; t < 25; t++) {
        step(world, [
          { playerId: 0, moveX: 1, moveY: 0 },
          { playerId: 1, moveX: 0, moveY: -1 },
        ]);
      }
      frames.push(snapshot(world));
    }
    let current = frames[0];
    for (let i = 1; i < frames.length; i++) {
      current = applySnapshotDelta(current, buildSnapshotDelta(current, frames[i]));
      expect(current).toEqual(frames[i]);
    }
  });

  it("omits unchanged rows (static gems)", () => {
    const world = createWorld(
      { ...DEFAULT_RULESET, rules: { ...DEFAULT_RULESET.rules } },
      { playerCount: 1, content: EMPTY_PACK },
      3,
    );
    const gems = world.stores.gems;
    const slot = gems.alloc();
    gems.field("x")[slot] = 100;
    gems.field("y")[slot] = 100;
    gems.field("value")[slot] = 1;

    const before = snapshot(world);
    step(world, []);
    const after = snapshot(world);
    const delta = buildSnapshotDelta(before, after);
    const gemDelta = delta.stores.find((s) => s.kind === "gem");
    expect(gemDelta?.rows.length).toBe(0);
    expect(applySnapshotDelta(before, delta)).toEqual(after);
  });

  it("adds and removes entity rows", () => {
    const world = createWorld(
      { ...DEFAULT_RULESET, rules: { ...DEFAULT_RULESET.rules } },
      { playerCount: 1, content: EMPTY_PACK },
      4,
    );
    const enemies = world.stores.enemies;
    const before = snapshot(world);

    const slot = enemies.alloc();
    enemies.field("x")[slot] = 300;
    enemies.field("y")[slot] = 200;
    enemies.field("hp")[slot] = 5;
    enemies.field("maxHp")[slot] = 5;
    enemies.field("kind")[slot] = 0;
    const added = snapshot(world);
    const addDelta = buildSnapshotDelta(before, added);
    expect(addDelta.stores.find((s) => s.kind === "enemy")?.rows.length).toBe(1);
    expect(applySnapshotDelta(before, addDelta)).toEqual(added);

    enemies.free(slot);
    const removed = snapshot(world);
    const removeDelta = buildSnapshotDelta(added, removed);
    expect(removeDelta.stores.find((s) => s.kind === "enemy")?.slots.length).toBe(0);
    expect(applySnapshotDelta(added, removeDelta)).toEqual(removed);
  });

  it("rejects a delta against the wrong base", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: MOVE_PACK }, 5);
    const a = snapshot(world);
    step(world, []);
    const b = snapshot(world);
    step(world, []);
    const c = snapshot(world);
    const delta = buildSnapshotDelta(b, c);
    expect(() => applySnapshotDelta(a, delta)).toThrow(/does not match/);
  });
});
