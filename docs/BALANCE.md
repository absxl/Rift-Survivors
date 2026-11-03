# BALANCE - bot baseline

Measured with the headless kiting bot on the **real content pack** (`loadGamePack()`), solo, champion
`lux`, `DEFAULT_RULESET`. Numbers are a regression baseline, not a substitute for a human playtest.

- Baseline date: 2026-10-27; current snapshot: 2026-11-03 (D-039)
- Run command: `$env:BALANCE="1"; corepack pnpm --filter @rift/content test -- balance`
- Seeds: 101, 202, 303
- Reference: 30:00 final threat -> boss rush (fallback at 30:45); solo run ends on death.
- Current pace: spawn 30/3, elite chests 90 s, patterns rotate every 15 s, gold 5, drops per D-029
  (minions 5% gold, elites 100% gold + 50% key, bosses guaranteed key + luck gold),
  level-up = 3 item cards + 1 training card, XP table flattened after 10.
- D-030 added **enemy separation**, **signature moves**, and a **10-slot ability loadout**
  (6 weapons + 4 moves) beside 6 passives.
- D-031 added the **173-champion roster**, six class weapon/move pools, class trees, Noxian Warfront,
  profiles, and server accounts. The per-region focus preference was removed in D-035.
- D-032 added **procedural terrain** (walls, water/lava, collision, pathfinding) and **minion
  personalities** (runner, tank, fan, healer, shielder, summoner, bomber). The bot now steers around
  walls; it still does not dodge projectiles or run a human-style terrain route.
- D-033 changed **champion meta/profiles**, not run combat. Multi-region champions now appear in multiple
  region chest pools (49 current+origin memberships); the in-run balance baseline below is unchanged, but
  the gacha economy needs a human check because effective pools overlap.
- D-034 adds coherent terrain cleanup, non-blocking breakable bushes, timed run chests with a three-second hold, key drops from elites/bosses, and save v6 keys. The in-run bot baseline below predates the new chest rewards.
- D-035 adds enemy ability kits and frost/magnet/bomb utility. D-037 adds 10/6-rank meta relics, 26
  eight-level passives, and noticeably denser terrain/bushes. D-039 cheapens XP after level 9, gives every
  minion a time-ramped ranged ability roll, scales enemy speed/damage with time, and adds magnet to the
  normal minion drop table. The historical D-032 table is kept below; the current D-039 snapshot is
  recorded separately.

## Enemy roster (20 types)

11 minions (chaser, runner, weaver, mote, ironhide, hexer, bloater, sparker, cinder-cultist, warhound,
blood-acolyte), 3 elites (brute, warden, siege-ogre), 4 bosses (herald, dragon, baron, crimson-herald),
2 final threats (void-threat, dread-conqueror). Riftfield uses the original 14; Noxus uses the new pool
and rules overrides. Weighted/minute-gated spawns; ring / stream / swarm / wall patterns; placeholder tint
+ radius visuals. A radius-squared soft separation system keeps bodies from stacking; bosses barely move.

Terrain is stage content: Riftfield has water (30% slow) and Noxus has lava (25% slow + 5 damage/s).
D-037 uses denser production thresholds: Riftfield wall/liquid `0.65/0.30` and bush density `1.9`;
Noxus `0.67/0.28` and `1.8`. The production-like test field measures above 10% walls and 5% liquid
after cleanup. Ground spawns search for free floor; lava is avoided by pathfinding. Ground enemies
use deterministic per-player BFS flow fields rebuilt every 12 ticks. Bosses, final threats, and units
tagged `levitate` ignore terrain. A `levitate` champion ignores walls, liquid slows, and liquid damage.
Breakable bushes are deterministic, floor-only, and outside the spawn safe zone; D-037 increases their
cluster count rather than making each bush larger.

## Bot behaviour

- Kites the nearest enemy inside 140 px; otherwise collects gems/pickups.
- Rotates away from walls before submitting movement (`avoidWalls` in `balance.test.ts`).
- Picks offers with a 6-weapon / 6-passive / upgrade priority; it treats signature/class moves as weapons
  and **ignores the training card** (score below item cards). A human can take training every level.
- Does not dodge hostile projectiles or use reroll/skip/banish.

## Historical baseline (D-032)

| Seed | Survived | Level (picks) | Kills | Gold | Chests found | Gems / XP | Max alive | Boss rush | ms/tick |
| ---- | -------- | ------------- | ----- | ---- | ------------ | --------- | --------- | --------- | ------- |
| 101  | 32:00    | 45 (44)       | 5,726 | 1,630 | 65 | 4,389 / 8,020 | 87  | timeout | 0.0992 |
| 202  | 32:00    | 45 (44)       | 5,818 | 1,576 | 54 | 4,354 / 7,668 | 91  | timeout | 0.1130 |
| 303  | 16:35    | 30 (29)       | 3,004 | 690   | 32 | 2,649 / 4,351 | 73  | none    | 0.0881 |

