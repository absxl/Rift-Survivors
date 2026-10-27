import type { LobbyPlayer } from "@rift/shared";
// DOM HUD: crisp, League-inspired overlay above the pixel world. The renderer
// owns only the world; every HUD element here is plain DOM (top bar, party,
// boss bar, compact hotbar, tooltips, Tab scoreboard).
import type {
  CharacterDef,
  EnemyDef,
  PassiveDef,
  RunStats,
  WeaponDef,
  WorldSnapshot,
} from "@rift/sim";
import { passiveInfo, weaponInfo } from "./ability-info";
import { championColor } from "./champion-colors";
import { pickBossBar } from "./hud-boss";
import { type LoadoutEntry, ownedIndices } from "./loadout";
import { PRIMARY_LABELS, formatStats } from "./stats-format";

interface SlotView {
  root: HTMLElement;
  letter: HTMLElement;
  glyph: HTMLElement;
  level: HTMLElement;
  cooldown: HTMLElement;
  empty: boolean;
  key: string;
  kind: "weapon" | "passive" | "move";
  defIndex: number;
  levelNum: number;
  cooldownFrac: number;
  label: string;
  color: string;
}

const ABILITY_KEYS = ["Q", "W", "E", "R"];

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

function colorHex(value: number): string {
  return `#${value.toString(16).padStart(6, "0")}`;
}

export class Hud {
  private readonly root: HTMLElement;
  private readonly timeEl: HTMLElement;
  private readonly killsLabel: HTMLElement;
  private readonly killsEl: HTMLElement;
  private readonly stageEl: HTMLElement;
  private readonly goldEl: HTMLElement;
  private readonly chestsEl: HTMLElement;
  private readonly partyEl: HTMLElement;
  private readonly bossEl: HTMLElement;
  private readonly bossName: HTMLElement;
  private readonly bossFill: HTMLElement;
  private readonly portraitEl: HTMLElement;
  private readonly portraitGlyph: HTMLElement;
  private readonly levelEl: HTMLElement;
  private readonly hpFill: HTMLElement;
  private readonly hpText: HTMLElement;
  private readonly xpFill: HTMLElement;
  private readonly abilitySlots: SlotView[] = [];
  private readonly moveSlots: SlotView[] = [];
  private readonly itemSlots: SlotView[] = [];
  private readonly tooltip: HTMLElement;
  private readonly tooltipTitle: HTMLElement;
  private readonly tooltipSub: HTMLElement;
  private readonly tooltipDesc: HTMLElement;
  private readonly tooltipLines: HTMLElement;
  private readonly scoreboard: HTMLElement;
  private readonly scoreboardBody: HTMLElement;
  private readonly scoreboardStats: HTMLElement;

  private readonly weapons: WeaponDef[];
  private readonly passives: PassiveDef[];
  private readonly enemies: EnemyDef[];
  private readonly characters: CharacterDef[];
  private localPlayerId = 0;
  private championId = "";
  private party: LobbyPlayer[] = [];
  private statsVisible = false;
  private hoverSlot: SlotView | null = null;
  private hoverX = 0;
  private hoverY = 0;
  private lastStats: RunStats | null = null;

