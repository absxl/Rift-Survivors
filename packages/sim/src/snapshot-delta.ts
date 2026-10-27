// Tick-to-tick snapshot deltas for the co-op transport. The server sends a full
// WorldSnapshot on join/rejoin and periodically; between those it sends changed
// entity rows. The client applies a delta to the previous full snapshot.
import type { RngState } from "./rng";
import type { StoreSnapshot } from "./schema";
import type { RunStats, WorldSnapshot } from "./world";

export interface StoreDelta {
  kind: string;
  /** Field order used by `values` (taken from the store snapshot). */
  fieldNames: string[];
  slots: number[];
  generations: number[];
  /** Full field values for slots whose row changed (new, reused, or modified). */
  rows: Array<{ slot: number; values: number[] }>;
}

export interface SnapshotDelta {
  /** Tick of the snapshot this delta applies to. */
  baseTick: number;
  tick: number;
  over: boolean;
  rngState: RngState;
  modifiers: Record<string, number>;
  playerStats: RunStats[];
  partyXp: number;
  partyLevel: number;
  partyXpToNext: number;
  worldWidth: number;
  worldHeight: number;
  stageId: string;
  stageName: string;
  terrainSeed: number;
  stores: StoreDelta[];
}

export function buildSnapshotDelta(prev: WorldSnapshot, next: WorldSnapshot): SnapshotDelta {
  const stores: StoreDelta[] = next.stores.map((nextStore) => {
    const prevStore = prev.stores.find((s) => s.kind === nextStore.kind);
    const fieldNames = Object.keys(nextStore.fields);
    const prevIndex = new Map<number, number>();
    if (prevStore) {
      for (let i = 0; i < prevStore.slots.length; i++) prevIndex.set(prevStore.slots[i], i);
    }

    const rows: StoreDelta["rows"] = [];
    for (let i = 0; i < nextStore.slots.length; i++) {
      const slot = nextStore.slots[i];
      const pi = prevIndex.get(slot);
      let changed = pi === undefined;
      if (!changed && prevStore && pi !== undefined) {
        if (prevStore.generations[pi] !== nextStore.generations[i]) {
          changed = true;
        } else {
          for (const name of fieldNames) {
            if (nextStore.fields[name]?.[i] !== prevStore.fields[name]?.[pi]) {
              changed = true;
              break;
            }
          }
        }
      }
      if (changed) {
        rows.push({
          slot,
          values: fieldNames.map((name) => nextStore.fields[name]?.[i] ?? 0),
        });
      }
    }

    return {
      kind: nextStore.kind,
      fieldNames,
      slots: [...nextStore.slots],
      generations: [...nextStore.generations],
      rows,
    };
  });

  return {
    baseTick: prev.tick,
    tick: next.tick,
    over: next.over,
    rngState: next.rngState,
    modifiers: next.modifiers,
    playerStats: next.playerStats,
    partyXp: next.partyXp,
    partyLevel: next.partyLevel,
    partyXpToNext: next.partyXpToNext,
    worldWidth: next.worldWidth,
    worldHeight: next.worldHeight,
    stageId: next.stageId,
    stageName: next.stageName,
    terrainSeed: next.terrainSeed,
    stores,
  };
}

export function applySnapshotDelta(prev: WorldSnapshot, delta: SnapshotDelta): WorldSnapshot {
  if (delta.baseTick !== prev.tick) {
    throw new Error(`delta base ${delta.baseTick} does not match snapshot tick ${prev.tick}`);
  }

  const stores: StoreSnapshot[] = delta.stores.map((storeDelta) => {
    const prevStore = prev.stores.find((s) => s.kind === storeDelta.kind);
    const prevIndex = new Map<number, number>();
    if (prevStore) {
      for (let i = 0; i < prevStore.slots.length; i++) prevIndex.set(prevStore.slots[i], i);
    }
    const rowBySlot = new Map<number, number[]>();
    for (const row of storeDelta.rows) rowBySlot.set(row.slot, row.values);

    const fields: Record<string, number[]> = {};
    for (const name of storeDelta.fieldNames) fields[name] = [];

    for (let i = 0; i < storeDelta.slots.length; i++) {
      const slot = storeDelta.slots[i];
      const values = rowBySlot.get(slot);
      const pi = prevIndex.get(slot);
      for (let f = 0; f < storeDelta.fieldNames.length; f++) {
        const name = storeDelta.fieldNames[f];
        const value = values
          ? values[f]
          : prevStore && pi !== undefined
            ? prevStore.fields[name]?.[pi]
            : 0;
        fields[name].push(value ?? 0);
      }
    }

    return {
      kind: storeDelta.kind,
      slots: [...storeDelta.slots],
      generations: [...storeDelta.generations],
      fields,
    };
  });

  return {
    tick: delta.tick,
    over: delta.over,
    rngState: delta.rngState,
    modifiers: delta.modifiers,
    playerStats: delta.playerStats,
    partyXp: delta.partyXp,
    partyLevel: delta.partyLevel,
    partyXpToNext: delta.partyXpToNext,
    worldWidth: delta.worldWidth,
    worldHeight: delta.worldHeight,
    stageId: delta.stageId,
    stageName: delta.stageName,
    terrainSeed: delta.terrainSeed,
    stores,
  };
}
