// League-client-inspired meta hub: PLAY / CHAMPIONS / UPGRADES / CHESTS /
// ACHIEVEMENTS / SETTINGS. Champions are gacha-only; the Upgrades section
// upgrades the currently selected champion's own tree.
import type { CharacterDef, PowerUpDef, WeaponDef } from "@rift/sim";
import { statLabel, weaponName } from "./ability-info";
import { championColor } from "./champion-colors";
import {
  ACHIEVEMENTS,
  GACHA_ODDS,
  type GachaDrop,
  RARITY_LABELS,
  buyPowerUp,
  canUnlockWithShards,
  championsInRegion,
  isUnlocked,
  nextCost,
  openRegionChests,
  rankOf,
  refundPowerUp,
  regionsOf,
  shardsFor,
  shardsRequired,
  unlockWithShards,
  upgradesForChampion,
} from "./meta/meta";
import { regionStyle } from "./regions";
import type { Keybinds, SaveData } from "./save/save";
import { persistSave, resetSave } from "./save/save";

type Section = "play" | "champions" | "upgrades" | "chests" | "achievements" | "settings";

const SECTIONS: Array<{ id: Section; label: string; glyph: string; hint: string }> = [
  { id: "play", label: "PLAY", glyph: "▶", hint: "Enter the Rift" },
  { id: "champions", label: "CHAMPIONS", glyph: "◈", hint: "Collection & selection" },
  { id: "upgrades", label: "UPGRADES", glyph: "✦", hint: "Selected champion's tree" },
  { id: "chests", label: "CHESTS", glyph: "◆", hint: "Region gacha & shards" },
  { id: "achievements", label: "ACHIEVEMENTS", glyph: "★", hint: "Run milestones" },
  { id: "settings", label: "SETTINGS", glyph: "⚙", hint: "Audio, controls, save" },
];

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

function percentStat(key: string, amount: number): string {
  const sign = amount >= 0 ? "+" : "";
  if (key === "armor" || key === "pierce") return `${sign}${Math.round(amount)}`;
  if (key === "regen") return `${sign}${amount.toFixed(1)}/S`;
  return `${sign}${Math.round(amount * 100)}%`;
}

export class MetaScreen {
  private readonly root: HTMLElement;
  private playCb: (() => void) | null = null;
  private coopCb: (() => void) | null = null;
  private settingsCb: ((settings: SaveData["settings"]) => void) | null = null;
  private section: Section = "play";
  private championFilter = "ALL";
  private listening: keyof Keybinds | null = null;
  private captureHandler: ((e: KeyboardEvent) => void) | null = null;
  private gachaResults: { region: string; drops: GachaDrop[] } | null = null;
  private scrollTop = 0;

  constructor(
    private readonly save: SaveData,
    private readonly powerUps: PowerUpDef[],
    private readonly characters: CharacterDef[],
    private readonly weapons: WeaponDef[],
  ) {
    this.root = document.createElement("div");
    this.root.className = "meta";
    document.body.appendChild(this.root);
    this.ensureSelected();
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
    this.ensureSelected();
    this.render();
    this.root.style.display = "block";
  }

  hide(): void {
    this.cancelRebind();
    this.root.style.display = "none";
  }

  /** Re-render while visible (admin panel changes use this). */
  refresh(): void {
    if (this.root.style.display !== "none") this.render();
  }

  private ensureSelected(): void {
    const unlocked = this.characters.filter((c) => isUnlocked(this.save, c.id));
    if (unlocked.length === 0) return;
    if (!unlocked.some((c) => c.id === this.save.selectedCharacter)) {
      this.save.selectedCharacter = unlocked[0].id;
    }
  }

  private selected(): CharacterDef | undefined {
    return (
      this.characters.find((c) => c.id === this.save.selectedCharacter) ??
      this.characters.find((c) => isUnlocked(this.save, c.id)) ??
      this.characters[0]
    );
  }

  private persist(): void {
    persistSave(this.save);
    this.render();
  }

  private setSection(section: Section): void {
    this.cancelRebind();
    this.section = section;
    this.scrollTop = 0;
    this.render();
  }

