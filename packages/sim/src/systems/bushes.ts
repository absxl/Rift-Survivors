// Destructible terrain props. Bushes are streamed around the party in chunks so
// an endless map never allocates the whole world. Broken tiles are remembered
// for the run and never respawn.
import type { Registries } from "../registry";
import type { World } from "../world";

const CHUNK_TILES = 16;
const LOAD_RADIUS_CHUNKS = 1;
const UNLOAD_RADIUS_CHUNKS = 3;
const BUSH_HP = 1;

export function registerBushSystem(reg: Registries): void {
  reg.systems.register("bushes", bushes);
}

function bushes(world: World): void {
  if (world.tick % 10 !== 0) return;
  const players = world.stores.players;
  if (players.count === 0) return;

  const chunks = new Set<string>();
  players.forEachAlive((player) => {
    if (players.field("downed")[player]) return;
    const cx = Math.floor(players.field("x")[player] / (CHUNK_TILES * 32));
    const cy = Math.floor(players.field("y")[player] / (CHUNK_TILES * 32));
    for (let oy = -LOAD_RADIUS_CHUNKS; oy <= LOAD_RADIUS_CHUNKS; oy++) {
      for (let ox = -LOAD_RADIUS_CHUNKS; ox <= LOAD_RADIUS_CHUNKS; ox++) {
        chunks.add(`${cx + ox},${cy + oy}`);
      }
    }
  });

  for (const key of chunks) {
    if (world.bushChunks.has(key)) continue;
    const [cxText, cyText] = key.split(",");
    const cx = Number(cxText);
    const cy = Number(cyText);
    const positions = world.bushField.positions(cx, cy);
    const slots: number[] = [];
    for (const position of positions) {
      if (world.brokenBushes.has(`${position.tx},${position.ty}`)) continue;
      const slot = world.stores.bushes.alloc();
      if (slot < 0) break;
      const store = world.stores.bushes;
      store.field("x")[slot] = position.x;
      store.field("y")[slot] = position.y;
      store.field("hp")[slot] = BUSH_HP;
      store.field("tx")[slot] = position.tx;
      store.field("ty")[slot] = position.ty;
      slots.push(slot);
    }
    world.bushChunks.set(key, slots);
  }

  // Recycle unbroken bushes that are far enough away. Broken tiles stay in the
  // run-local set, so returning to the chunk cannot farm the same bush again.
  for (const [key, slots] of world.bushChunks) {
    if (chunks.has(key)) continue;
    const [cxText, cyText] = key.split(",");
    const cx = Number(cxText);
    const cy = Number(cyText);
    let nearest = Number.POSITIVE_INFINITY;
    players.forEachAlive((player) => {
      if (players.field("downed")[player]) return;
      const px = Math.floor(players.field("x")[player] / (CHUNK_TILES * 32));
      const py = Math.floor(players.field("y")[player] / (CHUNK_TILES * 32));
      nearest = Math.min(nearest, Math.max(Math.abs(px - cx), Math.abs(py - cy)));
    });
    if (nearest <= UNLOAD_RADIUS_CHUNKS) continue;
    for (const slot of slots) {
      if (world.stores.bushes.isAlive(slot)) world.stores.bushes.free(slot);
    }
    world.bushChunks.delete(key);
  }
}
