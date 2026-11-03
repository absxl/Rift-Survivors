import type { CharacterDef } from "@rift/sim";
import { describe, expect, it } from "vitest";
import { championRegions, isDarkinChampion, regionCrest, regionTheme } from "./regions";

const RIVEN: CharacterDef = {
  id: "riven",
  name: "Riven",
  region: "Noxus",
  startingAbility: "cleaver",
  profile: {
    title: "the Exile",
    regions: ["Noxus", "Ionia"],
    roles: ["Fighter", "Assassin"],
    summary: "A Noxian exile.",
    sources: {
      official: "https://www.leagueoflegends.com/en-au/champions/riven/",
      wiki: "https://wiki.leagueoflegends.com/en-us/Universe:Riven",
      verifiedAt: "2026-10-29",
    },
  },
};

describe("region themes", () => {
  it("reads multi-region memberships and falls back to the primary region", () => {
    expect(championRegions(RIVEN)).toEqual(["Noxus", "Ionia"]);
    expect(championRegions({ id: "a", region: "Demacia", startingAbility: "x" })).toEqual([
      "Demacia",
    ]);
    expect(championRegions({ id: "b", startingAbility: "x" })).toEqual(["Runeterra"]);
  });

  it("keeps the profile primary region as the theme lead", () => {
    expect(regionTheme(["Noxus", "Ionia"]).primary).toBe("Noxus");
    expect(regionTheme(["Runeterra", "Demacia"]).primary).toBe("Runeterra");
    expect(regionTheme(["Noxus", "Ionia"]).colors).toHaveLength(2);
  });

  it("points every region at a normalized public crest asset", () => {
    expect(regionCrest("Demacia")).toBe("/regions/normalized/demacia.png");
    expect(regionCrest("Ionia")).toBe("/regions/normalized/ionia.png");
    expect(regionCrest("Runeterra")).toBe("/regions/runeterra.svg");
    expect(regionCrest("Darkin")).toBe("/regions/darkin.svg");
  });

  it("detects Darkin champions from verified profile species", () => {
    const profile = RIVEN.profile;
    if (!profile) throw new Error("Riven fixture profile missing");
    expect(
      isDarkinChampion({
        ...RIVEN,
        profile: { ...profile, species: "Darkin, God-Warrior, Human" },
      }),
    ).toBe(true);
    expect(
      isDarkinChampion({
        ...RIVEN,
        profile: { ...profile, species: "Human (Kayn) Darkin (Rhaast)" },
      }),
    ).toBe(true);
    expect(isDarkinChampion(RIVEN)).toBe(false);
  });
});
