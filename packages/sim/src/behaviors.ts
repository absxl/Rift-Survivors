// Generic enemy + weapon behaviors, matched by id from content data.
import type { EnemyDef, WeaponDef } from "./content-types";
import type { Registries } from "./registry";
import type { World } from "./world";

export function registerEnemyBehaviors(reg: Registries): void {
  reg.enemyBehaviors.register("chase", chase);
  reg.enemyBehaviors.register("weaver", weaver);
  reg.enemyBehaviors.register("charge", charge);
  reg.enemyBehaviors.register("ranged", ranged);
}

function numParam(def: EnemyDef, key: string, fallback: number): number {
  const value = def.params[key];
  return typeof value === "number" ? value : fallback;
}

interface PlayerTarget {
  slot: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  dist: number;
}

/** Nearest non-downed player relative to (x, y), or null. */
function nearestPlayer(world: World, x: number, y: number): PlayerTarget | null {
  const players = world.stores.players;
  let best: PlayerTarget | null = null;
  let bestD2 = Number.POSITIVE_INFINITY;
  players.forEachAlive((p) => {
    if (players.field("downed")[p]) return;
    const dx = players.field("x")[p] - x;
    const dy = players.field("y")[p] - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = {
        slot: p,
        x: players.field("x")[p],
        y: players.field("y")[p],
        dx,
        dy,
        dist: Math.sqrt(d2),
      };
    }
  });
  return best;
}

function moveToward(world: World, slot: number, target: PlayerTarget, speed: number): void {
  if (target.dist < 0.001) return;
  const enemies = world.stores.enemies;
  enemies.field("x")[slot] += (target.dx / target.dist) * speed;
  enemies.field("y")[slot] += (target.dy / target.dist) * speed;
}

/** Straight chase, slowed by the slow status. */
function chase(world: World, slot: number, def: EnemyDef): void {
  const enemies = world.stores.enemies;
  if (enemies.field("freezeTicks")[slot] > 0) return;
  const target = nearestPlayer(world, enemies.field("x")[slot], enemies.field("y")[slot]);
  if (!target) return;
  const slow = enemies.field("slowTicks")[slot] > 0 ? 0.5 : 1;
  moveToward(world, slot, target, def.moveSpeed * slow);
}

/** Chase with a lateral sine weave (harder to hit / less predictable). */
function weaver(world: World, slot: number, def: EnemyDef): void {
  const enemies = world.stores.enemies;
  if (enemies.field("freezeTicks")[slot] > 0) return;
  const ex = enemies.field("x")[slot];
  const ey = enemies.field("y")[slot];
  const target = nearestPlayer(world, ex, ey);
  if (!target || target.dist < 0.001) return;

  const slow = enemies.field("slowTicks")[slot] > 0 ? 0.5 : 1;
  const frequency = numParam(def, "frequency", 0.07);
  const amplitude = numParam(def, "amplitude", 0.8);
  const wave = Math.sin((world.tick + slot * 23) * frequency) * amplitude;
  const nx = target.dx / target.dist;
  const ny = target.dy / target.dist;
  const dx = nx - ny * wave;
  const dy = ny + nx * wave;
  const len = Math.hypot(dx, dy) || 1;
  const speed = def.moveSpeed * slow;
  enemies.field("x")[slot] += (dx / len) * speed;
  enemies.field("y")[slot] += (dy / len) * speed;
}

/** Slow drift, then a fast dash toward the player on a fixed cycle. */
function charge(world: World, slot: number, def: EnemyDef): void {
  const enemies = world.stores.enemies;
  if (enemies.field("freezeTicks")[slot] > 0) return;
  const target = nearestPlayer(world, enemies.field("x")[slot], enemies.field("y")[slot]);
  if (!target) return;

  const period = Math.max(1, Math.floor(numParam(def, "period", 110)));
  const dashTicks = Math.min(period, Math.max(1, Math.floor(numParam(def, "dashTicks", 16))));
  const dashSpeed = numParam(def, "dashSpeed", 2.3);
  const phase = (((world.tick + slot * 31) % period) + period) % period;
  const slow = enemies.field("slowTicks")[slot] > 0 ? 0.5 : 1;
  const speed = (phase < dashTicks ? dashSpeed : def.moveSpeed) * slow;
  moveToward(world, slot, target, speed);
}

