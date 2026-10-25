// Runtime content contract consumed by the sim. The content package provides
// validated instances of these shapes. The sim matches behaviors by id via its
// registries; it never hard-codes a specific enemy/weapon id or name.

export type DamageType = "physical" | "magic" | "true";

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
  /** Namespaced tags used by synergies/modifiers (e.g. "damage:fire"). */
  tags?: string[];
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
  tags?: string[];
  category: "minion" | "elite" | "boss" | "final-threat";
  hp: number;
  damage: number;
  moveSpeed: number;
  radius: number;
  xp: number;
  behavior: string; // registry id: "chase" | ...
  params: Record<string, number | string>;
  /** Elites/bosses drop a chest on death. */
  dropsChest?: boolean;
}

export interface PassiveDef {
  id: string;
  tags?: string[];
  maxLevel: number; // ≈5
  /** Stat key → additive amount per level (applied through the modifier stack). */
  perLevel: Record<string, number>;
}

export interface CharacterDef {
  id: string;
  tags?: string[];
  /** Content weapon id the character starts with. */
  startingWeapon: string;
  /** Stat key → additive bonus applied as modifiers at run start. */
  baseStats?: Record<string, number>;
  /** Growth: every N levels, add these stat bonuses (cumulative). */
  growth?: { everyLevels: number; mods: Record<string, number> };
}

/** Permanent-upgrade shop entry (meta progression). */
export interface PowerUpDef {
  id: string;
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

export interface ContentPack {
  id: string;
  schemaVersion: number;
  enemies: EnemyDef[];
  weapons: WeaponDef[];
  passives: PassiveDef[];
  characters: CharacterDef[];
  powerUps: PowerUpDef[];
  synergies: SynergyDef[];
}
