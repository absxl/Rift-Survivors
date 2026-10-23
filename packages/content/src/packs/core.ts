// The `core` pack: generic enemies, weapons, passives and a character. Names are
// generic behavior ids; League-flavored names live in a later `lol-pack` (docs/06).
import type { ContentPack, StatDelta } from "@rift/sim";
import { contentPackSchema } from "../schema";

function levels(deltas: StatDelta[]): { delta: StatDelta }[] {
  return deltas.map((delta) => ({ delta }));
}

const corePack: ContentPack = {
  id: "core",
  schemaVersion: 1,
  enemies: [
    {
      id: "chaser",
      category: "minion",
      hp: 10,
      damage: 5,
      moveSpeed: 0.6,
      radius: 6,
      xp: 1,
      behavior: "chase",
      params: {},
    },
  ],
  weapons: [
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
      levels: levels([
        { damage: 4 },
        { damage: 4 },
        { damage: 4, amount: 1 },
        { damage: 4 },
        { damage: 5, area: 8 },
        { damage: 6 },
        { damage: 8 },
      ]),
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
      levels: levels([
        { damage: 3 },
        { damage: 3 },
        { damage: 4, amount: 1 },
        { damage: 4 },
        { damage: 5 },
        { damage: 6 },
        { damage: 8 },
      ]),
      damageType: "magic",
    },
    {
      id: "aura",
      behavior: "aura",
      params: {},
      maxLevel: 8,
      base: {
        damage: 4,
        cooldown: 40,
        area: 40,
        speed: 0,
        duration: 0,
        amount: 1,
        pierce: 99,
        hitCooldown: 8,
        knockback: 1,
        lifetime: 0,
      },
      levels: levels([
        { damage: 2 },
        { damage: 2 },
        { damage: 2, area: 6 },
        { damage: 2 },
        { damage: 3 },
        { damage: 3 },
        { damage: 4 },
      ]),
      damageType: "magic",
    },
  ],
  passives: [
    { id: "might", maxLevel: 5, perLevel: { might: 0.2 } },
    { id: "boots", maxLevel: 5, perLevel: { moveSpeed: 0.1 } },
    { id: "heart", maxLevel: 5, perLevel: { maxHp: 0.25 } },
    { id: "magnet", maxLevel: 5, perLevel: { magnet: 0.5 } },
  ],
  characters: [{ id: "champion", startingWeapon: "blade" }],
};

/** Load and validate the core pack against its Zod schema. */
export function loadCorePack(): ContentPack {
  return contentPackSchema.parse(corePack);
}
