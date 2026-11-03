// Hidden developer/admin panel (H). Deliberately local-only: grants gold,
// keys, shards, unlocks and upgrade ranks for testing, plus Reset Save.
import type { CharacterDef, PowerUpDef } from "@rift/sim";
import { upgradesForChampion } from "./meta/meta";
import type { SaveData } from "./save/save";
import { persistSave, resetSave } from "./save/save";

export class AdminPanel {
  private readonly root: HTMLElement;
  private readonly status: HTMLElement;
  /** Grants gold inside the active run (solo worker only). */
  onRunGold?: (amount: number) => void;

  private grantEssence(amount: number): void {
    this.save.blueEssence += amount;
    persistSave(this.save);
    this.status.textContent = `+${amount} BLUE ESSENCE (TOTAL ${this.save.blueEssence})`;
  }

  constructor(
    private readonly save: SaveData,
    private readonly characters: CharacterDef[],
    private readonly powerUps: PowerUpDef[],
    private readonly onChange: () => void,
  ) {
    this.root = document.createElement("div");
    this.root.className = "admin";
    this.root.style.display = "none";

    const panel = document.createElement("div");
    panel.className = "admin-panel";
    const title = document.createElement("div");
    title.className = "admin-title";
    title.textContent = "ADMIN / DEV PANEL";
    const hint = document.createElement("div");
    hint.className = "admin-hint";
    hint.textContent = "LOCAL SAVE ONLY · H TO CLOSE · DEV OPTIONS ARE NOT BALANCED";
    panel.append(title, hint);

    const grid = document.createElement("div");
    grid.className = "admin-grid";
    this.addButton(grid, "+1,000 GOLD", () => this.grantGold(1000));
    this.addButton(grid, "+5,000 RUN GOLD (DEV)", () => this.onRunGold?.(5000));
    this.addButton(grid, "+50 BLUE ESSENCE (DEV)", () => this.grantEssence(50));
    this.addButton(grid, "+10,000 GOLD", () => this.grantGold(10000));
    this.addButton(grid, "+10 KEYS", () => this.grantKeys(10));
    this.addButton(grid, "+100 KEYS", () => this.grantKeys(100));
    this.addButton(grid, "+10 SHARDS (SELECTED)", () => this.grantSelectedShards(10));
    this.addButton(grid, "+10 SHARDS (ALL)", () => this.grantAllShards(10));
    this.addButton(grid, "UNLOCK SELECTED", () => this.unlockSelected());
    this.addButton(grid, "UNLOCK ALL CHAMPIONS", () => this.unlockAll());
    this.addButton(grid, "MAX SELECTED UPGRADES", () => this.maxSelectedUpgrades());
    this.addButton(grid, "MAX ALL UPGRADES", () => this.maxAllUpgrades());
    this.addButton(grid, "RESET SAVE", () => this.reset());
    this.addButton(grid, "CLOSE", () => this.hide());
    panel.appendChild(grid);

    this.status = document.createElement("div");
    this.status.className = "admin-status";
    this.status.textContent = "READY";
    panel.appendChild(this.status);
    this.root.appendChild(panel);
    document.body.appendChild(this.root);

    window.addEventListener("keydown", (e) => {
      if (e.key.toLowerCase() !== "h" || e.repeat) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      e.preventDefault();
      this.toggle();
    });
  }

  toggle(): void {
    if (this.root.style.display === "none") this.show();
    else this.hide();
  }

  show(): void {
    this.root.style.display = "flex";
    this.status.textContent = "READY";
  }

  hide(): void {
    this.root.style.display = "none";
  }

  private addButton(parent: HTMLElement, label: string, onClick: () => void): void {
    const button = document.createElement("button");
    button.className = "admin-btn";
    button.textContent = label;
    button.addEventListener("click", onClick);
    parent.appendChild(button);
  }

  private changed(message: string): void {
    persistSave(this.save);
    this.status.textContent = message;
    this.onChange();
  }

  private grantGold(amount: number): void {
    this.save.gold += amount;
    this.changed(`+${amount} GOLD`);
  }

  private grantKeys(amount: number): void {
    this.save.keys += amount;
    this.changed(`+${amount} KEYS`);
  }

  private grantSelectedShards(amount: number): void {
    const id = this.save.selectedCharacter;
    this.save.championShards[id] = (this.save.championShards[id] ?? 0) + amount;
    this.changed(`+${amount} ${id.toUpperCase()} SHARDS`);
  }

  private grantAllShards(amount: number): void {
    for (const c of this.characters) {
      this.save.championShards[c.id] = (this.save.championShards[c.id] ?? 0) + amount;
    }
    this.changed(`+${amount} SHARDS TO ALL`);
  }

  private unlockSelected(): void {
    if (!this.save.unlockedCharacters.includes(this.save.selectedCharacter)) {
      this.save.unlockedCharacters.push(this.save.selectedCharacter);
    }
    this.changed(`UNLOCKED ${this.save.selectedCharacter.toUpperCase()}`);
  }

  private unlockAll(): void {
    for (const c of this.characters) {
      if (!this.save.unlockedCharacters.includes(c.id)) this.save.unlockedCharacters.push(c.id);
    }
    this.changed("UNLOCKED ALL CHAMPIONS");
  }

  private maxSelectedUpgrades(): void {
    const character = this.characters.find((c) => c.id === this.save.selectedCharacter);
    const tree = this.save.championUpgrades[this.save.selectedCharacter] ?? {};
    for (const p of upgradesForChampion(this.powerUps, character)) tree[p.id] = p.maxRank;
    this.save.championUpgrades[this.save.selectedCharacter] = tree;
    this.changed(`MAXED ${this.save.selectedCharacter.toUpperCase()}'S TREE`);
  }

  private maxAllUpgrades(): void {
    for (const c of this.characters) {
      const tree = this.save.championUpgrades[c.id] ?? {};
      for (const p of upgradesForChampion(this.powerUps, c)) tree[p.id] = p.maxRank;
      this.save.championUpgrades[c.id] = tree;
    }
    this.changed("MAXED EVERY CHAMPION TREE");
  }

  private reset(): void {
    if (
      !window.confirm(
        "Reset local save? Gold, shards, champions, upgrades, settings, and achievements will be erased.",
      )
    ) {
      return;
    }
    resetSave(this.characters[0]?.id ?? "lux");
    window.location.reload();
  }
}
