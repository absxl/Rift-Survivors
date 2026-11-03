// Pure formatting for the Tab stats panel and training cards (Pixi-free).
import type { RunStats } from "@rift/sim";

export interface StatRow {
  label: string;
  value: string;
}

export interface RunTotals {
  kills: number;
  gold: number;
  maxHp: number;
  keys: number;
}

export const PRIMARY_LABELS = [
  "MIGHT",
  "HASTE",
  "AREA",
  "SPEED",
  "MAGNET",
  "ARMOR",
  "LUCK",
  "GROWTH",
  "REGEN",
  "GREED",
  "RESIST",
  "PROJ SPEED",
  "DURATION",
  "PIERCE",
  "LIFESTEAL",
  "KNOCKBACK",
] as const;
export const SECONDARY_LABELS = ["KILLS", "GOLD", "KEYS", "MAX HP"] as const;

/** "+12%" / "-5%" for a multiplier where 1 is base. */
export function percentBonus(multiplier: number): string {
  if (!Number.isFinite(multiplier)) return "+0%";
  return signedPercent((multiplier - 1) * 100);
}

/** "12%" for a fraction where 0 is base. */
export function percentValue(fraction: number): string {
  if (!Number.isFinite(fraction)) return "0%";
  return `${Math.round(fraction * 100)}%`;
}

/** "+12%" / "-5%" for a bonus fraction where 0 is base. */
export function fractionBonus(value: number): string {
  if (!Number.isFinite(value)) return "+0%";
  return signedPercent(value * 100);
}

function signedPercent(value: number): string {
  const rounded = Math.round(value);
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

function whole(value: number): string {
  return `${Number.isFinite(value) ? Math.round(value) : 0}`;
}

export function formatStats(
  stats: RunStats,
  totals: RunTotals,
): { primary: StatRow[]; secondary: StatRow[] } {
  return {
    primary: [
      { label: PRIMARY_LABELS[0], value: percentBonus(stats.might) },
      { label: PRIMARY_LABELS[1], value: percentBonus(stats.cooldown) },
      { label: PRIMARY_LABELS[2], value: percentBonus(stats.area) },
      { label: PRIMARY_LABELS[3], value: percentBonus(stats.moveSpeed) },
      { label: PRIMARY_LABELS[4], value: percentBonus(stats.magnet) },
      { label: PRIMARY_LABELS[5], value: whole(stats.armor) },
      { label: PRIMARY_LABELS[6], value: fractionBonus(stats.luck) },
      { label: PRIMARY_LABELS[7], value: percentBonus(stats.growth) },
      { label: PRIMARY_LABELS[8], value: `${stats.regen.toFixed(1)}/S` },
      { label: PRIMARY_LABELS[9], value: percentBonus(stats.greed) },
      { label: PRIMARY_LABELS[10], value: percentValue(stats.resist) },
      { label: PRIMARY_LABELS[11], value: percentBonus(stats.projectileSpeed) },
      { label: PRIMARY_LABELS[12], value: percentBonus(stats.duration) },
      { label: PRIMARY_LABELS[13], value: whole(stats.pierce) },
      { label: PRIMARY_LABELS[14], value: percentValue(stats.lifesteal) },
      { label: PRIMARY_LABELS[15], value: percentBonus(stats.knockback) },
    ],
    secondary: [
      { label: SECONDARY_LABELS[0], value: whole(totals.kills) },
      { label: SECONDARY_LABELS[1], value: whole(totals.gold) },
      { label: SECONDARY_LABELS[2], value: whole(totals.keys) },
      { label: SECONDARY_LABELS[3], value: whole(totals.maxHp) },
    ],
  };
}

const TRAINING_LABELS: Record<string, string> = {
  growth: "XP",
  maxHp: "MAX HP",
  regen: "REGEN",
  greed: "GOLD",
  resist: "RESIST",
  might: "MIGHT",
  cooldown: "HASTE",
  area: "AREA",
  moveSpeed: "SPEED",
  magnet: "MAGNET",
  armor: "ARMOR",
  luck: "LUCK",
  projectileSpeed: "PROJ SPEED",
  duration: "DURATION",
  pierce: "PIERCE",
  knockback: "KNOCKBACK",
  lifesteal: "LIFESTEAL",
};

/** Human-readable training card text, e.g. "TRAINING: +5% XP". */
export function trainingLabel(key: string, amount: number): string {
  const label = TRAINING_LABELS[key] ?? key.toUpperCase();
  if (!Number.isFinite(amount)) return `TRAINING: ${label}`;
  if (key === "regen") return `TRAINING: +${amount.toFixed(1)}/S ${label}`;
  if (key === "armor" || key === "pierce") return `TRAINING: +${Math.round(amount)} ${label}`;
  return `TRAINING: +${Math.round(amount * 100)}% ${label}`;
}
