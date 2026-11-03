// Bot balance benchmark (not part of normal CI). Run with:
//   $env:BALANCE="1"; corepack pnpm --filter @rift/content test -- balance
//
// The bot kites away from the nearest enemy, grabs nearby gems when safe, and
// auto-picks offers with a simple 6-weapons/6-passives build priority. Results
// are written by hand into docs/BALANCE.md.
import { DEFAULT_RULESET, applyChoice, createWorld, step } from "@rift/sim";
import type { OfferOption, RulesetDef, World } from "@rift/sim";
import { describe, it } from "vitest";
import { loadGamePack } from "./index";

const RUN = process.env.BALANCE === "1";
const SEEDS = [101, 202, 303];
const MAX_MINUTES = 32;

function botMove(world: World): { playerId: number; moveX: number; moveY: number } {
  const players = world.stores.players;
  const enemies = world.stores.enemies;
  const gems = world.stores.gems;
  const px = players.field("x")[0];
  const py = players.field("y")[0];

  let nearestEnemy = -1;
  let enemyD2 = 140 * 140;
  enemies.forEachAlive((slot) => {
    const dx = enemies.field("x")[slot] - px;
    const dy = enemies.field("y")[slot] - py;
    const d2 = dx * dx + dy * dy;
    if (d2 < enemyD2) {
      enemyD2 = d2;
      nearestEnemy = slot;
    }
  });

  let nearestGem = -1;
  let gemD2 = 220 * 220;
  gems.forEachAlive((slot) => {
    const dx = gems.field("x")[slot] - px;
    const dy = gems.field("y")[slot] - py;
    const d2 = dx * dx + dy * dy;
    if (d2 < gemD2) {
      gemD2 = d2;
      nearestGem = slot;
    }
  });

  // Pickups (heal/gold/...) aren't magnetized, so walk over the closest one.
  const pickups = world.stores.pickups;
  let nearestPickup = -1;
  let pickupD2 = 170 * 170;
  pickups.forEachAlive((slot) => {
    const dx = pickups.field("x")[slot] - px;
    const dy = pickups.field("y")[slot] - py;
    const d2 = dx * dx + dy * dy;
    if (d2 < pickupD2) {
      pickupD2 = d2;
      nearestPickup = slot;
    }
  });

  let fleeX = 0;
  let fleeY = 0;
  if (nearestEnemy >= 0) {
    const dx = px - enemies.field("x")[nearestEnemy];
    const dy = py - enemies.field("y")[nearestEnemy];
    const len = Math.hypot(dx, dy) || 1;
    // Tangential drift so the bot orbits the swarm instead of backing into it.
    fleeX = dx / len - (dy / len) * 0.35;
    fleeY = dy / len + (dx / len) * 0.35;
    // Imminent contact: run straight away, ignore gems.
    if (enemyD2 < 45 * 45) return { playerId: 0, moveX: fleeX, moveY: fleeY };
  }

  let seekX = 0;
  let seekY = 0;
  const usePickup = nearestPickup >= 0 && (nearestGem < 0 || pickupD2 < gemD2);
  if (usePickup) {
    const dx = pickups.field("x")[nearestPickup] - px;
    const dy = pickups.field("y")[nearestPickup] - py;
    const len = Math.hypot(dx, dy) || 1;
    seekX = dx / len;
    seekY = dy / len;
  } else if (nearestGem >= 0) {
    const dx = gems.field("x")[nearestGem] - px;
    const dy = gems.field("y")[nearestGem] - py;
    const len = Math.hypot(dx, dy) || 1;
    seekX = dx / len;
    seekY = dy / len;
  }

  if (fleeX === 0 && fleeY === 0) {
    if (seekX !== 0 || seekY !== 0) return { playerId: 0, moveX: seekX, moveY: seekY };
    return { playerId: 0, moveX: 1, moveY: 0.3 };
  }

  // Weave toward gems while keeping distance from the swarm.
  const wx = fleeX + seekX * 1.1;
  const wy = fleeY + seekY * 1.1;
  const wlen = Math.hypot(wx, wy) || 1;
  return { playerId: 0, moveX: wx / wlen, moveY: wy / wlen };
}

