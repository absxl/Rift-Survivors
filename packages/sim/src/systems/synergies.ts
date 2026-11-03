// Synergy engine: re-evaluates the player's tag loadout and applies modifiers.
// Runs on loadout change (level-up), not every tick (docs/11).
import type { TagQuery } from "../content-types";
import type { ModifierStack } from "../modifiers";
import type { World } from "../world";

/** Re-evaluate each player's tag-count and combo synergies into their own stack. */
export function refreshSynergies(world: World): void {
  for (let p = 0; p < world.playerModifiers.length; p++) {
    const mods = world.playerModifiers[p];
    mods.removeSourcePrefix("synergy:");
    if (world.content.synergies.length > 0) {
      const tags = collectTags(world, p);
      for (const synergy of world.content.synergies) {
        const src = synergy.source;
        if (src.kind === "tagCount") {
          const count = tags.filter((t) => t === src.tag).length;
          let best: { count: number; mods: Record<string, number> } | null = null;
          for (const tier of src.tiers) {
            if (count >= tier.count && (!best || tier.count > best.count)) best = tier;
          }
          if (best) applyMods(mods, best.mods, synergy.id);
        } else if (src.requires.every((q) => matches(q, tags))) {
          applyMods(mods, src.mods, synergy.id);
        }
      }
    }
    world.syncPlayerMaxHp(p);
  }
}

function collectTags(world: World, playerId: number): string[] {
  const tags: string[] = [];
  const abilities = world.stores.abilities;
  abilities.forEachAlive((slot) => {
    if (abilities.field("owner")[slot] !== playerId) return;
    const def = world.content.abilities[abilities.field("defIndex")[slot]];
    if (def?.tags) tags.push(...def.tags);
  });
  const passives = world.stores.passives;
  passives.forEachAlive((slot) => {
    if (passives.field("owner")[slot] !== playerId) return;
    const def = world.content.passives[passives.field("defIndex")[slot]];
    if (def?.tags) tags.push(...def.tags);
  });
  const character = world.playerCharacters[playerId];
  if (character?.tags) tags.push(...character.tags);
  return tags;
}

function matches(query: TagQuery, tags: string[]): boolean {
  const allOk = (query.all ?? []).every((t) => tags.includes(t));
  const anyOk = !query.any || query.any.length === 0 || query.any.some((t) => tags.includes(t));
  return allOk && anyOk;
}

function applyMods(mods: ModifierStack, values: Record<string, number>, synergyId: string): void {
  for (const [key, value] of Object.entries(values)) {
    mods.add(key, { op: "add", value, source: `synergy:${synergyId}` });
  }
}
