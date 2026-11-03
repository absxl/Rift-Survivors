// Spawn director: weighted minions in ring/stream/swarm/wall patterns, elites,
// a boss schedule, the final threat, and a post-threat boss rush. Recycles
// enemies that drift away from the nearest player.
import type { Registries } from "../registry";
import type { World } from "../world";
import { assignEnemyAbilities } from "./enemy-abilities";

const PATTERNS = ["ring", "stream", "swarm", "wall"] as const;
type SpawnPattern = (typeof PATTERNS)[number];

export function registerSpawn(reg: Registries): void {
  reg.systems.register("spawn-director", spawnDirector);
}

interface Point {
  x: number;
  y: number;
}

function spawnDirector(world: World): void {
  if (world.content.enemies.length === 0) return;
  const enemies = world.stores.enemies;
  const players = world.stores.players;
  if (players.count === 0) return;

  let alive = 0;
  enemies.forEachAlive(() => alive++);

  // Regular minions (halt during the boss rush).
  const maxEnemies = world.num("director.maxEnemies");
  const interval = world.num("director.spawnInterval");
  if (!world.bossRush && world.tick % interval === 0 && alive < maxEnemies) {
    const rampTicks = world.num("director.rampTicks");
    const ramp = rampTicks > 0 ? Math.min(1, world.tick / rampTicks) : 1;
    const playerCount = players.count;
    const playerScale =
      1 + Math.max(0, playerCount - 1) * world.num("director.enemyScalePerPlayer");
    const batch = Math.max(1, Math.round(world.num("director.batchSize") * ramp * playerScale));
    const center = pickSpawnCenter(world) ?? {
      x: players.field("x")[0],
      y: players.field("y")[0],
    };
    const pattern = pickPattern(world);
    const baseAngle = world.rng.range(0, Math.PI * 2);

    for (let i = 0; i < batch && alive < maxEnemies; i++) {
      const defIndex = pickMinion(world);
      if (defIndex < 0) break;
      const def = world.content.enemies[defIndex];
      const point = patternPoint(world, pattern, center, i, batch, baseAngle);
      let x = point.x;
      let y = point.y;
      if (def && !world.enemyLevitates(def)) {
        const free = world.terrain.findFreeNear(x, y, Math.max(5, def.radius));
        if (!free) continue;
        x = free.x;
        y = free.y;
      }
      if (spawnEnemyAt(world, defIndex, x, y) >= 0) alive++;
    }
  }

  // Elites (can drop keys).
  const eliteInterval = world.num("director.eliteInterval");
  if (world.tick % eliteInterval === 0 && world.tick > 0) {
    const eliteIndex = pickElite(world);
    if (eliteIndex >= 0) spawnEnemy(world, eliteIndex);
  }

  spawnBosses(world);

  // Recycle enemies that drifted far from their nearest player.
  const recycleDist = world.num("director.recycleDistance");
  const recycleDist2 = recycleDist * recycleDist;
  enemies.forEachAlive((slot) => {
    const ex = enemies.field("x")[slot];
    const ey = enemies.field("y")[slot];
    let nearestX = players.field("x")[0];
    let nearestY = players.field("y")[0];
    let bestD2 = Number.POSITIVE_INFINITY;
    players.forEachAlive((p) => {
      if (players.field("downed")[p]) return;
      const dx = players.field("x")[p] - ex;
      const dy = players.field("y")[p] - ey;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        nearestX = players.field("x")[p];
        nearestY = players.field("y")[p];
      }
    });
    if (bestD2 > recycleDist2) {
      const angle = world.rng.range(0, Math.PI * 2);
      const dist = world.rng.range(200, 240);
      enemies.field("x")[slot] = nearestX + Math.cos(angle) * dist;
      enemies.field("y")[slot] = nearestY + Math.sin(angle) * dist;
    }
  });
}

/** Pick a random alive player as the wave center (deterministic per seed). */
function pickSpawnCenter(world: World): Point | null {
  const players = world.stores.players;
  const alive: number[] = [];
  players.forEachAlive((p) => {
    if (!players.field("downed")[p]) alive.push(p);
  });
  if (alive.length === 0) return null;
  const slot = alive[world.rng.int(0, alive.length - 1)];
  return { x: players.field("x")[slot], y: players.field("y")[slot] };
}

/** Patterns rotate on a fixed interval (no extra state needed). */
function pickPattern(world: World): SpawnPattern {
  const interval = Math.max(1, Math.floor(world.num("director.patternInterval")));
  return PATTERNS[Math.floor(world.tick / interval) % PATTERNS.length];
}

function patternPoint(
  world: World,
  pattern: SpawnPattern,
  center: Point,
  index: number,
  batch: number,
  baseAngle: number,
): Point {
  const dirX = Math.cos(baseAngle);
  const dirY = Math.sin(baseAngle);
  const perpX = -dirY;
  const perpY = dirX;

  if (pattern === "ring") {
    const angle = baseAngle + (index / Math.max(1, batch)) * Math.PI * 2;
    const dist = world.rng.range(200, 280);
    return { x: center.x + Math.cos(angle) * dist, y: center.y + Math.sin(angle) * dist };
  }
  if (pattern === "stream") {
    const dist = 220 + index * 22 + world.rng.range(-8, 8);
    const lateral = world.rng.range(-12, 12);
    return {
      x: center.x + dirX * dist + perpX * lateral,
      y: center.y + dirY * dist + perpY * lateral,
    };
  }
  if (pattern === "swarm") {
    const angle = baseAngle + world.rng.range(-0.35, 0.35);
    const dist = world.rng.range(170, 240);
    return { x: center.x + Math.cos(angle) * dist, y: center.y + Math.sin(angle) * dist };
  }

  // wall: a perpendicular line at a fixed distance.
  const offset = (index - (batch - 1) / 2) * 26 + world.rng.range(-4, 4);
  const dist = 260 + world.rng.range(-10, 10);
  return {
    x: center.x + dirX * dist + perpX * offset,
    y: center.y + dirY * dist + perpY * offset,
  };
}

