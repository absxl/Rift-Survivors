// Core registration: movement + generic behaviors + systems. The default ruleset
// wires them into a pipeline; the real gameplay is driven by content data.
import { registerAbilityBehaviors, registerEnemyBehaviors } from "./behaviors";
import type { Registries } from "./registry";
import { registerBushSystem } from "./systems/bushes";
import { registerChestSystem } from "./systems/chests";
import { damagePlayer, registerCombatSystems } from "./systems/combat";
import { registerEnemySystems } from "./systems/enemy";
import { registerEnemyAbilitySystem } from "./systems/enemy-abilities";
import { registerGemSystem } from "./systems/gems";
import { registerPickupSystem } from "./systems/pickups";
import { registerProgression } from "./systems/progression";
import { registerRegenSystem } from "./systems/regen";
import { registerReviveSystem } from "./systems/revive";
import { registerSeparationSystem } from "./systems/separation";
import { registerSpatialHash } from "./systems/spatial-hash";
import { registerSpawn } from "./systems/spawn";
import { registerZoneSystem } from "./systems/zones";
import type { RulesetDef, World } from "./world";

export function registerCoreSystems(reg: Registries): void {
  reg.systems.register("core-movement", coreMovement);
  registerBushSystem(reg);
  registerChestSystem(reg);
  reg.systems.register("pathing", (world) => world.pathfinder.update(world));
  registerEnemyBehaviors(reg);
  registerAbilityBehaviors(reg);
  registerSpatialHash(reg);
  registerSpawn(reg);
  registerEnemySystems(reg);
  registerEnemyAbilitySystem(reg);
  registerCombatSystems(reg);
  registerZoneSystem(reg);
  registerGemSystem(reg);
  registerPickupSystem(reg);
  registerProgression(reg);
  registerReviveSystem(reg);
  registerRegenSystem(reg);
  registerSeparationSystem(reg);
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

    const terrainMul = world.terrainStep(slot);
    const moveX = mx * speed * terrainMul;
    const moveY = my * speed * terrainMul;
    const oldX = players.field("x")[slot];
    const oldY = players.field("y")[slot];
    players.field("x")[slot] = oldX + moveX;
    players.field("y")[slot] = oldY + moveY;
    if (!world.playerLevitates(slot)) {
      const resolved = world.terrain.collide(players.field("x")[slot], players.field("y")[slot], 6);
      players.field("x")[slot] = resolved.x;
      players.field("y")[slot] = resolved.y;
    }
    players.field("velocityX")[slot] = players.field("x")[slot] - oldX;
    players.field("velocityY")[slot] = players.field("y")[slot] - oldY;

    if (mx !== 0 || my !== 0) {
      players.field("facingX")[slot] = mx;
      players.field("facingY")[slot] = my;
    }

    // Terrain damage (lava/void) is a once-per-second environmental tick, not
    // a contact hit. Levitating characters ignore it entirely.
    const danger = world.terrain.liquidDamageAt(
      players.field("x")[slot],
      players.field("y")[slot],
      world.playerLevitates(slot),
    );
    if (danger > 0 && world.tick > 0 && world.tick % 30 === 0) {
      damagePlayer(
        world,
        slot,
        danger,
        players.field("x")[slot],
        players.field("y")[slot],
        "terrain",
      );
    }
  });
}

export const DEFAULT_RULESET: RulesetDef = {
  id: "classic",
  schemaVersion: 1,
  pipeline: [
    "core-movement",
    "bushes",
    "chests",
    "pathing",
    "spawn-director",
    "enemy-ai",
    "enemy-abilities",
    "enemy-hazards",
    "spatial-hash",
    "separation",
    "abilities",
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
    "pickup.nukeDropChance": 0.0025,
    "pickup.eliteGold": 10,
    "pickup.bossGold": 25,
    "pickup.healAmount": 30,
    "pickup.bushHealAmount": 18,
    "pickup.nukeDamage": 50,
    "pickup.freezeTicks": 120,
    "enemy.rangedAbilityChance": 0.18,
    "enemy.abilityChancePerMin": 0.012,
    "enemy.baseSpeedScale": 1.05,
    "enemy.speedScalePerMin": 0.018,
    "enemy.damageScalePerMin": 0.05,
    "pickup.goldAmount": 5,
    "pickup.keyAmount": 1,
    "chest.firstSpawnSec": 25,
    "chest.spawnIntervalSec": 55,
    "chest.maxActive": 1,
    "chest.openRadius": 24,
    "chest.holdRadius": 38,
    "chest.openTicks": 90,
    "chest.xpBase": 18,
    "chest.xpPerMin": 7,
    "chest.goldBase": 14,
    "chest.goldPerMin": 5,
    "chest.keyChance": 0.35,
    "chest.magnetChance": 0.35,
    "chest.bombChance": 0.2,
    "loadout.abilitySlots": 8,
    "loadout.passiveSlots": 6,
    "levelUp.choices": 3,
    "levelUp.rerolls": 3,
    "levelUp.skips": 2,
    "levelUp.banishes": 2,
    "xp.growthPerLevel": 4,
    "ability.orbitSpeed": 0.08,
    "ability.zoneHitCooldown": 10,
    "status.burnDps": 1,
    "status.reactionDamage": 2,
    "separation.strength": 0.5,
    "separation.maxPush": 1,
    "coop.reviveRadius": 26,
    "coop.reviveTicks": 90,
    "coop.reviveHp": 0.5,
    "director.enemyScalePerPlayer": 0.6,
    "director.hpScalePerPlayer": 0.15,
  },
  features: {},
  contentPacks: [],
  xpCurve: [5, 8, 12, 18, 25, 35, 45, 58, 72, 86, 98, 110, 122, 134, 146, 158, 170, 182, 194, 206],
};
