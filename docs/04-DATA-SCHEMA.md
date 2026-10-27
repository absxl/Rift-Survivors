# 04 — Data Schema (content)

All content lives in `packages/content/src/**` as TypeScript objects validated by Zod at startup and in
tests. IDs are `kebab-case` strings, unique within their type.

> **Current implemented contract:** see [`14-IMPLEMENTATION-STATUS.md`](14-IMPLEMENTATION-STATUS.md) and
> `packages/sim/src/content-types.ts`. The schemas below are the original design sketch; the code now also
> has `WeaponDef.isMove`, `CharacterDef.startingMove/region/rarity/class/starter/upgradeIds`, display
> names/descriptions, and per-champion meta-upgrade trees.

> **These schemas are a starting point and WILL change** after the design interview (`09`/`10`).
> Change them only via the process in `12-CHANGE-PLAYBOOK.md` (ADR, `schemaVersion` bump, migration).
> The model follows the classic survivor structure in `13-CLASSIC-FEEL-SPEC.md`.

## Conventions
- Distances in world pixels (internal resolution space), time in **ticks** (30/s) via helper `sec(n)`,
  angles in radians.
- **Level progressions** are explicit arrays of per-level deltas (like the genre's "level 2: +1 projectile"
  tables), not formulas, so designers can tune each level separately.
- `art` fields are keys into the asset manifest, never file paths (see 06). Missing art falls back to a
  generated placeholder.
- Matching by **tags** is preferred. Recipe-style references by id are fine **inside data**, never in engine code.

## Universal fields (every `*Def`)
```ts
interface BaseDef {
  id: string;
  schemaVersion: number;
  tags: string[];                 // namespaced, validated against content/src/tags.ts (see 11)
  pack: string;                   // owning content pack ("core", "lol-pack", ...)
  nameKey: string; descKey?: string;   // i18n keys (locales/<lang>.json)
  art?: string;                   // asset manifest key
}
```

## Stats
```ts
// Player stats (modifier-stack keys; 1 = base for multipliers)
type PlayerStat = "maxHp" | "regen" | "armor" | "resist" | "moveSpeed" | "magnet" | "luck"
                | "growth" | "greed" | "projectileSpeed" | "duration" | "pierce" | "knockback"
                | "lifesteal";
// Weapon-wide stats, applied as multipliers/adders to every weapon
type WeaponWideStat = "might" | "area" | "cooldown" | "projectileSpeed" | "duration"
                     | "pierce" | "knockback";
// Per-weapon base stats
interface WeaponStats {
  damage: number; cooldown: number;      // ticks
  area: number; speed: number; duration: number; amount: number;
  pierce: number; hitCooldown: number;   // ticks between hits on the same enemy
  knockback: number; lifetime: number;
}
type StatDelta = Partial<Record<keyof WeaponStats, number>>;   // additive deltas (cooldown negative = faster)
```

## Weapon
```ts
interface WeaponDef extends BaseDef {
  behavior: string;                     // registry id: "sweep" | "shoot-nearest" | "orbit" | "aura" | ... (see 13 §4)
  params: Record<string, number | string | boolean>;   // validated by the behavior's Zod schema
  maxLevel: number;                     // ≈8
  base: WeaponStats;                    // level 1
  levels: { delta: StatDelta; textKey?: string }[];     // levels[0] = what level 2 adds, etc. (length = maxLevel - 1)
  damageType?: "physical" | "magic" | "true";
  evolution?: { requiresPassive: string; evolvesTo: string };   // see 13 §7
  union?: { withWeapon: string; evolvesTo: string };            // optional
  statusOnHit?: StatusApply[];
  vfx?: string; sfx?: string;
  isEvolved?: boolean;                  // evolved forms are never offered in level-up pools
}
```

## Passive item
```ts
interface PassiveDef extends BaseDef {
  maxLevel: number;                                     // ≈5
  perLevel: Partial<Record<PlayerStat | WeaponWideStat, { add?: number; mult?: number }>>;
  effects?: (EffectDef | ModifierDef)[];                // optional extra behavior (see 11)
  weight?: number;                                      // offer weight in level-up pools
}
```

## Character
```ts
interface CharacterDef extends BaseDef {
  startingWeapon: string;                               // WeaponDef id
  baseStats: Partial<Record<PlayerStat | WeaponWideStat, number>>;
  growth?: { everyLevels: number; mods: ModifierDef[] };// innate growth bonus (e.g. +x% every N levels)
  quirk?: (EffectDef | ModifierDef)[];                  // optional unique rule via effects engine
  unlock: "default" | { achievement: string } | { cost: number };
  sprite: string; portrait: string;
}
```

