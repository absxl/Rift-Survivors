# 10 — Design Decisions (source of truth)

Maintained by the agent during the design interview (`docs/09-DESIGN-INTERVIEW.md`) and afterwards.
**If this file conflicts with `03-GAME-DESIGN.md` or `13-CLASSIC-FEEL-SPEC.md`, this file wins.** Do not
implement mechanics that are not recorded here or in the confirmed baseline; ask the user first.

Status values: `decided` (user said it) · `agent-proposed` (needs user confirmation in D0) ·
`superseded by D-xxx`

## Interview progress
- [x] R0 Baseline & references
- [x] R1 Run shape
- [x] R2 Weapons & level-up
- [x] R3 Items, chests, evolutions
- [x] R4 Characters (League skin)
- [x] R5 Enemies, stages, bosses
- [x] R6 Synergies & extras
- [x] R7 Co-op
- [x] R8 Meta progression
- [x] R9 Presentation & scope
- [x] Final sign-off by user (2026-10-22)

## Pitch (user's words)
"A survivor game with League of Legends characters for me and my friends to play, looking and feeling like
the original Vampire Survivors, with infrastructure ready for radical changes later."

## Reference games
| Game | Borrow |
|---|---|
| 20 Minutes Till Dawn | **Cross-synergies** between weapons ↔ moves ↔ items; moves unlock by defeating bosses (up to 4) |
| Risk of Rain 2 | Stacking items and escalating scaling |
| Balatro | Synergy discovery and satisfying combo payoff |
| Halls of Torment | Readable horde + loot/stats feel |
| Brotato | Tight build focus / wave-shop thinking |

## Decisions

### Baseline (classic defaults — confirmed or modified in D0)
| ID | Decision | Status |
|---|---|---|
| D-001 | Look & feel = original Vampire Survivors structure | decided |
| D-002 | League of Legends as a skin (content-only) | decided |
| D-003 | Move-only controls; weapons auto-fire; no dash/manual aiming (Moves are auto-cast, see D-016) | decided |
| D-004 | Run ≈30 min, per-stage timeline, final threat | modified by D-017 |
| D-005 | 6 weapon + 6 passive slots | superseded by D-016 |
| D-006 | Level-up: pause, 3 cards, reroll/skip/banish | decided |
| D-007 | Chests: elite/boss chests, evolve maxed weapon + passive | modified by D-018/D-019 |
| D-008 | Floor pickups: heal, vacuum, nuke, freeze, gold, XP burst | decided |
| D-009 | Enemies mostly chasers in swarms; patterns stream/swarm/ring/wall; recycling | decided |
| D-010 | Characters = starting weapon + stats + growth, no manual skills | modified by D-020 |
| D-011 | Meta: persistent gold, refundable permanent-upgrade shop, achievements | decided (extended D-022) |
| D-012 | Co-op 1–4 online, per-player builds | modified by D-023/D-024 |
| D-013 | Pixel-perfect 480×270 internal res, integer scaling, nearest filtering | decided |
| D-014 | Synergy layer = evolutions only | superseded by D-019 |
| D-015 | Active ruleset id: `classic` | decided |

### The rework (confirmed deviations)

### D-016 · Loadout: Weapons + Items + Moves
- Round: R2 · Status: decided
- Decision: **6 Weapons + 6 Items + 4 Moves**. All three categories max level **5**.
- Moves are **auto-cast on cooldown** (no manual buttons), ability-flavored effects.
- Consequences: new `MoveDef` content category + moves store + auto-cast behavior; level-up pool includes
  weapons/items and (rarely) moves.

### D-017 · End game: final threat → boss rush
- Round: R1 · Status: decided
- Decision: Run ends at ≈30:00 with a final threat. **Defeating the final threat switches the run into a
  boss-rush** — bosses keep spawning instead of normal minions.
- Consequences: spawn director needs a "post-final-threat" script; boss scaling rules TBD in D1/content pass.

