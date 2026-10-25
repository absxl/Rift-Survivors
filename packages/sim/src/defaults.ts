// Core registration: movement + generic behaviors + systems. The default ruleset
// wires them into a pipeline; the real gameplay is driven by content data.
import { registerEnemyBehaviors, registerWeaponBehaviors } from "./behaviors";
import type { Registries } from "./registry";
import { registerCombatSystems } from "./systems/combat";
import { registerEnemySystems } from "./systems/enemy";
import { registerGemSystem } from "./systems/gems";
import { registerPickupSystem } from "./systems/pickups";
import { registerProgression } from "./systems/progression";
import { registerReviveSystem } from "./systems/revive";
import { registerSpatialHash } from "./systems/spatial-hash";
import { registerSpawn } from "./systems/spawn";
import { registerZoneSystem } from "./systems/zones";
import type { RulesetDef, World } from "./world";

export function registerCoreSystems(reg: Registries): void {
  reg.systems.register("core-movement", coreMovement);
  registerEnemyBehaviors(reg);
  registerWeaponBehaviors(reg);
  registerSpatialHash(reg);
  registerSpawn(reg);
  registerEnemySystems(reg);
  registerCombatSystems(reg);
  registerZoneSystem(reg);
  registerGemSystem(reg);
  registerPickupSystem(reg);
  registerProgression(reg);
  registerReviveSystem(reg);
}

/** Move each player by its input for this tick (move-only; no aiming/dash). */
function coreMovement(world: World): void {
  const players = world.stores.players;
  const speed = world.num("core.moveSpeed") * world.stat("moveSpeed", 1);

  players.forEachAlive((slot) => {
    if (players.field("downed")[slot]) return; // downed players can't move
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
    "zones",
    "contact-damage",
    "revive",
    "deaths",
    "gems",
    "pickups",
    "progression",
  ],
  progression: "xp-cards",
  world: "endless-field",
  director: "timeline",
  economy: "gold-shop",
  rules: {
    "core.moveSpeed": 2.5,
    "core.fieldWidth": 1280,
    "core.fieldHeight": 720,
    "director.maxEnemies": 200,
    "director.spawnInterval": 60,
    "director.batchSize": 2,
    "director.rampTicks": 600,
    "director.recycleDistance": 500,
    "director.eliteInterval": 900,
    "director.hpScalePerMin": 0.15,
    "timeline.bossIntervalSec": 300,
    "timeline.finalThreatSec": 1800,
    "timeline.bossRushIntervalSec": 20,
    "player.iFrames": 15,
    "pickup.radius": 10,
    "pickup.magnetRadius": 60,
    "pickup.magnetSpeed": 3,
    "pickup.dropChance": 0.04,
    "pickup.healAmount": 30,
    "pickup.nukeDamage": 50,
    "pickup.freezeTicks": 120,
    "pickup.goldAmount": 10,
    "loadout.weaponSlots": 6,
    "loadout.passiveSlots": 6,
    "levelUp.choices": 3,
    "weapon.orbitSpeed": 0.08,
    "weapon.zoneHitCooldown": 10,
    "status.burnDps": 1,
    "status.reactionDamage": 2,
    "coop.reviveRadius": 26,
    "coop.reviveTicks": 90,
    "coop.reviveHp": 0.5,
    "director.enemyScalePerPlayer": 0.6,
    "director.hpScalePerPlayer": 0.15,
  },
  features: {},
  contentPacks: [],
  xpCurve: [
    5, 8, 12, 18, 25, 35, 50, 70, 100, 140, 190, 260, 350, 470, 620, 820, 1080, 1420, 1860, 2440,
  ],
};
