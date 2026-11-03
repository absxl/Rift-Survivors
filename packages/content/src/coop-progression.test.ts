import { DEFAULT_RULESET, applyChoice, createWorld, step } from "@rift/sim";
import { describe, expect, it } from "vitest";
import { loadGamePack } from "./index";

describe("co-op progression (real pack)", () => {
  it("both players can repeatedly pick training cards without throwing", () => {
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
        // Prefer the training card: every offer guarantees one, and repeated
        // direct stat picks are the exact pattern that used to crash the HUD.
        const training = offer.options.findIndex((o) => o.ref.type === "training");
        applyChoice(world, offer.playerId, training >= 0 ? training : 0);
      }
    }

    expect(world.pendingOffers().length).toBe(0);

    // Training cards flow through the per-player modifier stacks.
    expect(Object.keys(world.playerModifiers[0].snapshot()).length).toBeGreaterThan(0);
    expect(Object.keys(world.playerModifiers[1].snapshot()).length).toBeGreaterThan(0);

    for (let t = 0; t < 300; t++) {
      step(world, [
        { playerId: 0, moveX: 1, moveY: 0 },
        { playerId: 1, moveX: -1, moveY: 0 },
      ]);
    }
    expect(Number.isFinite(world.playerStat(0, "cooldown", 1))).toBe(true);
    expect(Number.isFinite(world.playerStat(0, "area", 1))).toBe(true);
  });

  it("supports the full shop loop: buy, combine, sell", () => {
    const pack = loadGamePack();
    const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: pack }, 7);
    const items = world.content.items ?? [];
    const sheen = items.find((i) => i.id === "sheen");
    const trinity = items.find((i) => i.id === "trinity-force");
    expect(sheen && trinity?.recipe).toBeTruthy();

    world.stores.players.field("gold")[0] = 10_000;

    // Buy both components of Sheen.
    for (const component of sheen!.recipe!.components) {
      expect(world.buyItem(0, component)).toBe(true);
    }
    expect(world.ownedItems(0).length).toBe(2);

    // Combine into Sheen (components freed, one slot added).
    expect(world.combineItem(0, "sheen")).toBe(true);
    expect(world.ownedItems(0).length).toBe(1);
    expect(world.playerStat(0, "attackDamage", 0)).toBeGreaterThan(0);

    // Upgrade Sheen into Trinity Force.
    for (const component of trinity!.recipe!.components) {
      if (component === "sheen") continue;
      expect(world.buyItem(0, component)).toBe(true);
    }
    expect(world.combineItem(0, "trinity-force")).toBe(true);
    expect(world.ownedItems(0).length).toBe(1);

    // Sell refunds 70% of the item's cost.
    const goldBefore = world.stores.players.field("gold")[0];
    const slot = world.ownedItems(0)[0].slot;
    expect(world.sellItem(0, slot)).toBe(true);
    // Gold is f32 in the store; allow float rounding.
    expect(world.stores.players.field("gold")[0]).toBeCloseTo(goldBefore + trinity!.cost * 0.7, 0);
    expect(world.playerStat(0, "attackDamage", 0)).toBe(0);
  });

  it("caps the inventory at loadout.itemSlots per player", () => {
    const pack = loadGamePack();
    const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: pack }, 7);
    world.stores.players.field("gold")[0] = 999_999;
    const items = (world.content.items ?? [])
      .filter((i) => !i.recipe)
      .sort((a, b) => a.cost - b.cost);
    let bought = 0;
    for (const item of items) {
      if (!world.buyItem(0, item.id)) break;
      bought++;
    }
    expect(bought).toBe(16);
    expect(world.ownedItems(0).length).toBe(16);
  });
});
