// Full-screen region-chest reveal. Rewards are already committed by the time
// this opens, so closing/skipping the animation can never duplicate a pull.
import type { CharacterDef } from "@rift/sim";
import { championColor } from "./champion-colors";
import { crestMark } from "./crest-identity";
import { type GachaDrop, RARITY_LABELS, rarityRank } from "./meta/meta";
import { championRegions, regionStyle } from "./regions";

interface ChestOpeningOptions {
  region: string;
  drops: GachaDrop[];
  characters: CharacterDef[];
  count: 1 | 10;
  keysRemaining: number;
  onClose: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function hex(value: number): string {
  return `#${value.toString(16).padStart(6, "0")}`;
}

export class ChestOpeningUI {
  private readonly root: HTMLElement;
  private onClose: (() => void) | null = null;
  private timers: number[] = [];
  private readonly reduceMotion: boolean;
  private keyHandler: ((event: KeyboardEvent) => void) | null = null;

  constructor() {
    this.reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.root = el("div", "chest-opening");
    this.root.style.display = "none";
    document.body.appendChild(this.root);
  }

  show(options: ChestOpeningOptions): void {
    this.cancelTimers();
    if (this.keyHandler) {
      window.removeEventListener("keydown", this.keyHandler);
      this.keyHandler = null;
    }
    this.onClose = options.onClose;
    const style = regionStyle(options.region);
    this.root.replaceChildren();
    this.root.style.setProperty("--chest-region", style.color);
    this.root.style.setProperty("--chest-accent", style.accent);

    const backdrop = el("div", "chest-opening-backdrop");
    const stage = el("div", "chest-opening-stage");
    const head = el("div", "chest-opening-head");
    const crest = crestMark([options.region], "sm", "chest-opening-crest");
    const titleWrap = el("div", "chest-opening-title-wrap");
    titleWrap.append(
      el(
        "div",
        "chest-opening-kicker",
        options.region === "Darkin" ? "DARKIN CHEST" : "REGION CHEST",
      ),
      el("div", "chest-opening-title", options.region.toUpperCase()),
      el(
        "div",
        "chest-opening-sub",
        `${options.count} ${options.count === 1 ? "PULL" : "PULLS"} · ${options.keysRemaining} KEYS LEFT`,
      ),
    );
    head.append(crest, titleWrap);
    stage.appendChild(head);

    const chestWrap = el("div", "chest-opening-chest-wrap");
    const rays = el("div", "chest-opening-rays");
    const chest = el("div", "chest-opening-chest");
    const lid = el("div", "chest-opening-lid");
    const body = el("div", "chest-opening-body");
    body.append(el("div", "chest-opening-lock"), el("div", "chest-opening-shine"));
    chest.append(lid, body);
    chestWrap.append(rays, chest);
    stage.appendChild(chestWrap);

    const status = el("div", "chest-opening-status", "THE LOCK IS LISTENING...");
    stage.appendChild(status);

    const cards = el("div", "chest-opening-cards");
    const cardNodes: HTMLElement[] = [];
    for (const drop of options.drops) {
      const card = this.makeCard(drop, options.characters);
      card.classList.add("chest-opening-card-hidden");
      cards.appendChild(card);
      cardNodes.push(card);
    }
    stage.appendChild(cards);

    const actions = el("div", "chest-opening-actions");
    const skip = el("button", "meta-btn small ghost", "SKIP");
    skip.addEventListener("click", () => this.revealAll(cardNodes, status, actions));
    const close = el("button", "meta-play chest-opening-continue", "CONTINUE");
    close.addEventListener("click", () => this.close());
    actions.append(skip, close);
    stage.appendChild(actions);

    stage.appendChild(
      el(
        "div",
        "chest-opening-hint",
        this.reduceMotion ? "REDUCED MOTION · REWARDS REVEALED" : "CLICK SKIP TO REVEAL ALL",
      ),
    );

    this.root.append(backdrop, stage);
    this.root.style.display = "flex";
    this.root.classList.add("is-active");
    this.root.dataset.phase = "charge";

    this.keyHandler = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.revealAll(cardNodes, status, actions);
      }
    };
    window.addEventListener("keydown", this.keyHandler);

