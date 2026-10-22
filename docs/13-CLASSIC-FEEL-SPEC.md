# 13 — Classic Survivor Feel Spec ("OG Vampire Survivors" target)

The user wants the game to **look, feel and be structured like the original Vampire Survivors**. This doc
is the reference for that. It describes the genre's structure and feel. It is **not** a copy of the
original: use no names, art, music, text or code from it (see `06`). Mechanics and genre conventions are
free to use.

> All numbers marked **≈** are starting proposals to be tuned in playtests. They are not the original
> game's exact values, and the agent must never claim they are. The user confirms or changes each point in
> the design interview (`09`); the result lives in `10-DESIGN-DECISIONS.md`.

## 1. The loop in one paragraph
You only **move**. Your weapons fire **automatically**. Enemies swarm in ever-denser waves from all sides.
Kills drop XP gems; gems fill a bar; each level-up pauses the game and offers a few cards (new weapon, weapon
upgrade, passive item). Elites and bosses drop chests that **evolve** maxed weapons when you own the right
passive item. You survive a fixed timeline (≈30 min); at the end an unkillable-ish "final threat" appears and
ends the run. Gold you collect buys permanent upgrades and unlocks between runs.

## 2. Controls
- Move: WASD / arrows / left stick / touch joystick (stretch). **Nothing else in-run** except pause.
- No aiming, no dash, no manual abilities, no resource bar. Facing = last movement direction.
- Menus must be fully keyboard/gamepad navigable (level-up cards: ←/→ + Enter, or number keys).

## 3. Run structure
- Fixed-length run (≈30:00) driven by a **per-stage timeline** (see §10 and `StageDef` in `04`).
- Enemy density and strength ramp by minute. Boss/elite events are scheduled on the timeline.
- At the end: a **final threat** (single, fast, very tanky or invulnerable by default) that kills you
  unless you beat it with special means (data-driven; decided in the interview).
- Run ends by death, by timeline victory condition (if any), or by "retire" from the pause menu.
- Revival (a meta stat): a limited number of revives per run.

## 4. Weapons
- Slots: **6** weapon slots (≈). Each weapon levels from 1 to **8** (≈). Each level is a small step
  (e.g. +1 projectile, +damage, −cooldown, +area); level 1→8 should feel like a real power curve.
- Weapons are **auto-fired** on a cooldown, so there is no input for them.
- Weapon stats (all modifiable through the modifier stack): `damage, cooldown, area, speed (projectile
  velocity), duration, amount (projectile count), pierce, hitCooldown (per-enemy re-hit delay), knockback,
  lifetime`.
- **Weapon behavior archetypes** to implement (generic ids; content decides the names/theme):
  | Behavior id | Pattern |
  |---|---|
  | `sweep` | Short arc/slash in the facing direction, alternating sides when amount ≥ 2 |
  | `shoot-nearest` | Fires at the nearest enemy |
  | `shoot-facing` | Fires in the facing direction, with spread when amount > 1 |
  | `orbit` | Objects circling the player for a duration, then a pause (cooldown) |
  | `aura` | Constant or pulsing damage field around the player |
  | `strike-random` | Hits random enemies in view instantly |
  | `arc-throw` | Thrown upward in an arc, falls with gravity, pierces |
  | `boomerang` | Flies out and returns, hitting both ways |
  | `ground-pool` | Spawns lingering damage zones at random nearby spots |
  | `bounce` | Ricochets off screen edges/enemies |
  | `homing-orbs` / `summon` | Pets or seekers that act for a time |
  | `screen-nuke` | Periodic screen-wide effect |
  Weapons are composed from these behaviors plus per-weapon params. Hit logic uses the spatial hash and a
  **per-enemy hit cooldown** (typed-array lookup, no allocations).
- Weapons can be **evolved** (see §7).

## 5. Passive items
- Slots: **6** passive slots (≈). Each passive levels 1 to **5** (≈), granting a stat bonus per level
  (e.g. +x% might, −x% cooldown, +x% move speed, +max HP, +armor…).
- Passives are also the **evolution keys** for weapons (§7).
- Stat list (modifier-stack stats): **player**: `maxHp, recovery (hp regen), armor, moveSpeed, magnet
  (pickup radius), luck, growth (xp gain), greed (gold gain), curse (enemy difficulty/amount), revival,
  reroll, skip, banish`; **weapon-wide**: `might (damage), area, speed, duration, amount, cooldown`.

