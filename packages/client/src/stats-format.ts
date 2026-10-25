// Pure formatting for the Tab stats panel (kept Pixi-free for tests).
import type { RunStats } from "@rift/sim";

export interface StatRow {
  label: string;
  value: string;
}

export interface RunTotals {
  kills: number;
  gold: number;
  maxHp: number;
}

export const PRIMARY_LABELS = [
  "MIGHT",
  "HASTE",
  "AREA",
  "SPEED",
  "MAGNET",
  "ARMOR",
  "LUCK",
] as const;
export const SECONDARY_LABELS = ["KILLS", "GOLD", "MAX HP"] as const;

/** "+12%" / "-5%" for a multiplier where 1 is base. */
export function percentBonus(multiplier: number): string {
  if (!Number.isFinite(multiplier)) return "+0%";
  return signedPercent((multiplier - 1) * 100);
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
    ],
    secondary: [
      { label: SECONDARY_LABELS[0], value: whole(totals.kills) },
      { label: SECONDARY_LABELS[1], value: whole(totals.gold) },
      { label: SECONDARY_LABELS[2], value: whole(totals.maxHp) },
    ],
  };
}
