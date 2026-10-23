import type { WorldSnapshot } from "@rift/sim";
// Screen-space HUD: timer, level, XP bar placeholder, and a game-over overlay.
import { Container, Graphics, Text } from "pixi.js";
import { t } from "./i18n";
import { VIEW_H, VIEW_W } from "./renderer";

function formatTime(tick: number): string {
  const secs = Math.floor(tick / 30);
  const mm = Math.floor(secs / 60);
  const ss = secs % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

export class Hud {
  private readonly timer: Text;
  private readonly level: Text;
  private readonly xpBar: Graphics;
  private readonly results: Container;
  private readonly resultsTitle: Text;
  private readonly resultsTime: Text;

  constructor(stage: Container) {
    this.xpBar = new Graphics();
    stage.addChild(this.xpBar);

    this.timer = new Text({
      text: "0:00",
      style: { fontFamily: "monospace", fontSize: 8, fill: 0xffffff },
    });
    this.timer.anchor.set(0.5, 0);
    this.timer.position.set(VIEW_W / 2, 5);
    stage.addChild(this.timer);

    this.level = new Text({
      text: t("hud.level", { level: 1 }),
      style: { fontFamily: "monospace", fontSize: 8, fill: 0xffffff },
    });
    this.level.position.set(2, 5);
    stage.addChild(this.level);

    this.results = new Container();
    const bg = new Graphics().rect(0, 0, VIEW_W, VIEW_H).fill(0x000000);
    bg.alpha = 0.65;
    this.results.addChild(bg);
    this.resultsTitle = new Text({
      text: "GAME OVER",
      style: { fontFamily: "monospace", fontSize: 16, fill: 0xff4444 },
    });
    this.resultsTitle.anchor.set(0.5, 0.5);
    this.resultsTitle.position.set(VIEW_W / 2, VIEW_H / 2 - 12);
    this.results.addChild(this.resultsTitle);
    this.resultsTime = new Text({
      text: "",
      style: { fontFamily: "monospace", fontSize: 8, fill: 0xffffff },
    });
    this.resultsTime.anchor.set(0.5, 0.5);
    this.resultsTime.position.set(VIEW_W / 2, VIEW_H / 2 + 8);
    this.results.addChild(this.resultsTime);
    this.results.visible = false;
    stage.addChild(this.results);
  }

  update(s: WorldSnapshot): void {
    this.timer.text = formatTime(s.tick);

    const playerStore = s.stores.find((st) => st.kind === "player");
    let level = 1;
    let xp = 0;
    let xpToNext = 1;
    if (playerStore) {
      const idx = playerStore.slots.indexOf(0);
      if (idx >= 0) {
        level = playerStore.fields.level[idx];
        xp = playerStore.fields.xp[idx];
        xpToNext = playerStore.fields.xpToNext[idx];
      }
    }

    this.level.text = t("hud.level", { level });

    const pct = xpToNext > 0 ? Math.max(0, Math.min(1, xp / xpToNext)) : 0;
    this.xpBar.clear();
    this.xpBar.rect(0, 0, VIEW_W, 4).fill(0x000000);
    this.xpBar.rect(1, 1, (VIEW_W - 2) * pct, 2).fill(0x44aaff);

    if (s.over) {
      this.results.visible = true;
      this.resultsTime.text = `Survived ${formatTime(s.tick)}`;
    } else {
      this.results.visible = false;
    }
  }
}