  constructor(
    weapons: WeaponDef[],
    passives: PassiveDef[],
    enemies: EnemyDef[],
    characters: CharacterDef[] = [],
  ) {
    this.weapons = weapons;
    this.passives = passives;
    this.enemies = enemies;
    this.characters = characters;

    this.root = el("div", "hud");
    document.body.appendChild(this.root);

    // Top bar ---------------------------------------------------------------
    const topbar = el("div", "hud-topbar");
    this.timeEl = el("div", "hud-time", "0:00");
    const center = el("div", "hud-center");
    center.appendChild(this.timeEl);
    const killWrap = el("div", "hud-kills");
    this.killsLabel = el("span", "hud-kills-label", "KILLS");
    this.killsEl = el("span", "hud-kills-value", "0");
    killWrap.append(this.killsLabel, this.killsEl);
    center.appendChild(killWrap);
    topbar.appendChild(center);

    const currency = el("div", "hud-currency");
    this.stageEl = el("span", "hud-stage-name", "");
    this.goldEl = el("span", "hud-gold", "0 G");
    this.chestsEl = el("span", "hud-chests", "0 CHESTS");
    currency.append(this.stageEl, this.goldEl, this.chestsEl);
    topbar.appendChild(currency);
    this.root.appendChild(topbar);

    // Party frames ----------------------------------------------------------
    this.partyEl = el("div", "hud-party");
    this.root.appendChild(this.partyEl);

    // Boss bar --------------------------------------------------------------
    this.bossEl = el("div", "hud-boss");
    this.bossEl.style.display = "none";
    this.bossName = el("div", "hud-boss-name", "");
    const bossTrack = el("div", "hud-boss-track");
    this.bossFill = el("div", "hud-boss-fill");
    bossTrack.appendChild(this.bossFill);
    this.bossEl.append(this.bossName, bossTrack);
    this.root.appendChild(this.bossEl);

    // Hotbar ----------------------------------------------------------------
    const hotbar = el("div", "hud-hotbar");
    const identity = el("div", "hud-identity");
    this.portraitEl = el("div", "hud-portrait");
    this.portraitGlyph = el("span", "hud-portrait-glyph", "?");
    const levelBadge = el("div", "hud-level-badge");
    this.levelEl = el("span", "", "1");
    levelBadge.appendChild(this.levelEl);
    this.portraitEl.append(this.portraitGlyph, levelBadge);
    const bars = el("div", "hud-bars");
    const hpTrack = el("div", "hud-hp-track");
    this.hpFill = el("div", "hud-hp-fill");
    hpTrack.appendChild(this.hpFill);
    this.hpText = el("div", "hud-hp-text", "100 / 100");
    hpTrack.appendChild(this.hpText);
    const xpTrack = el("div", "hud-xp-track");
    this.xpFill = el("div", "hud-xp-fill");
    xpTrack.appendChild(this.xpFill);
    bars.append(hpTrack, xpTrack);
    identity.append(this.portraitEl, bars);

    const abilities = el("div", "hud-slots hud-abilities");
    for (let i = 0; i < 4; i++) {
      this.abilitySlots.push(this.makeSlot(abilities, ABILITY_KEYS[i] ?? "", "weapon"));
    }
    const moves = el("div", "hud-slots hud-moves");
    for (let i = 0; i < 4; i++) {
      this.moveSlots.push(this.makeSlot(moves, "M", "move"));
    }
    const items = el("div", "hud-items");
    for (let i = 0; i < 8; i++) {
      this.itemSlots.push(this.makeSlot(items, "", "passive", true));
    }
    hotbar.append(identity, abilities, moves, items);
    this.root.appendChild(hotbar);

    // Tooltip ---------------------------------------------------------------
    this.tooltip = el("div", "hud-tooltip");
    this.tooltip.style.display = "none";
    this.tooltipTitle = el("div", "hud-tooltip-title");
    this.tooltipSub = el("div", "hud-tooltip-sub");
    this.tooltipDesc = el("div", "hud-tooltip-desc");
    this.tooltipLines = el("div", "hud-tooltip-lines");
    this.tooltip.append(this.tooltipTitle, this.tooltipSub, this.tooltipDesc, this.tooltipLines);
    this.root.appendChild(this.tooltip);

    // Scoreboard ------------------------------------------------------------
    this.scoreboard = el("div", "hud-scoreboard");
    this.scoreboard.style.display = "none";
    const scoreTitle = el("div", "hud-score-title", "PARTY & STATS");
    const scoreHint = el("div", "hud-score-hint", "TAB TO CLOSE");
    this.scoreboardBody = el("div", "hud-score-body");
    this.scoreboardStats = el("div", "hud-score-stats");
    this.scoreboard.append(scoreTitle, scoreHint, this.scoreboardBody, this.scoreboardStats);
    this.root.appendChild(this.scoreboard);
  }

  setLocalPlayer(playerId: number): void {
    this.localPlayerId = playerId;
  }

  setChampion(id: string): void {
    this.championId = id;
    const def = this.characters.find((c) => c.id === id);
    this.portraitGlyph.textContent = (def?.name ?? id ?? "?").charAt(0).toUpperCase();
    this.portraitEl.style.background = colorHex(championColor(id));
  }

