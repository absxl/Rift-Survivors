# BALANCE — bot baseline

Measured with the headless kiting bot on the **real content pack** (`loadGamePack()`), solo, champion
`lux`, `DEFAULT_RULESET`. Numbers are a regression baseline, not a substitute for a human playtest.

- Date: 2026-10-26
- Run command: `$env:BALANCE="1"; corepack pnpm --filter @rift/content test -- balance`
- Seeds: 101, 202, 303
- Reference: 30:00 final threat → boss rush (fallback at 30:45); solo run ends on death.
- Current pace: spawn 30/3, elite chests 90 s, patterns rotate every 15 s, gold 5, drops per D-029
  (minions 5% gold + 1% chest, elites 100% gold + 50% chest, bosses guaranteed chest + luck gold),
  level-up = 3 item cards + 1 training card, XP table flattened after 10.

## Enemy roster (14 types)

8 minions (chaser, runner, weaver, mote, ironhide, hexer, bloater, sparker), 2 elites (brute, warden),
3 bosses (herald, dragon, baron), 1 final threat (void-threat). Weighted/minute-gated spawns; ring /
stream / swarm / wall patterns; placeholder tint + radius visuals.

## Bot behaviour

- Kites the nearest enemy inside 140 px; otherwise collects gems/pickups.
- Picks offers with a 6-weapon → 6-passive → upgrade priority; **ignores the training card** (score below
  item cards). A human can take training every level.
- Does not dodge hostile projectiles or use reroll/skip/banish.

## Baseline (current)

| Seed | Survived | Level (picks) | Kills | Gold | Chests found | Gems / XP | Max alive | Item levels | Boss rush | ms/tick |
| ---- | -------- | ------------- | ----- | ---- | ------------ | --------- | --------- | ----------- | --------- | ------- |
| 101  | 32:00    | 45 (44)       | 5,539 | 2,230 | 72 | 4,136 / 7,486 | 66 | 40 / 60 | timeout | 0.0248 |
| 202  | 32:00    | 45 (44)       | 5,540 | 2,148 | 68 | 4,258 / 8,192 | 84 | 45 / 60 | timeout | 0.0244 |
| 303  | 32:00    | 45 (44)       | 5,538 | 1,645 | 90 | 4,254 / 7,657 | 59 | 40 / 60 | timeout | 0.0244 |

“Item levels” = all owned weapon + passive levels (60 = 6×L5 + 6×L5). “Chests found” are saved for the shop.

Player damage taken by source (hits):

| Seed | Contact | Projectile | Explosion |
| ---- | ------- | ---------- | --------- |
| 101  | 0 | 39 | 4 |
| 202  | 0 | 81 | 0 |
| 303  | 0 | 46 | 0 |

## Observations

1. **XP is no longer a grind.** The flatter curve gives level **45 / 44 picks** by 32:00 (was level ~20).
   Builds reach 40–45/60 item levels without chest item bursts, and evolutions now appear as level-up cards
   (the bot picked `final-spark`, `spirit-rush`, `pyroclasm`, etc.).
2. **Chests are meta-only now.** 68–90 found chests/run come from minion 1%, elite 50% and bosses; they no
   longer give in-run items. The shop can unlock all champions very quickly and then converts chests to gold.
3. **Gold is very high.** 1,645–2,230/run (minion 5% + elites 100% + bosses + Greed) against a ~1,425-gold
   shop total: one good run nearly buys every permanent upgrade. This is the requested rate; tune the coin
   value/shop costs after a playtest if it feels too fast.
4. **Defensive stats are strong.** The bot ends at full HP with regen/lifesteal/plate and only projectile
   hits; the new survivability passives may be too forgiving. Human pressure test needed.
5. **Ranged casters remain the main threat** (39–81 projectile hits); contact is now zero in the bot runs.
6. **The endgame is still reached via the 45 s fallback** — the final threat remains outrunnable/chase-only.
   The new top-center boss bar makes the fight readable.
7. **Performance** is unchanged at ~0.024 ms/tick with level-45 builds.

## Recommended follow-up

- **Economy pass:** the 5% minion gold / 1% chest + guaranteed elite/boss rewards make gold and gacha
  chests abundant. Consider lowering `pickup.goldAmount` (5) or raising shop costs after a human run.
- **Human difficulty pass:** full-HP bot endings suggest defensive stats (regen/lifesteal/resist/plate) might
  need caps or lower values. Also watch the new training cards’ stacking.
- **Boss patterns:** bosses are still chase-only; a dash/ranged pattern would make the final threat and rush
  more interesting.
- **Training card weighting:** the bot ignores training; a human can stack max HP/regen. Watch for a
  “training-only” degenerate build.
- **Meta chests:** after all champions are owned they give 50 gold each; with 68–90 chests this is a large
  gold source. Decide if that is intended.

## Caveats

- The bot does not take the guaranteed training card, dodge projectiles, or use reroll/skip/banish.
- A human kites worse but uses training/dodges better; only a playtest settles the feel.
- The final threat is a chase-only boss; its threat depends on the build and route.
