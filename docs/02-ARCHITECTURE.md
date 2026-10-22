# 02 — Architecture

## Repo layout

```
rift-survivors/
├─ AGENTS.md
├─ opencode.json
├─ docs/
├─ assets/
│  ├─ placeholder/        # procedural/CC0 placeholders — committed
│  └─ local/              # real art/audio the user supplies — GITIGNORED
├─ packages/
│  ├─ sim/                # PURE deterministic game simulation (no DOM, no Node APIs)
│  ├─ content/            # typed + validated game data (champions, enemies, items, waves)
│  ├─ shared/             # network protocol, zod schemas shared by client/server
│  ├─ client/             # Vite + PixiJS app, UI, audio, input, solo Worker host
│  └─ server/             # Node WebSocket room server (M10+)
├─ package.json  pnpm-workspace.yaml  biome.json  tsconfig.base.json
```

Dependency direction (never reverse): `content → sim → (client | server)`, `shared → (client | server)`.
`sim` may import types from `content`, nothing else.

## Simulation rules (`packages/sim`)

1. **Fixed timestep**: 30 ticks/second (`TICK_MS = 33.333`). Render interpolates between ticks.
2. **Deterministic**: same seed + same input stream = same state, bit for bit.
   - Randomness only via `Rng` (xoshiro128**, seeded) stored in sim state. Never `Math.random`.
   - Time only via `state.tick`. Never `Date.now`/`performance.now`.
   - No iteration over `Map`/`Set` with insertion-dependent ordering in logic; use arrays/typed arrays
     sorted by entity id.
   - Floating point is fine (same JS engine class on both ends is assumed for friends-only play), but avoid
     `Math.sin/cos` in hot gameplay paths where possible; precompute lookup tables.
3. **API surface** (keep tiny):
   ```ts
   createWorld(ruleset: RulesetDef, config: RunConfig, seed: number): World
   step(world: World, inputs: PlayerInput[]): SimEvent[]   // advances exactly one tick
   snapshot(world: World): Snapshot                          // for network/render
   applyChoice(world: World, playerId: number, choiceIndex: number): void  // level-up picks
   ```
4. **Events out, never callbacks**: `step` returns events (`EnemyDied`, `LevelUp`, `Hit`, `GemPickup`…)
   which the client uses for SFX/particles/damage numbers. The sim never plays sounds or draws anything.

## Entity storage
Struct-of-arrays with pooled slots; no per-entity objects in hot paths.

```ts
class Enemies { x: Float32Array; y: Float32Array; hp: Float32Array; kind: Uint16Array; alive: Uint8Array; ... }
```
- Fixed capacity per type (enemies 1500, projectiles 800, gems 2000, damage-zones 200); a full pool drops
  the spawn (never allocates).
- Free-list for slot reuse. Entity references across ticks are `(slot, generation)` pairs.

## Spatial hash
Uniform grid (cell = 64 px) rebuilt each tick for enemies. All "who is near X" queries (projectile hits,
auras, gem magnet, targeting) go through it. No O(n²) loops.

## How data drives code
Data files reference modules by string id and the engine resolves them through registries (see
"Change-resilient core" below). Adding a champion = new data entry using existing behaviors/effects.
A brand-new mechanic = one new registered module + tests. **No champion/enemy/item name or id may appear in
`sim` code.**

## Change-resilient core (READ THIS — the design WILL change radically)

The design is decided by interview (`09`, `10`) and expected to be reworked later (`12`). So the engine is a
small, stable **kernel** plus swappable modules. The kernel owns only: world stores, seeded RNG, event queue,
modifier stack, effect dispatcher, registries and the system pipeline. Everything else is a module.

### 1. Rulesets
A `RulesetDef` (data, in `packages/content/src/rulesets`) selects and configures the modules for a run:

```ts
interface RulesetDef {
  id: string; schemaVersion: number;
  pipeline: SystemId[];                 // ordered list of systems executed each tick
  progression: string;                  // id of a ProgressionSystem impl ("xp-cards", "wave-shop", ...)
  world: string;                        // "endless-field" | "arena" | "dungeon" ...
  director: string;                     // spawn/run-script driver
  economy: string;                      // "gold-shop" | "none" ...
  rules: Record<string, number | boolean | string>;   // named tunables/switches (see 11 "rule overrides")
  features: Record<string, boolean>;    // flags to run old/new behavior side by side
  modifiers?: ModifierDef[];            // run mutators
  contentPacks: string[];               // packs enabled for this ruleset
}
```
Changing the game's fundamentals = new/edited ruleset + (if needed) a new module. Not a rewrite.

### 2. System pipeline (replaces a hard-coded tick order)
A `System` is `(world, ctx) => void`, registered by id. `step` runs `ruleset.pipeline` in order. The
**default pipeline** (a proposal; the interview may change it):

```
input → status&cooldowns → director(spawn) → weapons(behaviors) → enemy-ai(+recycle) → spatial-hash →
projectiles&collision → damage-resolution → effects(triggers) → deaths&drops → pickups →
progression(xp/levelup/offers) → economy → synergy-refresh(if loadout changed) → tick++
```
Systems communicate only through world stores, the event queue and the modifier stack — never by importing
each other. Each system has a contract test; swapping an implementation must keep it green.

### 3. Swappable module interfaces (define before implementing)
```ts
interface ProgressionSystem { onXp(...): void; offerChoices(...): Offer[]; applyChoice(...): void }
interface SpawnDirector      { update(world, script): void }
interface EconomySystem      { onKill(...): void; shopOffer?(...): Offer[]; purchase?(...): void }
interface WorldGenerator     { chunkAt(x, y, seed): Chunk }
```
Implementations are chosen by id from the ruleset. **UI renders `Offer` objects generically** (cards, shop
rows, chest choices), so a new progression style rarely needs new UI logic.