  /** Lobby roster for party frames; names/colors come from the lobby. */
  setParty(players: LobbyPlayer[]): void {
    this.party = players;
  }

  /** Tab scoreboard toggle, also driven by the HUD's own Tab handler. */
  toggleStats(): void {
    this.statsVisible = !this.statsVisible;
    this.scoreboard.style.display = this.statsVisible ? "flex" : "none";
  }

  update(s: WorldSnapshot): void {
    const secs = Math.floor(s.tick / 30);
    this.timeEl.textContent = `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, "0")}`;
    this.stageEl.textContent = (s.stageName ?? "").toUpperCase();

    const playerStore = s.stores.find((st) => st.kind === "player");
    const pIdx = playerStore ? playerStore.slots.indexOf(this.localPlayerId) : -1;
    const hp = pIdx >= 0 && playerStore ? (playerStore.fields.hp[pIdx] ?? 0) : 0;
    const maxHp = pIdx >= 0 && playerStore ? (playerStore.fields.maxHp[pIdx] ?? 100) : 100;
    const gold = pIdx >= 0 && playerStore ? (playerStore.fields.gold[pIdx] ?? 0) : 0;
    const chests = pIdx >= 0 && playerStore ? (playerStore.fields.chests[pIdx] ?? 0) : 0;
    const ownKills = pIdx >= 0 && playerStore ? (playerStore.fields.kills[pIdx] ?? 0) : 0;

    // Team kills in co-op; individual kills in solo (docs: top bar vs Tab).
    let teamKills = ownKills;
    if (playerStore && this.party.length > 1) {
      teamKills = playerStore.slots.reduce(
        (sum, slot) => sum + (playerStore.fields.kills[slot] ?? 0),
        0,
      );
    }
    this.killsLabel.textContent = this.party.length > 1 ? "TEAM KILLS" : "KILLS";
    this.killsEl.textContent = String(Math.round(teamKills));
    this.goldEl.textContent = `${Math.round(gold)} G`;
    this.chestsEl.textContent = `${Math.round(chests)} CHESTS`;

    this.hpFill.style.width = `${Math.max(0, Math.min(1, maxHp > 0 ? hp / maxHp : 0)) * 100}%`;
    this.hpText.textContent = `${Math.ceil(hp)} / ${Math.ceil(maxHp)}`;
    this.xpFill.style.width = `${
      s.partyXpToNext > 0 ? Math.max(0, Math.min(1, s.partyXp / s.partyXpToNext)) * 100 : 0
    }%`;
    this.levelEl.textContent = String(s.partyLevel);

    this.renderParty(playerStore);

    const stats = s.playerStats[this.localPlayerId] ?? s.playerStats[0] ?? null;
    this.lastStats = stats;

    const weaponStore = s.stores.find((st) => st.kind === "weapon");
    const passiveStore = s.stores.find((st) => st.kind === "passive");
    const ownedWeapons = ownedIndices(weaponStore, this.localPlayerId);
    const normalWeapons: LoadoutEntry[] = [];
    const moves: LoadoutEntry[] = [];
    for (const entry of ownedWeapons) {
      const def = this.weapons[entry.defIndex];
      if (def?.isMove) moves.push(entry);
      else normalWeapons.push(entry);
    }
    const ownedPassives = ownedIndices(passiveStore, this.localPlayerId);

    this.abilitySlots.forEach((slot, i) => this.fillWeaponSlot(slot, normalWeapons[i], stats));
    this.moveSlots.forEach((slot, i) => this.fillWeaponSlot(slot, moves[i], stats));
    const itemEntries: LoadoutEntry[] = [...normalWeapons.slice(4, 6)];
    const items = [
      ...itemEntries.map((e) => ({ kind: "weapon" as const, entry: e })),
      ...ownedPassives.map((e) => ({ kind: "passive" as const, entry: e })),
    ];
    this.itemSlots.forEach((slot, i) => {
      const item = items[i];
      if (!item) this.drawEmpty(slot);
      else if (item.kind === "weapon") this.fillWeaponSlot(slot, item.entry, stats);
      else this.fillPassiveSlot(slot, item.entry);
    });

    this.updateBoss(s);
    if (this.statsVisible) this.renderScoreboard(playerStore, stats);
    if (this.hoverSlot) this.refreshTooltip();
  }

