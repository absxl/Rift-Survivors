// In-game shop overlay (docs/10 D-047): a League-style shop with tier tabs,
// gold readout, combine and sell actions. The game keeps running while open.
import type { ItemDef, WorldSnapshot } from "@rift/sim";
import { itemIconURL } from "./assets/icons";

export interface ShopCallbacks {
  onBuy: (itemId: string) => void;
  onCombine: (itemId: string) => void;
  onSell: (slot: number) => void;
}

type Tab = "all" | "component" | "epic" | "legendary" | "owned";

const TIER_COLORS: Record<ItemDef["tier"], string> = {
  component: "#a8b6c8",
  epic: "#7f9cff",
  legendary: "#d7b56d",
};

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function statLine(key: string, value: number): string {
  const labels: Record<string, string> = {
    attackDamage: "AD",
    abilityPower: "AP",
    maxHp: "HP",
    armor: "ARMOR",
    resist: "RESIST",
    regen: "REGEN",
    cooldown: "HASTE",
    area: "AREA",
    moveSpeed: "MS",
    luck: "LUCK",
    greed: "GOLD",
    lifesteal: "LIFESTEAL",
    pierce: "PIERCE",
    projectileSpeed: "SPEED",
  };
  const pct = [
    "cooldown",
    "area",
    "moveSpeed",
    "luck",
    "greed",
    "lifesteal",
    "resist",
    "projectileSpeed",
    "maxHp",
  ];
  const label = labels[key] ?? key.toUpperCase();
  return pct.includes(key) ? `+${Math.round(value * 100)}% ${label}` : `+${value} ${label}`;
}

export class ShopUI {
  readonly root: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly goldEl: HTMLElement;
  private readonly tabbar: HTMLElement;
  private readonly hint: HTMLElement;
  private items: ItemDef[] = [];
  private callbacks: ShopCallbacks | null = null;
  private tab: Tab = "all";
  private search = "";
  private snapshot: WorldSnapshot | null = null;
  private localPlayerId = 0;
  private open = false;

  constructor() {
    this.root = el("div", "shop");
    this.root.style.display = "none";

    const head = el("div", "shop-head");
    head.appendChild(el("div", "shop-title", "SHOP"));
    this.goldEl = el("div", "shop-gold", "0 G");
    head.appendChild(this.goldEl);
    const close = el("button", "shop-close", "ESC ✕") as HTMLButtonElement;
    close.addEventListener("click", () => this.hide());
    head.appendChild(close);
    this.root.appendChild(head);

    this.tabbar = el("div", "shop-tabs");
    for (const tab of ["all", "component", "epic", "legendary", "owned"] as const) {
      const button = el(
        "button",
        "shop-tab",
        tab === "owned" ? "OWNED" : tab.toUpperCase(),
      ) as HTMLButtonElement;
      button.dataset.tab = tab;
      button.addEventListener("click", () => {
        this.tab = tab;
        this.renderTabs();
        this.renderGrid();
      });
      this.tabbar.appendChild(button);
    }
    this.root.appendChild(this.tabbar);

    const searchWrap = el("div", "shop-search");
    const input = el("input", "shop-search-input") as HTMLInputElement;
    input.type = "text";
    input.placeholder = "Search items…";
    input.addEventListener("input", () => {
      this.search = input.value.trim().toLowerCase();
      this.renderGrid();
    });
    searchWrap.appendChild(input);
    this.root.appendChild(searchWrap);

    this.grid = el("div", "shop-grid");
    this.root.appendChild(this.grid);
    this.hint = el(
      "div",
      "shop-hint",
      "Buy components, combine them into legendaries. Sell back for 70%.",
    );
    this.root.appendChild(this.hint);

    document.body.appendChild(this.root);
    this.renderTabs();
  }

  setItems(items: ItemDef[]): void {
    this.items = items;
    this.renderGrid();
  }

  setCallbacks(callbacks: ShopCallbacks): void {
    this.callbacks = callbacks;
  }

  setLocalPlayer(id: number): void {
    this.localPlayerId = id;
  }

  get isOpen(): boolean {
    return this.open;
  }

  toggle(): void {
    if (this.open) this.hide();
    else this.show();
  }

  show(): void {
    this.open = true;
    this.root.style.display = "";
    this.renderGrid();
  }

  hide(): void {
    this.open = false;
    this.root.style.display = "none";
  }

  /** Feed the latest snapshot so gold and inventory stay current. */
  update(snapshot: WorldSnapshot): void {
    this.snapshot = snapshot;
    if (!this.open) return;
    this.renderGrid();
  }

  private ownedSlots(): { slot: number; defIndex: number }[] {
    const store = this.snapshot?.stores.find((s) => s.kind === "item");
    if (!store) return [];
    const out: { slot: number; defIndex: number }[] = [];
    // fields arrays are parallel to slots (snapshot codec).
    for (let i = 0; i < store.slots.length; i++) {
      const defIndex = store.fields.defIndex?.[i];
      if (defIndex === undefined) continue;
      out.push({ slot: store.slots[i], defIndex });
    }
    return out;
  }

