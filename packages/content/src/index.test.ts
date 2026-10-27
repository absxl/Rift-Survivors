import { DEFAULT_RULESET, createWorld } from "@rift/sim";
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

  it("ships the full roster across all six classes", () => {
    const game = loadGamePack();
    expect(game.characters.length).toBeGreaterThanOrEqual(170);
    const classes = new Set(game.characters.map((c) => c.class));
    for (const required of ["mage", "tank", "fighter", "assassin", "marksman", "support"]) {
      expect(classes.has(required), required).toBe(true);
      expect(game.characters.filter((c) => c.class === required).length, required).toBeGreaterThan(
        3,
      );
    }
    const ids = new Set(game.characters.map((c) => c.id));
    expect(ids.size).toBe(game.characters.length);
  });

  it("gives every character a gacha identity, starting kit, and valid tree", () => {
    const game = loadGamePack();
    const weaponIds = new Map(game.weapons.map((w) => [w.id, w]));
    const powerUpIds = new Set(game.powerUps.map((p) => p.id));
    const regions = new Set<string>();
    expect(game.characters.filter((c) => c.starter)).toHaveLength(1);
    for (const c of game.characters) {
      expect(c.name, c.id).toBeTruthy();
      expect(c.description, c.id).toBeTruthy();
      expect(c.region, c.id).toBeTruthy();
      expect(c.class, c.id).toBeTruthy();
      expect(c.rarity, c.id).toBeTruthy();
      expect(c.upgradeIds?.length ?? 0, c.id).toBeGreaterThanOrEqual(6);
      regions.add(c.region ?? "");
      const move = c.startingMove ? weaponIds.get(c.startingMove) : undefined;
      expect(move, c.id).toBeTruthy();
      expect(move?.isMove, c.id).toBe(true);
      for (const upgradeId of c.upgradeIds ?? []) expect(powerUpIds.has(upgradeId)).toBe(true);
    }
    expect(weaponIds.size).toBeGreaterThan(20);
    const moves = [...weaponIds.values()].filter((w) => w.isMove);
    expect(moves.length).toBeGreaterThanOrEqual(8);
    // Every region must offer an Epic+ so the 10-pull guarantee is meaningful.
    for (const region of regions) {
      const pool = game.characters.filter((c) => (c.region ?? "Runeterra") === region);
      expect(
        pool.some((c) => c.rarity === "epic" || c.rarity === "legendary"),
        region,
      ).toBe(true);
    }
  });

  it("writes display names and flavor for every weapon/passive/champion/boss", () => {
    const game = loadGamePack();
    for (const w of game.weapons) {
      expect(w.name, w.id).toBeTruthy();
      expect(w.description, w.id).toBeTruthy();
    }
    for (const p of game.passives) {
      expect(p.name, p.id).toBeTruthy();
      expect(p.description, p.id).toBeTruthy();
    }
    for (const c of game.characters) {
      expect(c.name, c.id).toBeTruthy();
      expect(c.description, c.id).toBeTruthy();
    }
    for (const e of game.enemies.filter(
      (x) => x.category === "boss" || x.category === "final-threat",
    )) {
      expect(e.name, e.id).toBeTruthy();
    }
  });

  it("has the expanded stat passive roster", () => {
    const game = loadGamePack();
    expect(game.passives.length).toBeGreaterThanOrEqual(18);
    const keys = new Set(game.passives.flatMap((p) => Object.keys(p.perLevel)));
    for (const key of [
      "growth",
      "regen",
      "greed",
      "resist",
      "projectileSpeed",
      "duration",
      "pierce",
      "knockback",
      "lifesteal",
      "maxHp",
    ]) {
      expect(keys.has(key)).toBe(true);
    }
  });

  it("loads multiple stages with resolvable enemy/final pools", () => {
    const game = loadGamePack();
    expect(game.stages?.length ?? 0).toBeGreaterThanOrEqual(2);
    const enemyById = new Map(game.enemies.map((enemy) => [enemy.id, enemy]));
    for (const stage of game.stages ?? []) {
      expect(stage.name, stage.id).toBeTruthy();
      expect(stage.description, stage.id).toBeTruthy();
      expect(stage.enemyIds?.length ?? 0, stage.id).toBeGreaterThan(0);
      for (const id of stage.enemyIds ?? [])
        expect(enemyById.has(id), `${stage.id}:${id}`).toBe(true);
      if (stage.finalThreatId) {
        const final = enemyById.get(stage.finalThreatId);
        expect(final?.category, stage.id).toBe("final-threat");
      }
    }
    expect(game.stages?.some((stage) => stage.id === "noxus-warfront")).toBe(true);
  });

  it("synergies resolve (tag tiers non-empty)", () => {
    const game = loadGamePack();
    expect(game.synergies.length).toBeGreaterThanOrEqual(1);
    for (const s of game.synergies) {
      if (s.source.kind === "tagCount") {
        expect(s.source.tiers.length).toBeGreaterThan(0);
      }
    }
  });

  it("has the enemy variety scope and every behavior is registered", () => {
    const game = loadGamePack();
    const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: game }, 1);
    expect(game.enemies.length).toBeGreaterThanOrEqual(12);

    const minions = game.enemies.filter((e) => e.category === "minion");
    const elites = game.enemies.filter((e) => e.category === "elite");
    const bosses = game.enemies.filter((e) => e.category === "boss");
    const finals = game.enemies.filter((e) => e.category === "final-threat");
    expect(minions.length).toBeGreaterThanOrEqual(6);
    expect(elites.length).toBeGreaterThanOrEqual(2);
    expect(bosses.length).toBeGreaterThanOrEqual(3);
    expect(finals.length).toBeGreaterThanOrEqual(1);

    for (const def of game.enemies) {
      expect(world.registries.enemyBehaviors.has(def.behavior)).toBe(true);
    }
    for (const def of minions) {
      expect(def.spawnWeight ?? 1).toBeGreaterThan(0);
    }
  });
});
