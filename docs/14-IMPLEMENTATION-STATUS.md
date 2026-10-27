# 14 - Implementation status

Last updated: **2026-10-27**  
Current batch: **D-029 + D-030 + D-031**  
Commits: `299a11b` (D-030 batch), `48e6389` (HUD tooltip fix), and the D-031 work below

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
| PROFILE | Showdown-style name, account/cloud status, lifetime stats, best run |
| PLAY | Selected-champion hero, stage select, PLAY / CO-OP, lifetime strip |
| CHAMPIONS | Searchable/filterable 173-champion collection with pagination, rarity/class/region filters, focus, shard progress, unlock/select |
| UPGRADES | The selected champion's own permanent upgrade tree, bought with gold |
| CHESTS | Fourteen region-themed gacha cards with odds, focus, 1-pull/10-pull, results |
| ACHIEVEMENTS | Four run milestones |
| SETTINGS | Sound, screen shake, damage numbers, movement rebinds, Reset Save |

The old separate character-select popup is no longer used. PLAY and CO-OP use the champion selected on
the CHAMPIONS page; co-op uses the profile name rather than a per-session name prompt.

### Run

- Move-only controls; all weapons and moves auto-cast.
- Default controls: **WASD / arrows / gamepad**, **Esc** pause, **Tab** scoreboard, **F3** diagnostics.
- Level-up: **1-4** pick, **R** reroll, **X** skip, **B** banish. **S is movement and never closes the
  offer.** Esc does not open pause over an open offer.
- Champion inventory is **6 weapons + 4 moves + 6 passives**.
- Every champion starts with a class weapon and a class placeholder move; the original eight have their
  unique signature moves. Unique champion moves are the deferred moves pass.
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
- Mid-run reconnect is supported for 60 s; the lobby has BACK TO MENU and uses the profile name.

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
| Champions | 173 |
| Weapons (total) | 39 |
| Standard weapons (non-move) | 25 |
| Evolved weapons | 4 |
| Signature/class moves | 14 (8 unique + 6 class placeholders) |
| Passives | 18 |
| Enemies | 19 |
| Minions / elites / bosses / final threats | 10 / 3 / 4 / 2 |
| Meta power-ups | 35 |
| Synergies | 5 |
| Regions | 14 |
| Stages | 2 |
| Achievements | 4 |

### Champions

The roster is generated from the **Riot Data Dragon 16.21.1** roster and enriched with curated primary
regions, provisional rarities, class, starting weapon, placeholder class move, base stats/growth, and a
class upgrade tree. Current class counts:

| Class | Count |
|---|---:|
| Mage | 35 |
| Tank | 24 |
| Fighter | 50 |
| Assassin | 17 |
| Marksman | 29 |
| Support | 18 |

The existing eight champions keep their unique starting weapons/moves and curated trees:

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

New champions use a **class weapon** and a **class placeholder move** until the champion-specific moves
pass. Rarities are provisional by design; review them before a public launch. Region pools:
Demacia 15, Noxus 20, Ionia 23, Runeterra 10, Bandle City 6, Shurima 14, Freljord 15, Mount Targon 8,
Void 9, Zaun 14, Piltover 10, Bilgewater 11, Shadow Isles 11, Ixtal 7.

### Weapons and evolutions

- 25 standard weapons (21 source + 4 evolved) + 14 moves = 39 weapon definitions.
- New class weapon pools: Bulwark Sweep/Iron Aura (Tank), Cleaver/War Boomerang (Fighter),
  Shadow Daggers/Venom Dart (Assassin), Longbow/Piercing Arrow (Marksman), Aegis Aura/Radiant Field
  (Support). Mages use the existing mage weapon pool.
- Class placeholder moves: Arcane Bolt, Shockwave, Cleaving Strike, Shadow Strike, Piercing Shot,
  Renewal Pulse. They are shared by class until unique champion moves are authored.
- Evolutions:
  - Light Binding + Might -> Final Spark
  - Orb of Deception + Flow State (haste) -> Spirit Rush
  - Overload + Flow State (haste) -> Desperate Power
  - Conflagration + Far-Sight Lens (area) -> Pyroclasm
- The eight existing signature moves are also learnable by other champions through level-ups.

### Passives (18)

Might, Wanderer's Boots, Heart of the Rift, Gathering Sigil, Far-Sight Lens, Flow State, Runic Plating,
Lucky Charm, Scholar's Tome, Renewal Bloom, Coin Devotion, Warding Sigil, Aether Lens, Lasting Hex,
Piercing Bolt, Kinetic Seal, Crimson Pact, Titan's Grip.

