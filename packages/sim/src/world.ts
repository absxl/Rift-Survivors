// The World: the sim's single mutable state. The kernel owns world stores, the
// seeded RNG, the event queue, the modifier stack, the registries and the system
// pipeline. Everything else is a module registered by id.

import { registerCoreSystems } from "./defaults";
import type { SimEvent } from "./events";
import { ModifierStack } from "./modifiers";
import { type Registries, createRegistries } from "./registry";
import { Rng, type RngState } from "./rng";
import { type EntitySchema, EntityStore, type StoreSnapshot } from "./schema";
import { SpatialHash } from "./spatial-hash";
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
}

export interface RunConfig {
  playerCount: number;
}

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
  ],
};

const ENEMY_SCHEMA: EntitySchema = {
  kind: "enemy",
  capacity: 1500,
  fields: [
    { name: "x", type: "f32" },
    { name: "y", type: "f32" },
    { name: "hp", type: "f32" },
    { name: "kind", type: "u16" },
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
  gems: EntityStore;
  zones: EntityStore;
}

export interface WorldSnapshot {
  tick: number;
  over: boolean;
  rngState: RngState;
  modifiers: Record<string, number>;
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

  tick = 0;
  inputs: PlayerInput[] = [];
  events: SimEvent[] = [];
  over = false;
  private readonly offers: Offer[] = [];

  constructor(ruleset: RulesetDef, seed: number, playerCount: number) {
    this.seed = seed;
    this.ruleset = ruleset;
    this.registries = createRegistries();
    this.rng = new Rng(seed);
    this.stores = {
      players: new EntityStore(PLAYER_SCHEMA),
      enemies: new EntityStore(ENEMY_SCHEMA),
      projectiles: new EntityStore(PROJECTILE_SCHEMA),
      gems: new EntityStore(GEM_SCHEMA),
      zones: new EntityStore(ZONE_SCHEMA),
    };
    this.modifiers = new ModifierStack();
    this.spatialHash = new SpatialHash();

    for (let i = 0; i < playerCount; i++) {
      const slot = this.stores.players.alloc();
      this.stores.players.field("x")[slot] = 100 + i * 40;
      this.stores.players.field("y")[slot] = 120;
      this.stores.players.field("hp")[slot] = 100;
      this.stores.players.field("level")[slot] = 1;
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

  pendingOffers(): readonly Offer[] {
    return this.offers;
  }
}

export function createWorld(ruleset: RulesetDef, config: RunConfig, seed: number): World {
  return new World(ruleset, seed, config.playerCount);
}

/** Advance exactly one tick. Returns the events produced this tick. */
export function step(world: World, inputs: PlayerInput[]): SimEvent[] {
  world.inputs = inputs;
  world.events = [];

  // Rebuild the spatial hash for enemies (queryable by collision/aura systems).
  world.spatialHash.clear();
  const enemies = world.stores.enemies;
  enemies.forEachAlive((slot) => {
    world.spatialHash.insert(slot, enemies.field("x")[slot], enemies.field("y")[slot]);
  });

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
    stores: [
      world.stores.players.snapshot(),
      world.stores.enemies.snapshot(),
      world.stores.projectiles.snapshot(),
      world.stores.gems.snapshot(),
      world.stores.zones.snapshot(),
    ],
  };
}

/** Apply a level-up/chest choice. Handled by the progression system (M4); kept in the API now. */
export function applyChoice(_world: World, _playerId: number, _choiceIndex: number): void {
  // Intentionally a no-op until the progression system lands in M4.
}
