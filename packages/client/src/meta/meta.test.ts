import type { CharacterDef, PowerUpDef } from "@rift/sim";
import { describe, expect, it } from "vitest";
import type { SaveData } from "../save/save";
import {
  buyPowerUp,
  computeMetaBonuses,
  openRegionChests,
  rankOf,
  shardsFor,
  shardsRequired,
  unlockWithShards,
} from "./meta";

function save(overrides: Partial<SaveData> = {}): SaveData {
  return {
    version: 2,
    gold: 0,
    selectedCharacter: "a",
    championUpgrades: {},
    championShards: {},
    unlockedCharacters: ["a"],
    chests: 10,
    achievements: [],
    totalKills: 0,
    bestTimeSec: 0,
    settings: {
      volume: 0.2,
      shake: true,
      damageNumbers: true,
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
    startingWeapon: "w",
  },
  {
    id: "b",
    name: "Beta",
    region: "Test",
    rarity: "rare",
    startingWeapon: "w",
  },
];

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
});

describe("region gacha", () => {
  it("opens one chest and can unlock a champion on a low roll", () => {
    const data = save({ chests: 1, unlockedCharacters: [] });
    const drops = openRegionChests(data, "Test", CHARACTERS, 1, () => 0);
    expect(drops).toHaveLength(1);
    expect(drops?.[0].kind).toBe("champion");
    expect(drops?.[0].championId).toBe("a");
    expect(data.unlockedCharacters).toContain("a");
    expect(data.chests).toBe(0);
  });

  it("a 10-pull guarantees an Epic+ champion", () => {
    const data = save({ chests: 10, unlockedCharacters: [] });
    // 0.99 pushes normal rolls to gold; the guarantee then must unlock the epic.
    const drops = openRegionChests(data, "Test", CHARACTERS, 10, () => 0.99);
    expect(drops).toHaveLength(10);
    const guaranteed = drops?.filter((d) => d.guaranteed) ?? [];
    expect(guaranteed.length).toBe(1);
    expect(guaranteed[0]?.championId).toBe("a");
    expect(data.unlockedCharacters).toContain("a");
    expect(data.chests).toBe(0);
  });

  it("refuses a 10-pull without 10 chests", () => {
    const data = save({ chests: 9 });
    expect(openRegionChests(data, "Test", CHARACTERS, 10)).toBeNull();
    expect(data.chests).toBe(9);
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
