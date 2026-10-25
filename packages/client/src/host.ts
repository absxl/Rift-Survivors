// Host abstraction: the game code doesn't care whether the sim runs in a Worker
// (solo) or on a server (co-op). Both implement sendInput / sendChoice / callbacks.
import type { Offer, PlayerInput, SimEvent, WorldSnapshot } from "@rift/sim";

export type SnapshotHandler = (snapshot: WorldSnapshot, events: SimEvent[]) => void;
export type OfferHandler = (offer: Offer) => void;

export interface Host {
  start(characterId: string, metaBonuses?: Record<string, number>): void;
  sendInput(input: PlayerInput): void;
  sendChoice(choiceIndex: number): void;
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

  start(characterId: string, metaBonuses?: Record<string, number>): void {
    this.worker.postMessage({ type: "start", characterId, metaBonuses });
  }

  sendInput(input: PlayerInput): void {
    this.worker.postMessage({ type: "input", input });
  }

  sendChoice(choiceIndex: number): void {
    this.worker.postMessage({ type: "choice", choiceIndex });
  }

  onSnapshot(cb: SnapshotHandler): void {
    this.snapshotCb = cb;
  }

  onOffer(cb: OfferHandler): void {
    this.offerCb = cb;
  }
}
