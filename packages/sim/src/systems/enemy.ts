// Enemy lifecycle: steering (via registered behavior) + knockback/status decay,
// and death → gem drop (+ chest/pickup drops for elites and lucky kills).
import type { Registries } from "../registry";
import type { World } from "../world";
import { damagePlayer } from "./combat";
import {
  PICKUP_ESSENCE,
  PICKUP_FREEZE,
  PICKUP_GOLD,
  PICKUP_HEAL,
  PICKUP_KEY,
  PICKUP_MAGNET,
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

    if (!world.enemyLevitates(def)) {
      const resolved = world.terrain.collide(
        enemies.field("x")[slot],
        enemies.field("y")[slot],
        Math.max(5, def.radius * 0.9),
      );
      enemies.field("x")[slot] = resolved.x;
      enemies.field("y")[slot] = resolved.y;
      const danger = world.terrain.liquidDamageAt(
        enemies.field("x")[slot],
        enemies.field("y")[slot],
        false,
      );
      if (danger > 0 && world.tick > 0 && world.tick % 30 === 0) {
        world.applyHit(slot, danger, 0, 0, 0, 0, -1);
      }
    }
  });
}

function deaths(world: World): void {
  const enemies = world.stores.enemies;
  const gems = world.stores.gems;
  const players = world.stores.players;
  enemies.forEachAlive((slot) => {
    if (enemies.field("hp")[slot] > 0) return;
    const def = world.content.enemies[enemies.field("kind")[slot]];
    const x = enemies.field("x")[slot];
    const y = enemies.field("y")[slot];

    const killer = enemies.field("lastHitBy")[slot];
    const killerValid = killer >= 0 && killer < players.count;
    const luck = killerValid ? world.playerStat(killer, "luck", 0) : 0;
    const luckMult = 1 + Math.max(0, luck);

    const gemSlot = gems.alloc();
    if (gemSlot >= 0) {
      gems.field("x")[gemSlot] = x;
      gems.field("y")[gemSlot] = y;
      gems.field("value")[gemSlot] = def ? def.xp : 1;
    }

    const isElite = def?.category === "elite";
    const isBoss = def?.category === "boss" || def?.category === "final-threat";
    if (isElite) {
      // Elites always pay gold; their key is a luck-scaled 50% roll.
      dropPickup(world, x, y, PICKUP_GOLD, world.num("pickup.eliteGold"));
      if (killerValid) players.field("elitesKilled")[killer] += 1;
      const chance = Math.min(1, (def?.keyChance ?? 0.5) * luckMult);
      if (chance > 0 && world.rng.chance(chance)) {
        dropPickup(world, x, y, PICKUP_KEY);
      }
    } else if (isBoss) {
      // Bosses/final threats guarantee a key and a luck-scaled gold drop.
      dropPickup(world, x, y, PICKUP_GOLD, Math.round(world.num("pickup.bossGold") * luckMult));
      dropPickup(world, x, y, PICKUP_KEY);
      // Blue Essence: bosses are the only source (D-055). Final threats pay 4x.
      const essenceAmount =
        def.category === "final-threat" ? 10 + world.rng.int(0, 2) : 2 + world.rng.int(0, 1);
      for (let e = 0; e < essenceAmount; e++) {
        dropPickup(world, x, y, PICKUP_ESSENCE, 1);
      }
      if (killerValid) players.field("bossesKilled")[killer] += 1;
    } else {
      // Minions: independent gold rolls, plus consumables and a rare nuke.
      if (world.rng.chance(Math.min(1, world.num("pickup.goldDropChance") * luckMult))) {
        dropPickup(world, x, y, PICKUP_GOLD);
      }
      if (world.rng.chance(world.num("pickup.dropChance"))) {
        const kinds = [PICKUP_HEAL, PICKUP_HEAL, PICKUP_VACUUM, PICKUP_FREEZE, PICKUP_MAGNET];
        dropPickup(world, x, y, kinds[world.rng.int(0, kinds.length - 1)]);
      }
      if (world.rng.chance(world.num("pickup.nukeDropChance"))) {
        dropPickup(world, x, y, PICKUP_NUKE);
      }
    }

    // Exploder: burst on death (players only, i-frame aware).
    const explodeRadius =
      def && typeof def.params.explodeRadius === "number" ? def.params.explodeRadius : 0;
    if (def && explodeRadius > 0) {
      const explodeDamage =
        typeof def.params.explodeDamage === "number" ? def.params.explodeDamage : def.damage;
      const r2 = explodeRadius * explodeRadius;
      players.forEachAlive((p) => {
        if (players.field("downed")[p] || players.field("iFrames")[p] > 0) return;
        const dx = players.field("x")[p] - x;
        const dy = players.field("y")[p] - y;
        if (dx * dx + dy * dy <= r2) {
          damagePlayer(world, p, world.enemyDamage(explodeDamage), x, y, "explosion");
        }
      });
      world.emit({ type: "explosion", x, y, radius: explodeRadius });
    }

    if (def?.category === "final-threat" && !world.bossRush) {
      world.bossRush = true;
      world.emit({ type: "boss-rush", reason: "killed" });
    }

    if (killerValid) players.field("kills")[killer] += 1;
    world.emit({ type: "enemy-died", slot, gen: enemies.gen(slot), x, y });
    enemies.free(slot);
  });
}
