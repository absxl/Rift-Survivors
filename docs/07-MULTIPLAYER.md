# 07 — Multiplayer

Model: **server-authoritative, input-based**. The server runs `packages/sim` at 30 Hz. Clients send
inputs, receive full snapshots/deltas, interpolate between frames, and visually lead their own movement.
Friends-only: no auth, no anti-cheat, rooms by short code.

**Current protocol version: 3** (D-030 added optional per-player meta bonuses).

## Transport (implemented)

- WebSocket (`ws`), **JSON** frames for every message (lobby, snapshots, offers, errors).
- One room = one sim instance. Max 4 players. A mid-run disconnect reserves the slot for **60 s**.
- The server rejects protocol mismatches (`PROTOCOL_VERSION`) with a readable error.
- The sim runs at 30 Hz and broadcasts every tick.

**Not yet implemented** (aspirational from the kit): binary/ArrayBuffer frames, a generated binary codec,
per-client interest filtering, input `seq`/`ackSeq`, 15 Hz snapshots, rate limiting, content-pack hashes.

## Messages (`packages/shared`, Zod-validated client → server)

Client → Server
| Type | Payload | Rate |
|---|---|---|
| `create` / `join` | `{ name, protocolVersion, characterId, metaBonuses?, stageId?[, code] }` | once |
| `ready` | `{ characterId, ready, metaBonuses? }` | on change |
| `start` | — (host) | once |
| `input` | `{ moveX, moveY }` | every tick (30 Hz) |
| `choice` | `{ choiceIndex }` | on pick |
| `reroll` / `skip` | — | on level-up |
| `banish` | `{ optionIndex }` | on level-up |
| `rejoin` | `{ token, protocolVersion }` | after a drop |
| `resync` | — | if a delta cannot be applied |
| `ping` | `{ t }` | 1 Hz |

Server → Client
| Type | Payload | Rate |
|---|---|---|
| `lobby` | players (id/name/character/ready/connected), code | on change |
| `start` | `{ seed, yourPlayerId, token }` | once per join/rejoin |
| `snapshot` | `{ tick, snapshot, events }` (full) | join/rejoin/resync + every 150 ticks |
| `snapshot-delta` | `{ tick, delta, events }` (changed entity rows) | every other tick |
| `offer` | `Offer` to a single player | level-up / chest |
| `end` | result stats | once |
| `error` / `pong` | message / echo | as needed |

## Per-player meta bonuses

The lobby carries each player's selected champion meta tree. `create`, `join`, and `ready` accept an
optional `metaBonuses: Record<string, number>`; the server stores it on the client. `startRoom` passes
`playerMetaBonuses: clients.map(c => c.metaBonuses)` into `createWorld`, and the sim applies each bundle
to that player's own modifier stack. This is what makes per-champion upgrades work independently in
co-op; no global server-side account data is involved.

The host's `stageId` selects the stage for the room. Snapshots carry `stageId`/`stageName`, so guests
render the host's stage even when their own selected stage differs.

## Snapshots & deltas

- `snapshot(world)` includes party XP/level, per-player `RunStats`, stage id/name, and one compacted store
  per kind (`slots`, `generations`, field arrays).
- `buildSnapshotDelta(prev, next)` sends the full `slots`/`generations` lists plus **full field values for
  changed rows only** (new, recycled, or modified slots). `applySnapshotDelta(prev, delta)` reconstructs a
  full snapshot; a `baseTick` mismatch throws.
- The server keeps `room.lastSent` as the delta base. Full snapshots are sent on join, rejoin, `resync`, and
  every 150 ticks. A client whose base is missing requests `resync`; the server replies with a full snapshot
  and makes the next broadcast full too.
- Deltas are JSON (no binary encoding/compression yet). Static stores (e.g. un-magnetized gems) send no rows;
  moving enemies/projectiles send rows every tick.

## Client

- **Interpolation:** the renderer keeps the previous + current snapshots and lerps player, enemy, projectile,
  gem, and pickup positions at display rate; the camera follows the interpolated local player. This adds
  roughly one tick of smoothing latency.
- **Local prediction (visual only):** the local sprite and camera get a small input-driven lead (capped at
  6 px). It decays on snapshots, when input stops, and when no snapshot arrives for 120 ms (pause/offer/
  disconnect). The server remains fully authoritative — no rewind/replay or combat prediction yet.
- Level-up UI is local; the choice/reroll/skip/banish is sent and applied by the server.

## Robustness

- **Reconnect:** `start` carries a per-client token. On an unexpected close the server marks the player
  disconnected (zero input, pending offer cleared), keeps the room ticking only while someone is connected,
  and reserves the slot for 60 s. The client retries `rejoin` with backoff (8 attempts, ~49 s total, 10 s
  cap), then shows CONNECTION LOST. A successful rejoin restores the same `playerId` and sends a fresh full
  snapshot.
- **Resync:** a failed delta apply requests a full snapshot; the next broadcast is forced full.
- Server message parsing is Zod-validated; a bad message returns `error` without crashing the room.

## Testing

- Sim: delta encode/apply round-trip, chained deltas, add/remove rows, static rows omitted, base mismatch.
- Server: lobby/start/snapshot, 4-player jitter stress, offer reroll/banish/skip, reconnect + bad token,
  delta after full + resync, room capacity/mid-run join rejection.
- Renderer prediction/interpolation is visual; verify by feel on LAN (no automated Pixi test yet).

## Planned / not done

- Binary codec + quantization; input acks + rewind/replay prediction; interest filtering; snapshot byte
  budget enforcement; rate limiting; full reconnect after >60 s; deployment (needs credentials, `docs/08`).