  private makeSlot(
    parent: HTMLElement,
    letter: string,
    kind: "weapon" | "move" | "passive",
    small = false,
  ): SlotView {
    const root = el(
      "div",
      `hud-slot hud-slot-${kind} hud-slot-empty${small ? " hud-slot-small" : ""}`,
    );
    const letterEl = el("span", "hud-slot-letter", letter);
    const glyph = el("span", "hud-slot-glyph", "");
    const level = el("span", "hud-slot-level", "");
    const cooldown = el("div", "hud-slot-cooldown");
    root.append(letterEl, glyph, level, cooldown);
    parent.appendChild(root);
    const view: SlotView = {
      root,
      letter: letterEl,
      glyph,
      level,
      cooldown,
      empty: true,
      key: "",
      kind,
      defIndex: -1,
      levelNum: 0,
      cooldownFrac: 0,
      label: "",
      color: "",
    };
    root.addEventListener("mouseenter", (e) => {
      this.hoverSlot = view;
      this.hoverX = e.clientX;
      this.hoverY = e.clientY;
      this.showTooltip(view);
    });
    root.addEventListener("mouseleave", () => {
      this.hoverSlot = null;
      this.tooltip.style.display = "none";
    });
    root.addEventListener("mousemove", (e) => {
      this.hoverX = e.clientX;
      this.hoverY = e.clientY;
      if (this.hoverSlot === view) this.positionTooltip();
    });
    return view;
  }

  private fillWeaponSlot(
    slot: SlotView,
    entry: LoadoutEntry | undefined,
    stats: RunStats | null,
  ): void {
    if (!entry) {
      this.drawEmpty(slot);
      return;
    }
    const def = this.weapons[entry.defIndex];
    if (!def) {
      this.drawEmpty(slot);
      return;
    }
    const base = def.base.cooldown / (stats?.cooldown ?? 1);
    slot.cooldownFrac = base > 0 ? Math.max(0, Math.min(1, entry.cooldown / base)) : 0;
    const key = `w:${entry.defIndex}:${entry.level}`;
    if (slot.key !== key) {
      slot.key = key;
      slot.empty = false;
      slot.kind = def.isMove ? "move" : "weapon";
      slot.defIndex = entry.defIndex;
      slot.levelNum = entry.level;
      slot.label = def.name ?? def.id;
      slot.color = def.tags?.includes("damage:fire")
        ? "#ff7744"
        : def.tags?.includes("damage:light")
          ? "#ffe066"
          : def.isMove
            ? "#ffcc44"
            : "#6fb8ff";
      slot.glyph.textContent = (def.name ?? def.id).charAt(0).toUpperCase();
      slot.level.textContent = String(entry.level);
      slot.root.classList.remove("hud-slot-empty");
      slot.root.style.borderColor = def.isMove ? "#c8a44a" : slot.color;
      slot.root.style.background = `linear-gradient(160deg, ${slot.color}33, #0b1019 70%)`;
      slot.root.title = "";
    }
    slot.cooldown.style.height = `${slot.cooldownFrac * 100}%`;
  }

  private fillPassiveSlot(slot: SlotView, entry: LoadoutEntry): void {
    const def = this.passives[entry.defIndex];
    if (!def) {
      this.drawEmpty(slot);
      return;
    }
    const key = `p:${entry.defIndex}:${entry.level}`;
    if (slot.key !== key) {
      slot.key = key;
      slot.empty = false;
      slot.kind = "passive";
      slot.defIndex = entry.defIndex;
      slot.levelNum = entry.level;
      slot.label = def.name ?? def.id;
      slot.glyph.textContent = (def.name ?? def.id).charAt(0).toUpperCase();
      slot.level.textContent = String(entry.level);
      slot.root.classList.remove("hud-slot-empty");
      slot.root.style.borderColor = "#3c5870";
      slot.root.style.background = "linear-gradient(160deg, #1b3348, #0b1019 75%)";
    }
    slot.cooldown.style.height = "0%";
  }

