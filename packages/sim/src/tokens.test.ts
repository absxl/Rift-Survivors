import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULESET,
  applyChoice,
  banishOfferOption,
  createWorld,
  rerollOffer,
  skipOffer,
  step,
} from "./index";
import type { ContentPack } from "./index";

const TOKEN_PACK: ContentPack = {
  id: "tokens",
  schemaVersion: 1,
  enemies: [],
  abilities: [
    {
      id: "blade",
      behavior: "sweep",
      params: { arc: 1.2 },
      maxLevel: 5,
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
      levels: [
        { delta: { damage: 4 } },
        { delta: { damage: 4 } },
        { delta: { damage: 6 } },
        { delta: { damage: 8 } },
      ],
      damageType: "physical",
    },
    {
      id: "bolt",
      behavior: "shoot-nearest",
      params: {},
      maxLevel: 5,
      base: {
        damage: 8,
        cooldown: 48,
        area: 6,
        speed: 6,
        duration: 0,
        amount: 1,
        pierce: 1,
        hitCooldown: 12,
        knockback: 2,
        lifetime: 60,
      },
      levels: [{ delta: { damage: 3 } }, { delta: { damage: 3 } }, { delta: { damage: 5 } }],
      damageType: "magic",
    },
  ],
  passives: [
    { id: "might", maxLevel: 5, perLevel: { might: 0.2 } },
    { id: "scope", maxLevel: 5, perLevel: { area: 0.15 } },
  ],
  characters: [{ id: "champion", startingAbility: "blade" }],
  powerUps: [],
  synergies: [],
};

const EMPTY_PACK: ContentPack = {
  id: "empty",
  schemaVersion: 1,
  enemies: [],
  abilities: [],
  passives: [],
  characters: [{ id: "champion", startingAbility: "none" }],
  powerUps: [],
  synergies: [],
};

function levelUp(world: ReturnType<typeof createWorld>): void {
  world.partyXp = world.partyXpToNext;
  step(world, []);
}

describe("offer agency tokens", () => {
  it("rerolls redraw the offer and spend tokens", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: TOKEN_PACK }, 1);
    levelUp(world);
    const offer = world.pendingOffers()[0];
    expect(offer.rerolls).toBe(3);
    expect(offer.options.length).toBeGreaterThan(0);

    expect(rerollOffer(world, 0)).toBe(true);
    expect(offer.rerolls).toBe(2);
    expect(offer.options.length).toBeGreaterThan(0);

    expect(rerollOffer(world, 0)).toBe(true);
    expect(rerollOffer(world, 0)).toBe(true);
    expect(rerollOffer(world, 0)).toBe(false);
    expect(offer.rerolls).toBe(0);
  });

  it("skip dismisses the offer without picking", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: TOKEN_PACK }, 2);
    levelUp(world);
    expect(world.pendingOffers().length).toBe(1);
    expect(skipOffer(world, 0)).toBe(true);
    expect(world.pendingOffers().length).toBe(0);
    expect(skipOffer(world, 0)).toBe(false);
  });

  it("banish removes the option for this run and redraws", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: TOKEN_PACK }, 3);
    levelUp(world);
    const offer = world.pendingOffers()[0];
    const target = offer.options[0].optionId;

    expect(banishOfferOption(world, 0, 0)).toBe(true);
    expect(world.banishedOptions[0].has(target)).toBe(true);
    expect(offer.options.some((o) => o.optionId === target)).toBe(false);
    expect(offer.banishes).toBe(1);

    // The banished option stays out of future offers too.
    applyChoice(world, 0, 0);
    levelUp(world);
    const next = world.pendingOffers()[0];
    expect(next.options.some((o) => o.optionId === target)).toBe(false);
  });

  it("keeps tokens independent per player in co-op", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 2, content: TOKEN_PACK }, 4);
    levelUp(world);
    const offers = world.pendingOffers();
    expect(offers.length).toBe(2);
    const offer0 = offers.find((o) => o.playerId === 0);
    const offer1 = offers.find((o) => o.playerId === 1);
    expect(offer0?.rerolls).toBe(3);
    expect(offer1?.rerolls).toBe(3);

    expect(rerollOffer(world, 0)).toBe(true);
    expect(offer0?.rerolls).toBe(2);
    expect(offer1?.rerolls).toBe(3);
  });

  it("does not let players banish the fallback card", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: EMPTY_PACK }, 5);
    levelUp(world);
    const offer = world.pendingOffers()[0];
    expect(offer.options[0].optionId).toBe("fallback-heal");
    expect(banishOfferOption(world, 0, 0)).toBe(false);
    expect(offer.banishes).toBe(2);
  });

  it("does not let players banish the guaranteed training card", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: TOKEN_PACK }, 6);
    levelUp(world);
    const offer = world.pendingOffers()[0];
    const idx = offer.options.findIndex((o) => o.ref.type === "training");
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(banishOfferOption(world, 0, idx)).toBe(false);
    expect(offer.banishes).toBe(2);
  });
});
