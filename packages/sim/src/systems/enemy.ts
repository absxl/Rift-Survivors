// Enemy lifecycle: steering (via registered behavior) + knockback decay, and
// death → gem drop + free.
import type { Registries } from "../registry";
import type { World } from "../world";

export function registerEnemySystems(reg: Registries): void {
  reg.systems.register("enemy-ai", enemyAi);
  reg.systems.register("deaths", deaths);
}

function enemyAi(world: World): void {
  const enemies = world.stores.enemies;
  enemies.forEachAlive((slot) => {
    // Decay knockback impulse.
    enemies.field("vx")[slot] *= 0.85;
    enemies.field("vy")[slot] *= 0.85;
    // Decrement per-enemy hit cooldown.
    const hc = enemies.field("hitCooldown")[slot];
    if (hc > 0) enemies.field("hitCooldown")[slot] = hc - 1;

    const def = world.content.enemies[enemies.field("kind")[slot]];
    if (!def) return;
    world.registries.enemyBehaviors.get(def.behavior)(world, slot, def);

    // Apply (already-decayed) knockback impulse on top of steering.
    enemies.field("x")[slot] += enemies.field("vx")[slot];
    enemies.field("y")[slot] += enemies.field("vy")[slot];
  });
}

function deaths(world: World): void {
  const enemies = world.stores.enemies;
  const gems = world.stores.gems;
  enemies.forEachAlive((slot) => {
    if (enemies.field("hp")[slot] > 0) return;
    const def = world.content.enemies[enemies.field("kind")[slot]];
    const x = enemies.field("x")[slot];
    const y = enemies.field("y")[slot];
    const gemSlot = gems.alloc();
    if (gemSlot >= 0) {
      gems.field("x")[gemSlot] = x;
      gems.field("y")[gemSlot] = y;
      gems.field("value")[gemSlot] = def ? def.xp : 1;
    }
    world.emit({ type: "enemy-died", slot, gen: enemies.gen(slot), x, y });
    enemies.free(slot);
  });
}
