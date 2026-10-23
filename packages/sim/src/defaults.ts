// Core registration: movement + generic behaviors + systems. The default ruleset
// wires them into a pipeline; the real gameplay is driven by content data.
import { registerEnemyBehaviors, registerWeaponBehaviors } from "./behaviors";
import type { Registries } from "./registry";
import { registerCombatSystems } from "./systems/combat";
import { registerEnemySystems } from "./systems/enemy";
import { registerGemSystem } from "./systems/gems";
import { registerSpatialHash } from "./systems/spatial-hash";
import { registerSpawn } from "./systems/spawn";
import type { RulesetDef, World } from "./world";

export function registerCoreSystems(reg: Registries): void {
  reg.systems.register("core-movement", coreMovement);
  registerEnemyBehaviors(reg);
  registerWeaponBehaviors(reg);
  registerSpatialHash(reg);
  registerSpawn(reg);
  registerEnemySystems(reg);
  registerCombatSystems(reg);
  registerGemSystem(reg);
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

export const DEFAULT_RULESET: RulesetDef = {
  id: "classic",
  schemaVersion: 1,
  pipeline: [
    "core-movement",
    "spawn-director",
    "enemy-ai",
    "spatial-hash",
    "weapons",
    "projectiles",
    "contact-damage",
    "deaths",
    "gems",
  ],
  progression: "xp-cards",
  world: "endless-field",
  director: "timeline",
  economy: "gold-shop",
  rules: {
    "core.moveSpeed": 2.5,
    "core.fieldWidth": 1280,
    "core.fieldHeight": 720,
    "director.maxEnemies": 300,
    "director.spawnInterval": 30,
    "director.batchSize": 5,
    "director.recycleDistance": 500,
    "player.iFrames": 15,
    "pickup.radius": 10,
    "pickup.magnetRadius": 60,
    "pickup.magnetSpeed": 3,
  },
  features: {},
  contentPacks: [],
};
