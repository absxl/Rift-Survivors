# BALANCE — bot baseline

Measured with the headless kiting bot on the **real content pack** (`loadGamePack()`), solo, champion
`lux`, `DEFAULT_RULESET`. Numbers are a regression baseline, not a substitute for a human playtest.

- Date: 2026-10-26
- Run command: `$env:BALANCE="1"; corepack pnpm --filter @rift/content test -- balance`
- Seeds: 101, 202, 303
- Reference: 30:00 final threat → boss rush (fallback starts it at 30:45 if the threat lives); solo run ends
  when the player dies.
- Current pace: `director.spawnInterval 30`, `batchSize 3`, `eliteInterval 2700` (90 s), pattern rotates
  every 15 s, `pickup.goldAmount 5`.

## Enemy roster (14 types)

| Category | Enemies |
| -------- | ------- |
| Minions (8) | chaser (baseline), runner (fast), weaver (zigzag), mote (very fast/weak), ironhide (tank), hexer (ranged), bloater (death explosion), sparker (periodic dash) |
| Elites (2) | brute (chase), warden (weaver, from minute 10) |
| Bosses (3) | herald, dragon, baron |
| Final (1) | void-threat |

Spawning is weighted and minute-gated; regular waves rotate through **ring / stream / swarm / wall**
placements and centre on a random alive player (co-op). Elites are weighted. Placeholder visuals derive
from content tint + radius (no real art).

## Bot behaviour

- Kites the nearest enemy inside 140 px (tangential drift); runs straight away inside 45 px.
- Otherwise walks to the nearest gem (220 px) or pickup (170 px).
- Auto-picks offers with a 6-weapon → 6-passive → upgrade priority; heals only below 40% HP.
- Does not dodge hostile projectiles, use reroll/skip/banish, or plan a build.

## Baseline (current)

| Seed | Survived | Level (picks) | Kills | Gold | Gems / XP | Max alive | Item levels | Boss rush | ms/tick |
| ---- | -------- | ------------- | ----- | ---- | --------- | --------- | ----------- | --------- | ------- |
| 101  | 32:00    | 20 (19)       | 5,538 | 430  | 5,052 / 8,702 | 57 | 36 / 60 | timeout | 0.0224 |
| 202  | 32:00    | 21 (20)       | 5,540 | 330  | 4,847 / 8,901 | 65 | 39 / 60 | timeout | 0.0258 |
| 303  | 32:00    | 20 (19)       | 5,536 | 440  | 5,002 / 8,593 | 69 | 36 / 60 | timeout | 0.0240 |

“Item levels” is the sum of all owned weapon + passive levels (60 = 6×L5 + 6×L5).

Player damage taken by source (hits):

| Seed | Contact | Projectile | Explosion |
| ---- | ------- | ---------- | --------- |
| 101  | 3 | 79 | 7 |
| 202  | 1 | 77 | 2 |
| 303  | 8 | 205 | 21 |

## Observations

1. **All three seeds survive to 32:00** with the full roster, at level 20–21 and 36–39/60 item levels.
2. **Ranged casters are the dominant threat.** Projectiles account for ~90% of hits; the bot never dodges
   them. An early version (period 90, speed 3.4, range 280, weight 0.8) killed the bot at ~7 minutes; the
   tuned version (period 240, speed 2.2, range 180, weight 0.3, from minute 9) keeps it alive while still
   making casters matter. A human can dodge, so treat this as bot-only pressure.
3. **Contact is rare.** Fast minions (runner/mote) and chargers create pressure, but the bot outruns them;
   most damage still comes from ranged fire. Bloaters add a small explosion chip.
4. **Build pacing is similar to the pre-enemy pass** (36–39/60 vs 33–45/60) because the specials award more
   XP but also demand more movement.
5. **The endgame is still reached via the 45 s fallback** rather than a kill; the final threat remains
   outrunnable at speed 1.0.
6. **Performance is trivial:** 0.022–0.026 ms/tick with the richer wave mix (vs ~0.019 before).

## Recommended follow-up

- **Human difficulty pass:** watch a real run. The bot proves the roster is survivable with perfect kiting;
  it does not prove casters/chargers feel fair to a human.
- **Boss patterns:** bosses are all chase-only. A dash/ranged pattern would make the final threat and rush
  more interesting than more HP.
- **Optional:** tiered XP gems (`13-CLASSIC-FEEL-SPEC §6`) if level pacing should speed up.
- **Co-op:** spawn centres are per-wave random; watch that 4-player rooms don't stack casters on one player.

## Caveats

- The bot does not dodge projectiles or use reroll/skip/banish, and its build choices are greedy.
- A human kites worse but dodges better; the two roughly cancel, but only a playtest settles it.
- The final threat is a chase-only boss; its threat depends on the build and route.