### D-018 · Chests as loot
- Round: R3 · Status: decided
- Decision: Chests stay, granting upgrades/items/moves by luck (1/3/5, luck-weighted). Not fixed-evolve-only.
- Consequences: generic Offer UI; chest contents data-driven.

### D-019 · Synergy engine (replaces evolutions as sole depth)
- Round: R3/R6 · Status: decided
- Decision: Cross-synergies across **weapons ↔ moves ↔ items** via three families:
  - **pair combos** (20MTD-style: specific ability + matching item transforms/boosts it)
  - **stacking/scaling** (RoR2-style duplicate/stat stacking)
  - **discovery combos** (Balatro-style hidden payoffs)
  - plus **element/status reactions** (e.g. burn + slow → burst).
  Classic **evolutions kept** alongside. Readability = **explicit tooltips + recipe screen**.
  Build ceiling = **strong** (controlled, not absurd).
- Consequences: implement the effects engine + `SynergyDef`/`ReactionDef` (`docs/11`) + modifier stack.

### D-020 · Champions: signature Move + weapon
- Round: R4 · Status: decided
- Decision: **7+ champions** at launch. Each starts with a **signature Move** (their ability) + a starting
  weapon + stats + growth. No manual skills.
- Consequences: `CharacterDef` gains `startingMove`.

### D-021 · Unions
- Round: R3 · Status: decided
- Decision: **Keep the classic union mechanic** — two specific maxed weapons/moves merge into one slot.
- Consequences: union data + resolution logic (later milestone M6).

### D-022 · Unlock meta: gacha (region chests) + gold shop
- Round: R8 · Status: decided
- Decision: Champions unlocked via **gacha**: good runs (performance: time/kills/bosses) award chests on the
  results screen; each chest pulls **1 champion from a region** (region-themed chests). Classic gold +
  refundable permanent-upgrade shop **also kept**. Achievements unlock + brag. Daily seed = shared seed +
  friend leaderboard.
- Consequences: economy system + content (`lol-pack` region tags) + meta/save migration; gacha is meta not engine.

### D-023 · Co-op level-up: shared level
- Round: R7 · Status: decided
- Decision: In co-op, **all players level up together** (shared level). Own camera each; scale enemies with
  player count; share loot; each player keeps their own build.
- Consequences: shared XP/level progression in co-op ruleset; network `Offer` flow (`docs/07`).

### D-024 · Co-op extras kept
- Round: R7 · Status: decided
- Decision: Marker revive (walk over downed ally). No friendly fire. Drop-in/out deferred.

### D-025 · XP curve & pause
- Round: R2 · Status: decided
- Decision: XP curve = **slow start, late ramp**. Solo level-up = **full pause** (classic).

### D-026 · Extras (opt-in families — all selected)
- Round: R6 · Status: decided
- Decision: Build the extras engine for: arcana-like run modifiers, curses & bargains, shrines & events,
  keystone legendaries, per-champion quirks, daily seeds. Implemented via effects/modifiers/rule overrides
  (`docs/11`).

### D-027 · Presentation
- Round: R9 · Status: decided
- Decision: Procedural pixel-art placeholders first (real art → `assets/local/` later). 480×270 internal
  resolution, integer scale. Chiptune music + 8-bit SFX (self-generated/CC0). English only, i18n-ready.

### D-028 · Full-screen scaling (deviation from integer rule)
- Round: R9 follow-up · Date: 2026-10-23 · Status: decided
- Decision: The canvas scales to **fill the window with a fractional factor** (nearest filtering kept), rather
  than the kit's "integer scale + letterbox, never fractional" rule (docs/02, 13 §14).
- Consequences: no black bars on typical 16:9 windows; pixels can be slightly uneven on non-integer scales.
  Revert to integer scale by flooring the scale factor if crispness is ever preferred over fill.

