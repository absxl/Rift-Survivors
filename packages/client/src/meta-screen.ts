// Meta screen: permanent-upgrade shop, gacha chests, collection, achievements,
// and the PLAY button. Plain DOM (docs/01). Mutates the save and persists on change.
import type { CharacterDef, PowerUpDef } from "@rift/sim";
import { ACHIEVEMENTS, buyPowerUp, nextCost, openChest, rankOf, refundPowerUp } from "./meta/meta";
import type { SaveData } from "./save/save";
import { persistSave } from "./save/save";

export class MetaScreen {
  private readonly root: HTMLElement;
  private playCb: (() => void) | null = null;

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

  show(): void {
    this.render();
    this.root.style.display = "flex";
  }

  hide(): void {
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

    // Play
    const play = document.createElement("button");
    play.className = "meta-play";
    play.textContent = "PLAY";
    play.addEventListener("click", () => {
      if (this.playCb) this.playCb();
    });
    this.root.appendChild(play);
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
