# 14 - Implementation status

Last updated: **2026-10-27**  
Current batch: **D-029 + D-030**  
Commits: `299a11b` (D-030 batch) and `48e6389` (HUD tooltip positioning fix)

This is a snapshot of what is actually implemented in the repository. The design rationale lives in
[`10-DESIGN-DECISIONS.md`](10-DESIGN-DECISIONS.md); the classic baseline is in
[`13-CLASSIC-FEEL-SPEC.md`](13-CLASSIC-FEEL-SPEC.md). When this document and older planning docs disagree,
**this file describes the code**.

## 1. How to run

From the repo root (pnpm is not on PATH; use `corepack`):

```powershell
corepack pnpm install
corepack pnpm --filter @rift/client dev
```

In a second terminal, for online co-op:

```powershell
corepack pnpm --filter @rift/server build
node packages/server/dist/index.js
```

- Client: `http://localhost:5173` (or the LAN IP Vite prints)
- Co-op server: `ws://<host>:8787`
- Health: `GET http://localhost:8787/health` -> `{"ok":true,"rooms":N,"version":3}`

Checks:

```powershell
corepack pnpm exec biome check --write .
corepack pnpm -r typecheck
corepack pnpm -r test
corepack pnpm --filter @rift/client build
corepack pnpm --filter @rift/server build
```

Balance bot (long, ~32 minutes of sim time per seed):

```powershell
$env:BALANCE="1"; corepack pnpm --filter @rift/content test -- balance
```

## 2. Player experience

### Main menu

A League-client-inspired DOM hub with an always-visible brand/currency header and a left navigation rail:

| Section | What it does |
|---|---|
| PLAY | Selected-champion hero panel, starting kit, PLAY / CO-OP, lifetime stats |
| CHAMPIONS | Region-filtered collection: descriptions, rarities, starting kits, shard progress, unlock/select |
| UPGRADES | The selected champion's own permanent upgrade tree, bought with gold |
| CHESTS | Six region-themed gacha cards with odds, 1-pull and 10-pull buttons, results panel |
| ACHIEVEMENTS | Four run milestones |
| SETTINGS | Sound, screen shake, damage numbers, movement rebinds, Reset Save |

The old separate character-select popup is no longer used. PLAY and CO-OP use the champion selected on
the CHAMPIONS page.

### Run

- Move-only controls; all weapons and moves auto-cast.
- Default controls: **WASD / arrows / gamepad**, **Esc** pause, **Tab** scoreboard, **F3** diagnostics.
- Level-up: **1-4** pick, **R** reroll, **X** skip, **B** banish. **S is movement and never closes the
  offer.** Esc does not open pause over an open offer.
- Champion inventory is **6 weapons + 4 moves + 6 passives**.
- Every champion starts with one unique signature move and one starting weapon.
- A level-up has 3 cards plus 1 guaranteed repeatable Training card.
- Evolutions are level-up cards (maxed weapon + required passive).
- Elite/boss chest pickups are saved for the meta gacha, not opened during the run.
- A run ends on death; the final threat appears at 30:00 and the run switches to a boss rush when it dies
  (or after a 45 s fallback).

### Online co-op

- Host/join by four-letter room code, 1-4 players.
- Shared party XP/level; each player chooses their own level-up cards and keeps their own build.
- Each player's selected champion and per-champion meta bonuses apply independently.
- Party frames show lobby names, champion colors, level, HP, kills and downed state.
- Top bar uses **team kills** in co-op; the Tab scoreboard keeps each player's individual kills and gold.
- Downed players can be revived by an ally walking over them.
- Mid-run reconnect is supported for 60 s; lobby/name screens have BACK TO MENU.

## 3. Architecture

```
packages/
  sim/      pure deterministic simulation (no DOM, no network, no Node APIs)
  content/  typed + Zod-validated game data
  shared/   protocol types + Zod schemas
  client/   Vite + PixiJS renderer, DOM UI, worker host, WebSocket host
  server/   Node `ws` authoritative room server
```

Dependency direction: `content -> sim`, `shared -> client/server`, `client/server -> sim/content/shared`.

### Simulation loop