/** The benchmark bot now respects walls, like a human kiting around terrain. */
function avoidWalls(
  world: World,
  move: { playerId: number; moveX: number; moveY: number },
): { playerId: number; moveX: number; moveY: number } {
  const px = world.stores.players.field("x")[0];
  const py = world.stores.players.field("y")[0];
  const length = Math.hypot(move.moveX, move.moveY);
  if (length < 0.01) return move;
  const base = Math.atan2(move.moveY, move.moveX);
  const offsets = [0, 0.55, -0.55, 1.1, -1.1, 1.65, -1.65, 2.3, -2.3];
  for (const offset of offsets) {
    const angle = base + offset;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let clear = true;
    for (const distance of [10, 20, 30]) {
      if (!world.terrain.isFree(px + dx * distance, py + dy * distance, 6)) {
        clear = false;
        break;
      }
    }
    if (clear) return { playerId: 0, moveX: dx, moveY: dy };
  }
  return move;
}

function optionScore(world: World, playerId: number, option: OfferOption): number {
  const weapons = world.stores.weapons;
  const passives = world.stores.passives;
  let ownedWeapons = 0;
  let ownedPassives = 0;
  weapons.forEachAlive((slot) => {
    if (weapons.field("owner")[slot] === playerId) ownedWeapons++;
  });
  passives.forEachAlive((slot) => {
    if (passives.field("owner")[slot] === playerId) ownedPassives++;
  });

  if (option.isEvolution) return 1000;
  if (option.ref.type === "training") return 450;
  if (option.ref.type === "heal") {
    const hp = world.stores.players.field("hp")[playerId];
    const max = world.stores.players.field("maxHp")[playerId];
    return max > 0 && hp / max < 0.4 ? 900 : 10;
  }
  if (option.ref.type === "gold") return 5;
  if (option.ref.type === "weapon") {
    if (option.level === undefined && ownedWeapons < 6) return 800 - ownedWeapons * 10;
    return 600 + (option.level ?? 1) * 10;
  }
  if (option.ref.type === "passive") {
    if (option.level === undefined && ownedPassives < 6) return 700 - ownedPassives * 10;
    return 500 + (option.level ?? 1) * 10;
  }
  return 0;
}