  private drawEmpty(slot: SlotView): void {
    if (slot.empty && slot.key === "") return;
    slot.empty = true;
    slot.key = "";
    slot.defIndex = -1;
    slot.levelNum = 0;
    slot.cooldownFrac = 0;
    slot.label = "";
    slot.glyph.textContent = "";
    slot.level.textContent = "";
    slot.cooldown.style.height = "0%";
    slot.root.classList.add("hud-slot-empty");
    slot.root.style.borderColor = "";
    slot.root.style.background = "";
  }

  private showTooltip(slot: SlotView): void {
    if (slot.empty) {
      this.tooltip.style.display = "none";
      return;
    }
    this.refreshTooltip();
    this.tooltip.style.display = "block";
    this.positionTooltip();
  }

  private refreshTooltip(): void {
    const slot = this.hoverSlot;
    if (!slot || slot.empty) return;
    const info =
      slot.kind === "passive"
        ? (() => {
            const def = this.passives[slot.defIndex];
            return def ? passiveInfo(def, slot.levelNum) : null;
          })()
        : (() => {
            const def = this.weapons[slot.defIndex];
            return def ? weaponInfo(def, slot.levelNum, this.lastStats ?? undefined) : null;
          })();
    if (!info) return;
    this.tooltipTitle.textContent = info.title;
    this.tooltipTitle.style.color = info.color;
    this.tooltipSub.textContent = info.subtitle;
    this.tooltipDesc.textContent = info.description;
    this.tooltipLines.replaceChildren();
    for (const line of info.lines) {
      const row = el("div", "hud-tooltip-row");
      row.append(el("span", "hud-tooltip-label", line.label), el("span", "", line.value));
      this.tooltipLines.appendChild(row);
    }
  }

  private positionTooltip(): void {
    const pad = 14;
    this.tooltip.style.left = `${Math.min(window.innerWidth - 280, this.hoverX + pad)}px`;
    this.tooltip.style.top = `${Math.max(8, Math.min(window.innerHeight - 260, this.hoverY - 120))}px`;
  }

  private updateBoss(s: WorldSnapshot): void {
    const target = pickBossBar(s, this.enemies, this.localPlayerId);
    if (!target) {
      this.bossEl.style.display = "none";
      return;
    }
    this.bossEl.style.display = "block";
    this.bossName.textContent = target.name;
    this.bossName.classList.toggle("final", target.final);
    this.bossFill.style.width = `${
      target.maxHp > 0 ? Math.max(0, Math.min(1, target.hp / target.maxHp)) * 100 : 0
    }%`;
    this.bossFill.classList.toggle("final", target.final);
  }

  private renderParty(playerStore: WorldSnapshot["stores"][number] | undefined): void {
    const party =
      this.party.length > 0
        ? this.party
        : [
            {
              id: this.localPlayerId,
              name: "YOU",
              characterId: this.championId,
              ready: true,
            },
          ];
    if (party.length <= 1 && this.party.length <= 1) {
      this.partyEl.style.display = "none";
      return;
    }
    this.partyEl.style.display = "flex";
    this.partyEl.replaceChildren();
    for (const member of party) {
      const frame = el("div", "hud-party-frame");
      const color = colorHex(championColor(member.characterId));
      const dot = el("div", "hud-party-dot", (member.name || "?").charAt(0).toUpperCase());
      dot.style.borderColor = color;
      dot.style.color = color;
      const info = el("div", "hud-party-info");
      const name = el("div", "hud-party-name", member.name || "PLAYER");
      const sub = el("div", "hud-party-sub");
      const idx = playerStore ? playerStore.slots.indexOf(member.id) : -1;
      const level = idx >= 0 && playerStore ? (playerStore.fields.level[idx] ?? 1) : 1;
      const hp = idx >= 0 && playerStore ? (playerStore.fields.hp[idx] ?? 0) : 0;
      const max = idx >= 0 && playerStore ? (playerStore.fields.maxHp[idx] ?? 100) : 100;
      const downed = idx >= 0 && playerStore ? playerStore.fields.downed[idx] === 1 : false;
      const kills = idx >= 0 && playerStore ? Math.round(playerStore.fields.kills[idx] ?? 0) : 0;
      sub.textContent = downed ? "DOWNED" : `LV ${level}  ·  ${Math.ceil(hp)} HP  ·  ${kills} K`;
      if (downed) sub.classList.add("down");
      const hpTrack = el("div", "hud-party-hp-track");
      const hpFill = el("div", "hud-party-hp-fill");
      hpFill.style.width = `${Math.max(0, Math.min(1, max > 0 ? hp / max : 0)) * 100}%`;
      hpFill.style.background = color;
      hpTrack.appendChild(hpFill);
      info.append(name, sub, hpTrack);
      frame.append(dot, info);
      this.partyEl.appendChild(frame);
    }
  }

