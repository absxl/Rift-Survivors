import { describe, expect, it } from "vitest";
import { EntityStore } from "./schema";

function makeStore(): EntityStore {
  return new EntityStore({
    kind: "test",
    capacity: 4,
    fields: [
      { name: "x", type: "f32" },
      { name: "kind", type: "u16" },
      { name: "hidden", type: "f32", network: false },
    ],
  });
}

describe("EntityStore", () => {
  it("allocates sequentially and reuses freed slots with a generation bump", () => {
    const s = makeStore();
    const a = s.alloc();
    const b = s.alloc();
    expect(a).toBe(0);
    expect(b).toBe(1);
    s.free(a);
    const c = s.alloc();
    expect(c).toBe(0);
    expect(s.gen(0)).toBe(1);
  });

  it("returns -1 when full and never overflows capacity", () => {
    const s = makeStore();
    for (let i = 0; i < 4; i++) expect(s.alloc()).toBe(i);
    expect(s.alloc()).toBe(-1);
    expect(s.count).toBe(4);
  });

  it("snapshot includes only live slots and networked fields", () => {
    const s = makeStore();
    const a = s.alloc();
    s.field("x")[a] = 5;
    s.field("kind")[a] = 2;
    s.field("hidden")[a] = 99;
    const b = s.alloc();
    s.free(b);

    const snap = s.snapshot();
    expect(snap.kind).toBe("test");
    expect(snap.slots).toEqual([0]);
    expect(snap.fields.x).toEqual([5]);
    expect(snap.fields.kind).toEqual([2]);
    expect(snap.fields.hidden).toBeUndefined();
  });

  it("isAlive() and gen() reflect lifecycle", () => {
    const s = makeStore();
    const a = s.alloc();
    expect(s.isAlive(a)).toBe(true);
    s.free(a);
    expect(s.isAlive(a)).toBe(false);
  });
});
