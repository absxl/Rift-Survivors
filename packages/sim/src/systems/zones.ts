// Damage zones (e.g. ground pools): tick damage to enemies inside, then expire.
import type { Registries } from "../registry";
import type { World } from "../world";

export function registerZoneSystem(reg: Registries): void {
  reg.systems.register("zones", zones);
}

function zones(world: World): void {
  const zones = world.stores.zones;
  const hitCooldown = world.num("weapon.zoneHitCooldown");

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

    world.enemiesInCircle(zx, zy, radius, (enemySlot) => {
      if (!world.canHit(enemySlot)) return;
      const dx = world.stores.enemies.field("x")[enemySlot] - zx;
      const dy = world.stores.enemies.field("y")[enemySlot] - zy;
      const dist = Math.hypot(dx, dy) || 1;
      world.applyHit(enemySlot, damage, dx / dist, dy / dist, 0, hitCooldown);
    });
  });
}
