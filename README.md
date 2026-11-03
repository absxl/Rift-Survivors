<div align="center">

# ⚔️ RIFT SURVIVORS

**A browser-based, League-inspired survivor game with solo and online co-op.**

![Status: WIP](https://img.shields.io/badge/status-work%20in%20progress-f0a500?style=flat-square)
![Local: playable](https://img.shields.io/badge/local-playable-3fb950?style=flat-square)
![Fan project: non-commercial](https://img.shields.io/badge/fan%20project-non--commercial-8957e5?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square)

**Work in progress · playable locally · free fan project · contributors welcome**

</div>

> **Unofficial fan project.** Not affiliated with or endorsed by Riot Games. *League of Legends* and
> related names are trademarks of Riot Games, Inc. This project is non-commercial and has no ads,
> purchases, donations, or paid tiers.

Rift Survivors is a move-only survivor game: your weapons fire automatically, the swarm keeps coming, and
every level-up shapes the run. It uses League of Legends champions and regions as its skin, but the
mechanics, code, and placeholder art are built from scratch.

The project is still **WIP**, but the current build is fully playable locally.

---

## ⚡ Quick start

### Requirements

- **Node.js 22+**
- **pnpm** via Corepack (included with modern Node)
- A desktop browser and keyboard (controller supported)

```powershell
corepack pnpm install
corepack pnpm --filter @rift/client dev
```

Open **http://localhost:5173**.

### Optional co-op server

The client is playable solo without the server. For online co-op, build and run the WebSocket server in a
second terminal:

```powershell
corepack pnpm --filter @rift/server build
node packages/server/dist/index.js
```

Health check: `http://localhost:8787/health` → `{"ok":true,"rooms":0,"version":3}`

For LAN testing, start the client with `-- --host` and share the address Vite prints:

```powershell
corepack pnpm --filter @rift/client dev -- --host
```

---

## 🎮 Controls

| Input | Action |
|---|---|
| **WASD / arrow keys / gamepad** | Move |
| **Esc** | Pause |
| **Tab** | Scoreboard |
| **F3** | Diagnostics |
| **1–4** | Pick a level-up card |
| **R / X / B** | Reroll / skip / banish during level-up |
| **S** | Always movement — it never closes a level-up offer |

---

## 🧪 What is in the current build?

- **173 champions** across six classes, each with class weapons, a starting kit, and a permanent upgrade
  tree.
- **Two stages:** the Riftfield and the Noxian Warfront, with deterministic walls, water, lava, and
  breakable bushes.
- **Survivor-style runs:** auto-firing weapons, **6 weapons + 4 moves + 6 passives**, evolutions, synergies,
  timed chests, elites, bosses, and a 30-minute final-threat target.
- **44 permanent upgrades** and **26 in-run passives**, with deeper 10-rank/8-level tracks.
- **Region gacha:** keys, champion shards, 1-pulls, 10-pulls, an Epic+ guarantee, and a Darkin chest.
- **Collection tools:** search, filters, sorting, dossiers, source-backed champion profiles, and 67
  achievements across combat, survival, loot, exploration, collection, lore, and regions.
- **Online co-op:** room-based play for up to four players, shared runs, per-player stats, and optional
  server accounts/cloud saves.
- **Deterministic simulation:** seeded RNG, fixed-tick systems, save migrations, and a headless balance bot.

### Current state

| Area | Status |
|---|---|
| Core run loop | Playable |
| Champions and classes | Playable; class kits for most of the roster |
| Co-op | Implemented; still needs regular playtesting |
| Meta progression and collection | Playable |
| Art | Procedural placeholders; original art wanted |
| Balance | WIP; human playtesting still needed |
| Public deployment | Not set up yet — the game is tested locally |

### Known gaps

- Unique champion moves currently cover the original eight champions; the rest use class placeholder moves.
- The game ships with procedural placeholder art. Original art, UI polish, and animations are welcome.
- Balance is still being tuned. The headless bot is not a substitute for a human run.
- Mobile and small-screen layouts have had spot checks, but need more real-device testing.
- There is no public hosted build or matchmaking. Co-op is local/LAN/hosted-server friendly.

---

## 🗂️ Project layout

| Path | What it contains |
|---|---|
| `packages/sim` | Deterministic game engine, systems, combat, progression, terrain |
| `packages/content` | Champions, weapons, passives, enemies, stages, upgrades, achievements |
| `packages/client` | PixiJS renderer, HUD, meta screens, save data, input |
| `packages/server` | Co-op room server and optional accounts/cloud saves |
| `packages/shared` | Shared protocol/types |
| `docs/` | Design decisions, architecture, balance notes, asset policy, roadmap |
| `AGENTS.md` | Working rules for coding agents and contributors |

Useful docs:

- [`docs/14-IMPLEMENTATION-STATUS.md`](docs/14-IMPLEMENTATION-STATUS.md) — what is actually implemented
- [`docs/10-DESIGN-DECISIONS.md`](docs/10-DESIGN-DECISIONS.md) — the decisions log
- [`docs/06-ASSETS-AND-LEGAL.md`](docs/06-ASSETS-AND-LEGAL.md) — asset and fan-project rules
- [`docs/07-MULTIPLAYER.md`](docs/07-MULTIPLAYER.md) — co-op architecture
- [`docs/12-CHANGE-PLAYBOOK.md`](docs/12-CHANGE-PLAYBOOK.md) — how to make larger changes safely

---

## 🤝 Contributing — help is more than welcome

This is a hobby project, and any help is appreciated: code, playtesting, balance feedback, art, UI,
accessibility, documentation, or just a good bug report.

### Ways to help

- **Playtest** a run and report what felt confusing, unfair, or fun.
- **Balance:** test champions, stages, upgrades, and late-run pressure.
- **Art:** original pixel sprites, UI frames, icons, region banners, and class emblems.
- **Code:** engine systems, tests, co-op stability, performance, accessibility, and tooling.
- **Docs:** clarify setup, write guides, or improve the design notes.
- **Localization:** help make the UI readable beyond English.

### Before opening a larger change

1. Open an issue or start a discussion describing the idea.
2. Read [`AGENTS.md`](AGENTS.md) and [`docs/06-ASSETS-AND-LEGAL.md`](docs/06-ASSETS-AND-LEGAL.md).
3. Keep the simulation deterministic and content data-driven.
4. Add or update tests for engine/content changes.
5. Run the checks below.

```powershell
corepack pnpm exec biome check .
corepack pnpm -r typecheck
corepack pnpm -r test
corepack pnpm --filter @rift/client build
corepack pnpm --filter @rift/server build
```

Current local baseline: **179 tests passing, 2 opt-in balance tests skipped**.

### Art contributions

Art help is welcome, but the project has strict asset rules:

- Do **not** submit ripped Riot client assets, champion splash art, icons, models, audio, or music.
- Do **not** submit AI-generated depictions of existing League champions.
- The current private fan build uses a documented region-crest exception; those crests are not licensed
  for public redistribution.
- Original art should be discussed before it is committed. Local-only experiments belong in `assets/local/`
  (gitignored).

Please read [`docs/06-ASSETS-AND-LEGAL.md`](docs/06-ASSETS-AND-LEGAL.md) before contributing art.

---

## 💸 Non-commercial

Rift Survivors is **free to play and non-commercial**. There are no ads, microtransactions, paid tiers,
key sales, donations, or monetized links. If you want to support the project, contribute code, art,
testing, or feedback — not money.

---

## ⚖️ Legal

This is an unofficial, private, non-commercial fan project made for fun and learning. It is not affiliated
with, sponsored by, or endorsed by Riot Games. *League of Legends* and related names, characters, and
trademarks belong to Riot Games, Inc.

The survivor-game structure is inspired by the genre and by *Vampire Survivors* (© poncle). No Vampire
Survivors art, names, music, sound effects, or code are included. Please respect the asset policy before
redistributing anything from this repository.

<div align="center">

**Built for the love of the genre. Pull up a chair, break some bushes, and survive the rift. ⚔️**

</div>
