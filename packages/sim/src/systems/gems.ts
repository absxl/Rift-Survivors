// XP gems: magnet toward the nearest player, and pickup by whichever player is
// closest (co-op aware).
import type { Registries } from "../registry";
import type { World } from "../world";

export function registerGemSystem(reg: Registries): void {
  reg.systems.register("gems", gems);
}

function gems(world: World): void {
  const gems = world.stores.gems;
  const players = world.stores.players;
  if (players.count === 0) return;

  const pickup2 = world.num("pickup.radius") ** 2;
  const baseMagnet = world.num("pickup.magnetRadius");
  const speed = world.num("pickup.magnetSpeed");

  gems.forEachAlive((slot) => {
    const gx = gems.field("x")[slot];
    const gy = gems.field("y")[slot];

    let nearest = -1;
    let bestD2 = Number.POSITIVE_INFINITY;
    players.forEachAlive((p) => {
      // Downed players neither collect nor attract loot until revived.
      if (players.field("downed")[p]) return;
      const dx = players.field("x")[p] - gx;
      const dy = players.field("y")[p] - gy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        nearest = p;
      }
    });
    if (nearest < 0) return;

    if (bestD2 <= pickup2) {
      const value = gems.field("value")[slot];
      const gained = value * world.playerStat(nearest, "growth", 1);
      world.partyXp += gained;
      world.emit({ type: "gem-pickup", playerId: nearest, value: gained });
      gems.free(slot);
      return;
    }
    const magnet2 = (baseMagnet * world.playerStat(nearest, "magnet", 1)) ** 2;
    if (bestD2 <= magnet2) {
      const dx = players.field("x")[nearest] - gx;
      const dy = players.field("y")[nearest] - gy;
      const d = Math.sqrt(bestD2) || 1;
      gems.field("x")[slot] = gx + (dx / d) * speed;
      gems.field("y")[slot] = gy + (dy / d) * speed;
    }
  });
}
