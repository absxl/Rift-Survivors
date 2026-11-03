// Deterministic bush placement. Bushes live in small clusters on walkable
// floor, never in the spawn clearing, walls or liquid. The field is data-only
// so the sim, worker and tests all see the same positions from one seed.
import { TERRAIN_CHUNK_TILES, TERRAIN_TILE, TILE_FLOOR, type TerrainField } from "./terrain";

export interface BushPosition {
  x: number;
  y: number;
  tx: number;
  ty: number;
}

const MAX_BUSH_CHUNKS = 128;

function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822519) >>> 0;
  return (h >>> 0) / 4294967296;
}

export class BushField {
  private readonly chunks = new Map<string, BushPosition[]>();

  constructor(
    private readonly terrain: TerrainField,
    private readonly seed: number,
    private readonly density = 1,
  ) {}

  /** Bush positions for one 16x16-tile terrain chunk. */
  positions(cx: number, cy: number): BushPosition[] {
    const key = `${cx},${cy}`;
    const cached = this.chunks.get(key);
    if (cached) return cached;

    if (this.chunks.size >= MAX_BUSH_CHUNKS) {
      const oldest = this.chunks.keys().next().value;
      if (oldest !== undefined) this.chunks.delete(oldest);
    }

    const out: BushPosition[] = [];
    const seen = new Set<string>();
    const baseClusters = 1 + (hash2(cx, cy, this.seed + 701) > 0.55 ? 1 : 0);
    const clusterCount = Math.max(1, Math.round(baseClusters * Math.max(1, this.density)));
    for (let c = 0; c < clusterCount; c++) {
      const baseX = 2 + Math.floor(hash2(cx * 3 + c, cy, this.seed + 711) * 12);
      const baseY = 2 + Math.floor(hash2(cx, cy * 3 + c, this.seed + 712) * 12);
      const size = 2 + Math.floor(hash2(cx + c, cy - c, this.seed + 713) * 4);
      for (let i = 0; i < size; i++) {
        const angle = hash2(cx * 17 + i, cy * 13 - i, this.seed + 714) * Math.PI * 2;
        const radius = hash2(cx * 19 - i, cy * 23 + i, this.seed + 715) * 2.2;
        const tx = cx * TERRAIN_CHUNK_TILES + baseX + Math.round(Math.cos(angle) * radius);
        const ty = cy * TERRAIN_CHUNK_TILES + baseY + Math.round(Math.sin(angle) * radius);
        if (
          tx < cx * TERRAIN_CHUNK_TILES ||
          tx >= (cx + 1) * TERRAIN_CHUNK_TILES ||
          ty < cy * TERRAIN_CHUNK_TILES ||
          ty >= (cy + 1) * TERRAIN_CHUNK_TILES
        ) {
          continue;
        }
        const wx = tx * TERRAIN_TILE + TERRAIN_TILE / 2;
        const wy = ty * TERRAIN_TILE + TERRAIN_TILE / 2;
        if (this.terrain.tileAt(tx, ty) !== TILE_FLOOR) continue;
        if (this.terrain.isSafeZoneAt(wx, wy, 22)) continue;
        const tileKey = `${tx},${ty}`;
        if (seen.has(tileKey)) continue;
        seen.add(tileKey);
        out.push({ x: wx, y: wy, tx, ty });
      }
    }
    this.chunks.set(key, out);
    return out;
  }
}
