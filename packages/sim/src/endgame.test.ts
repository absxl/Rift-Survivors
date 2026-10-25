import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, createWorld, step } from "./index";
import type { ContentPack, RulesetDef, SimEvent } from "./index";

const ENDGAME_PACK: ContentPack = {
  id: "endgame",
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
    {
      id: "void-threat",
      category: "final-threat",
      hp: 1000,
      damage: 30,
      moveSpeed: 1,
      radius: 20,
      xp: 500,
      behavior: "chase",
      params: {},
    },
  ],
  weapons: [],
  passives: [],
  characters: [{ id: "champion", startingWeapon: "none" }],
  powerUps: [],
  synergies: [],
};

function ruleset(overrides: Record<string, number>): RulesetDef {
  return {
    ...DEFAULT_RULESET,
    rules: {
      ...DEFAULT_RULESET.rules,
      "director.spawnInterval": 100000,
      "director.eliteInterval": 100000,
      "timeline.bossIntervalSec": 100000,
      ...overrides,
    },
  };
}

describe("endgame", () => {
  it("starts the boss rush when the final threat dies", () => {
    const world = createWorld(
      ruleset({ "timeline.finalThreatSec": 100000, "timeline.bossRushFallbackSec": 100000 }),
      { playerCount: 1, content: ENDGAME_PACK },
      1,
    );
    const enemies = world.stores.enemies;
    const slot = enemies.alloc();
    enemies.field("x")[slot] = 160;
    enemies.field("y")[slot] = 160;
    enemies.field("hp")[slot] = 10;
    enemies.field("maxHp")[slot] = 10;
    enemies.field("kind")[slot] = 1; // void-threat
    world.applyHit(slot, 999, 1, 0, 0, 0, 0);

    const events: SimEvent[] = step(world, []);
    expect(world.bossRush).toBe(true);
    expect(events.some((e) => e.type === "boss-rush" && e.reason === "killed")).toBe(true);
  });

  it("starts the boss rush via the fallback timer if the threat survives", () => {
    const world = createWorld(
      ruleset({ "timeline.finalThreatSec": 1, "timeline.bossRushFallbackSec": 1 }),
      { playerCount: 1, content: ENDGAME_PACK },
      2,
    );
    const players = world.stores.players;
    const events: SimEvent[] = [];
    for (let t = 0; t < 75; t++) {
      players.field("iFrames")[0] = 2; // test invulnerability
      events.push(...step(world, []));
    }
    expect(world.finalThreatSpawned).toBe(true);
    expect(world.bossRush).toBe(true);
    expect(events.some((e) => e.type === "boss-rush" && e.reason === "timeout")).toBe(true);
  });
});
