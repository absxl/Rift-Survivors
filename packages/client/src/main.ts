// Client entry: pixel-perfect Pixi app + worker (solo) or server (co-op) sim host.
import { loadGamePack } from "@rift/content";
import type { SimEvent, WorldSnapshot } from "@rift/sim";
import { Application, Container } from "pixi.js";
import { AccountClient } from "./account";
import { AdminPanel } from "./admin";
import { preloadChampionArt } from "./assets/champion-sprites";
import { Music, Sfx } from "./audio";
import { Banner } from "./banner";
import { championColor } from "./champion-colors";
import { ConnectionLost } from "./connection-lost";
import { WorkerHost } from "./host";
import { Hud } from "./hud";
import { Input } from "./input";
import { KillStreakTracker } from "./juice";
import { LevelUpUI } from "./levelup";
import { Lobby } from "./lobby";
import { MetaScreen } from "./meta-screen";
import { GameShell } from "./meta/boot";
import { awardRun, checkAchievements, computeMetaBonuses } from "./meta/meta";
import type { NetHost } from "./net-host";
import { PauseMenu } from "./pause-menu";
import { championRegions, isDarkinChampion } from "./regions";
import { GameRenderer, SCREEN_H, SCREEN_W, ZOOM } from "./renderer";
import { RunEndUI } from "./run-end";
import {
  loadSave,
  migrateSave,
  persistSave,
  resolveSelectedCharacter,
  setSaveSink,
} from "./save/save";
import { ShopUI } from "./shop";
import { TouchControls } from "./touch-controls";

