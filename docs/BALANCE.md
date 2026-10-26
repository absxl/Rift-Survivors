# BALANCE - bot baseline

Measured with the headless kiting bot on the **real content pack** (`loadGamePack()`), solo, champion
`lux`, `DEFAULT_RULESET`. Numbers are a regression baseline, not a substitute for a human playtest.

- Date: 2026-10-26
- Run command: `$env:BALANCE="1"; corepack pnpm --filter @rift/content test -- balance`
- Seeds: 101, 202, 303
- Reference: 30:00 final threat → boss rush (fallback at 30:45); solo run ends on death.
- Current pace: spawn 30/3, elite chests 90 s, patterns rotate every 15 s, gold 5, drops per D-029
  (minions 5% gold + 1% chest, elites 100% gold + 50% chest, bosses guaranteed chest + luck gold),
  level-up = 3 item cards + 1 training card, XP table flattened after 10.
- D-030 adds **enemy separation**, **signature moves**, and a **10-slot ability loadout**
  (6 weapons + 4 moves) beside 6 passives. The bot now gets the champion's starting move and can learn
  other champions' moves from level-up cards.

## Enemy roster (14 types)

8 minions (chaser, runner, weaver, mote, ironhide, hexer, bloater, sparker), 2 elites (brute, warden),
3 bosses (herald, dragon, baron), 1 final threat (void-threat). Weighted/minute-gated spawns; ring /
stream / swarm / wall patterns; placeholder tint + radius visuals. A radius-squared soft separation
system keeps bodies from stacking; bosses barely move.

## Bot behaviour

- Kites the nearest enemy inside 140 px; otherwise collects gems/pickups.
- Picks offers with a 6-weapon / 6-passive / upgrade priority; it treats signature moves as weapons and
  **ignores the training card** (score below item cards). A human can take training every level.
- Does not dodge hostile projectiles or use reroll/skip/banish.

## Baseline (current, D-030)

| Seed | Survived | Level (picks) | Kills | Gold | Chests found | Gems / XP | Max alive | Ability + passive levels | Boss rush | ms/tick |
| ---- | -------- | ------------- | ----- | ---- | ------------ | --------- | --------- | ------------------------ | --------- | ------- |
| 101  | 32:00    | 47 (46)       | 5,538 | 1,585 | 45 | 4,752 / 9,715 | 85 | 40 + 8 = 48 / 80 | timeout | 0.0446 |
| 202  | 32:00    | 45 (44)       | 5,539 | 1,897 | 60 | 4,877 / 8,972 | 62 | 37 + 9 = 46 / 80 | timeout | 0.0407 |
| 303  | 32:00    | 45 (44)       | 5,535 | 1,775 | 72 | 4,462 / 8,480 | 61 | 40 + 6 = 46 / 80 | timeout | 0.0414 |

"Ability levels" = owned normal weapons + moves; "passives" = owned passives. Max loadout is
6 weapons × L5 + 4 moves × L5 + 6 passives × L5 = 80. "Chests found" are saved for gacha.

Player damage taken by source (hits):

| Seed | Contact | Projectile | Explosion |
| ---- | ------- | ---------- | --------- |
| 101  | 20 | 115 | 2 |
| 202  | 0 | 130 | 2 |
| 303  | 1 | 115 | 11 |

## Observations

1. **Moves broaden the kit.** The bot picks up to four moves (Prismatic Nova, Dark Matter, Charm,
   Arcanopulse, etc.) alongside six weapons. That is the intended level-up path for learning other
   champions' signatures.
2. **Separation reduces stacking.** Peak live enemies are 61–85 with the new body push. The bot still
   survives 32:00, but low-radius minions no longer collapse into one point.
3. **Levels remain fast.** 44–46 picks by 32:00; the bot fills its 80-level loadout partway through and
   then takes passives/training.
4. **Gold is lower but still generous.** 1,585–1,897/run versus the v2 per-champion tree sink (each
   champion's full tree is roughly 1,300–1,500 gold; eight champions ≈ 10–12k). The economy is now a
   per-champion collection grind rather than a one-run account max.
5. **Chests still fund a fast collection.** 45–72 chests/run at 1 chest per pull. A single strong run can
   open dozens of pulls, so expect champions to arrive quickly; tune chest drop rates or shard amounts
   after a human playtest if you want a longer gacha.
6. **Projectile pressure dominates.** 115–130 ranged hits per run; contact is low thanks to kiting and
   separation. Boss projectiles remain the main skill check.
7. **The endgame still uses the 45 s fallback.** The final threat is outrunnable/chase-only; the new boss
   bar and name display make the fight readable but not mechanically harder.
8. **Performance** is ~0.041–0.045 ms/tick with fuller 10-ability builds, still well inside budget.

## Recommended follow-up

- **Gacha economy:** at 45–72 chests/run and 1 chest/pull, the 8-champion roster can be collected very
  fast. Decide whether that is the intended "friends game" arc or slow it down (chest chance, shard
  requirements, or a larger roster).
- **Per-champion gold sink:** eight full trees cost ~10–12k gold, which is a healthy long-term goal;
  watch the first-run burst of gold and chests together.
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
