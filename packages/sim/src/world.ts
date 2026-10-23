// The World: the sim's single mutable state. The kernel owns world stores, the
// seeded RNG, the event queue, the modifier stack, the registries and the system
// pipeline. Everything else is a module registered by id.

import type { ContentPack, WeaponDef } from "./content-types";
import { registerCoreSystems } from "./defaults";
import type { SimEvent } from "./events";
import { ModifierStack } from "./modifiers";
import { type Registries, createRegistries } from "./registry";
import { Rng, type RngState } from "./rng";
import { type EntitySchema, EntityStore, type StoreSnapshot } from "./schema";
import { SpatialHash } from "./spatial-hash";
import { applyOfferOption } from "./systems/progression";
import type { Offer, PlayerInput } from "./types";

export const TICK_MS = 1000 / 30; // 30 Hz fixed timestep

export interface RulesetDef {
  id: string;
  schemaVersion: number;
  pipeline: string[];
  progression: string;
  world: string;
  director: string;
  economy: string;
  rules: Record<string, number | boolean | string>;
  features: Record<string, boolean>;
  contentPacks: string[];
  /** XP required per level: xpCurve[level-1] = XP to go from `level` to `level+1`. */
  xpCurve: number[];
}

export interface RunConfig {
  playerCount: number;
  /** Validated content (enemies + weapons). Defaults to an empty pack. */
  content?: ContentPack;
}

const EMPTY_PACK: ContentPack = {
  id: "empty",
  schemaVersion: 1,
  enemies: [],
  weapons: [],
  passives: [],
  characters: [],
};

const PLAYER_SCHEMA: EntitySchema = {
  kind: "player",
  capacity: 4,
  fields: [
    { name: "x", type: "f32" },
    { name: "y", type: "f32" },
    { name: "hp", type: "f32" },
    { name: "level", type: "u8" },
    { name: "facingX", type: "f32" },
    { name: "facingY", type: "f32" },
    { name: "iFrames", type: "u8" },
    { name: "xp", type: "f32" },
    { name: "xpToNext", type: "f32" },
    { name: "maxHp", type: "f32" },
  ],
};

const ENEMY_SCHEMA: EntitySchema = {
  kind: "enemy",
  capacity: 1500,
  fields: [
    { name: "x", type: "f32" },
    { name: "y", type: "f32" },
    { name: "hp", type: "f32" },
    { name: "maxHp", type: "f32" },
    { name: "kind", type: "u16" },
    { name: "vx", type: "f32" },
    { name: "vy", type: "f32" },
    { name: "hitCooldown", type: "u8" },
  ],
};

const PROJECTILE_SCHEMA: EntitySchema = {
  kind: "projectile",
  capacity: 800,
  fields: [
    { name: "x", type: "f32" },
    { name: "y", type: "f32" },
    { name: "vx", type: "f32" },
    { name: "vy", type: "f32" },
    { name: "damage", type: "f32" },
    { name: "pierce", type: "i16" },
    { name: "hitCooldown", type: "u8" },
    { name: "knockback", type: "f32" },
    { name: "lifetime", type: "u16" },
    { name: "owner", type: "u8" },
  ],
};

const WEAPON_SCHEMA: EntitySchema = {
  kind: "weapon",
  capacity: 24,
  fields: [
    { name: "owner", type: "u8" },
    { name: "defIndex", type: "u16" },
    { name: "cooldown", type: "f32" },
    { name: "level", type: "u8" },
  ],
};

const PASSIVE_SCHEMA: EntitySchema = {
  kind: "passive",
  capacity: 24,
  fields: [
    { name: "owner", type: "u8" },
    { name: "defIndex", type: "u16" },
    { name: "level", type: "u8" },
  ],
};

const GEM_SCHEMA: EntitySchema = {
  kind: "gem",
  capacity: 2000,
  fields: [
    { name: "x", type: "f32" },
    { name: "y", type: "f32" },
    { name: "value", type: "f32" },
  ],
};