### D-029 · Chests as shop currency, deeper level stats, gentler XP
- Date: 2026-10-26 · Status: decided (user)
- Decision:
  - **In-run chest pickups are saved, not opened mid-run.** Each pickup increments the player's run chest
    count; the results screen adds them to `save.chests`, and they are opened from the meta shop.
  - **Evolutions move to the level-up pool** (maxed weapon + required passive) because chests no longer open
    card offers in a run.
  - **Loot:** minions 5% gold + 1% chest; elites 100% gold + 50% chest; bosses/final threat guaranteed chest
    + luck-scaled gold. Luck scales the chance-based drops and the elite/boss gold amount.
  - **Every level-up has 3 item cards + 1 guaranteed repeatable Training card** (direct stat gain, no item
    slot). Training can stack.
  - **New stat passives:** Learning (growth), Renewal (regen), Greed, Warding (resist), Velocity
    (projectileSpeed), Persistence (duration), Piercing, Impact (knockback), Vampirism (lifesteal), Titan
    (maxHp + armor). Heart already covers max HP.
  - **XP curve:** first 10 costs unchanged; 11–20 flattened; after 20 linear **+7/level** (was ×1.2).
    Target ≈ level 40 by 30:00.
- Consequences: in-run power comes from levels/training; chests fund the meta gacha; evolutions are no
  longer chest-gated; the gold/chest economy is much richer and needs a playtest/balance pass (D-029 tuning).

### D-030 � DOM HUD, region gacha shards, per-champion trees, signature moves
- Date: 2026-10-26 � Status: decided (user: "build and implement all the changes")
- Decision:
  - **DOM HUD** replaces the Pixi HUD: top bar (time, team kills, gold), party frames top-left
    (lobby name + champion color + HP), boss bar, compact hotbar, hover tooltips, Tab scoreboard
    (individual kills/stats), and a redesigned level-up overlay with flavor + derived stat deltas.
  - **Level-up hotkeys:** 1-4 pick, R reroll, X skip, B banish. `S` is movement only and never
    dismisses the offer; Esc does not open pause over an active offer.
  - **Enemy bodies:** a deterministic separation system after enemy AI pushes overlapping enemies
    apart. Mass is radius squared, so bosses barely move and minions no longer stack.
  - **Minion bodies** are soft-capped per tick, so large swarms can still surround and pressure the
    player.
  - **Content flavor:** `WeaponDef`, `PassiveDef`, `CharacterDef` and boss `EnemyDef` carry display
    names/descriptions (original placeholder flavor). Mechanical values stay derived from the same
    base/level data as the sim, so descriptions cannot drift.
  - **Signature moves:** each champion has a unique `startingMove`. Moves are content weapons with
    `isMove: true` and use the existing auto-cast behavior pipeline. Any champion can learn other
    champions' moves from level-up cards. Separate pools: **6 weapons + 4 moves + 6 passives**.
  - **Per-champion upgrades:** the old global shop becomes a per-champion tree. Common upgrades plus
    class-flavored ones (mages get Focus + Arcane Flow haste, tanks get health/armor/regen/resist
    entries) and a signature upgrade per champion. `selectedCharacter` chooses whose tree is shown.
    Co-op sends each player's tree bonuses separately; the sim applies them per player.
  - **Main menu hub:** League-client-like shell with openable **PLAY / CHAMPIONS / UPGRADES / CHESTS /
    ACHIEVEMENTS / SETTINGS** sections. Play and co-op use the currently selected champion; the old
    separate character-select popup is gone.
  - **Gacha only:** champions unlock only through gacha (the starter is free; Ahri is the content-
    flagged starter so every region still has a gacha target); no dev unlock-all. Existing dev saves
    can be reset from Settings or the H admin panel.
  - **Regions/rarities:** Demacia (Lux, Epic), Noxus (Brand Epic, Annie Rare), Ionia (Ahri Common,
    Syndra Epic), Shurima (Xerath Epic), Bandle City (Veigar Epic), Runeterra (Ryze Legendary).
  - **Chests:** 1 chest = 1 pull; 10 chests = 10 pulls with a guaranteed Epic+ champion. Per-pull odds:
    8% full champion, 72% champion shards, 20% gold. Shard requirements: Common 6, Rare 8, Epic 12,
    Legendary 20. The player spends champion-specific shards manually on the champion they want first.
    Full/duplicate-fallback gold is 75. All state is local (`localStorage`) for now; accounts later.
  - **Admin panel:** H toggles a local dev panel (grant gold/chests/shards, unlock selected/all, max
    selected/all trees, reset save). The panel is saved-locally and off the normal UI path.
