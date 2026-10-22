# 03 — Game Design (regenerated from the decisions log)

> **Status: confirmed by the user (D0 sign-off 2026-10-22).** Source of truth is
> `docs/10-DESIGN-DECISIONS.md`, which overrides this file on any conflict. The game keeps the classic
> Vampire-Survivors feel (`docs/13`) but reworks the build system around **Moves** and **cross-synergies**.

## Pillars
1. **Classic survivor feel** — move-only play, auto-firing weapons, huge swarms, build-defining level-ups.
2. **Build depth via Moves + synergies** — three loadout categories that interact (20MTD/RoR2/Balatro).
3. **League as a skin** — champions, abilities, items and monsters supply theme, not engine rules.
4. **Friends-first** — mostly solo, but co-op with a shared level and complementary builds.
5. **Everything is data** — any module can be swapped later without a rewrite (`02`, `12`).

## Confirmed design
| Module | Decision |
|---|---|
| Controls | Move only, auto-fire; Moves auto-cast on cooldown (no manual buttons) |
| Loadout | **6 Weapons + 6 Items + 4 Moves**, all max level **5** |
| Run | ≈30 min timeline + final threat; **defeating it → boss rush** |
| Level-up | Pause (solo), **3 cards**, reroll/skip/banish; **slow start, late ramp** XP |
| Moves | Auto-cast abilities; **boss kills grant a pick now + permanent unlock**; rare level-up cards |
| Synergies | Cross **weapons ↔ moves ↔ items**: pair combos, stacking/scaling, discovery combos, reactions; evolutions kept; unions kept; explicit tooltips + recipe screen; ceiling = strong |
| Chests | Luck-based loot (upgrades/items/moves), not fixed-evolve-only |
| Enemies | Mostly chasers + specials; patterns stream/swarm/ring/wall; recycling |
| Stages | 1 stage at launch; destructible props |
| Bosses | Herald / Dragon / Baron + Void final threat |
| Characters | 7+ champions; each = signature Move + starting weapon + stats + growth |
| Unlocks | **Gacha** (performance → region chests → 1 champion/region) + gold permanent-upgrade shop + achievements |
| Meta | Persistent gold, refundable shop, achievements, daily seed + friend leaderboard |
| Co-op | 1–4 online, own camera each, **shared level** (all level together), marker revive, scale enemies/share loot |
| Extras | Arcana modifiers, curses/bargains, shrines/events, keystone legendaries, per-champion quirks, daily seeds |
| Presentation | Pixel-perfect 480×270 integer scale; procedural placeholders; chiptune + 8-bit SFX; English (i18n-ready) |

## League skin
Champion = character with a signature-ability Move · abilities = weapons/moves · items = passive items ·
Herald/Dragon/Baron = timeline bosses · minions/jungle/void = enemies · Rift = stage. Names/art are content
(`06`), swappable.

## Starting content scope (proposal)
- 1 stage, 7+ champions, ≥ 10 weapons (≥ 8 behaviors), ≥ 8 items, ≥ 4 moves, ≥ 4 evolutions + unions
- ≥ 12 enemy types, 2–3 elites, Herald/Dragon/Baron bosses, 1 Void final threat
- Gold shop + gacha chests + achievements + daily seed

## Game feel (non-negotiable)
Pixel-perfect rendering, hit flashes, knockback, satisfying death/gem/chest/evolution feedback, pooled damage
numbers, capped audio, toggleable shake. Checklist in `13` §15.

## UX flow
Title → character select → stage select → run (pause: Esc) → results (award chests) → gacha / gold shop /
collection. Settings: volume, shake, damage numbers, language, controls, integer-scale/fullscreen.
