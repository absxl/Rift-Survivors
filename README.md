# Rift Survivors — project kit

A starter kit for building your own League-themed survivor game (online co-op, browser-based) with an AI
coding agent such as OpenCode. It targets the **look and feel of the original Vampire Survivors** — move-only
play, auto-firing weapons, 6 weapons + 4 signature moves + 6 passive slots, level-up evolutions, a ≈30-minute timeline, a pixel-perfect
low-res look — with League of Legends as the skin. Nothing is copied from Vampire Survivors or from the Pokémon
survivor project you found; the kit defines a fresh architecture (TypeScript + PixiJS, deterministic sim,
optional co-op server) built so **the design can change radically later without rewrites**.

## How to use it with OpenCode
1. Create a new empty folder `rift-survivors/` and `git init`.
2. Copy everything from this kit into it (`AGENTS.md`, `opencode.json`, `docs/`).
3. Open the folder in OpenCode and give it this first prompt:

   > Read AGENTS.md and the docs it references. Start milestone D0 (design interview) from
   > docs/05-ROADMAP.md. The baseline is the classic Vampire-Survivors structure in docs/13. Interview me
   > about what to keep, change or add, before writing any code.

4. Answer the questions (weapons, level-ups, evolutions, champions, stages, extras, co-op…). The agent
   records everything in `docs/10-DESIGN-DECISIONS.md` and finishes with a review for you to sign off.
5. Then: *"Next milestone."* — M0 → M13, one milestone per session. You get a playable classic-style vertical
   slice at **M4**, and a second design checkpoint (D1) after the first full run.
6. Whenever you want something new ("I played X and want Y"): tell the agent. It asks questions, logs the
   decision, and implements it through the architecture's seams (`docs/12-CHANGE-PLAYBOOK.md`).

## Files
| File | Purpose |
|---|---|
| `AGENTS.md` | Rules the agent reads automatically (workflow, hard rules, commands) |
| `opencode.json` | Always-loaded docs (decisions log, classic feel spec, stack, architecture) |
| `docs/00-PROJECT-BRIEF.md` | Vision, goals, non-goals |
| `docs/01-STACK.md` | Allowed tech |
| `docs/02-ARCHITECTURE.md` | Kernel, rulesets, pipeline, registries, pixel-perfect pipeline, performance |
| `docs/03-GAME-DESIGN.md` | **Provisional** classic-baseline design overview (regenerated after the interview) |
| `docs/04-DATA-SCHEMA.md` | Content schemas: weapons, passives, characters, enemies, stages, meta, offers |
| `docs/05-ROADMAP.md` | Milestones D0, M0–M13, D1 with checkboxes |
| `docs/06-ASSETS-AND-LEGAL.md` | Asset/IP rules (placeholders, local-only art, Vampire Survivors reference rules) |
| `docs/07-MULTIPLAYER.md` | Authoritative server, protocol, netcode |
| `docs/08-INFRA-DEPLOY.md` | Hosting, Docker, CI |
| `docs/09-DESIGN-INTERVIEW.md` | Baseline-first question script the agent uses with you |
| `docs/10-DESIGN-DECISIONS.md` | Decisions log — source of truth for mechanics |
| `docs/11-SYNERGIES-AND-QUIRKS.md` | Opt-in extras engine: tags, effects, modifiers, synergies, idea bank |
| `docs/12-CHANGE-PLAYBOOK.md` | How to make radical changes safely (seams, ADRs, migrations, recipes) |
| `docs/13-CLASSIC-FEEL-SPEC.md` | The classic survivor structure and feel to reproduce, plus the League skin mapping |
| `docs/14-IMPLEMENTATION-STATUS.md` | **Current implemented feature/status reference** (D-030): systems, content, gacha, save, co-op, tests, limitations |

## Tips
- Keep the repo **private**; put any real art only in `assets/local/` (gitignored). The placeholder art is
  generated pixel sprites, so the game looks right from day one.
- When the agent drifts, point it back: *"Re-read AGENTS.md hard rules and docs/13."*
- To add a champion later: *"Add a champion following docs/04; content only, no engine changes."*
- To change a core mechanic: *"Let's redesign level-ups. Follow the change playbook."*

> Unofficial fan project. Not affiliated with or endorsed by Riot Games or the makers of Vampire Survivors.
