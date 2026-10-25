// Client entry: pixel-perfect Pixi app + worker (solo) or server (co-op) sim host.
import { loadGamePack } from "@rift/content";
import type { SimEvent, WorldSnapshot } from "@rift/sim";
import { Application, Container } from "pixi.js";
import { Sfx } from "./audio";
import { championColor } from "./champion-colors";
import { CharacterSelect } from "./charselect";
import { WorkerHost } from "./host";
import { Hud } from "./hud";
import { Input } from "./input";
import { LevelUpUI } from "./levelup";
import { Lobby } from "./lobby";
import { MetaScreen } from "./meta-screen";
import { awardRun, checkAchievements, computeMetaBonuses } from "./meta/meta";
import type { NetHost } from "./net-host";
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

  // Dev convenience: unlock every champion for playtesting (production keeps the gacha).
  if (import.meta.env.DEV) {
    let changed = false;
    for (const c of pack.characters) {
      if (!save.unlockedCharacters.includes(c.id)) {
        save.unlockedCharacters.push(c.id);
        changed = true;
      }
    }
    if (changed) persistSave(save);
  }

  const worldLayer = new Container();
  const hudLayer = new Container();
  app.stage.addChild(worldLayer);
  app.stage.addChild(hudLayer);

  const renderer = new GameRenderer(worldLayer, pack.weapons);
  const hud = new Hud(hudLayer);
  const input = new Input();
  input.attach();
  const sfx = new Sfx();

  // The active choice/input senders are swapped depending on solo vs co-op.
  let activeChoice: ((index: number) => void) | null = null;
  let inputSender: ((moveX: number, moveY: number) => void) | null = null;

  const levelUp = new LevelUpUI();
  levelUp.onChoose((index) => activeChoice?.(index));

  const runEnd = new RunEndUI();
  let runEnded = false;
  let lastSnap: WorldSnapshot | null = null;

  const handleSnapshot = (snap: WorldSnapshot, events: SimEvent[]): void => {
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
  };
  const onOffer = (offer: Parameters<typeof levelUp.show>[0]): void => levelUp.show(offer);

  // Solo host (Web Worker).
  const host = new WorkerHost();
  host.onSnapshot(handleSnapshot);
  host.onOffer(onOffer);

  const metaScreen = new MetaScreen(save, pack.powerUps, pack.characters);
  sfx.setVolume(save.settings.volume);
  renderer.setShake(save.settings.shake);
  metaScreen.onSettingsChange((settings) => {
    sfx.setVolume(settings.volume);
    renderer.setShake(settings.shake);
  });

  const startSolo = (characterId: string): void => {
    runEnded = false;
    metaScreen.hide();
    renderer.setChampionColor(championColor(characterId));
    activeChoice = (i) => host.sendChoice(i);
    inputSender = (mx, my) => host.sendInput({ playerId: 0, moveX: mx, moveY: my });
    host.start(characterId, computeMetaBonuses(save, pack.powerUps));
  };

  metaScreen.onPlay(() => {
    metaScreen.hide();
    sfx.unlock();
    const unlocked = pack.characters.filter((c) => save.unlockedCharacters.includes(c.id));
    const charSelect = new CharacterSelect(unlocked.length > 0 ? unlocked : pack.characters);
    charSelect.onChoose((id) => startSolo(id));
  });

  // Co-op host (WebSocket server).
  const serverUrl = import.meta.env.VITE_SERVER_URL ?? `ws://${location.hostname}:8787`;
  const lobby = new Lobby(serverUrl);
  lobby.onStart((netHost: NetHost) => {
    runEnded = false;
    netHost.onSnapshot(handleSnapshot);
    netHost.onOffer(onOffer);
    activeChoice = (i) => netHost.sendChoice(i);
    inputSender = (mx, my) => netHost.sendInput({ playerId: 0, moveX: mx, moveY: my });
  });
  metaScreen.onCoop(() => {
    metaScreen.hide();
    sfx.unlock();
    lobby.show();
  });

  runEnd.onContinue(() => {
    window.location.reload();
  });

  window.setInterval(() => {
    if (!inputSender) return;
    const i = input.read();
    inputSender(i.moveX, i.moveY);
  }, 1000 / 30);

  app.ticker.add(() => {
    renderer.render();
    if (lastSnap) hud.update(lastSnap);
  });
}

void main();