/** Weighted minion pick, gated by its minute window. */
function pickMinion(world: World): number {
  const minutes = world.tick / (30 * 60);
  const eligible: { index: number; weight: number }[] = [];
  world.content.enemies.forEach((def, index) => {
    if (def.category !== "minion") return;
    if (!world.stageAllowsEnemy(def.id)) return;
    if (minutes < (def.minMinute ?? 0)) return;
    if (def.maxMinute !== undefined && minutes > def.maxMinute) return;
    const weight = Math.max(0, def.spawnWeight ?? 1);
    if (weight > 0) eligible.push({ index, weight });
  });
  if (eligible.length === 0) {
    return world.content.enemies.findIndex(
      (e) => e.category === "minion" && world.stageAllowsEnemy(e.id),
    );
  }
  let total = 0;
  for (const entry of eligible) total += entry.weight;
  let roll = world.rng.range(0, total);
  for (const entry of eligible) {
    roll -= entry.weight;
    if (roll <= 0) return entry.index;
  }
  return eligible[eligible.length - 1].index;
}

/** Weighted elite pick, gated by its minute window (-1 if none). */
function pickElite(world: World): number {
  const minutes = world.tick / (30 * 60);
  const eligible: { index: number; weight: number }[] = [];
  world.content.enemies.forEach((def, index) => {
    if (def.category !== "elite") return;
    if (!world.stageAllowsEnemy(def.id)) return;
    if (minutes < (def.minMinute ?? 0)) return;
    if (def.maxMinute !== undefined && minutes > def.maxMinute) return;
    const weight = Math.max(0, def.spawnWeight ?? 1);
    if (weight > 0) eligible.push({ index, weight });
  });
  if (eligible.length === 0) return -1;
  let total = 0;
  for (const entry of eligible) total += entry.weight;
  let roll = world.rng.range(0, total);
  for (const entry of eligible) {
    roll -= entry.weight;
    if (roll <= 0) return entry.index;
  }
  return eligible[eligible.length - 1].index;
}

/** Spawn one enemy at an exact position, scaling HP with elapsed time. */
export function spawnEnemyAt(world: World, defIndex: number, x: number, y: number): number {
  const def = world.content.enemies[defIndex];
  if (!def) return -1;
  const enemies = world.stores.enemies;
  const slot = enemies.alloc();
  if (slot < 0) return -1;

  enemies.field("x")[slot] = x;
  enemies.field("y")[slot] = y;

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
  enemies.field("slowTicks")[slot] = 0;
  enemies.field("burnTicks")[slot] = 0;
  enemies.field("freezeTicks")[slot] = 0;
  enemies.field("lastHitBy")[slot] = 0;
  enemies.field("shield")[slot] = 0;
  enemies.field("fuseTicks")[slot] = 0;
  assignEnemyAbilities(world, slot, def);
  return slot;
}

/** Spawn one enemy at a random ring position around a random alive player. */
function spawnEnemy(world: World, defIndex: number): number {
  const def = world.content.enemies[defIndex];
  const center = pickSpawnCenter(world);
  if (!center || !def) return -1;
  for (let attempt = 0; attempt < 10; attempt++) {
    const angle = world.rng.range(0, Math.PI * 2);
    const dist = world.rng.range(160, 300);
    let x = center.x + Math.cos(angle) * dist;
    let y = center.y + Math.sin(angle) * dist;
    if (!world.enemyLevitates(def)) {
      const free = world.terrain.findFreeNear(x, y, Math.max(5, def.radius));
      if (!free) continue;
      x = free.x;
      y = free.y;
    }
    return spawnEnemyAt(world, defIndex, x, y);
  }
  return -1;
}

/** Boss schedule, final threat, and the post-threat boss rush. */
function spawnBosses(world: World): void {
  const bosses = world.content.enemies.filter(
    (e) => e.category === "boss" && world.stageAllowsEnemy(e.id),
  );
  const finalThreat = world.stage?.finalThreatId
    ? world.content.enemies.find((e) => e.id === world.stage?.finalThreatId)
    : world.content.enemies.find((e) => e.category === "final-threat");

  // Final threat at the scheduled time (once).
  if (
    finalThreat &&
    !world.finalThreatSpawned &&
    world.tick >= world.num("timeline.finalThreatSec") * 30
  ) {
    world.finalThreatSpawned = true;
    world.finalThreatTick = world.tick;
    spawnEnemy(world, world.content.enemies.indexOf(finalThreat));
  }

  // Safety net: if the final threat is still alive after the fallback window,
  // start the boss rush anyway so the 30-minute arc always reaches its endgame.
  if (
    !world.bossRush &&
    world.finalThreatSpawned &&
    world.finalThreatTick >= 0 &&
    world.tick - world.finalThreatTick >= world.num("timeline.bossRushFallbackSec") * 30
  ) {
    world.bossRush = true;
    world.emit({ type: "boss-rush", reason: "timeout" });
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
