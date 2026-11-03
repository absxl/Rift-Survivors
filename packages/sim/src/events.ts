// Events out, never callbacks. The sim emits SimEvents; the client turns them into
// SFX, particles and damage numbers. The sim never draws or plays sound.

export type SimEvent =
  | { type: "enemy-died"; slot: number; gen: number; x: number; y: number }
  | {
      type: "hit";
      target: "enemy" | "player";
      targetSlot: number;
      targetGen: number;
      x: number;
      y: number;
      amount: number;
      kind: string;
    }
  | { type: "level-up"; playerId: number; level: number }
  | { type: "player-downed"; playerId: number }
  | { type: "player-revived"; playerId: number }
  | { type: "gem-pickup"; playerId: number; value: number }
  | { type: "ability-fire"; playerId: number; abilityId: number; angle?: number }
  | { type: "offer"; offer: unknown }
  | { type: "boss-rush"; reason: "killed" | "timeout" }
  | { type: "explosion"; x: number; y: number; radius: number }
  | { type: "bush-break"; playerId: number; x: number; y: number }
  | { type: "key-found"; playerId: number; keys: number }
  | { type: "essence-found"; playerId: number; essence: number }
  | { type: "run-chest-spawn"; x: number; y: number }
  | { type: "run-chest-start"; playerId: number; x: number; y: number }
  | {
      type: "run-chest-open";
      playerId: number;
      x: number;
      y: number;
      xp: number;
      gold: number;
      key: boolean;
    }
  | { type: "nuke"; playerId: number }
  | { type: "magnet"; playerId: number; x: number; y: number }
  | { type: "bomb"; playerId: number; x: number; y: number }
  | { type: "frost"; playerId: number; x: number; y: number }
  | { type: "enemy-heal"; x: number; y: number; radius: number; amount: number }
  | { type: "enemy-shield"; x: number; y: number; radius: number; amount: number }
  | { type: "player-shield"; playerId: number; amount: number }
  | { type: "dash"; playerId: number; x: number; y: number }
  | { type: "turret-shot"; x: number; y: number }
  | { type: "item-bought"; playerId: number; itemId: string }
  | { type: "item-combined"; playerId: number; itemId: string }
  | { type: "item-sold"; playerId: number; itemId: string; refund: number }
  | { type: "run-end"; victory: boolean };

export type SimEventType = SimEvent["type"];
