import { afterEach, describe, expect, it } from "vitest";
import { SAVE_VERSION, loadSave, resolveSelectedCharacter } from "./save";

class MemoryStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", {
  value: storage,
  configurable: true,
});

afterEach(() => storage.clear());

describe("save migration", () => {
  it("moves v1 global purchases onto the selected champion and initializes gacha fields", () => {
    storage.setItem(
      "rift-survivors-save",
      JSON.stringify({
        version: 1,
        gold: 42,
        purchases: { power: 2, vitality: 1 },
        unlockedCharacters: ["brand", "lux"],
        chests: 3,
        achievements: ["first-blood"],
        totalKills: 10,
        bestTimeSec: 120,
        settings: { volume: 0.1 },
      }),
    );
    const data = loadSave("lux");
    expect(data.version).toBe(SAVE_VERSION);
    expect(data.purchases).toBeUndefined();
    expect(data.selectedCharacter).toBe("brand");
    expect(data.championUpgrades.brand).toEqual({ power: 2, vitality: 1 });
    expect(data.championShards).toEqual({});
    expect(data.achievementProgress).toEqual({});
    expect(data.regionProgress).toEqual({});
    expect(data.selectedStage).toBe("rift-field");
    expect(data.profileName).toBe("Summoner");
    expect(data.runsPlayed).toBe(0);
    expect(data.bestRun).toEqual({ timeSec: 0, kills: 0, gold: 0, characterId: "", stageId: "" });
    expect(data.gold).toBe(42);
    expect(data.keys).toBe(3);
    expect(data.settings.keybinds.up).toBe("w");
  });

  it("migrates v5 chests into keys without changing the value", () => {
    storage.setItem(
      "rift-survivors-save",
      JSON.stringify({
        version: 5,
        gold: 7,
        unlockedCharacters: ["lux"],
        selectedCharacter: "lux",
        keys: 0,
        chests: 14,
        achievements: [],
        totalKills: 0,
        bestTimeSec: 0,
        runsPlayed: 2,
        bestRun: { timeSec: 0, kills: 0, gold: 0, characterId: "", stageId: "" },
      }),
    );
    const data = loadSave("lux");
    expect(data.version).toBe(SAVE_VERSION);
    expect(data.keys).toBe(14);
    expect("chests" in data).toBe(false);
    expect(data.runsPlayed).toBe(2);
  });

  it("preserves v7 lore progress and initializes v8 pull counters", () => {
    storage.setItem(
      "rift-survivors-save",
      JSON.stringify({
        version: 7,
        unlockedCharacters: ["lux"],
        selectedCharacter: "lux",
        keys: 4,
        championFocus: { Demacia: "lux" },
        achievements: ["region-demacia-1"],
        achievementProgress: { "region-demacia-1": 3.8, bad: -2 },
        regionProgress: {
          Demacia: {
            runs: 2,
            seconds: 123.9,
            chestsOpened: 1,
            keysFound: 2,
            elitesKilled: 3,
            bossesKilled: 0,
            bushesBroken: 4,
            pulls: 5,
          },
        },
      }),
    );
    const data = loadSave("lux");
    expect(data.version).toBe(SAVE_VERSION);
    expect("championFocus" in data).toBe(false);
    expect(data.achievementProgress["region-demacia-1"]).toBe(3);
    expect(data.achievementProgress.bad).toBeUndefined();
    expect(data.regionProgress.Demacia).toMatchObject({
      runs: 2,
      seconds: 123,
      chestsOpened: 1,
      keysFound: 2,
      elitesKilled: 3,
      pulls: 5,
      trackedPulls: 0,
      pullsChampions: 0,
      pullsShards: 0,
      pullsGold: 0,
      pullsGuaranteed: 0,
    });
  });

  it("repairs a locked selected champion", () => {
    const data = loadSave("lux");
    data.selectedCharacter = "brand";
    data.unlockedCharacters = ["lux"];
    expect(resolveSelectedCharacter(data, "lux")).toBe("lux");
    expect(data.selectedCharacter).toBe("lux");
  });
});
