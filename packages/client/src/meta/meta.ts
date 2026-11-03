// Meta progression logic: per-champion upgrades, region gacha shards, and
// achievements. Pure functions over SaveData; the UI persists after calling them.
import type { CharacterDef, PowerUpDef, Rarity } from "@rift/sim";
import { DARKIN_CHEST, REGION_ORDER, championRegions, isDarkinChampion } from "../regions";
import type { RegionProgress, SaveData } from "../save/save";

export interface RunResult {
  gold: number;
  kills: number;
  timeSec: number;
  won: boolean;
  /** Keys found during the run and carried home. */
  keysFound?: number;
  /** Spawnable run chests opened by this player. */
  chestsOpened?: number;
  /** Bushes destroyed by this player. */
  bushesBroken?: number;
  /** Elite and boss kills credited to this player. */
  elitesKilled?: number;
  bossesKilled?: number;
  /** Times this player was downed during the run. */
  downs?: number;
  /** True when the run was played in the co-op lobby. */
  coOp?: boolean;
  characterId?: string;
  stageId?: string;
  /** Primary region credited with this run's lore progress. */
  primaryRegion?: string;
  /** Every region attached to the run's champion. */
  championRegions?: string[];
  /** True when the run champion has the Darkin species/lore tag. */
  isDarkin?: boolean;
}

export const SHARD_REQUIREMENTS: Record<Rarity, number> = {
  common: 6,
  rare: 8,
  epic: 12,
  legendary: 20,
};

export const RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 60,
  rare: 30,
  epic: 9,
  legendary: 1,
};

export const RARITY_LABELS: Record<Rarity, string> = {
  common: "COMMON",
  rare: "RARE",
  epic: "EPIC",
  legendary: "LEGENDARY",
};

/** Region chest odds. The 10-pull additionally guarantees an Epic+ champion. */
export const GACHA_ODDS = {
  champion: 0.08,
  shards: 0.72,
  gold: 0.2,
  goldAmount: 50,
  fallbackGold: 75,
  guaranteeGold: 200,
} as const;

const RARITY_RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };

export function rarityRank(rarity: Rarity | undefined): number {
  return RARITY_RANK[rarity ?? "rare"] ?? 1;
}

export function isEpicPlus(character: CharacterDef): boolean {
  return rarityRank(character.rarity) >= RARITY_RANK.epic;
}

export function shardsRequired(character: CharacterDef): number {
  return SHARD_REQUIREMENTS[character.rarity ?? "rare"];
}

export function isUnlocked(save: SaveData, characterId: string): boolean {
  return save.unlockedCharacters.includes(characterId);
}

/** Every region represented by the roster, in canonical display order. */
export function regionsOf(characters: CharacterDef[]): string[] {
  const regions = new Set<string>();
  for (const champion of characters) {
    for (const region of championRegions(champion)) regions.add(region);
  }
  const known = REGION_ORDER.filter((region) => regions.has(region));
  const extra = [...regions].filter(
    (region) => !REGION_ORDER.includes(region as (typeof REGION_ORDER)[number]),
  );
  return [...known, ...extra];
}

/** Multi-region champions appear in every associated chest pool. */
export function championsInRegion(characters: CharacterDef[], region: string): CharacterDef[] {
  if (region === DARKIN_CHEST) {
    return characters.filter((champion) => isDarkinChampion(champion));
  }
  return characters.filter((champion) => championRegions(champion).includes(region));
}

/** The dedicated Darkin chest is an additional pool; regional pools still keep
 * their Darkin champions. */
export function darkinChampions(characters: CharacterDef[]): CharacterDef[] {
  return characters.filter((champion) => isDarkinChampion(champion));
}

/** Upgrades shown for one champion; explicit tree first, else all content entries. */
/** Normalize legacy single-stat and multi-stat power-up definitions. */
export function powerUpRankStats(powerUp: PowerUpDef): Record<string, number> {
  if (powerUp.stats) return powerUp.stats;
  if (powerUp.stat && powerUp.perRank !== undefined) {
    return { [powerUp.stat]: powerUp.perRank };
  }
  return {};
}

export function upgradesForChampion(
  powerUps: PowerUpDef[],
  character: CharacterDef | undefined,
): PowerUpDef[] {
  const ids = character?.upgradeIds;
  if (!ids || ids.length === 0) return powerUps;
  return powerUps.filter((p) => ids.includes(p.id));
}

