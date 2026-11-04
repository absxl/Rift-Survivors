// League-client-inspired meta hub: PLAY / CHAMPIONS / UPGRADES / CHESTS /
// ACHIEVEMENTS / SETTINGS. Champions are gacha-only; the Upgrades section
// upgrades the currently selected champion's own tree.
import { CLASSES } from "@rift/content";
import { CHAMPION_SKINS } from "@rift/content";
import type { AbilityDef, CharacterDef, PowerUpDef, StageDef } from "@rift/sim";
import { abilityName, statLabel } from "./ability-info";
import type { AccountClient } from "./account";
import { championCardURL, championIconURL } from "./assets/champion-sprites";
import { championColor } from "./champion-colors";
import { ChestOpeningUI } from "./chest-opening";
import { crestMark } from "./crest-identity";
import {
  ACHIEVEMENTS,
  GACHA_ODDS,
  RARITY_LABELS,
  SKIN_COST,
  achievementCurrent,
  buyPowerUp,
  buySkin,
  canUnlockWithShards,
  championsInRegion,
  checkAchievements,
  darkinChampions,
  equipSkin,
  isUnlocked,
  nextCost,
  openRegionChests,
  powerUpRankStats,
  rankOf,
  rarityRank,
  refundPowerUp,
  regionProgressFor,
  regionsOf,
  shardsFor,
  shardsRequired,
  unlockWithShards,
  upgradesForChampion,
} from "./meta/meta";
import { validateNickname } from "./profile";
import {
  DARKIN_CHEST,
  championRegions,
  isDarkinChampion,
  regionStyle,
  regionTheme,
} from "./regions";
import type { Keybinds, SaveData } from "./save/save";
import { migrateSave, persistSave, resetSave } from "./save/save";

type Section =
  | "profile"
  | "play"
  | "champions"
  | "upgrades"
  | "chests"
  | "achievements"
  | "settings";

type ChampionSort = "name" | "rarity" | "class" | "region" | "unlock";
type ChestSort = "featured" | "name" | "pool" | "locked" | "completion";
type AchievementSort = "default" | "incomplete" | "complete" | "progress" | "reward" | "name";

