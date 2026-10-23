// Rebuild the enemy spatial hash after enemies have moved, before any queries.
import type { Registries } from "../registry";
import type { World } from "../world";

export function registerSpatialHash(reg: Registries): void {
  reg.systems.register("spatial-hash", spatialHashSystem);
}

function spatialHashSystem(world: World): void {
  world.spatialHash.clear();
  const enemies = world.stores.enemies;
  enemies.forEachAlive((slot) => {
    world.spatialHash.insert(slot, enemies.field("x")[slot], enemies.field("y")[slot]);
  });
}
