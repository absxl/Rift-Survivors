// Level-up card UI (plain DOM, per docs/01). Renders the generic Offer the sim
// emits; clicking a card sends its index back to the host. Also exposes the
// reroll / skip / banish agency actions (`Offer.rerolls/skips/banishes`).
import type { Offer } from "@rift/sim";

export class LevelUpUI {
  private readonly root: HTMLElement;
  private chooseCb: ((index: number) => void) | null = null;
  private rerollCb: (() => void) | null = null;
  private skipCb: (() => void) | null = null;
  private banishCb: ((index: number) => void) | null = null;
  private offer: Offer | null = null;
  private banishMode = false;

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "levelup";
    this.root.style.display = "none";
    document.body.appendChild(this.root);
    window.addEventListener("keydown", this.onKeyDown);
  }

  show(offer: Offer): void {
    this.offer = offer;
    this.banishMode = false;
    this.render();
    this.root.style.display = "flex";
  }

  hide(): void {
    this.offer = null;
    this.banishMode = false;
    this.root.style.display = "none";
  }

  onChoose(cb: (index: number) => void): void {
    this.chooseCb = cb;
  }

  onReroll(cb: () => void): void {
    this.rerollCb = cb;
  }

  onSkip(cb: () => void): void {
    this.skipCb = cb;
  }

  onBanish(cb: (index: number) => void): void {
    this.banishCb = cb;
  }

  private render(): void {
    const offer = this.offer;
    if (!offer) return;
    this.root.replaceChildren();

    const title = document.createElement("div");
    title.className = "levelup-title";
    title.textContent = offer.kind === "chest" ? "CHEST" : "LEVEL UP";
    this.root.appendChild(title);

    const row = document.createElement("div");
    row.className = "levelup-row";

    offer.options.forEach((option, index) => {
      const card = document.createElement("button");
      card.className = this.banishMode ? "levelup-card banish-target" : "levelup-card";
      const label = option.isEvolution
        ? `EVOLVE: ${option.ref.id}`
        : option.level === undefined
          ? `${option.ref.type}: ${option.ref.id} (new)`
          : `${option.ref.type}: ${option.ref.id} Lv${option.level}`;
      card.textContent = `${index + 1}. ${label}`;
      card.addEventListener("click", () => this.pick(index));
      row.appendChild(card);
    });

    this.root.appendChild(row);

    const actions = document.createElement("div");
    actions.className = "levelup-actions";
    actions.appendChild(this.actionButton("REROLL", offer.rerolls ?? 0, () => this.doReroll()));
    actions.appendChild(this.actionButton("SKIP", offer.skips ?? 0, () => this.doSkip()));
    actions.appendChild(
      this.actionButton(this.banishMode ? "CANCEL BANISH" : "BANISH", offer.banishes ?? 0, () => {
        if ((offer.banishes ?? 0) <= 0) return;
        this.banishMode = !this.banishMode;
        this.render();
      }),
    );
    this.root.appendChild(actions);

    const hint = document.createElement("div");
    hint.className = "levelup-hint";
    hint.textContent = "1-3 PICK  ·  R REROLL  ·  S SKIP  ·  B BANISH";
    this.root.appendChild(hint);
  }

  private actionButton(label: string, count: number, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "levelup-action";
    button.textContent = `${label} (${count})`;
    button.disabled = count <= 0;
    button.addEventListener("click", onClick);
    return button;
  }

  /** Card click / number key: pick it, or banish it while in banish mode. */
  private pick(index: number): void {
    if (this.banishMode) {
      this.doBanish(index);
      return;
    }
    this.hide();
    this.chooseCb?.(index);
  }

  private doReroll(): void {
    if ((this.offer?.rerolls ?? 0) <= 0) return;
    this.banishMode = false;
    this.rerollCb?.();
  }

  private doSkip(): void {
    if ((this.offer?.skips ?? 0) <= 0) return;
    this.hide();
    this.skipCb?.();
  }

  private doBanish(index: number): void {
    if ((this.offer?.banishes ?? 0) <= 0) return;
    this.banishMode = false;
    this.banishCb?.(index);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!this.offer || this.root.style.display === "none") return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;

    const key = e.key.toLowerCase();
    if (key >= "1" && key <= "9") {
      const index = Number(key) - 1;
      if (index < this.offer.options.length) {
        e.preventDefault();
        this.pick(index);
      }
      return;
    }
    if (key === "r") {
      e.preventDefault();
      this.doReroll();
    } else if (key === "s") {
      e.preventDefault();
      this.doSkip();
    } else if (key === "b") {
      e.preventDefault();
      if ((this.offer.banishes ?? 0) > 0) {
        this.banishMode = !this.banishMode;
        this.render();
      }
    }
  };
}
