import { CHAMPION_SKINS } from "@rift/content";
import type { CharacterDef, PowerUpDef } from "@rift/sim";
import { describe, expect, it } from "vitest";
import type { SaveData } from "../save/save";
import {
  ACHIEVEMENTS,
  SKIN_COST,
  awardRun,
  buyPowerUp,
  buySkin,
  championsInRegion,
  checkAchievements,
  computeMetaBonuses,
  equipSkin,
  openRegionChests,
  rankOf,
  regionProgressFor,
  regionsOf,
  shardsFor,
  shardsRequired,
  unlockWithShards,
} from "./meta";

function save(overrides: Partial<SaveData> = {}): SaveData {
  return {
    version: 8,
    profileName: "Tester",
    gold: 0,
    selectedCharacter: "a",
    championUpgrades: {},
    championShards: {},
    selectedStage: "rift-field",
    unlockedCharacters: ["a"],
    keys: 10,
    blueEssence: 0,
    ownedSkins: {},
    equippedSkin: {},
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
      volume: 0.2,
      music: 0.4,
      sfx: 0.7,
      shake: true,
      damageNumbers: true,
      showFps: false,
      shopKey: "b",
      keybinds: { up: "w", down: "s", left: "a", right: "d" },
    },
    ...overrides,
  };
}

const CHARACTERS: CharacterDef[] = [
  {
    id: "a",
    name: "Alpha",
    region: "Test",
    rarity: "epic",
    startingAbility: "w",
  },
  {
    id: "b",
    name: "Beta",
    region: "Test",
    rarity: "rare",
    startingAbility: "w",
  },
];

const MULTI: CharacterDef = {
  id: "multi",
  name: "Multi",
  region: "Noxus",
  rarity: "epic",
  startingAbility: "w",
  profile: {
    title: "the Cross-Region",
    regions: ["Noxus", "Ionia"],
    roles: ["Mage"],
    summary: "A test champion with two region homes.",
    sources: {
      official: "https://www.leagueoflegends.com/en-au/champions/example/",
      wiki: "https://wiki.leagueoflegends.com/en-us/Universe:Example",
      verifiedAt: "2026-10-29",
    },
  },
};

describe("per-champion upgrades", () => {
  const power: PowerUpDef = {
    id: "power",
    stat: "might",
    perRank: 0.05,
    maxRank: 2,
    costs: [10, 20],
  };

  it("invests into one champion without leaking to another", () => {
    const data = save({ gold: 100 });
    data.unlockedCharacters.push("b");
    expect(buyPowerUp(data, power, "a")).toBe(true);
    expect(rankOf(data, power, "a")).toBe(1);
    expect(rankOf(data, power, "b")).toBe(0);
    expect(computeMetaBonuses(data, [power], "a")).toEqual({ might: 0.05 });
    expect(computeMetaBonuses(data, [power], "b")).toEqual({});
    expect(data.gold).toBe(90);
  });

  it("aggregates multi-stat relic upgrades", () => {
    const relic: PowerUpDef = {
      id: "relic",
      stats: { might: 0.02, maxHp: 0.03 },
      maxRank: 2,
      costs: [10, 20],
    };
    const data = save({ gold: 30 });
    data.championUpgrades.a = { relic: 2 };
    expect(computeMetaBonuses(data, [relic], "a")).toEqual({ might: 0.04, maxHp: 0.06 });
  });
});

