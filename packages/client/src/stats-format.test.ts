import type { RunStats } from "@rift/sim";
import { describe, expect, it } from "vitest";
import { formatStats, fractionBonus, percentBonus } from "./stats-format";

const BASE: RunStats = {
  might: 1,
  cooldown: 1,
  area: 1,
  moveSpeed: 1,
  moveSpeedPx: 2.5,
  magnet: 1,
  armor: 0,
  luck: 0,
};

describe("stats formatting", () => {
  it("formats multipliers as signed percentages", () => {
    expect(percentBonus(1.35)).toBe("+35%");
    expect(percentBonus(1)).toBe("+0%");
    expect(percentBonus(0.9)).toBe("-10%");
  });

  it("formats luck as a bonus fraction", () => {
    expect(fractionBonus(0.2)).toBe("+20%");
    expect(fractionBonus(0)).toBe("+0%");
  });

  it("builds primary and run-stat rows", () => {
    const rows = formatStats(
      { ...BASE, might: 1.1, cooldown: 1.12, armor: 3, luck: 0.1 },
      { kills: 42, gold: 15, maxHp: 150 },
    );
    expect(rows.primary).toEqual([
      { label: "MIGHT", value: "+10%" },
      { label: "HASTE", value: "+12%" },
      { label: "AREA", value: "+0%" },
      { label: "SPEED", value: "+0%" },
      { label: "MAGNET", value: "+0%" },
      { label: "ARMOR", value: "3" },
      { label: "LUCK", value: "+10%" },
    ]);
    expect(rows.secondary).toEqual([
      { label: "KILLS", value: "42" },
      { label: "GOLD", value: "15" },
      { label: "MAX HP", value: "150" },
    ]);
  });

  it("never renders NaN", () => {
    expect(percentBonus(Number.NaN)).toBe("+0%");
    const rows = formatStats(
      { ...BASE, armor: Number.NaN },
      { kills: Number.NaN, gold: Number.NaN, maxHp: Number.NaN },
    );
    expect(rows.primary[5].value).toBe("0");
    expect(rows.secondary.map((r) => r.value)).toEqual(["0", "0", "0"]);
  });
});