### 4. Registries (extension points)
`registerWeaponBehavior`, `registerEnemyBehavior`, `registerSystem`, `registerProgression`,
`registerTrigger`, `registerCondition`, `registerAction`, `registerRuleKey`, `registerStat`,
`registerWorldGenerator`. Content references them by string id; startup validation fails fast if a
referenced id is missing. (Example registrations for behaviors:)

```ts
registerWeaponBehavior("shoot-nearest", shootNearestBehavior);   // ids listed in 13 §4
registerWeaponBehavior("sweep", sweepBehavior);
registerWeaponBehavior("orbit", orbitBehavior);
registerWeaponBehavior("aura", auraBehavior);
registerWeaponBehavior("ground-pool", groundPoolBehavior);
registerEnemyBehavior("chase", chase);
registerEnemyBehavior("ranged", ranged);
registerEnemyBehavior("charge", charge);
registerEnemyBehavior("summoner", summoner);
```

### 5. Effects, modifiers, tags, synergies
Generic, data-driven engine described in `11-SYNERGIES-AND-QUIRKS.md`. All gameplay numbers are read
through the modifier stack (`stat(player, "cooldown")`, `param(weapon, "pierce")`) — never directly from
base data in hot code — so any item, synergy, curse or mutator can alter them.

### 6. Schema-driven stores & snapshot codec
World stores are declared once in `packages/sim/src/schema` (field name, type, quantization, whether
networked). The snapshot encoder/decoder, delta compression, pool allocation and a debug inspector are
**generated** from that schema. Adding or removing an entity field is a one-line schema change.

### 7. Content packs
Content ships as packs: `{ id, schemaVersion, requires: [], defs }`. A ruleset enables packs; later packs
may override earlier defs by id. Typical packs: `core` (generic enemies/items), `lol-pack` (the user's League
roster and names), `placeholder-art`, `original-pack`. Swapping IP or adding a seasonal pack needs no engine change.

### 8. Versioning (so old data survives redesigns)
- Content `schemaVersion` + migration functions (`content/migrations`).
- Save files `{ version, data }` + `client/save/migrations/NNN-*.ts`; fixtures of every old version are tested.
- Network `PROTOCOL_VERSION` in the handshake; mismatches are refused with a readable message.
- Replays (if added) store ruleset id + content pack versions + seed + inputs.

### 9. Enforced boundaries (CI "fitness" tests, see 12)
No content ids in `sim`; no rules in UI; no `Math.random`/time in `sim`; all registry references resolve.

### Default tick order (informational; the ruleset pipeline is authoritative)
1. Inputs → 2. Status/cooldowns → 3. Director → 4. Weapons → 5. Enemy AI → 6. Spatial hash →
7. Projectiles/collisions → 8. Damage → 9. Effects → 10. Deaths/drops → 11. Pickups →
12. Progression → 13. Economy → 14. Synergy refresh (on loadout change) → 15. `state.tick++`

## Pixel-perfect pipeline (the classic look — see `13` §14)
- The game renders to an **internal low-resolution target** (proposal 480×270). That target is scaled to the
  window by an **integer factor** with **nearest-neighbour** filtering; letterbox when the window isn't an exact
  multiple. Never scale by a fractional factor and never smooth.
- World and sprite positions are snapped to whole internal pixels at draw time (`roundPixels`); the sim keeps
  float positions. Interpolated positions are rounded after interpolation.
- All textures use nearest sampling and no mipmaps; the atlas is built from 16×16-grid art (placeholders
  generated procedurally, real art from `assets/local/`).
- HUD and menus are drawn at the same internal resolution with a bitmap pixel font, so they scale consistently.
- Enemy recycling, weapon hit cooldowns (typed-array lookups) and pooled/capped damage numbers keep horde
  scenes within budget (see 13 §9, §16).

## Client rendering
- Client holds `prevSnapshot` and `currSnapshot`; render at display rate with
  `alpha = (now - lastTickTime) / TICK_MS`.
- Camera is locked to the local player (no smoothing needed at pixel scale; snap to whole pixels). The stage
  is a bounded (or wrapping) tiled map from `StageDef`, rendered by chunks of tiles.
- Sprites from a texture atlas. Enemy draw order by y for depth. Cull offscreen.
- Damage numbers & particles are client-only cosmetics (never affect sim).

## Solo vs co-op hosting
| Mode | Where sim runs | Input path |
|---|---|---|
| Solo | Web Worker in the browser | main thread → postMessage → worker |
| Co-op | Node server (`packages/server`) | clients → WebSocket → server |

Both use the same `Host` interface in the client (`sendInput`, `onSnapshot`), so game code doesn't care.

## Performance budget (MacBook M1, Chrome/Safari)
- 500 enemies + 300 projectiles + 1000 gems: ≥ 60 FPS render, sim step ≤ 4 ms.
- Zero allocations per tick in steady state (verify with a test that runs 10k ticks and checks heap
  doesn't grow; or at least a dev-only counter of `new` in hot paths).
- Texture atlas, one draw call per layer where possible.

## Testing strategy
- Unit tests per system with a seeded world.
- **Determinism test**: run 5,000 ticks twice with scripted inputs, deep-compare snapshots.
- **Content test**: every content entry validates against its Zod schema; every referenced behavior id exists.
- **Balance smoke test**: headless bot runs N seeds and asserts a run doesn't crash and enemy count stays in budget.
