import type { EnemyDef } from "../content-types";
// Original monster ability archetypes. These are deliberately generic
// spell-shapes (bolt, fan, rune, beam, shield, dash, summon) rather than copies
// of champion code or art. Elites/bosses layer them on top of normal behavior.
import type { Registries } from "../registry";
import type { World } from "../world";
import { damagePlayer } from "./combat";
import { spawnEnemyAt } from "./spawn";

export const NO_ABILITY = 0xffff;
export const ENEMY_ABILITY_SLOTS = 5;

export interface EnemyAbilityDef {
  id: number;
  name: string;
  cooldown: number;
  range: number;
  utility?: boolean;
}

export const ENEMY_ABILITIES: EnemyAbilityDef[] = [
  { id: 0, name: "Arc Bolt", cooldown: 170, range: 280 },
  { id: 1, name: "Split Volley", cooldown: 210, range: 250 },
  { id: 2, name: "Rune Mine", cooldown: 190, range: 220 },
  { id: 3, name: "Frost Ring", cooldown: 240, range: 210 },
  { id: 4, name: "Searing Beam", cooldown: 260, range: 280 },
  { id: 5, name: "Meteor", cooldown: 330, range: 260 },
  { id: 6, name: "Hex Shield", cooldown: 300, range: 180, utility: true },
  { id: 7, name: "Warp Dash", cooldown: 210, range: 260, utility: true },
  { id: 8, name: "Summon Swarm", cooldown: 360, range: 300, utility: true },
  { id: 9, name: "Chain Spark", cooldown: 220, range: 240 },
];

export const OFFENSIVE_ABILITIES = [0, 1, 2, 3, 4, 5, 9];
export const UTILITY_ABILITIES = [6, 7, 8];

export function registerEnemyAbilitySystem(reg: Registries): void {
  reg.systems.register("enemy-abilities", enemyAbilities);
  reg.systems.register("enemy-hazards", enemyHazards);
}

function abilityField(slot: number): `ability${number}` {
  return `ability${slot}` as `ability${number}`;
}

function cooldownField(slot: number): `abilityCd${number}` {
  return `abilityCd${slot}` as `abilityCd${number}`;
}

function choose<T>(world: World, pool: T[], used: Set<T>): T | null {
  const available = pool.filter((entry) => !used.has(entry));
  if (available.length === 0) return null;
  const choice = available[world.rng.int(0, available.length - 1)];
  used.add(choice);
  return choice;
}

/** Assign the agreed category counts: 1/2/4/5 for some ranged minions, elites,
 * bosses, and final threats. The base enemy behavior still runs independently. */
export function assignEnemyAbilities(world: World, slot: number, def: EnemyDef): void {
  const enemies = world.stores.enemies;
  for (let i = 0; i < ENEMY_ABILITY_SLOTS; i++) {
    enemies.field(abilityField(i))[slot] = NO_ABILITY;
    enemies.field(cooldownField(i))[slot] = 0;
  }

  const used = new Set<number>();
  const picks: number[] = [];
  const category = def.category;
  if (category === "minion") {
    // Every minion can roll an original ranged ability. The chance ramps with
    // run time so early waves are readable, and dedicated ranged/fan archetypes
    // are more likely to have one on top of their base attack.
    const casterBonus = def.behavior === "ranged" || def.behavior === "fan" ? 1.5 : 1;
    const baseChance =
      world.num("enemy.rangedAbilityChance") +
      world.enemyTimeMinutes() * world.num("enemy.abilityChancePerMin");
    const chance = Math.min(1, baseChance * casterBonus);
    if (!world.rng.chance(chance)) return;
    const pick = choose(world, OFFENSIVE_ABILITIES, used);
    if (pick !== null) picks.push(pick);
  } else if (category === "elite") {
    const first = choose(world, OFFENSIVE_ABILITIES, used);
    const second = choose(world, UTILITY_ABILITIES, used);
    if (first !== null) picks.push(first);
    if (second !== null) picks.push(second);
  } else if (category === "boss") {
    for (let i = 0; i < 3; i++) {
      const pick = choose(world, OFFENSIVE_ABILITIES, used);
      if (pick !== null) picks.push(pick);
    }
    const utility = choose(world, UTILITY_ABILITIES, used);
    if (utility !== null) picks.push(utility);
  } else if (category === "final-threat") {
    for (let i = 0; i < 4; i++) {
      const pick = choose(world, OFFENSIVE_ABILITIES, used);
      if (pick !== null) picks.push(pick);
    }
    const utility = choose(world, UTILITY_ABILITIES, used);
    if (utility !== null) picks.push(utility);
  }

  // Stagger opening casts so a boss does not unload its whole kit on arrival.
  const scale =
    category === "minion" ? 1.55 : category === "elite" ? 1.2 : category === "boss" ? 1 : 0.9;
  for (let i = 0; i < picks.length; i++) {
    const ability = ENEMY_ABILITIES[picks[i]];
    enemies.field(abilityField(i))[slot] = ability.id;
    const jitter = world.rng.range(0.85, 1.15);
    enemies.field(cooldownField(i))[slot] = Math.max(
      20,
      Math.floor(world.rng.range(35, 110) + ability.cooldown * scale * jitter),
    );
  }
}

