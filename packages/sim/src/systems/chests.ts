// Spawnable in-run chests. A chest appears on walkable floor near the party,
// then opens only after the opener stays close for the full open duration.
// Rewards are immediate: party XP, personal gold, and a chance at a key.
import type { Registries } from "../registry";
import type { World } from "../world";
import { PICKUP_BOMB, PICKUP_MAGNET, dropPickup } from "./pickups";

const NO_OPENER = 255;

export function registerChestSystem(reg: Registries): void {
  reg.systems.register("chests", chests);
}

function chests(world: World): void {
  const players = world.stores.players;
  const chestStore = world.stores.chests;
  if (players.count === 0) return;

  // Spawn cadence is independent of the opening state, but only one unopened
  // chest is allowed by default so the field stays readable.
  let active = 0;
  chestStore.forEachAlive(() => active++);
  if (active < world.num("chest.maxActive") && world.tick >= world.nextChestTick) {
    spawnChest(world);
    world.nextChestTick =
      world.tick + Math.max(1, Math.floor(world.num("chest.spawnIntervalSec") * 30));
  }

  chestStore.forEachAlive((slot) => {
    const x = chestStore.field("x")[slot];
    const y = chestStore.field("y")[slot];
    const opener = chestStore.field("opener")[slot];
    if (opener !== NO_OPENER) {
      const stillNear =
        opener < players.count &&
        !players.field("downed")[opener] &&
        Math.hypot(players.field("x")[opener] - x, players.field("y")[opener] - y) <=
          world.num("chest.holdRadius");
      if (!stillNear) {
        // The player left, died, or was downed: progress is lost and another
        // nearby player can claim the chest.
        chestStore.field("opener")[slot] = NO_OPENER;
        chestStore.field("openingTicks")[slot] = 0;
        return;
      }
      const remaining = chestStore.field("openingTicks")[slot] - 1;
      chestStore.field("openingTicks")[slot] = Math.max(0, remaining);
      if (remaining > 0) return;
    } else {
      const nearby = nearestOpener(world, x, y, world.num("chest.openRadius"));
      if (nearby < 0) return;
      chestStore.field("opener")[slot] = nearby;
      chestStore.field("openingTicks")[slot] = Math.max(
        1,
        Math.floor(world.num("chest.openTicks")),
      );
      world.emit({ type: "run-chest-start", playerId: nearby, x, y });
      return;
    }

    openChest(world, slot, chestStore.field("opener")[slot], x, y);
  });
}

function nearestOpener(world: World, x: number, y: number, radius: number): number {
  const players = world.stores.players;
  let best = -1;
  let bestD2 = radius * radius;
  players.forEachAlive((slot) => {
    if (players.field("downed")[slot]) return;
    const dx = players.field("x")[slot] - x;
    const dy = players.field("y")[slot] - y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= bestD2) {
      bestD2 = d2;
      best = slot;
    }
  });
  return best;
}

function spawnChest(world: World): boolean {
  const players = world.stores.players;
  const alive: number[] = [];
  players.forEachAlive((slot) => {
    if (!players.field("downed")[slot]) alive.push(slot);
  });
  if (alive.length === 0) return false;
  const player = alive[world.rng.int(0, alive.length - 1)];
  const angle = world.rng.range(0, Math.PI * 2);
  const distance = world.rng.range(145, 225);
  const targetX = players.field("x")[player] + Math.cos(angle) * distance;
  const targetY = players.field("y")[player] + Math.sin(angle) * distance;
  const free = world.terrain.findFreeNear(targetX, targetY, 10, 180);
  if (!free) return false;
  const slot = world.stores.chests.alloc();
  if (slot < 0) return false;
  const store = world.stores.chests;
  store.field("x")[slot] = free.x;
  store.field("y")[slot] = free.y;
  store.field("openingTicks")[slot] = 0;
  store.field("opener")[slot] = NO_OPENER;
  world.emit({ type: "run-chest-spawn", x: free.x, y: free.y });
  return true;
}

function openChest(world: World, slot: number, playerId: number, x: number, y: number): void {
  const players = world.stores.players;
  if (playerId >= players.count || players.field("downed")[playerId]) {
    world.stores.chests.field("opener")[slot] = NO_OPENER;
    world.stores.chests.field("openingTicks")[slot] = 0;
    return;
  }
  const minute = world.tick / (30 * 60);
  const xp = Math.round(world.num("chest.xpBase") + world.num("chest.xpPerMin") * minute);
  const gold = Math.round(
    (world.num("chest.goldBase") + world.num("chest.goldPerMin") * minute) *
      world.playerStat(playerId, "greed", 1),
  );
  const keyChance = Math.min(
    1,
    world.num("chest.keyChance") * (1 + Math.max(0, world.playerStat(playerId, "luck", 0))),
  );
  const foundKey = world.rng.chance(keyChance);
  world.partyXp += xp;
  players.field("gold")[playerId] += gold;
  players.field("chestsOpened")[playerId] += 1;
  if (foundKey) players.field("keys")[playerId] += 1;
  world.stores.chests.free(slot);
  // Utilities roll independently; a chest can drop neither, one, or both.
  if (world.rng.chance(world.num("chest.magnetChance"))) {
    dropPickup(world, x + world.rng.range(-7, 7), y + world.rng.range(-7, 7), PICKUP_MAGNET);
  }
  if (world.rng.chance(world.num("chest.bombChance"))) {
    dropPickup(world, x + world.rng.range(-7, 7), y + world.rng.range(-7, 7), PICKUP_BOMB);
  }
  world.emit({
    type: "run-chest-open",
    playerId,
    x,
    y,
    xp,
    gold,
    key: foundKey,
  });
}
