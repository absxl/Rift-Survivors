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
    weapons.field("cooldown")[slot] = world.weaponCooldown(def, weapons.field("level")[slot]);
  });
}

function projectiles(world: World): void {
  const projs = world.stores.projectiles;
  const players = world.stores.players;
  const orbitSpeed = world.num("weapon.orbitSpeed");

  projs.forEachAlive((slot) => {
    const life = projs.field("lifetime")[slot] - 1;
    projs.field("lifetime")[slot] = life;
    if (life <= 0) {
      projs.free(slot);
      return;
    }

    const mode = projs.field("mode")[slot];
    if (mode === 1) {
      // orbit around the owner
      const owner = projs.field("owner")[slot];
      const angle = projs.field("p1")[slot] + orbitSpeed;
      projs.field("p1")[slot] = angle;
      const radius = projs.field("p2")[slot];
      projs.field("x")[slot] = players.field("x")[owner] + Math.cos(angle) * radius;
      projs.field("y")[slot] = players.field("y")[owner] + Math.sin(angle) * radius;
    } else {
      // straight / boomerang / bounce all advance by velocity
      if (mode === 2) {
        projs.field("p1")[slot] += Math.hypot(projs.field("vx")[slot], projs.field("vy")[slot]);
        if (projs.field("p1")[slot] >= projs.field("p2")[slot]) {
          projs.field("mode")[slot] = 3;
          projs.field("vx")[slot] *= -1;
          projs.field("vy")[slot] *= -1;
        }
      }
      projs.field("x")[slot] += projs.field("vx")[slot];
      projs.field("y")[slot] += projs.field("vy")[slot];

      if (mode === 4) {
        const w = world.num("core.fieldWidth");
        const h = world.num("core.fieldHeight");
        if (projs.field("x")[slot] < 0 || projs.field("x")[slot] > w) projs.field("vx")[slot] *= -1;
        if (projs.field("y")[slot] < 0 || projs.field("y")[slot] > h) projs.field("vy")[slot] *= -1;
      }
    }

    const px = projs.field("x")[slot];
    const py = projs.field("y")[slot];
    const hitRadius = 8;
    world.enemiesInCircle(px, py, hitRadius, (enemySlot) => {
      if (!projs.isAlive(slot)) return;
      if (!world.canHit(enemySlot)) return;
      const ex = world.stores.enemies.field("x")[enemySlot];
      const ey = world.stores.enemies.field("y")[enemySlot];
      const dx = ex - px;
      const dy = ey - py;
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
      const final = Math.max(1, damage - world.stat("armor", 0));
      players.field("hp")[slot] -= final;
      players.field("iFrames")[slot] = world.num("player.iFrames");
      world.emit({
        type: "hit",
        target: "player",
        targetSlot: slot,
        targetGen: players.gen(slot),
        x: px,
        y: py,
        amount: final,
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
