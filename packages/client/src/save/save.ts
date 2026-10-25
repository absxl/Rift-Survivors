// Persistent save (localStorage). Versioned with a migration hook so old saves
// survive schema changes (docs/12 "Everything versioned").
export interface SaveData {
  version: number;
  gold: number;
  /** PowerUp id → purchased rank. */
  purchases: Record<string, number>;
  unlockedCharacters: string[];
  /** Gacha chests earned but not yet opened. */
  chests: number;
  achievements: string[];
  totalKills: number;
  bestTimeSec: number;
  settings: { volume: number; shake: boolean };
}

export const SAVE_VERSION = 1;
const SAVE_KEY = "rift-survivors-save";

export function defaultSave(firstCharacter: string): SaveData {
  return {
    version: SAVE_VERSION,
    gold: 0,
    purchases: {},
    unlockedCharacters: [firstCharacter],
    chests: 0,
    achievements: [],
    totalKills: 0,
    bestTimeSec: 0,
    settings: { volume: 0.22, shake: true },
  };
}

export function loadSave(firstCharacter: string): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave(firstCharacter);
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return migrate(parsed, firstCharacter);
  } catch {
    return defaultSave(firstCharacter);
  }
}

export function persistSave(save: SaveData): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

/** Upgrade an old save to the current version. Only v1 exists so far. */
function migrate(parsed: Partial<SaveData>, firstCharacter: string): SaveData {
  const base = defaultSave(firstCharacter);
  const merged: SaveData = { ...base, ...parsed };
  if (merged.unlockedCharacters.length === 0) merged.unlockedCharacters = [firstCharacter];
  merged.version = SAVE_VERSION;
  return merged;
}

export function resetSave(firstCharacter: string): SaveData {
  const fresh = defaultSave(firstCharacter);
  persistSave(fresh);
  return fresh;
}