  private render(): void {
    const previous = this.root.querySelector<HTMLElement>(".meta-content");
    if (previous) this.scrollTop = previous.scrollTop;
    this.root.replaceChildren();
    this.ensureSelected();

    const shell = el("div", "meta-shell");
    shell.appendChild(this.renderTopbar());
    const body = el("div", "meta-body");
    body.appendChild(this.renderSidebar());
    const content = this.renderContent();
    body.appendChild(content);
    shell.appendChild(body);
    this.root.appendChild(shell);
    content.scrollTop = this.scrollTop;
  }

  private renderTopbar(): HTMLElement {
    const bar = el("div", "meta-topbar");
    const brand = el("div", "meta-brand");
    const mark = el("div", "meta-brand-mark", "R");
    const copy = el("div", "meta-brand-copy");
    copy.append(
      el("div", "meta-brand-title", "RIFT SURVIVORS"),
      el("div", "meta-brand-sub", "THE MAGE'S GAUNTLET"),
    );
    brand.append(mark, copy);

    const selected = this.selected();
    const currency = el("div", "meta-currency");
    const gold = el("div", "meta-currency-pill");
    gold.append(el("span", "meta-currency-icon", "⬡"), el("span", "", `${this.save.gold} GOLD`));
    const chests = el("div", "meta-currency-pill accent");
    chests.append(
      el("span", "meta-currency-icon", "◆"),
      el("span", "", `${this.save.chests} CHESTS`),
    );
    currency.append(gold, chests);
    if (selected) {
      const hero = el("div", "meta-topbar-champion");
      const dot = el("span", "meta-topbar-dot", selected.name?.charAt(0) ?? "?");
      dot.style.color = hex(championColor(selected.id));
      dot.style.borderColor = hex(championColor(selected.id));
      hero.append(dot, el("span", "", selected.name ?? selected.id));
      currency.appendChild(hero);
    }
    const admin = el("div", "meta-admin-hint", "H · ADMIN");
    bar.append(brand, currency, admin);
    return bar;
  }

  private renderSidebar(): HTMLElement {
    const side = el("aside", "meta-sidebar");
    const selected = this.selected();
    if (selected) {
      const card = el("div", "meta-sidebar-champion");
      card.style.setProperty("--champ-color", hex(championColor(selected.id)));
      const portrait = el("div", "meta-sidebar-portrait", selected.name?.charAt(0) ?? "?");
      const info = el("div", "meta-sidebar-info");
      info.append(
        el("div", "meta-sidebar-name", selected.name ?? selected.id),
        el(
          "div",
          "meta-sidebar-region",
          `${selected.region ?? "Runeterra"} · ${selected.class ?? "mage"}`,
        ),
      );
      card.append(portrait, info);
      side.appendChild(card);
    }

    const nav = el("nav", "meta-nav");
    for (const item of SECTIONS) {
      const button = el("button", `meta-nav-item${this.section === item.id ? " active" : ""}`);
      const glyph = el("span", "meta-nav-glyph", item.glyph);
      const copy = el("span", "meta-nav-copy");
      copy.append(el("span", "meta-nav-label", item.label), el("span", "meta-nav-hint", item.hint));
      button.append(glyph, copy);
      button.addEventListener("click", () => this.setSection(item.id));
      nav.appendChild(button);
    }
    side.appendChild(nav);

    const footer = el("div", "meta-sidebar-footer");
    footer.append(
      el("div", "", "LOCAL SAVE · ACCOUNTS LATER"),
      el("div", "", "GACHA CHAMPIONS · PER-CHAMPION TREES"),
    );
    side.appendChild(footer);
    return side;
  }

  private renderContent(): HTMLElement {
    const content = el("main", "meta-content");
    switch (this.section) {
      case "play":
        content.appendChild(this.renderPlay());
        break;
      case "champions":
        content.appendChild(this.renderChampions());
        break;
      case "upgrades":
        content.appendChild(this.renderUpgrades());
        break;
      case "chests":
        content.appendChild(this.renderChests());
        break;
      case "achievements":
        content.appendChild(this.renderAchievements());
        break;
      case "settings":
        content.appendChild(this.renderSettings());
        break;
    }
    return content;
  }

