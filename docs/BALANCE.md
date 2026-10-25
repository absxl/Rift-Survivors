# BALANCE — bot baseline

Measured with the headless kiting bot on the **real content pack** (`loadGamePack()`), solo, champion
`lux`, `DEFAULT_RULESET`. Numbers are a regression baseline, not a substitute for a human playtest.

- Date: 2026-10-25
- Run command: `$env:BALANCE="1"; corepack pnpm --filter @rift/content test -- balance`
- Seeds: 101, 202, 303 (baseline) · seed 101 (variants)
- Reference: 30:00 final threat → boss rush (fallback starts it at 30:45 if the threat lives); solo run ends
  when the player dies.
- Current pace (applied): `director.spawnInterval 30`, `director.batchSize 3`,
  `director.eliteInterval 2700` (90 s), `pickup.goldAmount 5`.

## Bot behaviour

- Kites the nearest enemy inside 140 px (tangential drift); runs straight away inside 45 px.
- Otherwise walks to the nearest gem (220 px) or pickup (170 px).
- Auto-picks offers with a 6-weapon → 6-passive → upgrade priority; heals only below 40% HP.
- Does not use rerolls/skips (not implemented yet) and does not plan a build.

## Baseline (current pace)

| Seed | Survived | Level (picks) | Kills | Gold | Gems / XP | Max alive | Item levels | Boss rush | ms/tick |
| ---- | -------- | ------------- | ----- | ---- | --------- | --------- | ----------- | --------- | ------- |
| 101  | 32:00    | 19 (18)       | 5,537 | 490  | 5,099 / 5,824 | 68 | 33 / 60 | timeout | 0.0185 |
| 202  | 32:00    | 19 (18)       | 5,538 | 400  | 4,992 / 5,721 | 74 | 45 / 60 | timeout | 0.0144 |
| 303  | 32:00    | 19 (18)       | 5,539 | 375  | 5,001 / 6,175 | 79 | 38 / 60 | timeout | 0.0157 |

“Item levels” is the sum of all owned weapon + passive levels (60 = 6×L5 + 6×L5, i.e. fully maxed).
Gold income is ~370–485/run against a ~1,425-gold shop total (≈3–4 runs for every permanent upgrade).

## Before / after (seed 101)

| Pace | Spawns | Elite chests | Level | Kills | Max alive | Item levels | Gold | ms/tick |
| ---- | ------ | ------------ | ----- | ----- | --------- | ----------- | ---- | ------- |
| old | 60 / 2 | every 30 s | 16 | 1,913 | 22 | 60 | 235 | 0.0109 |
| **current** | **30 / 3** | **every 90 s** | **19** | **5,546** | **68** | **33** | **485** | **0.0192** |
| experiment | 30 / 3 | every 30 s | 19 | 5,602 | 48 | 60 | 510 | 0.0164 |

## Observations

1. **The swarm now exists.** 68–79 enemies alive (was 19–28) and ~5,500 kills per run (was ~1,900).
   Performance is still trivial at 0.02 ms/tick; the 200-enemy cap has plenty of headroom.
2. **Builds no longer max out early.** At 31:00 the bot has 33–45 of 60 item levels (was 60/60), so
   level-up choices matter through the run. Chests every 30 s are what maxed the build before; 90 s keeps
   them meaningful without removing them.
3. **Level-ups are still slow but relevant.** ~5,600 kills → level 19 (18 picks) because enemies give
   1 XP and the late curve is steep. Chests + level-ups now complement each other.
4. **The kiting bot still never dies.** 3/3 seeds reach 31:00. The player is 4× faster than a chaser, and
   the bot never gets cornered. A human will take more contact damage; this is the main reason to playtest.
5. **The endgame now starts.** The final threat (1,000 base HP → ~5,500 at 30:00, speed 1.0) spawns at
   30:00; the fallback starts the boss rush at 30:45 if it is still alive. The kiting bot times out rather
   than killing it, which is the expected bot result — a human build that stands and fights can kill it
   and start the rush early.
6. **Gold economy is sane again.** Halving coin value after the kill-rate tripled keeps a full shop at
   roughly 3–4 runs instead of 2.

## Recommended follow-up (not applied)

- **Human endgame pass:** watch a real final-threat fight. If players outrun it forever, add a boss pattern
  (dash/ranged/adds) rather than more HP; the current fallback only guarantees the transition.
- **Human difficulty pass:** the bot proves the swarm is survivable with perfect kiting, not that it is
  challenging. Watch a real run before raising `director.hpScalePerMin` or spawn pressure further.
- **Per-player stats (co-op):** the modifier stack is still global, so one player's passives buff the whole
  party. `refreshSynergies` also evaluates only player 0's tags.
- **Optional:** consider tiered XP gems (`13-CLASSIC-FEEL-SPEC §6`) if level pacing should speed up
  without touching the wave pressure.

## Caveats

- A human kites worse than this bot and will take more contact damage.
- The bot ignores gold/consumable pickups beyond 170 px and never uses reroll/skip/banish.
- The final threat is a chase-only boss; its threat depends on the build and kiting route.
