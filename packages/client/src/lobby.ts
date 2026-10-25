// Co-op lobby: host or join a room by code, see players, and start the run.
import type { LobbyPlayer } from "@rift/shared";
import { NetHost } from "./net-host";

export class Lobby {
  private readonly root: HTMLElement;
  private readonly nameInput: HTMLInputElement;
  private readonly codeInput: HTMLInputElement;
  private readonly status: HTMLElement;
  private readonly playerList: HTMLElement;
  private readonly startBtn: HTMLButtonElement;
  private startCb: ((netHost: NetHost, yourPlayerId: number) => void) | null = null;
  private netHost: NetHost | null = null;
  private isHost = false;
  private characterId = "lux";

  constructor(private readonly serverUrl: string) {
    this.root = document.createElement("div");
    this.root.className = "lobby";
    this.root.style.display = "none";

    const title = document.createElement("div");
    title.className = "lobby-title";
    title.textContent = "CO-OP";
    this.root.appendChild(title);

    this.nameInput = document.createElement("input");
    this.nameInput.className = "lobby-input";
    this.nameInput.placeholder = "name";
    this.nameInput.value = "player";
    this.root.appendChild(this.nameInput);

    const row = document.createElement("div");
    row.className = "meta-row";
    const hostBtn = document.createElement("button");
    hostBtn.className = "meta-btn";
    hostBtn.textContent = "HOST ROOM";
    hostBtn.addEventListener("click", () => void this.hostRoom());
    row.appendChild(hostBtn);

    this.codeInput = document.createElement("input");
    this.codeInput.className = "lobby-input";
    this.codeInput.placeholder = "code";
    this.codeInput.maxLength = 4;
    row.appendChild(this.codeInput);

    const joinBtn = document.createElement("button");
    joinBtn.className = "meta-btn";
    joinBtn.textContent = "JOIN";
    joinBtn.addEventListener("click", () => void this.joinRoom());
    row.appendChild(joinBtn);
    this.root.appendChild(row);

    this.status = document.createElement("div");
    this.status.className = "lobby-status";
    this.root.appendChild(this.status);

    this.playerList = document.createElement("div");
    this.playerList.className = "meta-row";
    this.root.appendChild(this.playerList);

    this.startBtn = document.createElement("button");
    this.startBtn.className = "meta-play";
    this.startBtn.textContent = "START";
    this.startBtn.style.display = "none";
    this.startBtn.addEventListener("click", () => this.netHost?.sendStart());
    this.root.appendChild(this.startBtn);

    const backBtn = document.createElement("button");
    backBtn.className = "meta-btn";
    backBtn.textContent = "BACK";
    backBtn.addEventListener("click", () => this.leave());
    this.root.appendChild(backBtn);

    document.body.appendChild(this.root);
  }

  onStart(cb: (netHost: NetHost, yourPlayerId: number) => void): void {
    this.startCb = cb;
  }

  setCharacter(characterId: string): void {
    this.characterId = characterId;
  }

  setName(name: string): void {
    this.nameInput.value = name;
  }

  show(): void {
    this.root.style.display = "flex";
  }

  hide(): void {
    this.root.style.display = "none";
  }

  /** Leave the lobby and drop the socket (the BACK button; not used on start). */
  private leave(): void {
    this.netHost?.close();
    this.netHost = null;
    this.hide();
  }

  private async connect(): Promise<NetHost> {
    const netHost = new NetHost(this.serverUrl);
    netHost.onLobby((players, code) => this.renderLobby(players, code));
    netHost.onError((msg) => {
      this.status.textContent = msg;
    });
    netHost.onClose(() => {
      this.status.textContent = "disconnected";
    });
    netHost.onStart((playerId) => {
      this.hide();
      this.startCb?.(netHost, playerId);
    });
    await netHost.connect();
    return netHost;
  }

  private async hostRoom(): Promise<void> {
    this.status.textContent = "connecting...";
    try {
      this.netHost = await this.connect();
      this.isHost = true;
      this.netHost.createRoom(this.nameInput.value || "host", this.characterId);
    } catch {
      this.status.textContent = "server unreachable";
    }
  }

  private async joinRoom(): Promise<void> {
    const code = this.codeInput.value.trim().toUpperCase();
    if (code.length < 4) {
      this.status.textContent = "enter a room code";
      return;
    }
    this.status.textContent = "connecting...";
    try {
      this.netHost = await this.connect();
      this.isHost = false;
      this.netHost.joinRoom(code, this.nameInput.value || "player", this.characterId);
    } catch {
      this.status.textContent = "server unreachable";
    }
  }

  private renderLobby(players: LobbyPlayer[], code: string): void {
    this.status.textContent = `ROOM ${code}`;
    this.playerList.replaceChildren();
    for (const p of players) {
      const chip = document.createElement("span");
      chip.className = "meta-chip on";
      chip.textContent = `${p.id + 1}. ${p.name}`;
      this.playerList.appendChild(chip);
    }
    this.startBtn.style.display = this.isHost ? "block" : "none";
  }
}