- Consequences: save schema v2 (`selectedCharacter`, `championUpgrades`, `championShards`) with v1
  global purchases migrated to the selected/first champion; protocol v3 carries per-player meta
  bonuses. The bot baseline changed to include moves (see BALANCE). Gacha economy is intentionally
  fast with the current chest drops and will be tuned after human playtests.

### D-031 - Full roster/classes, Noxian stage, profile and cloud accounts
- Date: 2026-10-27 - Status: decided (user approved the four-track order)
- Decision:
  - **Six broad classes:** Mage, Tank, Fighter, Assassin, Marksman, Support. Class weapon pools,
    placeholder class moves, class upgrade entries, and per-champion tree composition are content-driven.
  - **Full roster:** 173 champions from the Riot Data Dragon roster (16.21.1) with curated primary regions,
    provisional rarities, class, class starting weapon, placeholder class move, base stats/growth, and a
    class upgrade tree. Unique moves/kits are explicitly deferred to the later moves pass.
  - **Regions:** all canonical regions used by the roster (14 pools), keeping the current eight curated
    assignments and filling the rest from the generated roster table. Rarities are provisional and meant
    for a review pass.
  - **Focus champion (superseded by D-035):** focus was originally a per-region 50% pull preference.
    It has been removed; chest outcomes now use the rarity-weighted pool only.
  - **Second stage:** **Noxian Warfront** with its own enemy pool (Warhound, Blood Acolyte, Siege Ogre,
    Crimson Herald, Dread Conqueror), faster spawn rules, and a red/iron presentation palette. Both stages
    are currently selectable; a formal stage unlock/progression pass comes later.
  - **Stage select:** selected in PLAY, persisted as `selectedStage`, sent by the co-op host, carried in
    snapshots, and rendered with a stage name in the HUD.
  - **Profile:** Showdown-style local nickname, lifetime stats, runs played, best run (time/kills/gold/
    champion/stage), selected champion/stage, and account panel. Nickname rules: 3-20 characters,
    letters/numbers/underscore/hyphen, case-insensitive uniqueness, reserved names blocked.
  - **Accounts:** server-side JSON-backed account/save storage (friends-server scale), sessions, Discord
    OAuth routes, dev-only login for local testing, cloud-save sync on every save, and account nickname
    used as the in-game/co-op identity. Discord deployment is deferred; dev auth is the local test path.
  - **No friends/invite UI yet.** Co-op still joins by room code; Discord social/invite integration is a
    later deployment feature.
- Consequences: save schema **v5** adds profileName, runsPlayed, bestRun and selectedStage; content pack
  gains optional `stages`; stage snapshots carry stage id/name; server gains account HTTP routes and
  `.env` configuration. The full roster uses class/placeholder kits until the moves pass. Cloudflare
  hosting is not done; see `docs/15-HOSTING-AND-ACCOUNTS.md` for the Pages/Workers/Tunnel options.

### D-032 - Procedural terrain, minion personalities, Levitate
- Date: 2026-10-27 - Status: decided (user); the visual reskin from the prior attempt was scrapped, so
  the League-client presentation stays.
