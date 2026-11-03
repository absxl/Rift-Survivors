import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, createWorld, step } from "./index";
import type { ContentPack, RulesetDef, World } from "./index";
import { PICKUP_BOMB, PICKUP_MAGNET } from "./systems/pickups";

const PACK: ContentPack = {
  id: "run-chest-test",
  schemaVersion: 1,
  enemies: [],
  weapons: [],
  passives: [],
  characters: [{ id: "hero", startingWeapon: "none" }],
  powerUps: [],
  synergies: [],
};

function rules(overrides: Record<string, number> = {}): RulesetDef {
  return {
    ...DEFAULT_RULESET,
    rules: {
      ...DEFAULT_RULESET.rules,
      "director.maxEnemies": 0,
      "director.eliteInterval": 1_000_000,
      "timeline.bossIntervalSec": 1_000_000,
      "timeline.finalThreatSec": 1_000_000,
      "chest.firstSpawnSec": 0,
      "chest.spawnIntervalSec": 1_000_000,
      "chest.openTicks": 3,
      "chest.openRadius": 50,
      "chest.holdRadius": 100,
      "chest.keyChance": 1,
      "chest.xpBase": 10,
      "chest.goldBase": 10,
      "chest.xpPerMin": 0,
      "chest.goldPerMin": 0,
      ...overrides,
    },
  };
}

function spawnOne(world: World): number {
  world.nextChestTick = 0;
  step(world, []);
  const slots = world.stores.chests.liveSlots();
  expect(slots).toHaveLength(1);
  return slots[0];
}

function placePlayerAt(world: World, x: number, y: number): void {
  const players = world.stores.players;
  players.field("x")[0] = x;
  players.field("y")[0] = y;
}

describe("spawnable run chests", () => {
  it("requires the opener to stay close for the full open duration", () => {
    const world = createWorld(rules(), { playerCount: 1, content: PACK }, 91);
    const slot = spawnOne(world);
    const chests = world.stores.chests;
    const chestX = chests.field("x")[slot];
    const chestY = chests.field("y")[slot];
    placePlayerAt(world, chestX, chestY);

    step(world, []);
    expect(chests.field("openingTicks")[slot]).toBe(3);
    expect(chests.field("opener")[slot]).toBe(0);

    placePlayerAt(world, chestX + 200, chestY);
    step(world, []);
    expect(chests.field("openingTicks")[slot]).toBe(0);
    expect(chests.field("opener")[slot]).toBe(255);

    placePlayerAt(world, chestX, chestY);
    step(world, []);
    step(world, []);
    step(world, []);
    step(world, []);
    expect(chests.isAlive(slot)).toBe(false);
    expect(world.stores.players.field("chestsOpened")[0]).toBe(1);
    expect(world.stores.players.field("keys")[0]).toBe(1);
    expect(world.partyXp).toBeGreaterThan(0);
    expect(world.stores.players.field("gold")[0]).toBeGreaterThan(0);
  });

  it("rolls magnet and bomb drops independently", () => {
    const world = createWorld(
      rules({ "pickup.radius": 0, "chest.magnetChance": 1, "chest.bombChance": 0 }),
      { playerCount: 1, content: PACK },
      93,
    );
    const slot = spawnOne(world);
    const chests = world.stores.chests;
    placePlayerAt(world, chests.field("x")[slot], chests.field("y")[slot]);
    for (let i = 0; i < 5; i++) step(world, []);
    const kinds: number[] = [];
    world.stores.pickups.forEachAlive((pickupSlot) =>
      kinds.push(world.stores.pickups.field("kind")[pickupSlot]),
    );
    expect(kinds).toContain(PICKUP_MAGNET);
    expect(kinds).not.toContain(PICKUP_BOMB);
  });

  it("emits a claim event and cannot be opened by a downed player", () => {
    const world = createWorld(rules(), { playerCount: 1, content: PACK }, 92);
    const slot = spawnOne(world);
    const chests = world.stores.chests;
    placePlayerAt(world, chests.field("x")[slot], chests.field("y")[slot]);
    world.stores.players.field("downed")[0] = 1;
    step(world, []);
    expect(chests.field("opener")[slot]).toBe(255);

    world.stores.players.field("downed")[0] = 0;
    const events = step(world, []);
    expect(events.some((event) => event.type === "run-chest-start")).toBe(true);
  });
});