const ZONE_SCHEMA: EntitySchema = {
  kind: "zone",
  capacity: 200,
  fields: [
    { name: "x", type: "f32" },
    { name: "y", type: "f32" },
    { name: "radius", type: "f32" },
  ],
};

export interface WorldStores {
  players: EntityStore;
  enemies: EntityStore;
  projectiles: EntityStore;
  weapons: EntityStore;
  passives: EntityStore;
  gems: EntityStore;
  zones: EntityStore;
}

export interface WorldSnapshot {
  tick: number;
  over: boolean;
  rngState: RngState;
  modifiers: Record<string, number>;
  worldWidth: number;
  worldHeight: number;
  stores: StoreSnapshot[];
}

export class World {
  readonly seed: number;
  readonly ruleset: RulesetDef;
  readonly registries: Registries;
  readonly rng: Rng;
  readonly stores: WorldStores;
  readonly modifiers: ModifierStack;
  readonly spatialHash: SpatialHash;
  readonly content: ContentPack;

  tick = 0;
  inputs: PlayerInput[] = [];
  events: SimEvent[] = [];
  over = false;
  private readonly offers: Offer[] = [];

  constructor(
    ruleset: RulesetDef,
    seed: number,
    playerCount: number,
    content: ContentPack = EMPTY_PACK,
  ) {
    this.seed = seed;
    this.ruleset = ruleset;
    this.registries = createRegistries();
    this.rng = new Rng(seed);
    this.content = content;
    this.stores = {
      players: new EntityStore(PLAYER_SCHEMA),
      enemies: new EntityStore(ENEMY_SCHEMA),
      projectiles: new EntityStore(PROJECTILE_SCHEMA),
      weapons: new EntityStore(WEAPON_SCHEMA),
      passives: new EntityStore(PASSIVE_SCHEMA),
      gems: new EntityStore(GEM_SCHEMA),
      zones: new EntityStore(ZONE_SCHEMA),
    };
    this.modifiers = new ModifierStack();
    this.spatialHash = new SpatialHash();

    const fieldW = Number(this.ruleset.rules["core.fieldWidth"] ?? 480);
    const fieldH = Number(this.ruleset.rules["core.fieldHeight"] ?? 270);
    for (let i = 0; i < playerCount; i++) {
      const slot = this.stores.players.alloc();
      this.stores.players.field("x")[slot] = fieldW / 2 + i * 40;
      this.stores.players.field("y")[slot] = fieldH / 2;
      this.stores.players.field("hp")[slot] = 100;
      this.stores.players.field("maxHp")[slot] = 100;
      this.stores.players.field("level")[slot] = 1;
      this.stores.players.field("xpToNext")[slot] = this.ruleset.xpCurve[0] ?? 5;
    }

    // Give player 0 the character's starting weapon.
    const character = content.characters[0];
    if (character) {
      const weaponIndex = content.weapons.findIndex((w) => w.id === character.startingWeapon);
      if (weaponIndex >= 0) {
        const slot = this.stores.weapons.alloc();
        this.stores.weapons.field("owner")[slot] = 0;
        this.stores.weapons.field("defIndex")[slot] = weaponIndex;
        this.stores.weapons.field("cooldown")[slot] = 0;
        this.stores.weapons.field("level")[slot] = 1;
      }
    }

    registerCoreSystems(this.registries);
  }

  /** Named tunable from the ruleset (no magic numbers in systems). */
  rule(key: string): number | boolean | string {
    const value = this.ruleset.rules[key];
    if (value === undefined) {
      throw new Error(`rule "${key}" not defined in ruleset "${this.ruleset.id}"`);
    }
    return value;
  }

  /** Numeric rule accessor (asserts the rule is a number). */
  num(key: string): number {
    const value = this.rule(key);
    if (typeof value !== "number") throw new Error(`rule "${key}" is not a number`);
    return value;
  }

  /** Read a stat/param through the modifier stack. */
  stat(key: string, base: number): number {
    return this.modifiers.evaluate(key, base);
  }

  emit(event: SimEvent): void {
    this.events.push(event);
  }

  queueOffer(offer: Offer): void {
    this.offers.push(offer);
  }

