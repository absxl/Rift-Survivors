# 05 — Roadmap

Work on the **first unchecked milestone only**. Tick boxes when done, then stop and summarize. Each code
milestone must leave the game runnable (`pnpm dev`) and all checks green
(`pnpm typecheck && pnpm lint && pnpm test`). Implement mechanics **as recorded in
`docs/10-DESIGN-DECISIONS.md`** and the feel described in `docs/13-CLASSIC-FEEL-SPEC.md`. If a decision is
missing, stop and ask (`docs/09`).

The order is chosen to reach a **fun, playable classic-style vertical slice by M4**, then widen it.

## D0 — Design interview (NO CODE)
- [x] Read `09`, `10`, `13`, `03`, `11`, `12`
- [x] Run the baseline-first interview (classic defaults from `13`; user confirms/changes each; max 4 questions per message)
- [x] Record decisions in `10`; resolve every `agent-proposed` item with the user
- [x] Regenerate `03` from the log; update `04` if decisions require it
- [x] End-of-interview review delivered; **user signs off explicitly**

## M0 — Scaffold
- [x] pnpm workspace: `sim`, `content`, `shared`, `client`, `server` (server may be empty)
- [x] `tsconfig.base.json` strict, Biome, Vitest (uses `extends` per-package, not composite references)
- [x] GitHub Actions CI (typecheck, lint, test, build)
- [x] `.gitignore` includes `assets/local/`, `node_modules`, `dist`
- [x] `locales/en.json` + `t(key)` helper; `docs/adr/` with ADR template
- [x] `pnpm dev` shows a pixel-perfect canvas (see M2) placeholder and an FPS counter

## M1 — Sim kernel (the seams)
- [x] Seeded `Rng` (xoshiro128**) + tests
- [x] Schema-driven stores (`sim/schema`) with pooling/free-list; generated snapshot codec (inspector deferred to M2 debug pass)
- [x] Registries (weapon behaviors, enemy behaviors, systems, progression, triggers, conditions, actions, rule keys, stats)
- [x] `RulesetDef` (default id `classic`) + system pipeline runner; `createWorld`, `step`, `snapshot`, `applyChoice`
- [x] Event queue; modifier stack (`stat()`/`param()` accessors); rule-override accessor (`rule()`/`num()`)
- [x] Spatial hash + tests; determinism test per ruleset
- [x] CI fitness tests scaffolded (see 12): `no-content-in-engine`, `registry-complete`

## M2 — Pixel-perfect renderer & movement
- [x] Internal-resolution render target (≈480×270), integer upscaling, nearest filtering, letterboxing
- [x] Worker host running the sim at 30 Hz; interpolation at display rate
- [x] Move-only controls (keyboard/gamepad), camera follow, facing direction
- [x] Tiled scrolling stage background; procedural placeholder pixel sprites (player, enemies, gems)
- [x] Minimal pixel-font HUD skeleton (timer, XP bar, HP bar under feet)

## M3 — Swarm, first weapon, gems
- [x] Content package + Zod validation + pack loader
- [x] First enemy (`chase`), spawn director with `stream`/`ring` patterns, **enemy recycling**
- [x] Contact damage with i-frames, player death → results screen
- [x] First weapon behaviors (`shoot-nearest`, `sweep`) with the **per-enemy hit cooldown** and knockback
- [x] XP gems + magnet, hit flash, damage numbers (pooled, capped)

## M4 — Level-up & items (VERTICAL SLICE)
- [x] XP curve, level-up pause, **3-card level-up UI** (weapon/passive new or upgrade)
- [x] 6 weapon + 6 passive slots; weapon levels 1–8 from data tables; passive levels 1–5
- [x] Stat pipeline (might/moveSpeed/maxHp/magnet) through the modifier stack
- [x] 3 weapons, 4 passives, 1 character
- [ ] **Milestone check**: the user plays 5 minutes and it feels like the classic loop. Notes go below.

