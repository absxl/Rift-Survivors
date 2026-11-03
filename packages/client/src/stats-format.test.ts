import type { RunStats } from "@rift/sim";
import { describe, expect, it } from "vitest";
import {
  formatStats,
  fractionBonus,
  percentBonus,
  percentValue,
  trainingLabel,
} from "./stats-format";

const BASE: RunStats = {
  might: 1,
  abilityPower: 0,
  attackDamage: 0,
  cooldown: 1,
  area: 1,
  moveSpeed: 1,
  moveSpeedPx: 2.5,
  magnet: 1,
  armor: 0,
  luck: 0,
  growth: 1,
  regen: 0,
  greed: 1,
  resist: 0,
  projectileSpeed: 1,
  duration: 1,
  pierce: 0,
  knockback: 1,
  lifesteal: 0,
};

describe("stats formatting", () => {
  it("formats multipliers and fractions", () => {
    expect(percentBonus(1.35)).toBe("+35%");
    expect(percentBonus(1)).toBe("+0%");
    expect(percentBonus(0.9)).toBe("-10%");
    expect(fractionBonus(0.2)).toBe("+20%");
    expect(fractionBonus(0)).toBe("+0%");
    expect(percentValue(0.06)).toBe("6%");
  });

  it("builds all primary and run-stat rows", () => {
    const rows = formatStats(
      {
        ...BASE,
        might: 1.1,
        cooldown: 1.12,
        armor: 3,
        luck: 0.1,
        growth: 1.05,
        regen: 0.3,
        greed: 1.2,
        resist: 0.06,
        projectileSpeed: 1.15,
        duration: 1.1,
        pierce: 2,
        lifesteal: 0.02,
        knockback: 1.2,
      },
      { kills: 42, gold: 15, keys: 3, maxHp: 150 },
    );
    expect(rows.primary).toEqual([
      { label: "MIGHT", value: "+10%" },
      { label: "HASTE", value: "+12%" },
      { label: "AREA", value: "+0%" },
      { label: "SPEED", value: "+0%" },
      { label: "MAGNET", value: "+0%" },
      { label: "ARMOR", value: "3" },
      { label: "LUCK", value: "+10%" },
      { label: "GROWTH", value: "+5%" },
      { label: "REGEN", value: "0.3/S" },
      { label: "GREED", value: "+20%" },
      { label: "RESIST", value: "6%" },
      { label: "PROJ SPEED", value: "+15%" },
      { label: "DURATION", value: "+10%" },
      { label: "PIERCE", value: "2" },
      { label: "LIFESTEAL", value: "2%" },
      { label: "KNOCKBACK", value: "+20%" },
    ]);
    expect(rows.secondary).toEqual([
      { label: "KILLS", value: "42" },
      { label: "GOLD", value: "15" },
      { label: "KEYS", value: "3" },
      { label: "MAX HP", value: "150" },
    ]);
  });

  it("formats training cards", () => {
    expect(trainingLabel("growth", 0.05)).toBe("TRAINING: +5% XP");
    expect(trainingLabel("maxHp", 0.1)).toBe("TRAINING: +10% MAX HP");
    expect(trainingLabel("regen", 0.1)).toBe("TRAINING: +0.1/S REGEN");
    expect(trainingLabel("armor", 1)).toBe("TRAINING: +1 ARMOR");
    expect(trainingLabel("pierce", 1)).toBe("TRAINING: +1 PIERCE");
    expect(trainingLabel("lifesteal", 0.01)).toBe("TRAINING: +1% LIFESTEAL");
  });

  it("never renders NaN", () => {
    expect(percentBonus(Number.NaN)).toBe("+0%");
    const rows = formatStats(
      { ...BASE, armor: Number.NaN },
      { kills: Number.NaN, gold: Number.NaN, keys: Number.NaN, maxHp: Number.NaN },
    );
    expect(rows.primary[5].value).toBe("0");
    expect(rows.secondary.map((r) => r.value)).toEqual(["0", "0", "0", "0"]);
  });
});
