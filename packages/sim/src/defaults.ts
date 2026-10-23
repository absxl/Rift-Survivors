// Core (generic) systems and the default ruleset. These exist to prove the kernel
// works deterministically; the real gameplay systems land in M3+ and are selected
// by the ruleset pipeline, never hard-coded.

import type { Registries } from "./registry";
import type { RulesetDef, World } from "./world";

export function registerCoreSystems(reg: Registries): void {
  reg.systems.register("core-movement", coreMovement);
  reg.systems.register("core-demo-spawn", coreDemoSpawn);
}

/** Move each player by its input for this tick (move-only; no aiming/dash). */
function coreMovement(world: World): void {
  const players = world.stores.players;
  const speed = world.num("core.moveSpeed");
  const maxX = world.num("core.fieldWidth");
  const maxY = world.num("core.fieldHeight");

  players.forEachAlive((slot) => {
    const input = world.inputs.find((i) => i.playerId === slot);
    let mx = 0;
    let my = 0;
    if (input) {
      const len = Math.hypot(input.moveX, input.moveY);
      if (len > 1) {
        mx = input.moveX / len;
        my = input.moveY / len;
      } else {
        mx = input.moveX;
        my = input.moveY;
      }
    }

    const nx = Math.max(0, Math.min(maxX, players.field("x")[slot] + mx * speed));
    const ny = Math.max(0, Math.min(maxY, players.field("y")[slot] + my * speed));
    players.field("x")[slot] = nx;
    players.field("y")[slot] = ny;

    if (mx !== 0 || my !== 0) {
      players.field("facingX")[slot] = mx;
      players.field("facingY")[slot] = my;
    }
  });
}

/** Placeholder spawner: periodically adds enemies and gems around the local player. */
function coreDemoSpawn(world: World): void {
  const players = world.stores.players;
  if (players.count === 0) return;
  const playerX = players.field("x")[0];
  const playerY = players.field("y")[0];

  const enemyInterval = world.num("core.spawnInterval");
  const enemies = world.stores.enemies;
  if (world.tick % enemyInterval === 0 && enemies.count < world.num("core.maxDemoEnemies")) {
    const slot = enemies.alloc();
    if (slot >= 0) {
      const angle = world.rng.range(0, Math.PI * 2);
      const dist = world.rng.range(120, 280);
      enemies.field("x")[slot] = playerX + Math.cos(angle) * dist;
      enemies.field("y")[slot] = playerY + Math.sin(angle) * dist;
      enemies.field("hp")[slot] = 10;
      enemies.field("kind")[slot] = 1;
    }
  }

  const gemInterval = world.num("core.gemInterval");
  if (world.tick % gemInterval === 0) {
    const gems = world.stores.gems;
    const slot = gems.alloc();
    if (slot >= 0) {
      gems.field("x")[slot] = playerX + world.rng.range(-150, 150);
      gems.field("y")[slot] = playerY + world.rng.range(-150, 150);
      gems.field("value")[slot] = 1;
    }
  }
}

export const DEFAULT_RULESET: RulesetDef = {
  id: "classic",
  schemaVersion: 1,
  pipeline: ["core-movement", "core-demo-spawn"],
  progression: "xp-cards",
  world: "endless-field",
  director: "timeline",
  economy: "gold-shop",
  rules: {
    "core.moveSpeed": 2.5,
    "core.spawnInterval": 10,
    "core.gemInterval": 20,
    "core.fieldWidth": 1280,
    "core.fieldHeight": 720,
    "core.maxDemoEnemies": 300,
  },
  features: {},
  contentPacks: [],
};
