// Content package: typed + validated game data. The engine references this only
// by id/behavior strings; names live here and in locale files.
import type { ContentPack } from "@rift/sim";
import { loadCorePack } from "./packs/core";
import { loadLolPack } from "./packs/lol";

export { contentPackSchema } from "./schema";
export { loadCorePack } from "./packs/core";
export type { ChampionSkinData, ObtainableSkin } from "./champions/skins.generated";
export { CHAMPION_SKINS } from "./champions/skins.generated";
export { loadLolPack } from "./packs/lol";
export {
  CHAMPION_CLASS_IDS,
  CLASSES,
  type ChampionClassId,
  type ClassDefinition,
} from "./champions/classes";
export const CONTENT_SCHEMA_VERSION = 1;

/** The combined pack the game runs: core (enemies + items) + lol (champions + abilities). */
export function loadGamePack(): ContentPack {
  const core = loadCorePack();
  const lol = loadLolPack();
  return {
    id: "game",
    schemaVersion: 1,
    enemies: [...core.enemies, ...lol.enemies],
    abilities: [...core.abilities, ...lol.abilities],
    passives: [...core.passives, ...lol.passives],
    characters: [...core.characters, ...lol.characters],
    powerUps: [...core.powerUps, ...lol.powerUps],
    synergies: [...core.synergies, ...lol.synergies],
    items: [...(core.items ?? []), ...(lol.items ?? [])],
    stages: [...(core.stages ?? []), ...(lol.stages ?? [])],
  };
}