  private sectionHead(kicker: string, title: string, sub: string): HTMLElement {
    const head = el("div", "meta-page-head");
    head.append(
      el("div", "meta-kicker", kicker),
      el("h1", "meta-title", title),
      el("div", "meta-subtitle", sub),
    );
    return head;
  }

  // -------------------------------------------------------------------------
  // PLAY
  // -------------------------------------------------------------------------
  private renderPlay(): HTMLElement {
    const wrap = el("div", "meta-page");
    wrap.appendChild(
      this.sectionHead(
        "THE RIFT AWAITS",
        "PLAY",
        "Pick a champion, build a run, and survive the endless field.",
      ),
    );

    const selected = this.selected();
    if (!selected) {
      wrap.appendChild(el("div", "meta-empty", "No champions in the content pack."));
      return wrap;
    }
    const color = hex(championColor(selected.id));
    const hero = el("div", "meta-hero");
    hero.style.setProperty("--champ-color", color);

    const art = el("div", "meta-hero-art");
    const halo = el("div", "meta-hero-halo");
    halo.textContent = selected.name?.charAt(0).toUpperCase() ?? "?";
    art.append(halo, el("div", "meta-hero-art-label", selected.region ?? "Runeterra"));

    const copy = el("div", "meta-hero-copy");
    const chips = el("div", "meta-chip-row");
    chips.append(
      this.chip(selected.region ?? "Runeterra", "region"),
      this.chip(RARITY_LABELS[selected.rarity ?? "rare"], "rarity"),
      this.chip(`${selected.class ?? "mage"}`, "class"),
      this.chip(isUnlocked(this.save, selected.id) ? "UNLOCKED" : "LOCKED", "state"),
    );
    copy.append(chips);
    copy.appendChild(el("h2", "meta-hero-name", selected.name ?? selected.id));
    copy.appendChild(el("p", "meta-hero-desc", selected.description ?? "A mage of the Rift."));

    const weapon = this.weapons.find((w) => w.id === selected.startingWeapon);
    const move = this.weapons.find((w) => w.id === selected.startingMove);
    const kit = el("div", "meta-kit");
    kit.appendChild(
      this.kitItem(
        "STARTING WEAPON",
        weaponName(weapon, selected.startingWeapon),
        weapon?.description ?? "",
      ),
    );
    if (move) {
      kit.appendChild(
        this.kitItem(
          "SIGNATURE MOVE",
          weaponName(move, selected.startingMove ?? ""),
          move.description ?? "",
        ),
      );
    }
    copy.appendChild(kit);

    const actions = el("div", "meta-play-actions");
    const play = el("button", "meta-play big", "PLAY");
    play.addEventListener("click", () => {
      if (this.playCb) this.playCb();
    });
    const coop = el("button", "meta-play big secondary", "CO-OP");
    coop.addEventListener("click", () => {
      if (this.coopCb) this.coopCb();
    });
    actions.append(play, coop);
    copy.appendChild(actions);

    hero.append(art, copy);
    wrap.appendChild(hero);

    const stats = el("div", "meta-stat-strip");
    const unlockedCount = this.characters.filter((c) => isUnlocked(this.save, c.id)).length;
    stats.append(
      this.statCard(
        "BEST SURVIVAL",
        this.save.bestTimeSec > 0 ? this.formatTime(this.save.bestTimeSec) : "—",
      ),
      this.statCard("TOTAL KILLS", String(this.save.totalKills)),
      this.statCard("CHAMPIONS", `${unlockedCount} / ${this.characters.length}`),
      this.statCard("CHESTS", String(this.save.chests)),
    );
    wrap.appendChild(stats);

    const note = el("div", "meta-note");
    note.textContent =
      "Champions are unlocked with region-chest shards. The Upgrades page invests gold into the selected champion only. H opens the local admin panel.";
    wrap.appendChild(note);
    return wrap;
  }

