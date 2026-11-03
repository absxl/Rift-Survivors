import { describe, expect, it } from "vitest";
import { type ContentPack, DEFAULT_RULESET, createWorld } from "./index";

const PACK: ContentPack = {
  id: "stages",
  schemaVersion: 1,
  enemies: [
    {
      id: "only",
      category: "minion",
      hp: 10,
      damage: 1,
      moveSpeed: 1,
      radius: 5,
      xp: 1,
      behavior: "chase",
      params: {},
    },
    {
      id: "other",
      category: "minion",
      hp: 10,
      damage: 1,
      moveSpeed: 1,
      radius: 5,
      xp: 1,
      behavior: "chase",
      params: {},
    },
  ],
  abilities: [],
  passives: [],
  characters: [],
  powerUps: [],
  synergies: [],
  stages: [
    {
      id: "first",
      name: "First",
      description: "",
      region: "Runeterra",
      palette: { background: 0xffffff, grid: 0x000000, accent: 0xffffff },
    },
    {
      id: "noxus",
      name: "Noxus",
      description: "",
      region: "Noxus",
      palette: { background: 0xff0000, grid: 0x000000, accent: 0xff0000 },
      enemyIds: ["only"],
      rules: { "director.spawnInterval": 7 },
    },
  ],
};

describe("stage definitions", () => {
  it("selects a stage and applies its rule overrides", () => {
    const world = createWorld(
      DEFAULT_RULESET,
      { playerCount: 1, content: PACK, stageId: "noxus" },
      1,
    );
    expect(world.stage?.id).toBe("noxus");
    expect(world.stage?.name).toBe("Noxus");
    expect(world.num("director.spawnInterval")).toBe(7);
    expect(world.stageAllowsEnemy("only")).toBe(true);
    expect(world.stageAllowsEnemy("other")).toBe(false);
  });

  it("falls back to the first stage for an unknown id", () => {
    const world = createWorld(
      DEFAULT_RULESET,
      { playerCount: 1, content: PACK, stageId: "missing" },
      1,
    );
    expect(world.stage?.id).toBe("first");
  });

  it("keeps unrestricted test packs working without stages", () => {
    const world = createWorld(
      DEFAULT_RULESET,
      { playerCount: 1, content: { ...PACK, stages: [] } },
      1,
    );
    expect(world.stage).toBeNull();
    expect(world.stageAllowsEnemy("other")).toBe(true);
  });
});
