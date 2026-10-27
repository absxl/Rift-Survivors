// WebSocket protocol between clients and the authoritative room server (docs/07).
// Payloads (snapshot/events/offer) are opaque here; client/server type them with
// @rift/sim. Bump PROTOCOL_VERSION on any breaking change.
import { z } from "zod";

export const PROTOCOL_VERSION = 3;

export interface LobbyPlayer {
  id: number;
  name: string;
  characterId: string;
  ready: boolean;
  /** False while a mid-run player is in the reconnect grace period. */
  connected?: boolean;
}

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create"),
    name: z.string(),
    protocolVersion: z.number(),
    characterId: z.string(),
    metaBonuses: z.record(z.number()).optional(),
    stageId: z.string().optional(),
  }),
  z.object({
    type: z.literal("join"),
    code: z.string(),
    name: z.string(),
    protocolVersion: z.number(),
    characterId: z.string(),
    metaBonuses: z.record(z.number()).optional(),
    stageId: z.string().optional(),
  }),
  z.object({
    type: z.literal("ready"),
    characterId: z.string(),
    ready: z.boolean(),
    metaBonuses: z.record(z.number()).optional(),
  }),
  z.object({ type: z.literal("input"), moveX: z.number(), moveY: z.number() }),
  z.object({ type: z.literal("choice"), choiceIndex: z.number() }),
  z.object({ type: z.literal("reroll") }),
  z.object({ type: z.literal("skip") }),
  z.object({ type: z.literal("banish"), optionIndex: z.number().int().nonnegative() }),
  z.object({ type: z.literal("rejoin"), token: z.string(), protocolVersion: z.number() }),
  z.object({ type: z.literal("resync") }),
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("ping"), t: z.number() }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type ServerMessage =
  | { type: "lobby"; code: string; players: LobbyPlayer[] }
  | { type: "start"; seed: number; yourPlayerId: number; token?: string }
  | { type: "snapshot"; tick: number; snapshot: unknown; events: unknown[] }
  | { type: "snapshot-delta"; tick: number; delta: unknown; events: unknown[] }
  | { type: "offer"; offer: unknown }
  | { type: "end"; stats: unknown }
  | { type: "error"; message: string }
  | { type: "pong"; t: number };
