// WebSocket protocol between clients and the authoritative room server (docs/07).
// Payloads (snapshot/events/offer) are opaque here; client/server type them with
// @rift/sim. Bump PROTOCOL_VERSION on any breaking change.
import { z } from "zod";

export const PROTOCOL_VERSION = 1;

export interface LobbyPlayer {
  id: number;
  name: string;
  characterId: string;
  ready: boolean;
}

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create"),
    name: z.string(),
    protocolVersion: z.number(),
    characterId: z.string(),
  }),
  z.object({
    type: z.literal("join"),
    code: z.string(),
    name: z.string(),
    protocolVersion: z.number(),
    characterId: z.string(),
  }),
  z.object({ type: z.literal("ready"), characterId: z.string(), ready: z.boolean() }),
  z.object({ type: z.literal("input"), moveX: z.number(), moveY: z.number() }),
  z.object({ type: z.literal("choice"), choiceIndex: z.number() }),
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("ping"), t: z.number() }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type ServerMessage =
  | { type: "lobby"; code: string; players: LobbyPlayer[] }
  | { type: "start"; seed: number; yourPlayerId: number }
  | { type: "snapshot"; tick: number; snapshot: unknown; events: unknown[] }
  | { type: "offer"; offer: unknown }
  | { type: "end"; stats: unknown }
  | { type: "error"; message: string }
  | { type: "pong"; t: number };
