# 09 — Design Interview Protocol

The user wants a game that **looks and feels like the original Vampire Survivors**, with a League of Legends
theme and the freedom to change things radically later. The classic structure is already specified in
`docs/13-CLASSIC-FEEL-SPEC.md`. So this interview is **baseline-first**: for each module the agent presents
the classic default and the user chooses **keep / change / extend**. Answers go into
`docs/10-DESIGN-DECISIONS.md`, the **source of truth** (it overrides `03` and `13` where they differ).

## When to run
- **D0** (before any code): rounds R0–R9.
- **D1** (after a full playable run): re-interview from playtest feedback.
- **Any time** the user says "let's change X" or "game Y has Z, I want that": run the matching round, then
  follow `docs/12-CHANGE-PLAYBOOK.md`.

## How to ask (rules for the agent)
1. Use your interactive question tool if you have one; otherwise ask in plain chat.
2. **Max 4 questions per message.** Multiple choice with a one-line description per option, always allow
   free text, recommended option first, labelled "(Recommended)". The classic default is usually the
   recommended one.
3. Explain each option by its **feeling and by reference games**, not just the feature name.
4. Never assume. If the user says "you decide", choose, record as `agent-proposed`, and list it in the final
   review for veto.
5. Do not re-ask answered questions or rejected options. Don't ask about things `13` already fixes unless the
   user wants to deviate (the baseline itself is decision D-001/D-002 in the log).
6. After **each round**: update `10-DESIGN-DECISIONS.md` and give a 3–5 line summary.
7. Park out-of-scope ideas in the "Idea parking lot".
8. After the last round: regenerate `03-GAME-DESIGN.md`, produce the end-of-interview review, ask for explicit
   sign-off. Only then start M0.

## R0 — Baseline & references (short)
- Confirm the baseline: "Original Vampire Survivors structure (move-only, auto weapons, 6+6 slots,
  evolutions, 30-min timeline, pixel-perfect look) with a League skin." Keep / adjust?
- Other games to borrow *specific* things from (Brotato, Halls of Torment, Megabonk, Survivor.io, Hades,
  Balatro, TFT, Risk of Rain 2, others) and what exactly: one line each.
- Who plays (you + how many friends), typical session length.

## R1 — Run shape
- Length: 30 min (classic) / 15 / 20 / endless. Is there an end event (final threat, boss kill), and can the
  player beat it?
- Death model: single life + revival stat (classic) / more forgiving / roguelite variants.
- Camera/zoom: classic fixed zoom; allow zoom options?

## R2 — Weapons & level-up (the heart)
- Slots: 6 weapons + 6 passives (classic) or different? Max weapon level 8 / passive 5?
- Level-up: 3 cards (classic); how do Luck and extra choices work; reroll/skip/banish counts and sources.
- Weapon behaviors: review the archetype list in `13` §4 and pick which to build first / drop / add.
- XP curve feel: fast early snowball vs. slower, and how big the step changes are.

## R3 — Items, chests, evolutions
- Evolution rules: weapon max level + key passive via chest (classic) / also by level-up / by crafting.
- Unions (two weapons merge): yes/no. How many evolutions at launch.
- Chest contents (1/3/5), elite/boss drop rules, floor pickups list (heal, vacuum, nuke, freeze, gold…).
- Any downsides/curses/cursed items? Consumables? Actives (extra buttons) — default is **no**.

## R4 — Characters (the League part)
- Which champions first (count and names), and for each: the **starting weapon** idea (signature ability as
  an auto-weapon) and a growth bonus or a one-line quirk.
- Weapons/items naming: League-flavored names? (Names are content; see `06`.)
- Character unlocks: default / achievements / gold price.
- Equal balance or deliberately uneven (some hard, some strong)?

## R5 — Enemies, stages, bosses
- Number of stages at first and their themes (Rift lane, jungle, void, …). Bounded or wrapping maps.
- Enemy roster themes and variety vs. "mostly chasers" (classic). Elite and boss ideas (Herald/Dragon/Baron).
- The final threat: what is it, how does it feel, is it beatable?
- Destructible props (light sources) and which pickups they drop.

## R6 — Synergies & extras (opt-in beyond evolutions)
The classic baseline only has evolutions (+ optional unions). Show the menu from `docs/11` and ask which of
these to add: trait thresholds · item↔weapon combos beyond evolutions · element/status reactions · keystone
legendaries · cross-player co-op combos · curses and bargains · shrines/events · arcana-like run modifiers ·
run mutators / daily seeds · per-champion quirks. Also: how readable must synergies be (tooltips, recipe
screen, discovery by experiment), and how broken may builds get (tame / strong / absurd)?

## R7 — Co-op
- 1–4 players online; shared screen camera behavior (each own camera vs. shared zoomed-out).
- **Level-up model**: world keeps running while the leveling player chooses with a short protected window
  (recommended) / pause for everyone / pause only the leveler.
- XP/loot sharing, revives, scaling with player count, friendly fire (default off), drop-in/out.

## R8 — Meta progression
- Persistent gold + refundable permanent-upgrade shop (classic) / other.
- Unlock sources: achievements, gold. Collection/recipes screen. Ascension/difficulty ladder? Leaderboards
  among friends? Daily seed?

## R9 — Presentation & scope
- Art: pixel grid sizes (16×16 enemies / 16–24 characters / 32+ bosses are proposals), palette mood per stage,
  who makes the art (placeholders first; own sprites go to `assets/local/`, see `06`).
- Internal resolution (proposal 480×270, integer scaled), HUD layout, damage-number style.
- Audio: chiptune self-generated/CC0 music, 8-bit SFX. Languages (English only or more).
- Accessibility. Must-have for the first playable friends session vs. nice-to-have vs. "someday".
- Hard constraints (devices, offline play, browser support).

## End-of-interview review (agent produces)
1. One-page summary: "classic baseline + these deviations + these extras".
2. Table of every `agent-proposed` decision for the user to veto.
3. Top 5 risks (fun, technical, scope).
4. Which seams from `02`/`12` each deviation touches.
5. Ask: "Sign off, or change something?"

## Decision log format (`docs/10-DESIGN-DECISIONS.md`)
```
### D-014 · Level-up choices
- Round: R2 · Date: 2026-10-22 · Status: decided | agent-proposed | superseded by D-0xx
- Question: How many cards per level-up?
- Decision: 3 cards (classic), 1 reroll base from meta shop.
- References: Vampire Survivors; (Brotato shop rejected)
- Consequences: Offer UI shows 3 slots; luck may add a 4th later.
- Touches seams: progression system, ruleset.rules["levelUp.choices"], offer UI
```
