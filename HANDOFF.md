# Rift Survivors - session handoff (2026-10-26)

This file records the D-030 batch so the next session can resume without re-deriving it.
The batch is committed as `feat: D-030 DOM HUD, champion moves, region gacha, per-champion trees`
plus a HUD tooltip follow-up. For the full feature/status reference, see
[`docs/14-IMPLEMENTATION-STATUS.md`](docs/14-IMPLEMENTATION-STATUS.md). Amend/rewrite this file once
signed off.

## Implemented (committed)

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
