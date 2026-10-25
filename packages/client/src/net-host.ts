import {
  type ClientMessage,
  type LobbyPlayer,
  PROTOCOL_VERSION,
  type ServerMessage,
} from "@rift/shared";
// Client-side network host: connects to the authoritative room server and adapts
// its messages to the same callbacks the solo WorkerHost uses. After a mid-run
// disconnect it retries the `rejoin` handshake with the token from `start`.
import type { Offer, PlayerInput, SimEvent, WorldSnapshot } from "@rift/sim";

export type ReconnectStatus = "reconnecting" | "reconnected" | "lost";

export class NetHost {
  private static readonly MAX_RECONNECT_ATTEMPTS = 5;
  private static readonly RECONNECT_BASE_MS = 600;

  private ws: WebSocket | null = null;
  private token: string | null = null;
  private hasStarted = false;
  private closedByUser = false;
  private reconnecting = false;
  private reconnectAttempts = 0;

  private snapshotCb: ((snapshot: WorldSnapshot, events: SimEvent[]) => void) | null = null;
  private offerCb: ((offer: Offer) => void) | null = null;
  private lobbyCb: ((players: LobbyPlayer[], code: string) => void) | null = null;
  private startCb: ((yourPlayerId: number) => void) | null = null;
  private errorCb: ((message: string) => void) | null = null;
  private closeCb: ((code: number) => void) | null = null;
  private reconnectCb: ((status: ReconnectStatus) => void) | null = null;

  constructor(private readonly url: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      ws.onopen = () => {
        this.ws = ws;
        this.closedByUser = false;
        resolve();
      };
      ws.onerror = () => {
        if (!this.ws) reject(new Error("could not reach server"));
      };
      ws.onmessage = (e) => this.onMessage(e.data);
      ws.onclose = (event) => {
        this.ws = null;
        this.closeCb?.(event.code);
        this.maybeReconnect();
      };
    });
  }

  close(): void {
    this.closedByUser = true;
    this.ws?.close();
    this.ws = null;
  }

  createRoom(name: string, characterId: string): void {
    this.send({ type: "create", name, characterId, protocolVersion: PROTOCOL_VERSION });
  }

  joinRoom(code: string, name: string, characterId: string): void {
    this.send({ type: "join", code, name, characterId, protocolVersion: PROTOCOL_VERSION });
  }

  sendStart(): void {
    this.send({ type: "start" });
  }

  sendInput(input: PlayerInput): void {
    this.send({ type: "input", moveX: input.moveX, moveY: input.moveY });
  }

  sendChoice(choiceIndex: number): void {
    this.send({ type: "choice", choiceIndex });
  }

  sendReroll(): void {
    this.send({ type: "reroll" });
  }

  sendSkip(): void {
    this.send({ type: "skip" });
  }

  sendBanish(optionIndex: number): void {
    this.send({ type: "banish", optionIndex });
  }

  onSnapshot(cb: (snapshot: WorldSnapshot, events: SimEvent[]) => void): void {
    this.snapshotCb = cb;
  }
  onOffer(cb: (offer: Offer) => void): void {
    this.offerCb = cb;
  }
  onLobby(cb: (players: LobbyPlayer[], code: string) => void): void {
    this.lobbyCb = cb;
  }
  onStart(cb: (yourPlayerId: number) => void): void {
    this.startCb = cb;
  }
  onError(cb: (message: string) => void): void {
    this.errorCb = cb;
  }
  onClose(cb: (code: number) => void): void {
    this.closeCb = cb;
  }
  onReconnect(cb: (status: ReconnectStatus) => void): void {
    this.reconnectCb = cb;
  }

  private send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private onMessage(data: unknown): void {
    const msg = JSON.parse(data as string) as ServerMessage;
    switch (msg.type) {
      case "snapshot":
        this.snapshotCb?.(msg.snapshot as WorldSnapshot, msg.events as SimEvent[]);
        break;
      case "offer":
        this.offerCb?.(msg.offer as Offer);
        break;
      case "lobby":
        this.lobbyCb?.(msg.players, msg.code);
        break;
      case "start":
        this.token = msg.token ?? this.token;
        if (!this.hasStarted) {
          this.hasStarted = true;
          this.startCb?.(msg.yourPlayerId);
        } else {
          this.reconnecting = false;
          this.reconnectAttempts = 0;
          this.reconnectCb?.("reconnected");
        }
        break;
      case "error":
        this.errorCb?.(msg.message);
        break;
    }
  }

  private maybeReconnect(): void {
    if (!this.hasStarted || this.closedByUser || !this.token || this.reconnecting) return;
    this.reconnecting = true;
    this.reconnectAttempts = 0;
    this.reconnectCb?.("reconnecting");
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts += 1;
    if (this.reconnectAttempts > NetHost.MAX_RECONNECT_ATTEMPTS) {
      this.reconnecting = false;
      this.reconnectCb?.("lost");
      return;
    }
    const delay = NetHost.RECONNECT_BASE_MS * 2 ** (this.reconnectAttempts - 1);
    window.setTimeout(() => this.attemptRejoin(), delay);
  }

  private attemptRejoin(): void {
    if (this.closedByUser || !this.token) return;
    const token = this.token;
    const ws = new WebSocket(this.url);
    let settled = false;
    let timeout = 0;

    const fail = (): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      ws.close();
      this.scheduleReconnect();
    };

    timeout = window.setTimeout(fail, 5000);

    ws.onopen = () => {
      if (!token) return;
      ws.send(JSON.stringify({ type: "rejoin", token, protocolVersion: PROTOCOL_VERSION }));
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data as string) as ServerMessage;
      if (msg.type === "start") {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        this.ws = ws;
        this.token = msg.token ?? token;
        this.reconnecting = false;
        this.reconnectAttempts = 0;
        this.reconnectCb?.("reconnected");
        ws.onmessage = (ev) => this.onMessage(ev.data);
        return;
      }
      if (msg.type === "error") fail();
    };
    ws.onclose = fail;
  }
}
