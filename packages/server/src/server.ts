// Authoritative co-op room server (docs/07). Runs the same @rift/sim at 30 Hz;
// clients send inputs and receive snapshots + events + their own offers.
import { randomUUID } from "node:crypto";
import { type Server, createServer } from "node:http";
import { loadGamePack } from "@rift/content";
import {
  type ClientMessage,
  type LobbyPlayer,
  PROTOCOL_VERSION,
  type ServerMessage,
  clientMessageSchema,
} from "@rift/shared";
import {
  DEFAULT_RULESET,
  TICK_MS,
  applyChoice,
  banishOfferOption,
  buildSnapshotDelta,
  createWorld,
  rerollOffer,
  skipOffer,
  snapshot,
  step,
} from "@rift/sim";
import type { PlayerInput, World, WorldSnapshot } from "@rift/sim";
import { WebSocket, WebSocketServer } from "ws";
import { AccountStore } from "./accounts";
import {
  type AuthConfig,
  authConfigFromEnv,
  handleAccountHttp,
  sessionTokenFromCookieHeader,
} from "./auth";

const MAX_PLAYERS = 4;
/** Send a full snapshot this often (safety net / resync for any delta drift). */
const FULL_SNAPSHOT_EVERY_TICKS = 150;
/** Max concurrent rooms (env RIFT_MAX_ROOMS) so one client can't exhaust memory. */
const MAX_ROOMS = Math.max(1, Math.floor(Number(process.env.RIFT_MAX_ROOMS ?? 20)) || 20);
/** Idle pings keep half-open TCP peers from hogging reconnect slots. */
const HEARTBEAT_INTERVAL_MS = 30_000;
/** A finished room lingers for the results screen, then is swept. */
const ROOM_LINGER_MS = 60_000;
/** Per-connection message budget (inputs are ~30/s; the rest is headroom). */
const MESSAGE_BUDGET = 240;
const MESSAGE_REFILL_PER_SEC = 240;
/** Inbound frames larger than this are refused before parsing. */
const MAX_PAYLOAD_BYTES = 256 * 1024;

interface Client {
  ws: WebSocket;
  playerId: number;
  name: string;
  characterId: string;
  /** Per-champion meta-shop bonuses for this player. */
  metaBonuses: Record<string, number>;
  /** Stage requested by this client; the host's stage is used for the room. */
  stageId: string;
  ready: boolean;
  input: PlayerInput;
  /** Opaque token used to rejoin this slot after a disconnect. */
  token: string;
  connected: boolean;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
  /** Force the next broadcast to be a full snapshot (join/rejoin/resync). */
  needsFull: boolean;
}

interface Room {
  code: string;
  clients: Client[];
  world: World | null;
  paused: boolean;
  timer: ReturnType<typeof setInterval> | null;
  seed: number;
  /** Last snapshot broadcast to connected clients (delta base). */
  lastSent: WorldSnapshot | null;
  /** When the run ended; the room is swept after the linger window. */
  endedAt: number | null;
}

export interface ServerHandle {
  port: number;
  rooms: Map<string, Room>;
  accounts: AccountStore;
  close: () => void;
}

export interface ServerOptions {
  /** How long a mid-run slot stays reserved for a reconnect. Default 60s. */
  reconnectGraceMs?: number;
  /** Account DB file; null uses an in-memory store (tests). */
  accountsFile?: string | null;
  auth?: Partial<AuthConfig>;
}

