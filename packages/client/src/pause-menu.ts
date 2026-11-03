// Esc pause menu. Solo freezes the sim (the caller sends pause/resume); co-op
// shows the same menu without pausing the authoritative server. Edits the live
// v9 SaveSettings (docs/10 D-053) — the caller persists and applies them.
import type { SaveSettings } from "./save/save";

export type PauseSettings = SaveSettings;

export class PauseMenu {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly restartBtn: HTMLButtonElement;
  private readonly soundBtn: HTMLButtonElement;
  private readonly musicBtn: HTMLButtonElement;
  private readonly shakeBtn: HTMLButtonElement;
  private readonly dmgBtn: HTMLButtonElement;
  private resumeCb: (() => void) | null = null;
  private restartCb: (() => void) | null = null;
  private quitCb: (() => void) | null = null;
  private settingsCb: ((s: SaveSettings) => void) | null = null;
  private settings: SaveSettings | null = null;

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

    this.root.appendChild(this.button("QUIT RUN (LOSS)", () => this.quitCb?.()));

    this.soundBtn = this.button("SOUND: ON", () => {
      if (!this.settings) return;
      this.settings.sfx = this.settings.sfx > 0 ? 0 : 0.8;
      this.syncLabels();
      this.settingsCb?.(this.settings);
    });
    this.root.appendChild(this.soundBtn);

    this.musicBtn = this.button("MUSIC: ON", () => {
      if (!this.settings) return;
      this.settings.music = this.settings.music > 0 ? 0 : 0.5;
      this.syncLabels();
      this.settingsCb?.(this.settings);
    });
    this.root.appendChild(this.musicBtn);

    this.shakeBtn = this.button("SHAKE: ON", () => {
      if (!this.settings) return;
      this.settings.shake = !this.settings.shake;
      this.syncLabels();
      this.settingsCb?.(this.settings);
    });
    this.root.appendChild(this.shakeBtn);

    this.dmgBtn = this.button("DAMAGE NUMBERS: ON", () => {
      if (!this.settings) return;
      this.settings.damageNumbers = !this.settings.damageNumbers;
      this.syncLabels();
      this.settingsCb?.(this.settings);
    });
    this.root.appendChild(this.dmgBtn);

    const hint = document.createElement("div");
    hint.className = "pause-hint";
    hint.textContent =
      "MOVE: WASD / ARROWS / GAMEPAD / TOUCH    STATS: TAB    SHOP: B    PAUSE: ESC    ADMIN: H";
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

  show(solo: boolean, settings: SaveSettings): void {
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
  onSettingsChange(cb: (s: SaveSettings) => void): void {
    this.settingsCb = cb;
  }

  private syncLabels(): void {
    if (!this.settings) return;
    const sfxOn = this.settings.sfx * this.settings.volume > 0;
    const musicOn = this.settings.music * this.settings.volume > 0;
    this.soundBtn.textContent = sfxOn ? "SOUND: ON" : "SOUND: OFF";
    this.musicBtn.textContent = musicOn ? "MUSIC: ON" : "MUSIC: OFF";
    this.shakeBtn.textContent = this.settings.shake ? "SHAKE: ON" : "SHAKE: OFF";
    this.dmgBtn.textContent = this.settings.damageNumbers
      ? "DAMAGE NUMBERS: ON"
      : "DAMAGE NUMBERS: OFF";
  }
}
