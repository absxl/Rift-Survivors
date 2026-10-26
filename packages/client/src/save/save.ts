// Persistent save (localStorage). Versioned with a migration hook so old saves
// survive schema changes (docs/12 "Everything versioned").
export interface Keybinds {
  up: string;
  down: string;
  left: string;
  right: string;
}

export interface SaveSettings {
  volume: number;
  shake: boolean;
  damageNumbers: boolean;
  keybinds: Keybinds;
}

export interface SaveData {
  version: number;
  gold: number;
  /** Legacy global power-up ranks; migrated into the selected champion's tree. */
  purchases?: Record<string, number>;
  /** Champion chosen in the Champions menu; used by solo and co-op runs. */
  selectedCharacter: string;
  /** Per-champion meta upgrades: championId -> powerUpId -> rank. */
  championUpgrades: Record<string, Record<string, number>>;
  /** Per-champion shards collected from region chests. */
  championShards: Record<string, number>;
  unlockedCharacters: string[];
  /** Gacha chests earned but not yet opened. */
  chests: number;
  achievements: string[];
  totalKills: number;
  bestTimeSec: number;
  settings: SaveSettings;
}

export const SAVE_VERSION = 2;
const SAVE_KEY = "rift-survivors-save";

export function defaultSave(firstCharacter: string): SaveData {
  return {
    version: SAVE_VERSION,
    gold: 0,
    selectedCharacter: firstCharacter,
    championUpgrades: {},
    championShards: {},
    unlockedCharacters: [firstCharacter],
    chests: 0,
    achievements: [],
    totalKills: 0,
    bestTimeSec: 0,
    settings: {
      volume: 0.22,
      shake: true,
      damageNumbers: true,
      keybinds: { up: "w", down: "s", left: "a", right: "d" },
    },
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

/** Upgrade a v1 save (global purchases) to v2 (per-champion trees + gacha shards). */
function migrate(parsed: Partial<SaveData>, firstCharacter: string): SaveData {
  const base = defaultSave(firstCharacter);
  const merged: SaveData = {
    ...base,
    ...parsed,
    championUpgrades: { ...(parsed.championUpgrades ?? {}) },
    championShards: { ...(parsed.championShards ?? {}) },
    settings: {
      ...base.settings,
      ...parsed.settings,
      keybinds: { ...base.settings.keybinds, ...parsed.settings?.keybinds },
    },
  };
  if (merged.unlockedCharacters.length === 0) merged.unlockedCharacters = [firstCharacter];

  const selected =
    typeof parsed.selectedCharacter === "string" && parsed.selectedCharacter
      ? parsed.selectedCharacter
      : (parsed.unlockedCharacters?.[0] ?? firstCharacter);
  merged.selectedCharacter = merged.unlockedCharacters.includes(selected)
    ? selected
    : (merged.unlockedCharacters[0] ?? firstCharacter);

  // v1 had one global purchase set. Preserve the player's investment by moving it
  // onto their selected (or first) champion rather than throwing it away.
  if (parsed.purchases && Object.keys(parsed.purchases).length > 0) {
    const target = merged.selectedCharacter;
    merged.championUpgrades[target] = {
      ...parsed.purchases,
      ...(merged.championUpgrades[target] ?? {}),
    };
  }

  merged.version = SAVE_VERSION;
  merged.purchases = undefined;
  return merged;
}

export function resetSave(firstCharacter: string): SaveData {
  const fresh = defaultSave(firstCharacter);
  persistSave(fresh);
  return fresh;
}

/** Selected champion if it is still unlocked, else the first unlocked champion. */
export function resolveSelectedCharacter(save: SaveData, fallback: string): string {
  if (save.unlockedCharacters.includes(save.selectedCharacter)) return save.selectedCharacter;
  const first = save.unlockedCharacters[0] ?? fallback;
  save.selectedCharacter = first;
  return first;
}