- Decision:
  - **Terrain:** both stages generate deterministic 32 px tile chunks (16x16 tiles) with walls, water
    or lava, and a safe spawn clearing. The generator is shared by sim and client; snapshots carry only
    the terrain seed. Riftfield uses water (slow); Noxus uses lava (slow + damage). The client draws
    walls, liquids, and a seamless stage-tinted floor from the same terrain field.
  - **Collision:** players and ground enemies resolve against solid walls; player and enemy projectiles
    stop on walls. Ground enemies route around obstacles with deterministic per-player BFS flow fields
    rebuilt every 12 ticks. Bosses, final threats, and units tagged `levitate` ignore terrain.
  - **Minion personalities:** `chase`, `runner` (predictive lead), `tank`, `weaver`, `charge`, `ranged`,
    `fan` (spread volley), `healer` (heals nearby wounded minions), `shielder` (grants absorb shields),
    `summoner` (calls minions), and `bomber` (arms a fuse and explodes). Shields absorb weapon/projectile
    damage; heal/shield pulses emit client effects. Cinder Cultist is the Noxian `fan` minion.
  - **Levitate tag:** characters with this content tag ignore terrain collision, liquid slows, and
    liquid damage, and can cross water/lava/walls. Eleven floating champions currently carry it (for
    example Syndra, Anivia, Kayle, Morgana, Aurelion Sol, and Yuumi); the collection and PLAY screens
    show a `LEVITATE` chip.
  - **Spawning:** ground spawns search for a nearby free floor tile; lava is avoided by pathfinding and
    safe-spawn placement. Terrain settings, thresholds, palettes, and liquid behaviour are content data.
- Consequences: `StageDef` gained optional `terrain`, `WorldSnapshot` gained `terrainSeed`,
  and the snapshot delta carries it. Tests cover determinism, wall collision, water slow, levitate,
  support behaviours, and the fan volley. The balance bot is now wall-aware; because terrain can trap a
  non-human bot, the benchmark baseline has a wider spread than the flat-field D-031 numbers. Props,
  destructible cover, and terrain-aware player auto-steering are not included yet.

### D-033 - Source-backed champion dossiers, multi-region chests, golden crests
- Date: 2026-10-29 - Status: decided (user approved full dossier, current+origin region policy, original
  summaries, and committing the official region crests).
- Decision:
  - **Profile audit:** every champion gets a source-backed `ChampionProfile` with official title, official
    League role(s), difficulty, origin/residence/faction/species, a short original summary, and explicit
    official + wiki source URLs. Data is fetched once by a checked-in audit script; the game never fetches
    at runtime. Official pages are used for title/role/difficulty/facts; wiki Universe pages are used for
    canonical region, origin, residence, faction, and species.
  - **Region corrections:** known primary-region errors are corrected from the wiki (e.g. Alistar and Nami
    to Runeterra, Corki to Bandle City, Senna to Runeterra, Skarner to Ixtal, Tahm Kench to Runeterra, and
    Brand to Runeterra/Freljord). A primary region is kept as the first association for theme identity.
  - **Multi-region:** champions use all chest-eligible current regions plus documented origin regions
    (for example Riven Noxus/Ionia, Samira Noxus/Shurima, Kayn Ionia/Noxus, Aatrox Shurima/Runeterra, and
    Brand Runeterra/Freljord). Lost places that are not one of the 14 chest regions (Camavor, Blessed
    Isles, Icathia) remain visible as origin lore but do not create extra chests. Multi-region champions
    appear in every associated region pool; shards and unlocks remain global. Focus was removed by
    D-035.
  - **Dossier UI:** clicking a champion opens a full dossier with a blended region crest, title, region
    chips, identity facts, original summary, verified source links, Rift Survivors kit, rarity, shards,
    and select/unlock actions. Collection cards, PLAY hero, sidebar, upgrades header, and chest cards use
    the same theme.
  - **Visual language:** official golden Universe region crests are committed under the explicit D-033
    exception (13 crests; Runeterra gets an original golden world-rune). Crests are split/overlapped for
    multi-region identities. No champion splash art or other Riot assets are used.
  - **Reactive styling:** cards use pointer-tracked region light, hover lift, crest watermark, and
    multi-region badges; theme transitions and reduced-motion fallbacks are included.
- Consequences: `CharacterDef` gained optional `profile`; content gained 173 audited records and an
  audit script; client region helpers and tests gained multi-region unions/pool membership/theme tests.
  Save schema is unchanged. The official crests are copyrighted and must be replaced before public
  redistribution; sources and the private fan-project exception are recorded in `ASSETS.md` and docs/06.

