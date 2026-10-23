// Spawn director: spawns enemies in `ring`/`stream` patterns and recycles enemies
// that fall too far behind the player (keeps density near the action).
import type { Registries } from "../registry";
import type { World } from "../world";

export function registerSpawn(reg: Registries): void {
  reg.systems.register("spawn-director", spawnDirector);
}

function spawnDirector(world: World): void {
  if (world.content.enemies.length === 0) return;
  const enemies = world.stores.enemies;
  const players = world.stores.players;
  if (players.count === 0) return;
  const px = players.field("x")[0];
  const py = players.field("y")[0];

  let alive = 0;
  enemies.forEachAlive(() => alive++);

  const maxEnemies = world.num("director.maxEnemies");
  const interval = world.num("director.spawnInterval");
  if (world.tick % interval === 0 && alive < maxEnemies) {
    const batch = world.num("director.batchSize");
    const ring = (world.tick / interval) % 2 === 0;
    const def = world.content.enemies[0];
    for (let i = 0; i < batch && alive < maxEnemies; i++) {
      const slot = enemies.alloc();
      if (slot < 0) break;
      const angle = ring
        ? (i / batch) * Math.PI * 2 + world.rng.range(-0.3, 0.3)
        : world.rng.range(0, Math.PI * 2);
      const dist = ring ? world.rng.range(200, 240) : world.rng.range(160, 300);
      enemies.field("x")[slot] = px + Math.cos(angle) * dist;
      enemies.field("y")[slot] = py + Math.sin(angle) * dist;
      enemies.field("hp")[slot] = def.hp;
      enemies.field("kind")[slot] = 0;
      enemies.field("vx")[slot] = 0;
      enemies.field("vy")[slot] = 0;
      enemies.field("hitCooldown")[slot] = 0;
      alive++;
    }
  }

  // Recycle enemies that drifted far from the player.
  const recycleDist = world.num("director.recycleDistance");
  const recycleDist2 = recycleDist * recycleDist;
  enemies.forEachAlive((slot) => {
    const dx = enemies.field("x")[slot] - px;
    const dy = enemies.field("y")[slot] - py;
    if (dx * dx + dy * dy > recycleDist2) {
      const angle = world.rng.range(0, Math.PI * 2);
      const dist = world.rng.range(200, 240);
      enemies.field("x")[slot] = px + Math.cos(angle) * dist;
      enemies.field("y")[slot] = py + Math.sin(angle) * dist;
    }
  });
}
