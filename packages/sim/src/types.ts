// Shared core types. Kept dependency-free so nothing in the sim pulls in DOM/Node.

/** A stable reference to an entity across ticks: slot + generation (detects stale ids). */
export interface EntityRef {
  slot: number;
  gen: number;
}

/** Move-only input for one player for one tick (see docs/13 §2). */
export interface PlayerInput {
  playerId: number;
  moveX: number; // -1..1 (normalized)
  moveY: number; // -1..1 (normalized)
}

/** Generic level-up / chest / shop choice contract rendered by the UI (docs/04). */
export interface OfferOption {
  optionId: string;
  ref: { type: string; id: string };
  level?: number;
  isEvolution?: boolean;
  /** True for a champion signature move card (separate loadout pool). */
  cost?: { currency: string; amount: number };
  /** Direct training cards (repeatable stat gain, no item slot). */
  statKey?: string;
  statAmount?: number;
}

export interface Offer {
  id: string;
  playerId: number;
  kind: string;
  options: OfferOption[];
  rerolls?: number;
  skips?: number;
  banishes?: number;
  expiresTick?: number;
}
