// Client entry: pixel-perfect Pixi app + worker-hosted sim + meta screen + input.
import { loadGamePack } from "@rift/content";
import type { WorldSnapshot } from "@rift/sim";
import { Application, Container } from "pixi.js";
import { Sfx } from "./audio";
import { championColor } from "./champion-colors";
import { CharacterSelect } from "./charselect";
import { WorkerHost } from "./host";
import { Hud } from "./hud";
import { Input } from "./input";
import { LevelUpUI } from "./levelup";
import { MetaScreen } from "./meta-screen";
import { awardRun, checkAchievements, computeMetaBonuses } from "./meta/meta";
import { GameRenderer, VIEW_H, VIEW_W } from "./renderer";
import { RunEndUI } from "./run-end";
import { loadSave, persistSave } from "./save/save";

function formatTime(secs: number): string {
  const mm = Math.floor(secs / 60);
  const ss = secs % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

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

  const fitCanvas = (): void => {
    const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
    app.canvas.style.width = `${VIEW_W * scale}px`;
    app.canvas.style.height = `${VIEW_H * scale}px`;
    app.canvas.style.imageRendering = "pixelated";
  };
  window.addEventListener("resize", fitCanvas);
  fitCanvas();

  const pack = loadGamePack();
  const firstCharacter = pack.characters[0]?.id ?? "lux";
  const save = loadSave(firstCharacter);

  const worldLayer = new Container();
  const hudLayer = new Container();
  app.stage.addChild(worldLayer);
  app.stage.addChild(hudLayer);

  const renderer = new GameRenderer(worldLayer, pack.weapons);
  const hud = new Hud(hudLayer);
  const input = new Input();
  input.attach();

  const host = new WorkerHost();
  const sfx = new Sfx();
  const levelUp = new LevelUpUI();
  host.onOffer((offer) => levelUp.show(offer));
  levelUp.onChoose((index) => host.sendChoice(index));

  const runEnd = new RunEndUI();
  let runEnded = false;
  let lastSnap: WorldSnapshot | null = null;

  host.onSnapshot((snap, events) => {
    renderer.receive(snap, events);
    lastSnap = snap;
    for (const e of events) {
      if (e.type === "hit") sfx.play("hit");
      else if (e.type === "enemy-died") sfx.play("kill");
      else if (e.type === "gem-pickup") sfx.play("pickup");
      else if (e.type === "level-up") sfx.play("levelup");
      else if (e.type === "weapon-fire") sfx.play("fire");
    }
    if (snap.over && !runEnded) {
      runEnded = true;
      const playerStore = snap.stores.find((s) => s.kind === "player");
      const idx = playerStore ? playerStore.slots.indexOf(0) : -1;
      const gold = idx >= 0 && playerStore ? playerStore.fields.gold[idx] : 0;
      const kills = idx >= 0 && playerStore ? playerStore.fields.kills[idx] : 0;
      const timeSec = Math.floor(snap.tick / 30);
      const result = { gold, kills, timeSec, won: false };
      const chests = awardRun(save, result);
      const newAchievements = checkAchievements(save, result);
      persistSave(save);
      runEnd.show({ time: formatTime(timeSec), kills, gold, chests, newAchievements });
    }
  });

  const metaScreen = new MetaScreen(save, pack.powerUps, pack.characters);
  sfx.setVolume(save.settings.volume);
  renderer.setShake(save.settings.shake);
  metaScreen.onSettingsChange((settings) => {
    sfx.setVolume(settings.volume);
    renderer.setShake(settings.shake);
  });

  const startRun = (characterId: string): void => {
    runEnded = false;
    metaScreen.hide();
    renderer.setChampionColor(championColor(characterId));
    host.start(characterId, computeMetaBonuses(save, pack.powerUps));
  };

  metaScreen.onPlay(() => {
    metaScreen.hide();
    sfx.unlock();
    const unlocked = pack.characters.filter((c) => save.unlockedCharacters.includes(c.id));
    const charSelect = new CharacterSelect(unlocked.length > 0 ? unlocked : pack.characters);
    charSelect.onChoose((id) => startRun(id));
  });

  runEnd.onContinue(() => {
    window.location.reload();
  });

  window.setInterval(() => host.sendInput(input.read()), 1000 / 30);

  app.ticker.add(() => {
    renderer.render();
    if (lastSnap) hud.update(lastSnap);
  });
}

void main();
