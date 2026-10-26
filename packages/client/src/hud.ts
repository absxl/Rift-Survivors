// League-style in-game hotbar drawn inside the pixel canvas (bottom of the screen):
// champion portrait + level, HP/XP bars, ability icons (weapons) with cooldowns,
// item icons (passives), and hover tooltips.
import type { EnemyDef, PassiveDef, WeaponDef, WorldSnapshot } from "@rift/sim";
import { Container, Graphics } from "pixi.js";
import { PixelText } from "./assets/pixel-font";
import { pickBossBar } from "./hud-boss";
import { ownedIndices } from "./loadout";
import { VIEW_H, VIEW_W } from "./renderer";
import { PRIMARY_LABELS, formatStats } from "./stats-format";

const PANEL_TOP = 216;
const PORTRAIT_X = 6;
const PORTRAIT_Y = 222;
const PORTRAIT = 26;
const BAR_X = 38;
const BAR_TOP = 222;
const BAR_W = 130;
const HP_H = 7;
const XP_H = 5;
const ABILITY_X = 176;
const ABILITY_Y = 226;
const ABILITY_SIZE = 22;
const ABILITY_GAP = 4;
const ABILITY_COUNT = 4;
const ITEM_X = 290;
const ITEM_Y = 232;
const ITEM_SIZE = 15;
const ITEM_GAP = 3;
const ITEM_COUNT = 8;
const STATS_W = 300;
const STATS_H = 116;
const STATS_ROW_TOP = 20;
const STATS_ROW_H = 10;
const STATS_COL_X = [6, 154];
const STATS_VALUE_X = [144, 294];
const STATS_FOOTER_Y = 104;

function weaponColor(def: WeaponDef | undefined): number {
  const tags = def?.tags ?? [];
  if (tags.includes("damage:fire")) return 0xff6633;
  if (tags.includes("damage:arcane")) return 0xaa66ff;
  if (tags.includes("damage:light")) return 0xffe066;
  if (tags.includes("damage:physical")) return 0xccd0dc;
  return 0x4488cc;
}

interface IconSlot {
  root: Container;
  bg: Graphics;
  cooldown: Graphics;
  initial: PixelText;
  level: PixelText;
  x: number;
  y: number;
  size: number;
  label: string | null;
  levelNum: number;
  cooldownFrac: number;
  color: number;
}

export class Hud {
  private readonly timer: PixelText;
  private readonly panel: Graphics;
  private readonly portrait: Graphics;
  private readonly portraitText: PixelText;
  private readonly levelText: PixelText;
  private readonly hpBar: Graphics;
  private readonly xpBar: Graphics;
  private readonly abilitySlots: IconSlot[] = [];
  private readonly itemSlots: IconSlot[] = [];
  private readonly tooltip: Container;
  private readonly tooltipBg: Graphics;
  private readonly tooltipText: PixelText;
  private readonly statsPanel: Container;
  private readonly statsPrimaryValues: PixelText[] = [];
  private readonly statsFooter: PixelText;
  private statsVisible = false;
  private readonly bossPanel: Container;
  private readonly bossName: PixelText;
  private readonly bossBar: Graphics;

  private readonly weapons: WeaponDef[];
  private readonly passives: PassiveDef[];
  private localPlayerId = 0;
  private championInitial = "?";
  private championColor = 0x44aaff;
  private pointerX = -1;
  private pointerY = -1;
  private pointerOver = false;

