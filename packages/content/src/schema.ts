import type {
  CharacterDef,
  ContentPack,
  EnemyDef,
  PassiveDef,
  StatDelta,
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
  behavior: z.string(),
  params: z.record(z.union([z.number(), z.string(), z.boolean()])),
  maxLevel: z.number().int().positive(),
  base: weaponStatsSchema,
  levels: z.array(z.object({ delta: statDeltaSchema })),
  damageType: z.enum(["physical", "magic", "true"]).optional(),
});

const enemyDefSchema: z.ZodType<EnemyDef> = z.object({
  id: z.string(),
  category: z.enum(["minion", "elite", "boss", "final-threat"]),
  hp: z.number().positive(),
  damage: z.number(),
  moveSpeed: z.number(),
  radius: z.number(),
  xp: z.number(),
  behavior: z.string(),
  params: z.record(z.union([z.number(), z.string()])),
});

const passiveDefSchema: z.ZodType<PassiveDef> = z.object({
  id: z.string(),
  maxLevel: z.number().int().positive(),
  perLevel: z.record(z.number()),
});

const characterDefSchema: z.ZodType<CharacterDef> = z.object({
  id: z.string(),
  startingWeapon: z.string(),
});

export const contentPackSchema: z.ZodType<ContentPack> = z.object({
  id: z.string(),
  schemaVersion: z.number().int().positive(),
  enemies: z.array(enemyDefSchema),
  weapons: z.array(weaponDefSchema),
  passives: z.array(passiveDefSchema),
  characters: z.array(characterDefSchema),
});
