// Soft body separation: overlapping enemies push each other apart, weighted by
// radius squared so bosses barely move while minions shove each other out of the way.
import type { Registries } from "../registry";
import type { World } from "../world";

export function registerSeparationSystem(reg: Registries): void {
  reg.systems.register("separation", separation);
}

function separation(world: World): void {
  const enemies = world.stores.enemies;
  const content = world.content.enemies;
  if (content.length === 0) return;

  let maxRadius = 0;
  for (const def of content) maxRadius = Math.max(maxRadius, def.radius);
  // Reuse the hash the spatial-hash system built this tick. Separation moves
  // bodies by at most `separation.maxPush` px, so stale bucket membership is
  // negligible against the maxRadius padding and saves a full rebuild.
  const hash = world.spatialHash;

  const strength = world.num("separation.strength");
  const cap = world.num("separation.maxPush");
  enemies.forEachAlive((a) => {
    if (enemies.field("hp")[a] <= 0) return;
    const defA = content[enemies.field("kind")[a]];
    if (!defA) return;
    const ax = enemies.field("x")[a];
    const ay = enemies.field("y")[a];
    const rA = defA.radius;

    hash.queryCircle(ax, ay, rA + maxRadius, (b) => {
      if (b <= a) return;
      if (enemies.field("hp")[b] <= 0) return;
      const defB = content[enemies.field("kind")[b]];
      if (!defB) return;
      const bx = enemies.field("x")[b];
      const by = enemies.field("y")[b];
      let dx = bx - ax;
      let dy = by - ay;
      let d = Math.hypot(dx, dy);
      const min = rA + defB.radius;
      if (d >= min) return;
      if (d < 0.001) {
        dx = 1;
        dy = 0;
        d = 1;
      } else {
        dx /= d;
        dy /= d;
      }
      const overlap = Math.min(cap, (min - d) * strength);
      const mA = rA * rA;
      const mB = defB.radius * defB.radius;
      const total = mA + mB;
      const pushA = overlap * (mB / total);
      const pushB = overlap * (mA / total);
      enemies.field("x")[a] -= dx * pushA;
      enemies.field("y")[a] -= dy * pushA;
      enemies.field("x")[b] += dx * pushB;
      enemies.field("y")[b] += dy * pushB;
    });
  });
}
