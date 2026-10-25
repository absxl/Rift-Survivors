// Authoritative co-op room server (docs/07). Runs the same @rift/sim at 30 Hz;
// clients send inputs and receive snapshots + events + their own offers.
import { type Server, createServer } from "node:http";
import { loadGamePack } from "@rift/content";
import {
  type ClientMessage,
  type LobbyPlayer,
  PROTOCOL_VERSION,
  type ServerMessage,
  clientMessageSchema,
} from "@rift/shared";
import { DEFAULT_RULESET, TICK_MS, applyChoice, createWorld, snapshot, step } from "@rift/sim";
import type { PlayerInput, World } from "@rift/sim";
import { WebSocket, WebSocketServer } from "ws";

const MAX_PLAYERS = 4;

interface Client {
  ws: WebSocket;
  playerId: number;
  name: string;
  characterId: string;
  ready: boolean;
  input: PlayerInput;
}

interface Room {
  code: string;
  clients: Client[];
  world: World | null;
  paused: boolean;
  timer: ReturnType<typeof setInterval> | null;
  seed: number;
}

export interface ServerHandle {
  port: number;
  rooms: Map<string, Room>;
  close: () => void;
}

export function startServer(port: number): ServerHandle {
  const pack = loadGamePack();
  const rooms = new Map<string, Room>();
  const conns = new Map<WebSocket, { room: Room; client: Client }>();

  const send = (ws: WebSocket, msg: ServerMessage): void => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };
  const broadcast = (room: Room, msg: ServerMessage): void => {
    for (const c of room.clients) send(c.ws, msg);
  };
  const lobby = (room: Room): void => {
    const players: LobbyPlayer[] = room.clients.map((c) => ({
      id: c.playerId,
      name: c.name,
      characterId: c.characterId,
      ready: c.ready,
    }));
    broadcast(room, { type: "lobby", code: room.code, players });
  };

  const roomCode = (): string => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    for (let attempt = 0; attempt < 100; attempt++) {
      let code = "";
      for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
      if (!rooms.has(code)) return code;
    }
    throw new Error("could not allocate room code");
  };

  const newRoom = (): Room => {
    const room: Room = {
      code: roomCode(),
      clients: [],
      world: null,
      paused: false,
      timer: null,
      seed: Math.floor(Math.random() * 1e9),
    };
    rooms.set(room.code, room);
    return room;
  };

  const addClient = (room: Room, ws: WebSocket, name: string, characterId: string): void => {
    const playerId = room.clients.length;
    const client: Client = {
      ws,
      playerId,
      name,
      characterId,
      ready: true,
      input: { playerId, moveX: 0, moveY: 0 },
    };
    room.clients.push(client);
    conns.set(ws, { room, client });
    lobby(room);
  };

  const startRoom = (room: Room): void => {
    if (room.world || room.clients.length === 0) return;
    room.world = createWorld(
      DEFAULT_RULESET,
      {
        playerCount: room.clients.length,
        content: pack,
        characterIds: room.clients.map((c) => c.characterId),
      },
      room.seed,
    );
    for (const c of room.clients)
      send(c.ws, { type: "start", seed: room.seed, yourPlayerId: c.playerId });
    room.timer = setInterval(() => tickRoom(room), TICK_MS);
  };

  const tickRoom = (room: Room): void => {
    if (!room.world || room.paused) return;
    let events: ReturnType<typeof step>;
    try {
      events = step(
        room.world,
        room.clients.map((c) => c.input),
      );
    } catch (err) {
      // One bad tick must not crash the server: log and end the run cleanly.
      console.error("[room] tick error", err);
      room.world.over = true;
      if (room.timer) clearInterval(room.timer);
      room.timer = null;
      broadcast(room, { type: "end", stats: { tick: room.world.tick, error: true } });
      return;
    }
    broadcast(room, {
      type: "snapshot",
      tick: room.world.tick,
      snapshot: snapshot(room.world),
      events,
    });

    const offers = room.world.pendingOffers();
    if (offers.length > 0) {
      room.paused = true;
      for (const offer of offers) {
        const client = room.clients.find((c) => c.playerId === offer.playerId);
        if (client) send(client.ws, { type: "offer", offer });
      }
    }

    if (room.world.over) {
      if (room.timer) clearInterval(room.timer);
      room.timer = null;
      broadcast(room, { type: "end", stats: { tick: room.world.tick } });
    }
  };

  const handle = (ws: WebSocket, msg: ClientMessage): void => {
    if (msg.type === "create" || msg.type === "join") {
      if (conns.has(ws)) {
        send(ws, { type: "error", message: "already in a room" });
        return;
      }
      if (msg.protocolVersion !== PROTOCOL_VERSION) {
        send(ws, { type: "error", message: "protocol mismatch" });
        return;
      }
      if (msg.type === "create") {
        addClient(newRoom(), ws, msg.name, msg.characterId);
      } else {
        const room = rooms.get(msg.code.toUpperCase());
        if (!room) {
          send(ws, { type: "error", message: "room not found" });
          return;
        }
        if (room.clients.length >= MAX_PLAYERS) {
          send(ws, { type: "error", message: "room full" });
          return;
        }
        addClient(room, ws, msg.name, msg.characterId);
      }
      return;
    }

    const conn = conns.get(ws);
    if (!conn) {
      send(ws, { type: "error", message: "not in a room" });
      return;
    }
    const { room, client } = conn;

    if (msg.type === "ready") {
      client.characterId = msg.characterId;
      client.ready = msg.ready;
      lobby(room);
    } else if (msg.type === "input") {
      client.input.moveX = msg.moveX;
      client.input.moveY = msg.moveY;
    } else if (msg.type === "start") {
      startRoom(room);
    } else if (msg.type === "choice" && room.world) {
      applyChoice(room.world, client.playerId, msg.choiceIndex);
      if (room.world.pendingOffers().length === 0) room.paused = false;
    } else if (msg.type === "ping") {
      send(ws, { type: "pong", t: msg.t });
    }
  };

  const removeClient = (ws: WebSocket): void => {
    const conn = conns.get(ws);
    if (!conn) return;
    conns.delete(ws);
    const { room, client } = conn;
    room.clients = room.clients.filter((c) => c !== client);
    if (room.world) {
      // Drop any pending offer so the room can't stay paused forever.
      room.world.clearOffer(client.playerId);
      if (room.world.pendingOffers().length === 0) room.paused = false;
    }
    if (room.clients.length === 0) {
      if (room.timer) clearInterval(room.timer);
      rooms.delete(room.code);
    } else {
      lobby(room);
    }
  };

  const http: Server = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, rooms: rooms.size, version: PROTOCOL_VERSION }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  const wss = new WebSocketServer({ server: http });
  wss.on("connection", (ws) => {
    ws.on("message", (data) => {
      try {
        handle(ws, clientMessageSchema.parse(JSON.parse(data.toString())));
      } catch {
        send(ws, { type: "error", message: "invalid message" });
      }
    });
    ws.on("close", () => removeClient(ws));
  });

  http.listen(port);

  return {
    port,
    rooms,
    close: () => {
      for (const room of rooms.values()) {
        if (room.timer) clearInterval(room.timer);
      }
      rooms.clear();
      wss.close();
      http.close();
    },
  };
}
