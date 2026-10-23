import { describe, expect, it } from "vitest";
import { loadCorePack } from "./index";

describe("core pack", () => {
  it("loads and validates against the Zod schema", () => {
    const pack = loadCorePack();
    expect(pack.id).toBe("core");
    expect(pack.enemies.length).toBeGreaterThan(0);
    expect(pack.weapons.length).toBeGreaterThan(0);
  });

  it("weapon level deltas match maxLevel - 1", () => {
    const pack = loadCorePack();
    for (const w of pack.weapons) {
      expect(w.levels.length).toBe(w.maxLevel - 1);
    }
  });

  it("references behavior ids (never resolved by the engine here)", () => {
    const pack = loadCorePack();
    for (const e of pack.enemies) expect(e.behavior.length).toBeGreaterThan(0);
    for (const w of pack.weapons) expect(w.behavior.length).toBeGreaterThan(0);
  });

  it("has the M5 content scope (10 weapons, 8 passives, 3 characters)", () => {
    const pack = loadCorePack();
    expect(pack.weapons.length).toBeGreaterThanOrEqual(10);
    expect(pack.passives.length).toBeGreaterThanOrEqual(8);
    expect(pack.characters.length).toBeGreaterThanOrEqual(3);
    const behaviors = new Set(pack.weapons.map((w) => w.behavior));
    expect(behaviors.size).toBeGreaterThanOrEqual(8);
  });

  it("every character's starting weapon resolves", () => {
    const pack = loadCorePack();
    const weaponIds = new Set(pack.weapons.map((w) => w.id));
    for (const c of pack.characters) {
      expect(weaponIds.has(c.startingWeapon)).toBe(true);
    }
  });
});
