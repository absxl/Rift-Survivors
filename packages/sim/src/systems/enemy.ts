// Enemy lifecycle: steering (via registered behavior) + knockback/status decay,
// and death → gem drop (+ chest/pickup drops for elites and lucky kills).
import type { Registries } from "../registry";
import type { World } from "../world";
import {
  PICKUP_CHEST,
  PICKUP_FREEZE,
  PICKUP_GOLD,
  PICKUP_HEAL,
  PICKUP_NUKE,
  PICKUP_VACUUM,
  dropPickup,
} from "./pickups";

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
    // Status timers + burn damage-over-time.
    const slow = enemies.field("slowTicks")[slot];
    if (slow > 0) enemies.field("slowTicks")[slot] = slow - 1;
    const burn = enemies.field("burnTicks")[slot];
    if (burn > 0) {
      enemies.field("burnTicks")[slot] = burn - 1;
      enemies.field("hp")[slot] -= world.num("status.burnDps");
    }
    // Reaction: burn + slow = a "steam" burst.
    if (burn > 0 && slow > 0) {
      enemies.field("hp")[slot] -= world.num("status.reactionDamage");
    }
    const freeze = enemies.field("freezeTicks")[slot];
    if (freeze > 0) enemies.field("freezeTicks")[slot] = freeze - 1;

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

    if (def?.dropsChest) {
      dropPickup(world, x, y, PICKUP_CHEST);
    } else if (world.rng.chance(world.num("pickup.dropChance"))) {
      // Weighted: gold is the most common lucky drop so runs fund the shop.
      const kinds = [
        PICKUP_HEAL,
        PICKUP_HEAL,
        PICKUP_VACUUM,
        PICKUP_NUKE,
        PICKUP_FREEZE,
        PICKUP_GOLD,
        PICKUP_GOLD,
        PICKUP_GOLD,
      ];
      dropPickup(world, x, y, kinds[world.rng.int(0, kinds.length - 1)]);
    }

    if (def?.category === "final-threat") world.bossRush = true;

    const killer = enemies.field("lastHitBy")[slot];
    const players = world.stores.players;
    if (killer < players.count) players.field("kills")[killer] += 1;
    world.emit({ type: "enemy-died", slot, gen: enemies.gen(slot), x, y });
    enemies.free(slot);
  });
}
