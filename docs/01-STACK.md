# 01 — Stack (allowed technology)

Do not add dependencies outside this list without asking the user.

## Language & tooling
| Purpose | Choice | Notes |
|---|---|---|
| Language | TypeScript 5.x, `strict: true` | Everywhere (client, server, sim, content) |
| Package manager | pnpm workspaces | Monorepo |
| Node | 22 LTS | `.nvmrc` committed |
| Bundler / dev server | Vite | Client only |
| Tests | Vitest | All packages |
| Lint / format | Biome | Replaces ESLint + Prettier |
| Schema validation | Zod | Content + network messages |
| CI | GitHub Actions | typecheck, lint, test, build |

## Client
| Purpose | Choice | Notes |
|---|---|---|
| Rendering | PixiJS v8 (WebGL/WebGPU) | Pixel-perfect: render to a low-res target (≈480×270), integer upscale, nearest filtering, `roundPixels` (see 02, 13 §14). Batched sprites for hordes |
| Pixel font | Bitmap font generated in code (or CC0) | For HUD, menus and damage numbers; no smooth vector fonts in-game |
| Simulation host | Web Worker (solo mode) | Same `packages/sim` code as the server |
| UI (menus, HUD, level-up) | Plain DOM + CSS (or Preact if it gets complex) | Keep UI out of the canvas |
| Input | Native keyboard/mouse + Gamepad API | Rebindable later |
| Audio | WebAudio, tiny wrapper in `client/src/audio` | Procedural SFX first (zzfx-style); music optional |
| Persistence | `localStorage` (settings, unlocks) | No cloud save in v1 |

## Server (multiplayer, milestone M10+)
| Purpose | Choice | Notes |
|---|---|---|
| Runtime | Node 22 | Same TS toolchain |
| Transport | `ws` (WebSocket) | Binary messages (see multiplayer doc) |
| Authority | Server runs `packages/sim` | Clients send inputs, receive snapshots |
| Rooms | In-memory, room code (4–5 letters) | No database |

## Why these choices (so the agent doesn't second-guess them)
- **Vite + TS + PixiJS**: runs in any browser, friends just open a link; fastest path to a working game.
- **Pure sim package**: the single most important decision. Same code runs in a Worker (solo), on the
  server (co-op) and in Vitest (tests). Determinism comes for free if the rules in 02 are followed.
- **No ECS library**: a small hand-rolled struct-of-arrays store in `packages/sim` (see architecture).
- **No database**: friends-only game; nothing needs to persist server-side.
- **No game engine (Godot/Unity/Phaser)**: deliberate. A custom sim + Pixi gives control over horde
  performance and makes the multiplayer model simple.

## Explicitly not allowed (unless user approves)
Phaser, Three.js, Redux/MobX, Colyseus/Socket.IO, any ORM or database, any CSS framework,
React (Preact is OK if approved), any lib that touches `Math.random`/`Date.now` inside `packages/sim`.

## Versions
Pin exact versions in `package.json` (no `^`) so builds are reproducible. Update deliberately.
