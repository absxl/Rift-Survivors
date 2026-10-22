# AGENTS.md — Rift Survivors (working title)

A browser-based survivor game that must **look and feel like the original Vampire Survivors** (move-only,
auto-firing weapons, 6+6 slots, evolutions from chests, ≈30-min timeline, pixel-perfect low-res look), with
League-of-Legends-inspired champions as a skin, for a small private group of friends (1–4 players co-op).
Non-commercial hobby project, built from scratch in TypeScript.

**The classic structure is the baseline** (`docs/13-CLASSIC-FEEL-SPEC.md`), but the design is NOT final: it is
confirmed with the user through an interview and is expected to change over time. The architecture is built
for that (rulesets, registries, effects, content packs). Respect it. Never copy Vampire Survivors' art,
names, music or code (`docs/06`).

## How to work on this repo

1. Read `docs/05-ROADMAP.md` and find the **first unchecked milestone**. Work ONLY on that milestone.
2. **If it is `D0` or `D1` (design milestones): do NOT write code.** Follow `docs/09-DESIGN-INTERVIEW.md`:
   ask the user questions (max 4 per message, multiple choice + free text, anchored to reference games),
   record every answer in `docs/10-DESIGN-DECISIONS.md`, and stop when the user signs off.
3. Before coding, read the docs relevant to the milestone:
   - `docs/10-DESIGN-DECISIONS.md` — **source of truth for mechanics** (overrides `03`)
   - `docs/01-STACK.md` — allowed tech. No new dependencies without asking.
   - `docs/02-ARCHITECTURE.md` — kernel, rulesets, pipeline, registries, performance rules.
   - `docs/13-CLASSIC-FEEL-SPEC.md` — the classic survivor structure and feel to reproduce (weapons, passives,
     evolutions, chests, stats, stages, meta, pixel-perfect look, juice checklist).
   - `docs/03-GAME-DESIGN.md` — provisional design (regenerated from the decisions log after D0).
   - `docs/04-DATA-SCHEMA.md` — content schemas.
   - `docs/11-SYNERGIES-AND-QUIRKS.md` — tags, effects, modifiers, synergies engine.
   - `docs/12-CHANGE-PLAYBOOK.md` — how to make big changes safely.
   - `docs/06-ASSETS-AND-LEGAL.md` — asset rules (read before touching art/audio/names).
   - `docs/07-MULTIPLAYER.md` / `docs/08-INFRA-DEPLOY.md` — only for those milestones.
4. Plan briefly (short checklist), implement in small steps, commit after each working step.
5. Done = `pnpm typecheck && pnpm lint && pnpm test` all green and verified in the browser.
6. Tick the milestone's checkboxes in `docs/05-ROADMAP.md`, note deferred items under "Notes", then stop and
   summarize. Do not start the next milestone unless asked.

## When the user wants something new or different (at any time)
- A new idea, "I played game X and want Y", or a redesign request → **do not just implement it.**
  1. Map it to the seams in `docs/12-CHANGE-PLAYBOOK.md`.
  2. Ask the clarifying questions from the matching round in `docs/09` (using reference games).
  3. Log the decision in `docs/10`, write an ADR in `docs/adr/` if a seam, schema or protocol changes.
  4. Implement through a seam (ruleset/system/behavior/effect/content), behind a feature flag if large.
- Never invent mechanics that are not in `docs/10`. If a decision is missing, ask.
- If you think a different approach would be better, say so and let the user choose.

## Hard rules

- **TypeScript strict mode everywhere.** No `any` unless commented with a reason.
- **`packages/sim` is pure.** No DOM, `window`, `Math.random()`, `Date.now()`, `performance.now()`.
  Randomness comes from the seeded RNG; time from the fixed tick counter. (Enables tests, replays, netcode.)
- **Keep the classic feel.** Pixel-perfect rendering (internal low-res target, integer scale, nearest
  filtering), move-only controls, auto-fire weapons, per-enemy hit cooldowns, enemy recycling. Don't add
  smoothing, aiming, dashes or extra buttons unless a decision in `docs/10` says so.
- **Engine knows no content.** No champion/enemy/item/synergy names or ids in `packages/sim` or the UI
  logic. Match by **tags** and registries. New behaviour = register a module and reference it by id from data.
- **Everything tunable is a stat, a param or a named rule key** reachable through the modifier stack and the
  ruleset. No magic numbers in systems.
- **Use the seams** (`docs/12`): ruleset → system pipeline → registries → effects/modifiers → content packs.
  If a change doesn't fit a seam, write an ADR proposing a new seam and ask the user.
- **UI contains no rules.** It renders snapshots, `SimEvent`s and generic `Offer`s.
- **Everything versioned**: content `schemaVersion`, save `version` + migrations, network `PROTOCOL_VERSION`.
- **All player-visible strings via i18n keys** (`locales/*.json`).
- **No copyrighted/ripped assets in the repo.** Use procedural placeholders; real art goes in
  `assets/local/` (gitignored). See `docs/06`.
- **No per-frame allocations in hot loops** (enemies, projectiles, gems, collision, effect dispatch).
  Budget: 500 enemies + 300 projectiles at 60 FPS on a MacBook M1.
- **Every system, behavior, effect kind and synergy family gets unit tests** (deterministic by seed).
- **Ask before:** adding a dependency, restructuring packages, deleting files you didn't create, or
  changing a schema without following the playbook.

## Commands

```
pnpm install
pnpm dev            # client on http://localhost:5173
pnpm dev:server     # multiplayer server (from milestone M10)
pnpm test           # vitest, all packages (includes fitness + determinism tests)
pnpm typecheck      # tsc --noEmit across workspace
pnpm lint           # biome check
pnpm build          # production build of client + server
```

## Code style

- Small modules, named exports, no default exports.
- File names `kebab-case.ts`. Types/interfaces `PascalCase`. Constants `UPPER_SNAKE`.
- Comments explain *why*, not *what*.
- Conventional commits: `feat(sim): add projectile pierce`, `fix(client): camera jitter`.

## Definition of done (any task)

- Works in the browser (`pnpm dev`), verified by running it, not just compiling.
- Tests added/updated and green, including determinism and fitness tests.
- No new lint/type errors.
- Docs updated if behaviour, schema, ruleset or commands changed; decisions log and ADRs kept current.
