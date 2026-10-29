// Runtime content contract consumed by the sim. The content package provides
// validated instances of these shapes. The sim matches behaviors by id via its
// registries; it never hard-codes a specific enemy/weapon id or name.

export type DamageType = "physical" | "magic" | "true";

/** Gacha/collection rarity. Content-authored; balance-neutral for now. */
export type Rarity = "common" | "rare" | "epic" | "legendary";

export interface WeaponStats {
  damage: number;
  cooldown: number; // ticks between shots
  area: number;
  speed: number; // projectile velocity
  duration: number;
  amount: number; // projectile count
  pierce: number; // enemies a projectile can pass through
  hitCooldown: number; // ticks between hits on the same enemy
  knockback: number;
  lifetime: number; // projectile lifetime (ticks)
}

export interface StatusApply {
  id: "burn" | "slow";
  ticks: number;
}

export interface StatDelta {
  damage?: number;
  cooldown?: number;
  area?: number;
  speed?: number;
  duration?: number;
  amount?: number;
  pierce?: number;
  hitCooldown?: number;
  knockback?: number;
  lifetime?: number;
}

export interface WeaponDef {
  id: string;
  /** Display name (placeholder flavor; never used by sim logic). */
  name?: string;
  /** Flavor + mechanical blurb surfaced in cards/tooltips. */
  description?: string;
  /** Namespaced tags used by synergies/modifiers (e.g. "damage:fire"). */
  tags?: string[];
  /** True for champion signature moves: separate slot pool, never evolved. */
  isMove?: boolean;
  behavior: string; // registry id: "sweep" | "shoot-nearest" | ...
  params: Record<string, number | string | boolean>;
  maxLevel: number;
  base: WeaponStats;
  levels: { delta: StatDelta }[]; // length = maxLevel - 1
  damageType?: DamageType;
  status?: StatusApply;
  /** Evolved forms are never offered in level-up pools. */
  isEvolved?: boolean;
  /** Evolve this weapon (maxed) + the required passive → the evolved weapon. */
  evolution?: { requiresPassive: string; evolvesTo: string };
}

export interface EnemyDef {
  id: string;
  /** Display name for the boss bar / codex. */
  name?: string;
  tags?: string[];
  category: "minion" | "elite" | "boss" | "final-threat";
  hp: number;
  damage: number;
  moveSpeed: number;
  radius: number;
  xp: number;
  behavior: string; // registry id: "chase" | "weaver" | "charge" | "ranged" | ...
  params: Record<string, number | string>;
  /** Elites/bosses drop a chest on death. */
  dropsChest?: boolean;
  /** Chance (0..1) to drop a chest for non-guaranteed enemies; luck scales it. */
  chestChance?: number;
  /** Content-authored placeholder tint (0xRRGGBB); presentation only. */
  tint?: number;
  /** Relative spawn weight among its category (default 1). */
  spawnWeight?: number;
  /** First minute this enemy may spawn (default 0). */
  minMinute?: number;
  /** Last minute it may spawn (inclusive); omitted = forever. */
  maxMinute?: number;
}

export interface PassiveDef {
  id: string;
  /** Display name (placeholder flavor; never used by sim logic). */
  name?: string;
  description?: string;
  tags?: string[];
  maxLevel: number; // ≈5
  /** Stat key → additive amount per level (applied through the modifier stack). */
  perLevel: Record<string, number>;
}

/** Source-backed identity data shown in the champion dossier. */
export interface ChampionProfile {
  /** Official champion title (e.g. "the Nine-Tailed Fox"). */
  title: string;
  /** Every chest-eligible region; the first entry is the primary region. */
  regions: string[];
  /** Where the champion is from in lore (may be a historical place). */
  origin?: string;
  residence?: string;
  faction?: string;
  species?: string;
  occupation?: string;
  /** Official League role(s), e.g. ["Mage", "Assassin"]. */
  roles: string[];
  difficulty?: string;
  /** Original short in-game profile text, not copied official lore. */
  summary: string;
  sources: {
    official: string;
    wiki: string;
    verifiedAt: string;
  };
}

