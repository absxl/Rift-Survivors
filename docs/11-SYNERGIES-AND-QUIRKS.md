# 11 — Synergies, Effects & Quirks Engine

> **Classic first.** The classic baseline (`13`) has exactly one synergy layer: **weapon evolutions** (maxed
> weapon + key passive via chest) and optional **unions**. These are implemented from `WeaponDef.evolution`
> data. Everything below is the **opt-in extras engine** (trait thresholds, reactions, keystones, curses,
> arcana-like modifiers, mutators…), built only for the families the user picks in interview round R6, and
> used by passives/characters for their small effects. Don't build extras that weren't chosen.

Synergies and quirks are where survivor games get their depth, and where designs change most. So they are
**not** hard-coded: they sit on a small, generic, data-driven engine in `packages/sim`. Which families
are actually used is decided in the design interview (round R5) and recorded in `10-DESIGN-DECISIONS.md`.

## Building blocks (engine side — build these once, generic)

### 1. Tags
Everything (champions, weapons, passives, enemies, status effects, shrines) carries `tags: string[]`.
Tags are namespaced strings, e.g. `damage:fire`, `shape:projectile`, `role:marksman`, `region:ionia`,
`trait:bleed`, `item:attack-speed`. The full vocabulary is declared in `packages/content/src/tags.ts` and
validated (typos fail tests). Tags are the glue: synergies, modifiers and evolutions match on tags,
never on specific ids.

### 2. Effects: Trigger → Condition → Action
All "when X happens, do Y" content is data:

```ts
interface EffectDef {
  id: string;
  trigger: Trigger;        // when
  conditions?: Condition[];// only if
  actions: Action[];       // then
  cooldown?: Scalable;     // internal cooldown (ticks)
  chance?: number;         // 0..1, rolled with the sim Rng
  maxStacks?: number;
}
type Trigger =
  | "onRunStart" | "onTick" | "onEveryNSeconds" | "onHit" | "onCrit" | "onKill" | "onDamaged"
  | "onWeaponFire" | "onLevelUp" | "onPickup" | "onDeath" | "onRevive" | "onStatusApplied"
  | "onLoadoutChanged" | "onBossPhase";            // extend via registry, not by editing the engine
type Condition =  // all registered in a ConditionRegistry
  | { kind: "hasTag"; tag: string } | { kind: "hpBelowPct"; value: number }
  | { kind: "enemiesNearby"; radius: number; min: number } | { kind: "stacksAtLeast"; n: number } | ...
type Action =     // all registered in an ActionRegistry
  | { kind: "addModifier"; modifier: ModifierDef }
  | { kind: "spawnProjectile"; ... } | { kind: "applyStatus"; status: string; ... }
  | { kind: "heal" | "shield"; amount: number } | { kind: "grantItem"; ... }
  | { kind: "reduceCooldown"; tag: string; amount: number } | { kind: "emitEvent"; ... } | ...
```
New triggers/conditions/actions are added by registering a function (see 02 "Registries"), covered by a unit test.

### 3. Modifier stack
Every number that can change at runtime (stats **and** weapon params) is computed from a stack:

```ts
interface ModifierDef {
  target: { kind: "stat"; stat: StatKey } | { kind: "weaponParam"; match: TagQuery; param: string }
        | { kind: "ruleOverride"; key: string };
  op: "add" | "mult" | "override" | "min" | "max";
  value: number | boolean | string;
  stacking?: "stack" | "refresh" | "unique";
  source: string;              // item/synergy/curse id — for UI ("why do I have +20% AS?") and clean removal
  duration?: number;           // ticks; omit = until source removed
}
```
Evaluation order is fixed and documented: base → add → mult → override → min/max. `weaponParam` modifiers
use a **tag query** (`all of [shape:projectile] and any of [damage:fire]`), so "all projectile weapons
gain +1 pierce" is one data entry and works for weapons that do not exist yet.

### 4. Synergies
```ts
interface SynergyDef {
  id: string; name: string; description: string; tags: string[];
  scope: "self" | "party";                      // party = counts all co-op players' loadouts
  source:
    | { kind: "tagCount"; tag: string; tiers: { count: number; effects: (EffectDef|ModifierDef)[] }[] }  // TFT-style
    | { kind: "combo";    requires: TagQuery[]; effects: (EffectDef|ModifierDef)[] }                      // A + B => C
    | { kind: "custom";   behavior: string; params: Record<string, unknown> };                            // registry escape hatch
  hidden?: boolean;                              // discovered-on-activation synergies
}
```
The **synergy system** re-evaluates only when the loadout changes (`onLoadoutChanged`: level-up, item,
champion swap, player join/leave), not every tick, and produces modifiers/effects tagged
`source: "synergy:<id>"`. The UI reads the same evaluation to show active/near-active tiers.

