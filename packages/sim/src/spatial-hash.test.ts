import { describe, expect, it } from "vitest";
import { DEFAULT_CELL_SIZE, SpatialHash } from "./spatial-hash";

describe("SpatialHash", () => {
  it("returns entities whose cell overlaps the query circle", () => {
    const h = new SpatialHash();
    h.insert(1, 10, 10);
    h.insert(2, 200, 200);
    h.insert(3, 50, 50);

    const found: number[] = [];
    h.queryCircle(10, 10, 20, (id) => found.push(id));
    expect(found.sort()).toEqual([1, 3]);
  });

  it("clear() empties the hash", () => {
    const h = new SpatialHash();
    h.insert(1, 10, 10);
    h.clear();
    const found: number[] = [];
    h.queryCircle(10, 10, 100, (id) => found.push(id));
    expect(found).toEqual([]);
  });

  it("query is deterministic in cell iteration order", () => {
    const h = new SpatialHash(DEFAULT_CELL_SIZE);
    h.insert(1, 0, 0);
    h.insert(2, 300, 200);
    h.insert(3, 100, 100);
    const a: number[] = [];
    const b: number[] = [];
    h.queryCircle(150, 100, 300, (id) => a.push(id));
    h.queryCircle(150, 100, 300, (id) => b.push(id));
    expect(a).toEqual(b);
  });
});