  private gold(): number {
    // Player slots are never freed, so slot == index for players.
    const store = this.snapshot?.stores.find((s) => s.kind === "player");
    if (!store) return 0;
    const value = store.fields.gold?.[this.localPlayerId];
    return typeof value === "number" ? value : 0;
  }

  private renderTabs(): void {
    for (const node of Array.from(this.tabbar.children)) {
      const button = node as HTMLElement;
      button.classList.toggle("active", button.dataset.tab === this.tab);
    }
  }

  private renderGrid(): void {
    const gold = this.gold();
    this.goldEl.textContent = `${Math.round(gold)} G`;
    this.grid.replaceChildren();

    const owned = this.ownedSlots();
    const ownedIds = new Set(owned.map((o) => this.items[o.defIndex]?.id));

    if (this.tab === "owned") {
      if (owned.length === 0) {
        this.grid.appendChild(el("div", "shop-empty", "Nothing owned yet. Break your piggy bank."));
      }
      for (const entry of owned) {
        const def = this.items[entry.defIndex];
        if (!def) continue;
        this.grid.appendChild(this.ownedCard(def, entry.slot, gold));
      }
      return;
    }

    const filtered = this.items.filter((item) => {
      if (this.tab !== "all" && item.tier !== this.tab) return false;
      if (this.search && !`${item.name} ${item.id}`.toLowerCase().includes(this.search))
        return false;
      return true;
    });

    for (const def of filtered) {
      this.grid.appendChild(this.shopCard(def, gold, ownedIds.has(def.id)));
    }
    if (filtered.length === 0) {
      this.grid.appendChild(el("div", "shop-empty", "No items match."));
    }
  }

  private shopCard(def: ItemDef, gold: number, ownedAlready: boolean): HTMLElement {
    const card = el("div", `shop-card tier-${def.tier}`);
    card.style.setProperty("--tier-color", TIER_COLORS[def.tier]);

    const top = el("div", "shop-card-top");
    const icon = el("img", "shop-card-icon") as HTMLImageElement;
    icon.src = itemIconURL(def);
    icon.alt = "";
    top.appendChild(icon);
    top.appendChild(el("div", "shop-card-name", def.name));
    top.appendChild(el("div", "shop-card-cost", `${def.cost} G`));
    card.appendChild(top);

    const stats = el("div", "shop-card-stats");
    for (const [key, value] of Object.entries(def.stats)) {
      stats.appendChild(el("span", "shop-stat", statLine(key, value)));
    }
    card.appendChild(stats);

    if (def.description) card.appendChild(el("div", "shop-card-desc", def.description));

    const actions = el("div", "shop-card-actions");
    if (def.recipe) {
      actions.appendChild(
        el(
          "div",
          "shop-card-recipe",
          `Recipe: ${def.recipe.components.join(" + ")} + ${def.recipe.combineCost} G`,
        ),
      );
    }
    const buy = el("button", "shop-buy", ownedAlready ? "OWNED" : "BUY") as HTMLButtonElement;
    const affordable = gold >= def.cost;
    const slotsFull = this.ownedSlots().length >= 16;
    buy.disabled = ownedAlready || !affordable || slotsFull;
    buy.addEventListener("click", () => this.callbacks?.onBuy(def.id));
    actions.appendChild(buy);
    card.appendChild(actions);
    return card;
  }

  private ownedCard(def: ItemDef, slot: number, gold: number): HTMLElement {
    const card = el("div", `shop-card tier-${def.tier} owned`);
    card.style.setProperty("--tier-color", TIER_COLORS[def.tier]);

    const top = el("div", "shop-card-top");
    top.appendChild(el("div", "shop-card-name", def.name));
    top.appendChild(el("div", "shop-card-cost", `${Math.round(def.cost * 0.7)} G resale`));
    card.appendChild(top);

    const stats = el("div", "shop-card-stats");
    for (const [key, value] of Object.entries(def.stats)) {
      stats.appendChild(el("span", "shop-stat", statLine(key, value)));
    }
    card.appendChild(stats);

    const actions = el("div", "shop-card-actions");
    if (def.recipe) {
      const canCombine = def.recipe.components.every((component) =>
        this.ownedSlots().some((o) => this.items[o.defIndex]?.id === component),
      );
      const combine = el(
        "button",
        "shop-combine",
        `COMBINE (+${def.recipe.combineCost} G)`,
      ) as HTMLButtonElement;
      combine.disabled = !canCombine || gold < def.recipe.combineCost;
      combine.addEventListener("click", () => this.callbacks?.onCombine(def.id));
      actions.appendChild(combine);
    }
    const sell = el("button", "shop-sell", "SELL 70%") as HTMLButtonElement;
    sell.addEventListener("click", () => this.callbacks?.onSell(slot));
    actions.appendChild(sell);
    card.appendChild(actions);
    return card;
  }
}