/** Keep distance and fire hostile projectiles on a fixed cadence. */
function ranged(world: World, slot: number, def: EnemyDef): void {
  const enemies = world.stores.enemies;
  if (enemies.field("freezeTicks")[slot] > 0) return;
  const ex = enemies.field("x")[slot];
  const ey = enemies.field("y")[slot];
  const target = nearestPlayer(world, ex, ey);
  if (!target) return;

  const slow = enemies.field("slowTicks")[slot] > 0 ? 0.5 : 1;
  const preferred = numParam(def, "preferredRange", 180);
  if (target.dist > preferred + 20) {
    moveToward(world, slot, target, def.moveSpeed * slow);
  } else if (target.dist < preferred - 30 && target.dist > 0.001) {
    const speed = def.moveSpeed * slow * 0.7;
    enemies.field("x")[slot] -= (target.dx / target.dist) * speed;
    enemies.field("y")[slot] -= (target.dy / target.dist) * speed;
  }

  const period = Math.max(1, Math.floor(numParam(def, "period", 90)));
  const range = numParam(def, "range", 280);
  if (target.dist > range) return;
  if ((((world.tick + slot * 7) % period) + period) % period !== 0) return;
  if (target.dist < 0.001) return;

  spawnHostileProjectile(
    world,
    ex,
    ey,
    target.dx / target.dist,
    target.dy / target.dist,
    numParam(def, "damage", def.damage),
    numParam(def, "speed", 3.4),
    Math.max(1, Math.floor(numParam(def, "lifetime", 120))),
  );
}

/** Allocate a straight hostile projectile (mode 5, owner 255). */
function spawnHostileProjectile(
  world: World,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  damage: number,
  speed: number,
  lifetime: number,
): void {
  const proj = world.stores.projectiles.alloc();
  if (proj < 0) return;
  const p = world.stores.projectiles;
  p.field("x")[proj] = x + dirX * 8;
  p.field("y")[proj] = y + dirY * 8;
  p.field("vx")[proj] = dirX * speed;
  p.field("vy")[proj] = dirY * speed;
  p.field("damage")[proj] = damage;
  p.field("pierce")[proj] = 0;
  p.field("hitCooldown")[proj] = 0;
  p.field("knockback")[proj] = 0;
  p.field("lifetime")[proj] = lifetime;
  p.field("owner")[proj] = 255;
  p.field("mode")[proj] = 5;
}

export function registerWeaponBehaviors(reg: Registries): void {
  reg.weaponBehaviors.register("sweep", sweep);
  reg.weaponBehaviors.register("shoot-nearest", shootNearest);
  reg.weaponBehaviors.register("aura", aura);
  reg.weaponBehaviors.register("strike-random", strikeRandom);
  reg.weaponBehaviors.register("ground-pool", groundPool);
  reg.weaponBehaviors.register("orbit", orbit);
  reg.weaponBehaviors.register("bounce", bounce);
  reg.weaponBehaviors.register("boomerang", boomerang);
}

/** Melee arc in the facing direction (instant, hits all enemies in the cone). */
function sweep(world: World, weaponSlot: number, def: WeaponDef): void {
  const weapons = world.stores.weapons;
  const owner = weapons.field("owner")[weaponSlot];
  const players = world.stores.players;
  const px = players.field("x")[owner];
  const py = players.field("y")[owner];
  const facingAngle = Math.atan2(players.field("facingY")[owner], players.field("facingX")[owner]);
  const arc = typeof def.params.arc === "number" ? def.params.arc : 1.2;
  const level = weapons.field("level")[weaponSlot];
  const range = world.weaponArea(def, level, owner);
  const damage = world.weaponDamage(def, level, owner);

  world.emit({ type: "weapon-fire", playerId: owner, weaponId: weaponSlot });

  world.enemiesInCircle(px, py, range, (slot) => {
    const ex = world.stores.enemies.field("x")[slot];
    const ey = world.stores.enemies.field("y")[slot];
    let diff = Math.abs(Math.atan2(ey - py, ex - px) - facingAngle);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff > arc / 2) return;
    if (!world.canHit(slot)) return;
    const dx = ex - px;
    const dy = ey - py;
    const dist = Math.hypot(dx, dy) || 1;
    world.applyHit(
      slot,
      damage,
      dx / dist,
      dy / dist,
      def.base.knockback,
      def.base.hitCooldown,
      owner,
    );
    if (def.status) world.applyStatus(slot, def.status);
  });
}

