// Persistent save (localStorage). Versioned with a migration hook so old saves
// survive schema changes (docs/12 "Everything versioned").
export interface Keybinds {
  up: string;
  down: string;
  left: string;
  right: string;
}

export interface SaveSettings {
  /** Master volume 0..1 (scales everything). */
  volume: number;
  /** Music volume 0..1 (procedural soundtrack). */
  music: number;
  /** Sound-effect volume 0..1. */
  sfx: number;
  shake: boolean;
  damageNumbers: boolean;
  /** Show the F3-style perf overlay without the hotkey. */
  showFps: boolean;
  /** Shop toggle key (B by default; rebindable). */
  shopKey: string;
  keybinds: Keybinds;
}

export interface BestRun {
  timeSec: number;
  kills: number;
  gold: number;
  characterId: string;
  stageId: string;
}

/** Persistent per-region lore/travel counters and chest outcome records. */
export interface RegionProgress {
  runs: number;
  seconds: number;
  chestsOpened: number;
  keysFound: number;
  elitesKilled: number;
  bossesKilled: number;
  bushesBroken: number;
  /** Region chest pulls, including full champion/shards/gold outcomes. */
  pulls: number;
  /** Pulls whose individual outcomes have been recorded (v8+). */
  trackedPulls: number;
  pullsChampions: number;
  pullsShards: number;
  pullsGold: number;
  pullsGuaranteed: number;
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
  /** Content stage id used for the next solo/co-op run. */
  selectedStage: string;
  unlockedCharacters: string[];
  /** Keys spent to open region chests on the CHESTS page. */
  keys: number;
  achievements: string[];
  /** Best display progress per achievement id; goals are monotonic within a save. */
  achievementProgress: Record<string, number>;
  /** Region -> accumulated lore/travel counters. Darkin uses its own pool key. */
  regionProgress: Record<string, RegionProgress>;
  totalKills: number;
  /** Lifetime counters used by deeper achievement goals. */
  lifetimeBushesBroken: number;
  lifetimeChestsOpened: number;
  lifetimeKeysFound: number;
  lifetimeElitesKilled: number;
  lifetimeBossesKilled: number;
  bestTimeSec: number;
  runsPlayed: number;
  bestRun: BestRun;
  settings: SaveSettings;
}

export const SAVE_VERSION = 9;
const SAVE_KEY = "rift-survivors-save";

export function defaultSave(firstCharacter: string, firstStage = "rift-field"): SaveData {
  return {
    version: SAVE_VERSION,
    profileName: "Summoner",
    gold: 0,
    selectedCharacter: firstCharacter,
    championUpgrades: {},
    championShards: {},
    selectedStage: firstStage,
    unlockedCharacters: [firstCharacter],
    keys: 0,
    achievements: [],
    achievementProgress: {},
    regionProgress: {},
    totalKills: 0,
    lifetimeBushesBroken: 0,
    lifetimeChestsOpened: 0,
    lifetimeKeysFound: 0,
    lifetimeElitesKilled: 0,
    lifetimeBossesKilled: 0,
    bestTimeSec: 0,
    runsPlayed: 0,
    bestRun: { timeSec: 0, kills: 0, gold: 0, characterId: "", stageId: "" },
    settings: {
      volume: 0.7,
      music: 0.5,
      sfx: 0.8,
      shake: true,
      damageNumbers: true,
      showFps: false,
      shopKey: "b",
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

function nonNegative(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function migrate(parsed: Partial<SaveData>, firstCharacter: string, firstStage: string): SaveData {
  const base = defaultSave(firstCharacter, firstStage);
  const merged: SaveData = {
    ...base,
    ...parsed,
    championUpgrades: { ...(parsed.championUpgrades ?? {}) },
    championShards: { ...(parsed.championShards ?? {}) },
    achievementProgress: { ...(parsed.achievementProgress ?? {}) },
    regionProgress: { ...(parsed.regionProgress ?? {}) },
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
  // v5 and earlier called this currency "chests". Preserve its value 1:1.
  const legacy = parsed as Partial<SaveData> & { chests?: number };
  const legacyChests = legacy.chests;
  const rawKeys =
    legacyChests !== undefined && (parsed.version ?? 0) < SAVE_VERSION
      ? legacyChests
      : (parsed.keys ?? legacyChests);
  merged.keys = Number.isFinite(rawKeys) ? Math.max(0, Math.floor(rawKeys ?? 0)) : 0;
  Reflect.deleteProperty(merged, "chests");
  // Focus was removed from the chest economy; discard the old preference so
  // legacy saves cannot accidentally imply a hidden pull bias.
  Reflect.deleteProperty(merged, "championFocus");
  merged.runsPlayed = Number.isFinite(merged.runsPlayed) ? Math.max(0, merged.runsPlayed) : 0;
  for (const key of [
    "lifetimeBushesBroken",
    "lifetimeChestsOpened",
    "lifetimeKeysFound",
    "lifetimeElitesKilled",
    "lifetimeBossesKilled",
  ] as const) {
    const value = merged[key];
    merged[key] = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  }
  // v7 adds durable lore progress. Repair hostile/legacy values rather than
  // trusting arbitrary object shapes from localStorage or cloud saves.
  const progress: Record<string, number> = {};
  for (const [id, value] of Object.entries(merged.achievementProgress ?? {})) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      progress[id] = Math.floor(value);
    }
  }
  merged.achievementProgress = progress;
  const regionProgress: Record<string, RegionProgress> = {};
  for (const [region, raw] of Object.entries(merged.regionProgress ?? {})) {
    if (!raw || typeof raw !== "object") continue;
    const source = raw as Partial<RegionProgress>;
    regionProgress[region] = {
      runs: nonNegative(source.runs),
      seconds: nonNegative(source.seconds),
      chestsOpened: nonNegative(source.chestsOpened),
      keysFound: nonNegative(source.keysFound),
      elitesKilled: nonNegative(source.elitesKilled),
      bossesKilled: nonNegative(source.bossesKilled),
      bushesBroken: nonNegative(source.bushesBroken),
      pulls: nonNegative(source.pulls),
      trackedPulls: nonNegative(source.trackedPulls),
      pullsChampions: nonNegative(source.pullsChampions),
      pullsShards: nonNegative(source.pullsShards),
      pullsGold: nonNegative(source.pullsGold),
      pullsGuaranteed: nonNegative(source.pullsGuaranteed),
    };
  }
  merged.regionProgress = regionProgress;

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