## 6. XP and level-up
- Enemies drop XP **gems** in tiers (small/medium/large by value). Gems on the floor are collected by walking
  over them or by the magnet radius; gems far away can be vacuumed by a pickup.
- Level-up: **pause**, show a centered panel (current weapons/passives + stats on one side, choices on the
  other). **3 cards** (≈) drawn from a weighted pool:
  - new weapon (if a free slot exists), new passive (if a free slot exists),
  - upgrade of an owned weapon/passive that is not maxed.
  - If a slot type is full, only owned items are offered. If nothing is left, offer a fallback (gold / heal).
  - Luck influences how likely rare items appear and the chance of extra choices (details in interview).
- Per-run tokens: **reroll** (new set of cards), **skip** (decline, usually for a small reward), **banish**
  (remove an item from the pool for the run). Counts come from meta upgrades and characters.
- XP curve: level-up thresholds grow steadily, then jump at set levels (≈ levels 20/40) so the pace
  changes through the run. Growth stat multiplies XP gained.
- Multiplayer (co-op): the level-up pause applies **per player** without freezing others. Preferred model: the
  sim does not pause. The leveling player gets a timed choice window (≈10 s) during which they are
  invulnerable/shielded; others keep playing. Decided in the interview (R7).

## 7. Chests and evolutions
- **Chests** drop from elites and bosses, and sometimes appear on the timeline. Opening one runs a short
  reveal animation and grants **1, 3 or 5 items** (≈; Luck raises the odds of more).