/** Fire a projectile at the nearest enemy (or facing direction if none). */
function shootNearest(world: World, weaponSlot: number, def: WeaponDef): void {
  const owner = world.stores.weapons.field("owner")[weaponSlot];
  const players = world.stores.players;
  const px = players.field("x")[owner];
  const py = players.field("y")[owner];

  let dirX: number;
  let dirY: number;
  const target = world.nearestEnemy(px, py, 400);
  if (target >= 0) {
    const dx = world.stores.enemies.field("x")[target] - px;
    const dy = world.stores.enemies.field("y")[target] - py;
    const d = Math.hypot(dx, dy) || 1;
    dirX = dx / d;
    dirY = dy / d;
  } else {
    dirX = players.field("facingX")[owner] || 1;
    dirY = players.field("facingY")[owner] || 0;
    const d = Math.hypot(dirX, dirY) || 1;
    dirX /= d;
    dirY /= d;
  }

  const proj = world.stores.projectiles.alloc();
  if (proj < 0) return;
  const p = world.stores.projectiles;
  p.field("x")[proj] = px;
  p.field("y")[proj] = py;
  p.field("vx")[proj] = dirX * def.base.speed;
  p.field("vy")[proj] = dirY * def.base.speed;
  p.field("damage")[proj] = world.weaponDamage(
    def,
    world.stores.weapons.field("level")[weaponSlot],
    owner,
  );
  p.field("pierce")[proj] = def.base.pierce;
  p.field("hitCooldown")[proj] = def.base.hitCooldown;
  p.field("knockback")[proj] = def.base.knockback;
  p.field("lifetime")[proj] = def.base.lifetime;
  p.field("owner")[proj] = owner;
  p.field("mode")[proj] = 0;

  world.emit({ type: "weapon-fire", playerId: owner, weaponId: weaponSlot });
}

/** Radial pulse: damages every enemy within `area` radius. */
function aura(world: World, weaponSlot: number, def: WeaponDef): void {
  const weapons = world.stores.weapons;
  const owner = weapons.field("owner")[weaponSlot];
  const players = world.stores.players;
  const px = players.field("x")[owner];
  const py = players.field("y")[owner];
  const damage = world.weaponDamage(def, weapons.field("level")[weaponSlot], owner);

  world.emit({ type: "weapon-fire", playerId: owner, weaponId: weaponSlot });

  world.enemiesInCircle(
    px,
    py,
    world.weaponArea(def, weapons.field("level")[weaponSlot], owner),
    (slot) => {
      if (!world.canHit(slot)) return;
      const dx = world.stores.enemies.field("x")[slot] - px;
      const dy = world.stores.enemies.field("y")[slot] - py;
      const dist = Math.hypot(dx, dy) || 1;
      world.applyHit(
        slot,
        damage,
        dx / dist,
        dy / dist,
        def.base.knockback,
        def.base.hitCooldown,
        owner,
      );
      if (def.status) world.applyStatus(slot, def.status);
    },
  );
}

/** Instantly hits a few random enemies in range. */
function strikeRandom(world: World, weaponSlot: number, def: WeaponDef): void {
  const weapons = world.stores.weapons;
  const owner = weapons.field("owner")[weaponSlot];
  const players = world.stores.players;
  const px = players.field("x")[owner];
  const py = players.field("y")[owner];
  const damage = world.weaponDamage(def, weapons.field("level")[weaponSlot], owner);

  const candidates: number[] = [];
  world.enemiesInCircle(
    px,
    py,
    world.weaponArea(def, weapons.field("level")[weaponSlot], owner),
    (slot) => {
      if (world.canHit(slot)) candidates.push(slot);
    },
  );

  world.emit({ type: "weapon-fire", playerId: owner, weaponId: weaponSlot });

  world.rng.shuffle(candidates);
  const hits = Math.min(def.base.amount, candidates.length);
  for (let i = 0; i < hits; i++) {
    const slot = candidates[i];
    const ex = world.stores.enemies.field("x")[slot];
    const ey = world.stores.enemies.field("y")[slot];
    const dx = ex - px;
    const dy = ey - py;
    const dist = Math.hypot(dx, dy) || 1;
    world.applyHit(
      slot,
      damage,
      dx / dist,
      dy / dist,
      def.base.knockback,
      def.base.hitCooldown,
      owner,
    );
    if (def.status) world.applyStatus(slot, def.status);
  }
}

/** Spawn lingering damage zones at random nearby spots. */
function groundPool(world: World, weaponSlot: number, def: WeaponDef): void {
  const weapons = world.stores.weapons;
  const owner = weapons.field("owner")[weaponSlot];
  const players = world.stores.players;
  const px = players.field("x")[owner];
  const py = players.field("y")[owner];
  const damage = world.weaponDamage(def, weapons.field("level")[weaponSlot], owner);
  const scatter = typeof def.params.scatter === "number" ? def.params.scatter : 60;
  const lifetime = def.base.duration || 120;

  world.emit({ type: "weapon-fire", playerId: owner, weaponId: weaponSlot });

  for (let i = 0; i < def.base.amount; i++) {
    const zone = world.stores.zones.alloc();
    if (zone < 0) break;
    world.stores.zones.field("x")[zone] = px + world.rng.range(-scatter, scatter);
    world.stores.zones.field("y")[zone] = py + world.rng.range(-scatter, scatter);
    world.stores.zones.field("radius")[zone] = world.weaponArea(
      def,
      weapons.field("level")[weaponSlot],
      owner,
    );
    world.stores.zones.field("damage")[zone] = damage;
    world.stores.zones.field("lifetime")[zone] = lifetime;
    world.stores.zones.field("owner")[zone] = owner;
  }
}

