// Damage zones: ground pools tick contact damage; turrets (kind 1) fire player
// projectiles at the nearest enemy on a cadence. Both expire by lifetime.
import type { Registries } from "../registry";
import type { World } from "../world";

export function registerZoneSystem(reg: Registries): void {
  reg.systems.register("zones", zones);
}

function zones(world: World): void {
  const zones = world.stores.zones;
  const hitCooldown = world.num("ability.zoneHitCooldown");
  const turretFireEvery = Math.max(1, Math.floor(world.num("ability.turretFireEvery")));

  zones.forEachAlive((slot) => {
    const life = zones.field("lifetime")[slot] - 1;
    zones.field("lifetime")[slot] = life;
    if (life <= 0) {
      zones.free(slot);
      return;
    }

    const zx = zones.field("x")[slot];
    const zy = zones.field("y")[slot];
    const radius = zones.field("radius")[slot];
    const damage = zones.field("damage")[slot];
    const owner = zones.field("owner")[slot];

    if (zones.field("kind")[slot] === 1) {
      fireTurret(world, slot, turretFireEvery);
      return;
    }

    world.damageBushesInCircle(zx, zy, radius, damage, owner);
    world.enemiesInCircle(zx, zy, radius, (enemySlot) => {
      if (!world.canHit(enemySlot)) return;
      const dx = world.stores.enemies.field("x")[enemySlot] - zx;
      const dy = world.stores.enemies.field("y")[enemySlot] - zy;
      const dist = Math.hypot(dx, dy) || 1;
      world.applyHit(enemySlot, damage, dx / dist, dy / dist, 0, hitCooldown, owner);
    });
  });
}

/** Turrets shoot a straight player projectile at the nearest enemy in range. */
function fireTurret(world: World, slot: number, fireEvery: number): void {
  const zones = world.stores.zones;
  const zx = zones.field("x")[slot];
  const zy = zones.field("y")[slot];
  const range = zones.field("radius")[slot];
  // Slot-staggered cadence keeps volleys of turrets from firing in lockstep.
  if ((world.tick + slot * 7) % fireEvery !== 0) return;

  // Nearest enemy within the turret's range (deterministic slot order).
  let best = -1;
  let bestD2 = range * range;
  world.enemiesInCircle(zx, zy, range, (enemySlot) => {
    const ex = world.stores.enemies.field("x")[enemySlot] - zx;
    const ey = world.stores.enemies.field("y")[enemySlot] - zy;
    const d2 = ex * ex + ey * ey;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = enemySlot;
    }
  });
  if (best < 0) return;

  const enemies = world.stores.enemies;
  const dx = enemies.field("x")[best] - zx;
  const dy = enemies.field("y")[best] - zy;
  const dist = Math.hypot(dx, dy) || 1;
  const proj = world.stores.projectiles.alloc();
  if (proj < 0) return;
  const p = world.stores.projectiles;
  p.field("x")[proj] = zx;
  p.field("y")[proj] = zy;
  p.field("vx")[proj] = (dx / dist) * 5;
  p.field("vy")[proj] = (dy / dist) * 5;
  p.field("damage")[proj] = zones.field("damage")[slot];
  p.field("pierce")[proj] = 0;
  p.field("hitCooldown")[proj] = 10;
  p.field("knockback")[proj] = 0;
  p.field("lifetime")[proj] = 60;
  p.field("owner")[proj] = zones.field("owner")[slot];
  p.field("mode")[proj] = 0;
  world.emit({ type: "turret-shot", x: zx, y: zy });
}
