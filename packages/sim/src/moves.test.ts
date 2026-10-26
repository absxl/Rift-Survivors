import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, applyChoice, createWorld, step } from "./index";
import type { ContentPack, WeaponDef } from "./index";

function weapon(id: string, isMove = false): WeaponDef {
  return {
    id,
    isMove,
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
  id: "moves",
  schemaVersion: 1,
  enemies: [],
  weapons: [weapon("blade"), weapon("nova", true), weapon("charm", true)],
  passives: [],
  characters: [
    {
      id: "mage",
      startingWeapon: "blade",
      startingMove: "nova",
    },
  ],
  powerUps: [],
  synergies: [],
};

describe("champion signature moves", () => {
  it("starts the champion with a weapon and a signature move in separate pools", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: PACK }, 1);
    const weapons = world.stores.weapons;
    const defs = weapons
      .liveSlots()
      .map((slot) => world.content.weapons[weapons.field("defIndex")[slot]]);
    expect(defs.map((d) => d.id).sort()).toEqual(["blade", "nova"]);
    expect(defs.find((d) => d.id === "nova")?.isMove).toBe(true);
  });

  it("offers another champion's move as a separate move card", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: PACK }, 1);
    world.partyXp = 100;
    step(world, []);
    const offer = world.pendingOffers()[0];
    const move = offer.options.find((o) => o.ref.id === "charm");
    expect(move).toBeTruthy();
    expect(move?.isMove).toBe(true);
    expect(move?.level).toBeUndefined();

    const index = move ? offer.options.indexOf(move) : -1;
    expect(index).toBeGreaterThanOrEqual(0);
    applyChoice(world, 0, index);
    const weapons = world.stores.weapons;
    const owned = weapons.liveSlots().map((slot) => ({
      def: world.content.weapons[weapons.field("defIndex")[slot]],
      level: weapons.field("level")[slot],
    }));
    expect(owned.some((entry) => entry.def.id === "charm" && entry.level === 1)).toBe(true);
  });
});