### 5. Reactions (status/element interactions) — optional family
```ts
interface ReactionDef { id: string; a: TagQuery; b: TagQuery; window: number; actions: Action[]; consume: boolean }
```
When status/damage tagged `a` and `b` hit the same target within `window` ticks, run `actions`.
Pure data table; adding a new element is adding tags + rows.

### 6. Rule overrides (the "quirk" hook)
`ruleOverride` modifiers flip named switches the engine reads through `rules.get("key")`, e.g.
`levelUp.choices`, `shop.enabled`, `items.slotCount`, `pickup.magnetRadius`, `damage.friendlyFire`.
Legendaries, curses, mutators and champion quirks all use this — so bending a rule never needs an engine edit,
only a registered rule key with a default.

### 7. Auto-generated descriptions
Tooltips are templated from data (`"+{pierce} pierce to {tag:shape:projectile}"`) so numbers in text can
never drift from the real values after balance changes.

## Content families (design-side — chosen in the interview)
| Family | Built from | Example (illustrative ideas only, not decisions) |
|---|---|---|
| Trait thresholds | `SynergyDef.tagCount` | Own 2/4/6 `role:marksman` items → +attack speed, then +pierce, then double shot |
| Item combos / evolutions | `SynergyDef.combo` | Weapon tagged `shape:orbit` + passive tagged `item:cooldown` → evolved weapon |
| Element reactions | `ReactionDef` | `status:burn` + `status:slow` → steam burst; `status:shock` + water → chain |
| Keystones / legendaries | `ruleOverride` + effects | "No more shop, but enemies drop 2× items"; "weapons have no cooldown but cost HP" |
| Co-op combos | `SynergyDef.scope = party` | Support's shield + Marksman's shots → shielded allies deal bonus damage |
| Curses & risk/reward | modifiers with downsides | +40% damage dealt, −25% max HP; cursed chest offers |
| Shrines / events | effects on `onPickup` | Altar: sacrifice 20% HP for a free evolution |
| Run mutators | `RulesetDef.modifiers` | "Glass cannon", "Double bosses", "Everything is on fire" |
| Per-champion quirks | champion passive effects + rule overrides | A champion whose weapons scale with distance walked |
| Daily challenge | seed + mutator set | Same seed for all friends, compare scores |

## Idea bank for the interview (offer these; user picks)
1. **Region/faction traits**: items and champions carry `region:*` tags; collecting several triggers
   faction bonuses.
2. **Stacks that snowball**: kill-stacking items that reset on damage (risk/reward).
3. **Echo**: your last-fired weapon fires again at 40% power (triggered by tag).
4. **Resonance**: weapons of the same `damage:*` type amplify each other.
5. **Bargains**: at 25%/50%/75% of the run, choose a permanent trade-off card.
6. **Overheat**: fast-firing weapons → temporary damage but self-slow; managed by a meter.
7. **Chain events**: killing a marked enemy spreads the mark; burst on 5th spread.
8. **Pets/summons** that inherit a subset of your modifiers.
9. **Wager chests**: pay HP or gold to roll better tiers.
10. **Boss-drop keystones**: each objective boss drops a rule-bending legendary.
11. **Synergy discovery journal**: hidden combos unlock entries (nice for friends comparing builds).
12. **Draft mode in co-op**: players alternate picking from a shared card pool.

## Requirements for implementers
- No synergy, effect or quirk may reference a champion/item **id** in engine code; match by tags/registry only.
- Every registered trigger/condition/action/rule key has: schema, default, unit test, and a doc line here.
- Content validation test: every `TagQuery` references declared tags; every effect action kind is registered;
  every modifier `source` resolves; no synergy references a missing tag.
- **Synergy matrix test**: generate N random loadouts (seeded) from content, run 600 ticks each, assert no
  exceptions, no NaN stats, no unbounded entity growth, and that modifier counts stay under a cap.
- Performance: effect dispatch uses per-trigger subscription lists built at loadout change; zero
  allocations in the per-tick path.
- Balance guard: a debug overlay shows the full modifier breakdown for any stat (invaluable for tuning).