describe("run rewards and profile", () => {
  it("tracks runs and keeps the best run by survival time", () => {
    const data = save();
    awardRun(data, {
      gold: 100,
      kills: 10,
      timeSec: 60,
      won: false,
      keysFound: 1,
      characterId: "a",
      stageId: "rift-field",
    });
    expect(data.runsPlayed).toBe(1);
    expect(data.bestRun).toMatchObject({ timeSec: 60, kills: 10, gold: 100, characterId: "a" });
    awardRun(data, {
      gold: 30,
      kills: 3,
      timeSec: 30,
      won: false,
      characterId: "b",
      stageId: "noxus-warfront",
    });
    expect(data.runsPlayed).toBe(2);
    expect(data.bestRun.timeSec).toBe(60);
    expect(data.bestRun.characterId).toBe("a");
  });

  it("tracks lifetime counters and pays achievement rewards", () => {
    const data = save({ gold: 0, keys: 0, achievements: [] });
    const result = {
      gold: 25,
      kills: 20,
      timeSec: 300,
      won: false,
      keysFound: 8,
      chestsOpened: 15,
      bushesBroken: 100,
      elitesKilled: 10,
      bossesKilled: 1,
      downs: 1,
      characterId: "a",
      stageId: "rift-field",
    };
    const keysEarned = awardRun(data, result);
    const unlocked = checkAchievements(data, result);
    expect(keysEarned).toBeGreaterThan(0);
    expect(unlocked).toContain("BOSS BREAKER");
    expect(unlocked).toContain("TREASURE HUNTER");
    expect(unlocked).toContain("GROVE CLEARER");
    expect(data.lifetimeBushesBroken).toBe(100);
    expect(data.lifetimeChestsOpened).toBe(15);
    expect(data.lifetimeBossesKilled).toBe(1);
    expect(data.keys).toBeGreaterThan(keysEarned);
  });
});

describe("region gacha", () => {
  it("puts multi-region champions in every associated chest pool", () => {
    const roster = [...CHARACTERS, MULTI];
    expect(championsInRegion(roster, "Noxus").filter((c) => c.id === "multi")).toHaveLength(1);
    expect(championsInRegion(roster, "Ionia").filter((c) => c.id === "multi")).toHaveLength(1);
    expect(regionsOf(roster)).toEqual(["Noxus", "Ionia", "Test"]);
    expect(championsInRegion([MULTI], "Noxus")).toHaveLength(1);
  });

  it("can pull a multi-region champion from either region", () => {
    const noxus = save({ keys: 1, unlockedCharacters: [] });
    expect(openRegionChests(noxus, "Noxus", [MULTI], 1, () => 0)?.[0].championId).toBe("multi");
    const ionia = save({ keys: 1, unlockedCharacters: [] });
    expect(openRegionChests(ionia, "Ionia", [MULTI], 1, () => 0)?.[0].championId).toBe("multi");
  });

  it("opens one chest and can unlock a champion on a low roll", () => {
    const data = save({ keys: 1, unlockedCharacters: [] });
    const drops = openRegionChests(data, "Test", CHARACTERS, 1, () => 0);
    expect(drops).toHaveLength(1);
    expect(drops?.[0].kind).toBe("champion");
    expect(drops?.[0].championId).toBe("a");
    expect(data.unlockedCharacters).toContain("a");
    expect(data.keys).toBe(0);
    expect(regionProgressFor(data, "Test")).toMatchObject({
      pulls: 1,
      trackedPulls: 1,
      pullsChampions: 1,
      pullsShards: 0,
      pullsGold: 0,
      pullsGuaranteed: 0,
    });
  });

  it("records shard and gold outcomes per pull", () => {
    const data = save({ keys: 2, unlockedCharacters: [] });
    const rolls = [0.1, 0, 0, 0.99];
    let roll = 0;
    const rng = (): number => rolls[roll++] ?? 0;
    openRegionChests(data, "Test", CHARACTERS, 1, rng);
    openRegionChests(data, "Test", CHARACTERS, 1, rng);
    expect(regionProgressFor(data, "Test")).toMatchObject({
      pulls: 2,
      trackedPulls: 2,
      pullsChampions: 0,
      pullsShards: 2,
      pullsGold: 50,
      pullsGuaranteed: 0,
    });
  });

  it("a 10-pull guarantees an Epic+ champion", () => {
    const data = save({ keys: 10, unlockedCharacters: [] });
    // 0.99 pushes normal rolls to gold; the guarantee then must unlock the epic.
    const drops = openRegionChests(data, "Test", CHARACTERS, 10, () => 0.99);
    expect(drops).toHaveLength(10);
    const guaranteed = drops?.filter((d) => d.guaranteed) ?? [];
    expect(guaranteed.length).toBe(1);
    expect(guaranteed[0]?.championId).toBe("a");
    expect(data.unlockedCharacters).toContain("a");
    expect(data.keys).toBe(0);
    expect(regionProgressFor(data, "Test")).toMatchObject({
      pulls: 10,
      trackedPulls: 10,
      pullsChampions: 1,
      pullsShards: 0,
      pullsGold: 450,
      pullsGuaranteed: 1,
    });
  });

  it("refuses a 10-pull without 10 keys", () => {
    const data = save({ keys: 9 });
    expect(openRegionChests(data, "Test", CHARACTERS, 10)).toBeNull();
    expect(data.keys).toBe(9);
  });

  it("has a deep lore/region achievement catalog", () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(64);
    expect(ACHIEVEMENTS.filter((achievement) => achievement.category === "region")).toHaveLength(
      42,
    );
    expect(ACHIEVEMENTS.some((achievement) => achievement.region === "Demacia")).toBe(true);
    expect(ACHIEVEMENTS.some((achievement) => achievement.id === "darkin-wake")).toBe(true);
  });

  it("keeps Darkin in a dedicated chest pool and records lore progress", () => {
    const multiProfile = MULTI.profile;
    if (!multiProfile) throw new Error("Multi fixture profile missing");
    const darkin: CharacterDef = {
      ...MULTI,
      id: "darkin-test",
      region: "Shurima",
      profile: {
        ...multiProfile,
        regions: ["Shurima", "Runeterra"],
        species: "Darkin, God-Warrior, Human",
      },
    };
    const roster = [...CHARACTERS, darkin];
    expect(championsInRegion(roster, "Darkin").map((champion) => champion.id)).toEqual([
      "darkin-test",
    ]);
    expect(
      championsInRegion(roster, "Shurima").some((champion) => champion.id === "darkin-test"),
    ).toBe(true);

    const data = save({ keys: 1, unlockedCharacters: [] });
    const drops = openRegionChests(data, "Darkin", roster, 1, () => 0);
    expect(drops?.[0].championId).toBe("darkin-test");
    expect(regionProgressFor(data, "Darkin").pulls).toBe(1);

    awardRun(data, {
      gold: 0,
      kills: 0,
      timeSec: 120,
      won: false,
      primaryRegion: "Shurima",
      championRegions: ["Shurima", "Runeterra"],
      isDarkin: true,
    });
    expect(regionProgressFor(data, "Shurima").runs).toBe(1);
    expect(regionProgressFor(data, "Darkin").runs).toBe(1);
  });

  it("spends shards only on the champion the player chooses", () => {
    const data = save({ unlockedCharacters: [] });
    const beta = CHARACTERS[1];
    const required = shardsRequired(beta);
    data.championShards.b = required;
    expect(shardsFor(data, "b")).toBe(required);
    expect(unlockWithShards(data, beta)).toBe(true);
    expect(data.unlockedCharacters).toContain("b");
    expect(data.unlockedCharacters).not.toContain("a");
    expect(shardsFor(data, "b")).toBe(0);
  });
});