- Fixed **30 Hz** (`TICK_MS = 1000/30`), display-rate interpolation on the client.
- Deterministic seeded `Rng` (xoshiro128**), no `Math.random` in gameplay logic.
- Struct-of-arrays entity stores with pooled slots and generations.
- Events out: hits, deaths, fires, level-ups, pickups, boss rush, nuke, run end.
- Snapshots for render/network; JSON deltas for changed rows.
- The current pipeline (`DEFAULT_RULESET.pipeline`):

```
core-movement -> spawn-director -> enemy-ai -> separation -> spatial-hash -> weapons ->
projectiles -> zones -> contact-damage -> revive -> regen -> deaths -> gems -> pickups ->
progression
```

### Stores

| Store | Purpose |
|---|---|
| players | position, HP, level, XP, gold, kills, chests, downed/revive |
| enemies | position, HP, kind, velocity, hit/status timers, last hit owner |
| projectiles | straight/orbit/boomerang/bounce/hostile projectiles |
| weapons | owner, content weapon index, cooldown, level |
| passives | owner, content passive index, level |
| gems | XP orbs |
| zones | lingering damage fields |
| pickups | heal, vacuum, nuke, freeze, gold |

### Systems

- **Movement:** normalized move input, per-player speed, facing.
- **Spawn director:** weighted, minute-gated enemy selection; ring/stream/swarm/wall patterns; elite/boss
  cadence; enemy-count scaling per player.
- **Enemy AI:** chase, weaver, charge, ranged; burning/slow status; exploder deaths; recycling.
- **Separation (D-030):** soft body push between overlapping enemies. Mass is radius squared, so a boss
  barely moves while minions are displaced; a per-pair push cap prevents explosive corrections.
- **Spatial hash:** 64 px cell grid rebuilt each tick; all nearby queries use it.
- **Weapons:** content-driven auto-fire behaviors (`sweep`, `shoot-nearest`, `aura`, `strike-random`,
  `ground-pool`, `orbit`, `bounce`, `boomerang`). Moves use the same pipeline with `isMove: true`.
- **Combat:** might/area/cooldown scaling, pierce, knockback, lifesteal, per-enemy hit cooldown, i-frames.
- **Zones:** lingering ground damage with owner credit.
- **Gems/pickups:** magnet radius, XP, gold/chests, heal, vacuum, nuke, freeze.
- **Progression:** XP curve, shared party level, card offers, training, reroll/skip/banish, evolutions.
- **Synergies:** tag-count and combo modifiers, plus burn + slow reaction damage.
- **Co-op:** shared XP/level, per-player modifiers/characters, revive, per-player offers.

### Stats

Per-player modifier stacks support: `might`, `cooldown` (haste), `area`, `moveSpeed`, `magnet`, `armor`,
`luck`, `growth`, `regen`, `greed`, `resist`, `projectileSpeed`, `duration`, `pierce`, `knockback`,
`lifesteal`, and `maxHp`. Base character stats, growth, passives, synergies, training, and per-champion
meta bonuses all flow through the owner's stack.

### Networking

- Authoritative server runs the same sim at 30 Hz; clients send inputs and choices.
- Protocol **v3** in `packages/shared/src/protocol.ts`.
- Full snapshots on join/rejoin/resync/every 150 ticks; JSON deltas for changed rows otherwise.
- Client interpolation of all entities, plus a capped 6 px visual lead for the local sprite/camera.
- Per-client reconnect token with a 60 s server grace period.
- `create` / `join` / `ready` messages may carry `metaBonuses`; the server keeps them per client and
  starts the world with `playerMetaBonuses`.
- `/health` reports the protocol version.

## 4. Content inventory

Counts generated from `loadGamePack()`:

| Type | Count |
|---|---:|
| Champions | 8 |
| Weapons (total) | 23 |
| Standard weapons (non-move) | 15 |
| Evolved weapons | 4 |
| Signature moves | 8 |
| Passives | 18 |
| Enemies | 14 |
| Minions / elites / bosses / final threats | 8 / 2 / 3 / 1 |
| Meta power-ups | 23 |
| Synergies | 4 |
| Regions | 6 |
| Achievements | 4 |

### Champions