function championTree(save: SaveData, championId: string): Record<string, number> {
  return save.championUpgrades[championId] ?? {};
}

/** Sum of one champion's purchased ranks, as additive run-start stat bonuses. */
export function computeMetaBonuses(
  save: SaveData,
  powerUps: PowerUpDef[],
  championId: string = save.selectedCharacter,
  character?: CharacterDef,
): Record<string, number> {
  const purchases = championTree(save, championId);
  const allowed = character?.upgradeIds;
  const bonuses: Record<string, number> = {};
  for (const p of powerUps) {
    if (allowed && !allowed.includes(p.id)) continue;
    const rank = purchases[p.id] ?? 0;
    if (rank <= 0) continue;
    for (const [stat, amount] of Object.entries(powerUpRankStats(p))) {
      bonuses[stat] = (bonuses[stat] ?? 0) + amount * rank;
    }
  }
  return bonuses;
}

export function rankOf(
  save: SaveData,
  powerUp: PowerUpDef,
  championId: string = save.selectedCharacter,
): number {
  return championTree(save, championId)[powerUp.id] ?? 0;
}

export function nextCost(
  save: SaveData,
  powerUp: PowerUpDef,
  championId: string = save.selectedCharacter,
): number | null {
  const rank = rankOf(save, powerUp, championId);
  if (rank >= powerUp.maxRank) return null;
  return powerUp.costs[rank];
}

export function buyPowerUp(
  save: SaveData,
  powerUp: PowerUpDef,
  championId: string = save.selectedCharacter,
): boolean {
  const cost = nextCost(save, powerUp, championId);
  if (cost === null || save.gold < cost) return false;
  save.gold -= cost;
  const tree = save.championUpgrades[championId] ?? {};
  tree[powerUp.id] = (tree[powerUp.id] ?? 0) + 1;
  save.championUpgrades[championId] = tree;
  return true;
}

export function refundPowerUp(
  save: SaveData,
  powerUp: PowerUpDef,
  championId: string = save.selectedCharacter,
): boolean {
  const rank = rankOf(save, powerUp, championId);
  if (rank <= 0) return false;
  save.gold += powerUp.costs[rank - 1];
  const tree = save.championUpgrades[championId] ?? {};
  tree[powerUp.id] = rank - 1;
  save.championUpgrades[championId] = tree;
  return true;
}

export function shardsFor(save: SaveData, characterId: string): number {
  return save.championShards[characterId] ?? 0;
}

export function canUnlockWithShards(save: SaveData, character: CharacterDef): boolean {
  return (
    !isUnlocked(save, character.id) && shardsFor(save, character.id) >= shardsRequired(character)
  );
}

/** Spend champion shards to unlock; the player chooses the champion manually. */
export function unlockWithShards(save: SaveData, character: CharacterDef): boolean {
  if (!canUnlockWithShards(save, character)) return false;
  save.championShards[character.id] = shardsFor(save, character.id) - shardsRequired(character);
  if (!isUnlocked(save, character.id)) save.unlockedCharacters.push(character.id);
  return true;
}

/** Award gold + performance/found keys after a run. Returns keys earned. */
export function awardRun(save: SaveData, result: RunResult): number {
  save.gold += result.gold;
  save.totalKills += result.kills;
  save.lifetimeBushesBroken += Math.max(0, Math.floor(result.bushesBroken ?? 0));
  save.lifetimeChestsOpened += Math.max(0, Math.floor(result.chestsOpened ?? 0));
  save.lifetimeKeysFound += Math.max(0, Math.floor(result.keysFound ?? 0));
  save.lifetimeElitesKilled += Math.max(0, Math.floor(result.elitesKilled ?? 0));
  save.lifetimeBossesKilled += Math.max(0, Math.floor(result.bossesKilled ?? 0));
  save.bestTimeSec = Math.max(save.bestTimeSec, result.timeSec);
  save.runsPlayed += 1;

  const creditedRegion = result.primaryRegion ?? result.championRegions?.[0] ?? "Runeterra";
  const addRunProgress = (region: string): void => {
    const progress = regionProgressFor(save, region);
    progress.runs += 1;
    progress.seconds += Math.max(0, result.timeSec);
    progress.chestsOpened += Math.max(0, Math.floor(result.chestsOpened ?? 0));
    progress.keysFound += Math.max(0, Math.floor(result.keysFound ?? 0));
    progress.elitesKilled += Math.max(0, Math.floor(result.elitesKilled ?? 0));
    progress.bossesKilled += Math.max(0, Math.floor(result.bossesKilled ?? 0));
    progress.bushesBroken += Math.max(0, Math.floor(result.bushesBroken ?? 0));
  };
  addRunProgress(creditedRegion);
  if (result.isDarkin && creditedRegion !== DARKIN_CHEST) {
    addRunProgress(DARKIN_CHEST);
  }
  if (
    result.timeSec > save.bestRun.timeSec ||
    (result.timeSec === save.bestRun.timeSec && result.kills > save.bestRun.kills)
  ) {
    save.bestRun = {
      timeSec: result.timeSec,
      kills: result.kills,
      gold: result.gold,
      characterId: result.characterId ?? save.selectedCharacter,
      stageId: result.stageId ?? save.selectedStage,
    };
  }
  const performanceKeys = Math.min(
    5,
    Math.floor(result.timeSec / 300) + (result.timeSec >= 60 ? 1 : 0),
  );
  const found = Math.max(0, Math.floor(result.keysFound ?? 0));
  save.keys += performanceKeys + found;
  return performanceKeys + found;
}