  constructor(
    stage: Container,
    weapons: WeaponDef[],
    passives: PassiveDef[],
    private readonly enemies: EnemyDef[],
  ) {
    this.weapons = weapons;
    this.passives = passives;

    this.panel = new Graphics();
    stage.addChild(this.panel);

    this.portrait = new Graphics();
    stage.addChild(this.portrait);
    this.portraitText = new PixelText("", 2);
    this.portraitText.display.anchor.set(0.5, 0.5);
    stage.addChild(this.portraitText.display);
    this.levelText = new PixelText("1", 1);
    this.levelText.display.anchor.set(0.5, 0.5);
    stage.addChild(this.levelText.display);

    this.hpBar = new Graphics();
    stage.addChild(this.hpBar);
    this.xpBar = new Graphics();
    stage.addChild(this.xpBar);

    for (let i = 0; i < ABILITY_COUNT; i++) {
      this.abilitySlots.push(
        this.createSlot(
          stage,
          ABILITY_X + i * (ABILITY_SIZE + ABILITY_GAP),
          ABILITY_Y,
          ABILITY_SIZE,
          ["Q", "W", "E", "R"][i],
        ),
      );
    }
    for (let i = 0; i < ITEM_COUNT; i++) {
      this.itemSlots.push(
        this.createSlot(stage, ITEM_X + i * (ITEM_SIZE + ITEM_GAP), ITEM_Y, ITEM_SIZE, null),
      );
    }

    this.tooltip = new Container();
    this.tooltipBg = new Graphics();
    this.tooltip.addChild(this.tooltipBg);
    this.tooltipText = new PixelText("", 1);
    this.tooltip.addChild(this.tooltipText.display);
    this.tooltip.visible = false;
    stage.addChild(this.tooltip);

    this.timer = new PixelText("0:00", 1);
    this.timer.display.anchor.set(0.5, 0);
    this.timer.display.position.set(VIEW_W / 2, 5);
    stage.addChild(this.timer.display);

    // Tab stats panel (upper-left; hidden by default).
    this.statsPanel = new Container();
    this.statsPanel.position.set(6, 36);
    this.statsPanel.visible = false;
    stage.addChild(this.statsPanel);

    const statsBg = new Graphics();
    statsBg.rect(0, 0, STATS_W, STATS_H).fill({ color: 0x0a0e16, alpha: 0.94 });
    statsBg.rect(0, 0, STATS_W, STATS_H).stroke({ width: 1, color: 0x3a5a7a });
    statsBg.rect(0, 0, STATS_W, 2).fill(0x3a5a7a);
    this.statsPanel.addChild(statsBg);

    const statsTitle = new PixelText("STATS", 1, 0xffcc44);
    statsTitle.display.position.set(6, 5);
    this.statsPanel.addChild(statsTitle.display);

    const closeHint = new PixelText("TAB: CLOSE", 1, 0x6a8090);
    closeHint.display.anchor.set(1, 0);
    closeHint.display.position.set(STATS_W - 6, 5);
    this.statsPanel.addChild(closeHint.display);

    PRIMARY_LABELS.forEach((label, i) => {
      const col = i < 8 ? 0 : 1;
      const y = STATS_ROW_TOP + (i % 8) * STATS_ROW_H;
      const text = new PixelText(label, 1, 0x8ab0c0);
      text.display.position.set(STATS_COL_X[col], y);
      this.statsPanel.addChild(text.display);
      const value = new PixelText("", 1);
      value.display.anchor.set(1, 0);
      value.display.position.set(STATS_VALUE_X[col], y);
      this.statsPanel.addChild(value.display);
      this.statsPrimaryValues.push(value);
    });

    this.statsFooter = new PixelText("", 1, 0x8ab0c0);
    this.statsFooter.display.position.set(6, STATS_FOOTER_Y);
    this.statsPanel.addChild(this.statsFooter.display);

    // Top-center boss/final-threat overlay bar.
    this.bossPanel = new Container();
    this.bossPanel.visible = false;
    stage.addChild(this.bossPanel);
    this.bossName = new PixelText("", 1, 0xffcc44);
    this.bossName.display.anchor.set(0.5, 0);
    this.bossName.display.position.set(VIEW_W / 2, 16);
    this.bossPanel.addChild(this.bossName.display);
    this.bossBar = new Graphics();
    this.bossPanel.addChild(this.bossBar);
  }

  setLocalPlayer(playerId: number): void {
    this.localPlayerId = playerId;
  }

  setChampion(id: string, color: number): void {
    this.championInitial = id ? id.charAt(0).toUpperCase() : "?";
    this.championColor = color;
  }

  setPointer(x: number, y: number, over: boolean): void {
    this.pointerX = x;
    this.pointerY = y;
    this.pointerOver = over;
  }

  /** Toggle the Tab stats panel. */
  toggleStats(): void {
    this.statsVisible = !this.statsVisible;
    this.statsPanel.visible = this.statsVisible;
  }

  private createSlot(
    stage: Container,
    x: number,
    y: number,
    size: number,
    label: string | null,
  ): IconSlot {
    const root = new Container();
    root.position.set(x, y);
    stage.addChild(root);
    const bg = new Graphics();
    root.addChild(bg);
    const cooldown = new Graphics();
    root.addChild(cooldown);
    const initial = new PixelText("", 1);
    initial.display.anchor.set(0.5, 0.5);
    initial.display.position.set(size / 2, size / 2 - 1);
    root.addChild(initial.display);
    const level = new PixelText("", 1);
    level.display.anchor.set(1, 1);
    level.display.position.set(size - 1, size);
    root.addChild(level.display);
    return {
      root,
      bg,
      cooldown,
      initial,
      level,
      x,
      y,
      size,
      label,
      levelNum: 0,
      cooldownFrac: 0,
      color: 0x223344,
    };
  }