## Active ruleset(s)
`classic` - configured with the loadout (6W+6I+4M), move auto-cast, cross-synergies, boss-rush end.

## Idea parking lot
- Drop-in/out co-op, reconnect (deferred to M12).
- Boss-rush scaling specifics (resolve in D1 content pass).
- Exact champion roster / region definitions (resolve in content pass).

## Open questions (resolve later)
- Do co-op shared level-ups also share the card *choices*, or does each player pick their own card at the
  shared level-up? (resolve at M12)
- Gacha drop rates / pity mechanics. (resolve at M8)

### D-034 - Coherent terrain, breakable bushes, run chests, and the key economy
- Date: 2026-10-29 - Status: decided (user)
- Decision:
  - Terrain keeps the same stage palette and collision model but gains deterministic cellular cleanup,
    neighbor-aware autotiling, and isolated-tile removal so walls and liquids form readable patches.
  - Bushes are deterministic, streamed, non-blocking destructible props. Weapon projectiles, sweeps,
    auras, and ground zones can break them; breaking one always drops a healing pickup.
  - Spawnable run chests appear on a timed cadence near the party. A player must stay within the chest
    hold radius for three seconds; leaving, dying, or being downed cancels progress. Opening grants
    party XP, personal gold, and a chance at a key.
  - Elites have a luck-scaled key drop and bosses guarantee a key. Minions no longer drop chests.
  - The meta currency formerly called `chests` is now `keys`: one key opens one region chest, ten keys
    open a ten-pull. Save v6 migrates old chest balances 1:1.
  - The CHESTS page is a compact key wallet plus region cards with hidden pool details. Opening uses a
    full-screen, procedural chest reveal with rarity-colored cards, skip/reveal-all, and reduced-motion
    fallbacks. No new Riot art is introduced.
  - All directional/placed player weapons share a nearest-enemy auto-aim contract; player-centered auras
    and orbits remain centered on the caster.
  - Quitting from the pause menu is a loss: the run is settled immediately, including stats, gold, keys,
    and lifetime counters.
  - Achievements now cover combat, survival, loot, exploration, and collection goals, with gold/key
    rewards and descriptions.
- Consequences: save schema v6; new `bush` and `chest` stores; new chest/bush/key events; chest page
  no longer shows a static pull-results grid. Balance still needs a human playtest.

### D-035 - Frost, chest utilities, enemy kits, Darkin chest, and lore identity
- Date: 2026-10-29 - Status: decided (user)
- Decision:
  - The global freeze pickup becomes **Frost**: a strong movement slow with a blue tint and screen
    feedback. It never hard-stops the swarm; level-up/offer pauses remain intentional.
  - Run chests roll independent utility drops: 35% magnet, 20% bomb. Magnet pulls all active gems and
    pickups to the opener (excluding other magnets); bomb deals percentage damage to every enemy
    (12% max HP normal, 7% elite, 3% boss/final-threat). Both use new pickup visuals and events.
  - Some ranged minions spawn with one original enemy ability. Elites get two, bosses four, final
    threats five. Ability archetypes are original (Arc Bolt, Split Volley, Rune Mine, Frost Ring,
    Searing Beam, Meteor, Hex Shield, Warp Dash, Summon Swarm, Chain Spark), with deterministic
    assignment, staggered cooldowns, and telegraphed hazards.
  - **Focus is removed from the chest economy.** Chest pulls use rarity-weighted pools only; the
    `championFocus` save field is stripped during migration and no focus controls are rendered.
  - A dedicated **Darkin chest** is added to the CHESTS page for champions whose verified `species`
    includes Darkin (Aatrox, Kayn, Naafiri, Varus, Zaahen). Darkin champions remain in their regional
    pools. The chest uses an original crimson/gold sigil, not Riot art.
  - Crest presentation is normalized: 256x256 transparent PNG derivatives, a single primary crest,
    and compact secondary-region badges instead of overlapping full-size images.
  - Region chest cards open a full dossier with region lore, record stats, pool, focus-free actions, and
    the same reveal overlay. Region/lore achievements expand to 67 goals (42 regional tiers plus global
    and Darkin lore), backed by save v7 `regionProgress` and `achievementProgress`.
  - The HUD removes Q/W/E/R/M hotbar letters, the Tab scoreboard background becomes 82% opaque, elites
    always show health bars, and chest progress rings/melee slashes use filled/segmented geometry to
    remove stroked-arc artifacts.
