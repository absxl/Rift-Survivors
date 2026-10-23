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
  maxLevel: number; // ≈5
  /** Stat key → additive amount per level (applied through the modifier stack). */
  perLevel: Record<string, number>;
}

export interface CharacterDef {
  id: string;
  /** Content weapon id the character starts with. */
  startingWeapon: string;
  /** Stat key → additive bonus applied as modifiers at run start. */
  baseStats?: Record<string, number>;
}

export interface ContentPack {
  id: string;
  schemaVersion: number;
  enemies: EnemyDef[];
  weapons: WeaponDef[];
  passives: PassiveDef[];
  characters: CharacterDef[];
}
