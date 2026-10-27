import { describe, expect, it } from "vitest";
import type { CharacterDef, ContentPack, StageTerrain } from "./index";
import { DEFAULT_RULESET, TerrainField, createWorld, step } from "./index";

const WALLS: StageTerrain = {
  wallThreshold: 0,
  liquidThreshold: 0,
  liquid: "water",
  liquidSlow: 0.5,
  liquidDamage: 0,
  colors: {
    floor: "#222222",
    floorAlt: "#282828",
    floorSpeck: "#111111",
    wallTop: "#666666",
    wallTopAlt: "#777777",
    wallFace: "#444444",
    wallEdge: "#111111",
    liquid: "#336699",
    liquidDeep: "#224466",
    liquidAccent: "#99ccff",
  },
};

const WATER: StageTerrain = {
  ...WALLS,
  wallThreshold: 1,
  liquidThreshold: 1,
  liquidSlow: 0.8,
  liquidDamage: 0,
};

function character(id: string, levitate: boolean): CharacterDef {
  return {
    id,
    name: id,
    startingWeapon: "none",
    tags: levitate ? ["levitate"] : [],
  };
}

function pack(terrain: StageTerrain): ContentPack {
  return {
    id: "terrain-test",
    schemaVersion: 1,
    enemies: [],
    weapons: [],
    passives: [],
    characters: [character("walker", false), character("floater", true)],
    powerUps: [],
    synergies: [],
    stages: [
      {
        id: "test-field",
        name: "Test Field",
        description: "",
        region: "Runeterra",
        palette: { background: 0xffffff, grid: 0x000000, accent: 0xffffff },
        terrain,
      },
    ],
  };
}

function moveFor(characterId: string, terrain: StageTerrain, ticks = 180): number {
  const world = createWorld(
    DEFAULT_RULESET,
    {
      playerCount: 1,
      content: pack(terrain),
      characterId,
      stageId: "test-field",
    },
    1234,
  );
  for (let i = 0; i < ticks; i++) {
    step(world, [{ playerId: 0, moveX: 1, moveY: 0 }]);
  }
  return world.stores.players.field("x")[0];
}

describe("terrain", () => {
  it("is deterministic per seed and stage", () => {
    const varied: StageTerrain = { ...WALLS, wallThreshold: 0.62, liquidThreshold: 0.22 };
    const a = new TerrainField(varied, 99);
    const b = new TerrainField(varied, 99);
    const c = new TerrainField(varied, 100);
    let differences = 0;
    for (let y = -2; y < 12; y++) {
      for (let x = -2; x < 12; x++) {
        expect(a.tileAt(x, y)).toBe(b.tileAt(x, y));
        if (a.tileAt(x, y) !== c.tileAt(x, y)) differences++;
      }
    }
    expect(differences).toBeGreaterThan(0);
  });

  it("blocks walking characters at walls but lets levitate characters through", () => {
    const walker = moveFor("walker", WALLS);
    const floater = moveFor("floater", WALLS);
    expect(walker).toBeLessThan(900);
    expect(floater).toBeGreaterThan(walker + 80);
  });

  it("slows ground units in liquid but not levitate units", () => {
    const walker = moveFor("walker", WATER);
    const floater = moveFor("floater", WATER);
    expect(floater).toBeGreaterThan(walker + 40);
  });

  it("applies damaging liquid only to grounded units", () => {
    const lava: StageTerrain = { ...WATER, liquid: "lava", liquidDamage: 7 };
    const field = new TerrainField(lava, 5, [{ x: 0, y: 0, radius: 64 }]);
    expect(field.liquidDamageAt(200, 200, false)).toBe(7);
    expect(field.liquidDamageAt(200, 200, true)).toBe(0);
  });

  it("resolves a circle out of a solid tile", () => {
    const terrain = new TerrainField(WALLS, 4, [{ x: 0, y: 0, radius: 120 }]);
    const blocked = terrain.collide(124, 0, 8);
    expect(blocked.hit).toBe(true);
    expect(blocked.x).toBeLessThanOrEqual(120);
    expect(terrain.isFree(blocked.x, blocked.y, 8)).toBe(true);
  });
});
