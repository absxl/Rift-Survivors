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
    expect(data.championFocus).toEqual({});
    expect(data.selectedStage).toBe("rift-field");
    expect(data.profileName).toBe("Summoner");
    expect(data.runsPlayed).toBe(0);
    expect(data.bestRun).toEqual({ timeSec: 0, kills: 0, gold: 0, characterId: "", stageId: "" });
    expect(data.gold).toBe(42);
    expect(data.chests).toBe(3);
    expect(data.settings.keybinds.up).toBe("w");
  });

  it("repairs a locked selected champion", () => {
    const data = loadSave("lux");
    data.selectedCharacter = "brand";
    data.unlockedCharacters = ["lux"];
    expect(resolveSelectedCharacter(data, "lux")).toBe("lux");
    expect(data.selectedCharacter).toBe("lux");
  });
});
