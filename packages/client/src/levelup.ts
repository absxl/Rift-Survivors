// Level-up/chest cards (DOM). Flavor + derived stat deltas live on the card;
// hotkeys never collide with movement (picks 1-4, R reroll, X skip, B banish).
import type { AbilityDef, Offer, PassiveDef, RunStats } from "@rift/sim";
import { offerCardInfo } from "./ability-info";

export class LevelUpUI {
  private readonly root: HTMLElement;
  private chooseCb: ((index: number) => void) | null = null;
  private rerollCb: (() => void) | null = null;
  private skipCb: (() => void) | null = null;
  private banishCb: ((index: number) => void) | null = null;
  private offer: Offer | null = null;
  private banishMode = false;
  private stats: RunStats | null = null;

  constructor(
    private readonly abilities: AbilityDef[],
    private readonly passives: PassiveDef[],
  ) {
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

  get visible(): boolean {
    return this.offer !== null && this.root.style.display !== "none";
  }

  setStats(stats: RunStats | null): void {
    this.stats = stats;
    if (this.offer && this.root.style.display !== "none") this.render();
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

    const titleWrap = document.createElement("div");
    titleWrap.className = "levelup-heading";
    const eyebrow = document.createElement("div");
    eyebrow.className = "levelup-eyebrow";
    eyebrow.textContent = offer.kind === "chest" ? "TREASURE" : "CHOOSE YOUR POWER";
    const title = document.createElement("div");
    title.className = "levelup-title";
    title.textContent = offer.kind === "chest" ? "A CHEST OPENS" : "LEVEL UP";
    titleWrap.append(eyebrow, title);
    this.root.appendChild(titleWrap);

    const row = document.createElement("div");
    row.className = "levelup-row";
    offer.options.forEach((option, index) => {
      const info = offerCardInfo(option, this.abilities, this.passives, this.stats ?? undefined);
      const card = document.createElement("button");
      const classes = ["levelup-card"];
      if (this.banishMode) classes.push("banish-target");
      if (info.isTraining) classes.push("training");
      card.className = classes.join(" ");
      card.style.setProperty("--card-color", info.color);
      card.dataset.index = String(index);

      const top = document.createElement("div");
      top.className = "levelup-card-top";
      const icon = document.createElement("div");
      icon.className = "levelup-icon";
      icon.textContent = info.title.charAt(0).toUpperCase();
      const meta = document.createElement("div");
      meta.className = "levelup-meta";
      const badge = document.createElement("div");
      badge.className = "levelup-badge";
      badge.textContent = info.badge;
      const name = document.createElement("div");
      name.className = "levelup-name";
      name.textContent = info.title;
      meta.append(badge, name);
      top.append(icon, meta);
      card.appendChild(top);

      const subtitle = document.createElement("div");
      subtitle.className = "levelup-subtitle";
      subtitle.textContent = info.subtitle;
      card.appendChild(subtitle);

      const desc = document.createElement("div");
      desc.className = "levelup-desc";
      desc.textContent = info.description;
      card.appendChild(desc);

      if (info.lines.length > 0) {
        const lines = document.createElement("div");
        lines.className = "levelup-lines";
        for (const line of info.lines) {
          const rowEl = document.createElement("div");
          rowEl.className = "levelup-line";
          const label = document.createElement("span");
          label.className = "levelup-line-label";
          label.textContent = line.label;
          const value = document.createElement("span");
          value.className = "levelup-line-value";
          value.textContent = line.value;
          rowEl.append(label, value);
          lines.appendChild(rowEl);
        }
        card.appendChild(lines);
      } else if (info.isTraining) {
        const hint = document.createElement("div");
        hint.className = "levelup-training-hint";
        hint.textContent = "Repeatable · costs no item slot";
        card.appendChild(hint);
      }

      const pick = document.createElement("div");
      pick.className = "levelup-pick";
      pick.textContent = this.banishMode ? `[${index + 1}] BANISH` : `[${index + 1}]`;
      card.appendChild(pick);

      card.addEventListener("click", () => this.pick(index));
      row.appendChild(card);
    });
    this.root.appendChild(row);

    const actions = document.createElement("div");
    actions.className = "levelup-actions";
    actions.appendChild(
      this.actionButton("REROLL", offer.rerolls ?? 0, "R", () => this.doReroll()),
    );
    actions.appendChild(this.actionButton("SKIP", offer.skips ?? 0, "X", () => this.doSkip()));
    actions.appendChild(
      this.actionButton(
        this.banishMode ? "CANCEL BANISH" : "BANISH",
        offer.banishes ?? 0,
        "B",
        () => {
          if ((offer.banishes ?? 0) <= 0) return;
          this.banishMode = !this.banishMode;
          this.render();
        },
      ),
    );
    this.root.appendChild(actions);

    const hint = document.createElement("div");
    hint.className = "levelup-hint";
    hint.textContent =
      "1-4 PICK  ·  R REROLL  ·  X SKIP  ·  B BANISH  ·  MOVEMENT NEVER CLOSES THIS";
    this.root.appendChild(hint);
  }

  private actionButton(
    label: string,
    count: number,
    key: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "levelup-action";
    button.textContent = `${label}  [${key}]  (${count})`;
    button.disabled = count <= 0;
    button.addEventListener("click", onClick);
    return button;
  }

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
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

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
    } else if (key === "x") {
      e.preventDefault();
      this.doSkip();
    } else if (key === "b") {
      e.preventDefault();
      if ((this.offer.banishes ?? 0) > 0) {
        this.banishMode = !this.banishMode;
        this.render();
      }
    }
    // Deliberately ignore WASD/arrows: moving while the menu is open must not close it.
  };
}