describe("skins and Blue Essence", () => {
  it("buys an obtainable skin with Blue Essence and equips it", () => {
    const s = save({ blueEssence: SKIN_COST });
    s.unlockedCharacters.push("ahri");
    const data = CHAMPION_SKINS.ahri;
    const skin = data.obtainable[0];
    expect(buySkin(s, "ahri", skin.num)).toEqual({ ok: true });
    expect(s.ownedSkins.ahri).toContain(skin.num);
    expect(s.blueEssence).toBe(0);
    equipSkin(s, "ahri", skin.num);
    expect(s.equippedSkin.ahri).toBe(skin.num);
    // Equip falls back cleanly: unequip by undefined.
    equipSkin(s, "ahri", undefined);
    expect(s.equippedSkin.ahri).toBeUndefined();
  });

  it("rejects unaffordable, unobtainable, and duplicate purchases", () => {
    const s = save({ blueEssence: 10 });
    const data = CHAMPION_SKINS.ahri;
    const skin = data.obtainable[0];
    expect(buySkin(s, "ahri", skin.num)).toMatchObject({ ok: false });
    s.blueEssence = SKIN_COST;
    expect(buySkin(s, "ahri", 9999)).toMatchObject({ ok: false });
    expect(buySkin(s, "ahri", skin.num)).toEqual({ ok: true });
    expect(buySkin(s, "ahri", skin.num)).toMatchObject({ ok: false });
  });
});
