// The `core` pack: generic first enemy + two weapons. Names are generic behavior
// ids; League-flavored names live in a later `lol-pack` (docs/06).
import type { ContentPack } from "@rift/sim";
import { contentPackSchema } from "../schema";

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
      maxLevel: 1,
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
      levels: [],
      damageType: "physical",
    },
    {
      id: "bolt",
      behavior: "shoot-nearest",
      params: {},
      maxLevel: 1,
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
      levels: [],
      damageType: "magic",
    },
  ],
};

/** Load and validate the core pack against its Zod schema. */
export function loadCorePack(): ContentPack {
  return contentPackSchema.parse(corePack);
}