## M5 — Weapon library & characters
- [ ] Remaining behavior archetypes (`orbit`, `aura`, `strike-random`, `arc-throw`, `boomerang`, `ground-pool`, `bounce`, `summon`)
- [ ] ≥ 10 weapons (≥ 8 archetypes), ≥ 8 passives, all as content
- [ ] Character select; ≥ 3 characters (starting weapon + stats + growth)
- [ ] Status effects (slow, burn, stun, mark…) as needed by weapons

## M6 — Chests, evolutions & pickups
- [ ] Elite enemies + chests with reveal animation (1/3/5 items by luck)
- [ ] Evolution + union logic from data; recipe hints in UI; ≥ 4 evolutions
- [ ] Floor pickups (heal, vacuum, nuke, freeze, gold); destructible props that drop them
- [ ] Offer UI is generic (level-up and chest share it)

## M7 — Full stage run
- [ ] Full 30-minute stage timeline (per-minute tables, patterns incl. `wall`/`swarm`)
- [ ] Bosses (scripted phases, telegraphs) and the **final threat**
- [ ] Results screen (time, kills, gold, build summary); revival stat
- [ ] Headless **bot test**: runs full timelines for N seeds, asserts no crash and counts stay in budget

## D1 — Design checkpoint (playtest → re-interview)
- [ ] User plays a full run; collect feedback; re-run relevant interview rounds
- [ ] Log new/superseded decisions; ADRs for anything that moves a seam; adjust roadmap

## M8 — Meta progression & unlocks
- [ ] Persistent gold, permanent-upgrade shop with refunds, versioned save + migrations + fixtures
- [ ] Achievements → unlocks (characters, weapons, stages); collection/recipes screen
- [ ] Second stage (content only), stage select

## M9 — Content, balance & feel
- [ ] Fill content to the proposed scope in `03`
- [ ] Juice pass using the checklist in `13` §15; chiptune/SFX set with voice caps; settings menu
- [ ] Balance pass with the bot; numbers recorded in `docs/BALANCE.md`

## M10 — Opt-in extras (only the ones the user picked)
- [ ] Synergy/effects extras from `11`: arcana-like modifiers, curses, shrines, reactions, traits, mutators
- [ ] Extras UI and tests; synergy matrix test (seeded random loadouts, 600 ticks each)

## M11 — Multiplayer server
- [ ] Protocol + `PROTOCOL_VERSION` handshake in `packages/shared` (see 07)
- [ ] Node `ws` server running the same sim and ruleset; rooms
- [ ] `NetHost` client implementing the same `Host` interface
- [ ] Delta snapshots (generated codec), interpolation, local prediction, per-player level-up offers
- [ ] 4-player stress test with simulated latency

## M12 — Co-op features & deploy
- [ ] Co-op rules per decisions (revive, enemy scaling, level-up model)
- [ ] Lobby UI; Dockerfile; deploy per `docs/08`; reconnect support

## M13 — Polish
- [ ] Gamepad, rebinding, accessibility; performance pass on M1 (500+ enemies); optional replays

## Notes
- **pnpm on PATH:** `corepack enable` failed (no admin on `C:\Program Files\nodejs`). Use `corepack pnpm …`
  or run `npm i -g pnpm@9.15.0` (or `corepack enable` as admin) so the root `pnpm …` scripts work directly.
- **Deferred from M1:** store debug inspector (M2), full `ruleOverride` modifier wiring (M4), generated
  network codec + delta compression (M11).
- **Deferred from M4:** reroll/skip/banish tokens (offer carries the counts; token sources + UI buttons land
  with meta, M8); full per-minute stage timeline (M7 — currently a simple ring/stream director).
- **Pending:** M4 milestone playtest (user plays ~5 min and confirms the classic loop feel).
- **Deviation (M0):** tsconfig uses `extends` per package rather than composite project references.
