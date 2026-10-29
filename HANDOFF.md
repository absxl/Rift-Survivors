# Rift Survivors - session handoff (2026-10-29)

This file records the current work. The full reference is
[`docs/14-IMPLEMENTATION-STATUS.md`](docs/14-IMPLEMENTATION-STATUS.md); hosting/account details are in
[`docs/15-HOSTING-AND-ACCOUNTS.md`](docs/15-HOSTING-AND-ACCOUNTS.md).

## D-033 update (current commit; see `git log -1`)

- Added **source-backed champion dossiers** for all 173 champions: official title/roles/difficulty from
  `leagueoflegends.com/en-au`, and wiki Universe region/origin/residence/faction/species. Each record
  carries official/wiki URLs and `verifiedAt: 2026-10-29`; summaries are original text.
- Corrected known region errors (Alistar, Brand, Corki, Locke, Nami, Senna, Skarner, Smolder, Tahm Kench)
  and added **49 current+origin multi-region memberships**. Multi-region champions appear in every related
  chest pool; focus is per region, shards/unlocks stay global. Lost non-chest places (Camavor, Blessed
  Isles, Icathia) are profile lore only.
- Added a full **champion dossier** overlay: official title, region chips, roles/difficulty, identity facts,
  summary, source links, Rift kit, shards, per-region focus, select/unlock. Collection cards, PLAY hero,
  sidebar, upgrades header, and chest rows use the profile theme.
- Added **reactive card styling** (pointer light, crest watermark, cross-region badges, hover state) and
  responsive/mobile dossier layouts with reduced-motion fallbacks.
- Committed the 13 official golden Universe **region crests** under the owner-approved D-033 private
  fan-project exception; Runeterra uses an original golden world-rune. Source/licence notes are in
  `ASSETS.md`, docs/06 and D-033. No champion art is included.
- Added `profiles.generated.ts` and the `pnpm --filter @rift/content profiles` audit/generator. Save schema
  is unchanged.
- Tests currently: **99 sim, 17 content (+2 balance skipped), 28 client, 14 server**; typecheck, Biome, full tests and client/server production builds pass.
  Browser-verified collection cards, Aatrox/Riven dossier crest blending, corrected Alistar/Brand cards,
  Demacia/Noxus chest crests, per-region focus controls, dossier close, and a 390px mobile dossier.
- Builds/tests are complete; this batch is committed. Human Noxus/Riftfield playtesting remains pending.


## D-032 baseline (commit `4f217ac`)

- Kept as the previous terrain/minion/Levitate batch. See the D-032 section below for terrain, pathing,
  minion personalities, and the balance baseline.

- **Scrapped the visual reskin.** The League-client UI is retained; only the small `LEVITATE` chip was
  added to the collection and PLAY screens. No fonts/joystick/restyle files remain.
- **Deterministic terrain:** `packages/sim/src/terrain.ts` generates 32 px chunked walls, water/lava, and
  a safe spawn island from `StageDef.terrain` + seed. Riftfield water slows 30%; Noxus lava slows 25%
  and deals 5 dps. Stage content carries thresholds, liquid type, effects, and palette.
- **Client terrain:** `renderer.ts` builds the same `TerrainField` from the snapshot's `terrainSeed`,
  draws a seamless stage floor, rocky wall tops/faces with shadows, animated liquid, and a terrain
  status layer. Walls/projectiles/enemy movement are simulated by the authoritative sim.
- **Collision and pathing:** player/enemy wall collision, projectile wall stops, free-floor spawn search,
  and BFS flow fields (`packages/sim/src/pathfinding.ts`) updated every 12 ticks. Bosses/final threats
  and `levitate` units ignore terrain.
- **Minion personalities:** runner (predictive), tank, fan (spread volley), healer, shielder (absorb
  shield), summoner, bomber (fuse explosion), plus existing chase/weaver/charge/ranged. Shield/fuse fields
  are snapshotted and rendered; heal/shield events make client rings. Cinder Cultist is the new Noxian
  fan minion; Blood Acolyte heals; Verdant Warden shields; Void Baron summons.
- **Levitate:** 11 floating champions (Syndra, Anivia, Aurelion Sol, Bard, Kayle, Morgana, Soraka, Vex,
  Yuumi, Zoe, Kindred) ignore terrain collision/slow/damage. Weft Wisp/Ash Mote/The Hollow Star scale as
  levitating enemies; bosses bypass terrain.
- **Tests:** 99 sim, 16 content (+2 balance skipped), 23 client, 14 server; typecheck and Biome pass.
  Added terrain determinism/collision/water/levitate tests and healer/shielder/summoner/fan behaviour
  tests. Balance bot is wall-aware.
- **Balance:** seeds 101/202 reach the 32:00 cutoff; seed 303 dies at 16:35 after terrain/contact/
  projectile pressure. See `docs/BALANCE.md`; a human Riftfield/Noxus run is still needed.