- Consequences: save v7 adds lore progress; a new `hazard` store and five enemy ability slots; new
  magnet/bomb/frost events; normalized crest assets under `public/regions/normalized`; no focus field or
  hidden pull bias.

### D-036 - Per-chest pull records and the centered PLAY hero
- Date: 2026-10-29 - Status: decided (user)
- Decision:
  - The individual region/Darkin chest dossier drops run statistics from its record block. It instead
    shows a **PULL RECORD**: total pulls, full champions, shard total, gold earned, guaranteed Epic+
    outcomes, and keys spent (derived from total pulls).
  - Save v8 records per-region pull outcomes: tracked pulls, full champions, shards, gold, and
    guarantees. Existing v7 `pulls` and lore counters are preserved; outcome counters start at zero for
    legacy pulls, and the dossier shows a tracked-vs-total note when needed.
  - Pull results are recorded after the complete 1-pull/10-pull roll set, including guarantee fallbacks.
  - The PLAY hero becomes a centered champion stage: crest watermark and initial medallion share one
    centered grid cell; title/name/chips sit beneath; kit and launch actions are centered below.
  - The hero crest is explicitly centered with `inset:0; margin:auto` instead of relying on its absolute
    static position. The old fixed 300px art column and off-center bottom-left label are removed.
  - Responsive behavior keeps the medallion centered and reduces its size on mobile.
- Consequences: save schema v8; new per-region pull counters in `RegionProgress`; no change to run
  counters or achievement progress; the current crest + initial visual is retained (no new champion art).

