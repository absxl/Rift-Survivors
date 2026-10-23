// Character select overlay (plain DOM). Lists the pack's characters; picking one
// starts the run with that character.
import type { CharacterDef } from "@rift/sim";

export class CharacterSelect {
  private chooseCb: ((id: string) => void) | null = null;

  constructor(characters: CharacterDef[]) {
    const root = document.createElement("div");
    root.className = "charselect";

    const title = document.createElement("div");
    title.className = "charselect-title";
    title.textContent = "SELECT CHAMPION";
    root.appendChild(title);

    const row = document.createElement("div");
    row.className = "charselect-row";
    for (const c of characters) {
      const card = document.createElement("button");
      card.className = "charselect-card";
      card.textContent = c.id.toUpperCase();
      card.addEventListener("click", () => this.choose(c.id, root));
      row.appendChild(card);
    }
    root.appendChild(row);
    document.body.appendChild(root);
  }

  onChoose(cb: (id: string) => void): void {
    this.chooseCb = cb;
  }

  private choose(id: string, root: HTMLElement): void {
    root.remove();
    if (this.chooseCb) this.chooseCb(id);
  }
}
