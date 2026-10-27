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

export interface BestRun {
  timeSec: number;
  kills: number;
  gold: number;
  characterId: string;
  stageId: string;
}

export interface SaveData {
  version: number;
  /** Showdown-style local profile name; synced to the account later. */
  profileName: string;
  gold: number;
  /** Legacy global power-up ranks; migrated into the selected champion's tree. */
  purchases?: Record<string, number>;
  /** Champion chosen in the Champions menu; used by solo and co-op runs. */
  selectedCharacter: string;
  /** Per-champion meta upgrades: championId -> powerUpId -> rank. */
  championUpgrades: Record<string, Record<string, number>>;
  /** Per-champion shards collected from region chests. */
  championShards: Record<string, number>;
  /** region -> champion id the player is focusing in that region's chests. */
  championFocus: Record<string, string>;
  /** Content stage id used for the next solo/co-op run. */
  selectedStage: string;
  unlockedCharacters: string[];
  /** Gacha chests earned but not yet opened. */
  chests: number;
  achievements: string[];
  totalKills: number;
  bestTimeSec: number;
  runsPlayed: number;
  bestRun: BestRun;
  settings: SaveSettings;
}

export const SAVE_VERSION = 5;
const SAVE_KEY = "rift-survivors-save";

export function defaultSave(firstCharacter: string, firstStage = "rift-field"): SaveData {
  return {
    version: SAVE_VERSION,
    profileName: "Summoner",
    gold: 0,
    selectedCharacter: firstCharacter,
    championUpgrades: {},
    championShards: {},
    championFocus: {},
    selectedStage: firstStage,
    unlockedCharacters: [firstCharacter],
    chests: 0,
    achievements: [],
    totalKills: 0,
    bestTimeSec: 0,
    runsPlayed: 0,
    bestRun: { timeSec: 0, kills: 0, gold: 0, characterId: "", stageId: "" },
    settings: {
      volume: 0.22,
      shake: true,
      damageNumbers: true,
      keybinds: { up: "w", down: "s", left: "a", right: "d" },
    },
  };
}

export function loadSave(firstCharacter: string, firstStage = "rift-field"): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave(firstCharacter, firstStage);
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return migrate(parsed, firstCharacter, firstStage);
  } catch {
    return defaultSave(firstCharacter, firstStage);
  }
}

let saveSink: ((save: SaveData) => void) | null = null;

/** Attach an optional cloud-save sink (used when an account session exists). */
export function setSaveSink(sink: ((save: SaveData) => void) | null): void {
  saveSink = sink;
}

export function persistSave(save: SaveData): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  saveSink?.(save);
}

/** Upgrade a v1 save (global purchases) to v2 (per-champion trees + gacha shards). */
export function migrateSave(
  parsed: Partial<SaveData>,
  firstCharacter: string,
  firstStage: string,
): SaveData {
  return migrate(parsed, firstCharacter, firstStage);
}

function migrate(parsed: Partial<SaveData>, firstCharacter: string, firstStage: string): SaveData {
  const base = defaultSave(firstCharacter, firstStage);
  const merged: SaveData = {
    ...base,
    ...parsed,
    championUpgrades: { ...(parsed.championUpgrades ?? {}) },
    championShards: { ...(parsed.championShards ?? {}) },
    championFocus: { ...(parsed.championFocus ?? {}) },
    selectedStage:
      typeof parsed.selectedStage === "string" && parsed.selectedStage
        ? parsed.selectedStage
        : firstStage,
    settings: {
      ...base.settings,
      ...parsed.settings,
      keybinds: { ...base.settings.keybinds, ...parsed.settings?.keybinds },
    },
  };
  if (merged.unlockedCharacters.length === 0) merged.unlockedCharacters = [firstCharacter];
  if (typeof merged.profileName !== "string" || merged.profileName.length === 0) {
    merged.profileName = "Summoner";
  }
  merged.runsPlayed = Number.isFinite(merged.runsPlayed) ? Math.max(0, merged.runsPlayed) : 0;
  merged.bestRun = {
    timeSec: Number.isFinite(merged.bestRun?.timeSec) ? merged.bestRun.timeSec : 0,
    kills: Number.isFinite(merged.bestRun?.kills) ? merged.bestRun.kills : 0,
    gold: Number.isFinite(merged.bestRun?.gold) ? merged.bestRun.gold : 0,
    characterId: merged.bestRun?.characterId ?? "",
    stageId: merged.bestRun?.stageId ?? "",
  };

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

export function resetSave(firstCharacter: string, firstStage = "rift-field"): SaveData {
  const fresh = defaultSave(firstCharacter, firstStage);
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