  // -------------------------------------------------------------------------
  // CHAMPIONS
  // -------------------------------------------------------------------------
  private renderChampions(): HTMLElement {
    const wrap = el("div", "meta-page");
    wrap.appendChild(
      this.sectionHead(
        "COLLECTION",
        "CHAMPIONS",
        "Every champion is a separate toolkit, tree, and gacha pursuit. Unlocked champions can be selected for solo or co-op.",
      ),
    );

    const regions = regionsOf(this.characters);
    const filters = el("div", "meta-filter-row");
    const all = el("button", `meta-filter${this.championFilter === "ALL" ? " active" : ""}`, "ALL");
    all.addEventListener("click", () => {
      this.championFilter = "ALL";
      this.render();
    });
    filters.appendChild(all);
    for (const region of regions) {
      const button = el(
        "button",
        `meta-filter${this.championFilter === region ? " active" : ""}`,
        region,
      );
      const style = regionStyle(region);
      button.style.setProperty("--region-color", style.color);
      button.addEventListener("click", () => {
        this.championFilter = region;
        this.render();
      });
      filters.appendChild(button);
    }
    wrap.appendChild(filters);

    const visible =
      this.championFilter === "ALL"
        ? this.characters
        : this.characters.filter((c) => (c.region ?? "Runeterra") === this.championFilter);
    const grid = el("div", "meta-champion-grid");
    for (const champion of visible) grid.appendChild(this.championCard(champion));
    wrap.appendChild(grid);
    return wrap;
  }

  private championCard(champion: CharacterDef): HTMLElement {
    const unlocked = isUnlocked(this.save, champion.id);
    const selected = this.save.selectedCharacter === champion.id;
    const style = regionStyle(champion.region ?? "Runeterra");
    const color = hex(championColor(champion.id));
    const card = el(
      "div",
      `meta-champion-card${unlocked ? " unlocked" : " locked"}${selected ? " selected" : ""}`,
    );
    card.style.setProperty("--champ-color", color);
    card.style.setProperty("--region-color", style.color);
    if (unlocked) {
      card.addEventListener("click", () => {
        this.save.selectedCharacter = champion.id;
        this.persist();
      });
    }

    const top = el("div", "meta-champion-top");
    const portrait = el("div", "meta-champion-portrait", champion.name?.charAt(0) ?? "?");
    const info = el("div", "meta-champion-info");
    info.append(
      el("div", "meta-champion-name", champion.name ?? champion.id),
      el("div", "meta-champion-region", champion.region ?? "Runeterra"),
    );
    const rarity = el(
      "div",
      `meta-rarity rarity-${champion.rarity ?? "rare"}`,
      RARITY_LABELS[champion.rarity ?? "rare"],
    );
    top.append(portrait, info, rarity);
    card.appendChild(top);

    const desc = el("p", "meta-champion-desc", champion.description ?? "");
    card.appendChild(desc);

    const weapon = this.weapons.find((w) => w.id === champion.startingWeapon);
    const move = this.weapons.find((w) => w.id === champion.startingMove);
    const kit = el("div", "meta-champion-kit");
    kit.append(
      this.chip(`W: ${weaponName(weapon, champion.startingWeapon)}`, "kit"),
      this.chip(`M: ${weaponName(move, champion.startingMove ?? "")}`, "kit move"),
    );
    card.appendChild(kit);

    if (unlocked) {
      const footer = el("div", "meta-champion-footer");
      footer.appendChild(el("span", "meta-owned", selected ? "SELECTED FOR NEXT RUN" : "UNLOCKED"));
      const button = el("button", "meta-btn small", selected ? "SELECTED" : "SELECT");
      button.disabled = selected;
      button.addEventListener("click", (e) => {
        e.stopPropagation();
        this.save.selectedCharacter = champion.id;
        this.persist();
      });
      footer.appendChild(button);
      card.appendChild(footer);
    } else {
      const required = shardsRequired(champion);
      const shards = shardsFor(this.save, champion.id);
      const progress = el("div", "meta-shard-progress");
      const bar = el("div", "meta-shard-bar");
      const fill = el("div", "meta-shard-fill");
      fill.style.width = `${Math.min(100, (shards / required) * 100)}%`;
      bar.appendChild(fill);
      progress.append(
        el(
          "div",
          "meta-shard-label",
          `${shards} / ${required} SHARDS · ${champion.region ?? "Runeterra"} CHESTS`,
        ),
        bar,
      );
      card.appendChild(progress);

      const footer = el("div", "meta-champion-footer");
      footer.appendChild(el("span", "meta-locked-note", "GACHA ONLY"));
      if (canUnlockWithShards(this.save, champion)) {
        const unlock = el("button", "meta-btn small unlock", "UNLOCK");
        unlock.addEventListener("click", (e) => {
          e.stopPropagation();
          if (unlockWithShards(this.save, champion)) {
            this.save.selectedCharacter = champion.id;
            this.persist();
          }
        });
        footer.appendChild(unlock);
      }
      card.appendChild(footer);
    }
    return card;
  }