- An opened chest first looks for **evolutions**: if you own a weapon at max level and the matching passive
  item (the recipe's required passive, any level ≥ 1), that weapon **evolves** into a stronger form.
  Otherwise it upgrades random owned items.
- **Unions** (optional): two specific maxed weapons merge into one slot.
- Evolutions are data: `WeaponDef.evolution = { requiresPassive, evolvesTo }`. Matching by id inside content
  data is fine; the engine only follows the data.
- UI must make recipes discoverable: a "collection/recipes" screen, and a hint icon on a weapon card when its
  key passive is owned.

## 8. Floor pickups (generic ids)
`heal` (food), `vacuum` (pulls all gems), `nuke` (damages everything on screen), `freeze` (stops enemies
briefly), `gold-small/large`, `xp-burst`, `chest`, plus stage-specific pickups. Dropped by destructible props
(torches/barrels — "light sources") and by enemies at low probability, modulated by Luck.

## 9. Enemies
- Mostly **simple chasers** in very large numbers; variety comes from stats, speed, size, and spawn
  patterns, with a few special behaviors (ranged, charger, splitter, ghost that ignores walls).
- **Spawn patterns**: `stream` (steady trickle), `swarm` (burst), `ring` (encircle the player),
  `wall` (a moving line sweeping across the screen), `edge-cluster`.
- **Knockback + hit flash**; small enemies die in one hit early and form satisfying mow-down moments.
- **Elites**: bigger, tankier, glowing; guaranteed chest. **Bosses**: scripted, timeline-scheduled.
- **Enemy recycling** (performance + feel): enemies that fall too far outside the view are repositioned to the
  screen edge ahead of the player rather than despawned, keeping density constant.
- Contact damage with **brief invulnerability frames** (≈0.5 s); armor reduces flat damage per hit.
- Scaling: per-minute multipliers in the stage timeline, plus the `curse` stat for optional extra difficulty.

## 10. Stages
- A stage = a bounded (or wrapping) scrolling map with a tile set, optional **destructible props**,
  a **timeline** of spawn tables per minute, scheduled boss/elite/chest events, a music track and
  modifiers (e.g. slow ground, wind, darkness). Each stage has its own enemy roster.
- Stage select screen with unlock conditions. Start with 1–2 stages; each added stage is content only.

## 11. Characters
- A character defines: **starting weapon**, base stats, an optional **growth bonus** (e.g. +x% of a stat every
  N levels), starting modifiers, unlock condition/price, sprite and a short flavor line.
- Characters have no manual skills. Their identity comes from the starting weapon, growth and stats. A
  character may have a single unique "quirk" using the effects engine (`11`).

## 12. Meta progression
- Gold earned is **persistent**. A **permanent-upgrade shop** sells stat bonuses with rising prices
  (might, armor, max HP, growth, greed, luck, revival, reroll, skip, banish…); purchases can be **refunded**.
- Unlocks: characters, weapons, passives, stages and secrets, via **achievements** (e.g. "reach minute 10",
  "evolve a weapon", "kill N enemies"). A **collection** screen lists discovered items and recipes.
- Optional (decide in the interview): arcana-style run-defining modifiers chosen at set minutes.

## 13. Co-op
Up to 4 players online (see `07`). Shared stage and enemy pool; each player has their own weapons,
passives and level-ups. See §6 for the level-up model. Revive by walking over a downed ally's marker
(timer). Enemy count scales with player count.

## 14. Presentation (the "look")
**Pixel-perfect pipeline (see 02):**
- Internal render resolution **480×270** (≈) scaled by an **integer factor** to the window (×4 = 1920×1080).
  Nearest-neighbour filtering everywhere, no sub-pixel smoothing, letterbox when the window is not an exact
  multiple.
- Sprites: chunky 16-bit style. Base grid **16×16** for common enemies, **16×24–24×24** for characters and
  elites, **32×32+** for bosses (≈). 2–4 frame walk cycles, 1–2 frame hit/attack flashes. Dark outlines or
  limited palettes per stage so the horde stays readable.
- Placeholder art: a **procedural pixel-sprite generator** (palette-swapped silhouettes by enemy
  size/behavior) so the game looks right before any real art exists.
- Tiles: 16×16 or 32×32 seamless ground tiles with a few decor variants; low-contrast ground, high-contrast
  characters, enemies and pickups.
- **HUD** (minimal, pixel font): XP bar across the top with level number; timer top-centre; gold and kill
  count top-right; owned weapon/passive icons with level pips top-left; a small HP bar under the player's feet.
- **Damage numbers**: small pixel font, white (crit/colored variants), pooled with a hard cap.
- **Screens**: title → character select → stage select → run → results (time, kills, gold, items) → meta shop.
- Audio: chiptune/synth music loop per stage (self-generated or CC0, see 06), 8-bit style SFX with per-sound
  rate limits and a global voice cap so 400 hits don't become noise.

## 15. Juice checklist (feel is the product)
1-2 frame white hit flash on enemies · tiny knockback · death pop + gem drop with a little hop ·
gems with a gentle magnet-in animation · weapon level-up and evolution fanfare + screen flash · chest opening
reveal sequence · big numbers on big hits · optional light screen shake (toggleable) · satisfying SFX pitch
variation · enemy death sounds capped · level-up "ding" · low-HP warning tint · pause with item/stat
overview.

## 16. Performance targets
- 500+ enemies, 300+ projectiles/weapon hitboxes, 1000+ gems at 60 FPS on a MacBook M1 (budget in `02`).
- Sim step ≤ 4 ms; per-enemy hit cooldown via typed arrays; damage numbers/particles pooled and capped.
- Draw enemies/gems/projectiles via batched sprites from one atlas; cull off-screen.

## 17. The League skin (how the theme maps onto this structure)
The structure stays classic. League supplies the flavor in **content only** (names/art are the user's to
decide, see 06):
| Classic element | League skin proposal |
|---|---|
| Character | A champion; starting weapon = their signature ability reinterpreted as an auto-weapon |
| Weapons | Champion abilities / summoner-spell-like effects, each themed to a behavior archetype |
| Passive items | League-style items (stat sticks, boots, components); each is an evolution key |
| Evolution | "Completed/mythic" item or ability upgrade |
| Chest | Hextech-style chest/loot |
| Enemies | Lane minions, jungle monsters, void creatures, champion-style elites |
| Stage | Rift lane, jungle, Howling-Abyss-like bridge, etc. |
| Boss/elite events | Herald / Dragon / Baron as timeline bosses |
| Final threat | An inevitable end-of-run entity (e.g. a Void/Nexus-themed one) |
| Gold / meta shop | Gold-to-permanent-upgrades shop ("Summoner's shop") |
Everything in this table is a **proposal** the user may change in the interview.