// ---------------------------------------------------------------------------
// Region gacha. Shards are champion-specific; the player picks the region and
// when to spend shards, so they decide which champion to unlock first.
// ---------------------------------------------------------------------------

export type GachaDropKind = "champion" | "shards" | "gold";

export interface GachaDrop {
  kind: GachaDropKind;
  championId?: string;
  amount: number;
  /** True for the guaranteed Epic+ slot of a 10-pull. */
  guaranteed?: boolean;
}

export type RandomSource = () => number;

function pickWeighted<T>(items: T[], weight: (item: T) => number, rng: RandomSource): T {
  let total = 0;
  for (const item of items) total += Math.max(0, weight(item));
  let roll = rng() * total;
  for (const item of items) {
    roll -= Math.max(0, weight(item));
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

function addShards(save: SaveData, championId: string, amount: number): void {
  save.championShards[championId] = shardsFor(save, championId) + amount;
}

function unlockChampion(save: SaveData, championId: string): void {
  if (!isUnlocked(save, championId)) save.unlockedCharacters.push(championId);
}

function rarityWeight(character: CharacterDef): number {
  return RARITY_WEIGHTS[character.rarity ?? "rare"];
}

/** Pick a locked champion by rarity weight. */
function chooseLocked(save: SaveData, pool: CharacterDef[], rng: RandomSource): CharacterDef {
  const locked = pool.filter((c) => !isUnlocked(save, c.id));
  return pickWeighted(locked, rarityWeight, rng);
}

/** Roll once inside a region. Assumes the caller has already spent the chest. */
function rollRegion(save: SaveData, pool: CharacterDef[], rng: RandomSource): GachaDrop {
  const locked = pool.filter((c) => !isUnlocked(save, c.id));
  if (locked.length === 0) {
    save.gold += GACHA_ODDS.fallbackGold;
    return { kind: "gold", amount: GACHA_ODDS.fallbackGold };
  }

  const roll = rng();
  if (roll < GACHA_ODDS.champion) {
    const winner = chooseLocked(save, pool, rng);
    unlockChampion(save, winner.id);
    return { kind: "champion", championId: winner.id, amount: 1 };
  }
  if (roll < GACHA_ODDS.champion + GACHA_ODDS.shards) {
    const winner = chooseLocked(save, pool, rng);
    const shardRoll = rng();
    const amount = winner.rarity === "common" ? 3 : shardRoll < 0.35 ? 2 : 1;
    addShards(save, winner.id, amount);
    return { kind: "shards", championId: winner.id, amount };
  }
  save.gold += GACHA_ODDS.goldAmount;
  return { kind: "gold", amount: GACHA_ODDS.goldAmount };
}

/** Force the 10-pull's Epic+ guarantee. */
function guaranteedEpicPlus(save: SaveData, pool: CharacterDef[], rng: RandomSource): GachaDrop {
  const epic = pool.filter((c) => isEpicPlus(c) && !isUnlocked(save, c.id));
  if (epic.length > 0) {
    const winner = pickWeighted(epic, rarityWeight, rng);
    unlockChampion(save, winner.id);
    return { kind: "champion", championId: winner.id, amount: 1, guaranteed: true };
  }
  // Region complete: still honor the guarantee with an Epic+ shard bundle, then gold.
  const anyEpic = pool.filter((c) => isEpicPlus(c));
  if (anyEpic.length > 0) {
    const winner = pickWeighted(anyEpic, rarityWeight, rng);
    addShards(save, winner.id, 5);
    return { kind: "shards", championId: winner.id, amount: 5, guaranteed: true };
  }
  save.gold += GACHA_ODDS.guaranteeGold;
  return {
    kind: "gold",
    amount: GACHA_ODDS.guaranteeGold,
    guaranteed: true,
  };
}

/**
 * Open 1 or 10 region chests. Returns the drops (one per chest) or null when the
 * player cannot afford the pull. The 10-pull guarantees at least one Epic+.
 */
export function openRegionChests(
  save: SaveData,
  region: string,
  characters: CharacterDef[],
  count: 1 | 10,
  rng: RandomSource = Math.random,
): GachaDrop[] | null {
  if (save.keys < count) return null;
  const pool = championsInRegion(characters, region);
  if (pool.length === 0) return null;
  save.keys -= count;
  const progress = regionProgressFor(save, region);

  let drops: GachaDrop[];
  if (count === 1) {
    drops = [rollRegion(save, pool, rng)];
  } else {
    drops = [];
    for (let i = 0; i < 9; i++) drops.push(rollRegion(save, pool, rng));
    const epicIndex = drops.findIndex((drop) => {
      if (drop.kind !== "champion") return false;
      const champion = pool.find((c) => c.id === drop.championId);
      return champion ? isEpicPlus(champion) : false;
    });
    if (epicIndex >= 0) {
      // The natural pull already satisfied the guarantee; label it so the player
      // can see which result the 10-pull promised.
      drops[epicIndex].guaranteed = true;
      drops.push(rollRegion(save, pool, rng));
    } else {
      drops.push(guaranteedEpicPlus(save, pool, rng));
    }
  }

  // Record only after the complete roll set so 10-pull guarantees and fallbacks
  // are included in the persistent pull record.
  progress.pulls += drops.length;
  progress.trackedPulls += drops.length;
  for (const drop of drops) {
    if (drop.kind === "champion") progress.pullsChampions += 1;
    else if (drop.kind === "shards") progress.pullsShards += Math.max(0, drop.amount);
    else progress.pullsGold += Math.max(0, drop.amount);
    if (drop.guaranteed) progress.pullsGuaranteed += 1;
  }
  return drops;
}

/** Legacy single-chest entry kept for callers that only know the roster. */
export function openChest(
  save: SaveData,
  allCharacters: CharacterDef[],
  rng: RandomSource = Math.random,
): GachaDrop {
  if (save.keys <= 0) return { kind: "gold", amount: 0 };
  save.keys -= 1;
  return rollRegion(save, allCharacters, rng);
}

export type AchievementCategory =
  | "combat"
  | "survival"
  | "loot"
  | "exploration"
  | "collection"
  | "region"
  | "lore";

export interface AchievementContext {
  save: SaveData;
  result: RunResult | null;
  characters: CharacterDef[];
  totalKills: number;
}

export interface AchievementDef {
  id: string;
  label: string;
  description: string;
  category: AchievementCategory;
  region?: string;
  target: number;
  rewardGold?: number;
  rewardKeys?: number;
  progress: (context: AchievementContext) => number;
}

export function emptyRegionProgress(): RegionProgress {
  return {
    runs: 0,
    seconds: 0,
    chestsOpened: 0,
    keysFound: 0,
    elitesKilled: 0,
    bossesKilled: 0,
    bushesBroken: 0,
    pulls: 0,
    trackedPulls: 0,
    pullsChampions: 0,
    pullsShards: 0,
    pullsGold: 0,
    pullsGuaranteed: 0,
  };
}

/** Read (and lazily create) a region's persistent progress. */
export function regionProgressFor(save: SaveData, region: string): RegionProgress {
  const existing = save.regionProgress?.[region];
  if (existing) return existing;
  const created = emptyRegionProgress();
  if (!save.regionProgress) save.regionProgress = {};
  save.regionProgress[region] = created;
  return created;
}

function unlockedInRegion(save: SaveData, characters: CharacterDef[], region: string): number {
  return characters.filter(
    (champion) => isUnlocked(save, champion.id) && championRegions(champion).includes(region),
  ).length;
}

type RegionMetric =
  | "runs"
  | "seconds"
  | "chestsOpened"
  | "keysFound"
  | "elitesKilled"
  | "bossesKilled"
  | "bushesBroken"
  | "pulls"
  | "unlocked";

interface RegionTier {
  label: string;
  description: string;
  metric: RegionMetric;
  target: number;
}

interface RegionLore {
  region: string;
  tiers: [RegionTier, RegionTier, RegionTier];
}

function metricValue(context: AchievementContext, region: string, metric: RegionMetric): number {
  if (metric === "unlocked") {
    return unlockedInRegion(context.save, context.characters, region);
  }
  return regionProgressFor(context.save, region)[metric];
}

const REGION_LORE: RegionLore[] = [
  {
    region: "Demacia",
    tiers: [
      {
        label: "CROWN OF DUTY",
        description: "Complete a run as a Demacian champion.",
        metric: "runs",
        target: 1,
      },
      {
        label: "PETRICITE WARDENS",
        description: "Spend 30 minutes under Demacian banners.",
        metric: "seconds",
        target: 1800,
      },
      {
        label: "THE LIGHT REMEMBERS",
        description: "Open 20 Demacian chests.",
        metric: "pulls",
        target: 20,
      },
    ],
  },
  {
    region: "Noxus",
    tiers: [
      {
        label: "BLOOD AND AMBITION",
        description: "Complete a run as a Noxian champion.",
        metric: "runs",
        target: 1,
      },
      {
        label: "THE TRIFARIAN",
        description: "Defeat 20 elites across Noxian runs.",
        metric: "elitesKilled",
        target: 20,
      },
      {
        label: "GUILE'S ASCENT",
        description: "Defeat 6 bosses across Noxian runs.",
        metric: "bossesKilled",
        target: 6,
      },
    ],
  },
  {
    region: "Ionia",
    tiers: [
      {
        label: "BALANCE IN EXILE",
        description: "Complete a run as an Ionian champion.",
        metric: "runs",
        target: 1,
      },
      {
        label: "SPIRIT BLOSSOM",
        description: "Spend 20 minutes in Ionian runs.",
        metric: "seconds",
        target: 1200,
      },
      {
        label: "THE FIRST LANDS",
        description: "Open 25 Ionian chests.",
        metric: "pulls",
        target: 25,
      },
    ],
  },
  {
    region: "Shurima",
    tiers: [
      {
        label: "SUNBURIED",
        description: "Complete a run as a Shuriman champion.",
        metric: "runs",
        target: 1,
      },
      {
        label: "ASCENDED LEGION",
        description: "Defeat 3 bosses across Shuriman runs.",
        metric: "bossesKilled",
        target: 3,
      },
      {
        label: "AZIR'S RETURN",
        description: "Open 30 Shuriman chests.",
        metric: "pulls",
        target: 30,
      },
    ],
  },
  {
    region: "Bandle City",
    tiers: [
      {
        label: "DOORWAY MISCHIEF",
        description: "Complete a run as a Bandle City champion.",
        metric: "runs",
        target: 1,
      },
      {
        label: "PORTAL PATROL",
        description: "Open 5 run chests as a Bandle City champion.",
        metric: "chestsOpened",
        target: 5,
      },
      {
        label: "THE CITY BEYOND",
        description: "Unlock 8 Bandle City champions.",
        metric: "unlocked",
        target: 8,
      },
    ],
  },
  {
    region: "Runeterra",
    tiers: [
      {
        label: "WORLD-RUNE",
        description: "Complete a run as a Runeterran champion.",
        metric: "runs",
        target: 1,
      },
      {
        label: "THE OLD ROAD",
        description: "Complete 3 runs as Runeterran champions.",
        metric: "runs",
        target: 3,
      },
      {
        label: "RUNETERRA REMEMBERS",
        description: "Spend one hour in Runeterran runs.",
        metric: "seconds",
        target: 3600,
      },
    ],
  },
  {
    region: "Freljord",
    tiers: [
      {
        label: "WINTER'S TEETH",
        description: "Complete a run as a Freljordian champion.",
        metric: "runs",
        target: 1,
      },
      {
        label: "THE OLD GODS",
        description: "Break 50 bushes in Freljordian runs.",
        metric: "bushesBroken",
        target: 50,
      },
      {
        label: "DAWN OF THE TRIBE",
        description: "Defeat 4 bosses in Freljordian runs.",
        metric: "bossesKilled",
        target: 4,
      },
    ],
  },
  {
    region: "Piltover",
    tiers: [
      {
        label: "CITY OF PROGRESS",
        description: "Complete a run as a Piltover champion.",
        metric: "runs",
        target: 1,
      },
      {
        label: "HEXTECH LEDGER",
        description: "Find 10 keys in Piltover runs.",
        metric: "keysFound",
        target: 10,
      },
      {
        label: "THE GOLDEN SPIRE",
        description: "Open 30 Piltover chests.",
        metric: "pulls",
        target: 30,
      },
    ],
  },
  {
    region: "Zaun",
    tiers: [
      {
        label: "UNDERCITY AIR",
        description: "Complete a run as a Zaunite champion.",
        metric: "runs",
        target: 1,
      },
      {
        label: "CHEM-BARON'S DEBT",
        description: "Open 8 run chests in Zaunite runs.",
        metric: "chestsOpened",
        target: 8,
      },
      {
        label: "THE LOWER CITY",
        description: "Defeat 30 elites in Zaunite runs.",
        metric: "elitesKilled",
        target: 30,
      },
    ],
  },
  {
    region: "Bilgewater",
    tiers: [
      {
        label: "SALT AND STEEL",
        description: "Complete a run as a Bilgewater champion.",
        metric: "runs",
        target: 1,
      },
      {
        label: "THE SERPENT'S WAKE",
        description: "Find 15 keys in Bilgewater runs.",
        metric: "keysFound",
        target: 15,
      },
      {
        label: "TIDE OF COINS",
        description: "Complete 8 runs as Bilgewater champions.",
        metric: "runs",
        target: 8,
      },
    ],
  },
  {
    region: "Shadow Isles",
    tiers: [
      {
        label: "MISTBOUND",
        description: "Complete a run as a Shadow Isles champion.",
        metric: "runs",
        target: 1,
      },
      {
        label: "THE RUINED COURT",
        description: "Defeat 5 bosses in Shadow Isles runs.",
        metric: "bossesKilled",
        target: 5,
      },
      {
        label: "BLACK MIST RISING",
        description: "Spend 40 minutes in Shadow Isles runs.",
        metric: "seconds",
        target: 2400,
      },
    ],
  },
  {
    region: "Mount Targon",
    tiers: [
      {
        label: "THE CLIMB",
        description: "Complete a run as a Mount Targon champion.",
        metric: "runs",
        target: 1,
      },
      {
        label: "STARFORGED",
        description: "Defeat 25 elites in Mount Targon runs.",
        metric: "elitesKilled",
        target: 25,
      },
      {
        label: "THE ASPECT'S GAZE",
        description: "Open 25 Mount Targon chests.",
        metric: "pulls",
        target: 25,
      },
    ],
  },
  {
    region: "Ixtal",
    tiers: [
      {
        label: "HIDDEN GREEN",
        description: "Complete a run as an Ixtali champion.",
        metric: "runs",
        target: 1,
      },
      {
        label: "ELEMENTAL EDICT",
        description: "Break 75 bushes in Ixtali runs.",
        metric: "bushesBroken",
        target: 75,
      },
      {
        label: "IXAOCAN'S ROOTS",
        description: "Open 15 run chests in Ixtali runs.",
        metric: "chestsOpened",
        target: 15,
      },
    ],
  },
  {
    region: "Void",
    tiers: [
      {
        label: "THE HOLLOW",
        description: "Complete a run as a Void champion.",
        metric: "runs",
        target: 1,
      },
      {
        label: "WATCHERS BELOW",
        description: "Defeat 6 bosses in Void runs.",
        metric: "bossesKilled",
        target: 6,
      },
      {
        label: "NOTHING RETURNS",
        description: "Complete 10 runs as Void champions.",
        metric: "runs",
        target: 10,
      },
    ],
  },
];

function regionAchievements(): AchievementDef[] {
  const out: AchievementDef[] = [];
  for (const entry of REGION_LORE) {
    const slug = entry.region.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    entry.tiers.forEach((tier, tierIndex) => {
      out.push({
        id: `region-${slug}-${tierIndex + 1}`,
        label: tier.label,
        description: tier.description,
        category: "region",
        region: entry.region,
        target: tier.target,
        rewardGold: [40, 90, 180][tierIndex],
        rewardKeys: [0, 1, 2][tierIndex],
        progress: (context) => metricValue(context, entry.region, tier.metric),
      });
    });
  }
  return out;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first-blood",
    label: "FIRST BLOOD",
    description: "Draw first blood in a run.",
    category: "combat",
    target: 1,
    rewardGold: 25,
    progress: (context) => context.result?.kills ?? 0,
  },
  {
    id: "survive-1min",
    label: "SURVIVOR",
    description: "Survive a full minute in the Rift.",
    category: "survival",
    target: 60,
    rewardGold: 25,
    progress: (context) => context.result?.timeSec ?? 0,
  },
  {
    id: "survive-5min",
    label: "VETERAN",
    description: "Survive five minutes in a single run.",
    category: "survival",
    target: 300,
    rewardGold: 50,
    progress: (context) => context.result?.timeSec ?? 0,
  },
  {
    id: "survive-10min",
    label: "RIFT WALKER",
    description: "Reach the ten-minute mark in one run.",
    category: "survival",
    target: 600,
    rewardGold: 100,
    progress: (context) => context.result?.timeSec ?? 0,
  },
  {
    id: "reaper",
    label: "REAPER",
    description: "Reach 100 lifetime kills.",
    category: "combat",
    target: 100,
    rewardGold: 50,
    progress: (context) => context.save.totalKills,
  },
  {
    id: "slayer",
    label: "SLAYER",
    description: "Reach 500 lifetime kills.",
    category: "combat",
    target: 500,
    rewardGold: 150,
    progress: (context) => context.save.totalKills,
  },
  {
    id: "boss-breaker",
    label: "BOSS BREAKER",
    description: "Defeat a boss or final threat.",
    category: "combat",
    target: 1,
    rewardGold: 100,
    rewardKeys: 1,
    progress: (context) => context.result?.bossesKilled ?? 0,
  },
  {
    id: "elite-hunter",
    label: "ELITE HUNTER",
    description: "Defeat 10 elites in one run.",
    category: "combat",
    target: 10,
    rewardGold: 75,
    progress: (context) => context.result?.elitesKilled ?? 0,
  },
  {
    id: "untouchable",
    label: "UNTOUCHABLE",
    description: "Survive five minutes without being downed.",
    category: "survival",
    target: 300,
    rewardGold: 100,
    progress: (context) =>
      context.result && (context.result.downs ?? 0) === 0 ? context.result.timeSec : 0,
  },
  {
    id: "chest-runner",
    label: "CHEST RUNNER",
    description: "Open 5 spawnable run chests.",
    category: "loot",
    target: 5,
    rewardGold: 50,
    rewardKeys: 1,
    progress: (context) => context.result?.chestsOpened ?? 0,
  },
  {
    id: "treasure-hunter",
    label: "TREASURE HUNTER",
    description: "Open 15 spawnable run chests.",
    category: "loot",
    target: 15,
    rewardGold: 125,
    rewardKeys: 3,
    progress: (context) => context.result?.chestsOpened ?? 0,
  },
  {
    id: "key-runner",
    label: "KEY RUNNER",
    description: "Bring home 8 keys from a single run.",
    category: "loot",
    target: 8,
    rewardGold: 75,
    rewardKeys: 2,
    progress: (context) => context.result?.keysFound ?? 0,
  },
  {
    id: "bushwhacker",
    label: "BUSHWHACKER",
    description: "Break 25 bushes with abilities or AOE.",
    category: "exploration",
    target: 25,
    rewardGold: 50,
    progress: (context) => context.result?.bushesBroken ?? 0,
  },
  {
    id: "grove-clearer",
    label: "GROVE CLEARER",
    description: "Break 100 bushes across all runs.",
    category: "exploration",
    target: 100,
    rewardGold: 100,
    rewardKeys: 1,
    progress: (context) => context.save.lifetimeBushesBroken,
  },
  {
    id: "coop-victory",
    label: "BONDS OF THE RIFT",
    description: "Reach five minutes in a co-op run with your party.",
    category: "exploration",
    target: 300,
    rewardGold: 150,
    rewardKeys: 2,
    progress: (context) => (context.result?.coOp ? context.result.timeSec : 0),
  },
  {
    id: "flawless-victory",
    label: "FLAWLESS",
    description: "Reach ten minutes without being downed once.",
    category: "survival",
    target: 600,
    rewardGold: 200,
    rewardKeys: 2,
    progress: (context) =>
      context.result && (context.result.downs ?? 0) === 0 ? context.result.timeSec : 0,
  },
  {
    id: "collector",
    label: "COLLECTOR",
    description: "Unlock 10 champions for your collection.",
    category: "collection",
    target: 10,
    rewardGold: 150,
    progress: (context) => context.save.unlockedCharacters.length,
  },
  ...regionAchievements(),
  {
    id: "worldwalker",
    label: "WORLDWALKER",
    description: "Play runs from 7 different regions.",
    category: "lore",
    target: 7,
    rewardGold: 250,
    rewardKeys: 2,
    progress: (context) =>
      Object.entries(context.save.regionProgress ?? {}).filter(
        ([region, progress]) => region !== DARKIN_CHEST && progress.runs > 0,
      ).length,
  },
  {
    id: "runeterra-chosen",
    label: "RUNETERRA'S CHOSEN",
    description: "Unlock 25 champions.",
    category: "lore",
    target: 25,
    rewardGold: 300,
    rewardKeys: 2,
    progress: (context) => context.save.unlockedCharacters.length,
  },
  {
    id: "keykeeper",
    label: "KEEPER OF KEYS",
    description: "Find 50 keys across all runs.",
    category: "lore",
    target: 50,
    rewardGold: 150,
    rewardKeys: 2,
    progress: (context) => context.save.lifetimeKeysFound,
  },
  {
    id: "grovekeeper",
    label: "GROVEKEEPER",
    description: "Break 200 bushes across all runs.",
    category: "lore",
    target: 200,
    rewardGold: 200,
    rewardKeys: 1,
    progress: (context) => context.save.lifetimeBushesBroken,
  },
  {
    id: "lorekeeper",
    label: "LOREKEEPER",
    description: "Complete 50 achievements.",
    category: "lore",
    target: 50,
    rewardGold: 300,
    rewardKeys: 3,
    progress: (context) => context.save.achievements.length,
  },
  {
    id: "darkin-wake",
    label: "THE DARKIN WAKE",
    description: "Open 10 Darkin chests.",
    category: "lore",
    region: "Darkin",
    target: 10,
    rewardGold: 200,
    rewardKeys: 1,
    progress: (context) => regionProgressFor(context.save, "Darkin").pulls,
  },
  {
    id: "bladebound",
    label: "BLADEBOUND",
    description: "Unlock 3 Darkin champions.",
    category: "collection",
    region: "Darkin",
    target: 3,
    rewardGold: 250,
    rewardKeys: 2,
    progress: (context) =>
      context.characters.filter(
        (champion) => isDarkinChampion(champion) && isUnlocked(context.save, champion.id),
      ).length,
  },
  {
    id: "unsundered",
    label: "THE UNSUNDERED",
    description: "Complete 5 runs as a Darkin champion.",
    category: "lore",
    region: "Darkin",
    target: 5,
    rewardGold: 300,
    rewardKeys: 2,
    progress: (context) => regionProgressFor(context.save, "Darkin").runs,
  },
];

/** Current display value for an achievement, including saved run milestones. */
export function achievementCurrent(
  save: SaveData,
  achievement: AchievementDef,
  characters: CharacterDef[] = [],
): number {
  if (save.achievements.includes(achievement.id)) return achievement.target;
  const live = achievement.progress({
    save,
    result: null,
    characters,
    totalKills: save.totalKills,
  });
  return Math.min(
    achievement.target,
    Math.max(save.achievementProgress?.[achievement.id] ?? 0, live),
  );
}

/** Check achievements; returns newly-unlocked labels and awards their bonuses. */
export function checkAchievements(
  save: SaveData,
  result: RunResult | null,
  characters: CharacterDef[] = [],
): string[] {
  if (!save.achievementProgress) save.achievementProgress = {};
  const context: AchievementContext = {
    save,
    result,
    characters,
    totalKills: save.totalKills,
  };
  const unlocked: string[] = [];
  for (const achievement of ACHIEVEMENTS) {
    if (save.achievements.includes(achievement.id)) continue;
    const live = Math.max(0, achievement.progress(context));
    const previous = save.achievementProgress[achievement.id] ?? 0;
    save.achievementProgress[achievement.id] = Math.min(
      achievement.target,
      Math.max(previous, live),
    );
    if (live < achievement.target) continue;
    save.achievements.push(achievement.id);
    save.gold += achievement.rewardGold ?? 0;
    save.keys += achievement.rewardKeys ?? 0;
    unlocked.push(achievement.label);
  }
  return unlocked;
}
