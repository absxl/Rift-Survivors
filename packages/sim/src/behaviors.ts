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
}

/** Move toward the nearest player (player 0 for now). */
function chase(world: World, slot: number, def: EnemyDef): void {
  const enemies = world.stores.enemies;
  const players = world.stores.players;
  const px = players.field("x")[0];
  const py = players.field("y")[0];
  const dx = px - enemies.field("x")[slot];
  const dy = py - enemies.field("y")[slot];
  const dist = Math.hypot(dx, dy);
  if (dist < 0.001) return;
  enemies.field("x")[slot] += (dx / dist) * def.moveSpeed;
  enemies.field("y")[slot] += (dy / dist) * def.moveSpeed;
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
  const range = def.base.area;
  const damage = world.weaponDamage(def, weapons.field("level")[weaponSlot]);

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

  world.enemiesInCircle(px, py, def.base.area, (slot) => {
    if (!world.canHit(slot)) return;
    const dx = world.stores.enemies.field("x")[slot] - px;
    const dy = world.stores.enemies.field("y")[slot] - py;
    const dist = Math.hypot(dx, dy) || 1;
    world.applyHit(slot, damage, dx / dist, dy / dist, def.base.knockback, def.base.hitCooldown);
  });
}