| Champion | Region | Rarity | Class | Starting weapon | Starting move |
|---|---|---|---|---|---|
| Ahri (starter) | Ionia | Common | Mage | Orb of Deception | Charm |
| Lux | Demacia | Epic | Mage | Lucent Singularity | Prismatic Nova |
| Brand | Noxus | Epic | Mage | Conflagration | Pyre Pillar |
| Annie | Noxus | Rare | Mage | Fox-Fire | Infernal Guardian |
| Syndra | Ionia | Epic | Mage | Scatter the Weak | Force of Will |
| Veigar | Bandle City | Epic | Mage | Primordial Burst | Dark Matter |
| Xerath | Shurima | Epic | Mage | Arcane Barrage | Arcanopulse |
| Ryze | Runeterra | Legendary | Mage | Overload | Realm Warp |

All eight champions are mages in this pass. The upgrade framework has tank-flavoured entries
(Fortitude/Bulwark/Regeneration/Aegis) ready for future tank champions, but no tank champion exists yet.

### Weapons and evolutions

- 11 standard source weapons + 4 evolved forms + 8 signature moves = 23 weapon definitions.
- All are content-driven, max level 5.
- Evolutions:
  - Light Binding + Might -> Final Spark
  - Orb of Deception + Flow State (haste) -> Spirit Rush
  - Overload + Flow State (haste) -> Desperate Power
  - Conflagration + Far-Sight Lens (area) -> Pyroclasm
- Signature moves (also learnable by other champions through level-ups):
  Prismatic Nova, Pyre Pillar, Charm, Realm Warp, Force of Will, Dark Matter, Infernal Guardian,
  Arcanopulse.

### Passives (18)

Might, Wanderer's Boots, Heart of the Rift, Gathering Sigil, Far-Sight Lens, Flow State, Runic Plating,
Lucky Charm, Scholar's Tome, Renewal Bloom, Coin Devotion, Warding Sigil, Aether Lens, Lasting Hex,
Piercing Bolt, Kinetic Seal, Crimson Pact, Titan's Grip.

### Enemies (14)

- Minions: Rift Crawler, Dartling, Weft Wisp, Ash Mote, Ironhide, Hex Weaver, Bloatspore, Spark Charger.
- Elites: Rift Brute, Verdant Warden.
- Bosses: Herald of Ash, Cinder Wyrm, Void Baron.
- Final threat: The Hollow Star.

Enemy behaviors: chase, weaver, charge, ranged; bloater explosion on death; slow/burn statuses; weighted
minute-gated spawns; placeholder tint/radius.

### Meta power-ups (23)

Eight basics (Raw Power, Vitality, Swiftness, Focused Casting, Far Reach, Attraction, Plating, Fortune),
mage entries (Arcane Flow, Spell Velocity, Persistence), tank entries (Fortitude, Bulwark, Regeneration,
Aegis), and one signature upgrade per champion (Radiance, Pyre, Foxfire, Runeweave, Transcendence,
Tyranny, Kindling, Ascension). Each champion has a curated eight-entry tree in content.

### Synergies (4)

Ignite (fire count), Arcane Affinity (arcane count), Light Weaver (light count), Elementalist
(fire + arcane combo). Burn + slow also produces a reaction burst.

## 5. Progression and economy

### Run progression

- Shared party XP/level in co-op; every player gets their own offer.
- Default offer: 3 item cards + 1 guaranteed Training card.
- Tokens: **3 rerolls, 2 skips, 2 banishes** per run.
- XP: explicit early table, then +7 XP/level after the table.
- Elite/boss drops per D-029:
  - Minions: 5% gold, 1% chest.
  - Elites: guaranteed gold, 50% chest.
  - Bosses/final threat: guaranteed chest + luck-scaled gold.
- In-run chest pickups increment that player's run chest count; results add them to `save.chests`.
- The final threat spawns at 30:00; boss rush starts on its death or after 45 s.

### Meta gold

- Run gold is awarded to the local save at results.
- Gold buys per-champion permanent upgrades; refunds return the last rank's cost.
- Achievements award 25 gold once each.
- Gacha gold drops are added to the same wallet.

## 6. Save data and gacha

### Save v2

`packages/client/src/save/save.ts`, localStorage key `rift-survivors-save`.

