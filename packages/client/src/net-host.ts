import {
  type ClientMessage,
  type LobbyPlayer,
  PROTOCOL_VERSION,
  type ServerMessage,
} from "@rift/shared";
// Client-side network host: connects to the authoritative room server and adapts
// its messages to the same callbacks the solo WorkerHost uses.
import type { Offer, PlayerInput, SimEvent, WorldSnapshot } from "@rift/sim";

export class NetHost {
  private ws: WebSocket | null = null;
  private snapshotCb: ((snapshot: WorldSnapshot, events: SimEvent[]) => void) | null = null;
  private offerCb: ((offer: Offer) => void) | null = null;
  private lobbyCb: ((players: LobbyPlayer[], code: string) => void) | null = null;
  private startCb: ((yourPlayerId: number) => void) | null = null;
  private errorCb: ((message: string) => void) | null = null;
  private closeCb: ((code: number) => void) | null = null;

  constructor(private readonly url: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      ws.onopen = () => {
        this.ws = ws;
        resolve();
      };
      ws.onerror = () => {
        if (!this.ws) reject(new Error("could not reach server"));
      };
      ws.onmessage = (e) => this.onMessage(e.data);
      ws.onclose = (event) => {
        this.ws = null;
        this.closeCb?.(event.code);
      };
    });
  }

  close(): void {
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
        this.startCb?.(msg.yourPlayerId);
        break;
      case "error":
        this.errorCb?.(msg.message);
        break;
    }
  }
}
