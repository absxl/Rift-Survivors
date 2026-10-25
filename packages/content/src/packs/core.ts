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
    {
      id: "herald",
      category: "boss",
      hp: 200,
      damage: 15,
      moveSpeed: 0.35,
      radius: 14,
      xp: 50,
      behavior: "chase",
      params: {},
      dropsChest: true,
    },
    {
      id: "dragon",
      category: "boss",
      hp: 400,
      damage: 20,
      moveSpeed: 0.4,
      radius: 16,
      xp: 100,
      behavior: "chase",
      params: {},
      dropsChest: true,
    },
    {
      id: "baron",
      category: "boss",
      hp: 800,
      damage: 25,
      moveSpeed: 0.45,
      radius: 18,
      xp: 200,
      behavior: "chase",
      params: {},
      dropsChest: true,
    },
    {
      id: "void-threat",
      category: "final-threat",
      hp: 1000,
      damage: 30,
      moveSpeed: 1,
      radius: 20,
      xp: 500,
      behavior: "chase",
      params: {},
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
  powerUps: [
    { id: "power", stat: "might", perRank: 0.05, maxRank: 5, costs: [10, 20, 30, 40, 50] },
    { id: "vitality", stat: "maxHp", perRank: 0.1, maxRank: 5, costs: [10, 20, 30, 40, 50] },
    { id: "swiftness", stat: "moveSpeed", perRank: 0.05, maxRank: 5, costs: [10, 20, 30, 40, 50] },
    { id: "focus", stat: "cooldown", perRank: 0.05, maxRank: 5, costs: [15, 30, 45, 60, 75] },
    { id: "reach", stat: "area", perRank: 0.05, maxRank: 5, costs: [10, 20, 30, 40, 50] },
    { id: "attraction", stat: "magnet", perRank: 0.2, maxRank: 5, costs: [5, 10, 15, 20, 25] },
    { id: "plating", stat: "armor", perRank: 1, maxRank: 5, costs: [15, 30, 45, 60, 75] },
    { id: "fortune", stat: "luck", perRank: 0.1, maxRank: 5, costs: [20, 40, 60, 80, 100] },
  ],
  synergies: [],
};

/** Load and validate the core pack (enemies + items). */
export function loadCorePack(): ContentPack {
  return contentPackSchema.parse(corePack);
}
