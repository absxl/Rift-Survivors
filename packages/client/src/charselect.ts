// Character select overlay (plain DOM). Lists the pack's characters; picking one
// starts the run with that character.
import type { CharacterDef } from "@rift/sim";
import { championColor } from "./champion-colors";

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
      card.style.borderColor = `#${championColor(c.id).toString(16).padStart(6, "0")}`;

      const name = document.createElement("div");
      name.className = "charselect-name";
      name.textContent = c.id.toUpperCase();
      card.appendChild(name);

      const ability = document.createElement("div");
      ability.className = "charselect-ability";
      ability.textContent = c.startingWeapon.replace(/-/g, " ").toUpperCase();
      card.appendChild(ability);

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
