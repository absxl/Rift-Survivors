// Combat: weapon auto-fire, projectile movement + collision, and enemy→player
// contact damage with invulnerability frames.
import type { Registries } from "../registry";
import type { World } from "../world";

export function registerCombatSystems(reg: Registries): void {
  reg.systems.register("weapons", weapons);
  reg.systems.register("projectiles", projectiles);
  reg.systems.register("contact-damage", contactDamage);
}

function weapons(world: World): void {
  const weapons = world.stores.weapons;
  weapons.forEachAlive((slot) => {
    const cd = weapons.field("cooldown")[slot] - 1;
    if (cd > 0) {
      weapons.field("cooldown")[slot] = cd;
      return;
    }
    const def = world.content.weapons[weapons.field("defIndex")[slot]];
    if (!def) return;
    world.registries.weaponBehaviors.get(def.behavior)(world, slot, def);
    weapons.field("cooldown")[slot] = def.base.cooldown;
  });
}

function projectiles(world: World): void {
  const projs = world.stores.projectiles;
  projs.forEachAlive((slot) => {
    projs.field("x")[slot] += projs.field("vx")[slot];
    projs.field("y")[slot] += projs.field("vy")[slot];

    const life = projs.field("lifetime")[slot] - 1;
    projs.field("lifetime")[slot] = life;
    if (life <= 0) {
      projs.free(slot);
      return;
    }

    const px = projs.field("x")[slot];
    const py = projs.field("y")[slot];
    const hitRadius = 8;
    world.enemiesInCircle(px, py, hitRadius, (enemySlot) => {
      if (!projs.isAlive(slot)) return;
      if (!world.canHit(enemySlot)) return;
      const dx = projs.field("vx")[slot];
      const dy = projs.field("vy")[slot];
      const len = Math.hypot(dx, dy) || 1;
      world.applyHit(
        enemySlot,
        projs.field("damage")[slot],
        dx / len,
        dy / len,
        projs.field("knockback")[slot],
        projs.field("hitCooldown")[slot],
      );
      const pierce = projs.field("pierce")[slot] - 1;
      if (pierce < 0) {
        projs.free(slot);
      } else {
        projs.field("pierce")[slot] = pierce;
      }
    });
  });
}

function contactDamage(world: World): void {
  const players = world.stores.players;
  players.forEachAlive((slot) => {
    const iFrames = players.field("iFrames")[slot];
    if (iFrames > 0) {
      players.field("iFrames")[slot] = iFrames - 1;
      return;
    }

    const px = players.field("x")[slot];
    const py = players.field("y")[slot];
    let damage = 0;
    world.enemiesInCircle(px, py, 14, (enemySlot) => {
      const def = world.content.enemies[world.stores.enemies.field("kind")[enemySlot]];
      if (def && def.damage > damage) damage = def.damage;
    });

    if (damage > 0) {
      players.field("hp")[slot] -= damage;
      players.field("iFrames")[slot] = world.num("player.iFrames");
      world.emit({
        type: "hit",
        target: "player",
        targetSlot: slot,
        targetGen: players.gen(slot),
        x: px,
        y: py,
        amount: damage,
        kind: "enemy",
      });
      if (players.field("hp")[slot] <= 0) {
        players.field("hp")[slot] = 0;
        world.over = true;
        world.emit({ type: "run-end", victory: false });
      }
    }
  });
}