### Enemies (19)

- Minions: Rift Crawler, Dartling, Weft Wisp, Ash Mote, Ironhide, Hex Weaver, Bloatspore, Spark Charger,
  Noxian Warhound, Blood Acolyte.
- Elites: Rift Brute, Verdant Warden, Siege Ogre.
- Bosses: Herald of Ash, Cinder Wyrm, Void Baron, Crimson Herald.
- Final threats: The Hollow Star, The Dread Conqueror.

Enemy behaviors: chase, weaver, charge, ranged; bloater explosion on death; slow/burn statuses; weighted
minute-gated spawns; placeholder tint/radius. Noxus adds the Warhound, Blood Acolyte, Siege Ogre,
Crimson Herald, and Dread Conqueror.

### Stages (2)

- **The Riftfield** - original arena, Runeterra, default palette, original 14 enemies and Hollow Star.
- **Noxian Warfront** - Noxus, red/iron palette, Warhound/Blood Acolyte/Siege Ogre/Crimson Herald pool,
  Dread Conqueror final threat, faster spawn/boss cadence, +HP scaling, and a wider pattern rotation.
- Both stages are selectable now; stage gating/progression is deferred.
- Stage selection is saved and sent by the co-op host; snapshots carry the stage id/name so every client
  renders the correct palette and HUD label.

### Meta power-ups (35)

