import { PROTOCOL_VERSION } from "@rift/shared";
import { type SnapshotDelta, type WorldSnapshot, applySnapshotDelta } from "@rift/sim";
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

  it("runs a 4-player room under jittered inputs", async () => {
    const sockets: WebSocket[] = [];
    const inboxes: Array<() => Promise<Record<string, unknown>>> = [];
    const characters = ["lux", "brand", "ahri", "ryze"];

    try {
      const host = await connect();
      sockets.push(host);
      const hostInbox = inbox(host);
      inboxes.push(hostInbox);
      host.send(
        JSON.stringify({
          type: "create",
          name: "host",
          protocolVersion: PROTOCOL_VERSION,
          characterId: characters[0],
        }),
      );
      const created = await nextOfType(hostInbox, "lobby");
      const code = created.code as string;

      for (let i = 1; i < 4; i++) {
        const ws = await connect();
        sockets.push(ws);
        const next = inbox(ws);
        inboxes.push(next);
        ws.send(
          JSON.stringify({
            type: "join",
            code,
            name: `p${i}`,
            protocolVersion: PROTOCOL_VERSION,
            characterId: characters[i],
          }),
        );
      }

      // The host sees the lobby fill to 4 (one lobby message per join).
      let lobbyMsg = await nextOfType(hostInbox, "lobby");
      while ((lobbyMsg.players as unknown[]).length < 4) {
        lobbyMsg = await nextOfType(hostInbox, "lobby");
      }
      expect((lobbyMsg.players as unknown[]).length).toBe(4);

      host.send(JSON.stringify({ type: "start" }));
      const starts = await Promise.all(inboxes.map((next) => nextOfType(next, "start")));
      expect(new Set(starts.map((s) => s.yourPlayerId)).size).toBe(4);

      // Auto-resolve level-up offers so a pause can never stall the stress run.
      for (const ws of sockets) {
        ws.on("message", (data) => {
          const msg = JSON.parse(data.toString()) as { type?: string };
          if (msg.type === "offer") ws.send(JSON.stringify({ type: "choice", choiceIndex: 0 }));
        });
      }

      const received = sockets.map(() => ({ snapshots: 0, lastTick: -1 }));
      sockets.forEach((ws, i) => {
        ws.on("message", (data) => {
          const msg = JSON.parse(data.toString()) as { type?: string; tick?: number };
          if (msg.type === "snapshot" || msg.type === "snapshot-delta") {
            received[i].snapshots++;
            received[i].lastTick = msg.tick ?? -1;
          }
        });
      });

      // Simulated uplink jitter: 90 ms cadence, 0-60 ms random send delay.
      const timers = sockets.map((ws, i) => {
        let n = 0;
        return setInterval(() => {
          n++;
          const moveX = Math.cos(n * 0.7 + i);
          const moveY = Math.sin(n * 0.9 + i);
          setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "input", moveX, moveY }));
            }
          }, Math.random() * 60);
        }, 90);
      });

      await new Promise((resolve) => setTimeout(resolve, 1500));
      for (const timer of timers) clearInterval(timer);

      const room = [...server.rooms.values()].find((r) => r.code === code);
      expect(room).toBeTruthy();
      expect(room?.world?.stores.players.liveSlots().length).toBe(4);

      for (const client of received) {
        expect(client.snapshots).toBeGreaterThan(20);
        expect(client.lastTick).toBeGreaterThan(20);
      }
      const ticks = received.map((r) => r.lastTick);
      expect(Math.max(...ticks) - Math.min(...ticks)).toBeLessThanOrEqual(2);
    } finally {
      for (const ws of sockets) ws.close();
    }
  }, 20_000);

  it("rejects a 5th player and mid-run joins", async () => {
    const sockets: WebSocket[] = [];
    try {
      const host = await connect();
      sockets.push(host);
      const hostInbox = inbox(host);
      host.send(
        JSON.stringify({
          type: "create",
          name: "host",
          protocolVersion: PROTOCOL_VERSION,
          characterId: "lux",
        }),
      );
      const created = await nextOfType(hostInbox, "lobby");
      const code = created.code as string;

      for (const characterId of ["brand", "ahri", "ryze"]) {
        const ws = await connect();
        sockets.push(ws);
        ws.send(
          JSON.stringify({
            type: "join",
            code,
            name: characterId,
            protocolVersion: PROTOCOL_VERSION,
            characterId,
          }),
        );
      }

      const fifth = await connect();
      sockets.push(fifth);
      const fifthInbox = inbox(fifth);
      fifth.send(
        JSON.stringify({
          type: "join",
          code,
          name: "fifth",
          protocolVersion: PROTOCOL_VERSION,
          characterId: "syndra",
        }),
      );
      const full = await fifthInbox();
      expect(full.type).toBe("error");
      expect(full.message).toBe("room full");

      host.send(JSON.stringify({ type: "start" }));
      await nextOfType(hostInbox, "start");

      const late = await connect();
      sockets.push(late);
      const lateInbox = inbox(late);
      late.send(
        JSON.stringify({
          type: "join",
          code,
          name: "late",
          protocolVersion: PROTOCOL_VERSION,
          characterId: "veigar",
        }),
      );
      const lateErr = await lateInbox();
      expect(lateErr.type).toBe("error");
      expect(lateErr.message).toBe("game in progress");
    } finally {
      for (const ws of sockets) ws.close();
    }
  }, 20_000);

  it("cycles offers through reroll, banish, and skip", async () => {
    const ws = await connect();
    try {
      const next = inbox(ws);
      ws.send(
        JSON.stringify({
          type: "create",
          name: "host",
          protocolVersion: PROTOCOL_VERSION,
          characterId: "lux",
        }),
      );
      const created = await nextOfType(next, "lobby");
      const code = created.code as string;
      ws.send(JSON.stringify({ type: "start" }));
      await nextOfType(next, "start");

      const room = [...server.rooms.values()].find((r) => r.code === code);
      const world = room?.world;
      if (!world) throw new Error("room world missing");
      world.partyXp = world.partyXpToNext;

      type OfferMsg = {
        rerolls?: number;
        skips?: number;
        banishes?: number;
        options: Array<{ optionId: string }>;
      };
      const first = (await nextOfType(next, "offer")).offer as OfferMsg;
      expect(first.rerolls).toBe(3);
      expect(first.banishes).toBe(2);

      ws.send(JSON.stringify({ type: "reroll" }));
      const rerolled = (await nextOfType(next, "offer")).offer as OfferMsg;
      expect(rerolled.rerolls).toBe(2);
      expect(rerolled.banishes).toBe(2);

      const target = rerolled.options[0]?.optionId;
      expect(target).toBeTruthy();
      ws.send(JSON.stringify({ type: "banish", optionIndex: 0 }));
      const banished = (await nextOfType(next, "offer")).offer as OfferMsg;
      expect(banished.banishes).toBe(1);
      expect(banished.options.some((o) => o.optionId === target)).toBe(false);

      ws.send(JSON.stringify({ type: "skip" }));
      const snap = await nextSnapshot(next);
      expect(typeof snap.tick).toBe("number");
      expect(room?.world?.pendingOffers().length).toBe(0);
    } finally {
      ws.close();
    }
  }, 20_000);

  it("rejoins a mid-run slot with the start token", async () => {
    const host = await connect();
    const next = inbox(host);
    host.send(
      JSON.stringify({
        type: "create",
        name: "host",
        protocolVersion: PROTOCOL_VERSION,
        characterId: "lux",
      }),
    );
    const created = await nextOfType(next, "lobby");
    const code = created.code as string;
    host.send(JSON.stringify({ type: "start" }));
    const start = await nextOfType(next, "start");
    expect(typeof start.token).toBe("string");
    const token = start.token as string;
    const playerId = start.yourPlayerId;
    await nextOfType(next, "snapshot");

    host.close();
    await new Promise((resolve) => setTimeout(resolve, 120));

    const room = [...server.rooms.values()].find((r) => r.code === code);
    expect(room?.clients.length).toBe(1);
    expect(room?.clients[0]?.connected).toBe(false);

    const rejoin = await connect();
    try {
      const next2 = inbox(rejoin);
      rejoin.send(JSON.stringify({ type: "rejoin", token, protocolVersion: PROTOCOL_VERSION }));
      const resumed = await nextOfType(next2, "start");
      expect(resumed.yourPlayerId).toBe(playerId);
      expect(resumed.token).toBe(token);
      const snap = await nextOfType(next2, "snapshot");
      expect(typeof snap.tick).toBe("number");
      expect(room?.clients[0]?.connected).toBe(true);

      const bad = await connect();
      try {
        const badInbox = inbox(bad);
        bad.send(
          JSON.stringify({ type: "rejoin", token: "nope", protocolVersion: PROTOCOL_VERSION }),
        );
        const err = await badInbox();
        expect(err.type).toBe("error");
        expect(err.message).toBe("could not rejoin");
      } finally {
        bad.close();
      }
    } finally {
      rejoin.close();
    }
  }, 20_000);

  it("streams a delta after the first full snapshot and supports resync", async () => {
    const ws = await connect();
    try {
      const next = inbox(ws);
      ws.send(
        JSON.stringify({
          type: "create",
          name: "host",
          protocolVersion: PROTOCOL_VERSION,
          characterId: "lux",
        }),
      );
      const created = await nextOfType(next, "lobby");
      expect(typeof created.code).toBe("string");
      ws.send(JSON.stringify({ type: "start" }));
      await nextOfType(next, "start");

      const first = await nextOfType(next, "snapshot");
      const base = first.snapshot as WorldSnapshot;
      expect(base.tick).toBe(first.tick);

      const deltaMsg = await nextOfType(next, "snapshot-delta");
      const applied = applySnapshotDelta(base, deltaMsg.delta as SnapshotDelta);
      expect(applied.tick).toBe(deltaMsg.tick);

      ws.send(JSON.stringify({ type: "resync" }));
      const resynced = await nextOfType(next, "snapshot");
      expect(typeof resynced.tick).toBe("number");
    } finally {
      ws.close();
    }
  }, 20_000);
});

/** Consume inbox messages until the requested type arrives. */
async function nextOfType(
  next: () => Promise<Record<string, unknown>>,
  type: string,
): Promise<Record<string, unknown>> {
  for (let i = 0; i < 300; i++) {
    const msg = await next();
    if (msg.type === type) return msg;
  }
  throw new Error(`did not receive message type ${type}`);
}

/** Consume inbox messages until any snapshot (full or delta) arrives. */
async function nextSnapshot(
  next: () => Promise<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  for (let i = 0; i < 300; i++) {
    const msg = await next();
    if (msg.type === "snapshot" || msg.type === "snapshot-delta") return msg;
  }
  throw new Error("did not receive a snapshot");
}
