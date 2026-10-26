// Pure, Pixi-free presentation helpers for abilities, passives, offers and
// tooltips. Flavor comes from content; numbers are derived from the same base +
// level data and evaluated RunStats the sim uses, so cards cannot drift.
import type { CharacterDef, OfferOption, PassiveDef, RunStats, WeaponDef } from "@rift/sim";
import { trainingLabel } from "./stats-format";

export interface InfoLine {
  label: string;
  value: string;
}

export interface AbilityInfo {
  title: string;
  subtitle: string;
  description: string;
  lines: InfoLine[];
  color: string;
  badge: string;
}

export const STAT_LABELS: Record<string, string> = {
  might: "MIGHT",
  cooldown: "HASTE",
  area: "AREA",
  moveSpeed: "MOVE SPEED",
  magnet: "MAGNET",
  armor: "ARMOR",
  luck: "LUCK",
  growth: "EXPERIENCE",
  regen: "REGEN",
  greed: "GOLD",
  resist: "RESIST",
  projectileSpeed: "PROJECTILE SPEED",
  duration: "DURATION",
  pierce: "PIERCE",
  knockback: "KNOCKBACK",
  lifesteal: "LIFESTEAL",
  maxHp: "MAX HEALTH",
};

export function statLabel(key: string): string {
  return STAT_LABELS[key] ?? key.replace(/([A-Z])/g, " $1").toUpperCase();
}

