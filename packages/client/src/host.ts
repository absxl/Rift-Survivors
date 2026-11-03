// Host abstraction: the game code doesn't care whether the sim runs in a Worker
// (solo) or on a server (co-op). Both implement sendInput / sendChoice / callbacks.
import type { Offer, PlayerInput, SimEvent, WorldSnapshot } from "@rift/sim";

export type SnapshotHandler = (snapshot: WorldSnapshot, events: SimEvent[]) => void;
export type OfferHandler = (offer: Offer) => void;

export interface ShopAction {
  type: "buy" | "combine" | "sell";
  itemId?: string;
  slot?: number;
}

export interface Host {
  start(
    characterId: string,
    metaBonuses?: Record<string, number>,
    stageId?: string,
    seed?: number,
  ): void;
  pause(): void;
  resume(): void;
  sendInput(input: PlayerInput): void;
  sendChoice(choiceIndex: number): void;
  reroll(): void;
  skip(): void;
  banishOption(optionIndex: number): void;
  /** Item-shop action; the authoritative side validates it. */
  sendShop(action: ShopAction): void;
  /** Dev-only: add run gold (solo worker). Co-op hosts omit this. */
  grantRunGold?(amount: number): void;
  onSnapshot(cb: SnapshotHandler): void;
  onOffer(cb: OfferHandler): void;
}

export class WorkerHost implements Host {
  private readonly worker: Worker;
  private snapshotCb: SnapshotHandler | null = null;
  private offerCb: OfferHandler | null = null;

  constructor() {
    this.worker = new Worker(new URL("./worker/sim-worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (event: MessageEvent) => {
      const msg = event.data as {
        type?: string;
        snapshot?: WorldSnapshot;
        events?: SimEvent[];
        offer?: Offer;
      };
      if (msg.type === "snapshot" && msg.snapshot && this.snapshotCb) {
        this.snapshotCb(msg.snapshot, msg.events ?? []);
      } else if (msg.type === "offer" && msg.offer && this.offerCb) {
        this.offerCb(msg.offer);
      }
    };
  }

  start(
    characterId: string,
    metaBonuses?: Record<string, number>,
    stageId?: string,
    seed?: number,
  ): void {
    this.worker.postMessage({ type: "start", characterId, metaBonuses, stageId, seed });
  }

  pause(): void {
    this.worker.postMessage({ type: "pause" });
  }

  resume(): void {
    this.worker.postMessage({ type: "resume" });
  }

  sendInput(input: PlayerInput): void {
    this.worker.postMessage({ type: "input", input });
  }

  sendChoice(choiceIndex: number): void {
    this.worker.postMessage({ type: "choice", choiceIndex });
  }

  reroll(): void {
    this.worker.postMessage({ type: "reroll" });
  }

  skip(): void {
    this.worker.postMessage({ type: "skip" });
  }

  banishOption(optionIndex: number): void {
    this.worker.postMessage({ type: "banish", optionIndex });
  }

  sendShop(action: ShopAction): void {
    this.worker.postMessage({ type: action.type, itemId: action.itemId, slot: action.slot });
  }

  grantRunGold(amount: number): void {
    this.worker.postMessage({ type: "dev-gold", amount });
  }

  onSnapshot(cb: SnapshotHandler): void {
    this.snapshotCb = cb;
  }

  onOffer(cb: OfferHandler): void {
    this.offerCb = cb;
  }
}
