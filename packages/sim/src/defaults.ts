// Core registration: movement + generic behaviors + systems. The default ruleset
// wires them into a pipeline; the real gameplay is driven by content data.
import { registerEnemyBehaviors, registerWeaponBehaviors } from "./behaviors";
import type { Registries } from "./registry";
import { registerCombatSystems } from "./systems/combat";
import { registerEnemySystems } from "./systems/enemy";
import { registerGemSystem } from "./systems/gems";
import { registerPickupSystem } from "./systems/pickups";
import { registerProgression } from "./systems/progression";
import { registerRegenSystem } from "./systems/regen";
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
  registerRegenSystem(reg);
}

/** Move each player by its input for this tick (move-only; no aiming/dash). */
function coreMovement(world: World): void {
  const players = world.stores.players;
  const baseSpeed = world.num("core.moveSpeed");

  players.forEachAlive((slot) => {
    if (players.field("downed")[slot]) return; // downed players can't move
    const speed = baseSpeed * world.playerStat(slot, "moveSpeed", 1);
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
    "regen",
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
    "director.spawnInterval": 30,
    "director.batchSize": 3,
    "director.rampTicks": 600,
    "director.recycleDistance": 500,
    "director.patternInterval": 450,
    "director.eliteInterval": 2700,
    "director.hpScalePerMin": 0.15,
    "timeline.bossIntervalSec": 300,
    "timeline.finalThreatSec": 1800,
    "timeline.bossRushIntervalSec": 20,
    "timeline.bossRushFallbackSec": 45,
    "player.iFrames": 15,
    "pickup.radius": 10,
    "pickup.magnetRadius": 60,
    "pickup.magnetSpeed": 3,
    "pickup.dropChance": 0.04,
    "pickup.goldDropChance": 0.05,
    "pickup.chestDropChance": 0.01,
    "pickup.nukeDropChance": 0.0025,
    "pickup.eliteGold": 10,
    "pickup.bossGold": 25,
    "pickup.healAmount": 30,
    "pickup.nukeDamage": 50,
    "pickup.freezeTicks": 120,
    "pickup.goldAmount": 5,
    "loadout.weaponSlots": 6,
    "loadout.passiveSlots": 6,
    "levelUp.choices": 3,
    "levelUp.rerolls": 3,
    "levelUp.skips": 2,
    "levelUp.banishes": 2,
    "xp.growthPerLevel": 7,
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
    5, 8, 12, 18, 25, 35, 50, 70, 100, 140, 160, 167, 174, 181, 188, 195, 202, 209, 216, 223,
  ],
};
