import { DEFAULT_RULESET, applyChoice, createWorld, step } from "@rift/sim";
import { describe, expect, it } from "vitest";
import { loadGamePack } from "./index";

describe("co-op progression (real pack)", () => {
  it("both players can repeatedly pick passives without throwing", () => {
    const pack = loadGamePack();
    const world = createWorld(
      DEFAULT_RULESET,
      { playerCount: 2, content: pack, characterIds: ["lux", "brand"] },
      99,
    );

    for (let round = 0; round < 60; round++) {
      world.partyXp += world.partyXpToNext;
      step(world, [
        { playerId: 0, moveX: 1, moveY: 0 },
        { playerId: 1, moveX: -1, moveY: 0 },
      ]);

      let guard = 0;
      while (world.pendingOffers().length > 0 && guard++ < 8) {
        const offer = world.pendingOffers()[0];
        // Prefer a passive: this is the exact pick that used to crash the HUD.
        const passive = offer.options.findIndex((o) => o.ref.type === "passive");
        applyChoice(world, offer.playerId, passive >= 0 ? passive : 0);
      }
    }

    expect(world.pendingOffers().length).toBe(0);

    const passives = world.stores.passives;
    const owners = new Set<number>();
    passives.forEachAlive((slot) => owners.add(passives.field("owner")[slot]));
    expect(owners.size).toBe(2);
    expect(world.modifiers.snapshot().cooldown).toBeGreaterThan(0);

    for (let t = 0; t < 300; t++) {
      step(world, [
        { playerId: 0, moveX: 1, moveY: 0 },
        { playerId: 1, moveX: -1, moveY: 0 },
      ]);
    }
    expect(Number.isFinite(world.stat("cooldown", 1))).toBe(true);
    expect(Number.isFinite(world.stat("area", 1))).toBe(true);
  });
});
