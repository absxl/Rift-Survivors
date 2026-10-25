# BALANCE — bot baseline

Measured with the headless kiting bot on the **real content pack** (`loadGamePack()`), solo, champion
`lux`, `DEFAULT_RULESET`. Numbers are a regression baseline, not a substitute for a human playtest.

- Date: 2026-10-25
- Commit: `88d7f6b` (gold drops + per-player kill credit included)
- Run command: `$env:BALANCE="1"; corepack pnpm --filter @rift/content test -- balance`
- Seeds: 101, 202, 303 (baseline) · seed 101 (variants)
- Reference: 30:00 final threat → boss rush; solo run ends when the player dies.

## Bot behaviour

- Kites the nearest enemy inside 140 px (tangential drift); runs straight away inside 45 px.
- Otherwise walks to the nearest gem (220 px) or pickup (170 px).
- Auto-picks offers with a 6-weapon → 6-passive → upgrade priority; heals only below 40% HP.
- Does not use rerolls/skips (not implemented yet) and does not plan a build.

## Baseline (default rules)

| Seed | Survived | Level (picks) | Kills | Gold | Gems / XP | Max alive | Item levels | Boss rush | ms/tick |
| ---- | -------- | ------------- | ----- | ---- | --------- | --------- | ----------- | --------- | ------- |
| 101  | 31:00    | 16 (15)       | 1,913 | 350  | 1,693 / 2,611 | 22 | 60 / 60 | no | 0.0135 |
| 202  | 31:00    | 16 (15)       | 1,917 | 360  | 1,590 / 2,504 | 28 | 60 / 60 | no | 0.0112 |
| 303  | 31:00    | 16 (15)       | 1,909 | 410  | 1,639 / 2,484 | 19 | 60 / 60 | no | 0.0116 |

“Item levels” is the sum of all owned weapon + passive levels (60 = 6×L5 + 6×L5, i.e. fully maxed).

## Tuning variants (seed 101)

| Variant | Rules changed | Survived | Level | Kills | Max alive | Item levels | Gold | Boss rush | ms/tick |
| ------- | ------------- | -------- | ----- | ----- | --------- | ----------- | ---- | --------- | ------- |
| baseline | — | 31:00 | 16 | 1,913 | 22 | 60 | 350 | no | 0.0108 |
| rarer chests | `director.eliteInterval 2700` (90 s) | 31:00 | 16 | 1,853 | 27 | 36 | 280 | no | 0.0087 |
| swarmier + rarer chests | above + `spawnInterval 30`, `batchSize 3` | 31:00 | **19** | **5,546** | **68** | 33 | 970 | no | 0.0176 |

## Observations

1. **Survival is easy for a kiting player.** All runs reach 31:00 with no deaths. Chasers move at 0.6
   px/tick vs the player's 2.5, and the swarm is thin enough to outrun forever.
2. **The swarm never builds.** Alive count peaks at 19–28 vs the 200 cap because spawn rate
   (2 every 2 s ≈ 60/min) matches the kill rate. The intended “huge swarm” is not present.
3. **Level-ups stop mattering by ~15 minutes.** ~1,900 kills gives ~2,500 XP → level 16. The 6W+6P build
   needs 60 item levels, so 15 picks cannot finish it. Instead, **elite chests every 30 s** (≈60 chests,
   1/3/5 items each) max every item by the end, making the level-up choice irrelevant.
4. **The endgame is not reached.** The final threat spawns at 30:00 with ~8,250 HP; a maxed build does not
   kill it within the last minute, so the boss rush never triggers.
5. **Gold works after the drop-table fix:** 280–410 per run vs ~1,660 gold to buy the whole shop. That is
   a reasonable multi-run meta pace.
6. **Performance is a non-issue.** 0.01–0.02 ms/tick headless; even the 68-alive swarm runs a full
   31-minute sim in ~1 s. A 200-enemy swarm has plenty of headroom.

## Recommended follow-up (needs a feel pass / sign-off)

- **Spawn pressure:** `director.spawnInterval 60→30` and `director.batchSize 2→3` (measured above:
  triples kills, 68 alive, level 19). This is the cheapest way to reach the swarm fantasy.
- **Chest cadence:** `director.eliteInterval 900→2700` (30 s → 90 s) _or_ cap chest items at 1/2/3
  instead of 1/3/5. Target: builds finish near 25–30 minutes, not at 15.
- **XP relevance:** if level-ups should matter alongside chests, either raise enemy XP (tiered gems per
  `13-CLASSIC-FEEL-SPEC §6`, e.g. elites/bosses worth more) or flatten the late XP curve. Current curve:
  5, 8, 12, 18, 25, 35, 50, 70, 100 … (×1.2 after the table).
- **Final threat:** scale it to expected DPS (or lower base HP) so the kill lands within ~30–60 s and the
  boss rush is reachable.
- **Per-player stats (co-op, separate issue):** the modifier stack is still global, so one player's
  passives buff the whole party. `refreshSynergies` also evaluates only player 0's tags.

## Caveats

- A human kites worse than this bot and will take more contact damage; the threat is higher than measured.
- The bot ignores gold/consumable pickups beyond 170 px and never uses reroll/skip/banish.
- The final threat is a chase-only boss; its threat depends on the build and kiting route.
