// Level-up card UI (plain DOM, per docs/01). Renders the generic Offer the sim
// emits; clicking a card sends its index back to the host.
import type { Offer } from "@rift/sim";

export class LevelUpUI {
  private readonly root: HTMLElement;
  private chooseCb: ((index: number) => void) | null = null;

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "levelup";
    this.root.style.display = "none";
    document.body.appendChild(this.root);
  }

  show(offer: Offer): void {
    this.root.replaceChildren();

    const title = document.createElement("div");
    title.className = "levelup-title";
    title.textContent = offer.kind === "chest" ? "CHEST" : "LEVEL UP";
    this.root.appendChild(title);

    const row = document.createElement("div");
    row.className = "levelup-row";

    offer.options.forEach((option, index) => {
      const card = document.createElement("button");
      card.className = "levelup-card";
      card.textContent = option.isEvolution
        ? `EVOLVE: ${option.ref.id}`
        : option.level === undefined
          ? `${option.ref.type}: ${option.ref.id} (new)`
          : `${option.ref.type}: ${option.ref.id} Lv${option.level}`;
      card.addEventListener("click", () => this.choose(index));
      row.appendChild(card);
    });

    this.root.appendChild(row);
    this.root.style.display = "flex";
  }

  hide(): void {
    this.root.style.display = "none";
  }

  onChoose(cb: (index: number) => void): void {
    this.chooseCb = cb;
  }

  private choose(index: number): void {
    this.hide();
    if (this.chooseCb) this.chooseCb(index);
  }
}
