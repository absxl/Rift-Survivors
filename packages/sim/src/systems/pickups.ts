// Floor pickups: heal, vacuum, nuke, freeze, chest, gold. Dropped by enemies;
// collected on touch and applied to the world.
import type { Registries } from "../registry";
import type { World } from "../world";
import { buildChestOffer } from "./progression";

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
export function dropPickup(world: World, x: number, y: number, kind: number): void {
  const slot = world.stores.pickups.alloc();
  if (slot < 0) return;
  world.stores.pickups.field("x")[slot] = x;
  world.stores.pickups.field("y")[slot] = y;
  world.stores.pickups.field("kind")[slot] = kind;
  world.stores.pickups.field("value")[slot] = pickupValue(world, kind);
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
  const px = players.field("x")[0];
  const py = players.field("y")[0];
  const radius = world.num("pickup.radius");
  const radius2 = radius * radius;

  pickups.forEachAlive((slot) => {
    const dx = px - pickups.field("x")[slot];
    const dy = py - pickups.field("y")[slot];
    if (dx * dx + dy * dy > radius2) return;

    const kind = pickups.field("kind")[slot];
    const value = pickups.field("value")[slot];
    applyPickup(world, kind, value);
    pickups.free(slot);
  });
}

function applyPickup(world: World, kind: number, value: number): void {
  const players = world.stores.players;
  const enemies = world.stores.enemies;

  if (kind === PICKUP_HEAL) {
    const max = players.field("maxHp")[0];
    players.field("hp")[0] = Math.min(max, players.field("hp")[0] + value);
  } else if (kind === PICKUP_VACUUM) {
    const gems = world.stores.gems;
    let total = 0;
    gems.forEachAlive((slot) => {
      total += gems.field("value")[slot];
      gems.free(slot);
    });
    players.field("xp")[0] += total;
  } else if (kind === PICKUP_NUKE) {
    enemies.forEachAlive((slot) => {
      enemies.field("hp")[slot] -= value;
    });
  } else if (kind === PICKUP_FREEZE) {
    enemies.forEachAlive((slot) => {
      enemies.field("freezeTicks")[slot] = value;
    });
  } else if (kind === PICKUP_GOLD) {
    players.field("gold")[0] += value;
  } else if (kind === PICKUP_CHEST) {
    world.queueOffer(buildChestOffer(world, 0));
  }
}
