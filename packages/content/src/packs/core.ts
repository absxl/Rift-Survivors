// The `core` pack: generic enemies and passive items (stat sticks). Champions and
// ability weapons live in the `lol` pack. Names are generic; League flavor is data.
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
    {
      id: "brute",
      category: "elite",
      hp: 40,
      damage: 10,
      moveSpeed: 0.4,
      radius: 10,
      xp: 5,
      behavior: "chase",
      params: {},
      dropsChest: true,
    },
  ],
  weapons: [],
  passives: [
    { id: "might", maxLevel: 5, perLevel: { might: 0.2 } },
    { id: "boots", maxLevel: 5, perLevel: { moveSpeed: 0.1 } },
    { id: "heart", maxLevel: 5, perLevel: { maxHp: 0.25 } },
    { id: "magnet", maxLevel: 5, perLevel: { magnet: 0.5 } },
    { id: "scope", maxLevel: 5, perLevel: { area: 0.15 } },
    { id: "haste", maxLevel: 5, perLevel: { cooldown: 0.12 } },
    { id: "plate", maxLevel: 5, perLevel: { armor: 1 } },
    { id: "charm", maxLevel: 5, perLevel: { luck: 0.1 } },
  ],
  characters: [],
};

/** Load and validate the core pack (enemies + items). */
export function loadCorePack(): ContentPack {
  return contentPackSchema.parse(corePack);
}
