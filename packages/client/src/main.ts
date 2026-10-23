// Client entry: pixel-perfect Pixi app + worker-hosted sim + input + renderer.
import { Application, Container } from "pixi.js";
import { WorkerHost } from "./host";
import { Hud } from "./hud";
import { Input } from "./input";
import { LevelUpUI } from "./levelup";
import { GameRenderer, VIEW_H, VIEW_W } from "./renderer";

async function main(): Promise<void> {
  const app = new Application();
  await app.init({
    width: VIEW_W,
    height: VIEW_H,
    resolution: 1,
    autoDensity: false,
    antialias: false,
    background: 0x0d0f1a,
  });

  const root = document.getElementById("app");
  if (root) root.appendChild(app.canvas);

  // Pixel-perfect: integer upscale with nearest filtering, letterboxed.
  const fitCanvas = (): void => {
    const scale = Math.max(
      1,
      Math.floor(Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H)),
    );
    app.canvas.style.width = `${VIEW_W * scale}px`;
    app.canvas.style.height = `${VIEW_H * scale}px`;
    app.canvas.style.imageRendering = "pixelated";
  };
  window.addEventListener("resize", fitCanvas);
  fitCanvas();

  const worldLayer = new Container();
  const hudLayer = new Container();
  app.stage.addChild(worldLayer);
  app.stage.addChild(hudLayer);

  const renderer = new GameRenderer(worldLayer);
  const hud = new Hud(hudLayer);
  const input = new Input();
  input.attach();

  const host = new WorkerHost();
  host.onSnapshot((snap, events) => renderer.receive(snap, events));

  const levelUp = new LevelUpUI();
  host.onOffer((offer) => levelUp.show(offer));
  levelUp.onChoose((index) => host.sendChoice(index));

  window.setInterval(() => host.sendInput(input.read()), 1000 / 30);

  app.ticker.add(() => {
    renderer.render();
    const snap = renderer.latest;
    if (snap) hud.update(snap);
  });
}

void main();