  private renderScoreboard(
    playerStore: WorldSnapshot["stores"][number] | undefined,
    stats: RunStats | null,
  ): void {
    this.scoreboardBody.replaceChildren();
    const header = el("div", "hud-score-row hud-score-head");
    header.append(
      el("span", "", "PLAYER"),
      el("span", "", "CHAMPION"),
      el("span", "", "LV"),
      el("span", "", "HP"),
      el("span", "", "KILLS"),
      el("span", "", "GOLD"),
    );
    this.scoreboardBody.appendChild(header);

    const party =
      this.party.length > 0
        ? this.party
        : [{ id: this.localPlayerId, name: "YOU", characterId: this.championId, ready: true }];
    for (const member of party) {
      const idx = playerStore ? playerStore.slots.indexOf(member.id) : -1;
      const row = el("div", "hud-score-row");
      if (member.id === this.localPlayerId) row.classList.add("you");
      const champion = this.characters.find((c) => c.id === member.characterId);
      row.append(
        el("span", "", member.name || "PLAYER"),
        el("span", "", champion?.name ?? member.characterId),
        el("span", "", String(idx >= 0 && playerStore ? (playerStore.fields.level[idx] ?? 1) : 1)),
        el(
          "span",
          "",
          `${Math.ceil(idx >= 0 && playerStore ? (playerStore.fields.hp[idx] ?? 0) : 0)}/${Math.ceil(
            idx >= 0 && playerStore ? (playerStore.fields.maxHp[idx] ?? 100) : 100,
          )}`,
        ),
        el(
          "span",
          "",
          String(Math.round(idx >= 0 && playerStore ? (playerStore.fields.kills[idx] ?? 0) : 0)),
        ),
        el(
          "span",
          "",
          String(Math.round(idx >= 0 && playerStore ? (playerStore.fields.gold[idx] ?? 0) : 0)),
        ),
      );
      this.scoreboardBody.appendChild(row);
    }

    this.scoreboardStats.replaceChildren();
    if (!stats) return;
    const pIdx = playerStore ? playerStore.slots.indexOf(this.localPlayerId) : -1;
    const totals = {
      kills: pIdx >= 0 && playerStore ? (playerStore.fields.kills[pIdx] ?? 0) : 0,
      gold: pIdx >= 0 && playerStore ? (playerStore.fields.gold[pIdx] ?? 0) : 0,
      maxHp: pIdx >= 0 && playerStore ? (playerStore.fields.maxHp[pIdx] ?? 0) : 0,
      chests: pIdx >= 0 && playerStore ? (playerStore.fields.chests[pIdx] ?? 0) : 0,
    };
    const formatted = formatStats(stats, totals);
    const grid = el("div", "hud-stat-grid");
    formatted.primary.forEach((row, i) => {
      const cell = el("div", "hud-stat-cell");
      cell.append(
        el("span", "hud-stat-label", PRIMARY_LABELS[i] ?? row.label),
        el("span", "hud-stat-value", row.value),
      );
      grid.appendChild(cell);
    });
    this.scoreboardStats.appendChild(grid);
    const footer = el("div", "hud-score-footer");
    footer.textContent = formatted.secondary
      .map((row) => `${row.label} ${row.value}`)
      .join("   ·   ");
    this.scoreboardStats.appendChild(footer);
  }
}
