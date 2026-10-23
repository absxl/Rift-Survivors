// Host abstraction: the game code doesn't care whether the sim runs in a Worker
// (solo) or on a server (co-op). Both implement sendInput / onSnapshot.
import type { PlayerInput, WorldSnapshot } from "@rift/sim";

export interface Host {
  sendInput(input: PlayerInput): void;
  onSnapshot(cb: (snapshot: WorldSnapshot) => void): void;
}

export class WorkerHost implements Host {
  private readonly worker: Worker;
  private snapshotCb: ((s: WorldSnapshot) => void) | null = null;

  constructor() {
    this.worker = new Worker(new URL("./worker/sim-worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (event: MessageEvent) => {
      const msg = event.data as { type?: string; snapshot?: WorldSnapshot };
      if (msg.type === "snapshot" && msg.snapshot && this.snapshotCb) this.snapshotCb(msg.snapshot);
    };
  }

  sendInput(input: PlayerInput): void {
    this.worker.postMessage({ type: "input", input });
  }

  onSnapshot(cb: (s: WorldSnapshot) => void): void {
    this.snapshotCb = cb;
  }
}
