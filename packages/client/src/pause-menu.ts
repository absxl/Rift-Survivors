// Esc pause menu. Solo freezes the sim (the caller sends pause/resume); co-op
// shows the same menu without pausing the authoritative server.
export interface PauseSettings {
  volume: number;
  shake: boolean;
  damageNumbers: boolean;
}

export class PauseMenu {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly restartBtn: HTMLButtonElement;
  private readonly soundBtn: HTMLButtonElement;
  private readonly shakeBtn: HTMLButtonElement;
  private readonly dmgBtn: HTMLButtonElement;
  private resumeCb: (() => void) | null = null;
  private restartCb: (() => void) | null = null;
  private quitCb: (() => void) | null = null;
  private settingsCb: ((s: PauseSettings) => void) | null = null;
  private settings: PauseSettings = { volume: 0.22, shake: true, damageNumbers: true };

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "pause";
    this.root.style.display = "none";

    this.title = document.createElement("div");
    this.title.className = "pause-title";
    this.root.appendChild(this.title);

    this.root.appendChild(
      this.button("RESUME", () => {
        this.hide();
        this.resumeCb?.();
      }),
    );

    this.restartBtn = this.button("RESTART", () => {
      this.hide();
      this.restartCb?.();
    });
    this.root.appendChild(this.restartBtn);

    this.root.appendChild(this.button("QUIT TO MENU", () => this.quitCb?.()));

    this.soundBtn = this.button("SOUND: ON", () => {
      this.settings.volume = this.settings.volume > 0 ? 0 : 0.22;
      this.syncLabels();
      this.settingsCb?.(this.settings);
    });
    this.root.appendChild(this.soundBtn);

    this.shakeBtn = this.button("SHAKE: ON", () => {
      this.settings.shake = !this.settings.shake;
      this.syncLabels();
      this.settingsCb?.(this.settings);
    });
    this.root.appendChild(this.shakeBtn);

    this.dmgBtn = this.button("DAMAGE NUMBERS: ON", () => {
      this.settings.damageNumbers = !this.settings.damageNumbers;
      this.syncLabels();
      this.settingsCb?.(this.settings);
    });
    this.root.appendChild(this.dmgBtn);

    const hint = document.createElement("div");
    hint.className = "pause-hint";
    hint.textContent = "MOVE: WASD / ARROWS / GAMEPAD    STATS: TAB    PAUSE: ESC    ADMIN: H";
    this.root.appendChild(hint);

    document.body.appendChild(this.root);
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.className = "meta-btn";
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  get visible(): boolean {
    return this.root.style.display !== "none";
  }

  show(solo: boolean, settings: PauseSettings): void {
    this.settings = { ...settings };
    this.title.textContent = solo ? "PAUSED" : "MENU";
    this.restartBtn.style.display = solo ? "block" : "none";
    this.syncLabels();
    this.root.style.display = "flex";
  }

  hide(): void {
    this.root.style.display = "none";
  }

  onResume(cb: () => void): void {
    this.resumeCb = cb;
  }
  onRestart(cb: () => void): void {
    this.restartCb = cb;
  }
  onQuit(cb: () => void): void {
    this.quitCb = cb;
  }
  onSettingsChange(cb: (s: PauseSettings) => void): void {
    this.settingsCb = cb;
  }

  private syncLabels(): void {
    this.soundBtn.textContent = this.settings.volume > 0 ? "SOUND: ON" : "SOUND: OFF";
    this.shakeBtn.textContent = this.settings.shake ? "SHAKE: ON" : "SHAKE: OFF";
    this.dmgBtn.textContent = this.settings.damageNumbers
      ? "DAMAGE NUMBERS: ON"
      : "DAMAGE NUMBERS: OFF";
  }
}
