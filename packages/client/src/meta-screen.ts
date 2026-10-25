// Meta screen: permanent-upgrade shop, gacha chests, collection, achievements,
// and the PLAY button. Plain DOM (docs/01). Mutates the save and persists on change.
import type { CharacterDef, PowerUpDef } from "@rift/sim";
import { ACHIEVEMENTS, buyPowerUp, nextCost, openChest, rankOf, refundPowerUp } from "./meta/meta";
import type { Keybinds, SaveData } from "./save/save";
import { persistSave } from "./save/save";

export class MetaScreen {
  private readonly root: HTMLElement;
  private playCb: (() => void) | null = null;
  private coopCb: (() => void) | null = null;
  private settingsCb: ((settings: SaveData["settings"]) => void) | null = null;
  private listening: keyof Keybinds | null = null;
  private captureHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(
    private readonly save: SaveData,
    private readonly powerUps: PowerUpDef[],
    private readonly characters: CharacterDef[],
  ) {
    this.root = document.createElement("div");
    this.root.className = "meta";
    document.body.appendChild(this.root);
    this.render();
  }

  onPlay(cb: () => void): void {
    this.playCb = cb;
  }

  onCoop(cb: () => void): void {
    this.coopCb = cb;
  }

  onSettingsChange(cb: (settings: SaveData["settings"]) => void): void {
    this.settingsCb = cb;
  }

  show(): void {
    this.render();
    this.root.style.display = "flex";
  }

  hide(): void {
    this.cancelRebind();
    this.root.style.display = "none";
  }

  private persist(): void {
    persistSave(this.save);
    this.render();
  }

  private render(): void {
    this.root.replaceChildren();

    const header = document.createElement("div");
    header.className = "meta-header";
    header.textContent = `RIFT SURVIVORS    GOLD ${this.save.gold}    CHESTS ${this.save.chests}`;
    this.root.appendChild(header);

    // Shop
    this.root.appendChild(this.sectionTitle("UPGRADES"));
    const shop = document.createElement("div");
    shop.className = "meta-list";
    for (const p of this.powerUps) {
      shop.appendChild(this.powerUpRow(p));
    }
    this.root.appendChild(shop);

    // Gacha
    this.root.appendChild(this.sectionTitle("GACHA"));
    const gacha = document.createElement("div");
    gacha.className = "meta-row";
    const chestBtn = document.createElement("button");
    chestBtn.className = "meta-btn";
    chestBtn.textContent = `OPEN CHEST (${this.save.chests})`;
    chestBtn.disabled = this.save.chests <= 0;
    chestBtn.addEventListener("click", () => {
      const result = openChest(
        this.save,
        this.characters.map((c) => c.id),
      );
      if (result.unlocked) {
        chestBtn.textContent = `UNLOCKED: ${result.unlocked.toUpperCase()}`;
      }
      this.persist();
    });
    gacha.appendChild(chestBtn);
    this.root.appendChild(gacha);

    // Collection
    this.root.appendChild(this.sectionTitle("CHAMPIONS"));
    const collection = document.createElement("div");
    collection.className = "meta-row";
    for (const c of this.characters) {
      const tag = document.createElement("span");
      const unlocked = this.save.unlockedCharacters.includes(c.id);
      tag.className = unlocked ? "meta-chip on" : "meta-chip";
      tag.textContent = c.id.toUpperCase();
      collection.appendChild(tag);
    }
    this.root.appendChild(collection);

    // Achievements
    this.root.appendChild(this.sectionTitle("ACHIEVEMENTS"));
    const ach = document.createElement("div");
    ach.className = "meta-row";
    for (const a of ACHIEVEMENTS) {
      const tag = document.createElement("span");
      const done = this.save.achievements.includes(a.id);
      tag.className = done ? "meta-chip on" : "meta-chip";
      tag.textContent = a.label;
      ach.appendChild(tag);
    }
    this.root.appendChild(ach);

    // Settings
    this.root.appendChild(this.sectionTitle("SETTINGS"));
    const settings = document.createElement("div");
    settings.className = "meta-row";
    const soundBtn = document.createElement("button");
    soundBtn.className = "meta-btn";
    soundBtn.textContent = this.save.settings.volume > 0 ? "SOUND: ON" : "SOUND: OFF";
    soundBtn.addEventListener("click", () => {
      this.save.settings.volume = this.save.settings.volume > 0 ? 0 : 0.22;
      this.persist();
      this.settingsCb?.(this.save.settings);
    });
    settings.appendChild(soundBtn);
    const shakeBtn = document.createElement("button");
    shakeBtn.className = "meta-btn";
    shakeBtn.textContent = this.save.settings.shake ? "SHAKE: ON" : "SHAKE: OFF";
    shakeBtn.addEventListener("click", () => {
      this.save.settings.shake = !this.save.settings.shake;
      this.persist();
      this.settingsCb?.(this.save.settings);
    });
    settings.appendChild(shakeBtn);
    const dmgBtn = document.createElement("button");
    dmgBtn.className = "meta-btn";
    dmgBtn.textContent = this.save.settings.damageNumbers
      ? "DAMAGE NUMBERS: ON"
      : "DAMAGE NUMBERS: OFF";
    dmgBtn.addEventListener("click", () => {
      this.save.settings.damageNumbers = !this.save.settings.damageNumbers;
      this.persist();
      this.settingsCb?.(this.save.settings);
    });
    settings.appendChild(dmgBtn);
    this.root.appendChild(settings);

    // Controls (rebindable movement keys; arrows always work)
    this.root.appendChild(this.sectionTitle("CONTROLS"));
    const controls = document.createElement("div");
    controls.className = "meta-row";
    const binds: Array<[keyof Keybinds, string]> = [
      ["up", "UP"],
      ["down", "DOWN"],
      ["left", "LEFT"],
      ["right", "RIGHT"],
    ];
    for (const [kind, label] of binds) {
      const btn = document.createElement("button");
      btn.className = "meta-btn";
      btn.textContent =
        this.listening === kind
          ? "PRESS A KEY..."
          : `${label}: ${this.save.settings.keybinds[kind].toUpperCase()}`;
      btn.addEventListener("click", () => this.startRebind(kind));
      controls.appendChild(btn);
    }
    this.root.appendChild(controls);
    const controlsHint = document.createElement("div");
    controlsHint.className = "meta-hint";
    controlsHint.textContent =
      "ARROW KEYS ALWAYS MOVE  ·  ESC CANCELS REBINDING  ·  GAMEPAD SUPPORTED  ·  STATS: TAB";
    this.root.appendChild(controlsHint);

    // Play / co-op
    const playRow = document.createElement("div");
    playRow.className = "meta-row";
    const play = document.createElement("button");
    play.className = "meta-play";
    play.textContent = "PLAY";
    play.addEventListener("click", () => {
      if (this.playCb) this.playCb();
    });
    playRow.appendChild(play);
    const coop = document.createElement("button");
    coop.className = "meta-play";
    coop.textContent = "CO-OP";
    coop.addEventListener("click", () => {
      if (this.coopCb) this.coopCb();
    });
    playRow.appendChild(coop);
    this.root.appendChild(playRow);
  }