/** Spawn objects that orbit the player for a duration. */
function orbit(world: World, weaponSlot: number, def: WeaponDef): void {
  const owner = world.stores.weapons.field("owner")[weaponSlot];
  const damage = world.weaponDamage(def, world.stores.weapons.field("level")[weaponSlot], owner);
  const count = Math.max(1, def.base.amount);
  const radius = world.weaponArea(def, world.stores.weapons.field("level")[weaponSlot], owner);
  const lifetime = def.base.duration || 180;

  world.emit({ type: "weapon-fire", playerId: owner, weaponId: weaponSlot });

  for (let i = 0; i < count; i++) {
    const proj = world.stores.projectiles.alloc();
    if (proj < 0) break;
    const p = world.stores.projectiles;
    p.field("owner")[proj] = owner;
    p.field("mode")[proj] = 1;
    p.field("p1")[proj] = (i / count) * Math.PI * 2;
    p.field("p2")[proj] = radius;
    p.field("damage")[proj] = damage;
    p.field("pierce")[proj] = 99;
    p.field("hitCooldown")[proj] = def.base.hitCooldown;
    p.field("knockback")[proj] = def.base.knockback;
    p.field("lifetime")[proj] = lifetime;
  }
}

/** A projectile that ricochets off the field edges. */
function bounce(world: World, weaponSlot: number, def: WeaponDef): void {
  const owner = world.stores.weapons.field("owner")[weaponSlot];
  const players = world.stores.players;
  const px = players.field("x")[owner];
  const py = players.field("y")[owner];
  const angle = world.rng.range(0, Math.PI * 2);
  const proj = spawnProjectile(world, weaponSlot, px, py, Math.cos(angle), Math.sin(angle), def);
  if (proj >= 0) world.stores.projectiles.field("mode")[proj] = 4;
  world.emit({ type: "weapon-fire", playerId: owner, weaponId: weaponSlot });
}

/** A projectile that flies out and returns along its path. */
function boomerang(world: World, weaponSlot: number, def: WeaponDef): void {
  const owner = world.stores.weapons.field("owner")[weaponSlot];
  const players = world.stores.players;
  const px = players.field("x")[owner];
  const py = players.field("y")[owner];
  const fx = players.field("facingX")[owner] || 1;
  const fy = players.field("facingY")[owner] || 0;
  const d = Math.hypot(fx, fy) || 1;
  const proj = spawnProjectile(world, weaponSlot, px, py, fx / d, fy / d, def);
  if (proj >= 0) {
    const p = world.stores.projectiles;
    const level = world.stores.weapons.field("level")[weaponSlot];
    const range = world.weaponArea(def, level, owner);
    p.field("mode")[proj] = 2;
    p.field("p1")[proj] = 0;
    p.field("p2")[proj] = range;
    p.field("lifetime")[proj] = Math.ceil((range / Math.max(1, def.base.speed)) * 2 + 20);
  }
  world.emit({ type: "weapon-fire", playerId: owner, weaponId: weaponSlot });
}

/** Shared projectile setup. Returns the projectile slot, or -1 if full. */
function spawnProjectile(
  world: World,
  weaponSlot: number,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  def: WeaponDef,
): number {
  const owner = world.stores.weapons.field("owner")[weaponSlot];
  const proj = world.stores.projectiles.alloc();
  if (proj < 0) return -1;
  const p = world.stores.projectiles;
  p.field("x")[proj] = x;
  p.field("y")[proj] = y;
  p.field("vx")[proj] = dirX * def.base.speed;
  p.field("vy")[proj] = dirY * def.base.speed;
  p.field("damage")[proj] = world.weaponDamage(
    def,
    world.stores.weapons.field("level")[weaponSlot],
    owner,
  );
  p.field("pierce")[proj] = def.base.pierce;
  p.field("hitCooldown")[proj] = def.base.hitCooldown;
  p.field("knockback")[proj] = def.base.knockback;
  p.field("lifetime")[proj] = def.base.lifetime;
  p.field("owner")[proj] = owner;
  return proj;
}