### D-037 - Deeper passive/meta tracks and denser terrain
- Date: 2026-10-29 - Status: decided (user)
- Decision:
  - Permanent upgrade tracks are deeper: broad stat relics reach **10 ranks**, while class and signature
    capstones reach **6 ranks**. Existing purchases keep their rank; the cost curves extend in place.
  - `PowerUpDef` supports an optional multi-stat `stats` block alongside the legacy `stat`/`perRank`
    shape. A single relic can now grant two related bonuses without duplicating entries.
  - Nine passive-inspired meta upgrades are added: three common relics (Gilded Crown, Windwalkers,
    Bastion Plate) and one capstone for each class (Archmage's Thesis, Unbroken Wall, Warlord's Tempo,
    Executioner's Mark, Deadeye Manual, Choir of Light). The catalog is **44** upgrades; every champion
    tree shows common + class entries, and curated champions keep their signature entries as well.
  - The in-run passive catalog grows to **26** with eight hybrid passives: Aegis Bloom, Hunter's Bracer,
    Sanguine Bloom, Midas Sigil, Torrent Charm, Storm Lens, Chronicle, and Berserker's Mask. Every passive
    now has **8 levels**; existing rank-5/rank-3 final totals are preserved by scaling their per-level
    values so the longer track is a granularity increase, not a free doubling.
  - Terrain is intentionally denser while staying deterministic and safe around the spawn clearing.
    Riftfield uses wall/liquid thresholds **0.65/0.30** and bush density **1.9**; Noxian Warfront uses
    **0.67/0.28** and **1.8**. Walls and liquids still receive cellular cleanup and isolated-tile
    removal, and bushes remain floor-only with a protected spawn zone.
  - The upgrade UI renders multi-stat effects and 10/6 rank pips; rank pips wrap on narrow layouts.
- Consequences: counts are now 44 meta power-ups and 26 passives; save schema is unchanged. Existing
  meta ranks remain valid and new rank costs are content-driven. No new Riot art is introduced.

### D-038 - Search, filter, and sort controls for collections
- Date: 2026-10-29 - Status: decided (user)
- Decision:
  - **Champions** keep region, class, owned/locked, and text controls, and gain a rarity filter plus
    sort modes for name, rarity, class, primary region, and unlock progress.
  - **Chests** gain text search across region names, blurbs, and champion pools; filters for all,
    regional, Darkin, and incomplete pools; and sort modes for featured order, name, pool size,
    missing-champion count, and completion.
  - **Achievements** keep category and region filters, and gain text search plus sort modes for default
    order, incomplete first, complete first, progress, reward value, and name.
  - Search, filter, and sort state is in-memory UI state. It resets only when the page is reloaded; run
    saves and the save schema are untouched.
- Consequences: collection pages expose a consistent search row with a sort control and result count;
  no new art, content records, or persistence fields are required.

### D-039 - Late-run XP, time-scaled enemies, magnet drops, and official crest branding
- Date: 2026-11-03 - Status: decided (user)
- Decision:
  - The XP curve keeps its early pace but becomes substantially cheaper after level 9; post-table growth
    drops from 7 to 4 XP per level. This gives more level-up picks during the long late-run stretch.
  - **Every minion can roll one original ranged ability** instead of only ranged/fan archetypes. The roll
    starts at 18% and gains 1.2 percentage points per minute, with ranged/fan archetypes 1.5x as likely.
    Elites keep two abilities, bosses four, and final threats five.
  - Enemy movement speed starts at 1.05x and gains 1.8% per minute. Enemy contact, projectile, ability,
    and explosion damage gains 5% per minute. Terrain slow, freeze, and shields still apply normally.
  - Elite health bars remain always visible and gain a stronger gold frame/backplate so the elite marker
    stays readable in a busy swarm. Other enemies still only show bars after taking damage.
  - Magnet is now a normal minion consumable drop alongside heal/vacuum/freeze, rendered with its own
    icon. It pulls all active gems and floor pickups to the collector, excluding other magnets so it cannot
    chain. Run-chest magnets remain unchanged.
  - Owner-supplied crest artwork becomes the official project branding: the transparent mark in the meta
    topbar and favicon, the ornate crest in the README, and the solid crest for social previews.
- Consequences: later levels arrive faster, enemy pressure ramps instead of jumping, and magnet is
  discoverable outside run chests. No save schema changes. Binary logo files live under
  `packages/client/public/brand/`; provenance is recorded in `ASSETS.md`.

### D-040 - Mobile touch controls and compact selection layout
- Date: 2026-11-03 - Status: decided (user)
- Decision:
  - Touch devices get a left-side virtual joystick that feeds the same normalized movement vector as
    keyboard/gamepad. Combat remains fully automatic; no extra attack buttons are added.
  - The mobile action rail exposes **STATS** and **PAUSE** buttons. Pause uses the same solo freeze/co-op
    menu behavior as Esc. Controls hide during the menu and during level-up/chest offers, then return when
    the run resumes.
  - Touch-friendly HUD mode hides the desktop weapon/move/item slot rows and keeps a compact HP/XP identity
    panel above the controls. The scoreboard becomes scrollable and uses two stat columns.
  - The level-up/chest selection overlay uses safe-area padding and a compact two-column card grid with a
    scrollable card area. Cards, descriptions, stats, and action buttons shrink on phones; the keyboard hint
    is hidden. This keeps the selection inside the top/bottom safe areas instead of overflowing the screen.
  - Meta screens get safe-area top/bottom padding and remain vertically scrollable on phones.
  - Touch support is detected from coarse pointers / touch points; `?touch=1` forces it for desktop testing.
- Consequences: mobile play needs no desktop keyboard or gamepad. The canvas keeps its 16:9 pixel-perfect
  contain layout, so portrait phones get a smaller playfield; real-device testing is still required for
  hand comfort and button reach.