  // -------------------------------------------------------------------------
  // UPGRADES (selected champion)
  // -------------------------------------------------------------------------
  private renderUpgrades(): HTMLElement {
    const wrap = el("div", "meta-page");
    wrap.appendChild(
      this.sectionHead(
        "PER-CHAMPION PROGRESSION",
        "UPGRADES",
        "Gold invested here belongs to one champion. Mages lean on haste; tanks lean on health (future champions use the same framework).",
      ),
    );
    const champion = this.selected();
    if (!champion) {
      wrap.appendChild(el("div", "meta-empty", "No champion selected."));
      return wrap;
    }
    const style = regionStyle(champion.region ?? "Runeterra");
    const header = el("div", "meta-upgrade-head");
    header.style.setProperty("--champ-color", hex(championColor(champion.id)));
    header.style.setProperty("--region-color", style.color);
    const portrait = el("div", "meta-upgrade-portrait", champion.name?.charAt(0) ?? "?");
    const copy = el("div", "meta-upgrade-copy");
    copy.append(
      el(
        "div",
        "meta-kicker",
        `${champion.region ?? "Runeterra"} · ${champion.class ?? "mage"} tree`,
      ),
      el("h2", "meta-upgrade-name", champion.name ?? champion.id),
      el("div", "meta-subtitle", champion.description ?? ""),
    );
    const wallet = el("div", "meta-upgrade-wallet");
    wallet.append(
      el("div", "meta-wallet-label", "GOLD"),
      el("div", "meta-wallet-value", `${this.save.gold}`),
    );
    header.append(portrait, copy, wallet);
    wrap.appendChild(header);

    const upgrades = upgradesForChampion(this.powerUps, champion);
    const list = el("div", "meta-upgrade-list");
    for (const p of upgrades) {
      const rank = rankOf(this.save, p, champion.id);
      const cost = nextCost(this.save, p, champion.id);
      const max = rank >= p.maxRank;
      const row = el("div", `meta-upgrade-row${max ? " maxed" : ""}`);
      const icon = el("div", "meta-upgrade-icon", p.name?.charAt(0) ?? "?");
      const main = el("div", "meta-upgrade-main");
      const title = el("div", "meta-upgrade-row-title");
      title.append(
        el("span", "", p.name ?? p.id),
        el(
          "span",
          "meta-upgrade-effect",
          `${percentStat(p.stat, p.perRank)} ${statLabel(p.stat)} / RANK`,
        ),
      );
      const desc = el("div", "meta-upgrade-desc", p.description ?? "");
      const pips = el("div", "meta-rank-pips");
      for (let i = 0; i < p.maxRank; i++)
        pips.appendChild(el("span", `meta-pip${i < rank ? " on" : ""}`));
      main.append(title, desc, pips);
      const actions = el("div", "meta-upgrade-actions");
      const costEl = el("div", "meta-upgrade-cost", max ? "MAXED" : `${cost} G`);
      const buy = el("button", "meta-btn small", max ? "MAX" : "BUY");
      buy.disabled = max || cost === null || this.save.gold < cost;
      buy.addEventListener("click", () => {
        if (buyPowerUp(this.save, p, champion.id)) this.persist();
      });
      const refund = el("button", "meta-btn small ghost", "REFUND");
      refund.disabled = rank <= 0;
      refund.addEventListener("click", () => {
        if (refundPowerUp(this.save, p, champion.id)) this.persist();
      });
      actions.append(costEl, buy, refund);
      row.append(icon, main, actions);
      list.appendChild(row);
    }
    wrap.appendChild(list);
    return wrap;
  }