- **Browser verified:** League UI restored, terrain floor/walls visible and collidable, enemy pathing
  around walls, and the Syndra `LEVITATE` chip.
- **Handoff state:** client/server production bundles rebuilt and the authoritative server restarted
  with terrain-carrying snapshots; this batch is committed. Props/destructible cover and terrain-aware
  player steering are deferred; a human Riftfield/Noxus terrain run is the next feel check.

## D-031 baseline (last commit `f5e4a31`)

- Full **173-champion roster** generated from Data Dragon 16.21.1 with six classes, curated primary regions,
  provisional rarities, class weapons, class placeholder moves, class trees and generated descriptions.
- Class power-ups for Fighter, Assassin, Marksman, Support; physical synergy; 39 weapons/moves total.
- Champion collection UI: search, class/region filters, owned filter, 24-card pagination, focus buttons.
- Region gacha **focus champion** per region (50% outcome preference) with save field.
- **Noxian Warfront** second stage: 5 new enemies, final threat, rules overrides, palette, stage select,
  stage id/name in snapshots/HUD, host stage for co-op.
- Save **v5**: profileName, selectedStage, runsPlayed, bestRun; focus; migrations.
- **Profile section**: nickname rules, lifetime stats, best run, selected champion/stage, account panel.
- **Server-side accounts/cloud save**: JSON account store, Discord OAuth routes, dev login
  (`RIFT_DEV_AUTH=1`), sessions, nickname uniqueness, `GET /api/me`, `PUT /api/save`,
  `PUT /api/nickname`, `POST /api/logout`; browser syncs save and uses account nickname in lobby.
- Co-op flow uses profile name; separate NameScreen prompt removed.
- Docs 10/D-031, docs 14, docs 15, README, BALANCE updated. `.env.example` added.
- Tests currently: 90 sim, 15 content, 23 client, 14 server. Typecheck passes. Build/restart and final
  browser verification still needed at commit time.
- Pending: Discord deployment/credentials, friends/invite embeds, Cloudflare Workers port, moves pass,
  human balance on Noxus, unique champion kits.

## Earlier D-030 details (historical)

### Simulation
- `packages/sim/src/systems/separation.ts`: deterministic enemy body separation after enemy AI.
  Mass is radius squared; per-pair push is capped. Wired into `DEFAULT_RULESET.pipeline`.
- Signature moves are content weapons with `isMove: true`, using the existing auto-cast behavior
  pipeline. Every champion has `startingMove`; moves count in a separate 4-slot pool.
  Loadout is now **6 weapons + 4 moves + 6 passives**. Weapon store capacity raised to 64.
- `RunConfig.playerMetaBonuses` and `World` support per-player meta bonuses; solo still supports the
  legacy global `metaBonuses`.
- Tests added: `separation.test.ts`, `moves.test.ts`, per-player meta case in `coop-stats.test.ts`.

### Content
- `WeaponDef`/`PassiveDef` names + descriptions; `EnemyDef.name`; `CharacterDef` name, description,
  region, rarity, class, starter, startingMove, upgradeIds.
- 8 signature moves: Prismatic Nova, Pyre Pillar, Charm, Realm Warp, Force of Will, Dark Matter,
  Infernal Guardian, Arcanopulse.
- Every weapon/passive/champion has original placeholder flavor; 10 boss/minion names added.
- Regions/rarities: Demacia Lux Epic; Noxus Brand Epic/Annie Rare; Ionia Ahri Common/Syndra Epic;
  Shurima Xerath Epic; Bandle City Veigar Epic; Runeterra Ryze Legendary.
- **Starter is Ahri** (`starter: true`) so every region, including Demacia/Lux, still has a gacha target.
- Per-champion trees via `upgradeIds`; mage haste entries (Focus, Arcane Flow) + signature entries;
  tank entries (Fortitude/Bulwark/Regeneration/Aegis) exist for future tank champions.
- Ahri's Orb of Deception was added to the `damage:light` pool so her starting kit triggers Light Weaver.

### Save/meta
- Save v2:
  - `selectedCharacter`
  - `championUpgrades: Record<championId, Record<powerUpId, rank>>`
  - `championShards: Record<championId, number>`
  - v1 `purchases` migrate to the selected/first champion; `SAVE_VERSION = 2`.
- Per-champion buy/refund/rank/compute; `computeMetaBonuses` can filter by the champion's tree.
- Region gacha:
  - 1 chest = 1 pull; 10 chests = 10 pulls with guaranteed Epic+.
  - Per pull: 8% full champion, 72% champion shards, 20% gold.
  - Shards required: Common 6, Rare 8, Epic 12, Legendary 20.
  - Full champion unlock only chooses locked region champions; all-owned fallback gold 75.
  - 10-pull marks a natural Epic+ champion as `guaranteed`, or forces an Epic+ from the region.
  - Player spends champion-specific shards manually via the Champions page.
