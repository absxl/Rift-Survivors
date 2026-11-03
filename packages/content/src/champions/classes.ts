// Champion classes and their class identity. The full roster is built from these
// presets so 170+ champions stay data-driven and remain playable before the
// champion-specific move pass.
export const CHAMPION_CLASS_IDS = [
  "mage",
  "tank",
  "fighter",
  "assassin",
  "marksman",
  "support",
] as const;

export type ChampionClassId = (typeof CHAMPION_CLASS_IDS)[number];

export interface ClassDefinition {
  label: string;
  blurb: string;
  weapons: string[];
  move: string;
  upgrades: string[];
  baseStats: Record<string, number>;
  growth: { everyLevels: number; mods: Record<string, number> };
}

/** Upgrades every champion can buy. */
export const COMMON_UPGRADES = [
  "power",
  "vitality",
  "swiftness",
  "focus",
  "fortune",
  "gilded-crown",
  "windwalkers",
  "bastion-plate",
];

export const CLASSES: Record<ChampionClassId, ClassDefinition> = {
  mage: {
    label: "Mage",
    blurb: "Bends range, area, and haste into a spell-slinging backline.",
    weapons: [
      "light-binding",
      "lucent-singularity",
      "orb-of-deception",
      "fox-fire",
      "overload",
      "rune-prison",
      "conflagration",
      "sear",
      "scatter-the-weak",
      "primordial-burst",
      "arcane-barrage",
    ],
    move: "arcane-bolt",
    upgrades: ["arcane-flow", "velocity", "persistence", "archmages-thesis"],
    baseStats: { might: 0.08, cooldown: 0.05 },
    growth: { everyLevels: 3, mods: { might: 0.05 } },
  },
  tank: {
    label: "Tank",
    blurb: "A wall of health and armor that grinds the swarm down.",
    weapons: ["bulwark-sweep", "iron-aura"],
    move: "shockwave",
    upgrades: ["fortitude", "bulwark", "regeneration", "aegis", "unbroken-wall"],
    baseStats: { maxHp: 0.2, armor: 1 },
    growth: { everyLevels: 3, mods: { maxHp: 0.12 } },
  },
  fighter: {
    label: "Fighter",
    blurb: "Trades blows in the middle of the pack and heals through it.",
    weapons: ["cleaver", "war-boomerang"],
    move: "cleaving-strike",
    upgrades: ["battle-fury", "bloodlust", "second-wind", "warlords-tempo"],
    baseStats: { might: 0.08, maxHp: 0.08 },
    growth: { everyLevels: 3, mods: { lifesteal: 0.01 } },
  },
  assassin: {
    label: "Assassin",
    blurb: "Fast, precise, and built to punish isolated targets.",
    weapons: ["shadow-daggers", "venom-dart"],
    move: "shadow-strike",
    upgrades: ["deadly-precision", "shadow-step", "hunters-instinct", "executioners-mark"],
    baseStats: { moveSpeed: 0.1, might: 0.05 },
    growth: { everyLevels: 4, mods: { moveSpeed: 0.04, cooldown: 0.03 } },
  },
  marksman: {
    label: "Marksman",
    blurb: "Long-range pressure, fast casts, and piercing fire.",
    weapons: ["longbow", "piercing-arrow"],
    move: "piercing-shot",
    upgrades: ["steady-aim", "piercing-rounds", "rapid-fire", "deadeye-manual"],
    baseStats: { cooldown: 0.08, projectileSpeed: 0.1 },
    growth: { everyLevels: 4, mods: { cooldown: 0.04 } },
  },
  support: {
    label: "Support",
    blurb: "Controls space with auras, duration, and steady recovery.",
    weapons: ["aegis-aura", "radiant-field"],
    move: "renewal-pulse",
    upgrades: ["benevolence", "aura-mastery", "lasting-light", "choir-of-light"],
    baseStats: { growth: 0.08, area: 0.05 },
    growth: { everyLevels: 3, mods: { regen: 0.1, duration: 0.03 } },
  },
};

export function classDefinition(className: string | undefined): ClassDefinition {
  return CLASSES[(className as ChampionClassId) ?? "mage"] ?? CLASSES.mage;
}

/** Tree = common entries + the class entries + optional signature entries. */
export function classUpgradeIds(className: string | undefined, extra: string[] = []): string[] {
  const def = classDefinition(className);
  return [...new Set([...COMMON_UPGRADES, ...def.upgrades, ...extra])];
}

export function classStartingWeapon(className: string | undefined, index: number): string {
  const def = classDefinition(className);
  return def.weapons[Math.abs(index) % def.weapons.length] ?? def.weapons[0];
}

export function classPlaceholderMove(className: string | undefined): string {
  return classDefinition(className).move;
}