## Enemy
```ts
interface EnemyDef extends BaseDef {
  category: "minion" | "elite" | "boss" | "final-threat";
  hp: number; damage: number; moveSpeed: number; radius: number;
  xp: { tier: 1 | 2 | 3; amount?: number };
  behavior: string;                     // "chase" | "ranged" | "charge" | "weaver" | ...
  params?: Record<string, number | string>;
  knockbackResist?: number; immuneTo?: string[];
  drops?: DropTable;                    // gold, pickups, chest (elites/bosses)
  recycle?: boolean;                    // default true for minions (see 13 §9)
  // implemented placeholder extras:
  tint?: number;                        // 0xRRGGBB placeholder tint (presentation only)
  spawnWeight?: number;                 // relative weight within minion/elite (default 1)
  minMinute?: number; maxMinute?: number; // spawn availability window
}
interface DropTable { gold?: [number, number]; pickups?: { id: string; chance: number }[]; chest?: boolean }
```
Death traits live in `params` (e.g. `explodeRadius` + `explodeDamage`); the `ranged` behavior reads
`period`, `range`, `preferredRange`, `speed`, `lifetime`, `damage`; `charge` reads `period`, `dashTicks`,
`dashSpeed`; `weaver` reads `amplitude`, `frequency`.


## Stage (the timeline)
```ts
interface StageDef extends BaseDef {
  map: { width: number; height: number; wrap: boolean; tileset: string; props?: PropSpawn[] };
  timeline: MinuteEntry[];                              // per-minute spawn tables
  events: { atSec: number; kind: "boss" | "elite" | "chest" | "pickup" | "swarm" | "modifier"; ref: string }[];
  finalThreat?: { atSec: number; enemy: string };       // ≈1800
  runLengthSec: number;                                 // ≈1800
  modifiers?: ModifierDef[];                            // stage rules (e.g. slow ground)
  music: string; unlock: "default" | { achievement: string } | { cost: number };
}
interface MinuteEntry {
  minute: number;
  spawns: { enemy: string; perSecond: number; pattern: "stream" | "swarm" | "ring" | "wall" | "edge-cluster";
            maxAlive?: number; count?: number }[];
  enemyScale?: { hp: number; damage: number };          // multipliers this minute
}
interface PropSpawn { prop: string; density: number; drops: DropTable }   // destructible light sources etc.
```

## Pickups, chests, level-up pool
```ts
interface PickupDef extends BaseDef { effect: EffectDef; despawnSec?: number; magnetizable: boolean }
interface ChestDef extends BaseDef { itemsByLuck: { luckAtLeast: number; items: 1 | 3 | 5; weight: number }[] }
interface LevelUpRules {
  choices: number;                   // 3 item cards
  guaranteedTraining: 1;             // + one repeatable direct stat card
  weights: { newWeapon: number; newPassive: number; upgrade: number };
  fallback: { kind: "gold" | "heal"; amount: number };
  xpCurve: number[];                 // first 20 explicit, then +xp.growthPerLevel per level
}
```
- **D-029:** in-run chest pickups are **saved** (per player) and opened in the meta shop; they do not generate
  a chest offer mid-run. `ChestDef.itemsByLuck` is therefore unused in-run (kept for future).
- Enemy drops: minions 5% gold + 1% chest; elites 100% gold + 50% chest; bosses/final threat guaranteed chest
  + luck-scaled gold. Luck scales the chance rolls and elite/boss gold.
- Training cards are engine-side (stat key + amount), repeatable and slot-free.

## Meta
```ts
interface PowerUpDef extends BaseDef {                  // permanent-upgrade shop entry
  stat: PlayerStat | WeaponWideStat; perRank: number; maxRank: number;
  costs: number[];                                      // gold per rank, refundable
}
interface AchievementDef extends BaseDef { condition: { kind: string; params: Record<string, number | string> }; unlocks?: { type: string; id: string }[] }
```

## Extensibility schemas (see 02 and 11)
```ts
interface RulesetDef { /* pipeline, progression, world, director, economy, rules, features, modifiers, contentPacks — see 02 */ }
interface SynergyDef / ReactionDef / ModifierDef / EffectDef { /* see 11 */ }

interface ContentPack {
  id: string; schemaVersion: number; version: string; requires: string[];
  defs: { weapons: WeaponDef[]; passives: PassiveDef[]; characters: CharacterDef[]; enemies: EnemyDef[];
          stages: StageDef[]; pickups: PickupDef[]; chests: ChestDef[]; powerUps: PowerUpDef[];
          achievements: AchievementDef[]; synergies: SynergyDef[]; rulesets: RulesetDef[];
          statuses: StatusDef[] /* ... */ };
}

// Generic UI contract: the sim emits Offers; the client renders them without knowing the rule behind them.
interface Offer {
  id: string; playerId: number;
  kind: "levelUp" | "chest" | "shop" | "arcana" | string;
  options: { optionId: string; ref: { type: string; id: string }; level?: number; isEvolution?: boolean;
             cost?: { currency: string; amount: number } }[];
  rerolls?: number; skips?: number; banishes?: number; expiresTick?: number;
}
```

## Validation rules (tested)
- Every `behavior` id exists in the registry; every `params` validates against the behavior schema.
- `levels.length === maxLevel - 1`; levels never make a stat NaN/negative; `cooldown` stays > minimum.
- Every `evolution.requiresPassive` and `evolvesTo` resolves; evolved weapons are not in level-up pools;
  no evolution cycles.
- Every character's `startingWeapon` exists; every stage's `enemy` refs and `finalThreat` resolve.
- Every tag is declared in `tags.ts`; every `TagQuery` is satisfiable by at least one def.
- Every effect trigger/condition/action kind and every rule key is registered.
- Every pack's `requires` resolve; no id collisions except deliberate pack overrides.
- Content loads in < 50 ms.