    if (this.reduceMotion) {
      this.root.dataset.phase = "reveal";
      for (const card of cardNodes) card.classList.remove("chest-opening-card-hidden");
      status.textContent = "REWARDS SECURED";
      close.style.display = "inline-block";
      skip.style.display = "none";
      return;
    }

    this.after(650, () => {
      this.root.dataset.phase = "burst";
      status.textContent = "THE CHEST IS OPENING";
    });
    this.after(1100, () => {
      this.root.dataset.phase = "reveal";
      cardNodes.forEach((card, index) => {
        this.after(index * 105, () => {
          card.classList.remove("chest-opening-card-hidden");
          card.classList.add("chest-opening-card-revealed");
        });
      });
      this.after(cardNodes.length * 105 + 220, () => {
        status.textContent = "REWARDS SECURED";
        close.style.display = "inline-block";
        skip.style.display = "none";
        this.root.classList.add("is-revealed");
      });
    });
  }

  private makeCard(drop: GachaDrop, characters: CharacterDef[]): HTMLElement {
    const champion = drop.championId
      ? characters.find((candidate) => candidate.id === drop.championId)
      : undefined;
    const rarity = champion?.rarity ?? "rare";
    const rank = rarityRank(rarity);
    const card = el("div", "chest-opening-card");
    card.dataset.rarity = drop.kind === "gold" ? "gold" : rarity;
    const color = champion ? hex(championColor(champion.id)) : "#e8bd5e";
    card.style.setProperty("--card-color", color);
    card.style.setProperty("--rarity-rank", String(rank));

    const kind = drop.guaranteed
      ? `GUARANTEED ${RARITY_LABELS[rarity]}`
      : drop.kind === "champion"
        ? `${RARITY_LABELS[rarity]} CHAMPION`
        : drop.kind === "shards"
          ? `${RARITY_LABELS[rarity]} SHARDS`
          : "GOLD CACHE";
    card.appendChild(el("div", "chest-opening-card-kind", kind));

    const art = el("div", "chest-opening-card-art");
    const glyph = el("span", "chest-opening-card-glyph", champion?.name?.charAt(0) ?? "?");
    art.appendChild(glyph);
    if (champion) {
      art.appendChild(crestMark(championRegions(champion), "xs", "chest-opening-card-crest"));
    }
    card.appendChild(art);

    if (drop.kind === "champion") {
      card.append(
        el("div", "chest-opening-card-name", champion?.name ?? drop.championId ?? "CHAMPION"),
        el("div", "chest-opening-card-detail", "CHAMPION UNLOCKED"),
      );
    } else if (drop.kind === "shards") {
      card.append(
        el("div", "chest-opening-card-name", champion?.name ?? drop.championId ?? "CHAMPION"),
        el("div", "chest-opening-card-detail", `+${drop.amount} SHARDS`),
      );
    } else {
      card.append(
        el("div", "chest-opening-card-name", "GOLD CACHE"),
        el("div", "chest-opening-card-detail", `+${drop.amount} GOLD`),
      );
    }

    if (drop.guaranteed) card.classList.add("is-guaranteed");
    return card;
  }

  private revealAll(cards: HTMLElement[], status: HTMLElement, actions: HTMLElement): void {
    this.cancelTimers();
    this.root.dataset.phase = "reveal";
    for (const card of cards) {
      card.classList.remove("chest-opening-card-hidden");
      card.classList.add("chest-opening-card-revealed");
    }
    status.textContent = "REWARDS SECURED";
    const close = actions.querySelector<HTMLElement>(".chest-opening-continue");
    const skip = actions.querySelector<HTMLElement>(".ghost");
    if (close) close.style.display = "inline-block";
    if (skip) skip.style.display = "none";
    this.root.classList.add("is-revealed");
  }

  private close(): void {
    this.cancelTimers();
    this.root.style.display = "none";
    this.root.classList.remove("is-active", "is-revealed");
    if (this.keyHandler) {
      window.removeEventListener("keydown", this.keyHandler);
      this.keyHandler = null;
    }
    const callback = this.onClose;
    this.onClose = null;
    callback?.();
  }

  private after(delay: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, delay));
  }

  private cancelTimers(): void {
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers = [];
  }
}