  private startRebind(kind: keyof Keybinds): void {
    this.cancelRebind();
    this.listening = kind;
    this.render();

    const handler = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        this.cancelRebind();
        this.render();
        return;
      }
      const key = e.key.toLowerCase();
      const binds = this.save.settings.keybinds;
      // Swap with whichever direction already uses this key.
      for (const other of Object.keys(binds) as (keyof Keybinds)[]) {
        if (other !== kind && binds[other] === key) binds[other] = binds[kind];
      }
      binds[kind] = key;
      this.cancelRebind();
      this.persist();
      this.settingsCb?.(this.save.settings);
    };

    this.captureHandler = handler;
    window.addEventListener("keydown", handler, { capture: true });
  }

  private cancelRebind(): void {
    if (this.captureHandler) {
      window.removeEventListener("keydown", this.captureHandler, { capture: true });
      this.captureHandler = null;
    }
    this.listening = null;
  }

  private sectionTitle(text: string): HTMLElement {
    const el = document.createElement("div");
    el.className = "meta-section";
    el.textContent = text;
    return el;
  }

  private powerUpRow(p: PowerUpDef): HTMLElement {
    const row = document.createElement("div");
    row.className = "meta-row";

    const rank = rankOf(this.save, p);
    const cost = nextCost(this.save, p);
    const label = document.createElement("span");
    label.className = "meta-label";
    label.textContent = `${p.id.toUpperCase()}  ${rank}/${p.maxRank}  ${cost === null ? "MAX" : `COST ${cost}`}`;
    row.appendChild(label);

    const buy = document.createElement("button");
    buy.className = "meta-btn";
    buy.textContent = "BUY";
    buy.disabled = cost === null || this.save.gold < cost;
    buy.addEventListener("click", () => {
      if (buyPowerUp(this.save, p)) this.persist();
    });
    row.appendChild(buy);

    const refund = document.createElement("button");
    refund.className = "meta-btn";
    refund.textContent = "REFUND";
    refund.disabled = rank <= 0;
    refund.addEventListener("click", () => {
      if (refundPowerUp(this.save, p)) this.persist();
    });
    row.appendChild(refund);

    return row;
  }
}
