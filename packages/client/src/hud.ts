// Screen-space HUD: timer, level, XP bar, and a game-over overlay.
import type { WorldSnapshot } from "@rift/sim";
import { Container, Graphics } from "pixi.js";
import { PixelText } from "./assets/pixel-font";
import { t } from "./i18n";
import { VIEW_H, VIEW_W } from "./renderer";

function formatTime(tick: number): string {
  const secs = Math.floor(tick / 30);
  const mm = Math.floor(secs / 60);
  const ss = secs % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

export class Hud {
  private readonly timer: PixelText;
  private readonly level: PixelText;
  private readonly xpBar: Graphics;
  private readonly results: Container;
  private readonly resultsTitle: PixelText;
  private readonly resultsTime: PixelText;
  private readonly resultsStats: PixelText;

  constructor(stage: Container) {
    this.xpBar = new Graphics();
    stage.addChild(this.xpBar);

    this.timer = new PixelText("0:00", 1);
    this.timer.display.anchor.set(0.5, 0);
    this.timer.display.position.set(VIEW_W / 2, 5);
    stage.addChild(this.timer.display);

    this.level = new PixelText(t("hud.level", { level: 1 }), 1);
    this.level.display.position.set(2, 5);
    stage.addChild(this.level.display);

    this.results = new Container();
    const bg = new Graphics().rect(0, 0, VIEW_W, VIEW_H).fill(0x000000);
    bg.alpha = 0.65;
    this.results.addChild(bg);
    this.resultsTitle = new PixelText("GAME OVER", 2, 0xff4444);
    this.resultsTitle.display.anchor.set(0.5, 0.5);
    this.resultsTitle.display.position.set(VIEW_W / 2, VIEW_H / 2 - 12);
    this.results.addChild(this.resultsTitle.display);
    this.resultsTime = new PixelText("", 1);
    this.resultsTime.display.anchor.set(0.5, 0.5);
    this.resultsTime.display.position.set(VIEW_W / 2, VIEW_H / 2 + 8);
    this.results.addChild(this.resultsTime.display);
    this.resultsStats = new PixelText("", 1);
    this.resultsStats.display.anchor.set(0.5, 0.5);
    this.resultsStats.display.position.set(VIEW_W / 2, VIEW_H / 2 + 18);
    this.results.addChild(this.resultsStats.display);
    this.results.visible = false;
    stage.addChild(this.results);
  }

  update(s: WorldSnapshot): void {
    this.timer.text = formatTime(s.tick);

    const playerStore = s.stores.find((st) => st.kind === "player");
    let level = 1;
    let xp = 0;
    let xpToNext = 1;
    let kills = 0;
    let gold = 0;
    if (playerStore) {
      const idx = playerStore.slots.indexOf(0);
      if (idx >= 0) {
        level = playerStore.fields.level[idx];
        xp = playerStore.fields.xp[idx];
        xpToNext = playerStore.fields.xpToNext[idx];
        kills = playerStore.fields.kills[idx];
        gold = playerStore.fields.gold[idx];
      }
    }

    this.level.text = t("hud.level", { level });

    const pct = xpToNext > 0 ? Math.max(0, Math.min(1, xp / xpToNext)) : 0;
    this.xpBar.clear();
    this.xpBar.rect(0, 0, VIEW_W, 4).fill(0x000000);
    this.xpBar.rect(1, 1, (VIEW_W - 2) * pct, 2).fill(0x44aaff);

    if (s.over) {
      this.results.visible = true;
      this.resultsTime.text = `TIME ${formatTime(s.tick)}  LV ${level}`;
      this.resultsStats.text = `KILLS ${kills}  GOLD ${gold}`;
    } else {
      this.results.visible = false;
    }
  }
}
