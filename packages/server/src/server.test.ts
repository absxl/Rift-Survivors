import { PROTOCOL_VERSION } from "@rift/shared";
import { afterAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { startServer } from "./server";

const PORT = 8799;
const server = startServer(PORT);

afterAll(() => server.close());

function connect(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

function inbox(ws: WebSocket): () => Promise<Record<string, unknown>> {
  const queue: Record<string, unknown>[] = [];
  ws.on("message", (data) => queue.push(JSON.parse(data.toString())));
  return async () => {
    while (queue.length === 0) await new Promise((r) => setTimeout(r, 5));
    return queue.shift() as Record<string, unknown>;
  };
}

describe("room server", () => {
  it("creates a room, starts, and streams snapshots", async () => {
    const ws = await connect();
    const next = inbox(ws);

    ws.send(
      JSON.stringify({
        type: "create",
        name: "p0",
        protocolVersion: PROTOCOL_VERSION,
        characterId: "lux",
      }),
    );
    const lobby = await next();
    expect(lobby.type).toBe("lobby");
    expect(typeof lobby.code).toBe("string");

    ws.send(JSON.stringify({ type: "start" }));
    const start = await next();
    expect(start.type).toBe("start");
    expect(start.yourPlayerId).toBe(0);

    const snap = await next();
    expect(snap.type).toBe("snapshot");
    expect(snap.tick).toBeGreaterThanOrEqual(0);

    ws.close();
  });

  it("rejects a protocol mismatch", async () => {
    const ws = await connect();
    const next = inbox(ws);
    ws.send(
      JSON.stringify({
        type: "create",
        name: "bad",
        protocolVersion: PROTOCOL_VERSION + 1,
        characterId: "lux",
      }),
    );
    const reply = await next();
    expect(reply.type).toBe("error");
    ws.close();
  });

  it("supports a second player joining a room", async () => {
    const host = await connect();
    const hostInbox = inbox(host);
    host.send(
      JSON.stringify({
        type: "create",
        name: "host",
        protocolVersion: PROTOCOL_VERSION,
        characterId: "lux",
      }),
    );
    const lobby1 = await hostInbox();
    const code = lobby1.code as string;

    const guest = await connect();
    const guestInbox = inbox(guest);
    guest.send(
      JSON.stringify({
        type: "join",
        code,
        name: "guest",
        protocolVersion: PROTOCOL_VERSION,
        characterId: "brand",
      }),
    );

    // Both players see a lobby with 2 players.
    const hostLobby = await hostInbox();
    expect(hostLobby.type).toBe("lobby");
    expect((hostLobby.players as unknown[]).length).toBe(2);
    await guestInbox();

    host.close();
    guest.close();
  });
});
