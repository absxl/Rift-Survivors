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
  - **Focus champion:** each region chest has a player-selected focus. Champion/shard outcomes have a
    50% preference for a locked focus champion; the player can change focus per region.
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
