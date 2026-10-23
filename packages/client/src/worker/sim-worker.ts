// Solo-mode simulation host: runs packages/sim at a fixed 30 Hz in a Web Worker.
// The worker owns the tick loop; it pauses on a pending offer (level-up) and
// resumes when the main thread sends a choice.
import { loadCorePack } from "@rift/content";
import { DEFAULT_RULESET, TICK_MS, applyChoice, createWorld, snapshot, step } from "@rift/sim";
import type { PlayerInput } from "@rift/sim";

interface WorkerScope {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
}
const ctx = self as unknown as WorkerScope;

const world = createWorld(DEFAULT_RULESET, { playerCount: 1, content: loadCorePack() }, 20261023);
let currentInput: PlayerInput = { playerId: 0, moveX: 0, moveY: 0 };
let paused = false;

function loop(): void {
  if (!paused) {
    const events = step(world, [currentInput]);
    ctx.postMessage({ type: "snapshot", snapshot: snapshot(world), events });
    const offers = world.pendingOffers();
    if (offers.length > 0) {
      paused = true;
      ctx.postMessage({ type: "offer", offer: offers[0] });
    }
  }
  setTimeout(loop, TICK_MS);
}

ctx.onmessage = (event: MessageEvent) => {
  const msg = event.data as { type?: string; input?: PlayerInput; choiceIndex?: number };
  if (msg.type === "input" && msg.input) currentInput = msg.input;
  else if (msg.type === "choice") {
    applyChoice(world, 0, msg.choiceIndex ?? 0);
    paused = false;
  }
};

setTimeout(loop, TICK_MS);