  pendingOffers(): readonly Offer[] {
    return this.offers;
  }

  clearOffers(): void {
    this.offers.length = 0;
  }

  /** Effective weapon damage: base + level deltas, scaled by the "might" stat. */
  weaponDamage(def: WeaponDef, level: number): number {
    let damage = def.base.damage;
    for (let i = 0; i < level - 1 && i < def.levels.length; i++) {
      const delta = def.levels[i].delta.damage;
      if (delta !== undefined) damage += delta;
    }
    return damage * this.stat("might", 1);
  }

  /** Nearest enemy slot within maxDist, or -1. */
  nearestEnemy(x: number, y: number, maxDist: number): number {
    let best = -1;
    let bestDist = maxDist * maxDist;
    const enemies = this.stores.enemies;
    this.spatialHash.queryCircle(x, y, maxDist, (slot) => {
      if (!enemies.isAlive(slot)) return;
      const dx = enemies.field("x")[slot] - x;
      const dy = enemies.field("y")[slot] - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist) {
        bestDist = d2;
        best = slot;
      }
    });
    return best;
  }

  /** Visit enemies whose center is within `radius` of (x, y). */
  enemiesInCircle(x: number, y: number, radius: number, cb: (slot: number) => void): void {
    const enemies = this.stores.enemies;
    const r2 = radius * radius;
    this.spatialHash.queryCircle(x, y, radius, (slot) => {
      if (!enemies.isAlive(slot)) return;
      const dx = enemies.field("x")[slot] - x;
      const dy = enemies.field("y")[slot] - y;
      if (dx * dx + dy * dy <= r2) cb(slot);
    });
  }

  /** True if the enemy can be hit again this tick (per-enemy hit cooldown). */
  canHit(slot: number): boolean {
    return this.stores.enemies.field("hitCooldown")[slot] <= 0;
  }

  /** Apply damage + knockback to an enemy and emit a hit event. */
  applyHit(
    slot: number,
    amount: number,
    dirX: number,
    dirY: number,
    knockback: number,
    hitCooldown: number,
  ): void {
    const enemies = this.stores.enemies;
    enemies.field("hp")[slot] -= amount;
    enemies.field("vx")[slot] += dirX * knockback;
    enemies.field("vy")[slot] += dirY * knockback;
    enemies.field("hitCooldown")[slot] = hitCooldown;
    this.emit({
      type: "hit",
      target: "enemy",
      targetSlot: slot,
      targetGen: enemies.gen(slot),
      x: enemies.field("x")[slot],
      y: enemies.field("y")[slot],
      amount,
      kind: "physical",
    });
  }
}

export function createWorld(ruleset: RulesetDef, config: RunConfig, seed: number): World {
  return new World(ruleset, seed, config.playerCount, config.content);
}

/** Advance exactly one tick. Returns the events produced this tick. */
export function step(world: World, inputs: PlayerInput[]): SimEvent[] {
  world.inputs = inputs;
  world.events = [];

  for (const systemId of world.ruleset.pipeline) {
    world.registries.systems.get(systemId)(world);
  }

  world.tick += 1;
  return world.events;
}

export function snapshot(world: World): WorldSnapshot {
  return {
    tick: world.tick,
    over: world.over,
    rngState: world.rng.getState(),
    modifiers: world.modifiers.snapshot(),
    worldWidth: Number(world.ruleset.rules["core.fieldWidth"] ?? 0),
    worldHeight: Number(world.ruleset.rules["core.fieldHeight"] ?? 0),
    stores: [
      world.stores.players.snapshot(),
      world.stores.enemies.snapshot(),
      world.stores.projectiles.snapshot(),
      world.stores.weapons.snapshot(),
      world.stores.passives.snapshot(),
      world.stores.gems.snapshot(),
      world.stores.zones.snapshot(),
    ],
  };
}

/** Apply a level-up/chest choice via the progression system. */
export function applyChoice(world: World, playerId: number, choiceIndex: number): void {
  applyOfferOption(world, playerId, choiceIndex);
}
