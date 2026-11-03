// Modifier stack: every number that can change at runtime (stats and ability params)
// is computed through this stack, never read directly from base data. Any item,
// synergy, curse or mutator can therefore alter any value.
//
// Evaluation order (fixed and documented): base -> add -> mult -> override -> min/max.

export type ModOp = "add" | "mult" | "override" | "min" | "max";

export interface Modifier {
  op: ModOp;
  value: number;
  source: string; // item/synergy/curse id — for UI ("why +20% AS?") and clean removal
  durationTicks?: number; // omit = until source removed
}

export class ModifierStack {
  private readonly entries = new Map<string, Modifier[]>();

  clear(): void {
    this.entries.clear();
  }

  add(key: string, mod: Modifier): void {
    const list = this.entries.get(key);
    if (list) list.push(mod);
    else this.entries.set(key, [mod]);
  }

  /** Remove every modifier whose source matches (used when items are sold/removed). */
  removeSource(source: string): void {
    for (const list of this.entries.values()) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].source === source) list.splice(i, 1);
      }
    }
  }

  /** Remove every modifier whose source starts with `prefix` (e.g. "passive:"). */
  removeSourcePrefix(prefix: string): void {
    for (const list of this.entries.values()) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].source.startsWith(prefix)) list.splice(i, 1);
      }
    }
  }

  has(key: string): boolean {
    const list = this.entries.get(key);
    return list !== undefined && list.length > 0;
  }

  /** Evaluate a key against its modifiers; returns `base` unchanged if none. */
  evaluate(key: string, base: number): number {
    const list = this.entries.get(key);
    if (!list || list.length === 0) return base;

    let add = 0;
    let mult = 1;
    let overridden = false;
    let override = base;
    let min: number | undefined;
    let max: number | undefined;

    for (const mod of list) {
      switch (mod.op) {
        case "add":
          add += mod.value;
          break;
        case "mult":
          mult *= mod.value;
          break;
        case "override":
          overridden = true;
          override = mod.value;
          break;
        case "min":
          min = min === undefined ? mod.value : Math.max(min, mod.value);
          break;
        case "max":
          max = max === undefined ? mod.value : Math.min(max, mod.value);
          break;
      }
    }

    let value = overridden ? override : (base + add) * mult;
    if (min !== undefined) value = Math.max(value, min);
    if (max !== undefined) value = Math.min(value, max);
    return Number.isFinite(value) ? value : base;
  }

  /** Snapshot of modifier counts per key (for determinism tests / debug). */
  snapshot(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [key, list] of this.entries) {
      if (list.length > 0) out[key] = list.length;
    }
    return out;
  }
}