  // -------------------------------------------------------------------------
  // CHESTS / GACHA
  // -------------------------------------------------------------------------
  private renderChests(): HTMLElement {
    const wrap = el("div", "meta-page");
    wrap.appendChild(
      this.sectionHead(
        "REGION GACHA",
        "CHESTS",
        "Open 1 chest for one pull, or 10 for ten pulls with a guaranteed Epic+ champion. Duplicates become shards; spend shards to choose who unlocks first.",
      ),
    );

    const odds = el("div", "meta-odds");
    odds.append(
      el("span", "meta-odds-title", "ODDS PER PULL"),
      el("span", "", `${Math.round(GACHA_ODDS.champion * 100)}% FULL CHAMPION`),
      el("span", "", `${Math.round(GACHA_ODDS.shards * 100)}% CHAMPION SHARDS`),
      el("span", "", `${Math.round(GACHA_ODDS.gold * 100)}% GOLD`),
      el("span", "meta-odds-rarity", "RARITY WEIGHTS: 60 COMMON / 30 RARE / 9 EPIC / 1 LEGENDARY"),
      el("span", "meta-odds-guarantee", "10-PULL: EPIC+ GUARANTEED"),
    );
    wrap.appendChild(odds);

    if (this.gachaResults) {
      wrap.appendChild(this.renderGachaResults());
    }

    const grid = el("div", "meta-region-grid");
    for (const region of regionsOf(this.characters)) {
      const style = regionStyle(region);
      const pool = championsInRegion(this.characters, region);
      const card = el("div", "meta-region-card");
      card.style.setProperty("--region-color", style.color);
      card.style.setProperty("--region-accent", style.accent);
      const head = el("div", "meta-region-head");
      head.append(
        el("div", "meta-region-name", region),
        el("div", "meta-region-blurb", style.blurb),
      );
      card.appendChild(head);

      const champions = el("div", "meta-region-champions");
      for (const champion of pool) {
        const unlocked = isUnlocked(this.save, champion.id);
        const shards = shardsFor(this.save, champion.id);
        const needed = shardsRequired(champion);
        const item = el("div", `meta-region-champion${unlocked ? " owned" : ""}`);
        const dot = el("span", "meta-region-dot", champion.name?.charAt(0) ?? "?");
        dot.style.color = hex(championColor(champion.id));
        const copy = el("span", "meta-region-champion-copy");
        copy.append(
          el("span", "", champion.name ?? champion.id),
          el(
            "span",
            "meta-region-champion-sub",
            unlocked
              ? "UNLOCKED"
              : `${RARITY_LABELS[champion.rarity ?? "rare"]} · ${shards}/${needed} SHARDS`,
          ),
        );
        item.append(dot, copy);
        champions.appendChild(item);
      }
      card.appendChild(champions);

      const actions = el("div", "meta-region-actions");
      const one = el("button", "meta-btn", "OPEN 1 · 1 CHEST");
      one.disabled = this.save.chests < 1;
      one.addEventListener("click", () => this.openChests(region, 1));
      const ten = el("button", "meta-play small", "OPEN 10 · 10 CHESTS");
      ten.disabled = this.save.chests < 10;
      ten.addEventListener("click", () => this.openChests(region, 10));
      actions.append(one, ten);
      card.appendChild(actions);
      const guarantee = el("div", "meta-region-note");
      guarantee.textContent = "10-PULL GUARANTEES AN EPIC+ CHAMPION FROM THIS REGION";
      if (!this.save.chests || this.save.chests < 10) {
        guarantee.textContent = "EARN CHESTS IN RUNS · 10-PULL GUARANTEES EPIC+";
      }
      card.appendChild(guarantee);
      grid.appendChild(card);
    }
    wrap.appendChild(grid);

    const hint = el("div", "meta-note");
    hint.textContent =
      "Shards are champion-specific. When a champion reaches their requirement, the Champions page shows UNLOCK — you choose the order.";
    wrap.appendChild(hint);
    return wrap;
  }

