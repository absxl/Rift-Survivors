// XP gems: magnet toward the local player, and pickup within the pickup radius.
import type { Registries } from "../registry";
import type { World } from "../world";

export function registerGemSystem(reg: Registries): void {
  reg.systems.register("gems", gems);
}

function gems(world: World): void {
  const gems = world.stores.gems;
  const players = world.stores.players;
  if (players.count === 0) return;
  const px = players.field("x")[0];
  const py = players.field("y")[0];

  const pickup2 = world.num("pickup.radius") ** 2;
  const magnet2 = world.num("pickup.magnetRadius") ** 2;
  const speed = world.num("pickup.magnetSpeed");

  gems.forEachAlive((slot) => {
    const gx = gems.field("x")[slot];
    const gy = gems.field("y")[slot];
    const dx = px - gx;
    const dy = py - gy;
    const d2 = dx * dx + dy * dy;

    if (d2 <= pickup2) {
      world.emit({ type: "gem-pickup", playerId: 0, value: gems.field("value")[slot] });
      gems.free(slot);
      return;
    }
    if (d2 <= magnet2) {
      const d = Math.sqrt(d2) || 1;
      gems.field("x")[slot] = gx + (dx / d) * speed;
      gems.field("y")[slot] = gy + (dy / d) * speed;
    }
  });
}
