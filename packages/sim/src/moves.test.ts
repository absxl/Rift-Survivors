import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, applyChoice, createWorld, step } from "./index";
import type { AbilityDef, ContentPack } from "./index";

function ability(id: string): AbilityDef {
  return {
    id,
    behavior: "shoot-nearest",
    params: {},
    maxLevel: 5,
    base: {
      damage: 5,
      cooldown: 60,
      area: 5,
      speed: 5,
      duration: 0,
      amount: 1,
      pierce: 0,
      hitCooldown: 10,
      knockback: 1,
      lifetime: 60,
    },
    levels: [
      { delta: { damage: 1 } },
      { delta: { damage: 1 } },
      { delta: { damage: 1 } },
      { delta: { damage: 1 } },
    ],
    damageType: "magic",
  };
}

const PACK: ContentPack = {
  id: "ability-slots",
  schemaVersion: 1,
  enemies: [],
  abilities: [ability("blade"), ability("nova"), ability("charm")],
  passives: [],
  characters: [
    {
      id: "mage",
      startingAbility: "blade",
      startingAbility2: "nova",
    },
  ],
  powerUps: [],
  synergies: [],
};

describe("unified ability loadout", () => {
  it("starts the champion with both real kit abilities in one pool", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: PACK }, 1);
    const abilities = world.stores.abilities;
    const defs = abilities
      .liveSlots()
      .map((slot) => world.content.abilities[abilities.field("defIndex")[slot]]);
    expect(defs.map((d) => d.id).sort()).toEqual(["blade", "nova"]);
  });

  it("offers any other ability as a learnable card in the same pool", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: PACK }, 1);
    world.partyXp = 100;
    step(world, []);
    const offer = world.pendingOffers()[0];
    const learned = offer.options.find((o) => o.ref.id === "charm");
    expect(learned).toBeTruthy();
    expect(learned?.level).toBeUndefined();

    const index = learned ? offer.options.indexOf(learned) : -1;
    expect(index).toBeGreaterThanOrEqual(0);
    applyChoice(world, 0, index);
    const abilities = world.stores.abilities;
    const owned = abilities.liveSlots().map((slot) => ({
      def: world.content.abilities[abilities.field("defIndex")[slot]],
      level: abilities.field("level")[slot],
    }));
    expect(owned.some((entry) => entry.def.id === "charm" && entry.level === 1)).toBe(true);
  });
});