export function startServer(port: number, options: ServerOptions = {}): ServerHandle {
  const reconnectGraceMs = options.reconnectGraceMs ?? 60_000;
  const pack = loadGamePack();
  const connectionAccounts = new Map<WebSocket, ReturnType<AccountStore["getSessionAccount"]>>();
  const accountsFile =
    options.accountsFile === undefined
      ? (process.env.RIFT_ACCOUNTS_FILE ?? "data/accounts.json")
      : options.accountsFile;
  const accounts = new AccountStore({ file: accountsFile });
  const authConfig = authConfigFromEnv(options.auth);
  const rooms = new Map<string, Room>();
  const conns = new Map<WebSocket, { room: Room; client: Client }>();
  /** Token-bucket message budgets per connection (flood protection). */
  const rate = new Map<WebSocket, { budget: number; last: number }>();

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
      connected: c.connected,
    }));
    broadcast(room, { type: "lobby", code: room.code, players });
  };

  /** Send a player their current offer (used after reroll/banish, or a rejection). */
  const sendOfferTo = (room: Room, playerId: number): void => {
    const offer = room.world?.pendingOffers().find((o) => o.playerId === playerId);
    const client = room.clients.find((c) => c.playerId === playerId);
    if (offer && client) send(client.ws, { type: "offer", offer });
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
      lastSent: null,
      endedAt: null,
    };
    rooms.set(room.code, room);
    return room;
  };

  const addClient = (
    room: Room,
    ws: WebSocket,
    name: string,
    characterId: string,
    metaBonuses: Record<string, number> = {},
    stageId = "rift-field",
  ): void => {
    // Reuse the lowest free slot so ids stay stable and unique for the sim.
    const used = new Set(room.clients.map((c) => c.playerId));
    let playerId = 0;
    while (used.has(playerId)) playerId++;
    const client: Client = {
      ws,
      playerId,
      name,
      characterId,
      metaBonuses,
      stageId,
      ready: true,
      input: { playerId, moveX: 0, moveY: 0 },
      token: randomUUID(),
      connected: true,
      disconnectTimer: null,
      needsFull: true,
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
        playerMetaBonuses: room.clients.map((c) => c.metaBonuses),
        stageId: room.clients[0]?.stageId ?? "rift-field",
      },
      room.seed,
    );
    room.lastSent = null;
    for (const c of room.clients) {
      send(c.ws, {
        type: "start",
        seed: room.seed,
        yourPlayerId: c.playerId,
        token: c.token,
      });
    }
    room.timer = setInterval(() => tickRoom(room), TICK_MS);
  };

  const tickRoom = (room: Room): void => {
    if (!room.world || room.paused) return;
    // Don't advance a room while everyone is in the reconnect grace period.
    if (!room.clients.some((c) => c.connected)) return;
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
      room.endedAt = Date.now();
      broadcast(room, { type: "end", stats: { tick: room.world.tick, error: true } });
      return;
    }
    const snap = snapshot(room.world);
    const periodicFull = room.world.tick % FULL_SNAPSHOT_EVERY_TICKS === 0;
    const delta = room.lastSent && !periodicFull ? buildSnapshotDelta(room.lastSent, snap) : null;
    for (const client of room.clients) {
      if (!client.connected) continue;
      if (!delta || client.needsFull) {
        send(client.ws, {
          type: "snapshot",
          tick: room.world.tick,
          snapshot: snap,
          events,
        });
      } else {
        send(client.ws, {
          type: "snapshot-delta",
          tick: room.world.tick,
          delta,
          events,
        });
      }
      client.needsFull = false;
    }
    room.lastSent = snap;

    const offers = room.world.pendingOffers();
    if (offers.length > 0) {
      room.paused = true;
      // One offer at a time per player; the next is sent after resolution.
      const players = new Set<number>();
      for (const offer of offers) players.add(offer.playerId);
      for (const playerId of players) sendOfferTo(room, playerId);
    }

    if (room.world.over) {
      if (room.timer) clearInterval(room.timer);
      room.timer = null;
      room.endedAt = Date.now();
      broadcast(room, { type: "end", stats: { tick: room.world.tick } });
    }
  };

  const handle = (ws: WebSocket, msg: ClientMessage): void => {
    if (msg.type === "rejoin") {
      if (conns.has(ws)) {
        send(ws, { type: "error", message: "already in a room" });
        return;
      }
      if (msg.protocolVersion !== PROTOCOL_VERSION) {
        send(ws, { type: "error", message: "protocol mismatch" });
        return;
      }
      let target: { room: Room; client: Client } | null = null;
      for (const room of rooms.values()) {
        const client = room.clients.find((c) => c.token === msg.token);
        if (client) {
          target = { room, client };
          break;
        }
      }
      if (!target) {
        send(ws, { type: "error", message: "could not rejoin" });
        return;
      }
      if (target.client.connected) {
        send(ws, { type: "error", message: "already connected" });
        return;
      }
      const { room, client } = target;
      if (client.disconnectTimer) {
        clearTimeout(client.disconnectTimer);
        client.disconnectTimer = null;
      }
      client.connected = true;
      client.ws = ws;
      conns.set(ws, { room, client });
      send(ws, {
        type: "start",
        seed: room.seed,
        yourPlayerId: client.playerId,
        token: client.token,
      });
      // Immediate full state so the client can render before the next tick.
      if (room.world) {
        send(ws, {
          type: "snapshot",
          tick: room.world.tick,
          snapshot: snapshot(room.world),
          events: [],
        });
      }
      // Ensure the next broadcast is also a full (the delta base may differ).
      client.needsFull = true;
      lobby(room);
      return;
    }

    if (msg.type === "create" || msg.type === "join") {
      if (conns.has(ws)) {
        send(ws, { type: "error", message: "already in a room" });
        return;
      }
      if (msg.protocolVersion !== PROTOCOL_VERSION) {
        send(ws, { type: "error", message: "protocol mismatch" });
        return;
      }
      const account = connectionAccounts.get(ws);
      if (msg.type === "create") {
        if (rooms.size >= MAX_ROOMS) {
          send(ws, { type: "error", message: "server full" });
          return;
        }
        addClient(
          newRoom(),
          ws,
          account?.nickname ?? msg.name,
          msg.characterId,
          msg.metaBonuses,
          msg.stageId,
        );
      } else {
        const room = rooms.get(msg.code.toUpperCase());
        if (!room) {
          send(ws, { type: "error", message: "room not found" });
          return;
        }
        if (room.world) {
          // A run is already in progress; late clients can't be added to the sim.
          send(ws, { type: "error", message: "game in progress" });
          return;
        }
        if (room.clients.length >= MAX_PLAYERS) {
          send(ws, { type: "error", message: "room full" });
          return;
        }
        addClient(
          room,
          ws,
          account?.nickname ?? msg.name,
          msg.characterId,
          msg.metaBonuses,
          msg.stageId,
        );
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
      if (msg.metaBonuses) client.metaBonuses = msg.metaBonuses;
      client.ready = msg.ready;
      lobby(room);
    } else if (msg.type === "input") {
      client.input.moveX = msg.moveX;
      client.input.moveY = msg.moveY;
    } else if (msg.type === "start") {
      // Only the room's oldest member (its creator, or the next in line after
      // they leave) may launch the run.
      if (room.world) return;
      if (room.clients[0] !== client) {
        send(ws, { type: "error", message: "only the host can start" });
        return;
      }
      startRoom(room);
    } else if (msg.type === "choice" && room.world) {
      applyChoice(room.world, client.playerId, msg.choiceIndex);
      // A second offer (e.g. chest + level-up) is shown next.
      sendOfferTo(room, client.playerId);
      if (room.world.pendingOffers().length === 0) room.paused = false;
    } else if (msg.type === "reroll" && room.world) {
      rerollOffer(room.world, client.playerId);
      sendOfferTo(room, client.playerId);
    } else if (msg.type === "skip" && room.world) {
      skipOffer(room.world, client.playerId);
      sendOfferTo(room, client.playerId);
      if (room.world.pendingOffers().length === 0) room.paused = false;
    } else if (msg.type === "banish" && room.world) {
      banishOfferOption(room.world, client.playerId, msg.optionIndex);
      sendOfferTo(room, client.playerId);
    } else if (msg.type === "buy" && room.world) {
      // The sim validates gold/recipes/slots; the broadcast carries the result.
      if (room.world.buyItem(client.playerId, msg.itemId)) client.needsFull = true;
    } else if (msg.type === "combine" && room.world) {
      if (room.world.combineItem(client.playerId, msg.itemId)) client.needsFull = true;
    } else if (msg.type === "sell" && room.world) {
      if (room.world.sellItem(client.playerId, msg.slot)) client.needsFull = true;
    } else if (msg.type === "resync" && room.world) {
      send(ws, {
        type: "snapshot",
        tick: room.world.tick,
        snapshot: snapshot(room.world),
        events: [],
      });
      client.needsFull = true;
    } else if (msg.type === "ping") {
      send(ws, { type: "pong", t: msg.t });
    }
  };

  /** Remove a client permanently (lobby leave, or reconnect grace expired). */
  const finalizeRemoval = (room: Room, client: Client): void => {
    if (client.disconnectTimer) {
      clearTimeout(client.disconnectTimer);
      client.disconnectTimer = null;
    }
    room.clients = room.clients.filter((c) => c !== client);
    if (room.world) {
      // Drop any pending offer so the room can't stay paused forever.
      room.world.clearOffer(client.playerId);
      if (room.world.pendingOffers().length === 0) room.paused = false;
    }
    if (room.clients.length === 0) {
      if (room.timer) clearInterval(room.timer);
      room.timer = null;
      rooms.delete(room.code);
    } else {
      lobby(room);
    }
  };

  const removeClient = (ws: WebSocket): void => {
    const conn = conns.get(ws);
    if (!conn) return;
    conns.delete(ws);
    const { room, client } = conn;

    // Mid-run: reserve the slot for a reconnect instead of dropping the player.
    if (room.world && client.connected) {
      client.connected = false;
      client.input.moveX = 0;
      client.input.moveY = 0;
      room.world.clearOffer(client.playerId);
      if (room.world.pendingOffers().length === 0) room.paused = false;
      lobby(room);
      client.disconnectTimer = setTimeout(() => {
        client.disconnectTimer = null;
        finalizeRemoval(room, client);
      }, reconnectGraceMs);
      return;
    }

    finalizeRemoval(room, client);
  };

  const http: Server = createServer((req, res) => {
    void (async () => {
      try {
        if (await handleAccountHttp(req, res, accounts, authConfig)) return;
        if (req.url === "/health") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true, rooms: rooms.size, version: PROTOCOL_VERSION }));
          return;
        }
        res.writeHead(404);
        res.end();
      } catch (error) {
        console.error("[http] request error", error);
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "application/json" });
        }
        res.end(JSON.stringify({ error: "internal error" }));
      }
    })();
  });

  const wss = new WebSocketServer({ server: http, maxPayload: MAX_PAYLOAD_BYTES });

  // Half-open TCP peers (dropped laptops, dead Wi-Fi) never fire "close", so
  // ping everyone on an interval and terminate whoever stays silent.
  const alive = new WeakSet<WebSocket>();
  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (alive.has(socket)) {
        alive.delete(socket);
        socket.ping();
      } else {
        socket.terminate();
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Sweep finished rooms: they block joins and hold sim memory until every
  // socket happens to leave, which abusive or crashed clients never do.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      if (!room.world?.over || room.endedAt === null) continue;
      if (now - room.endedAt <= ROOM_LINGER_MS) continue;
      for (const c of room.clients) {
        conns.delete(c.ws);
        rate.delete(c.ws);
        send(c.ws, { type: "error", message: "room closed" });
        c.ws.terminate();
      }
      room.clients = [];
      if (room.timer) clearInterval(room.timer);
      room.timer = null;
      rooms.delete(room.code);
    }
  }, 15_000);
  sweep.unref();
  heartbeat.unref();

  wss.on("connection", (ws, request) => {
    const account = accounts.getSessionAccount(
      sessionTokenFromCookieHeader(request.headers.cookie),
    );
    if (account) connectionAccounts.set(ws, account);
    alive.add(ws);
    ws.on("pong", () => alive.add(ws));
    rate.set(ws, { budget: MESSAGE_BUDGET, last: Date.now() });
    ws.on("message", (data) => {
      const bucket = rate.get(ws);
      if (bucket) {
        const now = Date.now();
        bucket.budget = Math.min(
          MESSAGE_BUDGET,
          bucket.budget + ((now - bucket.last) / 1000) * MESSAGE_REFILL_PER_SEC,
        );
        bucket.last = now;
        // Silently drop floods; a legitimate client sends ~30 inputs/s.
        if (bucket.budget < 1) return;
        bucket.budget -= 1;
      }
      try {
        handle(ws, clientMessageSchema.parse(JSON.parse(data.toString())));
      } catch (err) {
        // Log so an internal applyChoice/tick error isn't silently hidden.
        console.error("[server] message error", err);
        send(ws, { type: "error", message: "invalid message" });
      }
    });
    ws.on("close", () => {
      connectionAccounts.delete(ws);
      rate.delete(ws);
      removeClient(ws);
    });
  });

  http.listen(port);

  return {
    port,
    rooms,
    accounts,
    close: () => {
      clearInterval(heartbeat);
      clearInterval(sweep);
      for (const room of rooms.values()) {
        if (room.timer) clearInterval(room.timer);
        for (const client of room.clients) {
          if (client.disconnectTimer) clearTimeout(client.disconnectTimer);
        }
      }
      rooms.clear();
      wss.close();
      http.close();
    },
  };
}
