// Meta progression logic: per-champion upgrades, region gacha shards, and
// achievements. Pure functions over SaveData; the UI persists after calling them.
import type { CharacterDef, PowerUpDef, Rarity } from "@rift/sim";
import { REGION_ORDER, championRegions } from "../regions";
import type { SaveData } from "../save/save";

export interface RunResult {
  gold: number;
  kills: number;
  timeSec: number;
  won: boolean;
  /** Chests picked up during the run (saved for the shop). */
  chestsFound?: number;
  characterId?: string;
  stageId?: string;
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
  return characters.filter((champion) => championRegions(champion).includes(region));
}

/** Upgrades shown for one champion; explicit tree first, else all content entries. */
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
    if (rank > 0) bonuses[p.stat] = (bonuses[p.stat] ?? 0) + p.perRank * rank;
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

export function focusFor(save: SaveData, region: string): string | null {
  return save.championFocus[region] || null;
}

export function setFocus(save: SaveData, region: string, championId: string | null): void {
  save.championFocus[region] = championId ?? "";
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

/** Award gold + performance/found chests after a run. Returns chests earned. */
export function awardRun(save: SaveData, result: RunResult): number {
  save.gold += result.gold;
  save.totalKills += result.kills;
  save.bestTimeSec = Math.max(save.bestTimeSec, result.timeSec);
  save.runsPlayed += 1;
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
  const performanceChests = Math.min(
    5,
    Math.floor(result.timeSec / 300) + (result.timeSec >= 60 ? 1 : 0),
  );
  const found = Math.max(0, Math.floor(result.chestsFound ?? 0));
  save.chests += performanceChests + found;
  return performanceChests + found;
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

/** Pick a locked champion, giving the player's region focus a 50% preference. */
function chooseLocked(
  save: SaveData,
  region: string,
  pool: CharacterDef[],
  rng: RandomSource,
): CharacterDef {
  const locked = pool.filter((c) => !isUnlocked(save, c.id));
  const focus = locked.find((c) => c.id === save.championFocus[region]);
  if (focus && rng() < 0.5) return focus;
  return pickWeighted(locked, rarityWeight, rng);
}

/** Roll once inside a region. Assumes the caller has already spent the chest. */
function rollRegion(
  save: SaveData,
  region: string,
  pool: CharacterDef[],
  rng: RandomSource,
): GachaDrop {
  const locked = pool.filter((c) => !isUnlocked(save, c.id));
  if (locked.length === 0) {
    save.gold += GACHA_ODDS.fallbackGold;
    return { kind: "gold", amount: GACHA_ODDS.fallbackGold };
  }

  const roll = rng();
  if (roll < GACHA_ODDS.champion) {
    const winner = chooseLocked(save, region, pool, rng);
    unlockChampion(save, winner.id);
    return { kind: "champion", championId: winner.id, amount: 1 };
  }
  if (roll < GACHA_ODDS.champion + GACHA_ODDS.shards) {
    const winner = chooseLocked(save, region, pool, rng);
    const shardRoll = rng();
    const amount = winner.rarity === "common" ? 3 : shardRoll < 0.35 ? 2 : 1;
    addShards(save, winner.id, amount);
    return { kind: "shards", championId: winner.id, amount };
  }
  save.gold += GACHA_ODDS.goldAmount;
  return { kind: "gold", amount: GACHA_ODDS.goldAmount };
}

/** Force the 10-pull's Epic+ guarantee. */
function guaranteedEpicPlus(
  save: SaveData,
  region: string,
  pool: CharacterDef[],
  rng: RandomSource,
): GachaDrop {
  const epic = pool.filter((c) => isEpicPlus(c) && !isUnlocked(save, c.id));
  if (epic.length > 0) {
    const focus = epic.find((c) => c.id === save.championFocus[region]);
    const winner = focus && rng() < 0.5 ? focus : pickWeighted(epic, rarityWeight, rng);
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
  if (save.chests < count) return null;
  const pool = championsInRegion(characters, region);
  if (pool.length === 0) return null;
  save.chests -= count;

  if (count === 1) return [rollRegion(save, region, pool, rng)];

  const drops: GachaDrop[] = [];
  for (let i = 0; i < 9; i++) drops.push(rollRegion(save, region, pool, rng));
  const epicIndex = drops.findIndex((drop) => {
    if (drop.kind !== "champion") return false;
    const champion = pool.find((c) => c.id === drop.championId);
    return champion ? isEpicPlus(champion) : false;
  });
  if (epicIndex >= 0) {
    // The natural pull already satisfied the guarantee; label it so the player
    // can see which result the 10-pull promised.
    drops[epicIndex].guaranteed = true;
    drops.push(rollRegion(save, region, pool, rng));
  } else {
    drops.push(guaranteedEpicPlus(save, region, pool, rng));
  }
  return drops;
}

/** Legacy single-chest entry kept for callers that only know the roster. */
export function openChest(
  save: SaveData,
  allCharacters: CharacterDef[],
  rng: RandomSource = Math.random,
): GachaDrop {
  if (save.chests <= 0) return { kind: "gold", amount: 0 };
  save.chests -= 1;
  return rollRegion(save, "Runeterra", allCharacters, rng);
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
