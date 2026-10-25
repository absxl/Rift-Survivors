// Spawn director: minions in ring/stream patterns, elites, a boss schedule, the
// final threat, and a post-threat boss rush. Recycles enemies that drift away.
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

  // Regular minions (halt during the boss rush).
  const maxEnemies = world.num("director.maxEnemies");
  const interval = world.num("director.spawnInterval");
  if (!world.bossRush && world.tick % interval === 0 && alive < maxEnemies) {
    const rampTicks = world.num("director.rampTicks");
    const ramp = rampTicks > 0 ? Math.min(1, world.tick / rampTicks) : 1;
    const playerCount = world.stores.players.count;
    const playerScale =
      1 + Math.max(0, playerCount - 1) * world.num("director.enemyScalePerPlayer");
    const batch = Math.max(1, Math.round(world.num("director.batchSize") * ramp * playerScale));
    for (let i = 0; i < batch && alive < maxEnemies; i++) {
      if (spawnEnemy(world, 0) >= 0) alive++;
    }
  }

  // Elites (drop chests).
  const eliteInterval = world.num("director.eliteInterval");
  if (world.tick % eliteInterval === 0 && world.tick > 0) {
    const eliteIndex = world.content.enemies.findIndex((e) => e.category === "elite");
    if (eliteIndex >= 0) spawnEnemy(world, eliteIndex);
  }

  spawnBosses(world);

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

/** Spawn a single enemy near the player, scaling HP with elapsed time. */
function spawnEnemy(world: World, defIndex: number): number {
  const enemies = world.stores.enemies;
  const players = world.stores.players;
  const px = players.field("x")[0];
  const py = players.field("y")[0];
  const slot = enemies.alloc();
  if (slot < 0) return -1;

  const def = world.content.enemies[defIndex];
  const angle = world.rng.range(0, Math.PI * 2);
  const dist = world.rng.range(160, 300);
  enemies.field("x")[slot] = px + Math.cos(angle) * dist;
  enemies.field("y")[slot] = py + Math.sin(angle) * dist;

  const minutes = world.tick / (30 * 60);
  const playerCount = world.stores.players.count;
  const playerScale = 1 + Math.max(0, playerCount - 1) * world.num("director.hpScalePerPlayer");
  const scale = (1 + minutes * world.num("director.hpScalePerMin")) * playerScale;
  enemies.field("hp")[slot] = def.hp * scale;
  enemies.field("maxHp")[slot] = def.hp * scale;
  enemies.field("kind")[slot] = defIndex;
  enemies.field("vx")[slot] = 0;
  enemies.field("vy")[slot] = 0;
  enemies.field("hitCooldown")[slot] = 0;
  enemies.field("lastHitBy")[slot] = 0;
  return slot;
}

/** Boss schedule, final threat, and the post-threat boss rush. */
function spawnBosses(world: World): void {
  const bosses = world.content.enemies.filter((e) => e.category === "boss");
  const finalThreat = world.content.enemies.find((e) => e.category === "final-threat");

  // Final threat at the scheduled time (once).
  if (
    finalThreat &&
    !world.finalThreatSpawned &&
    world.tick >= world.num("timeline.finalThreatSec") * 30
  ) {
    world.finalThreatSpawned = true;
    spawnEnemy(world, world.content.enemies.indexOf(finalThreat));
  }

  if (world.bossRush) {
    const rushInterval = world.num("timeline.bossRushIntervalSec") * 30;
    if (world.tick % rushInterval === 0 && bosses.length > 0) {
      const idx = Math.floor(world.tick / rushInterval) % bosses.length;
      spawnEnemy(world, world.content.enemies.indexOf(bosses[idx]));
    }
    return;
  }

  const bossInterval = world.num("timeline.bossIntervalSec") * 30;
  if (bosses.length > 0 && bossInterval > 0 && world.tick % bossInterval === 0 && world.tick > 0) {
    const idx = Math.floor(world.tick / bossInterval) % bosses.length;
    spawnEnemy(world, world.content.enemies.indexOf(bosses[idx]));
  }
}
