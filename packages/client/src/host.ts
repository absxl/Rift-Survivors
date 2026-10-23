// Host abstraction: the game code doesn't care whether the sim runs in a Worker
// (solo) or on a server (co-op). Both implement sendInput / onSnapshot.
import type { PlayerInput, SimEvent, WorldSnapshot } from "@rift/sim";

export type SnapshotHandler = (snapshot: WorldSnapshot, events: SimEvent[]) => void;

export interface Host {
  sendInput(input: PlayerInput): void;
  onSnapshot(cb: SnapshotHandler): void;
}

export class WorkerHost implements Host {
  private readonly worker: Worker;
  private snapshotCb: SnapshotHandler | null = null;

  constructor() {
    this.worker = new Worker(new URL("./worker/sim-worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (event: MessageEvent) => {
      const msg = event.data as { type?: string; snapshot?: WorldSnapshot; events?: SimEvent[] };
      if (msg.type === "snapshot" && msg.snapshot && this.snapshotCb) {
        this.snapshotCb(msg.snapshot, msg.events ?? []);
      }
    };
  }

  sendInput(input: PlayerInput): void {
    this.worker.postMessage({ type: "input", input });
  }

  onSnapshot(cb: SnapshotHandler): void {
    this.snapshotCb = cb;
  }
}
