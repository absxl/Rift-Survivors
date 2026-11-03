// Floor pickups: heal, vacuum, nuke, frost, gold, key, magnet, bomb. Collected
// by the nearest player on touch; effects apply to that player or the run.
import type { Registries } from "../registry";
import type { World } from "../world";

export const PICKUP_HEAL = 0;
export const PICKUP_VACUUM = 1;
export const PICKUP_NUKE = 2;
export const PICKUP_FREEZE = 3;
export const PICKUP_GOLD = 5;
export const PICKUP_KEY = 6;
export const PICKUP_MAGNET = 7;
export const PICKUP_BOMB = 8;

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
    case PICKUP_KEY:
      return world.num("pickup.keyAmount");
    case PICKUP_MAGNET:
    case PICKUP_BOMB:
      return 0;
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
    // Frost is a strong slow, not a global hard stop: the old implementation
    // froze every enemy for four seconds and read as an AI freeze bug.
    enemies.forEachAlive((slot) => {
      enemies.field("slowTicks")[slot] = Math.max(enemies.field("slowTicks")[slot], value);
    });
    world.emit({
      type: "frost",
      playerId,
      x: players.field("x")[playerId],
      y: players.field("y")[playerId],
    });
  } else if (kind === PICKUP_GOLD) {
    players.field("gold")[playerId] += Math.round(value * world.playerStat(playerId, "greed", 1));
  } else if (kind === PICKUP_KEY) {
    const next = players.field("keys")[playerId] + Math.max(1, Math.floor(value));
    players.field("keys")[playerId] = next;
    world.emit({ type: "key-found", playerId, keys: next });
  } else if (kind === PICKUP_MAGNET) {
    // Pull all active loot to the opener. The normal gem/pickup systems collect
    // it on the next tick; exclude other magnets so magnets cannot chain.
    const px = players.field("x")[playerId];
    const py = players.field("y")[playerId];
    const gems = world.stores.gems;
    gems.forEachAlive((slot) => {
      gems.field("x")[slot] = px;
      gems.field("y")[slot] = py;
    });
    world.stores.pickups.forEachAlive((slot) => {
      if (world.stores.pickups.field("kind")[slot] !== PICKUP_MAGNET) {
        world.stores.pickups.field("x")[slot] = px;
        world.stores.pickups.field("y")[slot] = py;
      }
    });
    world.emit({ type: "magnet", playerId, x: px, y: py });
  } else if (kind === PICKUP_BOMB) {
    // Global bomb: percentage damage keeps it useful without deleting bosses.
    enemies.forEachAlive((slot) => {
      const def = world.content.enemies[enemies.field("kind")[slot]];
      const pct =
        def?.category === "elite"
          ? 0.07
          : def?.category === "boss" || def?.category === "final-threat"
            ? 0.03
            : 0.12;
      let damage = Math.max(1, enemies.field("maxHp")[slot] * pct);
      const shield = enemies.field("shield")[slot];
      if (shield > 0) {
        const absorbed = Math.min(shield, damage);
        enemies.field("shield")[slot] = shield - absorbed;
        damage -= absorbed;
      }
      if (damage > 0) {
        enemies.field("hp")[slot] = Math.max(0, enemies.field("hp")[slot] - damage);
      }
      enemies.field("lastHitBy")[slot] = playerId;
    });
    world.emit({
      type: "bomb",
      playerId,
      x: players.field("x")[playerId],
      y: players.field("y")[playerId],
    });
  }
}