Eight basics (Raw Power, Vitality, Swiftness, Focused Casting, Far Reach, Attraction, Plating, Fortune),
mage entries (Arcane Flow, Spell Velocity, Persistence), tank entries (Fortitude, Bulwark, Regeneration,
Aegis), fighter entries (Battle Fury, Bloodlust, Second Wind), assassin entries (Deadly Precision,
Shadow Step, Hunter's Instinct), marksman entries (Steady Aim, Piercing Rounds, Rapid Fire), support
entries (Benevolence, Aura Mastery, Lasting Light), and one signature upgrade per existing champion
(Radiance, Pyre, Foxfire, Runeweave, Transcendence, Tyranny, Kindling, Ascension).

Each existing champion has a curated tree; new champions build from common + class entries.

### Synergies (5)

Ignite (fire count), Arcane Affinity (arcane count), Light Weaver (light count), Elementalist
(fire + arcane combo), and Battle Rhythm (physical count). Burn + slow also produces a reaction burst.

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

### Save v5

`packages/client/src/save/save.ts`, localStorage key `rift-survivors-save`, mirrored to the server
account save when signed in.

```ts
interface SaveData {
  version: 5;
  profileName: string;             // Showdown-style local/account name
  gold: number;
  selectedCharacter: string;
  championUpgrades: Record<string, Record<string, number>>;
  championShards: Record<string, number>;
  championFocus: Record<string, string>;  // region -> focused champion
  selectedStage: string;
  unlockedCharacters: string[];
  chests: number;
  achievements: string[];
  totalKills: number;
  bestTimeSec: number;
  runsPlayed: number;
  bestRun: { timeSec; kills; gold; characterId; stageId };
  settings: { volume; shake; damageNumbers; keybinds };
}
```

Migrations:

- v1 global `purchases` are moved onto the selected/first champion's tree.
- `selectedCharacter` is initialized from the old selection or first unlocked champion.
- v3 adds per-region `championFocus`.
- v4 adds `selectedStage`.
- v5 adds `profileName`, `runsPlayed`, and `bestRun`.
- `purchases` is removed.

### Starter and unlocking

- The free starter is **Ahri** (content flag `starter: true`), Common.
- Everything else is gacha/shard-only. The old dev unlock-all was removed.
- Fresh save: 1/173 champions. Old dev saves with all champions should use Reset Save.

### Region gacha

Fourteen region chests: Demacia, Noxus, Ionia, Shurima, Bandle City, Runeterra, Freljord, Piltover, Zaun,
Bilgewater, Shadow Isles, Mount Targon, Ixtal, Void.

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
- **Focus:** the player can select a focus champion per region; champion/shard outcomes have a 50%
  preference for that locked champion. The focus is visible in Champions/Chests and saved in the account
  save.

### Per-champion upgrades

- The Upgrades page always edits `save.selectedCharacter`.
- The selected champion's content-defined `upgradeIds` control the tree.
- Existing eight champions have curated trees; new champions use five common entries + their class
  entries (8-9 entries total).
- Cost/rank/refund are per champion; old global purchases do not carry to other champions.
- `computeMetaBonuses` filters by the champion's tree and is used for solo runs and co-op messages.
- Class trees: Mage (haste/area/duration), Tank (health/armor/regen/resist), Fighter (might/lifesteal/
  regen), Assassin (might/speed/haste), Marksman (haste/projectile/pierce), Support (growth/area/duration).

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

### Profile and accounts

- New **PROFILE** section in the main hub:
  - Showdown-style nickname (3-20 characters, letters/numbers/underscore/hyphen, reserved names blocked)
  - lifetime stats: best survival, total kills, runs played, champions owned, best-run kills/gold,
    chests, achievements
  - best run: time, kills, gold, champion, stage
  - selected champion/stage/gold strip
- Local profile works offline. With an account, the avatar/name appear in the nav/topbar and the same
  nickname is used for co-op.
- Server-side accounts:
  - Discord OAuth2 routes + optional dev login (`RIFT_DEV_AUTH=1`)
  - file-backed accounts (`data/accounts.json` by default)
  - 30-day in-memory sessions
  - `GET /api/me`, `PUT /api/save`, `PUT /api/nickname`, `POST /api/logout`
  - cloud save sync after each local save when signed in
  - unique case-insensitive nicknames enforced server-side
- Full hosting/account details are in [`15-HOSTING-AND-ACCOUNTS.md`](15-HOSTING-AND-ACCOUNTS.md).
- Discord friends/invite embeds are not built yet; co-op still joins by room code.

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

- Co-op lobby (host/join, player list, room code, profile identity)
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
  - **90 sim** tests
  - **15 content** tests (+2 balance tests skipped by default)
  - **23 client** tests
  - **14 server** tests
  - total **142 passing, 2 skipped**
- Client and server production builds: pass.

Coverage highlights:

- Sim: RNG, stores, modifiers, spatial hash, stats, co-op, per-player meta, separation, moves, evolutions,
  stages, drops, endgame, progression stress, determinism, bot/fitness, perf.
- Content: schema/load, full 173 roster, class/starting weapon/move resolution, upgrade IDs, region/rarity
  identity, stage enemy/final pools, flavor completeness, evolution recipes, enemy behaviors, passives.
- Client: gacha/shards/focus/guarantee, v1->v5 save migration, per-champion upgrades, best-run/profile,
  ability/offer card math, boss bar, loadout, stats formatting.
- Server: lobby/start/snapshot, protocol mismatch, 4-player jitter, room capacity, reconnect, deltas/resync,
  per-player meta, account dev login/session/save/nickname.

### Browser verification performed

- Main menu sections: PROFILE, PLAY, CHAMPIONS, CHESTS, UPGRADES, SETTINGS.
- 173-champion paginated collection, class/region/search controls, focus buttons.
- Noxian Warfront stage selection and HUD stage label.
- 10-pull result panel.
- In-game HUD + party frames with two clients.
- Team kills label vs individual scoreboard.
- Level-up cards and stat-scaled tooltip.
- S does not close level-up.
- H admin panel.
- Fresh save starts with Ahri; Demacia/Lux remains locked and available.
- Profile page + dev cloud login + server save account.

### Balance baseline (D-031, 32:00)

| Seed | Level | Kills | Gold | Chests | Max alive | ms/tick |
|---|---:|---:|---:|---:|---:|---:|
| 101 | 47 | 5,539 | 1,845 | 66 | 87 | 0.0448 |
| 202 | 43 | 5,538 | 1,922 | 76 | 66 | 0.0439 |
| 303 | 43 | 5,536 | 1,988 | 58 | 72 | 0.0418 |

All seeds survive to the 32:00 cutoff. The bot uses Riftfield; Noxus remains a human/balance follow-up.
Details and follow-ups are in `docs/BALANCE.md`.

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
| M5 weapon library/champions | Done | 39 weapons/moves, 6 classes, 173 champions, statuses; unique moves deferred |
| M6 chests/evolutions/pickups | Done (modified) | D-029 changed chests to saved meta currency; evolutions on level-up |
| M7 full stage run | Done | 30-minute timeline, bosses, final threat, boss rush, results, bot; Noxus added |
| M8 meta/unlocks | Mostly done | Gold, per-champion upgrades, region gacha/focus, achievements, stage select; account/cloud save added |
| M9 content/balance/juice | Done (bot pass) | 173 champions, class kits/placeholder moves, flavor, feedback/settings, bot balance; human feel pass still open |
| M10 opt-in extras | Partial | Synergy engine + burn/slow reaction done; arcana/curses/shrines/keystones/mutators/dailies not |
| M11 multiplayer server | Done | Protocol, rooms, snapshots/deltas, per-player stats, 4-player stress |
| M12 co-op/deploy | Features done | Shared level, revive, reconnect, lobby, Dockerfile; deployment not done |
| M13 polish | Partial | Gamepad/rebinding/toggles/F3/perf done; replays not |
| D1 playtest re-interview | **Pending** | Needs a human full-run feel/balance pass and user sign-off |

## 10. Known limitations / deferred work

### Current limitations

- **Discord is not deployed.** The OAuth routes and env plumbing exist; dev login is the working local
  account path until Discord credentials are configured.
- **Accounts are friends-server scale.** JSON file + in-memory sessions; no rate limiting, session
  persistence, backup automation, or co-op server-side save validation yet.
- **No friends list or Discord invite embeds.** Co-op still joins by room code; account identity is used
  for the lobby name.
- **Save conflicts are simple.** If a server save exists it wins on login; there is no merge UI.
- **Gacha economy is fast.** 58-76 chests per bot run at 1 chest/pull; tune chest drops/shard amounts or
  use the larger roster/focus system after a human playtest.
- **Rarities/regions are provisional.** They are generated/curated data intended for a review pass.
- **Unique champion moves are deferred.** New champions use class weapons and placeholder class moves.
- **All stages are available.** No formal stage unlock/progression.
- **Final threats are still mostly chase/charge patterns.** Noxus adds a new final threat, but boss
  mechanics remain simple.
- **No real assets/audio.** Placeholder procedural art/SFX only.
- **UI strings are hardcoded English.** The minimal `t()` helper exists but the UI is not wired to locale
  files.
- **D1 human playtest and sign-off are still pending.**
- **No deployment.** Dockerfile exists; Discord credentials/domain/database are not configured. Cloudflare
  requires a server port or Worker port; see docs/15.
- **Party frames use the lobby snapshot.** They do not live-update lobby changes mid-run.
- **10-pull guarantee is region-scoped.** If a region's Epic+ champions are already owned, the guarantee
  falls back to shards/gold.

### Explicitly deferred / not implemented

- Unique champion moves/kits, union/recipe UI, stage gating/progression.
- Daily seeds, leaderboards, friends list, Discord invite embeds, chat.
- Arcana/curses/shrines/keystones/mutators extras.
- Binary network codec, input rewind, interest filtering, rate limiting, replays.
- Full server-authoritative saves/meta for co-op (the account store exists; game-server validation is
  still client-trusted).
- Cloudflare Workers/Durable Objects port and deployment.
- Real content packs beyond the core + LoL-inspired packs.
- The old CharacterSelect/NameScreen classes are unused and can be removed.

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
| Generated full roster | `packages/content/src/packs/roster.ts` |
| Class presets/trees | `packages/content/src/champions/classes.ts` |
| Roster generator | `packages/content/scripts/generate-roster.mjs` |
| Content validation | `packages/content/src/schema.ts` |
| Meta hub | `packages/client/src/meta-screen.ts` |
| Profile/nickname | `packages/client/src/profile.ts`, `packages/shared/src/nickname.ts` |
| Account client | `packages/client/src/account.ts` |
| Gacha/save/meta logic | `packages/client/src/meta/meta.ts`, `save/save.ts` |
| DOM HUD | `packages/client/src/hud.ts` |
| Tooltip/card math | `packages/client/src/ability-info.ts` |
| Level-up UI | `packages/client/src/levelup.ts` |
| Admin H panel | `packages/client/src/admin.ts` |
| Client entry/flow | `packages/client/src/main.ts` |
| Network protocol | `packages/shared/src/protocol.ts` |
| Accounts/auth | `packages/server/src/accounts.ts`, `auth.ts` |
| Co-op server | `packages/server/src/server.ts` |
| Design log | `docs/10-DESIGN-DECISIONS.md` (D-031) |
| Hosting/accounts guide | `docs/15-HOSTING-AND-ACCOUNTS.md` |
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
- **D-031:** full 173-champion roster, six classes with class weapons/trees/placeholder moves, region
  focus, Noxian Warfront second stage + stage select, save v5 profile/best-run data, server-side accounts
  with Discord OAuth/dev login/cloud save, profile UI. Unique moves and friends/invite integration remain
  future work.
