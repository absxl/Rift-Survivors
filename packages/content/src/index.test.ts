import { describe, expect, it } from "vitest";
import { loadCorePack, loadGamePack, loadLolPack } from "./index";

describe("content packs", () => {
  it("core pack loads enemies + items", () => {
    const core = loadCorePack();
    expect(core.enemies.length).toBeGreaterThan(0);
    expect(core.passives.length).toBeGreaterThanOrEqual(8);
    expect(core.weapons.length).toBe(0);
    expect(core.characters.length).toBe(0);
  });

  it("lol pack loads champions + abilities", () => {
    const lol = loadLolPack();
    expect(lol.characters.length).toBeGreaterThanOrEqual(8);
    expect(lol.weapons.length).toBeGreaterThanOrEqual(10);
    const behaviors = new Set(lol.weapons.map((w) => w.behavior));
    expect(behaviors.size).toBeGreaterThanOrEqual(7);
  });

  it("game pack merges core + lol", () => {
    const game = loadGamePack();
    expect(game.enemies.length).toBeGreaterThan(0);
    expect(game.weapons.length).toBeGreaterThanOrEqual(10);
    expect(game.passives.length).toBeGreaterThanOrEqual(8);
    expect(game.characters.length).toBeGreaterThanOrEqual(4);
  });

  it("every character's starting weapon resolves", () => {
    const game = loadGamePack();
    const weaponIds = new Set(game.weapons.map((w) => w.id));
    for (const c of game.characters) {
      expect(weaponIds.has(c.startingWeapon)).toBe(true);
    }
  });

  it("weapon level deltas match maxLevel - 1", () => {
    const game = loadGamePack();
    for (const w of game.weapons) {
      expect(w.levels.length).toBe(w.maxLevel - 1);
    }
  });

  it("every evolution recipe resolves", () => {
    const game = loadGamePack();
    const weaponIds = new Set(game.weapons.map((w) => w.id));
    const passiveIds = new Set(game.passives.map((p) => p.id));
    let evolutions = 0;
    for (const w of game.weapons) {
      if (!w.evolution) continue;
      evolutions++;
      expect(passiveIds.has(w.evolution.requiresPassive)).toBe(true);
      expect(weaponIds.has(w.evolution.evolvesTo)).toBe(true);
      const evolved = game.weapons.find((e) => e.id === w.evolution?.evolvesTo);
      expect(evolved?.isEvolved).toBe(true);
    }
    expect(evolutions).toBeGreaterThanOrEqual(4);
  });

  it("has the M8 power-up shop scope (>= 8)", () => {
    const game = loadGamePack();
    expect(game.powerUps.length).toBeGreaterThanOrEqual(8);
    for (const p of game.powerUps) {
      expect(p.costs.length).toBe(p.maxRank);
    }
  });
});
