import { describe, expect, it } from "vitest";
import type { CharacterDef, ContentPack, StageTerrain } from "./index";
import { DEFAULT_RULESET, TILE_LIQUID, TILE_WALL, TerrainField, createWorld, step } from "./index";

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

  it("produces a noticeably denser, coherent field at production-like thresholds", () => {
    const dense: StageTerrain = {
      ...WALLS,
      wallThreshold: 0.65,
      liquidThreshold: 0.3,
    };
    const field = new TerrainField(dense, 123);
    let walls = 0;
    let liquids = 0;
    let isolated = 0;
    const area = 96 * 96;
    for (let y = 4; y < 100; y++) {
      for (let x = 4; x < 100; x++) {
        const type = field.tileAt(x, y);
        if (type === TILE_WALL) walls++;
        if (type === TILE_LIQUID) liquids++;
        if (type !== TILE_WALL && type !== TILE_LIQUID) continue;
        let neighbors = 0;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            if (ox === 0 && oy === 0) continue;
            if (field.tileAt(x + ox, y + oy) === type) neighbors++;
          }
        }
        if (neighbors === 0) isolated++;
      }
    }
    expect(walls / area).toBeGreaterThan(0.1);
    expect(liquids / area).toBeGreaterThan(0.05);
    expect(walls / area).toBeLessThan(0.4);
    expect(liquids / area).toBeLessThan(0.25);
    expect(isolated).toBe(0);
  });

  it("cleans isolated solid and liquid tiles into coherent patches", () => {
    const varied: StageTerrain = { ...WALLS, wallThreshold: 0.62, liquidThreshold: 0.22 };
    const field = new TerrainField(varied, 77);
    let isolated = 0;
    for (let y = 2; y < 30; y++) {
      for (let x = 2; x < 30; x++) {
        const type = field.tileAt(x, y);
        if (type !== TILE_WALL && type !== TILE_LIQUID) continue;
        let neighbors = 0;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            if (ox === 0 && oy === 0) continue;
            if (field.tileAt(x + ox, y + oy) === type) neighbors++;
          }
        }
        if (neighbors === 0) isolated++;
      }
    }
    expect(isolated).toBe(0);
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

  it("finds free spawn points on stages with damaging liquid", () => {
    // Regression: the old check was stage-global (liquidDamage > 0 rejected
    // every point), which silently disabled all ground spawns and run chests
    // on lava stages like Noxian Warfront.
    const lava: StageTerrain = {
      ...WATER,
      liquid: "lava",
      liquidDamage: 5,
      wallThreshold: 0.65,
      liquidThreshold: 0.3,
    };
    const field = new TerrainField(lava, 421, [{ x: 0, y: 0, radius: 96 }]);
    const safe = field.findFreeNear(0, 0, 8);
    expect(safe).not.toBeNull();
    if (safe) {
      expect(field.isLiquidAt(safe.x, safe.y)).toBe(false);
    }

    // A search that starts on liquid must never land back on damaging liquid.
    for (let y = 0; y < 480; y += 8) {
      for (let x = 300; x < 780; x += 8) {
        if (!field.isLiquidAt(x, y)) continue;
        const relocated = field.findFreeNear(x, y, 8);
        if (relocated) {
          expect(field.isLiquidAt(relocated.x, relocated.y)).toBe(false);
        }
      }
    }

    // Harmless liquid (no liquidDamage) stays spawnable, as before.
    const plain = new TerrainField(WATER, 421, [{ x: 0, y: 0, radius: 96 }]);
    expect(plain.findFreeNear(0, 0, 8)).not.toBeNull();
  });

  it("resolves a circle out of a solid tile", () => {
    const terrain = new TerrainField(WALLS, 4, [{ x: 0, y: 0, radius: 120 }]);
    const blocked = terrain.collide(124, 0, 8);
    expect(blocked.hit).toBe(true);
    expect(blocked.x).toBeLessThanOrEqual(120);
    expect(terrain.isFree(blocked.x, blocked.y, 8)).toBe(true);
  });
});