  private openChests(region: string, count: 1 | 10): void {
    const drops = openRegionChests(this.save, region, this.characters, count);
    if (!drops) return;
    this.gachaResults = { region, drops };
    this.scrollTop = 0;
    this.persist();
  }

  private renderGachaResults(): HTMLElement {
    const results = this.gachaResults;
    if (!results) return el("div");
    const panel = el("div", "meta-gacha-results");
    const head = el("div", "meta-gacha-head");
    head.append(
      el("div", "", `PULL RESULTS · ${results.region.toUpperCase()}`),
      el("button", "meta-btn small ghost", "CLEAR"),
    );
    (head.lastElementChild as HTMLElement).addEventListener("click", () => {
      this.gachaResults = null;
      this.render();
    });
    panel.appendChild(head);
    const cards = el("div", "meta-gacha-grid");
    for (const drop of results.drops) {
      const champion = drop.championId
        ? this.characters.find((c) => c.id === drop.championId)
        : undefined;
      const card = el(
        "div",
        `meta-gacha-card drop-${drop.kind}${drop.guaranteed ? " guaranteed" : ""}`,
      );
      const title =
        drop.kind === "gold"
          ? "GOLD"
          : drop.kind === "champion"
            ? (champion?.name ?? drop.championId ?? "CHAMPION")
            : `${champion?.name ?? drop.championId ?? "CHAMPION"} SHARDS`;
      card.appendChild(
        el(
          "div",
          "meta-gacha-kind",
          drop.guaranteed ? "GUARANTEED EPIC+" : drop.kind.toUpperCase(),
        ),
      );
      card.appendChild(el("div", "meta-gacha-champion", title));
      const amount =
        drop.kind === "gold"
          ? `+${drop.amount} GOLD`
          : drop.kind === "champion"
            ? "CHAMPION UNLOCKED"
            : `+${drop.amount} SHARDS`;
      card.appendChild(el("div", "meta-gacha-amount", amount));
      if (drop.kind === "shards" && champion) {
        const total = shardsFor(this.save, champion.id);
        card.appendChild(
          el("div", "meta-gacha-sub", `${total} / ${shardsRequired(champion)} TOTAL SHARDS`),
        );
      }
      cards.appendChild(card);
    }
    panel.appendChild(cards);
    return panel;
  }

  // -------------------------------------------------------------------------
  // ACHIEVEMENTS
  // -------------------------------------------------------------------------
  private renderAchievements(): HTMLElement {
    const wrap = el("div", "meta-page");
    wrap.appendChild(
      this.sectionHead("MILESTONES", "ACHIEVEMENTS", "Small proof that the Rift remembers you."),
    );
    const list = el("div", "meta-achievement-list");
    for (const achievement of ACHIEVEMENTS) {
      const done = this.save.achievements.includes(achievement.id);
      const row = el("div", `meta-achievement${done ? " done" : ""}`);
      row.append(
        el("div", "meta-achievement-mark", done ? "★" : "☆"),
        el("div", "meta-achievement-label", achievement.label),
        el("div", "meta-achievement-state", done ? "COMPLETE" : "LOCKED"),
      );
      list.appendChild(row);
    }
    wrap.appendChild(list);
    return wrap;
  }

