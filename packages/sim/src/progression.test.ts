import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, applyChoice, createWorld, step } from "./index";
import type { ContentPack } from "./index";

// 2 abilities + 1 passive + 1 character → 3 item cards + 1 guaranteed training card.
const PROG_PACK: ContentPack = {
  id: "prog",
  schemaVersion: 1,
  enemies: [],
  abilities: [
    {
      id: "blade",
      behavior: "sweep",
      params: { arc: 1.2 },
      maxLevel: 8,
      base: {
        damage: 10,
        cooldown: 60,
        area: 44,
        speed: 0,
        duration: 0,
        amount: 1,
        pierce: 99,
        hitCooldown: 12,
        knockback: 4,
        lifetime: 0,
      },
      levels: [{ delta: { damage: 4 } }],
      damageType: "physical",
    },
    {
      id: "bolt",
      behavior: "shoot-nearest",
      params: {},
      maxLevel: 8,
      base: {
        damage: 8,
        cooldown: 45,
        area: 5,
        speed: 5,
        duration: 0,
        amount: 1,
        pierce: 0,
        hitCooldown: 10,
        knockback: 2,
        lifetime: 90,
      },
      levels: [{ delta: { damage: 3 } }],
      damageType: "magic",
    },
  ],
  passives: [{ id: "might", maxLevel: 5, perLevel: { might: 0.2 } }],
  characters: [{ id: "champion", startingAbility: "blade" }],
  powerUps: [],
  synergies: [],
};

describe("progression", () => {
  it("levels up and offers 3 item cards + 1 guaranteed training card", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: PROG_PACK }, 1);
    world.partyXp = 100;
    step(world, []);
    expect(world.stores.players.field("level")[0]).toBe(2);
    expect(world.pendingOffers().length).toBe(1);
    // 1 unused new ability + 1 upgrade + 1 guaranteed training card.
    expect(world.pendingOffers()[0].options.length).toBe(3);
    expect(world.pendingOffers()[0].options.filter((o) => o.ref.type === "training").length).toBe(
      1,
    );
  });

  it("training cards are repeatable and apply the stat directly", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: PROG_PACK }, 2);
    world.partyXp = 100;
    step(world, []);
    const offer = world.pendingOffers()[0];
    const training = offer.options.find((o) => o.ref.type === "training");
    expect(training).toBeTruthy();
    if (!training) throw new Error("training card missing");
    const key = training.statKey ?? "";
    const amount = training.statAmount ?? 0;
    expect(amount).toBeGreaterThan(0);
    const base = ["regen", "resist", "armor", "pierce", "lifesteal", "luck"].includes(key) ? 0 : 1;
    expect(world.playerStat(0, key, base)).toBeCloseTo(base);
    applyChoice(world, 0, offer.options.indexOf(training));
    expect(world.playerStat(0, key, base)).toBeCloseTo(base + amount);

    world.partyXp = world.partyXpToNext;
    step(world, []);
    expect(world.pendingOffers()[0].options.some((o) => o.ref.type === "training")).toBe(true);
  });

  it("learning a new ability adds it to the unified pool", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: PROG_PACK }, 1);
    world.partyXp = 100;
    step(world, []);
    const offer = world.pendingOffers()[0];
    const idx = offer.options.findIndex((o) => o.ref.id === "bolt");
    expect(idx).toBeGreaterThanOrEqual(0);

    applyChoice(world, 0, idx);
    expect(world.pendingOffers().length).toBe(0);
    const defs = world.stores.abilities
      .liveSlots()
      .map((slot) => world.content.abilities[world.stores.abilities.field("defIndex")[slot]].id);
    expect(defs.sort()).toEqual(["blade", "bolt"]);
  });

  it("upgrading a ability raises its level", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: PROG_PACK }, 1);
    world.partyXp = 100;
    step(world, []);
    const offer = world.pendingOffers()[0];
    const idx = offer.options.findIndex((o) => o.ref.type === "ability" && o.level !== undefined);
    expect(idx).toBeGreaterThanOrEqual(0);

    applyChoice(world, 0, idx);
    expect(world.stores.abilities.field("level")[0]).toBe(2);
  });
});
