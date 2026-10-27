// Coarse flow fields around each player, rebuilt a few times per second. Ground
// enemies sample the field when walls block the direct line; flyers/levitate
// units simply steer straight. This keeps pathing deterministic and cheap even
// with hundreds of enemies.
import { TERRAIN_TILE, type TerrainField } from "./terrain";
import type { World } from "./world";

const RADIUS = 26;
const SIZE = RADIUS * 2 + 1;
const UPDATE_TICKS = 12;
const UNSEEN = 0x7fff;

interface Field {
  ox: number;
  oy: number;
  playerX: number;
  playerY: number;
  dist: Uint16Array;
  open: Uint8Array;
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

export class Pathfinder {
  private readonly fields = new Map<number, Field>();
  private readonly queue = new Int32Array(SIZE * SIZE);

  update(world: World): void {
    if (world.tick % UPDATE_TICKS !== 0) return;
    const terrain = world.terrain;
    if (!terrain || !terrain.settings) {
      this.fields.clear();
      return;
    }
    const players = world.stores.players;
    const alive = new Set<number>();
    players.forEachAlive((slot) => {
      if (players.field("downed")[slot]) return;
      alive.add(slot);
      this.build(terrain, slot, players.field("x")[slot], players.field("y")[slot]);
    });
    for (const slot of this.fields.keys()) {
      if (!alive.has(slot)) this.fields.delete(slot);
    }
  }

  private build(terrain: TerrainField, slot: number, px: number, py: number): void {
    let field = this.fields.get(slot);
    if (!field) {
      field = {
        ox: 0,
        oy: 0,
        playerX: px,
        playerY: py,
        dist: new Uint16Array(SIZE * SIZE),
        open: new Uint8Array(SIZE * SIZE),
      };
      this.fields.set(slot, field);
    }
    const ptx = Math.floor(px / TERRAIN_TILE);
    const pty = Math.floor(py / TERRAIN_TILE);
    const ox = ptx - RADIUS;
    const oy = pty - RADIUS;
    field.ox = ox;
    field.oy = oy;
    field.playerX = px;
    field.playerY = py;
    const dist = field.dist;
    const open = field.open;
    dist.fill(UNSEEN);
    for (let j = 0; j < SIZE; j++) {
      for (let i = 0; i < SIZE; i++) {
        open[j * SIZE + i] = terrain.isWalkableTile(ox + i, oy + j) ? 1 : 0;
      }
    }
    const start = RADIUS * SIZE + RADIUS;
    open[start] = 1;
    dist[start] = 0;
    let head = 0;
    let tail = 0;
    this.queue[tail++] = start;
    while (head < tail) {
      const current = this.queue[head++];
      const cx = current % SIZE;
      const cy = (current / SIZE) | 0;
      const next = dist[current] + 1;
      for (let k = 0; k < DIRS.length; k++) {
        const nx = cx + DIRS[k][0];
        const ny = cy + DIRS[k][1];
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
        const n = ny * SIZE + nx;
        if (open[n] === 0 || dist[n] !== UNSEEN) continue;
        if (k >= 4 && (open[cy * SIZE + nx] === 0 || open[ny * SIZE + cx] === 0)) continue;
        dist[n] = next;
        this.queue[tail++] = n;
      }
    }
  }

  /** A normalized step direction, or null to steer straight at the target. */
  direction(playerSlot: number, x: number, y: number): { x: number; y: number } | null {
    const field = this.fields.get(playerSlot);
    if (!field) return null;
    const tx = Math.floor(x / TERRAIN_TILE) - field.ox;
    const ty = Math.floor(y / TERRAIN_TILE) - field.oy;
    if (tx < 0 || ty < 0 || tx >= SIZE || ty >= SIZE) return null;
    const here = field.dist[ty * SIZE + tx];
    if (here <= 1 || here === UNSEEN) return null;
    let bx = tx;
    let by = ty;
    let best = here;
    for (let k = 0; k < DIRS.length; k++) {
      const nx = tx + DIRS[k][0];
      const ny = ty + DIRS[k][1];
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
      const value = field.dist[ny * SIZE + nx];
      if (value >= best) continue;
      if (k >= 4 && (field.open[ty * SIZE + nx] === 0 || field.open[ny * SIZE + tx] === 0))
        continue;
      best = value;
      bx = nx;
      by = ny;
    }
    if (bx === tx && by === ty) return null;
    const gx = (field.ox + bx + 0.5) * TERRAIN_TILE;
    const gy = (field.oy + by + 0.5) * TERRAIN_TILE;
    const dx = gx - x;
    const dy = gy - y;
    const length = Math.hypot(dx, dy);
    return length > 0.01 ? { x: dx / length, y: dy / length } : null;
  }

  clear(): void {
    this.fields.clear();
  }
}
