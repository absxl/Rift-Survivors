// Synergy engine: re-evaluates the player's tag loadout and applies modifiers.
// Runs on loadout change (level-up), not every tick (docs/11).
import type { TagQuery } from "../content-types";
import type { World } from "../world";

/** Re-evaluate tag-count and combo synergies; reapply their modifiers. */
export function refreshSynergies(world: World): void {
  world.modifiers.removeSourcePrefix("synergy:");
  if (world.content.synergies.length === 0) return;

  const tags = collectTags(world, 0);

  for (const synergy of world.content.synergies) {
    const src = synergy.source;
    if (src.kind === "tagCount") {
      const count = tags.filter((t) => t === src.tag).length;
      let best: { count: number; mods: Record<string, number> } | null = null;
      for (const tier of src.tiers) {
        if (count >= tier.count && (!best || tier.count > best.count)) best = tier;
      }
      if (best) applyMods(world, best.mods, synergy.id);
    } else if (src.requires.every((q) => matches(q, tags))) {
      applyMods(world, src.mods, synergy.id);
    }
  }

  syncMaxHp(world);
}

function collectTags(world: World, playerId: number): string[] {
  const tags: string[] = [];
  const weapons = world.stores.weapons;
  weapons.forEachAlive((slot) => {
    if (weapons.field("owner")[slot] !== playerId) return;
    const def = world.content.weapons[weapons.field("defIndex")[slot]];
    if (def?.tags) tags.push(...def.tags);
  });
  const passives = world.stores.passives;
  passives.forEachAlive((slot) => {
    if (passives.field("owner")[slot] !== playerId) return;
    const def = world.content.passives[passives.field("defIndex")[slot]];
    if (def?.tags) tags.push(...def.tags);
  });
  if (world.character?.tags) tags.push(...world.character.tags);
  return tags;
}

function matches(query: TagQuery, tags: string[]): boolean {
  const allOk = (query.all ?? []).every((t) => tags.includes(t));
  const anyOk = !query.any || query.any.length === 0 || query.any.some((t) => tags.includes(t));
  return allOk && anyOk;
}

function applyMods(world: World, mods: Record<string, number>, synergyId: string): void {
  for (const [key, value] of Object.entries(mods)) {
    world.modifiers.add(key, { op: "add", value, source: `synergy:${synergyId}` });
  }
}

function syncMaxHp(world: World): void {
  const players = world.stores.players;
  players.forEachAlive((slot) => {
    const oldMax = players.field("maxHp")[slot];
    const newMax = 100 * world.stat("maxHp", 1);
    players.field("maxHp")[slot] = newMax;
    if (newMax > oldMax) {
      players.field("hp")[slot] = Math.min(newMax, players.field("hp")[slot] + (newMax - oldMax));
    }
  });
}