  update(s: WorldSnapshot): void {
    const secs = Math.floor(s.tick / 30);
    this.timer.text = `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, "0")}`;

    // Panel + bars.
    this.panel.clear();
    this.panel
      .rect(0, PANEL_TOP, VIEW_W, VIEW_H - PANEL_TOP)
      .fill({ color: 0x0a0e16, alpha: 0.92 });
    this.panel.rect(0, PANEL_TOP, VIEW_W, 2).fill(0x3a5a7a);

    const playerStore = s.stores.find((st) => st.kind === "player");
    const pIdx = playerStore ? playerStore.slots.indexOf(this.localPlayerId) : -1;
    const hp = pIdx >= 0 && playerStore ? playerStore.fields.hp[pIdx] : 100;
    const maxHp = pIdx >= 0 && playerStore ? playerStore.fields.maxHp[pIdx] : 100;
    const kills = pIdx >= 0 && playerStore ? playerStore.fields.kills[pIdx] : 0;
    const gold = pIdx >= 0 && playerStore ? playerStore.fields.gold[pIdx] : 0;
    const chests = pIdx >= 0 && playerStore ? playerStore.fields.chests[pIdx] : 0;

    this.hpBar.clear();
    this.hpBar.rect(BAR_X, BAR_TOP, BAR_W, HP_H).fill(0x000000);
    this.hpBar
      .rect(BAR_X + 1, BAR_TOP + 1, (BAR_W - 2) * Math.max(0, Math.min(1, hp / maxHp)), HP_H - 2)
      .fill(0x33cc55);

    const xpPct = s.partyXpToNext > 0 ? Math.max(0, Math.min(1, s.partyXp / s.partyXpToNext)) : 0;
    this.xpBar.clear();
    this.xpBar.rect(BAR_X, BAR_TOP + HP_H + 2, BAR_W, XP_H).fill(0x000000);
    this.xpBar.rect(BAR_X + 1, BAR_TOP + HP_H + 3, (BAR_W - 2) * xpPct, XP_H - 2).fill(0x3fa9ff);

    // Portrait + level.
    this.portrait.clear();
    this.portrait.rect(PORTRAIT_X, PORTRAIT_Y, PORTRAIT, PORTRAIT).fill(this.championColor);
    this.portrait
      .rect(PORTRAIT_X, PORTRAIT_Y, PORTRAIT, PORTRAIT)
      .stroke({ width: 2, color: 0x0a0e16 });
    this.portraitText.text = this.championInitial;
    this.portraitText.display.position.set(
      PORTRAIT_X + PORTRAIT / 2,
      PORTRAIT_Y + PORTRAIT / 2 - 1,
    );
    this.levelText.text = String(s.partyLevel);
    this.levelText.display.position.set(PORTRAIT_X + PORTRAIT - 6, PORTRAIT_Y + PORTRAIT - 5);

    // Loadout (local player).
    const weaponStore = s.stores.find((st) => st.kind === "weapon");
    const passiveStore = s.stores.find((st) => st.kind === "passive");
    const ownedWeapons = ownedIndices(weaponStore, this.localPlayerId);
    const ownedPassives = ownedIndices(passiveStore, this.localPlayerId);

    this.fillWeaponSlot(this.abilitySlots[0], ownedWeapons[0]);
    this.fillWeaponSlot(this.abilitySlots[1], ownedWeapons[1]);
    this.fillWeaponSlot(this.abilitySlots[2], ownedWeapons[2]);
    this.fillWeaponSlot(this.abilitySlots[3], ownedWeapons[3]);

    const itemDefs = [
      ...ownedWeapons.slice(4, 6).map((w) => ({ kind: "weapon" as const, ...w })),
      ...ownedPassives.map((p) => ({ kind: "passive" as const, ...p })),
    ];
    this.itemSlots.forEach((slot, i) => {
      const entry = itemDefs[i];
      if (!entry) {
        this.drawEmpty(slot);
      } else if (entry.kind === "weapon") {
        this.fillWeaponSlot(slot, entry);
      } else {
        this.fillPassiveSlot(slot, entry);
      }
    });

    this.updateTooltip();

    if (this.statsVisible) {
      const stats = s.playerStats[this.localPlayerId] ?? s.playerStats[0];
      if (stats) {
        const { primary, secondary } = formatStats(stats, {
          kills,
          gold,
          maxHp,
          chests,
        });
        primary.forEach((row, i) => {
          const value = this.statsPrimaryValues[i];
          if (value) value.text = row.value;
        });
        this.statsFooter.text = secondary.map((r) => `${r.label} ${r.value}`).join("  ");
      }
    }

    this.updateBossBar(s);
  }

