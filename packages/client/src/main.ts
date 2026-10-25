// Client entry: pixel-perfect Pixi app + worker (solo) or server (co-op) sim host.
import { loadGamePack } from "@rift/content";
import type { SimEvent, WorldSnapshot } from "@rift/sim";
import { Application, Container } from "pixi.js";
import { Sfx } from "./audio";
import { Banner } from "./banner";
import { championColor } from "./champion-colors";
import { CharacterSelect } from "./charselect";
import { ConnectionLost } from "./connection-lost";
import { WorkerHost } from "./host";
import { Hud } from "./hud";
import { Input } from "./input";
import { LevelUpUI } from "./levelup";
import { Lobby } from "./lobby";
import { MetaScreen } from "./meta-screen";
import { awardRun, checkAchievements, computeMetaBonuses } from "./meta/meta";
import { NameScreen } from "./name-screen";
import type { NetHost } from "./net-host";
import { PauseMenu } from "./pause-menu";
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
  const hud = new Hud(hudLayer, pack.weapons, pack.passives);
  const input = new Input();
  input.attach();
  input.setKeybinds(save.settings.keybinds);
  const sfx = new Sfx();

  // The active choice/input senders are swapped depending on solo vs co-op.
  let activeChoice: ((index: number) => void) | null = null;
  let activeReroll: (() => void) | null = null;
  let activeSkip: (() => void) | null = null;
  let activeBanish: ((index: number) => void) | null = null;
  let inputSender: ((moveX: number, moveY: number) => void) | null = null;
  let coopCharacterId = firstCharacter;
  let currentMode: "solo" | "coop" = "solo";
  let currentCharacterId = firstCharacter;
  let localPlayerId = 0;

  const levelUp = new LevelUpUI();
  levelUp.onChoose((index) => activeChoice?.(index));
  levelUp.onReroll(() => activeReroll?.());
  levelUp.onSkip(() => activeSkip?.());
  levelUp.onBanish((index) => activeBanish?.(index));

  const runEnd = new RunEndUI();
  const banner = new Banner();
  const nameScreen = new NameScreen();
  const pauseMenu = new PauseMenu();
  const connectionLost = new ConnectionLost();
  let runEnded = false;
  let lastSnap: WorldSnapshot | null = null;

  // F3 diagnostics overlay (FPS + live entity counts) for the M13 perf pass.
  const debugOverlay = document.createElement("div");
  debugOverlay.className = "debug-overlay";
  debugOverlay.style.display = "none";
  document.body.appendChild(debugOverlay);
  let debugFrames = 0;
  let debugElapsed = 0;
  let debugLast = performance.now();
  let frameErrorLogged = false;
  window.addEventListener("keydown", (e) => {
    if (e.key !== "F3") return;
    e.preventDefault();
    debugOverlay.style.display = debugOverlay.style.display === "none" ? "block" : "none";
  });

  const handleSnapshot = (snap: WorldSnapshot, events: SimEvent[]): void => {
    renderer.receive(snap, events);
    lastSnap = snap;
    for (const e of events) {
      if (e.type === "hit") sfx.play("hit");
      else if (e.type === "enemy-died") sfx.play("kill");
      else if (e.type === "gem-pickup") sfx.play("pickup");
      else if (e.type === "level-up") sfx.play("levelup");
      else if (e.type === "weapon-fire") sfx.play("fire");
      else if (e.type === "boss-rush") banner.show("BOSS RUSH");
    }
    if (snap.over && !runEnded) {
      runEnded = true;
      const playerStore = snap.stores.find((s) => s.kind === "player");
      const idx = playerStore ? playerStore.slots.indexOf(localPlayerId) : -1;
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
  renderer.setDamageNumbers(save.settings.damageNumbers);
  metaScreen.onSettingsChange((settings) => {
    sfx.setVolume(settings.volume);
    renderer.setShake(settings.shake);
    renderer.setDamageNumbers(settings.damageNumbers);
    input.setKeybinds(settings.keybinds);
  });

  const startSolo = (characterId: string): void => {
    runEnded = false;
    currentMode = "solo";
    currentCharacterId = characterId;
    localPlayerId = 0;
    metaScreen.hide();
    renderer.setLocalPlayer(localPlayerId);
    renderer.setChampionColor(championColor(characterId));
    hud.setLocalPlayer(localPlayerId);
    hud.setChampion(characterId, championColor(characterId));
    activeChoice = (i) => host.sendChoice(i);
    activeReroll = () => host.reroll();
    activeSkip = () => host.skip();
    activeBanish = (i) => host.banishOption(i);
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
  lobby.onStart((netHost: NetHost, yourPlayerId: number) => {
    runEnded = false;
    currentMode = "coop";
    localPlayerId = yourPlayerId;
    renderer.setLocalPlayer(localPlayerId);
    renderer.setChampionColor(championColor(coopCharacterId));
    hud.setLocalPlayer(localPlayerId);
    hud.setChampion(coopCharacterId, championColor(coopCharacterId));
    netHost.onSnapshot(handleSnapshot);
    netHost.onOffer(onOffer);
    netHost.onClose(() => {
      if (!runEnded) connectionLost.show();
    });
    activeChoice = (i) => netHost.sendChoice(i);
    activeReroll = () => netHost.sendReroll();
    activeSkip = () => netHost.sendSkip();
    activeBanish = (i) => netHost.sendBanish(i);
    inputSender = (mx, my) => netHost.sendInput({ playerId: yourPlayerId, moveX: mx, moveY: my });
  });
  metaScreen.onCoop(() => {
    metaScreen.hide();
    sfx.unlock();
    const unlocked = pack.characters.filter((c) => save.unlockedCharacters.includes(c.id));
    const charSelect = new CharacterSelect(unlocked.length > 0 ? unlocked : pack.characters);
    charSelect.onChoose((id) => {
      coopCharacterId = id;
      nameScreen.show();
    });
  });
  nameScreen.onConfirm((name) => {
    lobby.setCharacter(coopCharacterId);
    lobby.setName(name);
    lobby.show();
  });

  runEnd.onContinue(() => {
    window.location.reload();
  });

  // Esc pause: solo freezes the sim; co-op keeps the authoritative server running.
  pauseMenu.onResume(() => {
    if (currentMode === "solo") host.resume();
  });
  pauseMenu.onRestart(() => {
    if (currentMode === "solo") startSolo(currentCharacterId);
  });
  pauseMenu.onQuit(() => {
    window.location.reload();
  });
  pauseMenu.onSettingsChange((settings) => {
    save.settings.volume = settings.volume;
    save.settings.shake = settings.shake;
    save.settings.damageNumbers = settings.damageNumbers;
    persistSave(save);
    sfx.setVolume(settings.volume);
    renderer.setShake(settings.shake);
    renderer.setDamageNumbers(settings.damageNumbers);
  });

  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !inputSender) return;
    e.preventDefault();
    if (pauseMenu.visible) {
      pauseMenu.hide();
      if (currentMode === "solo") host.resume();
    } else {
      pauseMenu.show(currentMode === "solo", save.settings);
      if (currentMode === "solo") host.pause();
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key !== "Tab" || !inputSender) return;
    e.preventDefault();
    hud.toggleStats();
  });

  window.setInterval(() => {
    if (!inputSender) return;
    const i = input.read();
    inputSender(i.moveX, i.moveY);
  }, 1000 / 30);

  app.canvas.addEventListener("pointermove", (e) => {
    const rect = app.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    const y = ((e.clientY - rect.top) / rect.height) * VIEW_H;
    hud.setPointer(x, y, true);
  });
  app.canvas.addEventListener("pointerleave", () => hud.setPointer(0, 0, false));

  app.ticker.add(() => {
    try {
      renderer.render();
      if (lastSnap) hud.update(lastSnap);

      debugFrames++;
      const now = performance.now();
      debugElapsed += now - debugLast;
      debugLast = now;
      if (debugElapsed >= 500) {
        const fps = Math.round((debugFrames * 1000) / debugElapsed);
        debugFrames = 0;
        debugElapsed = 0;
        if (debugOverlay.style.display !== "none") {
          const count = (kind: string): number =>
            lastSnap?.stores.find((s) => s.kind === kind)?.slots.length ?? 0;
          debugOverlay.textContent = `FPS ${fps}  TICK ${lastSnap?.tick ?? 0}  ENEMY ${count("enemy")}  PROJ ${count("projectile")}  GEM ${count("gem")}`;
        }
      }
    } catch (err) {
      // A single bad frame must not silently freeze the whole game.
      if (!frameErrorLogged) {
        frameErrorLogged = true;
        console.error("[client] frame error", err);
        debugOverlay.style.display = "block";
        debugOverlay.textContent = "FRAME ERROR — SEE CONSOLE";
      }
    }
  });
}

void main();