export interface CharacterDef {
  id: string;
  name?: string;
  description?: string;
  /** Primary gacha region. Kept in sync with profile.regions[0]. */
  region?: string;
  /** Multi-region identity data for profiles and region chests. */
  profile?: ChampionProfile;
  rarity?: Rarity;
  /** Broad archetype used by class-specific upgrade trees. */
  class?: string;
  /** Free starter champion for a fresh local save. */
  starter?: boolean;
  tags?: string[];
  /** Content weapon id the character starts with. */
  startingWeapon: string;
  /** Signature move weapon id (isMove) the character starts with. */
  startingMove?: string;
  /** Stat key → additive bonus applied as modifiers at run start. */
  baseStats?: Record<string, number>;
  /** Growth: every N levels, add these stat bonuses (cumulative). */
  growth?: { everyLevels: number; mods: Record<string, number> };
  /** Meta-upgrade ids shown in this champion's tree. */
  upgradeIds?: string[];
}

/** Permanent-upgrade shop entry (meta progression). */
export interface PowerUpDef {
  id: string;
  name?: string;
  description?: string;
  /** Stat key the rank adds to (e.g. "might", "maxHp"). */
  stat: string;
  /** Bonus added per rank. */
  perRank: number;
  maxRank: number;
  /** Gold cost for each rank (length = maxRank). */
  costs: number[];
}

/** A tag query: `all` must be present, `any` needs at least one. */
export interface TagQuery {
  all?: string[];
  any?: string[];
}

/** Cross-synergy: applies stat modifiers when its condition is met (docs/11). */
export interface SynergyDef {
  id: string;
  source:
    | {
        kind: "tagCount";
        tag: string;
        tiers: { count: number; mods: Record<string, number> }[];
      }
    | { kind: "combo"; requires: TagQuery[]; mods: Record<string, number> };
  /** Hidden-until-discovered (discovery combos). */
  hidden?: boolean;
}

export interface StagePalette {
  /** 0xRRGGBB presentation colors; never read by gameplay systems. */
  background: number;
  grid: number;
  accent: number;
}

/**
 * Procedural terrain settings. The sim only reads thresholds/effects; the
 * colours are consumed by the client terrain renderer.
 */
export interface StageTerrain {
  /** 32px world tiles; chunks are 16x16 tiles. */
  wallThreshold: number;
  liquidThreshold: number;
  liquid: "water" | "lava" | "void";
  /** Fraction of movement removed while standing in liquid (0..1). */
  liquidSlow: number;
  /** Damage per second while standing in a damaging liquid. */
  liquidDamage: number;
  colors: {
    floor: string;
    floorAlt: string;
    floorSpeck: string;
    wallTop: string;
    wallTopAlt: string;
    wallFace: string;
    wallEdge: string;
    liquid: string;
    liquidDeep: string;
    liquidAccent: string;
  };
}

export interface StageDef {
  id: string;
  name: string;
  description: string;
  region: string;
  palette: StagePalette;
  /** Enemy ids allowed in this stage; omitted/empty means the whole pack. */
  enemyIds?: string[];
  /** Final threat override for this stage. */
  finalThreatId?: string;
  /** Stage-specific overrides for spawned rules. */
  rules?: Record<string, number | string | boolean>;
  /** Optional procedural arena terrain; without it the stage is a flat field. */
  terrain?: StageTerrain;
}

export interface ContentPack {
  id: string;
  schemaVersion: number;
  enemies: EnemyDef[];
  weapons: WeaponDef[];
  passives: PassiveDef[];
  characters: CharacterDef[];
  powerUps: PowerUpDef[];
  synergies: SynergyDef[];
  /** Optional for test packs and backwards-compatible content. */
  stages?: StageDef[];
}
