// Solo-mode simulation host: runs packages/sim at a fixed 30 Hz in a Web Worker.
// Waits for a "start" message, ticks; pauses on pending offers (level-up) and on
// the client pause menu; resumes on choice/resume.
import { loadGamePack } from "@rift/content";
import { DEFAULT_RULESET, TICK_MS, applyChoice, createWorld, snapshot, step } from "@rift/sim";
import type { PlayerInput, World } from "@rift/sim";

interface WorkerScope {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
}
const ctx = self as unknown as WorkerScope;

const SEED = 20261023;
const pack = loadGamePack();

let world: World | null = null;
let currentInput: PlayerInput = { playerId: 0, moveX: 0, moveY: 0 };
let paused = false;
let clientPaused = false;

function loop(): void {
  if (world && !paused && !clientPaused && !world.over) {
    try {
      const events = step(world, [currentInput]);
      ctx.postMessage({ type: "snapshot", snapshot: snapshot(world), events });
      const offers = world.pendingOffers();
      if (offers.length > 0) {
        paused = true;
        ctx.postMessage({ type: "offer", offer: offers[0] });
      }
    } catch (err) {
      // Never let one bad tick silently stop the game: log and end the run.
      console.error("[sim-worker] tick error", err);
      world.over = true;
      ctx.postMessage({ type: "snapshot", snapshot: snapshot(world), events: [] });
    }
  }
  setTimeout(loop, TICK_MS);
}

ctx.onmessage = (event: MessageEvent) => {
  const msg = event.data as {
    type?: string;
    input?: PlayerInput;
    choiceIndex?: number;
    characterId?: string;
    metaBonuses?: Record<string, number>;
  };
  if (msg.type === "input" && msg.input) currentInput = msg.input;
  else if (msg.type === "pause") clientPaused = true;
  else if (msg.type === "resume") clientPaused = false;
  else if (msg.type === "choice" && world) {
    applyChoice(world, 0, msg.choiceIndex ?? 0);
    paused = false;
  } else if (msg.type === "start") {
    world = createWorld(
      DEFAULT_RULESET,
      {
        playerCount: 1,
        content: pack,
        characterId: msg.characterId,
        metaBonuses: msg.metaBonuses,
      },
      SEED,
    );
    paused = false;
    clientPaused = false;
  }
};

setTimeout(loop, TICK_MS);
