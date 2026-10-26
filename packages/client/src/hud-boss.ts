// Pure boss-bar target selection for the HUD overlay (Pixi-free for tests).
import type { EnemyDef, WorldSnapshot } from "@rift/sim";

export interface BossBarTarget {
  name: string;
  hp: number;
  maxHp: number;
  final: boolean;
}

/** Nearest alive boss/final threat to the local player, or null. */
export function pickBossBar(
  snapshot: WorldSnapshot,
  enemies: EnemyDef[],
  localPlayerId: number,
): BossBarTarget | null {
  const playerStore = snapshot.stores.find((s) => s.kind === "player");
  const enemyStore = snapshot.stores.find((s) => s.kind === "enemy");
  if (!enemyStore) return null;

  let px = 0;
  let py = 0;
  if (playerStore && playerStore.slots.length > 0) {
    const idx = playerStore.slots.indexOf(localPlayerId);
    const at = idx >= 0 ? idx : 0;
    px = playerStore.fields.x[at] ?? 0;
    py = playerStore.fields.y[at] ?? 0;
  }

  let best: BossBarTarget | null = null;
  let bestD2 = Number.POSITIVE_INFINITY;
  for (let i = 0; i < enemyStore.slots.length; i++) {
    const def = enemies[enemyStore.fields.kind[i]];
    if (!def) continue;
    if (def.category !== "boss" && def.category !== "final-threat") continue;
    const dx = (enemyStore.fields.x[i] ?? 0) - px;
    const dy = (enemyStore.fields.y[i] ?? 0) - py;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = {
        name: def.id.toUpperCase(),
        hp: enemyStore.fields.hp[i] ?? 0,
        maxHp: enemyStore.fields.maxHp[i] ?? 1,
        final: def.category === "final-threat",
      };
    }
  }
  return best;
}
