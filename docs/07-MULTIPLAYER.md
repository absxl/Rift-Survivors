# 07 — Multiplayer

Model: **server-authoritative, input-based**. The server runs `packages/sim` at 30 Hz. Clients send
inputs, receive snapshots, interpolate remote entities, and predict their own movement.
Friends-only: no auth, no anti-cheat, rooms by short code.

## Transport
- WebSocket (`ws`), **binary** frames (ArrayBuffer + DataView) for snapshots/inputs; JSON for lobby messages.
- One room = one sim instance. Max 4 players. Idle room destroyed after 60 s empty.

The server runs whichever **ruleset** the room selects, so redesigns (see `12`) don't change the netcode:
snapshots are encoded by the schema-generated codec, `Offer`s are sent per player, and the handshake
rejects clients whose `protocolVersion` or content-pack hash differs from the server's with a readable message.

## Messages (defined + Zod-validated in `packages/shared`)

Client → Server
| Type | Payload | Rate |
|---|---|---|
| `join` | `{ code, name, protocolVersion, contentHash }` | once |
| `create` | `{ name, protocolVersion, contentHash, rulesetId }` | once |
| `ready` | `{ championId, ready }` | on change |
| `input` | `{ seq, tick, moveX, moveY }` (move-only; extend only if a decision adds buttons) | every tick (30 Hz) |
| `choice` | `{ offerId, optionId }` (or reroll/skip/banish) | on pick |
| `ping` | `{ t }` | 1 Hz |

Server → Client
| Type | Payload | Rate |
|---|---|---|
| `lobby` | players, champions, ready flags, code | on change |
| `start` | `{ seed, runConfig, yourPlayerId }` | once |
| `snapshot` | tick, ackSeq, players, enemies, projectiles, gems, zones (delta-compressed) | 15 Hz |
| `events` | list of `SimEvent` since last snapshot | with snapshot |
| `offer` | `Offer` (level-up cards, chest contents… see 04) to a single player; the world keeps running (see 13 §6) | on level-up / chest |
| `end` | result stats | once |

## Server loop
1. Collect latest input per player for the tick (if missing, repeat the last move input).
2. `step(world, inputs)`.
3. Send a snapshot every 2nd tick (15 Hz) to each client. Start there and tune against the byte budget below.
4. Send snapshots with per-client **interest filtering**: only entities within ~1.5 screens of that player.

## Client
- **Remote entities**: render ~100 ms in the past, interpolating between the two surrounding snapshots.
- **Local player**: client-side prediction of movement with the shared `sim` movement function;
  reconcile on snapshots using `ackSeq` (rewind + replay unacked inputs). Combat results are never predicted.
- Level-up UI shows locally; choice is sent and applied when the server confirms.

## Snapshot size budget
Target < 8 KB per snapshot per client at 500 enemies in range.
- Quantize positions to 1/8 px → int16 deltas relative to the last acked snapshot.
- Enemies identified by `(slot, generation)`; send only changed ones + removals.
- Projectiles are **not** sent individually if deterministic from spawn event (id, origin, velocity, spawnTick):
  send the spawn event once and let the client simulate its straight-line motion visually.

## Robustness
- Heartbeat; drop clients silent for 10 s. Reconnect with a session token within 30 s to retake your slot.
- Server validates everything with Zod and clamps input (|move| ≤ 1). Never trust sizes/indices.
- Rate-limit messages per connection.
- Desync recovery: a full snapshot (not delta) is sent on request or when `ackSeq` lags > 2 s.

## Testing
- Unit: encode/decode roundtrip for every message; delta snapshot apply = full state.
- Integration (Vitest + in-process server): 4 fake clients, 60 s run, assert no exceptions and
  snapshot size within budget.
- Network sim: wrap the socket in a delay/jitter/loss proxy (100 ms ± 30 ms, 2% loss) for manual play tests.
