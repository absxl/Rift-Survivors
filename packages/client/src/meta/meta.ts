// Meta progression logic: permanent-upgrade shop, gacha chests, achievements.
// Pure functions over the SaveData; the UI calls them and then persists.
import type { PowerUpDef } from "@rift/sim";
import type { SaveData } from "../save/save";

export interface RunResult {
  gold: number;
  kills: number;
  timeSec: number;
  won: boolean;
  /** Chests picked up during the run (saved for the shop). */
  chestsFound?: number;
}

/** Sum of purchased ranks → additive stat bonuses for the next run. */
export function computeMetaBonuses(save: SaveData, powerUps: PowerUpDef[]): Record<string, number> {
  const bonuses: Record<string, number> = {};
  for (const p of powerUps) {
    const rank = save.purchases[p.id] ?? 0;
    if (rank > 0) bonuses[p.stat] = (bonuses[p.stat] ?? 0) + p.perRank * rank;
  }
  return bonuses;
}

export function rankOf(save: SaveData, powerUp: PowerUpDef): number {
  return save.purchases[powerUp.id] ?? 0;
}

export function nextCost(save: SaveData, powerUp: PowerUpDef): number | null {
  const rank = rankOf(save, powerUp);
  if (rank >= powerUp.maxRank) return null;
  return powerUp.costs[rank];
}

export function buyPowerUp(save: SaveData, powerUp: PowerUpDef): boolean {
  const cost = nextCost(save, powerUp);
  if (cost === null || save.gold < cost) return false;
  save.gold -= cost;
  save.purchases[powerUp.id] = rankOf(save, powerUp) + 1;
  return true;
}

export function refundPowerUp(save: SaveData, powerUp: PowerUpDef): boolean {
  const rank = rankOf(save, powerUp);
  if (rank <= 0) return false;
  save.gold += powerUp.costs[rank - 1];
  save.purchases[powerUp.id] = rank - 1;
  return true;
}

/** Award gold + performance/found chests after a run. Returns chests earned. */
export function awardRun(save: SaveData, result: RunResult): number {
  save.gold += result.gold;
  save.totalKills += result.kills;
  save.bestTimeSec = Math.max(save.bestTimeSec, result.timeSec);
  const performanceChests = Math.min(
    5,
    Math.floor(result.timeSec / 300) + (result.timeSec >= 60 ? 1 : 0),
  );
  const found = Math.max(0, Math.floor(result.chestsFound ?? 0));
  save.chests += performanceChests + found;
  return performanceChests + found;
}

/** Open one gacha chest: unlocks a random locked champion, or grants gold if all owned. */
export function openChest(
  save: SaveData,
  allCharacters: string[],
): { unlocked: string | null; gold: number } {
  if (save.chests <= 0) return { unlocked: null, gold: 0 };
  save.chests -= 1;
  const locked = allCharacters.filter((c) => !save.unlockedCharacters.includes(c));
  if (locked.length === 0) {
    save.gold += 50;
    return { unlocked: null, gold: 50 };
  }
  const pick = locked[Math.floor(Math.random() * locked.length)];
  save.unlockedCharacters.push(pick);
  return { unlocked: pick, gold: 0 };
}

interface AchievementDef {
  id: string;
  label: string;
  check: (result: RunResult, totalKills: number) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first-blood", label: "FIRST BLOOD", check: (r) => r.kills >= 1 },
  { id: "survive-1min", label: "SURVIVOR", check: (r) => r.timeSec >= 60 },
  { id: "survive-5min", label: "VETERAN", check: (r) => r.timeSec >= 300 },
  { id: "reaper", label: "REAPER (100 KILLS)", check: (_r, total) => total >= 100 },
];

/** Check achievements; returns newly-unlocked labels and awards a gold bonus each. */
export function checkAchievements(save: SaveData, result: RunResult): string[] {
  const unlocked: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (save.achievements.includes(a.id)) continue;
    if (a.check(result, save.totalKills)) {
      save.achievements.push(a.id);
      save.gold += 25;
      unlocked.push(a.label);
    }
  }
  return unlocked;
}