- Tests added: `meta/meta.test.ts` (per-champion upgrades, single pull, 10-pull guarantee, shard
  unlock), `save/save.test.ts` (v1 migration), `ability-info.test.ts`.

### Client UI
- DOM HUD replaces the Pixi HUD (`hud.ts`):
  - top bar time/team kills (solo: own kills)/gold/chests
  - top-left party frames with lobby names + champion colors + HP/downed
  - boss/final-threat bar with content names
  - compact hotbar: portrait/level, HP/XP, QWER normal weapons, 4 move slots, 8 item slots
  - hover tooltips with flavor + derived stats
  - Tab scoreboard with party individual kills + full local stats
- Level-up overlay redesigned with flavor, badges, derived current→next stat lines.
  Hotkeys: 1-4 pick, R reroll, X skip, B banish. S is movement only; Esc does not pause over an offer.
- League-client-style meta hub (`meta-screen.ts`):
  - PLAY, CHAMPIONS, UPGRADES, CHESTS, ACHIEVEMENTS, SETTINGS.
  - Champions page grouped/filterable by region with shard progress/unlock/select.
  - Upgrades page always for the selected champion.
  - Chests page region cards + 1/10 pulls + odds + results.
  - Settings page includes Reset Save.
- Admin panel (`admin.ts`) toggled by **H**: gold, chests, shards (selected/all), unlock selected/all,
  max selected/all trees, reset save. Local-save only.
- Co-op flow uses the selected champion; the old character-select popup is no longer used. Lobby/name
  screen now have BACK TO MENU.
- Main menu no longer dev-unlocks all champions.
- Protocol v3 create/join/ready carry optional `metaBonuses`; server stores per client and passes
  `playerMetaBonuses` to the sim. Server test covers this.

### Docs
- `docs/10-DESIGN-DECISIONS.md` D-030 added.
- `docs/BALANCE.md` updated with the latest bot numbers and moves/separation notes.
- README intro updated for the 6W+4M+6P loadout.

## Final verification (after all current edits, commit 4ac66df)
- `corepack pnpm exec biome check` passed.
- `corepack pnpm -r typecheck` passed.
- `corepack pnpm -r test` passed:
  - sim 87
  - content 13 (+2 balance tests skipped by default)
  - client 21
  - server 9
- Browser screenshots verified: main PLAY, CHAMPIONS, CHESTS, a 10-pull results panel, UPGRADES,
  SETTINGS, in-game HUD, level-up overlay, Tab scoreboard, hover tooltip (flavor + scaled stats), the
  H admin panel, and that pressing `S` does **not** close the level-up overlay.
- Co-op browser test (two Edge pages, one room): party frames showed both lobby names + champion
  colors + level/HP, and the top bar switched to **TEAM KILLS**. The per-player meta path is covered by
  the server test as well.
- Balance bot (D-030, 32:00, seeds 101/202/303): all survive; level 45-47; 5,535-5,539 kills;
  gold 1,585-1,897; chests 45-72; max alive 61-85; ~0.041-0.045 ms/tick.
- Production builds were rerun after the final gacha/starter/tag changes. Rebuild once more after any
  further edits with:
```
corepack pnpm --filter @rift/client build
corepack pnpm --filter @rift/server build
```


## Live state / restart notes
- The dev Vite server was serving at `http://127.0.0.1:5173` during validation, but at the end of the
  session the browser reported connection refused after a restart; **restart Vite**:
  `corepack pnpm --filter @rift/client dev -- --host 0.0.0.0 --port 5173`
- The authoritative server was rebuilt/restarted and `/health` reported `version: 3`. If it is not
  running:
  `corepack pnpm --filter @rift/server build`
  `node packages/server/dist/index.js` (from repo root)
  Expected health: `{"ok":true,"rooms":0,"version":3}`.
- Existing browser saves from the old dev build may have all 8 champions unlocked. Use **Settings >
  RESET SAVE** or **H > RESET SAVE** to start the gacha collection from Ahri.
- The old Vite process may survive port 5173 if restarting; kill the owning node process if needed.

## Known issues / follow-ups
- Gacha economy is very fast (45-72 chests/run at 1 chest/pull). Decide if that is intended or tune
  chest drops/shard amounts after a human run.
- The 10-pull guarantee is per region; if a region's Epic+ champions are all owned it falls back to
  epic shards/gold rather than an out-of-region champion.
- Ahri's light synergy verified in the HUD: MIGHT +12% with Orb + Charm, and the hotbar tooltip shows
  the scaled damage (11.2) for Orb of Deception.
- Party frames/team kills verified with two browser clients.
- Tooltip hover verified both content and positioning.
- All content display text is English and hardcoded (existing project convention), not locale files.
- `docs/10` D-016 still says "MoveDef"; D-030 records the actual `isMove`-on-weapon implementation.
- `CharacterSelect` (`charselect.ts`) is now unused; can be deleted after confirming no references.
