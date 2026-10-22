# 00 — Project Brief

## Vision
A browser-based survivor game that **looks and feels like the original Vampire Survivors**: you only move,
weapons fire automatically, huge swarms close in, each level-up lets you build your loadout (6 weapons +
6 passive items), chests evolve maxed weapons, and an end-of-run threat arrives around minute 30. Gold buys
permanent upgrades between runs. Play solo or online co-op with up to 3 friends.

Flavour: League of Legends as a **skin** — champions are the characters (their signature ability is the
starting weapon), abilities are weapons, items are passive items, Herald/Dragon/Baron are timeline bosses,
minions/jungle/void creatures are the horde. The structure and feel are in `13-CLASSIC-FEEL-SPEC.md`.

## Design is open
Mechanics (XP, level-ups, items, synergies, quirks, co-op rules…) are decided with the user through the
interview in `09-DESIGN-INTERVIEW.md` and logged in `10-DESIGN-DECISIONS.md`. The architecture is built to
absorb radical redesigns (`02`, `12`). Nothing in `03` is final.

## Goals
- Playable solo in the browser with zero setup (open a URL).
- Co-op 1–4 friends via a room code.
- Content (champions, enemies, items, waves) easy to add by editing data files only.
- Runs smoothly on laptops (budget in architecture doc).
- Fully buildable by an AI coding agent milestone by milestone.

## Non-goals
- No monetization, ads, donations, or selling anything (also required by the asset/legal doc).
- No accounts with passwords, no public matchmaking, no anti-cheat.
- No mobile-first design (keyboard/controller first; touch is a stretch goal).
- No 3D, no aiming or manual abilities (classic move-only play), no smoothed/high-res art style.

## Audience
The author and a handful of friends. Private by default.

## Success criteria
1. A full run (≈30 min) is fun, and the first 5 minutes already feel like the classic loop.
2. At least 6 champions feel meaningfully different through their starting weapon and growth.
3. 4 friends can join a room and finish a run without desyncs.
4. Adding a new champion takes < 1 hour and no engine changes (unless it needs a new behavior).
5. Swapping a core mechanic (e.g. level-up system) is a ruleset/module change, not a rewrite.
6. Synergies and quirks can be added as pure data using tags, effects and modifiers.

## Working title
"Rift Survivors" — rename freely; keep it out of anything that implies Riot endorsement.
