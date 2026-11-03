// The World: the sim's single mutable state. The kernel owns world stores, the
// seeded RNG, the event queue, the modifier stack, the registries and the system
// pipeline. Everything else is a module registered by id.

import { BushField } from "./bush-field";
import type { CharacterDef, ContentPack, StageDef, StatusApply, WeaponDef } from "./content-types";
import { registerCoreSystems } from "./defaults";
import type { SimEvent } from "./events";
import { ModifierStack } from "./modifiers";
import { Pathfinder } from "./pathfinding";
import { type Registries, createRegistries } from "./registry";
import { Rng, type RngState } from "./rng";
import { type EntitySchema, EntityStore, type StoreSnapshot } from "./schema";
import { SpatialHash } from "./spatial-hash";
import { PICKUP_HEAL, dropPickup } from "./systems/pickups";
import { applyOfferOption } from "./systems/progression";
import { refreshSynergies } from "./systems/synergies";
import { SPAWN_CLEARING_RADIUS, TerrainField, type TerrainSafeZone } from "./terrain";
import type { Offer, PlayerInput } from "./types";

export const TICK_MS = 1000 / 30; // 30 Hz fixed timestep

function stringHash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

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
  /** Character id to start as; defaults to the first character. */
  characterId?: string;
  /** Per-player character ids (co-op); falls back to characterId/first. */
  characterIds?: string[];
  /** Permanent meta-shop bonuses (stat key → additive bonus). */
  metaBonuses?: Record<string, number>;
  /** Per-player meta bonuses (co-op); takes precedence over metaBonuses. */
  playerMetaBonuses?: Record<string, number>[];
  /** Stage id; falls back to the first content stage. */
  stageId?: string;
}

const EMPTY_PACK: ContentPack = {
  id: "empty",
  schemaVersion: 1,
  enemies: [],
  weapons: [],
  passives: [],
  characters: [],
  powerUps: [],
  synergies: [],
  stages: [],
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
    { name: "gold", type: "f32" },
    { name: "kills", type: "f32" },
    { name: "keys", type: "u16" },
    { name: "chestsOpened", type: "u16" },
    { name: "bushesBroken", type: "u16" },
    { name: "elitesKilled", type: "u16" },
    { name: "bossesKilled", type: "u16" },
    { name: "downs", type: "u16" },
    { name: "downed", type: "u8" },
    { name: "reviveProgress", type: "f32" },
    { name: "envTick", type: "u8", network: false },
    { name: "velocityX", type: "f32", network: false },
    { name: "velocityY", type: "f32", network: false },
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
    { name: "slowTicks", type: "u8" },
    { name: "burnTicks", type: "u8" },
    { name: "freezeTicks", type: "u8" },
    { name: "lastHitBy", type: "u8" },
    { name: "shield", type: "f32" },
    { name: "fuseTicks", type: "u8" },
    { name: "ability0", type: "u16" },
    { name: "ability1", type: "u16" },
    { name: "ability2", type: "u16" },
    { name: "ability3", type: "u16" },
    { name: "ability4", type: "u16" },
    { name: "abilityCd0", type: "u16" },
    { name: "abilityCd1", type: "u16" },
    { name: "abilityCd2", type: "u16" },
    { name: "abilityCd3", type: "u16" },
    { name: "abilityCd4", type: "u16" },
    { name: "envTick", type: "u8", network: false },
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
    { name: "mode", type: "u8" },
    { name: "p1", type: "f32" },
    { name: "p2", type: "f32" },
  ],
};

const WEAPON_SCHEMA: EntitySchema = {
  kind: "weapon",
  // Up to 10 ability slots per player (6 weapons + 4 moves) in a 4-player room.
  capacity: 64,
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
    { name: "damage", type: "f32" },
    { name: "lifetime", type: "u16" },
    { name: "owner", type: "u8" },
  ],
};

const PICKUP_SCHEMA: EntitySchema = {
  kind: "pickup",
  capacity: 500,
  fields: [
    { name: "x", type: "f32" },
    { name: "y", type: "f32" },
    { name: "kind", type: "u8" },
    { name: "value", type: "f32" },
  ],
};

const BUSH_SCHEMA: EntitySchema = {
  kind: "bush",
  capacity: 600,
  fields: [
    { name: "x", type: "f32" },
    { name: "y", type: "f32" },
    { name: "hp", type: "u8" },
    { name: "tx", type: "i32" },
    { name: "ty", type: "i32" },
  ],
};

