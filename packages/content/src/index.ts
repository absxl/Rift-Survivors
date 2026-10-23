// Content package: typed + validated game data. The engine references this only
// by id/behavior strings; names live here and in locale files.
import type { ContentPack } from "@rift/sim";
import { loadCorePack } from "./packs/core";
import { loadLolPack } from "./packs/lol";

export { contentPackSchema } from "./schema";
export { loadCorePack } from "./packs/core";
export { loadLolPack } from "./packs/lol";
export const CONTENT_SCHEMA_VERSION = 1;

/** The combined pack the game runs: core (enemies + items) + lol (champions + abilities). */
export function loadGamePack(): ContentPack {
  const core = loadCorePack();
  const lol = loadLolPack();
  return {
    id: "game",
    schemaVersion: 1,
    enemies: [...core.enemies, ...lol.enemies],
    weapons: [...core.weapons, ...lol.weapons],
    passives: [...core.passives, ...lol.passives],
    characters: [...core.characters, ...lol.characters],
  };
}