Player damage taken by source (hits):

| Seed | Contact | Projectile | Explosion |
| ---- | ------- | ---------- | --------- |
| 101  | 3  | 173 | 8  |
| 202  | 0  | 278 | 15 |
| 303  | 6  | 84  | 6  |

## Current snapshot (D-039)

Measured after the D-039 late-XP, enemy-ability, time-scaling, and magnet changes on the same three seeds:

| Seed | Survived | Level (picks) | Kills | Gold | Keys found | Gems / XP | Max alive | ms/tick |
| ---- | -------- | ------------- | ----- | ---- | ---------- | --------- | --------- | ------- |
| 101  | 5:19 | 16 (15) | 904  | 255 | 2 | 840 / 954  | 59 | 0.1124 |
| 202  | 5:38 | 16 (15) | 954  | 331 | 1 | 832 / 971  | 50 | 0.1038 |
| 303  | 5:33 | 16 (15) | 950  | 240 | 1 | 880 / 1,045 | 60 | 0.0900 |

The bot now reaches level 16 at roughly five and a half minutes instead of level 14 under D-037. The first
D-039 tuning pass used a flat 45% ability chance for every minion and dropped seed 303 to 1:40; the
released 18% + 1.2%/min ramp brings all three seeds back into the five-to-six-minute band. The no-dodge bot
still dies to ability and projectile pressure, so a human pass remains the gate for further tuning. The
D-032 table above remains the historical "long survival" reference.

## Observations (D-032 snapshot)

1. **Terrain raises variance.** Seed 303 dies at 16:35 after getting wall/contact/projectile pressure;
   101 and 202 still reach 32:00. A human can navigate the walls, but this needs a real run rather than
   trusting the bot's 16:35 seed.
2. **Walls create useful cover and bad pockets.** Projectiles stop on walls, and ground enemies route
   around them. The no-dodge bot does not use cover deliberately, so its projectile count rose sharply
   (84-278) relative to the flat D-031 baseline (112-132).
3. **Support minions change target priority.** Healers and shielders extend nearby packs; summoners add
   bodies. Cinder Cultists give Noxus a small spread-volley minion. None of these are exercised by the
   Riftfield-only balance bot beyond the shared spawn pool.
4. **Levitate is a real traversal perk.** Eleven champions cross walls and ignore liquid effects. That is
   strong on Noxus (lava) and on Riftfield when a wall blocks a kite path; watch it after human playtests.
5. **Levels remain fast.** 44-45 picks by 32:00 on the surviving seeds; the bot fills its loadout and then
   takes passives/training.
6. **Performance remains inside budget.** 0.088-0.113 ms/tick with terrain, pathing, 20 enemy types, and
   larger late swarms (73-91 alive).
7. **Chests/gold remain generous.** 54-65 chests and 1,576-1,630 gold on surviving seeds. The run economy
   is still a collection pacing lever, not a short-term bottleneck.

## Recommended follow-up

- **Human terrain pass:** play Riftfield and Noxus for 10-15 minutes each. Check whether walls feel like
  tactical cover, whether lava/water is readable, and whether seed-303-style pockets are unfair.
- **Noxus balance:** the bot does not run Noxus; Cinder Cultist, healer/shielder packs, lava, and the
  faster boss cadence need a dedicated pass.
- **Levitate visibility:** the LEVITATE chip is in collection/PLAY; consider an in-run status chip if
  players miss why a champion is crossing a wall or ignoring lava.
- **Boss patterns:** bosses still mostly chase or use simple ranged attacks; fan/summoner bosses are now
  available for a later pattern pass.
- **Props and cover:** breakable bushes are in (D-034/D-037). Destructible rocks and line-of-sight cover
  remain deferred; they would add another tactical layer.
- **Projectile pressure:** the dominant damage source on surviving seeds is still ranged/boss projectiles.
  D-039 adds time-scaled enemy speed/damage and a ramped minion ability chance; if human runs feel too
  spikey, tune those ramps before raising player stats.
- **Magnet frequency:** magnets are now a 1-in-5 outcome of the normal consumable drop roll. Watch whether
  they feel discoverable but not mandatory; adjust the drop pool weights rather than the chest magnet.

## Caveats

- The bot does not take the guaranteed training card, dodge projectiles, or use reroll/skip/banish.
- The bot's wall avoidance is local and can still enter a pocket; seed 303 is the clearest example.
- A human kites worse in the open but uses terrain, training, and dodges better; only a playtest settles
  the feel.
- Balance numbers are deterministic for the recorded seeds but content/pathing tweaks will move them.
