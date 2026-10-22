// Schema-driven entity stores: struct-of-arrays with pooled slots and a free list.
// Each entity type is declared once as data; the store allocates typed arrays and
// can snapshot its state. Adding/removing a field is a one-line schema change.

export type FieldType = "u8" | "u16" | "u32" | "i16" | "i32" | "f32" | "bool";

export interface FieldDef {
  name: string;
  type: FieldType;
  /** Include in snapshots / the network codec. Default true. */
  network?: boolean;
}

export interface EntitySchema {
  kind: string;
  capacity: number;
  fields: FieldDef[];
}

export type NumericArray =
  | Float32Array
  | Uint8Array
  | Uint16Array
  | Uint32Array
  | Int16Array
  | Int32Array;

function createArray(type: FieldType, length: number): NumericArray {
  switch (type) {
    case "u8":
    case "bool":
      return new Uint8Array(length);
    case "u16":
      return new Uint16Array(length);
    case "u32":
      return new Uint32Array(length);
    case "i16":
      return new Int16Array(length);
    case "i32":
      return new Int32Array(length);
    case "f32":
      return new Float32Array(length);
  }
  throw new Error(`unknown field type "${type}"`);
}

export interface StoreSnapshot {
  kind: string;
  slots: number[];
  generations: number[];
  fields: Record<string, number[]>;
}

export class EntityStore {
  readonly kind: string;
  readonly capacity: number;
  readonly fields: FieldDef[];
  readonly alive: Uint8Array;
  readonly generation: Uint32Array;
  /** Highest allocated slot index + 1; valid slots are in [0, count). */
  count: number;

  private readonly arrays = new Map<string, NumericArray>();
  private readonly freeList: Int32Array;
  private freeHead: number;
  private readonly networkedFields: FieldDef[];

  constructor(schema: EntitySchema) {
    this.kind = schema.kind;
    this.capacity = schema.capacity;
    this.fields = schema.fields;
    this.alive = new Uint8Array(schema.capacity);
    this.generation = new Uint32Array(schema.capacity);
    this.freeList = new Int32Array(schema.capacity);
    this.freeHead = -1;
    this.count = 0;
    this.networkedFields = schema.fields.filter((f) => f.network !== false);
    for (const f of schema.fields) {
      this.arrays.set(f.name, createArray(f.type, schema.capacity));
    }
  }

  /** Allocate a slot (reusing a freed one if available). Returns -1 when full. */
  alloc(): number {
    if (this.freeHead >= 0) {
      const slot = this.freeList[this.freeHead];
      this.freeHead -= 1;
      this.alive[slot] = 1;
      return slot;
    }
    if (this.count >= this.capacity) return -1;
    const slot = this.count;
    this.count += 1;
    this.alive[slot] = 1;
    return slot;
  }

  /** Release a slot, bumping its generation so stale refs are detectable. */
  free(slot: number): void {
    if (slot < 0 || slot >= this.count || this.alive[slot] !== 1) return;
    this.alive[slot] = 0;
    this.generation[slot] += 1;
    this.freeHead += 1;
    this.freeList[this.freeHead] = slot;
  }

  isAlive(slot: number): boolean {
    return slot >= 0 && slot < this.count && this.alive[slot] === 1;
  }

  gen(slot: number): number {
    return this.generation[slot];
  }

  field(name: string): NumericArray {
    const arr = this.arrays.get(name);
    if (!arr) throw new Error(`store "${this.kind}": unknown field "${name}"`);
    return arr;
  }

  /** Iterate live slots without allocating. */
  forEachAlive(cb: (slot: number) => void): void {
    for (let i = 0; i < this.count; i++) {
      if (this.alive[i] === 1) cb(i);
    }
  }

  /** All live slots in allocation order (allocates; use for tests/tools). */
  liveSlots(): number[] {
    const out: number[] = [];
    this.forEachAlive((slot) => out.push(slot));
    return out;
  }

  snapshot(): StoreSnapshot {
    const slots: number[] = [];
    const generations: number[] = [];
    const fields: Record<string, number[]> = {};
    for (const f of this.networkedFields) fields[f.name] = [];

    this.forEachAlive((slot) => {
      slots.push(slot);
      generations.push(this.generation[slot]);
      for (const f of this.networkedFields) {
        const arr = this.arrays.get(f.name);
        if (arr) fields[f.name].push(arr[slot]);
      }
    });

    return { kind: this.kind, slots, generations, fields };
  }
}
