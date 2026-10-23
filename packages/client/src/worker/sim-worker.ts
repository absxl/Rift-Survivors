// Solo-mode simulation host: runs packages/sim at a fixed 30 Hz in a Web Worker.
// The worker owns the tick loop; the main thread sends inputs and receives snapshots.
import { DEFAULT_RULESET, TICK_MS, createWorld, snapshot, step } from "@rift/sim";
import type { PlayerInput } from "@rift/sim";

interface WorkerScope {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
}
const ctx = self as unknown as WorkerScope;

const world = createWorld(DEFAULT_RULESET, { playerCount: 1 }, 20261023);
let currentInput: PlayerInput = { playerId: 0, moveX: 0, moveY: 0 };

ctx.onmessage = (event: MessageEvent) => {
  const msg = event.data as { type?: string; input?: PlayerInput };
  if (msg.type === "input" && msg.input) currentInput = msg.input;
};

setInterval(() => {
  step(world, [currentInput]);
  ctx.postMessage({ type: "snapshot", snapshot: snapshot(world) });
}, TICK_MS);