const CHEST_SCHEMA: EntitySchema = {
  kind: "chest",
  capacity: 8,
  fields: [
    { name: "x", type: "f32" },
    { name: "y", type: "f32" },
    { name: "openingTicks", type: "u16" },
    { name: "opener", type: "u8" },
  ],
};

const HAZARD_SCHEMA: EntitySchema = {
  kind: "hazard",
  capacity: 160,
  fields: [
    { name: "x", type: "f32" },
    { name: "y", type: "f32" },
    { name: "radius", type: "f32" },
    { name: "damage", type: "f32" },
    { name: "ticks", type: "u16" },
    { name: "kind", type: "u8" },
    { name: "angle", type: "f32" },
    { name: "length", type: "f32" },
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
  pickups: EntityStore;
  bushes: EntityStore;
  chests: EntityStore;
  hazards: EntityStore;
}

export interface RunStats {
  /** Multipliers: 1 = base. */
  might: number;
  /** Cooldown divisor: >1 means faster attacks (shown as Haste). */
  cooldown: number;
  area: number;
  moveSpeed: number;
  /** Effective movement speed in pixels/tick (for client prediction). */
  moveSpeedPx: number;
  magnet: number;
  /** Flat damage reduction. */
  armor: number;
  /** Bonus fraction: 0 = base (shown as +%). */
  luck: number;
  /** XP gain multiplier (1 = base). */
  growth: number;
  /** HP regenerated per second. */
  regen: number;
  /** Gold gain multiplier (1 = base). */
  greed: number;
  /** Damage reduction fraction (0..0.7). */
  resist: number;
  /** Projectile velocity multiplier (1 = base). */
  projectileSpeed: number;
  /** Effect duration multiplier (1 = base). */
  duration: number;
  /** Extra projectile pierce (flat). */
  pierce: number;
  /** Knockback multiplier (1 = base). */
  knockback: number;
  /** Fraction of damage dealt healed back (0 = none). */
  lifesteal: number;
}

export interface WorldSnapshot {
  tick: number;
  over: boolean;
  rngState: RngState;
  modifiers: Record<string, number>;
  /** Evaluated stats per player slot (HUD + network). */
  playerStats: RunStats[];
  partyXp: number;
  partyLevel: number;
  partyXpToNext: number;
  worldWidth: number;
  worldHeight: number;
  stageId: string;
  stageName: string;
  terrainSeed: number;
  stores: StoreSnapshot[];
}

export class World {
  readonly seed: number;
  readonly ruleset: RulesetDef;
  readonly registries: Registries;
  readonly rng: Rng;
  readonly stores: WorldStores;
  readonly modifiers: ModifierStack;
  /** One modifier stack per player so passives/synergies stay independent. */
  readonly playerModifiers: ModifierStack[] = [];
  /** Resolved character per player (for growth + tags). */
  readonly playerCharacters: (CharacterDef | null)[] = [];
  readonly spatialHash: SpatialHash;
  readonly content: ContentPack;
  readonly character: CharacterDef | null;
  readonly stage: StageDef | null;
  readonly terrain: TerrainField;
  readonly bushField: BushField;
  readonly terrainSeed: number;
  readonly pathfinder = new Pathfinder();
  /** Loaded bush chunks -> allocated bush slots. Broken tiles stay in brokenBushes. */
  readonly bushChunks = new Map<string, number[]>();
  readonly brokenBushes = new Set<string>();
  /** Next tick at which the run-chest director may spawn a chest. */
  nextChestTick = 0;

  tick = 0;
  inputs: PlayerInput[] = [];
  events: SimEvent[] = [];
  over = false;
  /** Shared party progression (all players level up together). */
  partyXp = 0;
  partyLevel = 1;
  partyXpToNext = 5;
  /** True once the final threat is defeated (or the fallback timer fires). */
  bossRush = false;
  finalThreatSpawned = false;
  /** Tick when the final threat spawned (-1 before). Drives the boss-rush fallback. */
  finalThreatTick = -1;
  /** Per-player offer agency tokens (reroll/skip/banish) for this run. */
  readonly rerolls: number[] = [];
  readonly skips: number[] = [];
  readonly banishes: number[] = [];
  /** Option ids banished by each player; excluded from future offers this run. */
  readonly banishedOptions: Set<string>[] = [];
  private readonly offers: Offer[] = [];

  constructor(
    ruleset: RulesetDef,
    seed: number,
    playerCount: number,
    content: ContentPack = EMPTY_PACK,
    characterId?: string,
    metaBonuses?: Record<string, number>,
    characterIds?: string[],
    playerMetaBonuses?: Record<string, number>[],
    stageId?: string,
  ) {
    this.seed = seed;
    this.ruleset = ruleset;
    this.registries = createRegistries();
    this.rng = new Rng(seed);
    this.content = content;
    this.stage =
      (stageId ? content.stages?.find((candidate) => candidate.id === stageId) : undefined) ??
      content.stages?.[0] ??
      null;
    const fieldWidth = Number(this.ruleset.rules["core.fieldWidth"] ?? 1280);
    const fieldHeight = Number(this.ruleset.rules["core.fieldHeight"] ?? 720);
    const stageHash = stringHash(this.stage?.id ?? "rift-field");
    this.terrainSeed = (seed ^ stageHash) >>> 0;
    const safe: TerrainSafeZone[] = [
      { x: fieldWidth / 2, y: fieldHeight / 2, radius: SPAWN_CLEARING_RADIUS },
    ];
    this.terrain = new TerrainField(this.stage?.terrain ?? null, this.terrainSeed, safe);
    this.bushField = new BushField(
      this.terrain,
      this.terrainSeed,
      this.stage?.terrain?.bushDensity ?? 1,
    );
    this.nextChestTick = Math.max(30, Math.floor(this.num("chest.firstSpawnSec") * 30));
    this.stores = {
      players: new EntityStore(PLAYER_SCHEMA),
      enemies: new EntityStore(ENEMY_SCHEMA),
      projectiles: new EntityStore(PROJECTILE_SCHEMA),
      weapons: new EntityStore(WEAPON_SCHEMA),
      passives: new EntityStore(PASSIVE_SCHEMA),
      gems: new EntityStore(GEM_SCHEMA),
      zones: new EntityStore(ZONE_SCHEMA),
      pickups: new EntityStore(PICKUP_SCHEMA),
      bushes: new EntityStore(BUSH_SCHEMA),
      chests: new EntityStore(CHEST_SCHEMA),
      hazards: new EntityStore(HAZARD_SCHEMA),
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
      this.rerolls.push(Math.max(0, Math.floor(this.num("levelUp.rerolls"))));
      this.skips.push(Math.max(0, Math.floor(this.num("levelUp.skips"))));
      this.banishes.push(Math.max(0, Math.floor(this.num("levelUp.banishes"))));
      this.banishedOptions.push(new Set());
      this.playerModifiers.push(new ModifierStack());
      this.playerCharacters.push(null);
    }

    // Per-player characters: base stats go into each player's own stack.
    const primary =
      (characterIds?.[0] ? content.characters.find((c) => c.id === characterIds[0]) : undefined) ??
      (characterId ? content.characters.find((c) => c.id === characterId) : undefined) ??
      content.characters[0];
    this.character = primary ?? null;
    this.partyXpToNext = this.ruleset.xpCurve[0] ?? 5;
    for (let p = 0; p < playerCount; p++) {
      const charId = characterIds?.[p] ?? primary?.id;
      const char =
        (charId ? content.characters.find((c) => c.id === charId) : undefined) ?? primary ?? null;
      this.playerCharacters[p] = char;
      const mods = this.playerModifiers[p];
      if (char?.baseStats && mods) {
        for (const [key, value] of Object.entries(char.baseStats)) {
          mods.add(key, { op: "add", value, source: `character:${char.id}` });
        }
      }
      if (char) {
        const addStarting = (weaponId: string | undefined, cooldownOffset: number): void => {
          if (!weaponId) return;
          const weaponIndex = content.weapons.findIndex((w) => w.id === weaponId);
          if (weaponIndex < 0) return;
          const slot = this.stores.weapons.alloc();
          this.stores.weapons.field("owner")[slot] = p;
          this.stores.weapons.field("defIndex")[slot] = weaponIndex;
          this.stores.weapons.field("cooldown")[slot] = cooldownOffset;
          this.stores.weapons.field("level")[slot] = 1;
        };
        addStarting(char.startingWeapon, p * 10);
        // Signature moves use the same auto-cast ability store but a separate
        // loadout pool (4 move slots); every champion starts with one.
        if (char.startingMove && char.startingMove !== char.startingWeapon) {
          addStarting(char.startingMove, p * 10 + 5);
        }
      }
    }

    // Permanent meta bonuses: per-player when supplied (co-op), otherwise the
    // legacy global bundle applies to everyone.
    for (let p = 0; p < playerCount; p++) {
      const bonuses = playerMetaBonuses?.[p] ?? metaBonuses;
      if (!bonuses) continue;
      const mods = this.playerModifiers[p];
      for (const [key, value] of Object.entries(bonuses)) {
        if (value !== 0) mods.add(key, { op: "add", value, source: `meta:${key}` });
      }
    }

    // Sync maxHp from character/meta bonuses.
    this.stores.players.forEachAlive((slot) => {
      this.syncPlayerMaxHp(slot);
    });

    registerCoreSystems(this.registries);
    refreshSynergies(this);
  }

  /** Named tunable from the ruleset (no magic numbers in systems). */
  rule(key: string): number | boolean | string {
    const stageValue = this.stage?.rules?.[key];
    if (stageValue !== undefined) return stageValue;
    const value = this.ruleset.rules[key];
    if (value === undefined) {
      throw new Error(`rule "${key}" not defined in ruleset "${this.ruleset.id}"`);
    }
    return value;
  }

  /** Stage-specific enemy allow-list; an empty list means the whole pack. */
  stageAllowsEnemy(enemyId: string): boolean {
    const ids = this.stage?.enemyIds;
    return !ids || ids.length === 0 || ids.includes(enemyId);
  }

  /** True if this stage's enemy allow-list is intentionally restricting spawns. */
  get hasStageEnemyFilter(): boolean {
    return Boolean(this.stage?.enemyIds && this.stage.enemyIds.length > 0);
  }

  /** Levitating champions float over terrain and ignore its slows/damage. */
  playerLevitates(playerId: number): boolean {
    return Boolean(this.playerCharacters[playerId]?.tags?.includes("levitate"));
  }

  /** Flying/levitating enemies (and bosses) ignore terrain collision/effects. */
  enemyLevitates(def: { tags?: string[]; category: string }): boolean {
    return (
      def.tags?.includes("levitate") === true ||
      def.category === "boss" ||
      def.category === "final-threat"
    );
  }

  terrainStep(playerId: number): number {
    return this.terrain.movementMultiplier(
      this.stores.players.field("x")[playerId],
      this.stores.players.field("y")[playerId],
      this.playerLevitates(playerId),
    );
  }

  pathDirection(playerSlot: number, x: number, y: number): { x: number; y: number } | null {
    return this.pathfinder.direction(playerSlot, x, y);
  }

  /** Numeric rule accessor (asserts the rule is a number). */
  num(key: string): number {
    const value = this.rule(key);
    if (typeof value !== "number") throw new Error(`rule "${key}" is not a number`);
    return value;
  }

  /** Read a stat/param through the global modifier stack. */
  stat(key: string, base: number): number {
    return this.modifiers.evaluate(key, base);
  }

  /** Read a stat through one player's modifier stack (co-op isolation). */
  playerStat(playerId: number, key: string, base: number): number {
    const mods = this.playerModifiers[playerId];
    return mods ? mods.evaluate(key, base) : this.modifiers.evaluate(key, base);
  }

  /** Recompute a player's max HP after stat changes (heals the gained delta). */
  syncPlayerMaxHp(playerId: number): void {
    const players = this.stores.players;
    const oldMax = players.field("maxHp")[playerId];
    const newMax = 100 * this.playerStat(playerId, "maxHp", 1);
    players.field("maxHp")[playerId] = newMax;
    if (newMax > oldMax) {
      players.field("hp")[playerId] = Math.min(
        newMax,
        players.field("hp")[playerId] + (newMax - oldMax),
      );
    }
  }

  /** Evaluated stats for the HUD/network, for one player. */
  statsFor(playerId: number): RunStats {
    return {
      might: this.playerStat(playerId, "might", 1),
      cooldown: this.playerStat(playerId, "cooldown", 1),
      area: this.playerStat(playerId, "area", 1),
      moveSpeed: this.playerStat(playerId, "moveSpeed", 1),
      moveSpeedPx: this.num("core.moveSpeed") * this.playerStat(playerId, "moveSpeed", 1),
      magnet: this.playerStat(playerId, "magnet", 1),
      armor: this.playerStat(playerId, "armor", 0),
      luck: this.playerStat(playerId, "luck", 0),
      growth: this.playerStat(playerId, "growth", 1),
      regen: this.playerStat(playerId, "regen", 0),
      greed: this.playerStat(playerId, "greed", 1),
      resist: this.playerStat(playerId, "resist", 0),
      projectileSpeed: this.playerStat(playerId, "projectileSpeed", 1),
      duration: this.playerStat(playerId, "duration", 1),
      pierce: this.playerStat(playerId, "pierce", 0),
      knockback: this.playerStat(playerId, "knockback", 1),
      lifesteal: this.playerStat(playerId, "lifesteal", 0),
    };
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

  /** Current reroll/skip/banish tokens for a player (copied into each offer). */
  offerTokens(playerId: number): { rerolls: number; skips: number; banishes: number } {
    return {
      rerolls: this.rerolls[playerId] ?? 0,
      skips: this.skips[playerId] ?? 0,
      banishes: this.banishes[playerId] ?? 0,
    };
  }

  clearOffers(): void {
    this.offers.length = 0;
  }

  /** Remove only the pending offer belonging to one player (co-op safe). */
  clearOffer(playerId: number): void {
    const idx = this.offers.findIndex((o) => o.playerId === playerId);
    if (idx >= 0) this.offers.splice(idx, 1);
  }

  /** Effective weapon stat: base + level deltas, scaled by the owner's stats. */
  weaponStat(
    def: WeaponDef,
    level: number,
    key: "damage" | "area" | "cooldown",
    owner = 0,
  ): number {
    let value = def.base[key];
    for (let i = 0; i < level - 1 && i < def.levels.length; i++) {
      const delta = def.levels[i].delta[key];
      if (delta !== undefined) value += delta;
    }
    if (key === "damage") {
      const damage = value * this.playerStat(owner, "might", 1);
      return Number.isFinite(damage) ? Math.max(0, damage) : value;
    }
    if (key === "area") {
      const area = value * this.playerStat(owner, "area", 1);
      return Number.isFinite(area) ? Math.max(1, Math.min(2000, area)) : value;
    }
    const cooldown = value / this.playerStat(owner, "cooldown", 1);
    return Number.isFinite(cooldown) ? Math.max(1, cooldown) : value;
  }

  /** Effective weapon damage: base + level deltas, scaled by the owner's "might". */
  weaponDamage(def: WeaponDef, level: number, owner = 0): number {
    return this.weaponStat(def, level, "damage", owner);
  }

  /** Effective weapon area/range, scaled by the owner's "area". */
  weaponArea(def: WeaponDef, level: number, owner = 0): number {
    return this.weaponStat(def, level, "area", owner);
  }

  /** Effective weapon cooldown (ticks), divided by the owner's "cooldown". */
  weaponCooldown(def: WeaponDef, level: number, owner = 0): number {
    return this.weaponStat(def, level, "cooldown", owner);
  }

  /**
   * Shared auto-aim contract for every directional/placed weapon: prefer the
   * nearest living enemy, then fall back to the player's movement facing.
   */
  aimFromPlayer(
    playerId: number,
    maxDist: number,
  ): { x: number; y: number; dx: number; dy: number; dist: number; target: number } {
    const players = this.stores.players;
    const px = players.field("x")[playerId];
    const py = players.field("y")[playerId];
    const target = this.nearestEnemy(px, py, maxDist);
    if (target >= 0) {
      const tx = this.stores.enemies.field("x")[target];
      const ty = this.stores.enemies.field("y")[target];
      const dx = tx - px;
      const dy = ty - py;
      const dist = Math.hypot(dx, dy) || 1;
      return { x: tx, y: ty, dx: dx / dist, dy: dy / dist, dist, target };
    }
    let fx = players.field("facingX")[playerId];
    const fy = players.field("facingY")[playerId];
    if (fx === 0 && fy === 0) fx = 1;
    const dist = Math.hypot(fx, fy) || 1;
    return {
      x: px + (fx / dist) * maxDist,
      y: py + (fy / dist) * maxDist,
      dx: fx / dist,
      dy: fy / dist,
      dist,
      target: -1,
    };
  }

  /** Visit bushes whose center is inside a circle. */
  bushesInCircle(x: number, y: number, radius: number, cb: (slot: number) => void): void {
    const bushes = this.stores.bushes;
    const r2 = radius * radius;
    bushes.forEachAlive((slot) => {
      const dx = bushes.field("x")[slot] - x;
      const dy = bushes.field("y")[slot] - y;
      if (dx * dx + dy * dy <= r2) cb(slot);
    });
  }

  /** Damage/break bushes in an area. Jittered projectiles pass through. */
  damageBushesInCircle(x: number, y: number, radius: number, amount: number, owner = 0): void {
    if (amount <= 0) return;
    this.bushesInCircle(x, y, radius, (slot) => this.damageBush(slot, amount, owner));
  }

  /** Damage one bush and drop its healing pickup when it breaks. */
  damageBush(slot: number, amount: number, owner = 0): void {
    const bushes = this.stores.bushes;
    if (!bushes.isAlive(slot) || amount <= 0) return;
    const hp = bushes.field("hp")[slot] - amount;
    if (hp > 0) {
      bushes.field("hp")[slot] = hp;
      return;
    }
    const x = bushes.field("x")[slot];
    const y = bushes.field("y")[slot];
    const tx = bushes.field("tx")[slot];
    const ty = bushes.field("ty")[slot];
    this.brokenBushes.add(`${tx},${ty}`);
    const players = this.stores.players;
    if (owner >= 0 && owner < players.count) {
      players.field("bushesBroken")[owner] += 1;
    }
    bushes.free(slot);
    dropPickup(this, x, y, PICKUP_HEAL, this.num("pickup.bushHealAmount"));
    this.emit({ type: "bush-break", playerId: owner, x, y });
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

  /** Apply damage + knockback to an enemy, credit the owner, and emit a hit event. */
  applyHit(
    slot: number,
    amount: number,
    dirX: number,
    dirY: number,
    knockback: number,
    hitCooldown: number,
    owner = 0,
  ): void {
    const enemies = this.stores.enemies;
    const knock = knockback * this.playerStat(owner, "knockback", 1);
    let remaining = amount;
    const shield = enemies.field("shield")[slot] ?? 0;
    if (shield > 0) {
      const absorbed = Math.min(shield, remaining);
      enemies.field("shield")[slot] = shield - absorbed;
      remaining -= absorbed;
    }
    if (remaining > 0) enemies.field("hp")[slot] -= remaining;
    enemies.field("vx")[slot] += dirX * knock;
    enemies.field("vy")[slot] += dirY * knock;
    enemies.field("hitCooldown")[slot] = hitCooldown;
    enemies.field("lastHitBy")[slot] = owner;

    // Lifesteal, capped per hit so AoE hits cannot heal to full instantly.
    const steal = this.playerStat(owner, "lifesteal", 0);
    const players = this.stores.players;
    if (steal > 0 && owner >= 0 && owner < players.count) {
      const max = players.field("maxHp")[owner];
      if (max > 0 && !players.field("downed")[owner] && players.field("hp")[owner] > 0) {
        const heal = Math.min(amount * steal, max * 0.02);
        players.field("hp")[owner] = Math.min(max, players.field("hp")[owner] + heal);
      }
    }

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

  /** Apply a status effect to an enemy (burn/slow), refreshing to the longer duration. */
  applyStatus(slot: number, status: StatusApply): void {
    const enemies = this.stores.enemies;
    if (status.id === "burn") {
      enemies.field("burnTicks")[slot] = Math.max(enemies.field("burnTicks")[slot], status.ticks);
    } else if (status.id === "slow") {
      enemies.field("slowTicks")[slot] = Math.max(enemies.field("slowTicks")[slot], status.ticks);
    }
  }
}

export function createWorld(ruleset: RulesetDef, config: RunConfig, seed: number): World {
  return new World(
    ruleset,
    seed,
    config.playerCount,
    config.content,
    config.characterId,
    config.metaBonuses,
    config.characterIds,
    config.playerMetaBonuses,
    config.stageId,
  );
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
    playerStats: world.playerModifiers.map((_, p) => world.statsFor(p)),
    partyXp: world.partyXp,
    partyLevel: world.partyLevel,
    partyXpToNext: world.partyXpToNext,
    worldWidth: Number(world.ruleset.rules["core.fieldWidth"] ?? 0),
    worldHeight: Number(world.ruleset.rules["core.fieldHeight"] ?? 0),
    stageId: world.stage?.id ?? "",
    stageName: world.stage?.name ?? "The Rift",
    terrainSeed: world.terrainSeed,
    stores: [
      world.stores.players.snapshot(),
      world.stores.enemies.snapshot(),
      world.stores.projectiles.snapshot(),
      world.stores.weapons.snapshot(),
      world.stores.passives.snapshot(),
      world.stores.gems.snapshot(),
      world.stores.zones.snapshot(),
      world.stores.pickups.snapshot(),
      world.stores.bushes.snapshot(),
      world.stores.chests.snapshot(),
      world.stores.hazards.snapshot(),
    ],
  };
}

/** Apply a level-up/chest choice via the progression system. */
export function applyChoice(world: World, playerId: number, choiceIndex: number): void {
  applyOfferOption(world, playerId, choiceIndex);
}