const SECTIONS: Array<{ id: Section; label: string; glyph: string; hint: string }> = [
  { id: "profile", label: "PROFILE", glyph: "◉", hint: "Name & lifetime stats" },
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
  if (key === "armor" || key === "pierce") {
    const value = Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
    return `${sign}${value}`;
  }
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
  private classFilter = "ALL";
  private rarityFilter = "ALL";
  private championQuery = "";
  private championSort: ChampionSort = "name";
  private ownedOnly = false;
  private championPage = 0;
  private readonly pageSize = 24;
  private chestQuery = "";
  private chestFilter = "ALL";
  private chestSort: ChestSort = "featured";
  private achievementQuery = "";
  private achievementSort: AchievementSort = "default";
  private listening: keyof Keybinds | "shop" | null = null;
  private captureHandler: ((e: KeyboardEvent) => void) | null = null;
  private readonly chestOpening: ChestOpeningUI;
  private scrollTop = 0;
  private dossierChampionId: string | null = null;
  private regionDossier: string | null = null;
  private achievementCategory = "ALL";
  private achievementRegion = "ALL";
  private pendingToasts: string[] = [];
  private toastTimer: number | null = null;

  /** Animate a numeric label from its previous value to `value` (D-056). */
  private countUp(node: HTMLElement, value: number, suffix: string): void {
    const from = node.dataset.value !== undefined ? Number(node.dataset.value) : value;
    node.dataset.value = String(value);
    if (from === value || from < 0) {
      node.textContent = `${Math.round(value)} ${suffix}`;
      return;
    }
    const start = performance.now();
    const duration = 500;
    const step = (): void => {
      const t = Math.min(1, (performance.now() - start) / duration);
      const eased = 1 - (1 - t) * (1 - t);
      node.textContent = `${Math.round(from + (value - from) * eased)} ${suffix}`;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  constructor(
    private readonly save: SaveData,
    private readonly powerUps: PowerUpDef[],
    private readonly characters: CharacterDef[],
    private readonly abilities: AbilityDef[],
    private readonly stages: StageDef[],
    private readonly account: AccountClient,
  ) {
    this.root = document.createElement("div");
    this.root.className = "meta";
    document.body.appendChild(this.root);
    this.chestOpening = new ChestOpeningUI();
    this.ensureSelected();
    this.ensureStage();
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
    this.ensureStage();
    this.render();
    this.root.style.display = "block";
  }

  hide(): void {
    this.cancelRebind();
    this.dossierChampionId = null;
    this.regionDossier = null;
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

  private ensureStage(): void {
    if (this.stages.length === 0) {
      this.save.selectedStage = "rift-field";
      return;
    }
    if (!this.stages.some((stage) => stage.id === this.save.selectedStage)) {
      this.save.selectedStage = this.stages[0].id;
    }
  }

  private selectedStage(): StageDef | undefined {
    return this.stages.find((stage) => stage.id === this.save.selectedStage) ?? this.stages[0];
  }

  private selected(): CharacterDef | undefined {
    return (
      this.characters.find((c) => c.id === this.save.selectedCharacter) ??
      this.characters.find((c) => isUnlocked(this.save, c.id)) ??
      this.characters[0]
    );
  }

  private persist(): void {
    const newlyUnlocked = checkAchievements(this.save, null, this.characters);
    if (newlyUnlocked.length > 0) this.pendingToasts.push(...newlyUnlocked);
    persistSave(this.save);
    this.render();
    if (newlyUnlocked.length > 0) this.scheduleToasts();
  }

  private setSection(section: Section): void {
    this.cancelRebind();
    this.dossierChampionId = null;
    this.regionDossier = null;
    this.section = section;
    this.scrollTop = 0;
    this.render();
    // Page transition: the freshly mounted content slides up with a stagger.
    const page = this.root.querySelector(".meta-page, .meta-settings-card")?.parentElement;
    page?.classList.add("meta-page-enter");
  }

  private openDossier(championId: string): void {
    this.dossierChampionId = championId;
    this.regionDossier = null;
    this.render();
  }

  private closeDossier(): void {
    this.dossierChampionId = null;
    this.render();
  }

  private openRegionDossier(region: string): void {
    this.dossierChampionId = null;
    this.regionDossier = region;
    this.render();
  }

  private closeRegionDossier(): void {
    this.regionDossier = null;
    this.render();
  }

  private scheduleToasts(): void {
    if (this.pendingToasts.length === 0) return;
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastTimer = null;
      this.showToasts();
    }, 850);
  }

  private showToasts(): void {
    const labels = this.pendingToasts.splice(0);
    if (labels.length === 0) return;
    for (const node of document.querySelectorAll(".meta-achievement-toast")) node.remove();
    const toast = el("div", "meta-achievement-toast");
    toast.appendChild(el("div", "meta-achievement-toast-kicker", "ACHIEVEMENT UNLOCKED"));
    for (const label of labels) {
      toast.appendChild(el("div", "meta-achievement-toast-label", label));
    }
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 4600);
  }

  private applyRegionTheme(node: HTMLElement, regions: string[]): void {
    const theme = regionTheme(regions);
    const primary = theme.colors[0] ?? "#c8aa6e";
    const secondary = theme.colors[1] ?? primary;
    const tertiary = theme.colors[2] ?? secondary;
    node.style.setProperty("--region-primary", primary);
    node.style.setProperty("--region-secondary", secondary);
    node.style.setProperty("--region-tertiary", tertiary);
    node.style.setProperty("--region-accent", theme.acc);
    node.dataset.regions = String(regions.length);
    node.dataset.motif = theme.motifs[0] ?? "runes";
  }

  private crestStack(
    regions: string[],
    className = "",
    size: "xs" | "sm" | "md" = "sm",
  ): HTMLElement {
    return crestMark(regions, size, className);
  }

  private regionChips(regions: string[], className = ""): HTMLElement {
    const row = el("div", `meta-region-chip-row ${className}`.trim());
    for (const region of regions) {
      const style = regionStyle(region);
      const chip = el("span", "meta-region-chip", region);
      chip.style.setProperty("--region-color", style.color);
      chip.style.setProperty("--region-accent", style.accent);
      if (region === regions[0]) chip.classList.add("primary");
      row.appendChild(chip);
    }
    return row;
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
    if (this.dossierChampionId) {
      const dossier = this.renderDossier(this.dossierChampionId);
      if (dossier) this.root.appendChild(dossier);
      else this.dossierChampionId = null;
    } else if (this.regionDossier) {
      const dossier = this.renderRegionDossier(this.regionDossier);
      if (dossier) this.root.appendChild(dossier);
      else this.regionDossier = null;
    }
  }

  private renderTopbar(): HTMLElement {
    const bar = el("div", "meta-topbar");
    const brand = el("div", "meta-brand");
    const mark = el("div", "meta-brand-mark");
    const logo = el("img", "meta-brand-logo");
    logo.src = "/brand/rift-survivors-mark.png";
    logo.alt = "";
    logo.decoding = "async";
    logo.setAttribute("aria-hidden", "true");
    mark.appendChild(logo);
    const copy = el("div", "meta-brand-copy");
    copy.append(
      el("div", "meta-brand-title", "RIFT SURVIVORS"),
      el("div", "meta-brand-sub", "THE MAGE'S GAUNTLET"),
    );
    brand.append(mark, copy);

    const selected = this.selected();
    const currency = el("div", "meta-currency");
    const gold = el("div", "meta-currency-pill");
    const goldValue = el("span", "meta-currency-value");
    this.countUp(goldValue, this.save.gold, "GOLD");
    gold.append(el("span", "meta-currency-icon", "⬡"), goldValue);
    const keys = el("div", "meta-currency-pill accent");
    const keysValue = el("span", "meta-currency-value");
    this.countUp(keysValue, this.save.keys, "KEYS");
    keys.append(el("span", "meta-currency-icon", "◆"), keysValue);
    currency.append(gold, keys);
    if (selected) {
      const hero = el("div", "meta-topbar-champion");
      const dot = el("span", "meta-topbar-dot", selected.name?.charAt(0) ?? "?");
      dot.style.color = hex(championColor(selected.id));
      dot.style.borderColor = hex(championColor(selected.id));
      hero.append(dot, el("span", "", selected.name ?? selected.id));
      currency.appendChild(hero);
    }
    const profile = el("div", "meta-topbar-profile");
    profile.append(
      el(
        "span",
        "meta-topbar-profile-mark",
        (this.save.profileName || "S").charAt(0).toUpperCase(),
      ),
      el("span", "", this.save.profileName || "Summoner"),
    );
    profile.addEventListener("click", () => this.setSection("profile"));
    const admin = el("div", "meta-admin-hint", "H · ADMIN");
    bar.append(brand, currency, profile, admin);
    return bar;
  }

  private renderSidebar(): HTMLElement {
    const side = el("aside", "meta-sidebar");
    const selected = this.selected();
    if (selected) {
      const card = el("div", "meta-sidebar-champion");
      const regions = championRegions(selected);
      this.applyRegionTheme(card, regions);
      card.style.setProperty("--champ-color", hex(championColor(selected.id)));
      const portrait = el("div", "meta-sidebar-portrait", selected.name?.charAt(0) ?? "?");
      const info = el("div", "meta-sidebar-info");
      info.append(
        el("div", "meta-sidebar-name", selected.name ?? selected.id),
        el("div", "meta-sidebar-title", selected.profile?.title ?? ""),
        el(
          "div",
          "meta-sidebar-region",
          `${regions.join(" · ")} · ${this.classLabel(selected.class)}`,
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
      case "profile":
        content.appendChild(this.renderProfile());
        break;
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

  private sectionHead(kicker: string, title: string, sub: string, minor = false): HTMLElement {
    const head = el("div", minor ? "meta-page-head minor" : "meta-page-head");
    head.append(
      el("div", "meta-kicker", kicker),
      el(minor ? "h2" : "h1", minor ? "meta-title meta-title-minor" : "meta-title", title),
      el("div", "meta-subtitle", sub),
    );
    return head;
  }

  // -------------------------------------------------------------------------
  // PROFILE
  // -------------------------------------------------------------------------
  private renderProfile(): HTMLElement {
    const wrap = el("div", "meta-page");
    wrap.appendChild(
      this.sectionHead(
        "SUMMONER PROFILE",
        this.save.profileName || "Summoner",
        "Your Showdown-style name, lifetime stats, and best run. Cloud save is active when signed in; Discord login is enabled once the server has Discord credentials.",
      ),
    );

    const selected = this.selected();
    const color = selected ? hex(championColor(selected.id)) : "#d7b56d";
    const hero = el("div", "meta-profile-hero");
    hero.style.setProperty("--champ-color", color);
    const avatar = el(
      "div",
      "meta-profile-avatar",
      (this.save.profileName || "S").charAt(0).toUpperCase(),
    );
    const copy = el("div", "meta-profile-copy");
    copy.append(
      el("div", "meta-kicker", "INGAME NAME"),
      el("div", "meta-profile-name", this.save.profileName || "Summoner"),
      el(
        "div",
        "meta-profile-note",
        "3-20 characters · letters, numbers, underscore, hyphen · Showdown-style",
      ),
    );
    const form = el("div", "meta-profile-form");
    const input = el("input", "meta-search");
    input.value = this.save.profileName || "Summoner";
    input.maxLength = 20;
    input.setAttribute("aria-label", "In-game nickname");
    const saveName = el("button", "meta-play small", "SAVE NAME");
    const message = el("div", "meta-profile-message");
    const commit = async (): Promise<void> => {
      const result = validateNickname(input.value);
      if (!result.ok) {
        message.textContent = result.error ?? "Invalid name.";
        message.className = "meta-profile-message error";
        return;
      }
      if (this.account.account) {
        const error = await this.account.setNickname(result.value);
        if (error) {
          message.textContent = error;
          message.className = "meta-profile-message error";
          return;
        }
      }
      this.save.profileName = result.value;
      persistSave(this.save);
      this.render();
    };
    saveName.addEventListener("click", () => void commit());
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") void commit();
    });
    form.append(input, saveName, message);
    copy.appendChild(form);
    hero.append(avatar, copy);
    wrap.appendChild(hero);

    const accountCard = el("div", "meta-profile-account");
    const accountTitle = el("div", "meta-kicker", "ACCOUNT");
    accountCard.appendChild(accountTitle);
    if (this.account.account) {
      const linked = this.account.account.discordLinked ? "DISCORD LINKED" : "DEV CLOUD ACCOUNT";
      accountCard.append(
        el("div", "meta-profile-account-title", linked),
        el(
          "div",
          "meta-profile-account-note",
          `Signed in as ${this.account.account.nickname}. Progress syncs to the server.`,
        ),
      );
      const logout = el("button", "meta-btn danger", "LOG OUT");
      logout.addEventListener("click", () => void this.account.logout());
      accountCard.appendChild(logout);
    } else {
      accountCard.append(
        el("div", "meta-profile-account-title", "LOCAL SAVE"),
        el(
          "div",
          "meta-profile-account-note",
          "Log in with Discord to sync this profile to the server and use it for friends and co-op identity. Without a server account, progress stays in this browser.",
        ),
      );
      const actions = el("div", "meta-profile-account-actions");
      const discord = el(
        "button",
        "meta-btn",
        this.account.discordEnabled ? "LOGIN WITH DISCORD" : "DISCORD LOGIN NOT CONFIGURED",
      );
      discord.disabled = !this.account.discordEnabled;
      discord.addEventListener("click", () => this.account.loginWithDiscord());
      actions.appendChild(discord);
      if (this.account.devAuth) {
        const dev = el("button", "meta-btn ghost", "DEV CLOUD LOGIN");
        const devMessage = el("span", "meta-profile-message");
        dev.addEventListener("click", () => {
          void (async () => {
            const error = await this.account.devLogin(this.save.profileName);
            if (error) {
              devMessage.textContent = error;
              devMessage.className = "meta-profile-message error";
            }
          })();
        });
        actions.append(dev, devMessage);
      }
      accountCard.appendChild(actions);
    }
    wrap.appendChild(accountCard);

    const stats = el("div", "meta-profile-stats");
    const unlocked = this.characters.filter((champion) =>
      isUnlocked(this.save, champion.id),
    ).length;
    const best = this.save.bestRun;
    const bestChampion = this.characters.find((champion) => champion.id === best.characterId);
    const bestStage = this.stages.find((stage) => stage.id === best.stageId);
    stats.append(
      this.statCard(
        "BEST SURVIVAL",
        this.save.bestTimeSec > 0 ? this.formatTime(this.save.bestTimeSec) : "—",
      ),
      this.statCard("TOTAL KILLS", String(this.save.totalKills)),
      this.statCard("RUNS PLAYED", String(this.save.runsPlayed)),
      this.statCard("CHAMPIONS", `${unlocked} / ${this.characters.length}`),
      this.statCard("BEST RUN KILLS", best.timeSec > 0 ? String(best.kills) : "—"),
      this.statCard("BEST RUN GOLD", best.timeSec > 0 ? String(best.gold) : "—"),
      this.statCard("KEYS", String(this.save.keys)),
      this.statCard("ACHIEVEMENTS", `${this.save.achievements.length} / ${ACHIEVEMENTS.length}`),
    );
    wrap.appendChild(stats);

    const bestCard = el("div", "meta-profile-best");
    bestCard.append(
      el("div", "meta-kicker", "BEST RUN"),
      best.timeSec > 0
        ? el(
            "div",
            "meta-profile-best-main",
            `${this.formatTime(best.timeSec)} · ${best.kills} KILLS · ${best.gold} GOLD`,
          )
        : el("div", "meta-profile-best-main", "No completed run yet."),
      el(
        "div",
        "meta-profile-best-sub",
        best.timeSec > 0
          ? `${bestChampion?.name ?? (best.characterId || "Unknown champion")} · ${bestStage?.name ?? (best.stageId || "Unknown stage")}`
          : "Play a run to establish your personal best.",
      ),
    );
    wrap.appendChild(bestCard);

    const current = el("div", "meta-profile-current");
    current.append(
      el("span", "meta-profile-current-item", `CHAMPION · ${selected?.name ?? "—"}`),
      el(
        "span",
        "meta-profile-current-item",
        `STAGE · ${this.selectedStage()?.name ?? "The Riftfield"}`,
      ),
      el("span", "meta-profile-current-item", `GOLD · ${this.save.gold}`),
    );
    wrap.appendChild(current);
    return wrap;
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
    const currentStage = this.selectedStage();
    const regions = championRegions(selected);
    const profile = selected.profile;
    const color = hex(championColor(selected.id));
    const hero = el("div", "meta-hero");
    hero.style.setProperty("--champ-color", color);
    this.applyRegionTheme(hero, regions);

    const art = el("div", "meta-hero-art");
    // Champion splash art fills the art panel (D-064); small crest top-left.
    const splash = championCardURL(selected.id);
    if (splash) {
      const splashLayer = el("div", "meta-hero-splash");
      splashLayer.style.backgroundImage = `url(${splash})`;
      art.appendChild(splashLayer);
      art.appendChild(el("div", "meta-hero-splash-shade"));
    } else {
      const stageWrap = el("div", "meta-hero-stage-wrap");
      const stage = el("div", "meta-hero-stage");
      const halo = el("div", "meta-hero-halo");
      halo.textContent = selected.name?.charAt(0).toUpperCase() ?? "?";
      stage.append(this.crestStack(regions, "meta-hero-crest", "sm"), halo);
      stageWrap.append(stage, el("div", "meta-hero-art-label", regions.join(" + ")));
      art.appendChild(stageWrap);
    }
    art.appendChild(this.crestStack(regions, "meta-hero-crest", "xs"));
    art.appendChild(el("div", "meta-hero-art-label", regions[0] ?? "Runeterra"));

    const copy = el("div", "meta-hero-copy");
    const chips = el("div", "meta-chip-row");
    for (const region of regions) {
      const regionStyleValue = regionStyle(region);
      const chip = this.chip(region, "region");
      chip.style.setProperty("--region-color", regionStyleValue.color);
      chips.appendChild(chip);
    }
    chips.append(
      this.chip(RARITY_LABELS[selected.rarity ?? "rare"], "rarity"),
      this.chip(this.classLabel(selected.class), "class"),
      this.chip(currentStage?.name ?? "The Riftfield", "stage"),
      ...(selected.tags?.includes("levitate") ? [this.chip("LEVITATE", "class")] : []),
      this.chip(isUnlocked(this.save, selected.id) ? "UNLOCKED" : "LOCKED", "state"),
    );
    if (profile?.title) copy.appendChild(el("div", "meta-hero-title", profile.title));
    copy.appendChild(el("h2", "meta-hero-name", selected.name ?? selected.id));
    copy.appendChild(chips);
    copy.appendChild(
      el("p", "meta-hero-desc", profile?.summary ?? selected.description ?? "A mage of the Rift."),
    );

    const ability = this.abilities.find((w) => w.id === selected.startingAbility);
    const ability2 = this.abilities.find((w) => w.id === selected.startingAbility2);
    const kit = el("div", "meta-kit");
    kit.appendChild(
      this.kitItem(
        "SIGNATURE ABILITY",
        abilityName(ability, selected.startingAbility),
        ability?.description ?? "",
      ),
    );
    if (ability2) {
      kit.appendChild(
        this.kitItem(
          "ULTIMATE",
          abilityName(ability2, selected.startingAbility2 ?? ""),
          ability2.description ?? "",
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

    if (this.stages.length > 0) {
      wrap.appendChild(
        this.sectionHead(
          "DEPLOYMENT",
          "STAGE SELECT",
          "The host chooses this stage for online co-op.",
        ),
      );
      const stageGrid = el("div", "meta-stage-grid");
      for (const stage of this.stages) {
        const style = regionStyle(stage.region);
        const active = stage.id === this.save.selectedStage;
        const card = el("button", `meta-stage-card${active ? " active" : ""}`);
        card.style.setProperty("--stage-color", hex(stage.palette.accent));
        card.style.setProperty("--region-color", style.color);
        const top = el("div", "meta-stage-top");
        top.append(
          this.crestStack([stage.region], "meta-stage-crest", "xs"),
          el("span", "meta-stage-region", stage.region.toUpperCase()),
          el("span", `meta-stage-status${active ? " on" : ""}`, active ? "SELECTED" : "AVAILABLE"),
        );
        card.append(
          top,
          el("span", "meta-stage-name", stage.name),
          el("span", "meta-stage-desc", stage.description),
        );
        card.addEventListener("click", () => {
          this.save.selectedStage = stage.id;
          this.persist();
        });
        stageGrid.appendChild(card);
      }
      wrap.appendChild(stageGrid);
    }

    const stats = el("div", "meta-stat-strip");
    const unlockedCount = this.characters.filter((c) => isUnlocked(this.save, c.id)).length;
    stats.append(
      this.statCard(
        "BEST SURVIVAL",
        this.save.bestTimeSec > 0 ? this.formatTime(this.save.bestTimeSec) : "—",
      ),
      this.statCard("TOTAL KILLS", String(this.save.totalKills)),
      this.statCard("CHAMPIONS", `${unlockedCount} / ${this.characters.length}`),
      this.statCard("KEYS", String(this.save.keys)),
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
    const regionFilters = el("div", "meta-filter-row");
    const allRegions = el(
      "button",
      `meta-filter${this.championFilter === "ALL" ? " active" : ""}`,
      "ALL REGIONS",
    );
    allRegions.addEventListener("click", () => {
      this.championFilter = "ALL";
      this.championPage = 0;
      this.render();
    });
    regionFilters.appendChild(allRegions);
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
        this.championPage = 0;
        this.render();
      });
      regionFilters.appendChild(button);
    }
    wrap.appendChild(regionFilters);

    const classFilters = el("div", "meta-filter-row");
    const allClasses = el(
      "button",
      `meta-filter${this.classFilter === "ALL" ? " active" : ""}`,
      "ALL CLASSES",
    );
    allClasses.addEventListener("click", () => {
      this.classFilter = "ALL";
      this.championPage = 0;
      this.render();
    });
    classFilters.appendChild(allClasses);
    for (const [className, def] of Object.entries(CLASSES)) {
      const button = el(
        "button",
        `meta-filter${this.classFilter === className ? " active" : ""}`,
        def.label,
      );
      button.addEventListener("click", () => {
        this.classFilter = className;
        this.championPage = 0;
        this.render();
      });
      classFilters.appendChild(button);
    }
    wrap.appendChild(classFilters);

    const rarityFilters = el("div", "meta-filter-row");
    const rarities = ["ALL", "common", "rare", "epic", "legendary"] as const;
    for (const rarity of rarities) {
      const button = el(
        "button",
        `meta-filter${this.rarityFilter === rarity ? " active" : ""}`,
        rarity === "ALL" ? "ALL RARITIES" : RARITY_LABELS[rarity],
      );
      button.addEventListener("click", () => {
        this.rarityFilter = rarity;
        this.championPage = 0;
        this.render();
      });
      rarityFilters.appendChild(button);
    }
    wrap.appendChild(rarityFilters);

    const searchRow = el("div", "meta-search-row");
    const search = el("input", "meta-search meta-champion-search");
    search.type = "search";
    search.placeholder = "Search champions...";
    search.value = this.championQuery;
    search.addEventListener("input", () => {
      this.championQuery = search.value;
      this.championPage = 0;
      this.render();
      this.focusSearch(".meta-champion-search");
    });
    searchRow.appendChild(search);
    const owned = el(
      "button",
      `meta-filter${this.ownedOnly ? " active" : ""}`,
      this.ownedOnly ? "OWNED ONLY" : "OWNED + LOCKED",
    );
    owned.addEventListener("click", () => {
      this.ownedOnly = !this.ownedOnly;
      this.championPage = 0;
      this.render();
    });
    searchRow.appendChild(owned);
    searchRow.appendChild(
      this.sortControl<ChampionSort>(
        this.championSort,
        [
          ["name", "NAME A-Z"],
          ["rarity", "RARITY"],
          ["class", "CLASS"],
          ["region", "REGION"],
          ["unlock", "UNLOCK PROGRESS"],
        ],
        (sort) => {
          this.championSort = sort;
          this.championPage = 0;
          this.render();
        },
        "Sort champions",
      ),
    );
    const count = el("div", "meta-result-count");
    searchRow.appendChild(count);
    wrap.appendChild(searchRow);

    const query = this.championQuery.trim().toLowerCase();
    let visible = this.characters.filter((champion) => {
      const regions = championRegions(champion);
      if (this.championFilter !== "ALL" && !regions.includes(this.championFilter)) {
        return false;
      }
      if (this.classFilter !== "ALL" && (champion.class ?? "mage") !== this.classFilter)
        return false;
      if (this.rarityFilter !== "ALL" && (champion.rarity ?? "rare") !== this.rarityFilter)
        return false;
      if (this.ownedOnly && !isUnlocked(this.save, champion.id)) return false;
      if (query) {
        const haystack =
          `${champion.name ?? ""} ${champion.id} ${regions.join(" ")} ${champion.class ?? ""} ${champion.profile?.title ?? ""}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
    visible = [...visible].sort((a, b) => {
      const byName = (a.name ?? a.id).localeCompare(b.name ?? b.id);
      switch (this.championSort) {
        case "rarity":
          return rarityRank(b.rarity) - rarityRank(a.rarity) || byName;
        case "class":
          return this.classLabel(a.class).localeCompare(this.classLabel(b.class)) || byName;
        case "region":
          return (championRegions(a)[0] ?? "").localeCompare(championRegions(b)[0] ?? "") || byName;
        case "unlock": {
          const aOwned = isUnlocked(this.save, a.id);
          const bOwned = isUnlocked(this.save, b.id);
          if (aOwned !== bOwned) return Number(bOwned) - Number(aOwned);
          if (aOwned) return byName;
          const aProgress = shardsFor(this.save, a.id) / shardsRequired(a);
          const bProgress = shardsFor(this.save, b.id) / shardsRequired(b);
          return bProgress - aProgress || byName;
        }
        default:
          return byName;
      }
    });
    const pages = Math.max(1, Math.ceil(visible.length / this.pageSize));
    this.championPage = Math.max(0, Math.min(this.championPage, pages - 1));
    const start = this.championPage * this.pageSize;
    const pageItems = visible.slice(start, start + this.pageSize);
    count.textContent = `${visible.length} CHAMPION${visible.length === 1 ? "" : "S"}`;

    const grid = el("div", "meta-champion-grid");
    for (const champion of pageItems) grid.appendChild(this.championCard(champion));
    if (pageItems.length === 0) {
      grid.appendChild(el("div", "meta-empty", "No champions match those filters."));
    }
    wrap.appendChild(grid);

    if (pages > 1 || visible.length > this.pageSize) {
      const pager = el("div", "meta-pagination");
      const prev = el("button", "meta-btn small", "← PREV");
      prev.disabled = this.championPage <= 0;
      prev.addEventListener("click", () => {
        this.championPage = Math.max(0, this.championPage - 1);
        this.render();
      });
      const label = el(
        "div",
        "meta-page-label",
        `PAGE ${this.championPage + 1} / ${pages} · ${start + 1}-${Math.min(start + this.pageSize, visible.length)} OF ${visible.length}`,
      );
      const next = el("button", "meta-btn small", "NEXT →");
      next.disabled = this.championPage >= pages - 1;
      next.addEventListener("click", () => {
        this.championPage = Math.min(pages - 1, this.championPage + 1);
        this.render();
      });
      pager.append(prev, label, next);
      wrap.appendChild(pager);
    }
    return wrap;
  }

  private renderDossier(championId: string): HTMLElement | null {
    const champion = this.characters.find((candidate) => candidate.id === championId);
    if (!champion) return null;
    const profile = champion.profile;
    const regions = championRegions(champion);
    const unlocked = isUnlocked(this.save, champion.id);
    const selected = this.save.selectedCharacter === champion.id;
    const title = profile?.title ?? "Champion of the Rift";
    const roles = profile?.roles?.length ? profile.roles : [this.classLabel(champion.class)];
    const overlay = el("div", "meta-dossier");
    this.applyRegionTheme(overlay, regions);
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", `${champion.name ?? champion.id} champion profile`);
    overlay.tabIndex = -1;

    const backdrop = el("div", "meta-dossier-backdrop");
    backdrop.addEventListener("click", () => this.closeDossier());
    const panel = el("article", "meta-dossier-panel");
    panel.addEventListener("click", (event) => event.stopPropagation());

    const close = el("button", "meta-dossier-close", "\u00d7");
    close.setAttribute("aria-label", "Close champion profile");
    close.addEventListener("click", () => this.closeDossier());

    const hero = el("header", "meta-dossier-hero");
    const art = el("div", "meta-dossier-art");
    // Card visualizer: splash art hero with the pixel sprite in front (D-056).
    const splash = championCardURL(champion.id);
    if (splash) {
      const splashLayer = el("div", "meta-dossier-splash");
      splashLayer.style.backgroundImage = `url(${splash})`;
      art.appendChild(splashLayer);
      art.appendChild(el("div", "meta-dossier-splash-shade"));
      const spriteURL = championIconURL(champion.id);
      if (spriteURL) {
        const sprite = el("img", "meta-dossier-sprite") as HTMLImageElement;
        sprite.src = spriteURL;
        sprite.alt = "";
        art.appendChild(sprite);
      }
    } else {
      art.appendChild(this.crestStack(regions, "meta-dossier-crest", "sm"));
    }
    art.append(el("div", "meta-dossier-art-label", regions[0] ?? "Runeterra"));
    const heading = el("div", "meta-dossier-heading");
    heading.append(
      el("div", "meta-kicker", "CHAMPION DOSSIER"),
      el("div", "meta-dossier-title", title),
      el("h2", "meta-dossier-name", champion.name ?? champion.id),
      this.regionChips(regions),
    );
    // SELECT action lives in the hero so it's reachable without scrolling.
    if (unlocked) {
      const selectTop = el("button", "meta-play small", selected ? "SELECTED" : "SELECT");
      selectTop.disabled = selected;
      selectTop.addEventListener("click", () => {
        this.save.selectedCharacter = champion.id;
        this.persist();
        this.render();
      });
      heading.appendChild(selectTop);
    }
    const roleRow = el("div", "meta-dossier-role-row");
    for (const role of roles) roleRow.appendChild(this.chip(role, "class"));
    roleRow.appendChild(
      this.chip(`RIFT ${this.classLabel(champion.class).toUpperCase()}`, "stage"),
    );
    if (profile?.difficulty)
      roleRow.appendChild(this.chip(profile.difficulty.toUpperCase(), "rarity"));
    if (isDarkinChampion(champion)) roleRow.appendChild(this.chip("DARKIN", "rarity"));
    heading.appendChild(roleRow);
    hero.append(art, heading);

    const body = el("div", "meta-dossier-body");
    const profileColumn = el("div", "meta-dossier-column");
    const summary = el("section", "meta-dossier-summary");
    summary.append(
      el("div", "meta-kicker", "PROFILE"),
      el("p", "", profile?.summary ?? champion.description ?? "A champion of the Rift."),
    );
    profileColumn.appendChild(summary);

    const facts = el("section", "meta-dossier-facts");
    const factEntries: Array<[string, string | undefined]> = [
      ["ORIGIN", profile?.origin],
      ["RESIDENCE", profile?.residence],
      ["FACTION", profile?.faction],
      ["SPECIES", profile?.species],
      ["OCCUPATION", profile?.occupation],
      ["LEAGUE ROLE", roles.join(" / ")],
      ["DIFFICULTY", profile?.difficulty],
      ["CHEST REGIONS", regions.join(" + ")],
    ];
    for (const [label, value] of factEntries) {
      if (!value) continue;
      const fact = el("div", "meta-dossier-fact");
      fact.append(el("div", "meta-kicker", label), el("div", "meta-dossier-fact-value", value));
      facts.appendChild(fact);
    }
    profileColumn.appendChild(facts);

    const kit = el("section", "meta-dossier-kit-block");
    kit.appendChild(el("div", "meta-kicker", "RIFT SURVIVORS KIT"));
    const ability = this.abilities.find((w) => w.id === champion.startingAbility);
    const ability2 = this.abilities.find((w) => w.id === champion.startingAbility2);
    const kitGrid = el("div", "meta-kit");
    kitGrid.appendChild(
      this.kitItem(
        "SIGNATURE ABILITY",
        abilityName(ability, champion.startingAbility),
        ability?.description ?? "",
      ),
    );
    if (ability2) {
      kitGrid.appendChild(
        this.kitItem(
          "ULTIMATE",
          abilityName(ability2, champion.startingAbility2 ?? ""),
          ability2.description ?? "",
        ),
      );
    }
    kit.appendChild(kitGrid);
    const tags = el("div", "meta-chip-row");
    tags.appendChild(this.chip(RARITY_LABELS[champion.rarity ?? "rare"], "rarity"));
    for (const tag of champion.tags ?? []) {
      if (tag.startsWith("role:")) continue;
      tags.appendChild(this.chip(tag.toUpperCase(), "kit"));
    }
    kit.appendChild(tags);
    profileColumn.appendChild(kit);

    const collection = el("aside", "meta-dossier-collection");
    collection.append(
      el("div", "meta-kicker", "COLLECTION"),
      el(
        "div",
        "meta-dossier-status",
        unlocked ? (selected ? "SELECTED FOR NEXT RUN" : "UNLOCKED") : "LOCKED",
      ),
    );
    if (!unlocked) {
      const shards = shardsFor(this.save, champion.id);
      const required = shardsRequired(champion);
      const progress = el("div", "meta-shard-progress");
      const bar = el("div", "meta-shard-bar");
      const fill = el("div", "meta-shard-fill");
      fill.style.width = `${Math.min(100, (shards / required) * 100)}%`;
      bar.appendChild(fill);
      progress.append(el("div", "meta-shard-label", `${shards} / ${required} SHARDS`), bar);
      collection.appendChild(progress);
    }
    collection.appendChild(this.regionChips(regions));

    // Skins carousel: obtainable skins, Blue Essence purchase + equip (D-055).
    const skinData = CHAMPION_SKINS[champion.id];
    if (skinData && skinData.obtainable.length > 0) {
      const skinsBlock = el("div", "meta-skins");
      skinsBlock.appendChild(
        el("div", "meta-kicker", `SKINS · ${this.save.blueEssence} BLUE ESSENCE`),
      );
      // Horizontal slider: scroll-snap cards, no vertical scroll marathon.
      const slider = el("div", "meta-skin-slider");
      const ownedSkins = this.save.ownedSkins[champion.id] ?? [];
      const equipped = this.save.equippedSkin[champion.id];
      for (const skin of skinData.obtainable) {
        const owned = ownedSkins.includes(skin.num);
        const isEquipped = equipped === skin.num;
        const card = el("div", "meta-skin-card holo");
        const thumbURL =
          championCardURL(champion.id, skin.num) || championIconURL(champion.id, skin.num);
        if (thumbURL) {
          const thumb = el("img", "meta-skin-thumb") as HTMLImageElement;
          thumb.src = thumbURL;
          thumb.alt = skin.name;
          card.appendChild(thumb);
        }
        const info = el("div", "meta-skin-info");
        info.append(
          el("div", "meta-skin-name", skin.name),
          el(
            "div",
            "meta-skin-state",
            isEquipped ? "EQUIPPED" : owned ? "OWNED" : `${SKIN_COST} BE`,
          ),
        );
        card.appendChild(info);
        const action = el(
          "button",
          "meta-btn small",
          isEquipped ? "EQUIPPED" : owned ? "EQUIP" : "BUY",
        );
        action.disabled = isEquipped || (!owned && this.save.blueEssence < SKIN_COST);
        action.addEventListener("click", () => {
          if (owned) {
            equipSkin(this.save, champion.id, skin.num);
          } else if (buySkin(this.save, champion.id, skin.num).ok) {
            equipSkin(this.save, champion.id, skin.num);
          }
          this.persist();
          this.render();
        });
        card.appendChild(action);
        slider.appendChild(card);
      }
      skinsBlock.appendChild(slider);
      collection.appendChild(skinsBlock);
    }

    if (unlocked) {
      const select = el("button", "meta-play", selected ? "SELECTED" : "SELECT");
      select.disabled = selected;
      select.addEventListener("click", () => {
        this.save.selectedCharacter = champion.id;
        this.persist();
      });
      collection.appendChild(select);
    } else {
      if (canUnlockWithShards(this.save, champion)) {
        const unlock = el("button", "meta-play", "UNLOCK WITH SHARDS");
        unlock.addEventListener("click", () => {
          if (unlockWithShards(this.save, champion)) {
            this.save.selectedCharacter = champion.id;
            this.persist();
          }
        });
        collection.appendChild(unlock);
      }
    }

    if (profile?.sources) {
      const sources = el("div", "meta-dossier-sources");
      const official = document.createElement("a");
      official.href = profile.sources.official;
      official.target = "_blank";
      official.rel = "noreferrer";
      official.textContent = "OFFICIAL PAGE";
      const wiki = document.createElement("a");
      wiki.href = profile.sources.wiki;
      wiki.target = "_blank";
      wiki.rel = "noreferrer";
      wiki.textContent = "WIKI";
      sources.append(official, el("span", "", "\u00b7"), wiki);
      sources.appendChild(
        el("span", "meta-dossier-verified", `VERIFIED ${profile.sources.verifiedAt}`),
      );
      collection.appendChild(sources);
    }

    body.append(profileColumn, collection);
    panel.append(close, hero, body);
    overlay.append(backdrop, panel);
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.closeDossier();
      }
    });
    window.setTimeout(() => close.focus(), 0);
    return overlay;
  }

  private renderRegionDossier(region: string): HTMLElement | null {
    const pool = championsInRegion(this.characters, region);
    if (pool.length === 0) return null;
    const style = regionStyle(region);
    const progress = regionProgressFor(this.save, region);
    const lockedPool = pool.filter((champion) => !isUnlocked(this.save, champion.id));
    const overlay = el("div", "meta-dossier");
    this.applyRegionTheme(overlay, [region]);
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", `${region} chest dossier`);
    overlay.tabIndex = -1;

    const backdrop = el("div", "meta-dossier-backdrop");
    backdrop.addEventListener("click", () => this.closeRegionDossier());
    const panel = el("article", "meta-dossier-panel");
    panel.addEventListener("click", (event) => event.stopPropagation());

    const close = el("button", "meta-dossier-close", "\u00d7");
    close.setAttribute("aria-label", "Close region chest dossier");
    close.addEventListener("click", () => this.closeRegionDossier());

    const hero = el("header", "meta-dossier-hero");
    const art = el("div", "meta-dossier-art");
    art.append(
      this.crestStack([region], "meta-dossier-crest", "sm"),
      el("div", "meta-dossier-art-label", "REGION CHEST"),
    );
    const heading = el("div", "meta-dossier-heading");
    heading.append(
      el("div", "meta-kicker", region === DARKIN_CHEST ? "BLOODBOUND VAULT" : "REGION DOSSIER"),
      el("div", "meta-dossier-title", region === DARKIN_CHEST ? "DARKIN CHEST" : "REGION CHEST"),
      el("h2", "meta-dossier-name", region),
      this.regionChips([region]),
    );
    const roleRow = el("div", "meta-dossier-role-row");
    roleRow.append(
      this.chip(`${pool.length} CHAMPIONS`, "class"),
      this.chip(`${lockedPool.length} LOCKED`, "rarity"),
      this.chip(region === DARKIN_CHEST ? "ADDITIONAL POOL" : "REGIONAL POOL", "stage"),
    );
    heading.appendChild(roleRow);
    hero.append(art, heading);

    const body = el("div", "meta-dossier-body");
    const profileColumn = el("div", "meta-dossier-column");
    const summary = el("section", "meta-dossier-summary");
    summary.append(el("div", "meta-kicker", "REGION PROFILE"), el("p", "", style.blurb));
    profileColumn.appendChild(summary);

    const record = el("section", "meta-region-dossier-record");
    record.appendChild(el("div", "meta-kicker", "PULL RECORD"));
    const recordGrid = el("div", "meta-region-dossier-facts");
    const stat = (label: string, value: string): HTMLElement => {
      const node = el("div", "meta-dossier-fact");
      node.append(el("div", "meta-kicker", label), el("div", "meta-dossier-fact-value", value));
      return node;
    };
    recordGrid.append(
      stat("TOTAL PULLS", String(progress.pulls)),
      stat("FULL CHAMPIONS", String(progress.pullsChampions)),
      stat("SHARDS", String(progress.pullsShards)),
      stat("GOLD EARNED", String(progress.pullsGold)),
      stat("GUARANTEED EPIC+", String(progress.pullsGuaranteed)),
      stat("KEYS SPENT", String(progress.pulls)),
    );
    record.appendChild(recordGrid);
    if (progress.trackedPulls < progress.pulls) {
      record.appendChild(
        el(
          "div",
          "meta-note",
          `Outcome detail is tracked for ${progress.trackedPulls} of ${progress.pulls} pulls since save v8.`,
        ),
      );
    }
    record.appendChild(
      el("div", "meta-note", "Region run progress is tracked on the Achievements page."),
    );
    profileColumn.appendChild(record);

    const poolSection = el("section", "meta-dossier-kit-block");
    poolSection.appendChild(el("div", "meta-kicker", "CHEST POOL"));
    const poolList = el("div", "meta-region-champions");
    for (const champion of pool) {
      const unlocked = isUnlocked(this.save, champion.id);
      const shards = shardsFor(this.save, champion.id);
      const needed = shardsRequired(champion);
      const item = el("div", `meta-region-champion${unlocked ? " owned" : ""}`);
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      item.setAttribute("aria-label", `Open ${champion.name ?? champion.id} dossier`);
      const openChampion = (): void => this.openDossier(champion.id);
      item.addEventListener("click", openChampion);
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openChampion();
        }
      });
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
            : `${RARITY_LABELS[champion.rarity ?? "rare"]} - ${shards}/${needed} SHARDS`,
        ),
      );
      item.append(dot, copy);
      poolList.appendChild(item);
    }
    poolSection.appendChild(poolList);
    profileColumn.appendChild(poolSection);

    const collection = el("aside", "meta-dossier-collection");
    collection.append(
      el("div", "meta-kicker", "KEYRING"),
      el("div", "meta-dossier-status", `${this.save.keys} KEYS READY`),
    );

    const actions = el("div", "meta-region-actions meta-region-dossier-actions");
    const one = el("button", "meta-btn", "OPEN 1 - 1 KEY");
    one.disabled = this.save.keys < 1;
    one.addEventListener("click", () => this.openChests(region, 1));
    const ten = el("button", "meta-play small", "OPEN 10 - 10 KEYS");
    ten.disabled = this.save.keys < 10;
    ten.addEventListener("click", () => this.openChests(region, 10));
    actions.append(one, ten);
    collection.appendChild(actions);
    collection.append(
      el(
        "div",
        "meta-region-note",
        this.save.keys >= 10
          ? `10-PULL GUARANTEES AN EPIC+ CHAMPION FROM ${region.toUpperCase()}`
          : "EARN KEYS IN RUNS - 10-PULL GUARANTEES EPIC+",
      ),
      el(
        "div",
        "meta-note",
        region === DARKIN_CHEST
          ? "Darkin champions also remain available in their regional chest pools."
          : "Champion and shard outcomes are weighted by rarity. Pulls are final once the chest is opened.",
      ),
    );

    body.append(profileColumn, collection);
    panel.append(close, hero, body);
    overlay.append(backdrop, panel);
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.closeRegionDossier();
      }
    });
    window.setTimeout(() => close.focus(), 0);
    return overlay;
  }

  private championCard(champion: CharacterDef): HTMLElement {
    const unlocked = isUnlocked(this.save, champion.id);
    const selected = this.save.selectedCharacter === champion.id;
    const regions = championRegions(champion);
    const profile = champion.profile;
    const color = hex(championColor(champion.id));
    const card = el(
      "div",
      `meta-champion-card${unlocked ? " unlocked" : " locked"}${selected ? " selected" : ""}`,
    );
    this.applyRegionTheme(card, regions);
    card.style.setProperty("--champ-color", color);
    // Gacha-style card: official splash art behind the content (D-056).
    const cardArt = championCardURL(champion.id);
    if (cardArt) {
      const artLayer = el("div", "meta-card-art");
      artLayer.style.backgroundImage = `url(${cardArt})`;
      card.prepend(artLayer);
      const artShade = el("div", "meta-card-art-shade");
      card.appendChild(artShade);
    }
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute(
      "aria-label",
      `${champion.name ?? champion.id}, ${profile?.title ?? ""}. Open champion dossier.`,
    );
    card.addEventListener("click", () => this.openDossier(champion.id));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this.openDossier(champion.id);
      }
    });
    card.addEventListener("pointermove", (event) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${((event.clientX - rect.left) / rect.width) * 100}%`);
      card.style.setProperty("--my", `${((event.clientY - rect.top) / rect.height) * 100}%`);
    });
    card.addEventListener("pointerleave", () => {
      card.style.removeProperty("--mx");
      card.style.removeProperty("--my");
    });

    // Horizontal banner card (D-064): full-bleed splash art, small region
    // crest top-left, name/title overlay on the art, compact meta row below.
    card.appendChild(this.crestStack(regions, "meta-champion-crest", "xs"));

    const top = el("div", "meta-champion-top");
    const info = el("div", "meta-champion-info");
    info.append(
      el("div", "meta-champion-name", champion.name ?? champion.id),
      el("div", "meta-champion-title", profile?.title ?? ""),
    );
    const rarity = el(
      "div",
      `meta-rarity rarity-${champion.rarity ?? "rare"}`,
      RARITY_LABELS[champion.rarity ?? "rare"],
    );
    const badges = el("div", "meta-champion-badges");
    if (regions.length > 1) badges.appendChild(el("span", "meta-cross-region", "CROSS-REGION"));
    if (isDarkinChampion(champion)) badges.appendChild(el("span", "meta-darkin-mark", "DARKIN"));
    top.append(info, rarity);
    card.appendChild(top);
    card.appendChild(el("div", "meta-champion-region", regions.join(" · ")));
    if (badges.childElementCount > 0) card.appendChild(badges);

    const ability = this.abilities.find((w) => w.id === champion.startingAbility);
    const ability2 = this.abilities.find((w) => w.id === champion.startingAbility2);
    const kit = el("div", "meta-champion-kit");
    kit.append(
      this.chip(`Q: ${abilityName(ability, champion.startingAbility)}`, "kit"),
      this.chip(`R: ${abilityName(ability2, champion.startingAbility2 ?? "")}`, "kit move"),
      ...(champion.tags?.includes("levitate") ? [this.chip("LEVITATE", "kit")] : []),
    );
    card.appendChild(kit);

    if (unlocked) {
      const footer = el("div", "meta-champion-footer");
      footer.appendChild(el("span", "meta-owned", selected ? "SELECTED FOR NEXT RUN" : "UNLOCKED"));
      footer.appendChild(el("span", "meta-open-hint", "DOSSIER"));
      const button = el("button", "meta-btn small", selected ? "SELECTED" : "SELECT");
      button.disabled = selected;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        this.save.selectedCharacter = champion.id;
        this.persist();
      });
      footer.appendChild(button);
      card.appendChild(footer);
    } else {
      const required = shardsRequired(champion);
      const shards = shardsFor(this.save, champion.id);
      const liquid = el("div", "meta-shard-liquid");
      liquid.style.setProperty("--fill", `${Math.min(100, (shards / required) * 100)}%`);
      card.appendChild(liquid);
      const progress = el("div", "meta-shard-progress");
      const bar = el("div", "meta-shard-bar");
      const fill = el("div", "meta-shard-fill");
      fill.style.width = `${Math.min(100, (shards / required) * 100)}%`;
      bar.appendChild(fill);
      progress.append(
        el(
          "div",
          "meta-shard-label",
          `${shards} / ${required} SHARDS · ${regions.join(" + ")} CHESTS`,
        ),
        bar,
      );
      card.appendChild(progress);

      const footer = el("div", "meta-champion-footer");
      footer.appendChild(el("span", "meta-locked-note", "GACHA ONLY"));
      footer.appendChild(el("span", "meta-open-hint", "DOSSIER"));
      if (canUnlockWithShards(this.save, champion)) {
        const unlock = el("button", "meta-btn small unlock", "UNLOCK");
        unlock.addEventListener("click", (event) => {
          event.stopPropagation();
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
    const regions = championRegions(champion);
    const style = regionStyle(regions[0] ?? "Runeterra");
    const header = el("div", "meta-upgrade-head");
    this.applyRegionTheme(header, regions);
    header.style.setProperty("--champ-color", hex(championColor(champion.id)));
    header.style.setProperty("--region-color", style.color);
    const portrait = el("div", "meta-upgrade-portrait", champion.name?.charAt(0) ?? "?");
    const copy = el("div", "meta-upgrade-copy");
    copy.append(
      el("div", "meta-kicker", `${regions.join(" + ")} · ${this.classLabel(champion.class)} tree`),
      el("h2", "meta-upgrade-name", champion.name ?? champion.id),
      el("div", "meta-subtitle", champion.profile?.summary ?? champion.description ?? ""),
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
      const effect = Object.entries(powerUpRankStats(p))
        .map(([stat, amount]) => `${percentStat(stat, amount)} ${statLabel(stat)}`)
        .join(" + ");
      title.append(
        el("span", "", p.name ?? p.id),
        el("span", "meta-upgrade-effect", `${effect || "NO STAT"} / RANK`),
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
        "KEY-FORGED TREASURES",
        "REGION CHESTS",
        "Spend keys to open a region chest. Champion and shard outcomes are weighted by rarity; the 10-pull guarantees an Epic+ champion.",
      ),
    );

    const hero = el("div", "meta-chest-hero");
    const copy = el("div", "meta-chest-hero-copy");
    copy.append(
      el("div", "meta-chest-hero-kicker", "YOUR KEYRING"),
      el(
        "div",
        "meta-chest-hero-title",
        `${this.save.keys} ${this.save.keys === 1 ? "KEY" : "KEYS"}`,
      ),
      el(
        "div",
        "meta-chest-hero-sub",
        "Earn keys from spawnable run chests, elite kills, and boss kills. One key opens one region chest; ten keys open ten.",
      ),
    );
    const sources = el("div", "meta-chest-sources");
    sources.append(
      el("span", "meta-chest-source", "RUN CHESTS"),
      el("span", "meta-chest-source", "ELITES"),
      el("span", "meta-chest-source", "BOSSES"),
    );
    copy.appendChild(sources);
    hero.appendChild(copy);
    hero.appendChild(el("div", "meta-chest-hero-mark", "K"));
    wrap.appendChild(hero);

    const rates = el("details", "meta-chest-rates");
    rates.appendChild(el("summary", "", "DROP RATES & GUARANTEES"));
    const rateBody = el("div", "meta-chest-rates-body");
    rateBody.append(
      el("span", "", `${Math.round(GACHA_ODDS.champion * 100)}% FULL CHAMPION`),
      el("span", "", `${Math.round(GACHA_ODDS.shards * 100)}% CHAMPION SHARDS`),
      el("span", "", `${Math.round(GACHA_ODDS.gold * 100)}% GOLD`),
      el("span", "", "RARITY: 60 COMMON / 30 RARE / 9 EPIC / 1 LEGENDARY"),
      el("span", "", "10-PULL: EPIC+ GUARANTEED"),
    );
    rates.appendChild(rateBody);
    wrap.appendChild(rates);

    const chestRegions = [
      ...(darkinChampions(this.characters).length > 0 ? [DARKIN_CHEST] : []),
      ...regionsOf(this.characters),
    ];
    const chestData = chestRegions.map((region, index) => {
      const style = regionStyle(region);
      const pool = championsInRegion(this.characters, region);
      const lockedPool = pool.filter((champion) => !isUnlocked(this.save, champion.id));
      return { region, index, style, pool, lockedPool };
    });

    const chestFilters = el("div", "meta-filter-row");
    const chestFilterOptions: Array<[string, string]> = [
      ["ALL", "ALL CHESTS"],
      ["REGIONAL", "REGIONAL"],
      ["DARKIN", "DARKIN"],
      ["INCOMPLETE", "INCOMPLETE POOLS"],
    ];
    for (const [value, label] of chestFilterOptions) {
      const button = el(
        "button",
        `meta-filter${this.chestFilter === value ? " active" : ""}`,
        label,
      );
      button.addEventListener("click", () => {
        this.chestFilter = value;
        this.render();
      });
      chestFilters.appendChild(button);
    }
    wrap.appendChild(chestFilters);

    const chestSearchRow = el("div", "meta-search-row");
    const chestSearch = el("input", "meta-search meta-chest-search");
    chestSearch.type = "search";
    chestSearch.placeholder = "Search region or champion...";
    chestSearch.value = this.chestQuery;
    chestSearch.addEventListener("input", () => {
      this.chestQuery = chestSearch.value;
      this.render();
      this.focusSearch(".meta-chest-search");
    });
    chestSearchRow.appendChild(chestSearch);
    chestSearchRow.appendChild(
      this.sortControl<ChestSort>(
        this.chestSort,
        [
          ["featured", "FEATURED"],
          ["name", "NAME A-Z"],
          ["pool", "POOL SIZE"],
          ["locked", "MISSING CHAMPIONS"],
          ["completion", "COMPLETION"],
        ],
        (sort) => {
          this.chestSort = sort;
          this.render();
        },
        "Sort chests",
      ),
    );
    const chestCount = el("div", "meta-result-count");
    chestSearchRow.appendChild(chestCount);
    wrap.appendChild(chestSearchRow);

    const query = this.chestQuery.trim().toLowerCase();
    let visibleChests = chestData.filter(({ region, style, pool }) => {
      if (this.chestFilter === "REGIONAL" && region === DARKIN_CHEST) return false;
      if (this.chestFilter === "DARKIN" && region !== DARKIN_CHEST) return false;
      if (
        this.chestFilter === "INCOMPLETE" &&
        pool.every((champion) => isUnlocked(this.save, champion.id))
      ) {
        return false;
      }
      if (!query) return true;
      const haystack =
        `${region} ${style.blurb} ${pool.map((champion) => champion.name ?? champion.id).join(" ")}`.toLowerCase();
      return haystack.includes(query);
    });
    visibleChests = [...visibleChests].sort((a, b) => {
      const byName = a.region.localeCompare(b.region);
      switch (this.chestSort) {
        case "name":
          return byName;
        case "pool":
          return b.pool.length - a.pool.length || byName;
        case "locked":
          return b.lockedPool.length - a.lockedPool.length || byName;
        case "completion": {
          const aDone = a.pool.length - a.lockedPool.length;
          const bDone = b.pool.length - b.lockedPool.length;
          return bDone / Math.max(1, b.pool.length) - aDone / Math.max(1, a.pool.length) || byName;
        }
        default:
          return a.index - b.index;
      }
    });
    chestCount.textContent = `${visibleChests.length} CHEST${visibleChests.length === 1 ? "" : "S"}`;

    const grid = el("div", "meta-region-grid");
    for (const { region, style, pool, lockedPool } of visibleChests) {
      const card = el("div", "meta-region-card meta-region-card-dossier");
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", `Open ${region} chest dossier`);
      card.addEventListener("click", () => this.openRegionDossier(region));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          this.openRegionDossier(region);
        }
      });
      this.applyRegionTheme(card, [region]);
      card.style.setProperty("--region-color", style.color);
      card.style.setProperty("--region-accent", style.accent);

      const head = el("div", "meta-region-head");
      head.append(
        this.crestStack([region], "meta-region-crest-box"),
        el("div", "meta-region-name", region),
        el("div", "meta-region-blurb", style.blurb),
      );
      card.appendChild(head);

      const stats = el("div", "meta-region-stats");
      stats.append(
        el("span", "", `${pool.length} CHAMPIONS`),
        el("span", "", `${lockedPool.length} LOCKED`),
        el("span", "accent", "EPIC+ GUARANTEE"),
      );
      card.appendChild(stats);

      const poolDetails = el("details", "meta-region-pool");
      poolDetails.addEventListener("click", (event) => event.stopPropagation());
      poolDetails.appendChild(el("summary", "", `VIEW POOL (${pool.length})`));
      const champions = el("div", "meta-region-champions");
      for (const champion of pool) {
        const unlocked = isUnlocked(this.save, champion.id);
        const shards = shardsFor(this.save, champion.id);
        const needed = shardsRequired(champion);
        const championRegionList = championRegions(champion);
        const otherRegions = championRegionList.filter((candidate) => candidate !== region);
        const item = el("div", `meta-region-champion${unlocked ? " owned" : ""}`);
        item.tabIndex = 0;
        item.setAttribute("role", "button");
        item.setAttribute("aria-label", `Open ${champion.name ?? champion.id} dossier`);
        item.addEventListener("click", () => this.openDossier(champion.id));
        item.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            this.openDossier(champion.id);
          }
        });
        const dot = el("span", "meta-region-dot", champion.name?.charAt(0) ?? "?");
        dot.style.color = hex(championColor(champion.id));
        const itemCopy = el("span", "meta-region-champion-copy");
        itemCopy.append(
          el("span", "", champion.name ?? champion.id),
          el(
            "span",
            "meta-region-champion-sub",
            unlocked
              ? `UNLOCKED${otherRegions.length ? ` - ALSO ${otherRegions.join(" / ").toUpperCase()}` : ""}`
              : `${RARITY_LABELS[champion.rarity ?? "rare"]} - ${shards}/${needed} SHARDS${otherRegions.length ? " - CROSS-REGION" : ""}`,
          ),
        );
        item.append(dot, itemCopy);
        champions.appendChild(item);
      }
      poolDetails.appendChild(champions);
      card.appendChild(poolDetails);

      const actions = el("div", "meta-region-actions");
      const one = el("button", "meta-btn", "OPEN 1 - 1 KEY");
      one.disabled = this.save.keys < 1;
      one.addEventListener("click", (event) => {
        event.stopPropagation();
        this.openChests(region, 1);
      });
      const ten = el("button", "meta-play small", "OPEN 10 - 10 KEYS");
      ten.disabled = this.save.keys < 10;
      ten.addEventListener("click", (event) => {
        event.stopPropagation();
        this.openChests(region, 10);
      });
      actions.append(one, ten);
      card.appendChild(actions);
      const guarantee = el("div", "meta-region-note");
      guarantee.textContent =
        this.save.keys >= 10
          ? `10-PULL GUARANTEES AN EPIC+ CHAMPION FROM ${region.toUpperCase()}`
          : "EARN KEYS IN RUNS - 10-PULL GUARANTEES EPIC+";
      card.appendChild(guarantee);
      card.appendChild(el("div", "meta-region-dossier-hint", "OPEN DOSSIER"));
      grid.appendChild(card);
    }
    if (visibleChests.length === 0) {
      grid.appendChild(el("div", "meta-empty", "No chests match those filters."));
    }
    wrap.appendChild(grid);

    const hint = el("div", "meta-note");
    hint.textContent =
      "Shards are champion-specific. When a champion reaches their requirement, the Champions page shows UNLOCK - you choose the order.";
    wrap.appendChild(hint);
    return wrap;
  }

  private openChests(region: string, count: 1 | 10): void {
    const drops = openRegionChests(this.save, region, this.characters, count);
    if (!drops) return;
    const newlyUnlocked = checkAchievements(this.save, null, this.characters);
    if (newlyUnlocked.length > 0) this.pendingToasts.push(...newlyUnlocked);
    persistSave(this.save);
    this.render();
    this.chestOpening.show({
      region,
      drops,
      characters: this.characters,
      count,
      keysRemaining: this.save.keys,
      onClose: () => {
        this.render();
        this.showToasts();
      },
    });
  }
  // ACHIEVEMENTS
  // -------------------------------------------------------------------------
  private renderAchievements(): HTMLElement {
    const wrap = el("div", "meta-page");
    wrap.appendChild(
      this.sectionHead(
        "MILESTONES & LORE",
        "ACHIEVEMENTS",
        "Combat, survival, loot, exploration, and the stories of every region. Region progress is earned by completing runs and opening that region's chests.",
      ),
    );
    const doneCount = ACHIEVEMENTS.filter((a) => this.save.achievements.includes(a.id)).length;
    const progressPct = ACHIEVEMENTS.length
      ? Math.round((doneCount / ACHIEVEMENTS.length) * 100)
      : 0;
    const stats = el("div", "meta-achievement-stats");
    stats.append(
      el("span", "", `${doneCount} / ${ACHIEVEMENTS.length} COMPLETE`),
      el("span", "", `${progressPct}% OF THE TALE`),
      el("span", "", `LIFETIME BUSHES ${this.save.lifetimeBushesBroken}`),
      el("span", "", `LIFETIME CHESTS ${this.save.lifetimeChestsOpened}`),
    );
    wrap.appendChild(stats);

    const categories = [
      "ALL",
      "combat",
      "survival",
      "loot",
      "exploration",
      "collection",
      "region",
      "lore",
    ];
    const filters = el("div", "meta-achievement-filters");
    for (const category of categories) {
      const button = el(
        "button",
        `meta-filter${this.achievementCategory === category ? " active" : ""}`,
        category === "ALL" ? "ALL" : category.toUpperCase(),
      );
      button.addEventListener("click", () => {
        this.achievementCategory = category;
        this.render();
      });
      filters.appendChild(button);
    }
    wrap.appendChild(filters);

    const regionRow = el("div", "meta-achievement-region-row");
    const regionSelect = el("select", "meta-achievement-region-select");
    const allOption = el("option", "", "ALL REGIONS");
    allOption.value = "ALL";
    regionSelect.appendChild(allOption);
    const regions = [...new Set(ACHIEVEMENTS.map((a) => a.region).filter(Boolean))] as string[];
    for (const region of regions) {
      const option = el("option", "", region.toUpperCase());
      option.value = region;
      regionSelect.appendChild(option);
    }
    regionSelect.value = this.achievementRegion;
    regionSelect.addEventListener("change", () => {
      this.achievementRegion = regionSelect.value;
      this.render();
    });
    regionRow.appendChild(regionSelect);
    regionRow.appendChild(
      el(
        "span",
        "meta-achievement-filter-copy",
        "Each region has three tiers. Darkin is a lore chest pool, not a region.",
      ),
    );
    wrap.appendChild(regionRow);

    const achievementSearchRow = el("div", "meta-search-row");
    const achievementSearch = el("input", "meta-search meta-achievement-search");
    achievementSearch.type = "search";
    achievementSearch.placeholder = "Search achievements...";
    achievementSearch.value = this.achievementQuery;
    achievementSearch.addEventListener("input", () => {
      this.achievementQuery = achievementSearch.value;
      this.render();
      this.focusSearch(".meta-achievement-search");
    });
    achievementSearchRow.appendChild(achievementSearch);
    achievementSearchRow.appendChild(
      this.sortControl<AchievementSort>(
        this.achievementSort,
        [
          ["default", "DEFAULT"],
          ["incomplete", "INCOMPLETE FIRST"],
          ["complete", "COMPLETE FIRST"],
          ["progress", "PROGRESS"],
          ["reward", "REWARD"],
          ["name", "NAME A-Z"],
        ],
        (sort) => {
          this.achievementSort = sort;
          this.render();
        },
        "Sort achievements",
      ),
    );
    const achievementCount = el("div", "meta-result-count");
    achievementSearchRow.appendChild(achievementCount);
    wrap.appendChild(achievementSearchRow);

    const achievementRows = ACHIEVEMENTS.map((achievement) => {
      const done = this.save.achievements.includes(achievement.id);
      const current = achievementCurrent(this.save, achievement, this.characters);
      const pct = achievement.target > 0 ? Math.min(1, current / achievement.target) : 0;
      const rewardValue = (achievement.rewardGold ?? 0) + (achievement.rewardKeys ?? 0) * 100;
      return { achievement, done, current, pct, rewardValue };
    });
    const achievementQuery = this.achievementQuery.trim().toLowerCase();
    let achievementRowsFiltered = achievementRows.filter(({ achievement }) => {
      if (this.achievementCategory !== "ALL" && achievement.category !== this.achievementCategory)
        return false;
      if (this.achievementRegion !== "ALL" && achievement.region !== this.achievementRegion)
        return false;
      if (!achievementQuery) return true;
      const haystack =
        `${achievement.label} ${achievement.description} ${achievement.category} ${achievement.region ?? ""}`.toLowerCase();
      return haystack.includes(achievementQuery);
    });
    achievementRowsFiltered = [...achievementRowsFiltered].sort((a, b) => {
      const byName = a.achievement.label.localeCompare(b.achievement.label);
      switch (this.achievementSort) {
        case "incomplete":
          return Number(a.done) - Number(b.done) || b.pct - a.pct || byName;
        case "complete":
          return Number(b.done) - Number(a.done) || b.pct - a.pct || byName;
        case "progress":
          return b.pct - a.pct || byName;
        case "reward":
          return b.rewardValue - a.rewardValue || byName;
        case "name":
          return byName;
        default:
          return 0;
      }
    });
    achievementCount.textContent = `${achievementRowsFiltered.length} GOAL${achievementRowsFiltered.length === 1 ? "" : "S"}`;

    const list = el("div", "meta-achievement-list");
    for (const { achievement, done, current, pct } of achievementRowsFiltered) {
      const row = el(
        "div",
        `meta-achievement${done ? " done" : ""}${achievement.region ? " has-region" : ""}`,
      );
      if (achievement.region) {
        const style = regionStyle(achievement.region);
        row.style.setProperty("--region-primary", style.color);
        row.style.setProperty("--region-accent", style.accent);
      }
      const mark = el("div", "meta-achievement-mark", done ? "\u2713" : "\u00b7");
      const body = el("div", "meta-achievement-body");
      const top = el("div", "meta-achievement-top");
      if (achievement.region) {
        const crest = crestMark([achievement.region], "xs", "meta-achievement-crest");
        top.appendChild(crest);
      }
      const categoryLabel =
        achievement.category === "region" && achievement.region
          ? `${achievement.region.toUpperCase()} \u00b7 REGION`
          : achievement.category.toUpperCase();
      top.append(
        el("div", "meta-achievement-label", achievement.label),
        el("div", "meta-achievement-category", categoryLabel),
        el(
          "div",
          "meta-achievement-state",
          done ? "COMPLETE" : `${Math.min(current, achievement.target)} / ${achievement.target}`,
        ),
      );
      const reward = [
        achievement.rewardGold ? `+${achievement.rewardGold} GOLD` : "",
        achievement.rewardKeys
          ? `+${achievement.rewardKeys} ${achievement.rewardKeys === 1 ? "KEY" : "KEYS"}`
          : "",
      ]
        .filter(Boolean)
        .join("  -  ");
      const progress = el("div", "meta-achievement-progress");
      const track = el("div", "meta-achievement-progress-track");
      const fill = el("div", "meta-achievement-progress-fill");
      fill.style.width = `${Math.round(pct * 100)}%`;
      track.appendChild(fill);
      progress.appendChild(track);
      progress.appendChild(
        el(
          "span",
          "meta-achievement-progress-copy",
          done ? "COMPLETE" : `${Math.min(current, achievement.target)} / ${achievement.target}`,
        ),
      );
      body.append(
        top,
        el("div", "meta-achievement-desc", achievement.description),
        progress,
        el("div", "meta-achievement-reward", reward || "NO REWARD"),
      );
      row.append(mark, body);
      list.appendChild(row);
    }
    if (achievementRowsFiltered.length === 0) {
      list.appendChild(el("div", "meta-note", "No achievements match those filters."));
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
      this.sectionHead(
        "OPTIONS",
        "SETTINGS",
        "Audio, feel, controls, and save data. Everything applies instantly and syncs with your cloud save.",
      ),
    );

    const card = el("div", "meta-settings-card");

    // --- AUDIO ---------------------------------------------------------------
    const audio = el("div", "meta-settings-group");
    audio.appendChild(el("div", "meta-settings-label", "AUDIO"));
    const volumes = el("div", "meta-settings-row");
    volumes.appendChild(
      this.slider(
        "MASTER",
        this.save.settings.volume,
        (value) => {
          this.save.settings.volume = value;
          this.afterSettings();
        },
        "Overall loudness for everything.",
      ),
    );
    volumes.appendChild(
      this.slider(
        "MUSIC",
        this.save.settings.music,
        (value) => {
          this.save.settings.music = value;
          this.afterSettings();
        },
        "The procedural soundtrack.",
      ),
    );
    volumes.appendChild(
      this.slider(
        "EFFECTS",
        this.save.settings.sfx,
        (value) => {
          this.save.settings.sfx = value;
          this.afterSettings();
        },
        "Hits, pickups, level-ups and chests.",
      ),
    );
    audio.appendChild(volumes);
    card.appendChild(audio);

    // --- GAME FEEL -------------------------------------------------------------
    const feel = el("div", "meta-settings-group");
    feel.appendChild(el("div", "meta-settings-label", "GAME FEEL"));
    const feelRow = el("div", "meta-settings-row");
    feelRow.appendChild(
      this.toggle("SCREEN SHAKE", this.save.settings.shake, () => {
        this.save.settings.shake = !this.save.settings.shake;
        this.afterSettings();
      }),
    );
    feelRow.appendChild(
      this.toggle("DAMAGE NUMBERS", this.save.settings.damageNumbers, () => {
        this.save.settings.damageNumbers = !this.save.settings.damageNumbers;
        this.afterSettings();
      }),
    );
    feelRow.appendChild(
      this.toggle("PERF OVERLAY", this.save.settings.showFps, () => {
        this.save.settings.showFps = !this.save.settings.showFps;
        this.afterSettings();
      }),
    );
    feel.appendChild(feelRow);
    card.appendChild(feel);

    // --- CONTROLS ----------------------------------------------------------------
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
    const shopBind = el("button", "meta-btn");
    shopBind.textContent =
      this.listening === "shop"
        ? "PRESS A KEY..."
        : `SHOP: ${this.save.settings.shopKey.toUpperCase()}`;
    shopBind.addEventListener("click", () => this.startRebind("shop"));
    binds.appendChild(shopBind);
    controls.appendChild(binds);
    controls.appendChild(
      el(
        "div",
        "meta-hint",
        "ARROW KEYS ALWAYS MOVE · ESC CANCELS REBINDING · TAB SHOWS STATS · B OPENS THE SHOP MID-RUN",
      ),
    );
    card.appendChild(controls);

    // --- DATA ------------------------------------------------------------------
    const data = el("div", "meta-settings-group");
    data.appendChild(el("div", "meta-settings-label", "SAVE DATA"));
    const dataRow = el("div", "meta-settings-row");
    const exportBtn = el("button", "meta-btn", "EXPORT SAVE");
    exportBtn.addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(this.save, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "rift-survivors-save.json";
      link.click();
      URL.revokeObjectURL(url);
    });
    dataRow.appendChild(exportBtn);
    const importBtn = el("button", "meta-btn", "IMPORT SAVE");
    const importInput = el("input") as HTMLInputElement;
    importInput.type = "file";
    importInput.accept = "application/json";
    importInput.style.display = "none";
    importInput.addEventListener("change", () => {
      const file = importInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result)) as SaveData;
          if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            throw new Error("not a save file");
          }
          const migrated = migrateSave(parsed, "ahri", "rift-field");
          Object.assign(this.save, migrated);
          persistSave(this.save);
          window.location.reload();
        } catch {
          const fail = el("div", "meta-achievement-toast");
          fail.appendChild(el("div", "meta-achievement-toast-kicker", "IMPORT FAILED"));
          fail.appendChild(el("div", "meta-achievement-toast-label", "Not a Rift Survivors save."));
          document.body.appendChild(fail);
          window.setTimeout(() => fail.remove(), 3600);
        }
      };
      reader.readAsText(file);
    });
    importBtn.addEventListener("click", () => importInput.click());
    dataRow.appendChild(importBtn);
    dataRow.appendChild(importInput);
    const reset = el("button", "meta-btn danger", "RESET SAVE");
    reset.addEventListener("click", () => this.resetSave());
    dataRow.appendChild(reset);
    data.appendChild(dataRow);
    data.appendChild(
      el(
        "div",
        "meta-hint",
        "Export/import a portable JSON backup. Reset clears champions, shards, gold, upgrades, and settings.",
      ),
    );
    card.appendChild(data);

    wrap.appendChild(card);
    wrap.appendChild(
      el(
        "div",
        "meta-note",
        "Press H anywhere to open the local admin panel (gold, keys, shards, unlock-all, max upgrades, reset).",
      ),
    );
    return wrap;
  }

  private slider(
    label: string,
    value: number,
    onChange: (value: number) => void,
    hint: string,
  ): HTMLElement {
    const box = el("div", "meta-slider");
    box.appendChild(el("div", "meta-slider-label", `${label} ${Math.round(value * 100)}%`));
    const input = el("input") as HTMLInputElement;
    input.type = "range";
    input.min = "0";
    input.max = "100";
    input.value = String(Math.round(value * 100));
    input.setAttribute("aria-label", label);
    input.addEventListener("input", () => {
      const next = Number(input.value) / 100;
      const labelNode = box.querySelector(".meta-slider-label");
      if (labelNode) labelNode.textContent = `${label} ${input.value}%`;
      onChange(next);
    });
    input.title = hint;
    box.appendChild(input);
    return box;
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
    resetSave(this.characters[0]?.id ?? "lux", this.stages[0]?.id ?? "rift-field");
    window.location.reload();
  }

  private startRebind(kind: keyof Keybinds | "shop"): void {
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
      if (kind === "shop") {
        // The shop key is free-form: it only needs to not collide with binds.
        for (const other of Object.keys(this.save.settings.keybinds) as (keyof Keybinds)[]) {
          if (this.save.settings.keybinds[other] === key) {
            this.save.settings.keybinds[other] = this.save.settings.shopKey;
          }
        }
        this.save.settings.shopKey = key;
      } else {
        const binds = this.save.settings.keybinds;
        for (const other of Object.keys(binds) as (keyof Keybinds)[]) {
          if (other !== kind && binds[other] === key) binds[other] = binds[kind];
        }
        binds[kind] = key;
      }
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

  private classLabel(className: string | undefined): string {
    return CLASSES[(className ?? "mage") as keyof typeof CLASSES]?.label ?? "Mage";
  }

  private sortControl<T extends string>(
    value: T,
    options: ReadonlyArray<readonly [T, string]>,
    onChange: (value: T) => void,
    ariaLabel: string,
  ): HTMLElement {
    const label = el("label", "meta-sort-control");
    label.appendChild(el("span", "meta-sort-label", "SORT"));
    const select = el("select", "meta-sort-select");
    select.setAttribute("aria-label", ariaLabel);
    for (const [optionValue, optionLabel] of options) {
      const option = el("option", "", optionLabel);
      option.value = optionValue;
      select.appendChild(option);
    }
    select.value = value;
    select.addEventListener("change", () => onChange(select.value as T));
    label.appendChild(select);
    return label;
  }

  private focusSearch(selector: string): void {
    const input = this.root.querySelector<HTMLInputElement>(selector);
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
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
