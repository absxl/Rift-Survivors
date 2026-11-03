// Pure snapshot → loadout helpers, shared by the HUD (kept Pixi-free for tests).
import type { StoreSnapshot } from "@rift/sim";

export interface LoadoutEntry {
  defIndex: number;
  level: number;
  cooldown: number;
}

/**
 * Entries owned by a player. Ability stores have a `cooldown` field; passive
 * stores do not, so it defaults to 0 instead of throwing on the missing field.
 */
export function ownedIndices(store: StoreSnapshot | undefined, playerId: number): LoadoutEntry[] {
  if (!store) return [];
  const cooldowns = store.fields.cooldown;
  const out: LoadoutEntry[] = [];
  for (let i = 0; i < store.slots.length; i++) {
    if (store.fields.owner[i] !== playerId) continue;
    out.push({
      defIndex: store.fields.defIndex[i],
      level: store.fields.level[i],
      cooldown: cooldowns ? cooldowns[i] : 0,
    });
  }
  return out;
}
