// Per-player health regeneration, expressed in HP/second by the `regen` stat.
import type { Registries } from "../registry";
import type { World } from "../world";

export function registerRegenSystem(reg: Registries): void {
  reg.systems.register("regen", regen);
}

function regen(world: World): void {
  const players = world.stores.players;
  players.forEachAlive((slot) => {
    if (players.field("downed")[slot]) return;
    const hp = players.field("hp")[slot];
    const max = players.field("maxHp")[slot];
    if (hp <= 0 || hp >= max) return;
    const perSecond = world.playerStat(slot, "regen", 0);
    if (perSecond <= 0) return;
    players.field("hp")[slot] = Math.min(max, hp + perSecond / 30);
  });
}