function chooseOffer(world: World): void {
  const offer = world.pendingOffers()[0];
  if (!offer) return;
  let bestIndex = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  offer.options.forEach((option, index) => {
    const score = optionScore(world, offer.playerId, option);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  applyChoice(world, offer.playerId, bestIndex);
}

interface RunResult {
  seed: number;
  survivedSec: number;
  level: number;
  levelUps: number;
  kills: number;
  gold: number;
  keysFound: number;
  gemsCollected: number;
  xpFromGems: number;
  maxEnemies: number;
  finalThreatSpawned: boolean;
  bossRush: boolean;
  bossRushReason: "killed" | "timeout" | null;
  hpAtEnd: number;
  lastHitKind: string | null;
  lastHitSec: number;
  hitKinds: Record<string, number>;
  weapons: string[];
  passives: string[];
  msPerTick: number;
  totalMs: number;
}

function runSeed(
  pack: ReturnType<typeof loadGamePack>,
  seed: number,
  ruleset: RulesetDef = DEFAULT_RULESET,
): RunResult {
  const world = createWorld(ruleset, { playerCount: 1, content: pack, characterId: "lux" }, seed);
  const started = performance.now();
  let ticks = 0;
  let maxEnemies = 0;
  let levelUps = 0;
  let gemsCollected = 0;
  let xpFromGems = 0;
  let bossRushReason: "killed" | "timeout" | null = null;
  let lastHitKind: string | null = null;
  let lastHitSec = 0;
  const hitKinds: Record<string, number> = {};

  const maxTicks = MAX_MINUTES * 60 * 30;
  for (let t = 0; t < maxTicks && !world.over; t++) {
    const events = step(world, [avoidWalls(world, botMove(world))]);
    ticks++;
    maxEnemies = Math.max(maxEnemies, world.stores.enemies.liveSlots().length);
    for (const e of events) {
      if (e.type === "gem-pickup") {
        gemsCollected++;
        xpFromGems += e.value;
      } else if (e.type === "level-up") {
        levelUps++;
      } else if (e.type === "boss-rush") {
        bossRushReason = e.reason;
      } else if (e.type === "hit" && e.target === "player") {
        lastHitKind = e.kind;
        lastHitSec = Math.round(world.tick / 30);
        hitKinds[e.kind] = (hitKinds[e.kind] ?? 0) + 1;
      }
    }
    while (world.pendingOffers().length > 0) chooseOffer(world);
  }
  const totalMs = performance.now() - started;

  const weaponIds: string[] = [];
  const weapons = world.stores.weapons;
  weapons.forEachAlive((slot) => {
    if (weapons.field("owner")[slot] !== 0) return;
    const def = pack.weapons[weapons.field("defIndex")[slot]];
    if (def) weaponIds.push(`${def.id} L${weapons.field("level")[slot]}`);
  });
  const passiveIds: string[] = [];
  const passives = world.stores.passives;
  passives.forEachAlive((slot) => {
    if (passives.field("owner")[slot] !== 0) return;
    const def = pack.passives[passives.field("defIndex")[slot]];
    if (def) passiveIds.push(`${def.id} L${passives.field("level")[slot]}`);
  });

  return {
    seed,
    survivedSec: Math.round(ticks / 30),
    level: world.partyLevel,
    levelUps,
    kills: world.stores.players.field("kills")[0],
    gold: world.stores.players.field("gold")[0],
    keysFound: world.stores.players.field("keys")[0],
    gemsCollected,
    xpFromGems,
    maxEnemies,
    finalThreatSpawned: world.finalThreatSpawned,
    bossRush: world.bossRush,
    bossRushReason,
    hpAtEnd: world.stores.players.field("hp")[0],
    lastHitKind,
    lastHitSec,
    hitKinds,
    weapons: weaponIds,
    passives: passiveIds,
    msPerTick: totalMs / Math.max(1, ticks),
    totalMs: Math.round(totalMs),
  };
}

(RUN ? describe : describe.skip)("balance", () => {
  it("runs the real pack to the end with a kiting bot", () => {
    const pack = loadGamePack();
    for (const seed of SEEDS) {
      const result = runSeed(pack, seed);
      console.log(`BALANCE ${JSON.stringify(result)}`);
    }
  }, 900_000);

  it("compares tuning variants on the same seed", () => {
    const pack = loadGamePack();
    const variants: Array<{ name: string; rules: Record<string, number> }> = [
      { name: "defaults (new swarm/chests)", rules: {} },
      {
        name: "old pace (60/2, 30s chests)",
        rules: {
          "director.spawnInterval": 60,
          "director.batchSize": 2,
          "director.eliteInterval": 900,
        },
      },
      { name: "new swarm + 30s chests", rules: { "director.eliteInterval": 900 } },
    ];
    for (const variant of variants) {
      const ruleset: RulesetDef = {
        ...DEFAULT_RULESET,
        rules: { ...DEFAULT_RULESET.rules, ...variant.rules },
      };
      const r = runSeed(pack, 101, ruleset);
      const itemLevels = [...r.weapons, ...r.passives]
        .map((entry) => Number(entry.split(" L")[1] ?? 0))
        .reduce((a, b) => a + b, 0);
      console.log(
        `VARIANT ${JSON.stringify({
          name: variant.name,
          survivedSec: r.survivedSec,
          level: r.level,
          kills: r.kills,
          gold: r.gold,
          maxEnemies: r.maxEnemies,
          itemLevels,
          bossRush: r.bossRush,
          bossRushReason: r.bossRushReason,
          msPerTick: Number(r.msPerTick.toFixed(4)),
        })}`,
      );
    }
  }, 900_000);
});