function nearestPlayer(
  world: World,
  x: number,
  y: number,
  maxRange: number,
): { slot: number; x: number; y: number; dx: number; dy: number; dist: number } | null {
  const players = world.stores.players;
  let best = -1;
  let bestD2 = maxRange * maxRange;
  players.forEachAlive((slot) => {
    if (players.field("downed")[slot]) return;
    const dx = players.field("x")[slot] - x;
    const dy = players.field("y")[slot] - y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= bestD2) {
      bestD2 = d2;
      best = slot;
    }
  });
  if (best < 0) return null;
  const dist = Math.sqrt(bestD2) || 1;
  return {
    slot: best,
    x: players.field("x")[best],
    y: players.field("y")[best],
    dx: (players.field("x")[best] - x) / dist,
    dy: (players.field("y")[best] - y) / dist,
    dist,
  };
}

function spawnHostileProjectile(
  world: World,
  x: number,
  y: number,
  angle: number,
  speed: number,
  damage: number,
  lifetime: number,
): void {
  const store = world.stores.projectiles;
  const slot = store.alloc();
  if (slot < 0) return;
  store.field("x")[slot] = x;
  store.field("y")[slot] = y;
  store.field("vx")[slot] = Math.cos(angle) * speed;
  store.field("vy")[slot] = Math.sin(angle) * speed;
  store.field("damage")[slot] = damage;
  store.field("pierce")[slot] = 0;
  store.field("hitCooldown")[slot] = 0;
  store.field("knockback")[slot] = 0;
  store.field("lifetime")[slot] = lifetime;
  store.field("owner")[slot] = 255;
  store.field("mode")[slot] = 5;
  store.field("p1")[slot] = 0;
  store.field("p2")[slot] = 0;
}

function spawnHazard(
  world: World,
  x: number,
  y: number,
  radius: number,
  damage: number,
  ticks: number,
  kind: number,
  angle: number,
  length: number,
): void {
  const store = world.stores.hazards;
  const slot = store.alloc();
  if (slot < 0) return;
  store.field("x")[slot] = x;
  store.field("y")[slot] = y;
  store.field("radius")[slot] = radius;
  store.field("damage")[slot] = damage;
  store.field("ticks")[slot] = Math.max(1, Math.floor(ticks));
  store.field("kind")[slot] = kind;
  store.field("angle")[slot] = angle;
  store.field("length")[slot] = length;
}

function enemyAbilities(world: World): void {
  const enemies = world.stores.enemies;
  enemies.forEachAlive((slot) => {
    const def = world.content.enemies[enemies.field("kind")[slot]];
    if (!def) return;
    if (enemies.field("freezeTicks")[slot] > 0) {
      for (let i = 0; i < ENEMY_ABILITY_SLOTS; i++) {
        const cd = enemies.field(cooldownField(i))[slot];
        if (cd > 0) enemies.field(cooldownField(i))[slot] = cd - 1;
      }
      return;
    }

    const x = enemies.field("x")[slot];
    const y = enemies.field("y")[slot];
    for (let i = 0; i < ENEMY_ABILITY_SLOTS; i++) {
      const abilityId = enemies.field(abilityField(i))[slot];
      if (abilityId === NO_ABILITY || abilityId >= ENEMY_ABILITIES.length) continue;
      const cd = enemies.field(cooldownField(i))[slot];
      if (cd > 0) {
        enemies.field(cooldownField(i))[slot] = cd - 1;
        continue;
      }
      const ability = ENEMY_ABILITIES[abilityId];
      const target = nearestPlayer(world, x, y, ability.range);
      if (!target) continue;
      const cast = executeAbility(world, slot, def, ability, target, x, y);
      if (cast) {
        const categoryScale = def.category === "minion" ? 1.55 : def.category === "elite" ? 1.2 : 1;
        enemies.field(cooldownField(i))[slot] = Math.max(
          20,
          Math.floor(ability.cooldown * categoryScale),
        );
      }
    }
  });
}

