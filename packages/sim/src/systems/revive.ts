// Co-op marker revive: a downed player is revived when an ally stands nearby for
// a short time (classic survivor co-op).
import type { Registries } from "../registry";
import type { World } from "../world";

export function registerReviveSystem(reg: Registries): void {
  reg.systems.register("revive", revive);
}

function revive(world: World): void {
  const players = world.stores.players;
  if (players.count <= 1) return;

  const radius2 = world.num("coop.reviveRadius") ** 2;
  const needed = world.num("coop.reviveTicks");
  const hpFrac = world.num("coop.reviveHp");

  players.forEachAlive((slot) => {
    if (!players.field("downed")[slot]) return;
    const x = players.field("x")[slot];
    const y = players.field("y")[slot];

    let reviving = false;
    players.forEachAlive((p) => {
      if (p === slot || players.field("downed")[p]) return;
      const dx = players.field("x")[p] - x;
      const dy = players.field("y")[p] - y;
      if (dx * dx + dy * dy <= radius2) reviving = true;
    });

    if (reviving) {
      const prog = players.field("reviveProgress")[slot] + 1;
      if (prog >= needed) {
        players.field("downed")[slot] = 0;
        players.field("reviveProgress")[slot] = 0;
        players.field("hp")[slot] = players.field("maxHp")[slot] * hpFrac;
        players.field("iFrames")[slot] = world.num("player.iFrames");
        world.emit({ type: "player-revived", playerId: slot });
      } else {
        players.field("reviveProgress")[slot] = prog;
      }
    } else if (players.field("reviveProgress")[slot] > 0) {
      players.field("reviveProgress")[slot] = Math.max(
        0,
        players.field("reviveProgress")[slot] - 1,
      );
    }
  });
}
