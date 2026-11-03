import type { StoreSnapshot } from "@rift/sim";
import { describe, expect, it } from "vitest";
import { ownedIndices } from "./loadout";

function makeStore(kind: string, fields: Record<string, number[]>, slots: number[]): StoreSnapshot {
  return { kind, slots, fields } as unknown as StoreSnapshot;
}

describe("ownedIndices", () => {
  it("reads ability cooldowns", () => {
    const store = makeStore(
      "ability",
      { owner: [0, 1], defIndex: [3, 4], level: [2, 1], cooldown: [10, 5] },
      [0, 1],
    );
    expect(ownedIndices(store, 0)).toEqual([{ defIndex: 3, level: 2, cooldown: 10 }]);
    expect(ownedIndices(store, 1)).toEqual([{ defIndex: 4, level: 1, cooldown: 5 }]);
  });

  it("defaults cooldown to 0 for passive stores (no cooldown field)", () => {
    const store = makeStore("passive", { owner: [0], defIndex: [2], level: [1] }, [0]);
    expect(ownedIndices(store, 0)).toEqual([{ defIndex: 2, level: 1, cooldown: 0 }]);
  });

  it("returns nothing for a missing store", () => {
    expect(ownedIndices(undefined, 0)).toEqual([]);
  });
});