```ts
interface SaveData {
  version: 2;
  gold: number;
  selectedCharacter: string;
  championUpgrades: Record<string, Record<string, number>>; // championId -> powerUpId -> rank
  championShards: Record<string, number>;                   // championId -> shards
  unlockedCharacters: string[];
  chests: number;
  achievements: string[];
  totalKills: number;
  bestTimeSec: number;
  settings: { volume; shake; damageNumbers; keybinds };
}
```

Migration from v1:

- Old global `purchases` are moved onto the selected/first champion's tree.
- `selectedCharacter` is initialized from the old selection or first unlocked champion.
- Shards start empty.
- `purchases` is removed.

### Starter and unlocking

- The free starter is **Ahri** (content flag `starter: true`), Common.
- Everything else is gacha/shard-only. The old dev unlock-all was removed.
- Fresh save: 1/8 champions. Old dev saves with all champions should use Reset Save.

### Region gacha

Six region chests: Demacia, Noxus, Ionia, Shurima, Bandle City, Runeterra.

Per pull (1 chest):

| Outcome | Chance | Detail |
|---|---:|---|
| Full champion | 8% | locked champion from the chosen region, rarity-weighted |
| Champion shards | 72% | 3 shards for Common, otherwise 1-2 (35% chance of 2) |
| Gold | 20% | +50 gold |

- Rarity weights inside a region: Common 60 / Rare 30 / Epic 9 / Legendary 1.
- If every champion in the region is owned, a pull gives +75 gold instead.
- Shard requirements: Common 6 / Rare 8 / Epic 12 / Legendary 20.
- Shards are champion-specific. The player spends them manually from the Champions page, choosing which
  champion to unlock first.
- Full champion outcomes only choose locked champions; duplicates are impossible.
- 10-pull (10 chests): ten pulls. If any of the first nine is an Epic+ champion, it is marked
  **GUARANTEED EPIC+**; otherwise the 10th slot unlocks a locked Epic+ from the chosen region.
  If all of the region's Epic+ champions are owned, the guarantee gives 5 Epic+ shards (or 200 gold if
  the region has no Epic+ definition at all).
- Every region currently contains at least one Epic+ champion, so the guarantee is meaningful.

### Per-champion upgrades

- The Upgrades page always edits `save.selectedCharacter`.
- The selected champion's content-defined `upgradeIds` control the tree; eight entries per champion.
- Cost/rank/refund are per champion; old global purchases do not carry to other champions.
- `computeMetaBonuses` filters by the champion's tree and is used for solo runs and co-op messages.
- Current trees emphasize haste for mages (Focused Casting + Arcane Flow) and health/armor/regen/resist
  entries exist for future tank kits.

### Admin panel

Press **H** anywhere:

- +1,000 / +10,000 gold
- +10 / +100 chests
- +10 shards to selected / all champions
- Unlock selected / all champions
- Max selected / all upgrade trees
- Reset Save
- Close

Admin changes persist immediately to localStorage. This is a local dev tool, not a production feature.

## 7. UI and presentation

### DOM HUD

`packages/client/src/hud.ts` (plain DOM, no Pixi for HUD):

- **Top bar:** time, team kills (co-op) or individual kills (solo), gold, chests.
- **Party frames (top-left, co-op):** lobby name, champion color/initial, level, HP, kills, downed state.
- **Boss bar (top-center):** name + HP; final threat styled purple.
- **Hotbar (bottom-center):**
  - champion portrait + level
  - HP + XP bars
  - Q/W/E/R normal weapon slots with cooldown fill and level
  - four move slots (gold border) with cooldown
  - eight item slots (remaining weapons + passives)
  - hover tooltips with flavor, type/level, and derived damage/cast/area/projectiles/pierce/knockback.
- **Tab scoreboard:** party table with individual kills/gold, plus 16 local stats and totals.
- **F3:** FPS + live entity counts.

The renderer still draws the world, enemy health bars, damage numbers, particles and screen shake; the HUD
is DOM so text stays crisp and CSS-styled.

### Level-up UI

`packages/client/src/levelup.ts` + `ability-info.ts`:

- Four cards (3 offered + training), dark/gold League styling.
- Type badge (WEAPON / MOVE / PASSIVE / EVOLUTION / TRAINING), name, flavor, current->next stat deltas
  using the latest authoritative player stats.
- Picks, reroll, skip, banish buttons and keyboard hints.
- S/W/A/D do not interact with the menu; the sim is paused in solo.