  // -------------------------------------------------------------------------
  // SETTINGS
  // -------------------------------------------------------------------------
  private renderSettings(): HTMLElement {
    const wrap = el("div", "meta-page");
    wrap.appendChild(
      this.sectionHead("OPTIONS", "SETTINGS", "Audio, feel, controls, and the local save."),
    );

    const card = el("div", "meta-settings-card");
    const audio = el("div", "meta-settings-group");
    audio.appendChild(el("div", "meta-settings-label", "AUDIO & FEEL"));
    const toggles = el("div", "meta-settings-row");
    toggles.appendChild(
      this.toggle("SOUND", this.save.settings.volume > 0, () => {
        this.save.settings.volume = this.save.settings.volume > 0 ? 0 : 0.22;
        this.afterSettings();
      }),
    );
    toggles.appendChild(
      this.toggle("SCREEN SHAKE", this.save.settings.shake, () => {
        this.save.settings.shake = !this.save.settings.shake;
        this.afterSettings();
      }),
    );
    toggles.appendChild(
      this.toggle("DAMAGE NUMBERS", this.save.settings.damageNumbers, () => {
        this.save.settings.damageNumbers = !this.save.settings.damageNumbers;
        this.afterSettings();
      }),
    );
    audio.appendChild(toggles);
    card.appendChild(audio);

    const controls = el("div", "meta-settings-group");
    controls.appendChild(el("div", "meta-settings-label", "CONTROLS"));
    const binds = el("div", "meta-settings-row");
    const entries: Array<[keyof Keybinds, string]> = [
      ["up", "UP"],
      ["down", "DOWN"],
      ["left", "LEFT"],
      ["right", "RIGHT"],
    ];
    for (const [kind, label] of entries) {
      const button = el("button", "meta-btn");
      button.textContent =
        this.listening === kind
          ? "PRESS A KEY..."
          : `${label}: ${this.save.settings.keybinds[kind].toUpperCase()}`;
      button.addEventListener("click", () => this.startRebind(kind));
      binds.appendChild(button);
    }
    controls.appendChild(binds);
    controls.appendChild(
      el("div", "meta-hint", "ARROW KEYS ALWAYS MOVE · ESC CANCELS REBINDING · TAB SHOWS STATS"),
    );
    card.appendChild(controls);

    const saveGroup = el("div", "meta-settings-group");
    saveGroup.appendChild(el("div", "meta-settings-label", "LOCAL SAVE"));
    const saveRow = el("div", "meta-settings-row");
    const reset = el("button", "meta-btn danger", "RESET SAVE");
    reset.addEventListener("click", () => this.resetSave());
    saveRow.appendChild(reset);
    saveRow.appendChild(el("div", "meta-hint", "Champions, shards, gold, upgrades, and settings."));
    saveGroup.appendChild(saveRow);
    card.appendChild(saveGroup);

    wrap.appendChild(card);
    wrap.appendChild(
      el(
        "div",
        "meta-note",
        "Press H anywhere to open the local admin panel (gold, chests, shards, unlock-all, max upgrades, reset).",
      ),
    );
    return wrap;
  }

  private toggle(label: string, on: boolean, onClick: () => void): HTMLElement {
    const button = el("button", `meta-toggle${on ? " on" : ""}`);
    button.append(el("span", "meta-toggle-dot"), el("span", "", `${label}: ${on ? "ON" : "OFF"}`));
    button.addEventListener("click", onClick);
    return button;
  }

  private afterSettings(): void {
    persistSave(this.save);
    this.settingsCb?.(this.save.settings);
    this.render();
  }

  private resetSave(): void {
    if (
      !window.confirm(
        "Reset local save? This erases champions, shards, gold, upgrades, settings, and achievements.",
      )
    ) {
      return;
    }
    resetSave(this.characters[0]?.id ?? "lux");
    window.location.reload();
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
      for (const other of Object.keys(binds) as (keyof Keybinds)[]) {
        if (other !== kind && binds[other] === key) binds[other] = binds[kind];
      }
      binds[kind] = key;
      this.cancelRebind();
      this.afterSettings();
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

  private chip(label: string, kind: string): HTMLElement {
    return el("span", `meta-chip ${kind}`, label);
  }

  private kitItem(label: string, title: string, description: string): HTMLElement {
    const item = el("div", "meta-kit-item");
    item.append(
      el("div", "meta-kit-label", label),
      el("div", "meta-kit-title", title),
      el("div", "meta-kit-desc", description),
    );
    return item;
  }

  private statCard(label: string, value: string): HTMLElement {
    const card = el("div", "meta-stat-card");
    card.append(el("div", "meta-stat-label", label), el("div", "meta-stat-value", value));
    return card;
  }

  private formatTime(secs: number): string {
    const mm = Math.floor(secs / 60);
    const ss = secs % 60;
    return `${mm}:${ss.toString().padStart(2, "0")}`;
  }
}