function executeAbility(
  world: World,
  slot: number,
  def: EnemyDef,
  ability: EnemyAbilityDef,
  target: { slot: number; x: number; y: number; dx: number; dy: number; dist: number },
  x: number,
  y: number,
): boolean {
  const enemies = world.stores.enemies;
  const angle = Math.atan2(target.dy, target.dx);
  const damage = Math.max(1, world.enemyDamage(def.damage));

  switch (ability.id) {
    case 0: // Arc Bolt
      spawnHostileProjectile(world, x, y, angle, 2.8, damage * 1.15, 130);
      return true;
    case 1: // Split Volley
      for (let i = -1; i <= 1; i++) {
        spawnHostileProjectile(world, x, y, angle + i * 0.28, 2.5, damage * 0.8, 120);
      }
      return true;
    case 2: // Rune Mine
      spawnHazard(world, target.x, target.y, 36, damage * 1.5, 36, 0, 0, 0);
      return true;
    case 3: // Frost Ring
      for (let i = 0; i < 10; i++) {
        spawnHostileProjectile(world, x, y, (i / 10) * Math.PI * 2, 1.8, damage * 0.65, 105);
      }
      return true;
    case 4: // Searing Beam
      spawnHazard(world, x, y, 9, damage * 1.7, 32, 1, angle, 260);
      return true;
    case 5: // Meteor
      spawnHazard(world, target.x, target.y, 58, damage * 2.2, 58, 0, 0, 0);
      return true;
    case 6: // Hex Shield
      enemies.field("shield")[slot] = Math.max(
        enemies.field("shield")[slot],
        def.hp * 0.16 + damage,
      );
      world.emit({
        type: "enemy-shield",
        x,
        y,
        radius: Math.max(12, def.radius * 1.4),
        amount: enemies.field("shield")[slot],
      });
      return true;
    case 7: {
      // Warp Dash
      const distance = Math.min(90, Math.max(35, target.dist * 0.35));
      const nx = x + target.dx * distance;
      const ny = y + target.dy * distance;
      const resolved = world.terrain.collide(nx, ny, Math.max(5, def.radius * 0.9));
      enemies.field("x")[slot] = resolved.x;
      enemies.field("y")[slot] = resolved.y;
      return true;
    }
    case 8: {
      // Summon Swarm
      const minion = world.content.enemies.find(
        (candidate) => candidate.category === "minion" && world.stageAllowsEnemy(candidate.id),
      );
      if (!minion) return false;
      const index = world.content.enemies.indexOf(minion);
      for (let i = 0; i < 2; i++) {
        const spawnAngle = (i / 2) * Math.PI * 2 + world.rng.range(0, 1);
        spawnEnemyAt(world, index, x + Math.cos(spawnAngle) * 22, y + Math.sin(spawnAngle) * 22);
      }
      return true;
    }
    case 9: // Chain Spark
      for (let i = 0; i < 3; i++) {
        spawnHostileProjectile(world, x, y, angle + (i - 1) * 0.18, 3.2, damage * 0.75, 150);
      }
      return true;
    default:
      return false;
  }
}

function enemyHazards(world: World): void {
  const hazards = world.stores.hazards;
  const players = world.stores.players;
  hazards.forEachAlive((slot) => {
    const ticks = hazards.field("ticks")[slot] - 1;
    hazards.field("ticks")[slot] = ticks;
    if (ticks > 0) return;

    const x = hazards.field("x")[slot];
    const y = hazards.field("y")[slot];
    const radius = hazards.field("radius")[slot];
    const damage = hazards.field("damage")[slot];
    const kind = hazards.field("kind")[slot];
    const angle = hazards.field("angle")[slot];
    const length = hazards.field("length")[slot];
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    players.forEachAlive((p) => {
      if (players.field("downed")[p] || players.field("iFrames")[p] > 0) return;
      const dx = players.field("x")[p] - x;
      const dy = players.field("y")[p] - y;
      if (kind === 1) {
        const along = Math.max(0, Math.min(length, dx * cos + dy * sin));
        const px = dx - cos * along;
        const py = dy - sin * along;
        if (px * px + py * py <= radius * radius) {
          damagePlayer(world, p, damage, players.field("x")[p], players.field("y")[p], "hazard");
        }
      } else if (dx * dx + dy * dy <= radius * radius) {
        damagePlayer(world, p, damage, players.field("x")[p], players.field("y")[p], "hazard");
      }
    });
    world.emit({ type: "explosion", x, y, radius: kind === 1 ? radius * 2 : radius });
    hazards.free(slot);
  });
}
