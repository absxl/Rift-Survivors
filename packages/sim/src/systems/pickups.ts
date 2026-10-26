// Floor pickups: heal, vacuum, nuke, freeze, chest, gold. Collected by the nearest
// player on touch; effects apply to that player (or globally for nuke/freeze).
import type { Registries } from "../registry";
import type { World } from "../world";

export const PICKUP_HEAL = 0;
export const PICKUP_VACUUM = 1;
export const PICKUP_NUKE = 2;
export const PICKUP_FREEZE = 3;
export const PICKUP_CHEST = 4;
export const PICKUP_GOLD = 5;

export function registerPickupSystem(reg: Registries): void {
  reg.systems.register("pickups", pickups);
}

/** Drop a pickup of the given kind at (x, y), with a value based on its kind. */
export function dropPickup(world: World, x: number, y: number, kind: number, value?: number): void {
  const slot = world.stores.pickups.alloc();
  if (slot < 0) return;
  world.stores.pickups.field("x")[slot] = x;
  world.stores.pickups.field("y")[slot] = y;
  world.stores.pickups.field("kind")[slot] = kind;
  world.stores.pickups.field("value")[slot] = value ?? pickupValue(world, kind);
}

function pickupValue(world: World, kind: number): number {
  switch (kind) {
    case PICKUP_HEAL:
      return world.num("pickup.healAmount");
    case PICKUP_NUKE:
      return world.num("pickup.nukeDamage");
    case PICKUP_FREEZE:
      return world.num("pickup.freezeTicks");
    case PICKUP_GOLD:
      return world.num("pickup.goldAmount");
    default:
      return 0;
  }
}

function pickups(world: World): void {
  const pickups = world.stores.pickups;
  const players = world.stores.players;
  if (players.count === 0) return;
  const radius2 = world.num("pickup.radius") ** 2;

  pickups.forEachAlive((slot) => {
    const x = pickups.field("x")[slot];
    const y = pickups.field("y")[slot];

    let nearest = -1;
    let bestD2 = Number.POSITIVE_INFINITY;
    players.forEachAlive((p) => {
      const dx = players.field("x")[p] - x;
      const dy = players.field("y")[p] - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        nearest = p;
      }
    });
    if (nearest < 0 || bestD2 > radius2) return;

    applyPickup(world, nearest, pickups.field("kind")[slot], pickups.field("value")[slot]);
    pickups.free(slot);
  });
}

function applyPickup(world: World, playerId: number, kind: number, value: number): void {
  const players = world.stores.players;
  const enemies = world.stores.enemies;

  if (kind === PICKUP_HEAL) {
    const max = players.field("maxHp")[playerId];
    players.field("hp")[playerId] = Math.min(max, players.field("hp")[playerId] + value);
  } else if (kind === PICKUP_VACUUM) {
    const gems = world.stores.gems;
    let total = 0;
    gems.forEachAlive((slot) => {
      total += gems.field("value")[slot];
      gems.free(slot);
    });
    world.partyXp += total;
  } else if (kind === PICKUP_NUKE) {
    enemies.forEachAlive((slot) => {
      enemies.field("hp")[slot] -= value;
    });
    world.emit({ type: "nuke", playerId });
  } else if (kind === PICKUP_FREEZE) {
    enemies.forEachAlive((slot) => {
      enemies.field("freezeTicks")[slot] = value;
    });
  } else if (kind === PICKUP_GOLD) {
    players.field("gold")[playerId] += Math.round(value * world.playerStat(playerId, "greed", 1));
  } else if (kind === PICKUP_CHEST) {
    const next = players.field("chests")[playerId] + 1;
    players.field("chests")[playerId] = next;
    world.emit({ type: "chest-found", playerId, chests: next });
  }
}
