import type { OfferOption, PassiveDef, RunStats, WeaponDef } from "@rift/sim";
import { describe, expect, it } from "vitest";
import { offerCardInfo, passiveInfo, weaponInfo, weaponUpgradeLines } from "./ability-info";

const WEAPON: WeaponDef = {
  id: "nova",
  name: "Nova",
  description: "A test nova.",
  isMove: true,
  behavior: "aura",
  params: {},
  maxLevel: 5,
  base: {
    damage: 10,
    cooldown: 60,
    area: 20,
    speed: 0,
    duration: 0,
    amount: 1,
    pierce: 0,
    hitCooldown: 10,
    knockback: 0,
    lifetime: 0,
  },
  levels: [
    { delta: { damage: 5 } },
    { delta: { damage: 5 } },
    { delta: { damage: 5 } },
    { delta: { damage: 5 } },
  ],
  tags: ["damage:light"],
};

const PASSIVE: PassiveDef = {
  id: "power",
  name: "Power",
  description: "More power.",
  maxLevel: 5,
  perLevel: { might: 0.2 },
};

const STATS = {
  might: 2,
  cooldown: 2,
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
} satisfies RunStats;

describe("ability cards", () => {
  it("derives weapon stats from the same base/level data and owner stats", () => {
    const info = weaponInfo(WEAPON, 3, STATS);
    expect(info.badge).toBe("MOVE");
    expect(info.lines.find((l) => l.label === "DAMAGE")?.value).toBe("40");
    expect(info.lines.find((l) => l.label === "CAST TIME")?.value).toBe("1.00S");
  });

  it("shows current -> next deltas for weapon upgrades", () => {
    const lines = weaponUpgradeLines(WEAPON, 1, STATS);
    expect(lines.find((l) => l.label === "DAMAGE")?.value).toBe("20 → 30");
  });

  it("marks a new champion move card and includes its stats", () => {
    const option: OfferOption = {
      optionId: "new-m:0",
      ref: { type: "weapon", id: "nova" },
      isMove: true,
    };
    const info = offerCardInfo(option, [WEAPON], [], STATS);
    expect(info.badge).toBe("MOVE");
    expect(info.subtitle).toContain("NEW");
    expect(info.lines.length).toBeGreaterThan(0);
  });

  it("describes passive scaling per rank", () => {
    const info = passiveInfo(PASSIVE, 2);
    expect(info.lines[0]?.label).toBe("+MIGHT");
    expect(info.lines[0]?.value).toContain("40%");
  });
});
