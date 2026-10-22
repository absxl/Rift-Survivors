import { Application, Container, Graphics, Text } from "pixi.js";
import { t } from "./i18n";

const INTERNAL_W = 480;
const INTERNAL_H = 270;

async function main(): Promise<void> {
  const app = new Application();
  await app.init({
    width: INTERNAL_W,
    height: INTERNAL_H,
    resolution: 1,
    autoDensity: false,
    antialias: false,
    background: 0x0d0f1a,
  });

  const root = document.getElementById("app");
  if (root) root.appendChild(app.canvas);

  // Pixel-perfect: integer upscale with nearest-neighbour filtering, letterboxed.
  const fitCanvas = (): void => {
    const scale = Math.max(
      1,
      Math.floor(Math.min(window.innerWidth / INTERNAL_W, window.innerHeight / INTERNAL_H)),
    );
    app.canvas.style.width = `${INTERNAL_W * scale}px`;
    app.canvas.style.height = `${INTERNAL_H * scale}px`;
    app.canvas.style.imageRendering = "pixelated";
  };
  window.addEventListener("resize", fitCanvas);
  fitCanvas();

  // Placeholder scene (real rendering + movement arrives in M2).
  const world = new Container();
  app.stage.addChild(world);

  const player = new Graphics().rect(0, 0, 16, 16).fill(0x44aaff);
  player.position.set(INTERNAL_W / 2 - 8, INTERNAL_H / 2 - 8);
  world.addChild(player);

  const enemy = new Graphics().rect(0, 0, 16, 16).fill(0xff5544);
  enemy.position.set(60, 60);
  world.addChild(enemy);

  // HUD
  const title = new Text({
    text: t("game.title"),
    style: { fontFamily: "monospace", fontSize: 8, fill: 0xffffff },
  });
  title.position.set(2, 2);
  app.stage.addChild(title);

  const fpsText = new Text({
    text: t("hud.fps", { value: 0 }),
    style: { fontFamily: "monospace", fontSize: 8, fill: 0xffffff },
  });
  fpsText.position.set(2, 12);
  app.stage.addChild(fpsText);

  let frames = 0;
  let last = performance.now();
  app.ticker.add(() => {
    frames++;
    const now = performance.now();
    if (now - last >= 500) {
      fpsText.text = t("hud.fps", { value: Math.round((frames * 1000) / (now - last)) });
      frames = 0;
      last = now;
    }
  });
}

void main();
