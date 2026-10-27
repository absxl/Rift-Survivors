// Deterministic chunked terrain. The generator is intentionally data-only and
// pure: the server, worker, tests and client can all build the same field from
// a seed. Walls block ground movement; liquids slow or damage units unless they
// have the `levitate` tag.
import type { StageTerrain } from "./content-types";

export const TERRAIN_TILE = 32;
export const TERRAIN_CHUNK_TILES = 16;
export const TERRAIN_CHUNK_SIZE = TERRAIN_TILE * TERRAIN_CHUNK_TILES;
/** Clear island around the party spawn; 5 tiles keeps terrain visible on screen. */
export const SPAWN_CLEARING_TILES = 5;
export const SPAWN_CLEARING_RADIUS = SPAWN_CLEARING_TILES * TERRAIN_TILE;

export const TILE_FLOOR = 0;
export const TILE_WALL = 1;
export const TILE_LIQUID = 2;

export interface TerrainSafeZone {
  x: number;
  y: number;
  radius: number;
}

export interface TerrainCollision {
  x: number;
  y: number;
  hit: boolean;
}

const MAX_CHUNKS = 256;

function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822519) >>> 0;
  return (h >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = smooth(xf);
  const v = smooth(yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

function fbm(x: number, y: number, seed: number): number {
  return (
    valueNoise(x, y, seed) * 0.58 +
    valueNoise(x * 2.07 + 13.1, y * 2.07 - 7.7, seed + 17) * 0.29 +
    valueNoise(x * 4.11 - 9.3, y * 4.11 + 5.1, seed + 31) * 0.13
  );
}

export class TerrainField {
  readonly tileSize = TERRAIN_TILE;
  readonly chunkSize = TERRAIN_CHUNK_SIZE;
  private readonly chunks = new Map<string, Uint8Array>();
  private readonly safe: TerrainSafeZone[];

  constructor(
    readonly settings: StageTerrain | null,
    readonly seed: number,
    safe: TerrainSafeZone[] = [],
  ) {
    this.safe = safe;
  }

  private inSafeZone(x: number, y: number, extra = 0): boolean {
    for (const zone of this.safe) {
      const dx = x - zone.x;
      const dy = y - zone.y;
      const radius = zone.radius + extra;
      if (dx * dx + dy * dy <= radius * radius) return true;
    }
    return false;
  }

  private generate(cx: number, cy: number): Uint8Array {
    const tiles = new Uint8Array(TERRAIN_CHUNK_TILES * TERRAIN_CHUNK_TILES);
    const terrain = this.settings;
    if (!terrain) return tiles;
    for (let j = 0; j < TERRAIN_CHUNK_TILES; j++) {
      for (let i = 0; i < TERRAIN_CHUNK_TILES; i++) {
        const tx = cx * TERRAIN_CHUNK_TILES + i;
        const ty = cy * TERRAIN_CHUNK_TILES + j;
        const wx = tx * TERRAIN_TILE + TERRAIN_TILE / 2;
        const wy = ty * TERRAIN_TILE + TERRAIN_TILE / 2;
        // Spawn clearing fades into the wild over a few tiles.
        if (this.inSafeZone(wx, wy, 0)) {
          tiles[j * TERRAIN_CHUNK_TILES + i] = TILE_FLOOR;
          continue;
        }
        // One transitional tile softens the boundary without making the visible
        // screen a huge empty island.
        const safeSoft = this.inSafeZone(wx, wy, TERRAIN_TILE) ? 0.08 : 0;
        const wallNoise = fbm(tx / 9.5, ty / 9.5, this.seed + 101);
        const liquidNoise = fbm(tx / 12.5, ty / 12.5, this.seed + 211);
        let type = TILE_FLOOR;
        if (wallNoise > terrain.wallThreshold + safeSoft) {
          type = TILE_WALL;
        } else if (liquidNoise < terrain.liquidThreshold - safeSoft * 0.5) {
          type = TILE_LIQUID;
        }
        tiles[j * TERRAIN_CHUNK_TILES + i] = type;
      }
    }
    return tiles;
  }

  private chunk(cx: number, cy: number): Uint8Array {
    const key = `${cx},${cy}`;
    let chunk = this.chunks.get(key);
    if (chunk) return chunk;
    if (this.chunks.size >= MAX_CHUNKS) {
      const oldest = this.chunks.keys().next().value;
      if (oldest !== undefined) this.chunks.delete(oldest);
    }
    chunk = this.generate(cx, cy);
    this.chunks.set(key, chunk);
    return chunk;
  }

  tileAt(tx: number, ty: number): number {
    const cx = Math.floor(tx / TERRAIN_CHUNK_TILES);
    const cy = Math.floor(ty / TERRAIN_CHUNK_TILES);
    const chunk = this.chunk(cx, cy);
    const lx = tx - cx * TERRAIN_CHUNK_TILES;
    const ly = ty - cy * TERRAIN_CHUNK_TILES;
    return chunk[ly * TERRAIN_CHUNK_TILES + lx];
  }

  tileAtWorld(x: number, y: number): number {
    return this.tileAt(Math.floor(x / TERRAIN_TILE), Math.floor(y / TERRAIN_TILE));
  }

  isWallAt(x: number, y: number): boolean {
    return this.tileAtWorld(x, y) === TILE_WALL;
  }

  isLiquidAt(x: number, y: number): boolean {
    return this.tileAtWorld(x, y) === TILE_LIQUID;
  }

  isWalkableTile(tx: number, ty: number): boolean {
    const type = this.tileAt(tx, ty);
    if (type === TILE_WALL) return false;
    if (type === TILE_LIQUID && (this.settings?.liquidDamage ?? 0) > 0) return false;
    return true;
  }

  /** True when a body can stand at this position without touching a wall. */
  isFree(x: number, y: number, radius: number): boolean {
    const minTx = Math.floor((x - radius) / TERRAIN_TILE);
    const maxTx = Math.floor((x + radius) / TERRAIN_TILE);
    const minTy = Math.floor((y - radius) / TERRAIN_TILE);
    const maxTy = Math.floor((y + radius) / TERRAIN_TILE);
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        if (this.tileAt(tx, ty) !== TILE_WALL) continue;
        const bx0 = tx * TERRAIN_TILE;
        const by0 = ty * TERRAIN_TILE;
        const qx = Math.max(bx0, Math.min(x, bx0 + TERRAIN_TILE));
        const qy = Math.max(by0, Math.min(y, by0 + TERRAIN_TILE));
        const dx = x - qx;
        const dy = y - qy;
        if (dx * dx + dy * dy < radius * radius) return false;
      }
    }
    return true;
  }

  /** Resolve a circle against solid tiles with two sliding passes. */
  collide(x: number, y: number, radius: number): TerrainCollision {
    let hit = false;
    let nx = x;
    let ny = y;
    for (let pass = 0; pass < 2; pass++) {
      const minTx = Math.floor((nx - radius) / TERRAIN_TILE);
      const maxTx = Math.floor((nx + radius) / TERRAIN_TILE);
      const minTy = Math.floor((ny - radius) / TERRAIN_TILE);
      const maxTy = Math.floor((ny + radius) / TERRAIN_TILE);
      for (let ty = minTy; ty <= maxTy; ty++) {
        for (let tx = minTx; tx <= maxTx; tx++) {
          if (this.tileAt(tx, ty) !== TILE_WALL) continue;
          const bx0 = tx * TERRAIN_TILE;
          const by0 = ty * TERRAIN_TILE;
          const bx1 = bx0 + TERRAIN_TILE;
          const by1 = by0 + TERRAIN_TILE;
          const qx = Math.max(bx0, Math.min(nx, bx1));
          const qy = Math.max(by0, Math.min(ny, by1));
          const dx = nx - qx;
          const dy = ny - qy;
          const d2 = dx * dx + dy * dy;
          if (d2 >= radius * radius) continue;
          hit = true;
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2);
            nx += (dx / d) * (radius - d);
            ny += (dy / d) * (radius - d);
          } else {
            const left = nx - bx0;
            const right = bx1 - nx;
            const top = ny - by0;
            const bottom = by1 - ny;
            const m = Math.min(left, right, top, bottom);
            if (m === left) nx = bx0 - radius;
            else if (m === right) nx = bx1 + radius;
            else if (m === top) ny = by0 - radius;
            else ny = by1 + radius;
          }
        }
      }
    }
    return { x: nx, y: ny, hit };
  }

  /** Movement multiplier from the current liquid (levitate users ignore it). */
  movementMultiplier(x: number, y: number, levitate: boolean): number {
    if (levitate || !this.settings || !this.isLiquidAt(x, y)) return 1;
    return Math.max(0.2, 1 - this.settings.liquidSlow);
  }

  /** Damage per second from the current liquid (levitate users ignore it). */
  liquidDamageAt(x: number, y: number, levitate: boolean): number {
    if (levitate || !this.settings || !this.isLiquidAt(x, y)) return 0;
    return this.settings.liquidDamage;
  }

  /** Straight-line walkability check used by spawn placement. */
  lineClear(ax: number, ay: number, bx: number, by: number, radius: number): boolean {
    const distance = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.ceil(distance / (TERRAIN_TILE * 0.5)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!this.isFree(ax + (bx - ax) * t, ay + (by - ay) * t, radius)) return false;
    }
    return true;
  }

  /** Find a nearby safe floor point for a ground spawn. */
  findFreeNear(
    x: number,
    y: number,
    bodyRadius: number,
    search = 96,
  ): { x: number; y: number } | null {
    if (this.isFree(x, y, bodyRadius) && (this.settings?.liquidDamage ?? 0) <= 0) {
      return { x, y };
    }
    for (let ring = 1; ring <= 4; ring++) {
      const radius = (search * ring) / 4;
      const steps = 8 + ring * 4;
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (this.isFree(px, py, bodyRadius) && (this.settings?.liquidDamage ?? 0) <= 0) {
          return { x: px, y: py };
        }
      }
    }
    return null;
  }
}
