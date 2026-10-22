// Uniform-grid spatial hash for "who is near X" queries (projectile hits, auras,
// magnet radius, targeting). Rebuilt each tick for enemies; no O(n^2) scans.

export const DEFAULT_CELL_SIZE = 64;

export class SpatialHash {
  private readonly cells = new Map<number, number[]>();
  private readonly cellSize: number;

  constructor(cellSize: number = DEFAULT_CELL_SIZE) {
    this.cellSize = cellSize;
  }

  private key(cx: number, cy: number): number {
    // Cell coords are assumed to fit in int16; pack into a single integer key.
    return (cx & 0xffff) | ((cy & 0xffff) << 16);
  }

  clear(): void {
    this.cells.clear();
  }

  insert(entityId: number, x: number, y: number): void {
    const key = this.key(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize));
    const bucket = this.cells.get(key);
    if (bucket) bucket.push(entityId);
    else this.cells.set(key, [entityId]);
  }

  /**
   * Call `cb` for every entity whose cell overlaps a circle centered at (x, y).
   * Callers must re-check the exact distance if precision matters.
   */
  queryCircle(x: number, y: number, radius: number, cb: (entityId: number) => void): void {
    const minCx = Math.floor((x - radius) / this.cellSize);
    const maxCx = Math.floor((x + radius) / this.cellSize);
    const minCy = Math.floor((y - radius) / this.cellSize);
    const maxCy = Math.floor((y + radius) / this.cellSize);
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const bucket = this.cells.get(this.key(cx, cy));
        if (bucket) {
          for (const id of bucket) cb(id);
        }
      }
    }
  }
}
