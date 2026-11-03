// Solo-mode simulation host: runs packages/sim at a fixed 30 Hz in a Web Worker.
// Waits for a "start" message, ticks; pauses on pending offers (level-up) and on
// the client pause menu; resumes on choice/resume.
import { loadGamePack } from "@rift/content";
import {
  DEFAULT_RULESET,
  TICK_MS,
  applyChoice,
  banishOfferOption,
  createWorld,
  rerollOffer,
  skipOffer,
  snapshot,
  step,
} from "@rift/sim";
import type { PlayerInput, World } from "@rift/sim";

interface WorkerScope {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
}
const ctx = self as unknown as WorkerScope;

// Fallback only; the client passes a fresh random seed for every run so world
// generation differs between sessions while each run stays deterministic.
const SEED = 20261023;
const pack = loadGamePack();

let world: World | null = null;
let currentInput: PlayerInput = { playerId: 0, moveX: 0, moveY: 0 };
let paused = false;
let clientPaused = false;
// Wall-clock pacing only — the sim itself is always stepped by fixed ticks.
let nextTickAt = Date.now() + TICK_MS;

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
  nextTickAt += TICK_MS;
  const delay = nextTickAt - Date.now();
  if (delay <= 0) {
    // Fell behind (background tab, GC pause): resync instead of bursting.
    nextTickAt = Date.now();
    setTimeout(loop, 0);
  } else {
    setTimeout(loop, delay);
  }
}

function postOffer(): void {
  const offer = world?.pendingOffers()[0];
  if (offer) ctx.postMessage({ type: "offer", offer });
}

ctx.onmessage = (event: MessageEvent) => {
  const msg = event.data as {
    type?: string;
    input?: PlayerInput;
    choiceIndex?: number;
    optionIndex?: number;
    characterId?: string;
    metaBonuses?: Record<string, number>;
    stageId?: string;
    seed?: number;
    itemId?: string;
    slot?: number;
  };
  if (msg.type === "input" && msg.input) currentInput = msg.input;
  else if (msg.type === "pause") clientPaused = true;
  else if (msg.type === "resume") clientPaused = false;
  else if (msg.type === "choice" && world) {
    applyChoice(world, 0, msg.choiceIndex ?? 0);
    const next = world.pendingOffers()[0];
    if (next) ctx.postMessage({ type: "offer", offer: next });
    else paused = false;
  } else if (msg.type === "reroll" && world) {
    rerollOffer(world, 0);
    postOffer();
  } else if (msg.type === "skip" && world) {
    if (skipOffer(world, 0)) {
      const next = world.pendingOffers()[0];
      if (next) ctx.postMessage({ type: "offer", offer: next });
      else paused = false;
    } else {
      postOffer();
    }
  } else if (msg.type === "banish" && world) {
    banishOfferOption(world, 0, msg.optionIndex ?? 0);
    postOffer();
  } else if (msg.type === "buy" && world) {
    if (msg.itemId) world.buyItem(0, msg.itemId);
  } else if (msg.type === "combine" && world) {
    if (msg.itemId) world.combineItem(0, msg.itemId);
  } else if (msg.type === "sell" && world) {
    if (typeof msg.slot === "number") world.sellItem(0, msg.slot);
  } else if (msg.type === "start") {
    world = createWorld(
      DEFAULT_RULESET,
      {
        playerCount: 1,
        content: pack,
        characterId: msg.characterId,
        metaBonuses: msg.metaBonuses,
        stageId: msg.stageId,
      },
      typeof msg.seed === "number" ? msg.seed >>> 0 : SEED,
    );
    paused = false;
    clientPaused = false;
    nextTickAt = Date.now() + TICK_MS;
  }
};

setTimeout(loop, TICK_MS);
