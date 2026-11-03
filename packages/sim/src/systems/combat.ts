// Combat: ability auto-fire, projectile movement + collision, and enemy→player
// contact damage with invulnerability frames.
import type { Registries } from "../registry";
import type { World } from "../world";

export function registerCombatSystems(reg: Registries): void {
  reg.systems.register("abilities", abilities);
  reg.systems.register("projectiles", projectiles);
  reg.systems.register("contact-damage", contactDamage);
}

function abilities(world: World): void {
  const abilities = world.stores.abilities;
  const players = world.stores.players;
  abilities.forEachAlive((slot) => {
    if (players.field("downed")[abilities.field("owner")[slot]]) return;
    const cd = abilities.field("cooldown")[slot] - 1;
    if (cd > 0) {
      abilities.field("cooldown")[slot] = cd;
      return;
    }
    const def = world.content.abilities[abilities.field("defIndex")[slot]];
    if (!def) return;
    world.registries.abilityBehaviors.get(def.behavior)(world, slot, def);
    const owner = abilities.field("owner")[slot];
    abilities.field("cooldown")[slot] = world.abilityCooldown(
      def,
      abilities.field("level")[slot],
      owner,
    );
  });
}

function projectiles(world: World): void {
  const projs = world.stores.projectiles;
  const players = world.stores.players;
  const orbitSpeed = world.num("ability.orbitSpeed");

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
    if (world.terrain.isWallAt(px, py)) {
      projs.free(slot);
      return;
    }
    const hitRadius = 8;

    // Bushes are soft props: player projectiles damage them but pass through,
    // so auto-aim shots are never wasted on foliage. Hostile shots ignore them.
    if (mode !== 5) {
      world.damageBushesInCircle(
        px,
        py,
        hitRadius,
        projs.field("damage")[slot],
        projs.field("owner")[slot],
      );
    }

    // Hostile enemy projectile: damage the nearest player on contact.
    if (mode === 5) {
      let target = -1;
      let bestD2 = hitRadius * hitRadius;
      players.forEachAlive((p) => {
        if (players.field("downed")[p] || players.field("iFrames")[p] > 0) return;
        const dx = players.field("x")[p] - px;
        const dy = players.field("y")[p] - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          target = p;
        }
      });
      if (target >= 0) {
        damagePlayer(
          world,
          target,
          projs.field("damage")[slot],
          players.field("x")[target],
          players.field("y")[target],
          "projectile",
        );
        projs.free(slot);
      }
      return;
    }

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
        projs.field("owner")[slot],
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

/**
 * Apply damage to a player with armor, i-frames, hit event, and death/downed
 * handling. Callers must check i-frames first (contact/projectiles differ).
 */
export function damagePlayer(
  world: World,
  slot: number,
  rawDamage: number,
  x: number,
  y: number,
  kind: string,
): void {
  const players = world.stores.players;
  if (players.field("downed")[slot] || players.field("hp")[slot] <= 0) return;

  const resist = Math.min(0.7, Math.max(0, world.playerStat(slot, "resist", 0)));
  const final = Math.max(1, rawDamage * (1 - resist) - world.playerStat(slot, "armor", 0));
  players.field("hp")[slot] -= final;
  players.field("iFrames")[slot] = world.num("player.iFrames");
  world.emit({
    type: "hit",
    target: "player",
    targetSlot: slot,
    targetGen: players.gen(slot),
    x,
    y,
    amount: final,
    kind,
  });

  if (players.field("hp")[slot] > 0) return;
  players.field("hp")[slot] = 0;
  players.field("downs")[slot] += 1;
  if (players.count <= 1) {
    world.over = true;
    world.emit({ type: "run-end", victory: false });
    return;
  }
  players.field("downed")[slot] = 1;
  players.field("reviveProgress")[slot] = 0;
  world.emit({ type: "player-downed", playerId: slot });
  let anyAlive = false;
  players.forEachAlive((p) => {
    if (!players.field("downed")[p]) anyAlive = true;
  });
  if (!anyAlive) {
    world.over = true;
    world.emit({ type: "run-end", victory: false });
  }
}

function contactDamage(world: World): void {
  const players = world.stores.players;
  players.forEachAlive((slot) => {
    if (players.field("downed")[slot]) return;
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
      if (!def) return;
      const scaled = world.enemyDamage(def.damage);
      if (scaled > damage) damage = scaled;
    });

    if (damage > 0) {
      damagePlayer(world, slot, damage, px, py, "contact");
    }
  });
}
