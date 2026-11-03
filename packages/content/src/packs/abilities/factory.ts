// Authoring factory for real champion abilities (docs/10 D-044/D-045).
// Real rank-1 numbers from abilities.generated.ts are converted into the
// survivor pacing: cooldowns scale by COOLDOWN_FACTOR with caps, damage by
// DAMAGE_DIVISOR, so a 7s Q fires about every 2.4s and ultimates stay the
// slowest, heaviest casts. Each champion contributes two real abilities to the
// unified 8-slot pool: ids `<championId>-q` and `<championId>-r`.
import type { AbilityDef, DamageType } from "@rift/sim";

export const MAX_ABILITY_LEVEL = 5;

/** Real seconds → game ticks. Keeps relative cadence inside survivor pacing. */
const COOLDOWN_FACTOR = 0.35;
const COOLDOWN_MIN_TICKS = 50;
const COOLDOWN_MAX_TICKS = 240;
/** Real rank-1 base damage → game base damage. */
const DAMAGE_DIVISOR = 3;

export interface AuthoredAbility {
  name: string;
  /** Original mechanical blurb referencing the real ability's shape. */
  description: string;
  behavior: string;
  params?: Record<string, number | string | boolean>;
  /** Real rank-1 base damage (pre-divisor). Damageless utilities use the raw
   * game value via `gameDamage` instead. */
  realDamage?: number;
  /** Direct game-scale damage (overrides realDamage; used for utilities). */
  gameDamage?: number;
  /** Real rank-1 cooldown in seconds. */
  cooldown: number;
  area?: number;
  amount?: number;
  speed?: number;
  /** Seconds; converted to ticks where behaviors use it. */
  duration?: number;
  pierce?: number;
  knockback?: number;
  scale?: { ap?: number; ad?: number };
  damageType?: DamageType;
  status?: { id: "burn" | "slow"; ticks: number };
  tags?: string[];
}

export interface AuthoredKit {
  first: AuthoredAbility;
  /** The ultimate-style second ability. */
  second: AuthoredAbility;
}

function toTicks(seconds: number | undefined, fallback: number): number {
  return Math.max(1, Math.round((seconds ?? fallback) * 30));
}

function toGameDamage(a: AuthoredAbility): number {
  if (a.gameDamage !== undefined) return a.gameDamage;
  if (a.realDamage !== undefined) return Math.max(1, Math.round(a.realDamage / DAMAGE_DIVISOR));
  return 1;
}

export function buildAbility(championId: string, slot: "q" | "r", a: AuthoredAbility): AbilityDef {
  const id = `${championId}-${slot}`;
  const damage = toGameDamage(a);
  // +30% of base per rank keeps the existing power curve shape.
  const perLevel = Math.max(1, Math.round(damage * 0.3));
  const cooldown = Math.round(
    Math.min(COOLDOWN_MAX_TICKS, Math.max(COOLDOWN_MIN_TICKS, a.cooldown * 30 * COOLDOWN_FACTOR)),
  );
  // Default synergy tag from the damage type; explicit tags win.
  const autoTag =
    a.damageType === "magic"
      ? "damage:arcane"
      : a.damageType === "physical"
        ? "damage:physical"
        : null;
  const tags = a.tags ?? (autoTag ? [autoTag] : undefined);
  return {
    id,
    name: a.name,
    description: a.description,
    behavior: a.behavior,
    params: a.params ?? {},
    maxLevel: MAX_ABILITY_LEVEL,
    base: {
      damage,
      cooldown,
      area: a.area ?? 5,
      speed: a.speed ?? 5,
      duration: a.duration !== undefined ? toTicks(a.duration, 1) : 0,
      amount: a.amount ?? 1,
      pierce: a.pierce ?? 0,
      hitCooldown: 10,
      knockback: a.knockback ?? 1,
      lifetime: toTicks(a.duration ?? 2, 2),
    },
    levels: Array.from({ length: MAX_ABILITY_LEVEL - 1 }, () => ({ delta: { damage: perLevel } })),
    damageType: a.damageType,
    scale: a.scale,
    status: a.status,
    tags,
  };
}

/** Both ability defs for one champion plus the CharacterDef fields to attach. */
export function buildKit(
  championId: string,
  kit: AuthoredKit,
): { abilities: AbilityDef[]; startingAbility: string; startingAbility2: string } {
  const first = buildAbility(championId, "q", kit.first);
  const second = buildAbility(championId, "r", kit.second);
  return {
    abilities: [first, second],
    startingAbility: first.id,
    startingAbility2: second.id,
  };
}