### Other screens

- Name entry (with BACK TO MENU)
- Co-op lobby (host/join, player list, room code)
- Esc pause (resume, restart solo, quit, sound/shake/damage settings)
- Run results (time, kills, gold, chests, achievements)
- Connection-lost/reconnect overlay
- Banner/flash feedback for boss rush, chest saved, nuke

### Presentation placeholders

- Procedural pixel sprites/tints, generated pixel font and SFX.
- Champions are differentiated by color/initial placeholders.
- No copied LoL/Vampire Survivors art.
- Real art/audio can go in `assets/local/` later.

## 8. Commands, tests and verification

### Automated checks

Last full run (all green):

- `biome check`: pass
- `tsc --noEmit` for all packages: pass
- tests:
  - **87 sim** tests
  - **13 content** tests (+2 balance tests skipped by default)
  - **21 client** tests
  - **9 server** tests
  - total **130 passing, 2 skipped**
- Client and server production builds: pass.

Coverage highlights:

- Sim: RNG, stores, modifiers, spatial hash, stats, co-op, per-player meta, separation, moves, evolutions,
  drops, endgame, progression stress, determinism, bot/fitness, perf.
- Content: schema/load, starting weapons/moves, upgrade IDs, region/rarity identity, flavor completeness,
  evolution recipes, enemy behaviors, passives.
- Client: gacha/shards/guarantee, v1->v2 save migration, per-champion upgrades, ability/offer card math,
  boss bar, loadout, stats formatting.
- Server: lobby/start/snapshot, protocol mismatch, 4-player jitter, room capacity, reconnect, deltas/resync,
  per-player meta.

### Browser verification performed

- Main menu sections: PLAY, CHAMPIONS, CHESTS, UPGRADES, SETTINGS.
- 10-pull result panel.
- In-game HUD + party frames with two clients.
- Team kills label vs individual scoreboard.
- Level-up cards and stat-scaled tooltip.
- S does not close level-up.
- H admin panel.
- Fresh save starts with Ahri; Demacia/Lux remains locked and available.

### Balance baseline (D-030, 32:00)

| Seed | Level | Kills | Gold | Chests | Max alive | ms/tick |
|---|---:|---:|---:|---:|---:|---:|
| 101 | 47 | 5,538 | 1,585 | 45 | 85 | 0.0446 |
| 202 | 45 | 5,539 | 1,897 | 60 | 62 | 0.0407 |
| 303 | 45 | 5,535 | 1,775 | 72 | 61 | 0.0414 |

All seeds survive to the 32:00 cutoff. Details and follow-ups are in `docs/BALANCE.md`.

## 9. Milestone status

The detailed history is in `docs/05-ROADMAP.md`; this is the current effective status.

| Milestone | Status | Notes |
|---|---|---|
| D0 design interview | Done | Decisions in `docs/10`; user signed off |
| M0 scaffold | Done | PNPM workspace, strict TS, Biome, Vitest, CI, pixel canvas |
| M1 sim kernel | Done | RNG, stores, registries, pipeline, events, modifiers, spatial hash |
| M2 renderer/movement | Done | 480x270 world, Pixi renderer, worker host, interpolation, controls |
| M3 swarm/weapons/gems | Done | spawn director, behaviors, contact damage, gems/magnet |
| M4 level-up/items | Done | 3+training cards, offers, stat pipeline, loadout limits; human 5-minute checkpoint not recorded |
| M5 weapon library/champions | Done | 8 behavior archetypes, 23 weapons/moves, 8 champions, statuses |
| M6 chests/evolutions/pickups | Done (modified) | D-029 changed chests to saved meta currency; evolutions on level-up |
| M7 full stage run | Done | 30-minute timeline, bosses, final threat, boss rush, results, bot |
| M8 meta/unlocks | Mostly done | Gold, per-champion upgrades, region gacha, achievements; no second stage/stage select |
| M9 content/balance/juice | Done (bot pass) | 8 champions, flavor, feedback/settings, bot balance; human feel pass still open |
| M10 opt-in extras | Partial | Synergy engine + burn/slow reaction done; arcana/curses/shrines/keystones/mutators/dailies not |
| M11 multiplayer server | Done | Protocol, rooms, snapshots/deltas, per-player stats, 4-player stress |
| M12 co-op/deploy | Features done | Shared level, revive, reconnect, lobby, Dockerfile; deployment not done |
| M13 polish | Partial | Gamepad/rebinding/toggles/F3/perf done; replays not |
| D1 playtest re-interview | **Pending** | Needs a human full-run feel/balance pass and user sign-off |

