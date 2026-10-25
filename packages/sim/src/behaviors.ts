// Generic enemy + weapon behaviors, matched by id from content data.
import type { EnemyDef, WeaponDef } from "./content-types";
import type { Registries } from "./registry";
import type { World } from "./world";

export function registerEnemyBehaviors(reg: Registries): void {
  reg.enemyBehaviors.register("chase", chase);
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

/** Move toward the nearest player, slowed by the slow status. */
function chase(world: World, slot: number, def: EnemyDef): void {
  const enemies = world.stores.enemies;
  if (enemies.field("freezeTicks")[slot] > 0) return; // frozen solid
  const players = world.stores.players;
  const ex = enemies.field("x")[slot];
  const ey = enemies.field("y")[slot];

  let targetX = 0;
  let targetY = 0;
  let bestD2 = Number.POSITIVE_INFINITY;
  players.forEachAlive((p) => {
    if (players.field("downed")[p]) return;
    const dx = players.field("x")[p] - ex;
    const dy = players.field("y")[p] - ey;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      targetX = players.field("x")[p];
      targetY = players.field("y")[p];
    }
  });
  if (bestD2 === Number.POSITIVE_INFINITY) return;

  const dx = targetX - ex;
  const dy = targetY - ey;
  const dist = Math.sqrt(bestD2);
  if (dist < 0.001) return;
  const slowFactor = enemies.field("slowTicks")[slot] > 0 ? 0.5 : 1;
  enemies.field("x")[slot] += (dx / dist) * def.moveSpeed * slowFactor;
  enemies.field("y")[slot] += (dy / dist) * def.moveSpeed * slowFactor;
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
  const range = world.weaponArea(def, level);
  const damage = world.weaponDamage(def, level);

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
    world.applyHit(slot, damage, dx / dist, dy / dist, def.base.knockback, def.base.hitCooldown);
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
  const damage = world.weaponDamage(def, weapons.field("level")[weaponSlot]);

  world.emit({ type: "weapon-fire", playerId: owner, weaponId: weaponSlot });

  world.enemiesInCircle(
    px,
    py,
    world.weaponArea(def, weapons.field("level")[weaponSlot]),
    (slot) => {
      if (!world.canHit(slot)) return;
      const dx = world.stores.enemies.field("x")[slot] - px;
      const dy = world.stores.enemies.field("y")[slot] - py;
      const dist = Math.hypot(dx, dy) || 1;
      world.applyHit(slot, damage, dx / dist, dy / dist, def.base.knockback, def.base.hitCooldown);
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
  const damage = world.weaponDamage(def, weapons.field("level")[weaponSlot]);

  const candidates: number[] = [];
  world.enemiesInCircle(
    px,
    py,
    world.weaponArea(def, weapons.field("level")[weaponSlot]),
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
    world.applyHit(slot, damage, dx / dist, dy / dist, def.base.knockback, def.base.hitCooldown);
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
  const damage = world.weaponDamage(def, weapons.field("level")[weaponSlot]);
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
    );
    world.stores.zones.field("damage")[zone] = damage;
    world.stores.zones.field("lifetime")[zone] = lifetime;
  }
}

/** Spawn objects that orbit the player for a duration. */
function orbit(world: World, weaponSlot: number, def: WeaponDef): void {
  const owner = world.stores.weapons.field("owner")[weaponSlot];
  const damage = world.weaponDamage(def, world.stores.weapons.field("level")[weaponSlot]);
  const count = Math.max(1, def.base.amount);
  const radius = world.weaponArea(def, world.stores.weapons.field("level")[weaponSlot]);
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
    const range = world.weaponArea(def, level);
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
  );
  p.field("pierce")[proj] = def.base.pierce;
  p.field("hitCooldown")[proj] = def.base.hitCooldown;
  p.field("knockback")[proj] = def.base.knockback;
  p.field("lifetime")[proj] = def.base.lifetime;
  p.field("owner")[proj] = world.stores.weapons.field("owner")[weaponSlot];
  return proj;
}
