// Client entry: pixel-perfect Pixi app + worker (solo) or server (co-op) sim host.
import { loadGamePack } from "@rift/content";
import type { SimEvent, WorldSnapshot } from "@rift/sim";
import { Application, Container } from "pixi.js";
import { AccountClient } from "./account";
import { AdminPanel } from "./admin";
import { Sfx } from "./audio";
import { Banner } from "./banner";
import { championColor } from "./champion-colors";
import { ConnectionLost } from "./connection-lost";
import { WorkerHost } from "./host";
import { Hud } from "./hud";
import { Input } from "./input";
import { LevelUpUI } from "./levelup";
import { Lobby } from "./lobby";
import { MetaScreen } from "./meta-screen";
import { awardRun, checkAchievements, computeMetaBonuses } from "./meta/meta";
import type { NetHost } from "./net-host";
import { PauseMenu } from "./pause-menu";
import { championRegions, isDarkinChampion } from "./regions";
import { GameRenderer, VIEW_H, VIEW_W } from "./renderer";
import { RunEndUI } from "./run-end";
import {
  loadSave,
  migrateSave,
  persistSave,
  resolveSelectedCharacter,
  setSaveSink,
} from "./save/save";
import { TouchControls } from "./touch-controls";

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

  const touchCapable =
    navigator.maxTouchPoints > 0 ||
    window.matchMedia("(pointer: coarse)").matches ||
    new URLSearchParams(window.location.search).has("touch");
  if (touchCapable) document.body.classList.add("touch-mode");

  const fitCanvas = (): void => {
    const viewport = window.visualViewport;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    const scale = Math.min(width / VIEW_W, height / VIEW_H);
    app.canvas.style.width = `${VIEW_W * scale}px`;
    app.canvas.style.height = `${VIEW_H * scale}px`;
    app.canvas.style.imageRendering = "pixelated";
  };
  window.addEventListener("resize", fitCanvas);
  window.addEventListener("orientationchange", fitCanvas);
  window.visualViewport?.addEventListener("resize", fitCanvas);
  fitCanvas();

  const pack = loadGamePack();
  // Content-driven free starter. Ahri is Common, so every region still has at
  // least one gacha target (Demacia/Lux included).
  const firstCharacter =
    pack.characters.find((c) => c.starter)?.id ?? pack.characters[0]?.id ?? "ahri";
  const firstStage = pack.stages?.[0]?.id ?? "rift-field";
  let save = loadSave(firstCharacter, firstStage);
  if (!pack.stages?.some((stage) => stage.id === save.selectedStage)) {
    save.selectedStage = firstStage;
  }

  // Restore the account session before building the menu. If the server is
  // offline or the player is a guest, the local save remains authoritative.
  const account = new AccountClient();
  const restored = await account.restore();
  if (restored?.save) {
    save = migrateSave(restored.save, firstCharacter, firstStage);
    save.profileName = restored.account.nickname;
    if (!pack.stages?.some((stage) => stage.id === save.selectedStage)) {
      save.selectedStage = firstStage;
    }
  } else if (restored) {
    save.profileName = restored.account.nickname;
  }
  if (account.account) {
    setSaveSink((next) => account.queueSave(next));
  }

  // Gacha-only unlock policy: no dev unlock-all. Existing saves can be reset
  // from Settings or the H admin panel to begin the collection fresh.
  resolveSelectedCharacter(save, firstCharacter);
  persistSave(save);
  if (account.account && !restored?.save) account.queueSave(save);

  const worldLayer = new Container();
  app.stage.addChild(worldLayer);

  const renderer = new GameRenderer(worldLayer, pack.weapons, pack.enemies, pack.stages ?? []);
  const hud = new Hud(pack.weapons, pack.passives, pack.enemies, pack.characters);
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
  let coopCharacterId = save.selectedCharacter;
  let currentMode: "solo" | "coop" = "solo";
  let currentCharacterId = save.selectedCharacter;
  let localPlayerId = 0;

  let touchControls: TouchControls | null = null;
  const levelUp = new LevelUpUI(pack.weapons, pack.passives);
  levelUp.onChoose((index) => {
    touchControls?.setActive(true);
    activeChoice?.(index);
  });
  levelUp.onReroll(() => activeReroll?.());
  levelUp.onSkip(() => {
    touchControls?.setActive(true);
    activeSkip?.();
  });
  levelUp.onBanish((index) => activeBanish?.(index));

  const runEnd = new RunEndUI();
  const banner = new Banner();
  const pauseMenu = new PauseMenu();
  const connectionLost = new ConnectionLost();
  let runEnded = false;
  let lastSnap: WorldSnapshot | null = null;
  let activeNetHost: NetHost | null = null;

  // F3 diagnostics overlay (FPS + live entity counts) for the M13 perf pass.
  const debugOverlay = document.createElement("div");
  debugOverlay.className = "debug-overlay";
  debugOverlay.style.display = "none";
  document.body.appendChild(debugOverlay);
  let debugFrames = 0;
  let debugElapsed = 0;
  let debugLast = performance.now();
  let frameErrorLogged = false;

  // Full-screen flash for the nuke pickup.
  const screenFlash = document.createElement("div");
  screenFlash.className = "screen-flash";
  document.body.appendChild(screenFlash);
  const flashScreen = (): void => {
    screenFlash.classList.remove("flash-on");
    void screenFlash.offsetWidth;
    screenFlash.classList.add("flash-on");
  };
  window.addEventListener("keydown", (e) => {
    if (e.key !== "F3") return;
    e.preventDefault();
    debugOverlay.style.display = debugOverlay.style.display === "none" ? "block" : "none";
  });

  const finishRun = (title = "DEFEAT", closeConnection = false): void => {
    if (runEnded || !lastSnap) return;
    runEnded = true;
    pauseMenu.hide();
    levelUp.hide();
    touchControls?.setActive(false);
    inputSender = null;
    activeChoice = null;
    activeReroll = null;
    activeSkip = null;
    activeBanish = null;
    if (closeConnection) {
      if (currentMode === "solo") host.pause();
      activeNetHost?.close();
      activeNetHost = null;
    }

    const snap = lastSnap;
    const playerStore = snap.stores.find((s) => s.kind === "player");
    const idx = playerStore ? playerStore.slots.indexOf(localPlayerId) : -1;
    const field = (name: string): number => {
      if (idx < 0 || !playerStore) return 0;
      return playerStore.fields[name]?.[idx] ?? 0;
    };
    const gold = Math.round(field("gold"));
    const kills = field("kills");
    const keysFound = field("keys");
    const chestsOpened = field("chestsOpened");
    const timeSec = Math.floor(snap.tick / 30);
    const runCharacter = pack.characters.find((champion) => champion.id === currentCharacterId);
    const runRegions = runCharacter ? championRegions(runCharacter) : ["Runeterra"];
    const result = {
      gold,
      kills,
      timeSec,
      won: false,
      keysFound,
      chestsOpened,
      bushesBroken: field("bushesBroken"),
      elitesKilled: field("elitesKilled"),
      bossesKilled: field("bossesKilled"),
      downs: field("downs"),
      coOp: currentMode === "coop",
      characterId: currentCharacterId,
      stageId: save.selectedStage,
      primaryRegion: runRegions[0] ?? "Runeterra",
      championRegions: runRegions,
      isDarkin: runCharacter ? isDarkinChampion(runCharacter) : false,
    };
    const keysBefore = save.keys;
    awardRun(save, result);
    const newAchievements = checkAchievements(save, result, pack.characters);
    const keysEarned = save.keys - keysBefore;
    persistSave(save);
    runEnd.show({
      title,
      time: formatTime(timeSec),
      kills,
      gold,
      keys: keysEarned,
      chestsOpened,
      newAchievements,
    });
  };

  const handleSnapshot = (snap: WorldSnapshot, events: SimEvent[]): void => {
    renderer.receive(snap, events);
    lastSnap = snap;
    levelUp.setStats(snap.playerStats[localPlayerId] ?? snap.playerStats[0] ?? null);
    for (const e of events) {
      if (e.type === "hit") sfx.play("hit");
      else if (e.type === "enemy-died") sfx.play("kill");
      else if (e.type === "gem-pickup") sfx.play("pickup");
      else if (e.type === "level-up") sfx.play("levelup");
      else if (e.type === "weapon-fire") sfx.play("fire");
      else if (e.type === "boss-rush") banner.show("BOSS RUSH");
      else if (e.type === "explosion") sfx.play("kill");
      else if (e.type === "bush-break") {
        if (e.playerId === localPlayerId) sfx.play("pickup");
      } else if (e.type === "key-found") {
        if (e.playerId === localPlayerId) {
          banner.show("KEY FOUND");
          sfx.play("chest");
        }
      } else if (e.type === "run-chest-spawn") {
        banner.show("CHEST SPAWNED");
      } else if (e.type === "run-chest-start") {
        if (e.playerId === localPlayerId) banner.show("OPENING CHEST");
      } else if (e.type === "run-chest-open") {
        if (e.playerId === localPlayerId) {
          banner.show(`CHEST +${e.xp} XP  +${e.gold} G${e.key ? "  +KEY" : ""}`);
          sfx.play("chest");
          renderer.addShake(2);
        }
      } else if (e.type === "nuke") {
        banner.show("NUKE");
        flashScreen();
        renderer.addShake(4);
        sfx.play("kill");
      } else if (e.type === "magnet") {
        if (e.playerId === localPlayerId) banner.show("MAGNET");
        sfx.play("pickup");
      } else if (e.type === "bomb") {
        if (e.playerId === localPlayerId) banner.show("BOMB");
        flashScreen();
        renderer.addShake(5);
        sfx.play("kill");
      } else if (e.type === "frost") {
        if (e.playerId === localPlayerId) banner.show("FROST");
        renderer.addShake(1);
        sfx.play("pickup");
      }
    }
    if (snap.over && !runEnded) finishRun("DEFEAT");
  };
  const onOffer = (offer: Parameters<typeof levelUp.show>[0]): void => {
    // Use the latest authoritative stats for card stat previews, even if the
    // offer arrives in the same network envelope as the preceding snapshot.
    touchControls?.setActive(false);
    levelUp.setStats(lastSnap?.playerStats[localPlayerId] ?? lastSnap?.playerStats[0] ?? null);
    levelUp.show(offer);
  };

  // Solo host (Web Worker).
  const host = new WorkerHost();
  host.onSnapshot(handleSnapshot);
  host.onOffer(onOffer);

  const metaScreen = new MetaScreen(
    save,
    pack.powerUps,
    pack.characters,
    pack.weapons,
    pack.stages ?? [],
    account,
  );
  new AdminPanel(save, pack.characters, pack.powerUps, () => metaScreen.refresh());
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
    lastSnap = null;
    activeNetHost = null;
    currentMode = "solo";
    currentCharacterId = characterId;
    localPlayerId = 0;
    metaScreen.hide();
    renderer.setLocalPlayer(localPlayerId);
    renderer.resetPrediction();
    renderer.setChampionColor(championColor(characterId));
    hud.setLocalPlayer(localPlayerId);
    hud.setChampion(characterId);
    hud.setParty([
      {
        id: 0,
        name: "YOU",
        characterId,
        ready: true,
      },
    ]);
    activeChoice = (i) => host.sendChoice(i);
    activeReroll = () => host.reroll();
    activeSkip = () => host.skip();
    activeBanish = (i) => host.banishOption(i);
    inputSender = (mx, my) => host.sendInput({ playerId: 0, moveX: mx, moveY: my });
    touchControls?.setActive(true);
    host.start(
      characterId,
      computeMetaBonuses(
        save,
        pack.powerUps,
        characterId,
        pack.characters.find((c) => c.id === characterId),
      ),
      save.selectedStage,
      // Fresh world generation every run; the sim stays deterministic per run.
      (Math.random() * 0xffffffff) >>> 0,
    );
  };

  metaScreen.onPlay(() => {
    metaScreen.hide();
    sfx.unlock();
    startSolo(save.selectedCharacter);
  });

  // Co-op host (WebSocket server).
  const serverUrl = import.meta.env.VITE_SERVER_URL ?? `ws://${location.hostname}:8787`;
  const lobby = new Lobby(serverUrl);
  lobby.onStart((netHost: NetHost, yourPlayerId: number) => {
    runEnded = false;
    lastSnap = null;
    activeNetHost = netHost;
    currentMode = "coop";
    currentCharacterId = coopCharacterId;
    localPlayerId = yourPlayerId;
    renderer.setLocalPlayer(localPlayerId);
    renderer.resetPrediction();
    renderer.setChampionColor(championColor(coopCharacterId));
    hud.setLocalPlayer(localPlayerId);
    hud.setChampion(coopCharacterId);
    netHost.onSnapshot(handleSnapshot);
    netHost.onOffer(onOffer);
    netHost.onReconnect((status) => {
      if (runEnded) return;
      if (status === "reconnected") {
        connectionLost.hide();
        levelUp.hide();
        touchControls?.setActive(true);
        renderer.resetPrediction();
      } else if (status === "lost") {
        connectionLost.show("CONNECTION LOST");
      } else {
        connectionLost.show("RECONNECTING...", "TRYING TO REJOIN THE ROOM...");
      }
    });
    activeChoice = (i) => netHost.sendChoice(i);
    activeReroll = () => netHost.sendReroll();
    activeSkip = () => netHost.sendSkip();
    activeBanish = (i) => netHost.sendBanish(i);
    inputSender = (mx, my) => netHost.sendInput({ playerId: yourPlayerId, moveX: mx, moveY: my });
    touchControls?.setActive(true);
  });
  metaScreen.onCoop(() => {
    metaScreen.hide();
    sfx.unlock();
    coopCharacterId = save.selectedCharacter;
    lobby.setCharacter(coopCharacterId);
    // The Showdown-style profile name is the identity used in the lobby; there
    // is no separate per-session name prompt.
    lobby.setName(save.profileName || "Summoner");
    lobby.setStage(save.selectedStage);
    lobby.setMetaBonuses(
      computeMetaBonuses(
        save,
        pack.powerUps,
        coopCharacterId,
        pack.characters.find((c) => c.id === coopCharacterId),
      ),
    );
    lobby.show();
  });
  lobby.onBack(() => metaScreen.show());
  lobby.onPlayers((players) => {
    hud.setParty(players);
  });

  runEnd.onContinue(() => {
    window.location.reload();
  });

  // Esc pause: solo freezes the sim; co-op keeps the authoritative server running.
  pauseMenu.onResume(() => {
    touchControls?.setActive(true);
    if (currentMode === "solo") host.resume();
  });
  pauseMenu.onRestart(() => {
    if (currentMode === "solo") startSolo(currentCharacterId);
  });
  pauseMenu.onQuit(() => {
    // Quitting is a loss, not a free exit: settle the current run and pay out
    // the gold/keys that were earned before the pause.
    if (!lastSnap) {
      window.location.reload();
      return;
    }
    finishRun("RUN ENDED", true);
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

  const togglePause = (): void => {
    if (!inputSender || levelUp.visible) return;
    if (pauseMenu.visible) {
      pauseMenu.hide();
      touchControls?.setActive(true);
      if (currentMode === "solo") host.resume();
    } else {
      pauseMenu.show(currentMode === "solo", save.settings);
      touchControls?.setActive(false);
      if (currentMode === "solo") host.pause();
    }
  };

  if (touchCapable) {
    touchControls = new TouchControls(input, {
      onPause: togglePause,
      onStats: () => hud.toggleStats(),
    });
  }

  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !inputSender || levelUp.visible) return;
    e.preventDefault();
    togglePause();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key !== "Tab" || !inputSender) return;
    e.preventDefault();
    hud.toggleStats();
  });

  window.setInterval(() => {
    if (!inputSender) return;
    const i = input.read();
    renderer.setLocalInput(i.moveX, i.moveY);
    inputSender(i.moveX, i.moveY);
  }, 1000 / 30);

  app.ticker.add(() => {
    try {
      renderer.tickPrediction(app.ticker.deltaMS);
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
