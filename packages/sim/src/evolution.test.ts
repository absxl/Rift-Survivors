import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, applyChoice, createWorld, step } from "./index";
import type { AbilityDef, ContentPack } from "./index";

const EMPTY_PACK: ContentPack = {
  id: "evo-empty",
  schemaVersion: 1,
  enemies: [],
  abilities: [],
  passives: [],
  characters: [{ id: "champion", startingAbility: "none" }],
  powerUps: [],
  synergies: [],
};

function ability(overrides: Partial<AbilityDef> & Pick<AbilityDef, "id">): AbilityDef {
  return {
    behavior: "sweep",
    params: { arc: 1.2 },
    maxLevel: 2,
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
    ...overrides,
  };
}

const EVO_PACK: ContentPack = {
  id: "evo",
  schemaVersion: 1,
  enemies: [],
  abilities: [
    ability({
      id: "blade",
      evolution: { requiresPassive: "focus", evolvesTo: "blade-evolved" },
    }),
    ability({
      id: "blade-evolved",
      maxLevel: 5,
      levels: [
        { delta: { damage: 2 } },
        { delta: { damage: 2 } },
        { delta: { damage: 3 } },
        { delta: { damage: 4 } },
      ],
      isEvolved: true,
    }),
  ],
  passives: [{ id: "focus", maxLevel: 1, perLevel: { might: 0.1 } }],
  characters: [{ id: "champion", startingAbility: "blade" }],
  powerUps: [],
  synergies: [],
};

describe("progression endgame", () => {
  it("offers evolutions on level-up when the recipe is complete", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: EVO_PACK }, 1);
    const abilities = world.stores.abilities;
    const abilitySlot = abilities.liveSlots()[0];
    abilities.field("level")[abilitySlot] = 2;
    const passives = world.stores.passives;
    const passiveSlot = passives.alloc();
    passives.field("owner")[passiveSlot] = 0;
    passives.field("defIndex")[passiveSlot] = 0;
    passives.field("level")[passiveSlot] = 1;

    world.partyXp = world.partyXpToNext;
    step(world, []);
    const offer = world.pendingOffers()[0];
    expect(offer).toBeTruthy();
    const idx = offer.options.findIndex((o) => o.isEvolution);
    expect(idx).toBeGreaterThanOrEqual(0);
    applyChoice(world, 0, idx);
    expect(abilities.field("defIndex")[abilitySlot]).toBe(1);
    expect(abilities.field("level")[abilitySlot]).toBe(1);
  });

  it("uses the gentler XP table and linear post-table growth", () => {
    const first = createWorld(DEFAULT_RULESET, { playerCount: 1, content: EMPTY_PACK }, 2);
    first.partyLevel = 10;
    first.partyXp = 140;
    step(first, []);
    expect(first.partyLevel).toBe(11);
    expect(first.partyXpToNext).toBe(98);

    const tail = createWorld(DEFAULT_RULESET, { playerCount: 1, content: EMPTY_PACK }, 3);
    tail.partyLevel = 20;
    tail.partyXp = 223;
    step(tail, []);
    expect(tail.partyLevel).toBe(21);
    expect(tail.partyXpToNext).toBe(210);
  });
});
