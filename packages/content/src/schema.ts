import type {
  ChampionProfile,
  CharacterDef,
  ContentPack,
  EnemyDef,
  PassiveDef,
  PowerUpDef,
  StageDef,
  StageTerrain,
  StatDelta,
  SynergyDef,
  TagQuery,
  WeaponDef,
  WeaponStats,
} from "@rift/sim";
// Zod schemas for the core content pack (enemies + weapons). Typed against the
// sim's runtime contract so parsed data is assignable to `@rift/sim` types.
import { z } from "zod";

const weaponStatsSchema: z.ZodType<WeaponStats> = z.object({
  damage: z.number(),
  cooldown: z.number(),
  area: z.number(),
  speed: z.number(),
  duration: z.number(),
  amount: z.number(),
  pierce: z.number(),
  hitCooldown: z.number(),
  knockback: z.number(),
  lifetime: z.number(),
});

const statDeltaSchema: z.ZodType<StatDelta> = z.object({
  damage: z.number().optional(),
  cooldown: z.number().optional(),
  area: z.number().optional(),
  speed: z.number().optional(),
  duration: z.number().optional(),
  amount: z.number().optional(),
  pierce: z.number().optional(),
  hitCooldown: z.number().optional(),
  knockback: z.number().optional(),
  lifetime: z.number().optional(),
});

const weaponDefSchema: z.ZodType<WeaponDef> = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  isMove: z.boolean().optional(),
  behavior: z.string(),
  params: z.record(z.union([z.number(), z.string(), z.boolean()])),
  maxLevel: z.number().int().positive(),
  base: weaponStatsSchema,
  levels: z.array(z.object({ delta: statDeltaSchema })),
  damageType: z.enum(["physical", "magic", "true"]).optional(),
  status: z.object({ id: z.enum(["burn", "slow"]), ticks: z.number().int().positive() }).optional(),
  isEvolved: z.boolean().optional(),
  evolution: z.object({ requiresPassive: z.string(), evolvesTo: z.string() }).optional(),
});

const enemyDefSchema: z.ZodType<EnemyDef> = z.object({
  id: z.string(),
  name: z.string().optional(),
  tags: z.array(z.string()).optional(),
  category: z.enum(["minion", "elite", "boss", "final-threat"]),
  hp: z.number().positive(),
  damage: z.number(),
  moveSpeed: z.number(),
  radius: z.number(),
  xp: z.number(),
  behavior: z.string(),
  params: z.record(z.union([z.number(), z.string()])),
  dropsKey: z.boolean().optional(),
  keyChance: z.number().min(0).max(1).optional(),
  tint: z.number().int().optional(),
  spawnWeight: z.number().nonnegative().optional(),
  minMinute: z.number().nonnegative().optional(),
  maxMinute: z.number().nonnegative().optional(),
});

const passiveDefSchema: z.ZodType<PassiveDef> = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  maxLevel: z.number().int().positive(),
  perLevel: z.record(z.number()),
});

const championProfileSchema: z.ZodType<ChampionProfile> = z.object({
  title: z.string().min(1),
  regions: z.array(z.string().min(1)).min(1),
  origin: z.string().optional(),
  residence: z.string().optional(),
  faction: z.string().optional(),
  species: z.string().optional(),
  occupation: z.string().optional(),
  roles: z.array(z.string().min(1)),
  difficulty: z.string().optional(),
  summary: z.string().min(1),
  sources: z.object({
    official: z.string().url(),
    wiki: z.string().url(),
    verifiedAt: z.string().min(1),
  }),
});

const characterDefSchema: z.ZodType<CharacterDef> = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  region: z.string().optional(),
  profile: championProfileSchema.optional(),
  rarity: z.enum(["common", "rare", "epic", "legendary"]).optional(),
  class: z.string().optional(),
  starter: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  startingWeapon: z.string(),
  startingMove: z.string().optional(),
  baseStats: z.record(z.number()).optional(),
  growth: z
    .object({ everyLevels: z.number().int().positive(), mods: z.record(z.number()) })
    .optional(),
  upgradeIds: z.array(z.string()).optional(),
});

const powerUpDefSchema: z.ZodType<PowerUpDef> = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  stat: z.string().optional(),
  perRank: z.number().optional(),
  stats: z.record(z.number()).optional(),
  maxRank: z.number().int().positive(),
  costs: z.array(z.number()),
});

const stageTerrainSchema: z.ZodType<StageTerrain> = z.object({
  wallThreshold: z.number().min(0).max(1),
  liquidThreshold: z.number().min(0).max(1),
  liquid: z.enum(["water", "lava", "void"]),
  liquidSlow: z.number().min(0).max(1),
  liquidDamage: z.number().min(0),
  bushDensity: z.number().positive().max(8).optional(),
  colors: z.object({
    floor: z.string(),
    floorAlt: z.string(),
    floorSpeck: z.string(),
    wallTop: z.string(),
    wallTopAlt: z.string(),
    wallFace: z.string(),
    wallEdge: z.string(),
    liquid: z.string(),
    liquidDeep: z.string(),
    liquidAccent: z.string(),
  }),
});

const stageDefSchema: z.ZodType<StageDef> = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  region: z.string(),
  palette: z.object({
    background: z.number().int(),
    grid: z.number().int(),
    accent: z.number().int(),
  }),
  enemyIds: z.array(z.string()).optional(),
  finalThreatId: z.string().optional(),
  rules: z.record(z.union([z.number(), z.string(), z.boolean()])).optional(),
  terrain: stageTerrainSchema.optional(),
});

const tagQuerySchema: z.ZodType<TagQuery> = z.object({
  all: z.array(z.string()).optional(),
  any: z.array(z.string()).optional(),
});

const synergyDefSchema: z.ZodType<SynergyDef> = z.object({
  id: z.string(),
  source: z.union([
    z.object({
      kind: z.literal("tagCount"),
      tag: z.string(),
      tiers: z.array(z.object({ count: z.number().int(), mods: z.record(z.number()) })),
    }),
    z.object({
      kind: z.literal("combo"),
      requires: z.array(tagQuerySchema),
      mods: z.record(z.number()),
    }),
  ]),
  hidden: z.boolean().optional(),
});

export const contentPackSchema: z.ZodType<ContentPack> = z.object({
  id: z.string(),
  schemaVersion: z.number().int().positive(),
  enemies: z.array(enemyDefSchema),
  weapons: z.array(weaponDefSchema),
  passives: z.array(passiveDefSchema),
  characters: z.array(characterDefSchema),
  powerUps: z.array(powerUpDefSchema),
  synergies: z.array(synergyDefSchema),
  stages: z.array(stageDefSchema).optional(),
});