  /** Top-center boss/final-threat HP bar (nearest to the local player). */
  private updateBossBar(s: WorldSnapshot): void {
    const target = pickBossBar(s, this.enemies, this.localPlayerId);
    if (!target) {
      this.bossPanel.visible = false;
      return;
    }
    this.bossPanel.visible = true;
    const color = target.final ? 0xcc66ff : 0xff6644;
    this.bossName.text = target.name;
    this.bossName.display.tint = color;

    const x = 120;
    const y = 26;
    const w = 240;
    const h = 8;
    const pct = target.maxHp > 0 ? Math.max(0, Math.min(1, target.hp / target.maxHp)) : 0;
    this.bossBar.clear();
    this.bossBar.rect(x - 2, y - 2, w + 4, h + 4).fill({ color: 0x0a0e16, alpha: 0.92 });
    this.bossBar.rect(x - 2, y - 2, w + 4, h + 4).stroke({ width: 1, color: 0x3a5a7a });
    this.bossBar.rect(x, y, w, h).fill(0x222c38);
    if (pct > 0) this.bossBar.rect(x, y, w * pct, h).fill(color);
  }

  private fillWeaponSlot(
    slot: IconSlot,
    entry: { defIndex: number; level: number; cooldown: number } | undefined,
  ): void {
    if (!entry) {
      this.drawEmpty(slot);
      return;
    }
    const def = this.weapons[entry.defIndex];
    const color = weaponColor(def);
    const base = def?.base.cooldown ?? 1;
    const frac = base > 0 ? Math.max(0, Math.min(1, entry.cooldown / base)) : 0;
    this.drawSlot(slot, def?.id ?? "?", entry.level, color, frac);
    slot.cooldownFrac = frac;
    slot.label = def?.id ?? null;
  }

  private fillPassiveSlot(slot: IconSlot, entry: { defIndex: number; level: number }): void {
    const def = this.passives[entry.defIndex];
    this.drawSlot(slot, def?.id ?? "?", entry.level, 0x66aaff, 0);
    slot.cooldownFrac = 0;
    slot.label = def?.id ?? null;
  }

  private drawSlot(
    slot: IconSlot,
    id: string,
    level: number,
    color: number,
    cooldownFrac: number,
  ): void {
    const size = slot.size;
    slot.bg.clear();
    slot.bg.rect(0, 0, size, size).fill(color);
    slot.bg.rect(0, 0, size, size).stroke({ width: 1, color: 0x0a0e16 });
    slot.initial.text = id.charAt(0).toUpperCase();
    slot.level.text = String(level);
    slot.levelNum = level;
    slot.color = color;
    slot.cooldown.clear();
    if (cooldownFrac > 0.01) {
      slot.cooldown.rect(0, 0, size, size * cooldownFrac).fill({ color: 0x000000, alpha: 0.6 });
    }
  }

  private drawEmpty(slot: IconSlot): void {
    const size = slot.size;
    slot.bg.clear();
    slot.bg.rect(0, 0, size, size).fill(0x111a26);
    slot.bg.rect(0, 0, size, size).stroke({ width: 1, color: 0x2a3a4a });
    slot.initial.text = "";
    slot.level.text = "";
    slot.levelNum = 0;
    slot.cooldown.clear();
    slot.label = null;
  }

  private updateTooltip(): void {
    if (!this.pointerOver) {
      this.tooltip.visible = false;
      return;
    }
    const slot = this.slotAt(this.pointerX, this.pointerY);
    if (!slot || !slot.label) {
      this.tooltip.visible = false;
      return;
    }
    const label = `${slot.label.toUpperCase()}  LV ${slot.levelNum}`;
    this.tooltipText.text = label;
    this.tooltipBg.clear();
    this.tooltipBg.rect(0, 0, label.length * 6 + 6, 12).fill({ color: 0x0a0e16, alpha: 0.95 });
    this.tooltipBg.rect(0, 0, label.length * 6 + 6, 12).stroke({ width: 1, color: 0x3a5a7a });
    this.tooltipText.display.position.set(3, 2);
    const tx = Math.min(VIEW_W - (label.length * 6 + 8), this.pointerX + 6);
    const ty = Math.max(2, this.pointerY - 18);
    this.tooltip.position.set(tx, ty);
    this.tooltip.visible = true;
  }

  private slotAt(x: number, y: number): IconSlot | null {
    for (const slot of [...this.abilitySlots, ...this.itemSlots]) {
      if (x >= slot.x && x <= slot.x + slot.size && y >= slot.y && y <= slot.y + slot.size) {
        return slot;
      }
    }
    return null;
  }
}
