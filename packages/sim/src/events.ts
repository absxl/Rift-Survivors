// Events out, never callbacks. The sim emits SimEvents; the client turns them into
// SFX, particles and damage numbers. The sim never draws or plays sound.

export type SimEvent =
  | { type: "enemy-died"; slot: number; gen: number; x: number; y: number }
  | {
      type: "hit";
      targetSlot: number;
      targetGen: number;
      x: number;
      y: number;
      amount: number;
      kind: string;
    }
  | { type: "level-up"; playerId: number; level: number }
  | { type: "gem-pickup"; playerId: number; value: number }
  | { type: "weapon-fire"; playerId: number; weaponId: number }
  | { type: "offer"; offer: unknown }
  | { type: "run-end"; victory: boolean };

export type SimEventType = SimEvent["type"];