## 10. Known limitations / deferred work

### Current limitations

- **Local save only.** Accounts/cloud sync are deferred; reset is manual.
- **Gacha economy is fast.** 45-72 chests per bot run at 1 chest/pull unlocks champions quickly. Tune chest
  drops, shard amounts, or roster size after a human playtest.
- **All champions are mages.** Tank upgrade data exists, but no tank champion is in the roster yet.
- **Final threat is chase-only.** The boss rush exists, but boss patterns are still simple.
- **No real assets/audio.** Placeholder procedural art/SFX only.
- **UI strings are hardcoded English.** The minimal `t()` helper exists but the D-030 UI is not wired to
  locale files.
- **No second stage/stage select.**
- **D1 human playtest and sign-off are still pending.**
- **No deployment.** Dockerfile exists; hosting credentials are not configured.
- **Party frames use the lobby snapshot.** They are correct at start but do not live-update lobby changes
  mid-run.
- **10-pull guarantee is region-scoped.** If a region's Epic+ champions are already owned, the guarantee
  falls back to shards/gold rather than picking an out-of-region champion.

### Explicitly deferred / not implemented

- Stages/select, daily seeds, leaderboards.
- Arcana/curses/shrines/keystones/mutators extras.
- Union/recipe UI (evolutions are implemented; union isn't).
- Binary network codec, input rewind, interest filtering, rate limiting.
- Replays.
- Accounts and server-side meta sync.
- Real content packs beyond the core + LoL-inspired packs.
- The old separate CharacterSelect class (`packages/client/src/charselect.ts`) is unused and can be
  removed.

## 11. Key files

| Area | File(s) |
|---|---|
| Sim kernel / world / snapshots | `packages/sim/src/world.ts`, `snapshot-delta.ts` |
| Default pipeline/rules | `packages/sim/src/defaults.ts` |
| Separation | `packages/sim/src/systems/separation.ts` |
| Progression/offers/evolutions | `packages/sim/src/systems/progression.ts` |
| Enemy AI/status | `packages/sim/src/systems/enemy.ts`, `behaviors.ts` |
| Synergies | `packages/sim/src/systems/synergies.ts` |
| Content contracts | `packages/sim/src/content-types.ts`, `types.ts` |
| Core content | `packages/content/src/packs/core.ts` |
| Champions/weapons/moves | `packages/content/src/packs/lol.ts` |
| Content validation | `packages/content/src/schema.ts` |
| Meta hub | `packages/client/src/meta-screen.ts` |
| Gacha/save/meta logic | `packages/client/src/meta/meta.ts`, `save/save.ts` |
| DOM HUD | `packages/client/src/hud.ts` |
| Tooltip/card math | `packages/client/src/ability-info.ts` |
| Level-up UI | `packages/client/src/levelup.ts` |
| Admin H panel | `packages/client/src/admin.ts` |
| Client entry/flow | `packages/client/src/main.ts` |
| Network protocol | `packages/shared/src/protocol.ts` |
| Co-op server | `packages/server/src/server.ts` |
| Design log | `docs/10-DESIGN-DECISIONS.md` (D-030) |
| Balance baseline | `docs/BALANCE.md` |
| Session handoff / next steps | `HANDOFF.md` |

## 12. Change history summary

- **D-029:** chests became saved meta currency, evolutions moved to level-ups, training cards became
  guaranteed, XP curve flattened, new stat passives, enemy/pickup tuning.
- **D-030:** enemy separation, DOM HUD, party frames/team kills/scoreboard, level-up redesign and hotkey
  fix, signature moves, per-champion upgrade trees and per-player co-op meta, League-style main menu,
  champion-only gacha with regions/shards/1-pull/10-pull guarantee, starter Ahri, admin H panel, content
  flavor and descriptions.
- **Follow-up:** HUD tooltip positions from the actual hover event (not just pointer movement).
