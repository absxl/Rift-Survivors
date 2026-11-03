import { describe, expect, it } from "vitest";
import { BushField, DEFAULT_RULESET, PICKUP_HEAL, TerrainField, createWorld, step } from "./index";
import type { ContentPack } from "./index";

const PACK: ContentPack = {
  id: "bush-test",
  schemaVersion: 1,
  enemies: [],
  abilities: [],
  passives: [],
  characters: [{ id: "hero", startingAbility: "none" }],
  powerUps: [],
  synergies: [],
};

describe("breakable bushes", () => {
  it("increases cluster density with the stage setting", () => {
    const terrain = new TerrainField(null, 77);
    const sparse = new BushField(terrain, 77, 1);
    const dense = new BushField(terrain, 77, 1.9);
    let sparseCount = 0;
    let denseCount = 0;
    for (let cy = -1; cy <= 1; cy++) {
      for (let cx = -1; cx <= 1; cx++) {
        sparseCount += sparse.positions(cx, cy).length;
        denseCount += dense.positions(cx, cy).length;
      }
    }
    expect(denseCount).toBeGreaterThan(sparseCount * 1.5);
  });

  it("streams bushes around the party and drops healing when broken", () => {
    const world = createWorld(
      {
        ...DEFAULT_RULESET,
        rules: {
          ...DEFAULT_RULESET.rules,
          "director.maxEnemies": 0,
          "director.eliteInterval": 1_000_000,
          "timeline.bossIntervalSec": 1_000_000,
          "timeline.finalThreatSec": 1_000_000,
          "chest.firstSpawnSec": 1_000_000,
        },
      },
      { playerCount: 1, content: PACK },
      44,
    );
    step(world, []);
    const bushes = world.stores.bushes.liveSlots();
    expect(bushes.length).toBeGreaterThan(0);
    const slot = bushes[0];
    const tx = world.stores.bushes.field("tx")[slot];
    const ty = world.stores.bushes.field("ty")[slot];
    world.damageBush(slot, 1, 0);
    expect(world.stores.players.field("bushesBroken")[0]).toBe(1);
    expect(world.brokenBushes.has(`${tx},${ty}`)).toBe(true);
    expect(
      world.stores.pickups
        .liveSlots()
        .some((pickup) => world.stores.pickups.field("kind")[pickup] === PICKUP_HEAL),
    ).toBe(true);
    expect(world.stores.bushes.isAlive(slot)).toBe(false);
  });
});