function formatTime(secs: number): string {
  const mm = Math.floor(secs / 60);
  const ss = secs % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

async function main(): Promise<void> {
  const app = new Application();
  await app.init({
    width: SCREEN_W,
    height: SCREEN_H,
    resolution: 1,
    autoDensity: false,
    antialias: true,
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
    const scale = Math.min(width / SCREEN_W, height / SCREEN_H);
    app.canvas.style.width = `${SCREEN_W * scale}px`;
    app.canvas.style.height = `${SCREEN_H * scale}px`;
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

  // Official-art icon sprites for the whole roster (fallbacks cover misses).
  await preloadChampionArt(
    pack.characters.map((c) => c.id),
    save.equippedSkin,
  );
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

  // HD canvas: world units are scaled up; sim math and camera stay in units.
  const worldLayer = new Container();
  worldLayer.scale.set(ZOOM);
  app.stage.addChild(worldLayer);

  const renderer = new GameRenderer(worldLayer, pack.abilities, pack.enemies, pack.stages ?? []);
  const hud = new Hud(
    pack.abilities,
    pack.passives,
    pack.enemies,
    pack.characters,
    pack.items ?? [],
  );
  const shop = new ShopUI();
  shop.setItems(pack.items ?? []);
  // The rebindable shop key toggles the shop unless a level-up offer owns
  // the keyboard (B = banish there).
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && shop.isOpen) {
      shop.hide();
      return;
    }
    const key = e.key.toLowerCase();
    if ((key === save.settings.shopKey || key === "p") && !levelUp.visible && !runEnded) {
      e.preventDefault();
      shop.toggle();
    }
  });
  hud.onOpenShop(() => {
    if (!runEnded) shop.toggle();
  });
  shop.setCallbacks({
    onBuy: (itemId: string) => shopSender?.({ type: "buy", itemId }),
    onCombine: (itemId: string) => shopSender?.({ type: "combine", itemId }),
    onSell: (slot: number) => shopSender?.({ type: "sell", slot }),
  });
  const input = new Input();
  input.attach();
  input.setKeybinds(save.settings.keybinds);
  const sfx = new Sfx();
  const music = new Music();

  // The active choice/input senders are swapped depending on solo vs co-op.
  let activeChoice: ((index: number) => void) | null = null;
  let activeReroll: (() => void) | null = null;
  let activeSkip: (() => void) | null = null;
  let activeBanish: ((index: number) => void) | null = null;
  let inputSender: ((moveX: number, moveY: number) => void) | null = null;
  // Shop actions route to whichever host is authoritative right now.
  let shopSender:
    | ((msg: { type: "buy" | "combine" | "sell"; itemId?: string; slot?: number }) => void)
    | null = null;
  let coopCharacterId = save.selectedCharacter;
  let currentMode: "solo" | "coop" = "solo";
  let currentCharacterId = save.selectedCharacter;
  let localPlayerId = 0;

  let touchControls: TouchControls | null = null;
  const levelUp = new LevelUpUI(pack.abilities, pack.passives);
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
  const killStreaks = new KillStreakTracker();
  const knownBossSlots = new Set<string>();
  let bossBaselineDone = false;
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
  const fpsOverlay = {
    setVisible(visible: boolean): void {
      debugOverlay.style.display = visible ? "block" : "none";
    },
  };

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
    const essenceFound = field("essence");
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
    // Blue Essence settles here: unspent run essence becomes the skin currency.
    save.blueEssence += essenceFound;
    persistSave(save);
    runEnd.show({
      title,
      time: formatTime(timeSec),
      kills,
      gold,
      keys: keysEarned,
      chestsOpened,
      newAchievements,
      essence: essenceFound,
    });
  };

  const handleSnapshot = (snap: WorldSnapshot, events: SimEvent[]): void => {
    shop.update(snap);
    music.setIntensity(Math.min(1, (snap.partyLevel - 1) / 20));
    renderer.receive(snap, events);
    lastSnap = snap;
    levelUp.setStats(snap.playerStats[localPlayerId] ?? snap.playerStats[0] ?? null);
    // Boss intro: a boss/final-threat slot that wasn't seen before gets a
    // full-screen announcement + shockwave (D-061). Bosses alive in the very
    // first snapshot (reconnect into a live run) stay silent.
    const enemyStore = snap.stores.find((st) => st.kind === "enemy");
    if (enemyStore) {
      const bossSlots: { key: string; name: string; x: number; y: number }[] = [];
      for (let i = 0; i < enemyStore.slots.length; i++) {
        const def = pack.enemies[enemyStore.fields.kind[i]];
        if (!def || (def.category !== "boss" && def.category !== "final-threat")) continue;
        bossSlots.push({
          key: `${enemyStore.slots[i]}:${enemyStore.generations[i]}`,
          name: def.name ?? def.id.toUpperCase(),
          x: enemyStore.fields.x[i],
          y: enemyStore.fields.y[i],
        });
      }
      if (!bossBaselineDone) {
        for (const boss of bossSlots) knownBossSlots.add(boss.key);
        bossBaselineDone = true;
      } else {
        for (const boss of bossSlots) {
          if (knownBossSlots.has(boss.key)) continue;
          knownBossSlots.add(boss.key);
          banner.show(`⚠ ${boss.name} ⚠`);
          renderer.bossIntro(boss.x, boss.y);
          sfx.play("chest");
        }
      }
    }
    for (const e of events) {
      if (e.type === "hit") sfx.play("hit");
      else if (e.type === "enemy-died") {
        sfx.play("kill");
        // Kill streaks + kill burst (all cosmetic).
        const streak = killStreaks.registerKill(snap.tick * 33);
        if (streak) banner.show(streak);
        renderer.spawnBurst(e.x, e.y, 0xff9e2c, 6);
      } else if (e.type === "gem-pickup") {
        sfx.play("pickup");
      } else if (e.type === "level-up") {
        sfx.play("levelup");
        const players = snap.stores.find((st) => st.kind === "player");
        const idx = players ? players.slots.indexOf(localPlayerId) : -1;
        if (players && idx >= 0) {
          renderer.addRing(players.fields.x[idx], players.fields.y[idx], 0xff9e2c, 70, 18);
          renderer.spawnBurst(players.fields.x[idx], players.fields.y[idx], 0xffdf9b, 12);
        }
      } else if (e.type === "ability-fire") sfx.play("fire");
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
    pack.abilities,
    pack.stages ?? [],
    account,
  );
  const admin = new AdminPanel(save, pack.characters, pack.powerUps, () => metaScreen.refresh());
  admin.onRunGold = (amount: number) => host.grantRunGold?.(amount);
  const applyVolumes = (): void => {
    sfx.setVolume(save.settings.sfx * save.settings.volume);
    music.setVolume(save.settings.music * save.settings.volume);
  };
  applyVolumes();
  renderer.setShake(save.settings.shake);
  renderer.setDamageNumbers(save.settings.damageNumbers);
  metaScreen.onSettingsChange((settings) => {
    sfx.setVolume(settings.sfx * settings.volume);
    music.setVolume(settings.music * settings.volume);
    renderer.setShake(settings.shake);
    renderer.setDamageNumbers(settings.damageNumbers);
    input.setKeybinds(settings.keybinds);
    fpsOverlay.setVisible(settings.showFps);
  });

  /** Stage intro card: name + lore line when a run begins (D-051). */
  const showStageIntro = (stageId?: string): void => {
    const stage = (pack.stages ?? []).find((s) => s.id === stageId);
    if (!stage) return;
    banner.show(`${stage.name} — ${stage.description}`, 4200);
  };

  const startSolo = (characterId: string): void => {
    runEnded = false;
    lastSnap = null;
    activeNetHost = null;
    currentMode = "solo";
    killStreaks.reset();
    knownBossSlots.clear();
    bossBaselineDone = false;
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
    renderer.setPartyChampions([
      { id: 0, characterId, class: pack.characters.find((c) => c.id === characterId)?.class },
    ]);
    activeChoice = (i) => host.sendChoice(i);
    activeReroll = () => host.reroll();
    activeSkip = () => host.skip();
    activeBanish = (i) => host.banishOption(i);
    inputSender = (mx, my) => host.sendInput({ playerId: 0, moveX: mx, moveY: my });
    shopSender = (msg) => host.sendShop(msg);
    shop.setLocalPlayer(0);
    showStageIntro(save.selectedStage);
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
    const ctx = sfx.context();
    if (ctx) music.start(ctx);
    startSolo(save.selectedCharacter);
  });

  // Co-op host (WebSocket server).
  const serverUrl = import.meta.env.VITE_SERVER_URL ?? `ws://${location.hostname}:8787`;
  const lobby = new Lobby(serverUrl);
  lobby.onStart((netHost: NetHost, yourPlayerId: number) => {
    runEnded = false;
    lastSnap = null;
    killStreaks.reset();
    knownBossSlots.clear();
    bossBaselineDone = false;
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
    shopSender = (msg) => netHost.sendShop(msg);
    shop.setLocalPlayer(yourPlayerId);
    showStageIntro(save.selectedStage);
    touchControls?.setActive(true);
  });
  metaScreen.onCoop(() => {
    metaScreen.hide();
    sfx.unlock();
    const ctx = sfx.context();
    if (ctx) music.start(ctx);
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
    renderer.setPartyChampions(
      players.map((p) => ({
        id: p.id,
        characterId: p.characterId,
        class: pack.characters.find((c) => c.id === p.characterId)?.class,
      })),
    );
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
    Object.assign(save.settings, settings);
    persistSave(save);
    applyVolumes();
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

  // Game shell: boot + title over the hub (D-056). The hub renders beneath;
  // the title dissolves into it on first input.
  const shell = new GameShell({
    onAudioUnlock: () => sfx.unlock(),
    onStart: () => shell.dismissTitle(),
    splashIds:
      save.unlockedCharacters.length > 0
        ? save.unlockedCharacters
        : ["ahri", "lux", "darius", "jinx"],
  });
  shell.play();
  shell.dismissBoot();

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
