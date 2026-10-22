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

    players.field("x")[slot] += mx * speed;
    players.field("y")[slot] += my * speed;
    if (mx !== 0 || my !== 0) {
      players.field("facingX")[slot] = mx;
      players.field("facingY")[slot] = my;
    }
  });
}

/** Placeholder spawner: periodically adds an enemy at a random spot via the RNG. */
function coreDemoSpawn(world: World): void {
  const interval = world.num("core.spawnInterval");
  if (world.tick % interval !== 0) return;

  const enemies = world.stores.enemies;
  const slot = enemies.alloc();
  if (slot < 0) return;

  enemies.field("x")[slot] = world.rng.range(0, world.num("core.fieldWidth"));
  enemies.field("y")[slot] = world.rng.range(0, world.num("core.fieldHeight"));
  enemies.field("hp")[slot] = 10;
  enemies.field("kind")[slot] = 1;
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
    "core.fieldWidth": 480,
    "core.fieldHeight": 270,
  },
  features: {},
  contentPacks: [],
};
