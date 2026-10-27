# BALANCE - bot baseline

Measured with the headless kiting bot on the **real content pack** (`loadGamePack()`), solo, champion
`lux`, `DEFAULT_RULESET`. Numbers are a regression baseline, not a substitute for a human playtest.

- Date: 2026-10-27
- Run command: `$env:BALANCE="1"; corepack pnpm --filter @rift/content test -- balance`
- Seeds: 101, 202, 303
- Reference: 30:00 final threat → boss rush (fallback at 30:45); solo run ends on death.
- Current pace: spawn 30/3, elite chests 90 s, patterns rotate every 15 s, gold 5, drops per D-029
  (minions 5% gold + 1% chest, elites 100% gold + 50% chest, bosses guaranteed chest + luck gold),
  level-up = 3 item cards + 1 training card, XP table flattened after 10.
- D-030 added **enemy separation**, **signature moves**, and a **10-slot ability loadout**
  (6 weapons + 4 moves) beside 6 passives.
- D-031 added the **173-champion roster**, six class weapon/move pools, class trees, Noxian Warfront,
  focus, profiles, and server accounts. The bot still runs **Lux on Riftfield**; Noxus and class balance
  need a human pass.

## Enemy roster (19 types)

10 minions (chaser, runner, weaver, mote, ironhide, hexer, bloater, sparker, warhound, blood-acolyte),
3 elites (brute, warden, siege-ogre), 4 bosses (herald, dragon, baron, crimson-herald), 2 final threats
(void-threat, dread-conqueror). Riftfield uses the original 14; Noxus uses the new pool and rules
overrides. Weighted/minute-gated spawns; ring / stream / swarm / wall patterns; placeholder tint +
radius visuals. A radius-squared soft separation system keeps bodies from stacking; bosses barely move.

## Bot behaviour

- Kites the nearest enemy inside 140 px; otherwise collects gems/pickups.
- Picks offers with a 6-weapon / 6-passive / upgrade priority; it treats signature/class moves as weapons
  and **ignores the training card** (score below item cards). A human can take training every level.
- Does not dodge hostile projectiles or use reroll/skip/banish.

## Baseline (current, D-031)

| Seed | Survived | Level (picks) | Kills | Gold | Chests found | Gems / XP | Max alive | Ability + passive levels | Boss rush | ms/tick |
| ---- | -------- | ------------- | ----- | ---- | ------------ | --------- | --------- | ------------------------ | --------- | ------- |
| 101  | 32:00    | 47 (46)       | 5,539 | 1,845 | 66 | 4,815 / 9,813 | 87 | 41 + 7 = 48 / 80 | timeout | 0.0448 |
| 202  | 32:00    | 43 (42)       | 5,538 | 1,922 | 76 | 4,296 / 7,633 | 66 | 36 + 8 = 44 / 80 | timeout | 0.0439 |
| 303  | 32:00    | 43 (42)       | 5,536 | 1,988 | 58 | 4,287 / 7,498 | 72 | 36 + 8 = 44 / 80 | timeout | 0.0418 |

"Ability levels" = owned normal weapons + moves; "passives" = owned passives. Max loadout is
6 weapons × L5 + 4 moves × L5 + 6 passives × L5 = 80. "Chests found" are saved for gacha.

Player damage taken by source (hits):

| Seed | Contact | Projectile | Explosion |
| ---- | ------- | ---------- | --------- |
| 101  | 4 | 132 | 3 |
| 202  | 0 | 130 | 0 |
| 303  | 8 | 112 | 13 |

## Observations

1. **Moves broaden the kit.** The bot picks up to four moves (Prismatic Nova, Dark Matter, Charm,
   Arcanopulse, etc.) alongside six weapons. That is the intended level-up path for learning other
   champions' signatures.
2. **Separation reduces stacking.** Peak live enemies are 61–85 with the new body push. The bot still
   survives 32:00, but low-radius minions no longer collapse into one point.
3. **Levels remain fast.** 42-46 picks by 32:00; the bot fills its 80-level loadout partway through and
   then takes passives/training.
4. **Gold remains generous.** 1,845-1,988/run against 173 per-champion trees. This is now a long-term
   collection/per-champion investment rather than one-run account maxing.
5. **Chests fund a very fast collection.** 58-76 chests/run at 1 chest/pull; the 173-champion roster and
   per-region focus are the pacing controls. Tune chest drops/shard amounts after a human playtest.
6. **Projectile pressure dominates.** 112-132 ranged hits per run; contact is low thanks to kiting and
   separation. Boss projectiles remain the main skill check.
7. **The endgame still uses the 45 s fallback.** The final threat is outrunnable/chase-only; the new boss
   bar and name display make the fight readable but not mechanically harder.
8. **Performance** is ~0.042-0.045 ms/tick with fuller 10-ability builds, still well inside budget.

## Recommended follow-up

- **Gacha economy:** at 58-76 chests/run and 1 chest/pull, the 173-champion roster plus focus is the
  pacing lever. Decide whether the target/region approach feels right after a human run.
- **Per-champion gold sink:** 173 trees make gold a long-term collection investment; watch the first-run
  burst of gold and chests together.
- **Human difficulty pass:** projectile damage is the dominant threat; defensive stats still let the bot
  end at full HP. Human playtests should check the training-only builds and per-champion bonuses.
- **Boss patterns:** bosses are still chase-only; a dash/ranged pattern would make the final threat and
  rush more interesting.
- **Training card weighting:** the bot ignores training; a human can stack max HP/regen. Watch for a
  "training-only" degenerate build.
- **Signature move tuning:** moves are auto-cast on cooldown and currently add a lot of free area damage;
  adjust cooldowns/base damage after human playtests.

## Caveats

- The bot does not take the guaranteed training card, dodge projectiles, or use reroll/skip/banish.
- A human kites worse but uses training/dodges better; only a playtest settles the feel.
- The final threat is a chase-only boss; its threat depends on the build and route.
