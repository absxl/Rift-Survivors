import type { WorldSnapshot } from "@rift/sim";
// Screen-space HUD skeleton: timer, level, and a placeholder XP bar.
import { type Container, Graphics, Text } from "pixi.js";
import { t } from "./i18n";
import { VIEW_W } from "./renderer";

export class Hud {
  private readonly timer: Text;
  private readonly level: Text;
  private readonly xpBar: Graphics;

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
  }

  update(s: WorldSnapshot): void {
    const secs = Math.floor(s.tick / 30);
    const mm = Math.floor(secs / 60);
    const ss = secs % 60;
    this.timer.text = `${mm}:${ss.toString().padStart(2, "0")}`;
    this.level.text = t("hud.level", { level: 1 });

    this.xpBar.clear();
    this.xpBar.rect(0, 0, VIEW_W, 4).fill(0x000000);
    this.xpBar.rect(1, 1, VIEW_W - 2, 2).fill(0x1d2a3a);
  }
}