export function tilde(id: string): string {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function weaponName(def: WeaponDef | undefined, fallback = "Unknown"): string {
  return def?.name ?? (fallback ? tilde(fallback) : "Unknown");
}

export function passiveName(def: PassiveDef | undefined, fallback = "Unknown"): string {
  return def?.name ?? (fallback ? tilde(fallback) : "Unknown");
}

export function championName(def: CharacterDef | undefined, fallback = "Unknown"): string {
  return def?.name ?? (fallback ? tilde(fallback) : "Unknown");
}

export function weaponColor(def: WeaponDef | undefined): string {
  const tags = def?.tags ?? [];
  if (tags.includes("damage:fire")) return "#ff7744";
  if (tags.includes("damage:arcane")) return "#b07bff";
  if (tags.includes("damage:light")) return "#ffe066";
  if (tags.includes("damage:physical")) return "#ccd0dc";
  return "#5fb8ff";
}

export function passiveColor(passive: PassiveDef | undefined): string {
  const keys = Object.keys(passive?.perLevel ?? {});
  if (keys.some((k) => ["might", "cooldown", "area", "projectileSpeed"].includes(k))) {
    return "#7f9cff";
  }
  if (keys.some((k) => ["maxHp", "armor", "resist", "regen"].includes(k))) {
    return "#66dd88";
  }
  return "#ffcc55";
}

interface WeaponStatsAtLevel {
  damage: number;
  cooldown: number;
  area: number;
  amount: number;
  pierce: number;
  knockback: number;
  speed: number;
}

function weaponStatsAt(def: WeaponDef, level: number): WeaponStatsAtLevel {
  const out: WeaponStatsAtLevel = {
    damage: def.base.damage,
    cooldown: def.base.cooldown,
    area: def.base.area,
    amount: def.base.amount,
    pierce: def.base.pierce,
    knockback: def.base.knockback,
    speed: def.base.speed,
  };
  for (let i = 0; i < level - 1 && i < def.levels.length; i++) {
    const d = def.levels[i].delta;
    out.damage += d.damage ?? 0;
    out.cooldown += d.cooldown ?? 0;
    out.area += d.area ?? 0;
    out.amount += d.amount ?? 0;
    out.pierce += d.pierce ?? 0;
    out.knockback += d.knockback ?? 0;
    out.speed += d.speed ?? 0;
  }
  return out;
}

function effective(def: WeaponDef, level: number, stats?: RunStats): WeaponStatsAtLevel {
  const s = weaponStatsAt(def, level);
  return {
    damage: Math.round(s.damage * (stats?.might ?? 1) * 10) / 10,
    cooldown: Math.max(0.1, Math.round((s.cooldown / (stats?.cooldown ?? 1) / 30) * 100) / 100),
    area: Math.round(s.area * (stats?.area ?? 1)),
    amount: s.amount,
    pierce: s.pierce + Math.floor(stats?.pierce ?? 0),
    knockback: Math.round(s.knockback * (stats?.knockback ?? 1) * 10) / 10,
    speed: Math.round(s.speed * (stats?.projectileSpeed ?? 1) * 10) / 10,
  };
}

export function weaponInfo(def: WeaponDef, level: number, stats?: RunStats): AbilityInfo {
  const s = effective(def, level, stats);
  const isMove = def.isMove === true;
  return {
    title: weaponName(def, def.id),
    subtitle: `${isMove ? "MOVE" : "WEAPON"} · LV ${level}/${def.maxLevel}`,
    description: def.description ?? "An arcane technique from the Rift.",
    color: weaponColor(def),
    badge: isMove ? "MOVE" : "WEAPON",
    lines: [
      { label: "DAMAGE", value: `${s.damage}` },
      { label: "CAST TIME", value: `${s.cooldown.toFixed(2)}S` },
      { label: "AREA", value: `${s.area}` },
      { label: "PROJECTILES", value: `${s.amount}` },
      ...(s.pierce > 0 ? [{ label: "PIERCE", value: `${s.pierce}` }] : []),
      ...(s.knockback > 0 ? [{ label: "KNOCKBACK", value: `${s.knockback}` }] : []),
    ],
  };
}

/** Human-readable current -> next changes for a weapon/move upgrade card. */
export function weaponUpgradeLines(
  def: WeaponDef,
  currentLevel: number,
  stats?: RunStats,
): InfoLine[] {
  const now = effective(def, Math.max(1, currentLevel), stats);
  const next = effective(def, currentLevel + 1, stats);
  const lines: InfoLine[] = [];
  const add = (label: string, a: number, b: number, suffix = ""): void => {
    if (Math.abs(a - b) < 0.0001) return;
    lines.push({ label, value: `${a}${suffix} → ${b}${suffix}` });
  };
  add("DAMAGE", now.damage, next.damage);
  add("CAST TIME", now.cooldown, next.cooldown, "S");
  add("AREA", now.area, next.area);
  add("PROJECTILES", now.amount, next.amount);
  add("PIERCE", now.pierce, next.pierce);
  add("KNOCKBACK", now.knockback, next.knockback);
  return lines;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function passiveInfo(def: PassiveDef, level: number, statsForPreview = true): AbilityInfo {
  const entries = Object.entries(def.perLevel);
  const lines: InfoLine[] = [];
  for (const [key, amount] of entries) {
    if (key === "armor" || key === "pierce") {
      lines.push({
        label: `+${statLabel(key)}`,
        value: `+${Math.round(amount * level)} (${Math.round(amount * (level + 1))} NEXT)`,
      });
    } else if (key === "regen") {
      lines.push({
        label: `+${statLabel(key)}`,
        value: `+${(amount * level).toFixed(1)}/S (${(amount * (level + 1)).toFixed(1)} NEXT)`,
      });
    } else if (key === "lifesteal" || key === "resist") {
      lines.push({
        label: `+${statLabel(key)}`,
        value: `+${percent(amount * level)} (${percent(amount * (level + 1))} NEXT)`,
      });
    } else {
      lines.push({
        label: `+${statLabel(key)}`,
        value: `+${percent(amount * level)} (${percent(amount * (level + 1))} NEXT)`,
      });
    }
  }
  return {
    title: passiveName(def, def.id),
    subtitle: `PASSIVE · LV ${level}/${def.maxLevel}`,
    description: def.description ?? "A permanent boon for this run.",
    color: passiveColor(def),
    badge: "PASSIVE",
    lines: statsForPreview ? lines : lines.slice(0, 1),
  };
}

export function trainingInfo(key: string, amount: number): AbilityInfo {
  return {
    title: trainingLabel(key, amount).replace("TRAINING: ", ""),
    subtitle: "TRAINING · REPEATABLE",
    description: "Direct, permanent training for this run. No item slot required.",
    color: "#3fa9ff",
    badge: "TRAINING",
    lines: [],
  };
}

export interface OfferCardInfo {
  title: string;
  subtitle: string;
  description: string;
  lines: InfoLine[];
  color: string;
  badge: string;
  isTraining: boolean;
}

/** Build the level-up card data for one OfferOption. */
export function offerCardInfo(
  option: OfferOption,
  weapons: WeaponDef[],
  passives: PassiveDef[],
  stats?: RunStats,
): OfferCardInfo {
  if (option.ref.type === "training") {
    const info = trainingInfo(option.statKey ?? "", option.statAmount ?? 0);
    return { ...info, isTraining: true };
  }
  if (option.ref.type === "weapon") {
    const def = weapons.find((w) => w.id === option.ref.id);
    if (!def) {
      return {
        title: tilde(option.ref.id),
        subtitle: "WEAPON",
        description: "",
        lines: [],
        color: "#5fb8ff",
        badge: "WEAPON",
        isTraining: false,
      };
    }
    const isMove = def.isMove === true || option.isMove === true;
    let lines: InfoLine[] = [];
    let subtitle = `${isMove ? "MOVE" : "WEAPON"} · NEW`;
    if (option.isEvolution) {
      subtitle = "EVOLUTION · NEW POWER";
      lines = weaponInfo(def, 1, stats).lines;
    } else if (option.level !== undefined) {
      lines = weaponUpgradeLines(def, option.level - 1, stats);
      subtitle = `${isMove ? "MOVE" : "WEAPON"} · LV ${option.level - 1} → ${option.level}`;
    } else {
      lines = weaponInfo(def, 1, stats).lines;
    }
    return {
      title: weaponName(def, def.id),
      subtitle,
      description: def.description ?? "",
      lines,
      color: weaponColor(def),
      badge: option.isEvolution ? "EVOLUTION" : isMove ? "MOVE" : "WEAPON",
      isTraining: false,
    };
  }
  if (option.ref.type === "passive") {
    const def = passives.find((p) => p.id === option.ref.id);
    if (!def) {
      return {
        title: tilde(option.ref.id),
        subtitle: "PASSIVE",
        description: "",
        lines: [],
        color: "#7f9cff",
        badge: "PASSIVE",
        isTraining: false,
      };
    }
    const info = passiveInfo(def, option.level ?? 1);
    return {
      ...info,
      subtitle:
        option.level === undefined
          ? "PASSIVE · NEW"
          : `PASSIVE · LV ${option.level - 1} → ${option.level}`,
      isTraining: false,
    };
  }
  if (option.ref.type === "heal") {
    return {
      title: "Recover",
      subtitle: "INSTANT · HEAL",
      description: "Restore 25% of maximum health immediately.",
      lines: [],
      color: "#66dd88",
      badge: "HEAL",
      isTraining: false,
    };
  }
  if (option.ref.type === "gold") {
    return {
      title: "Gold Cache",
      subtitle: "INSTANT · GOLD",
      description: "A small handful of gold for the next run.",
      lines: [],
      color: "#ffcc44",
      badge: "GOLD",
      isTraining: false,
    };
  }
  return {
    title: tilde(option.ref.id),
    subtitle: option.ref.type.toUpperCase(),
    description: "",
    lines: [],
    color: "#8ab0c0",
    badge: option.ref.type.toUpperCase(),
    isTraining: false,
  };
}
