import type {
  AbilityDef,
  EnemyDef,
  SimEvent,
  StageDef,
  StoreSnapshot,
  WorldSnapshot,
} from "@rift/sim";
import {
  SPAWN_CLEARING_RADIUS,
  TERRAIN_TILE,
  TILE_LIQUID,
  TILE_WALL,
  TerrainField,
} from "@rift/sim";
// Pixel-perfect renderer: draws the world from snapshots with a camera locked to
// the local player, interpolating between the two most recent snapshots. Also
// renders projectiles, hit flashes and pooled damage numbers from sim events.
import { Container, Graphics, Sprite, TilingSprite } from "pixi.js";
import type { Texture } from "pixi.js";
import { championSprite } from "./assets/champion-sprites";
import { enemySprite } from "./assets/enemy-sprites";
import { renderPixelTextSprite } from "./assets/pixel-font";
import {
  type PlaceholderTextures,
  createPlaceholderTextures,
  createTerrainGroundTexture,
} from "./assets/placeholder";

/** World units visible per axis (camera math operates in world units). */
export const VIEW_W = 800;
export const VIEW_H = 450;
/** Canvas is HD; the world container scales world units to screen pixels. */
export const ZOOM = 2;
export const SCREEN_W = VIEW_W * ZOOM;
export const SCREEN_H = VIEW_H * ZOOM;

const MAX_DAMAGE = 96;
const FLASH_FRAMES = 5;
// Pickup kind → tint (heal, vacuum, nuke, freeze, chest, gold).
const PICKUP_COLORS = [
  0x44ff66, 0x44ffff, 0xff8844, 0x4488ff, 0xffcc44, 0xffdd44, 0xffd66b, 0x7fe8ff, 0xff6b3d,
];

function getStore(s: WorldSnapshot, kind: string): StoreSnapshot | undefined {
  return s.stores.find((st) => st.kind === kind);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function colorValue(hex: string): number {
  return Number.parseInt(hex.replace("#", ""), 16) || 0;
}

interface PlayerView {
  x: number;
  y: number;
  fx: number;
  fy: number;
  hp: number;
  maxHp: number;
}

interface DamageEntry {
  sprite: Sprite;
  x: number;
  y: number;
  life: number;
}

interface FireEffect {
  kind: "arc" | "ring";
  x: number;
  y: number;
  angle: number;
  arc: number;
  radius: number;
  life: number;
  maxLife: number;
  color: number;
}

export class GameRenderer {
  private prev: WorldSnapshot | null = null;
  private curr: WorldSnapshot | null = null;
  private prevTime = 0;
  private currTime = 0;
  private events: SimEvent[] = [];

  private readonly ground: TilingSprite;
  private readonly terrainGraphics: Graphics;
  private terrain: TerrainField | null = null;
  private terrainStageId = "";
  private terrainSeed = -1;
  private readonly groundTextures = new Map<string, Texture>();
  private readonly playerLayer: Container;
  private readonly playerHpBar: Graphics;
  private readonly playerSprites = new Map<number, Sprite>();
  private readonly championTextures = new Map<number, Texture>();
  private readonly playerBaseScale = new Map<number, number>();
  private localPlayerId = 0;
  private readonly bushLayer: Container;
  private readonly gemLayer: Container;
  private readonly pickupLayer: Container;
  private readonly chestLayer: Container;
  private readonly projectileLayer: Container;
  private readonly enemyLayer: Container;
  private readonly bushSprites = new Map<number, Sprite>();
  private readonly gemSprites = new Map<number, Sprite>();
  private readonly pickupSprites = new Map<number, Sprite>();
  private readonly chestSprites = new Map<number, Sprite>();
  private readonly chestGraphics: Graphics;
  private readonly projectileSprites = new Map<number, Sprite>();
  private readonly enemySprites = new Map<number, Sprite>();
  private readonly enemyFlash = new Map<number, number>();
  private readonly enemyBaseScale = new Map<number, number>();
  private readonly enemyHpBar: Graphics;
  private readonly zoneGraphics: Graphics;
  private readonly hazardGraphics: Graphics;
  private readonly fxGraphics: Graphics;
  private readonly damage: DamageEntry[] = [];
  private readonly effects: FireEffect[] = [];
  private readonly textures: PlaceholderTextures;
  private shake = 0;
  private shakeEnabled = true;
  private damageNumbersEnabled = true;
  private championColor = 0x44aaff;
  private localInputX = 0;
  private localInputY = 0;
  private predictionX = 0;
  private predictionY = 0;
  private predictionSpeed = 2.5;

  private stageId = "";
  private readonly stageDefs: StageDef[];

  constructor(
    private readonly stage: Container,
    private readonly abilities: AbilityDef[],
    private readonly enemies: EnemyDef[],
    stageDefs: StageDef[] = [],
  ) {
    this.stageDefs = stageDefs;
    this.textures = createPlaceholderTextures();

    this.ground = new TilingSprite({
      texture: this.textures.ground,
      width: VIEW_W,
      height: VIEW_H,
    });
    this.stage.addChild(this.ground);
    this.terrainGraphics = new Graphics();
    this.stage.addChild(this.terrainGraphics);

    this.bushLayer = new Container();
    this.gemLayer = new Container();
    this.pickupLayer = new Container();
    this.chestLayer = new Container();
    this.projectileLayer = new Container();
    this.enemyLayer = new Container();
    this.stage.addChild(this.bushLayer);
    this.stage.addChild(this.gemLayer);
    this.stage.addChild(this.pickupLayer);
    this.stage.addChild(this.chestLayer);
    this.stage.addChild(this.projectileLayer);
    this.stage.addChild(this.enemyLayer);

    this.chestGraphics = new Graphics();
    this.chestLayer.addChild(this.chestGraphics);
    this.enemyHpBar = new Graphics();
    this.enemyLayer.addChild(this.enemyHpBar);

    this.zoneGraphics = new Graphics();
    this.gemLayer.addChild(this.zoneGraphics);
    this.hazardGraphics = new Graphics();
    this.gemLayer.addChild(this.hazardGraphics);

    this.fxGraphics = new Graphics();
    this.enemyLayer.addChild(this.fxGraphics);

    this.playerLayer = new Container();
    this.stage.addChild(this.playerLayer);
    this.playerHpBar = new Graphics();
    this.playerLayer.addChild(this.playerHpBar);
  }

  get latest(): WorldSnapshot | null {
    return this.curr;
  }

  /** Apply a stage's presentation palette without restarting the renderer. */
  setStage(stageId: string | undefined): void {
    const next = stageId ?? "";
    if (next === this.stageId) return;
    this.stageId = next;
    const stage = this.stageDefs.find((candidate) => candidate.id === next);
    if (stage?.terrain) {
      let texture = this.groundTextures.get(stage.id);
      if (!texture) {
        texture = createTerrainGroundTexture(stage.terrain.colors);
        this.groundTextures.set(stage.id, texture);
      }
      this.ground.texture = texture;
      this.ground.tint = 0xffffff;
    } else {
      this.ground.texture = this.textures.ground;
      this.ground.tint = stage?.palette.background ?? 0xffffff;
    }
  }

  private syncTerrain(s: WorldSnapshot): void {
    if (this.terrainStageId === s.stageId && this.terrainSeed === s.terrainSeed) return;
    this.terrainStageId = s.stageId;
    this.terrainSeed = s.terrainSeed;
    const stage = this.stageDefs.find((candidate) => candidate.id === s.stageId);
    this.terrain = stage?.terrain
      ? new TerrainField(stage.terrain, s.terrainSeed ?? 0, [
          { x: s.worldWidth / 2, y: s.worldHeight / 2, radius: SPAWN_CLEARING_RADIUS },
        ])
      : null;
  }

  receive(s: WorldSnapshot, events: SimEvent[]): void {
    this.setStage(s.stageId);
    this.syncTerrain(s);
    this.prev = this.curr;
    this.curr = s;
    this.prevTime = this.currTime;
    this.currTime = performance.now();
    this.events = events;
    // Reconcile the local prediction toward the authoritative frame.
    this.predictionX *= 0.6;
    this.predictionY *= 0.6;
    const stats = s.playerStats[this.localPlayerId] ?? s.playerStats[0];
    if (stats) this.predictionSpeed = stats.moveSpeedPx;
  }

  /** Feed the local input to the visual prediction (called from the input loop). */
  setLocalInput(moveX: number, moveY: number): void {
    const len = Math.hypot(moveX, moveY);
    this.localInputX = len > 1 ? moveX / len : moveX;
    this.localInputY = len > 1 ? moveY / len : moveY;
  }

  resetPrediction(): void {
    this.localInputX = 0;
    this.localInputY = 0;
    this.predictionX = 0;
    this.predictionY = 0;
  }

  /**
   * Small input lead so the local player responds before the next snapshot.
   * Purely visual (the server stays authoritative) and capped to 6px; it decays
   * when input stops or when snapshots stop arriving (pause/offer/disconnect).
   */
  tickPrediction(deltaMs: number): void {
    const stale = performance.now() - this.currTime > 120;
    const step = Math.max(0, Math.min(2, deltaMs / (1000 / 30)));
    if (stale || (this.localInputX === 0 && this.localInputY === 0)) {
      this.predictionX *= stale ? 0.5 : 0.75;
      this.predictionY *= stale ? 0.5 : 0.75;
    } else {
      this.predictionX += this.localInputX * this.predictionSpeed * step;
      this.predictionY += this.localInputY * this.predictionSpeed * step;
    }
    const max = 6;
    const mag = Math.hypot(this.predictionX, this.predictionY);
    if (mag > max) {
      this.predictionX = (this.predictionX / mag) * max;
      this.predictionY = (this.predictionY / mag) * max;
    }
    if (Math.abs(this.predictionX) < 0.01) this.predictionX = 0;
    if (Math.abs(this.predictionY) < 0.01) this.predictionY = 0;
  }

  private alpha(): number {
    if (!this.prev || !this.curr) return 1;
    const span = this.currTime - this.prevTime;
    if (span <= 0) return 0;
    return Math.max(0, Math.min(1, (performance.now() - this.prevTime) / span));
  }

  private playerField(s: WorldSnapshot): PlayerView | null {
    const store = getStore(s, "player");
    if (!store) return null;
    const idx = store.slots.indexOf(this.localPlayerId);
    if (idx < 0) return null;
    return {
      x: store.fields.x[idx],
      y: store.fields.y[idx],
      fx: store.fields.facingX[idx],
      fy: store.fields.facingY[idx],
      hp: store.fields.hp[idx],
      maxHp: store.fields.maxHp[idx],
    };
  }

  private playerPosition(): PlayerView | null {
    if (!this.curr) return null;
    const cur = this.playerField(this.curr);
    if (!cur) return null;
    const prev = this.prev ? this.playerField(this.prev) : null;
    if (!prev) return cur;
    const a = this.alpha();
    return { ...cur, x: lerp(prev.x, cur.x, a), y: lerp(prev.y, cur.y, a) };
  }

  render(): void {
    if (!this.curr) return;

    const player = this.playerPosition();

    // Camera follows the player (infinite map — no bounds clamp) + optional shake.
    const camX = player ? player.x + this.predictionX : 0;
    const camY = player ? player.y + this.predictionY : 0;
    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeEnabled && this.shake > 0) {
      shakeX = (Math.random() - 0.5) * this.shake;
      shakeY = (Math.random() - 0.5) * this.shake;
      this.shake *= 0.85;
      if (this.shake < 0.15) this.shake = 0;
    }

    const ox = Math.round(camX - VIEW_W / 2 + shakeX);
    const oy = Math.round(camY - VIEW_H / 2 + shakeY);

    // Process events → hit flash, damage numbers, ability-fire visuals, shake.
    for (const e of this.events) {
      if (e.type === "hit") {
        if (e.target === "enemy") this.enemyFlash.set(e.targetSlot, FLASH_FRAMES);
        this.spawnDamage(e.x, e.y, e.amount);
        this.shake = Math.min(4, this.shake + 0.6);
      } else if (e.type === "ability-fire") {
        this.spawnFireEffect(e.abilityId, e.angle);
      } else if (e.type === "bush-break") {
        this.effects.push({
          kind: "ring",
          x: e.x,
          y: e.y,
          angle: 0,
          arc: 0,
          radius: 14,
          life: 10,
          maxLife: 10,
          color: 0x69d98c,
        });
      } else if (e.type === "magnet") {
        this.effects.push({
          kind: "ring",
          x: e.x,
          y: e.y,
          angle: 0,
          arc: 0,
          radius: 72,
          life: 20,
          maxLife: 20,
          color: 0x7fe8ff,
        });
      } else if (e.type === "bomb") {
        this.effects.push({
          kind: "ring",
          x: e.x,
          y: e.y,
          angle: 0,
          arc: 0,
          radius: 180,
          life: 18,
          maxLife: 18,
          color: 0xff6b3d,
        });
        this.shake = Math.min(4, this.shake + 1.4);
      } else if (e.type === "frost") {
        this.effects.push({
          kind: "ring",
          x: e.x,
          y: e.y,
          angle: 0,
          arc: 0,
          radius: 58,
          life: 22,
          maxLife: 22,
          color: 0x8fdcff,
        });
      } else if (e.type === "run-chest-open") {
        this.effects.push({
          kind: "ring",
          x: e.x,
          y: e.y,
          angle: 0,
          arc: 0,
          radius: e.key ? 42 : 28,
          life: 18,
          maxLife: 18,
          color: e.key ? 0xffd86b : 0xffcc66,
        });
      } else if (e.type === "explosion") {
        this.effects.push({
          kind: "ring",
          x: e.x,
          y: e.y,
          angle: 0,
          arc: 0,
          radius: e.radius,
          life: 12,
          maxLife: 12,
          color: 0xff8844,
        });
        this.shake = Math.min(4, this.shake + 0.8);
      } else if (e.type === "enemy-heal") {
        this.effects.push({
          kind: "ring",
          x: e.x,
          y: e.y,
          angle: 0,
          arc: 0,
          radius: e.radius,
          life: 18,
          maxLife: 18,
          color: 0x6fe39a,
        });
      } else if (e.type === "enemy-shield") {
        this.effects.push({
          kind: "ring",
          x: e.x,
          y: e.y,
          angle: 0,
          arc: 0,
          radius: e.radius,
          life: 18,
          maxLife: 18,
          color: 0x7fc8ff,
        });
      }
    }

    this.ground.tilePosition.set(-ox, -oy);
    this.drawTerrain(ox, oy);
    this.bushLayer.position.set(-ox, -oy);
    this.gemLayer.position.set(-ox, -oy);
    this.pickupLayer.position.set(-ox, -oy);
    this.chestLayer.position.set(-ox, -oy);
    this.projectileLayer.position.set(-ox, -oy);
    this.enemyLayer.position.set(-ox, -oy);

    this.drawZones();
    this.drawHazards();
    this.drawEffects();

    this.syncBushes(
      getStore(this.curr, "bush"),
      this.prev ? getStore(this.prev, "bush") : undefined,
    );
    this.syncEntities(
      this.gemSprites,
      this.gemLayer,
      getStore(this.curr, "gem"),
      this.prev ? getStore(this.prev, "gem") : undefined,
      this.textures.gem,
    );
    this.syncPickups(
      getStore(this.curr, "pickup"),
      this.prev ? getStore(this.prev, "pickup") : undefined,
    );
    this.syncChests(
      getStore(this.curr, "chest"),
      this.prev ? getStore(this.prev, "chest") : undefined,
    );
    const projectiles = getStore(this.curr, "projectile");
    this.syncEntities(
      this.projectileSprites,
      this.projectileLayer,
      projectiles,
      this.prev ? getStore(this.prev, "projectile") : undefined,
      this.textures.projectile,
      (i) => (projectiles?.fields.mode[i] === 5 ? 0xff6666 : 0xffffff),
    );
    this.syncEnemies(
      getStore(this.curr, "enemy"),
      this.prev ? getStore(this.prev, "enemy") : undefined,
    );

    // Enemy hit flash (brief scale pop), preserving per-type base scale.
    for (const [slot, sprite] of this.enemySprites) {
      const flash = this.enemyFlash.get(slot) ?? 0;
      const base = this.enemyBaseScale.get(slot) ?? 1;
      if (flash > 0) {
        sprite.scale.set(base * 1.15);
        this.enemyFlash.set(slot, flash - 1);
      } else {
        sprite.scale.set(base);
        this.enemyFlash.delete(slot);
      }
    }

    this.drawEnemyHealthBars(getStore(this.curr, "enemy"));

    this.playerLayer.position.set(-ox, -oy);
    this.syncPlayers(getStore(this.curr, "player"));

    this.updateDamageNumbers(ox, oy);
  }

  private drawTerrain(ox: number, oy: number): void {
    this.terrainGraphics.clear();
    const terrain = this.terrain;
    const settings = terrain?.settings;
    if (!terrain || !settings) return;
    const colors = settings.colors;
    const floorAlt = colorValue(colors.floorAlt);
    const speck = colorValue(colors.floorSpeck);
    const wallTop = colorValue(colors.wallTop);
    const wallTopAlt = colorValue(colors.wallTopAlt);
    const wallFace = colorValue(colors.wallFace);
    const wallEdge = colorValue(colors.wallEdge);
    const liquid = colorValue(colors.liquid);
    const liquidDeep = colorValue(colors.liquidDeep);
    const liquidAccent = colorValue(colors.liquidAccent);
    const t = performance.now() / 1000;
    const minTx = Math.floor(ox / TERRAIN_TILE) - 1;
    const maxTx = Math.ceil((ox + VIEW_W) / TERRAIN_TILE) + 1;
    const minTy = Math.floor(oy / TERRAIN_TILE) - 1;
    const maxTy = Math.ceil((oy + VIEW_H) / TERRAIN_TILE) + 1;
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        const px = tx * TERRAIN_TILE - ox;
        const py = ty * TERRAIN_TILE - oy;
        const type = terrain.tileAt(tx, ty);
        if (type === TILE_WALL) {
          const north = terrain.tileAt(tx, ty - 1) !== TILE_WALL;
          const south = terrain.tileAt(tx, ty + 1) !== TILE_WALL;
          const west = terrain.tileAt(tx - 1, ty) !== TILE_WALL;
          const east = terrain.tileAt(tx + 1, ty) !== TILE_WALL;
          if (south) {
            this.terrainGraphics
              .rect(px, py + 25, TERRAIN_TILE, 7)
              .fill({ color: 0x000000, alpha: 0.24 });
          }
          this.terrainGraphics.rect(px, py, TERRAIN_TILE, TERRAIN_TILE).fill(wallTop);
          if (north) this.terrainGraphics.rect(px, py, TERRAIN_TILE, 2).fill(wallTopAlt);
          if (west) this.terrainGraphics.rect(px, py, 1, TERRAIN_TILE).fill(wallEdge);
          if (east) {
            this.terrainGraphics.rect(px + TERRAIN_TILE - 1, py, 1, TERRAIN_TILE).fill(wallEdge);
          }
          if (south) {
            this.terrainGraphics.rect(px, py + 23, TERRAIN_TILE, 9).fill(wallFace);
            this.terrainGraphics.rect(px, py + 23, TERRAIN_TILE, 1).fill(wallEdge);
          }
          if ((tx * 7 + ty * 13) % 5 === 0) {
            this.terrainGraphics
              .rect(px + 4, py + 5, 8, 2)
              .fill({ color: wallTopAlt, alpha: 0.65 });
            this.terrainGraphics
              .rect(px + 17, py + 12, 10, 1)
              .fill({ color: wallEdge, alpha: 0.6 });
          }
        } else if (type === TILE_LIQUID) {
          const north = terrain.tileAt(tx, ty - 1) !== TILE_LIQUID;
          const south = terrain.tileAt(tx, ty + 1) !== TILE_LIQUID;
          const west = terrain.tileAt(tx - 1, ty) !== TILE_LIQUID;
          const east = terrain.tileAt(tx + 1, ty) !== TILE_LIQUID;
          this.terrainGraphics.rect(px, py, TERRAIN_TILE, TERRAIN_TILE).fill(liquidDeep);
          this.terrainGraphics.rect(px, py, TERRAIN_TILE, TERRAIN_TILE).fill({
            color: liquid,
            alpha: 0.52,
          });
          const wave = Math.sin(t * 2.2 + tx * 0.8 + ty * 1.7);
          const wave2 = Math.sin(t * 1.6 - tx * 0.5 + ty * 0.9);
          this.terrainGraphics
            .rect(px + 3 + (wave > 0 ? 3 : 0), py + 7, 12, 1)
            .fill({ color: liquidAccent, alpha: 0.55 });
          this.terrainGraphics
            .rect(px + 16, py + 20 + (wave2 > 0 ? 2 : 0), 8, 1)
            .fill({ color: liquidAccent, alpha: 0.38 });
          if (north) {
            this.terrainGraphics
              .rect(px, py, TERRAIN_TILE, 2)
              .fill({ color: liquidAccent, alpha: 0.72 });
          }
          if (south) {
            this.terrainGraphics
              .rect(px, py + TERRAIN_TILE - 2, TERRAIN_TILE, 2)
              .fill({ color: liquidDeep, alpha: 0.9 });
          }
          if (west) {
            this.terrainGraphics
              .rect(px, py, 1, TERRAIN_TILE)
              .fill({ color: liquidAccent, alpha: 0.35 });
          }
          if (east) {
            this.terrainGraphics
              .rect(px + TERRAIN_TILE - 1, py, 1, TERRAIN_TILE)
              .fill({ color: liquidAccent, alpha: 0.35 });
          }
        } else {
          // The seamless ground texture already paints the floor. Keep only a
          // sparse detail pass so large open areas do not look tiled.
          if ((tx * 31 + ty * 11) % 37 === 0) {
            this.terrainGraphics.rect(px + 6, py + 18, 5, 1).fill({ color: speck, alpha: 0.6 });
            this.terrainGraphics.rect(px + 12, py + 19, 2, 1).fill({ color: floorAlt, alpha: 0.4 });
          }
        }
      }
    }
  }

  private spawnDamage(x: number, y: number, amount: number): void {
    if (!this.damageNumbersEnabled) return;
    if (this.damage.length >= MAX_DAMAGE) {
      const oldest = this.damage.shift();
      if (oldest) oldest.sprite.destroy();
    }
    const sprite = renderPixelTextSprite(String(Math.round(amount)), 1);
    sprite.anchor.set(0.5, 0.5);
    this.stage.addChild(sprite);
    this.damage.push({ sprite, x, y, life: 40 });
  }

  private updateDamageNumbers(ox: number, oy: number): void {
    for (let i = this.damage.length - 1; i >= 0; i--) {
      const d = this.damage[i];
      d.y -= 0.4;
      d.life -= 1;
      if (d.life <= 0) {
        d.sprite.destroy();
        this.damage.splice(i, 1);
      } else {
        d.sprite.position.set(d.x - ox, d.y - oy);
      }
    }
  }

  /** Set which player is the local one (camera + tint target). */
  setLocalPlayer(playerId: number): void {
    this.localPlayerId = playerId;
    this.resetPrediction();
  }

  /** Render every player, interpolating between snapshots and leading the local one. */
  private syncPlayers(store: StoreSnapshot | undefined): void {
    const seen = new Set<number>();
    this.playerHpBar.clear();
    const prev = this.prev ? getStore(this.prev, "player") : undefined;
    const a = this.alpha();
    const hpWidth = 16;
    if (store) {
      for (let i = 0; i < store.slots.length; i++) {
        const slot = store.slots[i];
        seen.add(slot);
        let sprite = this.playerSprites.get(slot);
        if (!sprite) {
          sprite = new Sprite(this.championTextures.get(slot) ?? this.textures.player);
          // HD model renders are up to 512px; scale to a 52-unit tall champion
          // so they read at gameplay size on the 2x-zoomed canvas.
          const baseScale = 52 / Math.max(1, sprite.texture.height);
          sprite.anchor.set(0.5, 0.82);
          sprite.scale.set(baseScale);
          this.playerSprites.set(slot, sprite);
          this.playerLayer.addChild(sprite);
          this.playerBaseScale.set(slot, baseScale);
        }
        const downed = store.fields.downed[i] === 1;
        let x = store.fields.x[i];
        let y = store.fields.y[i];
        const prevIdx = prev ? prev.slots.indexOf(slot) : -1;
        if (prevIdx >= 0 && prev) {
          x = lerp(prev.fields.x[prevIdx], x, a);
          y = lerp(prev.fields.y[prevIdx], y, a);
        }
        if (slot === this.localPlayerId && !downed) {
          x += this.predictionX;
          y += this.predictionY;
        }
        sprite.position.set(x, y);
        const base = this.playerBaseScale.get(slot) ?? 1;
        sprite.alpha = downed ? 0.65 : 1;
        // HD renders carry their own colors: no tint when healthy; state
        // tints (downed grey, local highlight when no render) still apply.
        if (downed) sprite.tint = 0x777777;
        else if (!this.championTextures.has(slot)) sprite.tint = this.championColor;
        else sprite.tint = 0xffffff;
        sprite.scale.x = (store.fields.facingX[i] < 0 ? -1 : 1) * base;
        sprite.scale.y = base;

        // HP / revive bar under the player (same interpolated position).
        this.playerHpBar.rect(x - hpWidth / 2, y + 9, hpWidth, 2).fill(0x000000);
        if (downed) {
          const prog = Math.max(0, Math.min(1, store.fields.reviveProgress[i] / 90));
          this.playerHpBar
            .rect(x - hpWidth / 2 + 1, y + 10, (hpWidth - 2) * prog, 1)
            .fill(0xffaa33);
        } else {
          const hp = store.fields.hp[i];
          const maxHp = store.fields.maxHp[i];
          const pct = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
          this.playerHpBar.rect(x - hpWidth / 2 + 1, y + 10, (hpWidth - 2) * pct, 1).fill(0x44ff66);
        }
      }
    }
    for (const [slot, sprite] of this.playerSprites) {
      if (!seen.has(slot)) {
        this.playerLayer.removeChild(sprite);
        this.playerSprites.delete(slot);
      }
    }
  }

  /** Elite bars are always visible; other enemies show a bar after damage. */
  private drawEnemyHealthBars(store: StoreSnapshot | undefined): void {
    this.enemyHpBar.clear();
    if (!store) return;
    const prev = this.prev ? getStore(this.prev, "enemy") : undefined;
    const a = this.alpha();
    const prevIndex = new Map<number, number>();
    if (prev) {
      for (let i = 0; i < prev.slots.length; i++) prevIndex.set(prev.slots[i], i);
    }
    for (let i = 0; i < store.slots.length; i++) {
      const hp = store.fields.hp[i];
      const maxHp = store.fields.maxHp[i];
      const shield = store.fields.shield?.[i] ?? 0;
      const fuse = store.fields.fuseTicks?.[i] ?? 0;
      const def = this.enemies[store.fields.kind[i]];
      const isElite = def?.category === "elite";
      // Elites keep an always-visible bar; everything else appears after damage.
      if (!isElite && hp >= maxHp && shield <= 0 && fuse <= 0) continue;
      // Bosses/final threats use the HUD overlay bar instead.
      if (def?.category === "boss" || def?.category === "final-threat") continue;
      const w = def ? Math.min(34, Math.max(12, def.radius * 2)) : 12;
      let x = store.fields.x[i];
      let y = store.fields.y[i];
      const pi = prevIndex.get(store.slots[i]);
      if (pi !== undefined && prev) {
        x = lerp(prev.fields.x[pi], x, a);
        y = lerp(prev.fields.y[pi], y, a);
      }
      const pct = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
      const barY = isElite ? y - 12 : y - 10;
      const barH = isElite ? 3 : 2;
      if (isElite) {
        this.enemyHpBar.rect(x - w / 2 - 2, barY - 1, w + 4, barH + 2).fill(0x0a0703);
        this.enemyHpBar.rect(x - w / 2 - 1, barY, w + 2, barH).fill(0x5a3b10);
        this.enemyHpBar.rect(x - 1, barY - 5, 2, 2).fill(0xffd36b);
      }
      this.enemyHpBar.rect(x - w / 2, barY, w, barH).fill(isElite ? 0x2a1a0c : 0x000000);
      this.enemyHpBar
        .rect(x - w / 2 + 1, barY + 1, (w - 2) * pct, Math.max(1, barH - 1))
        .fill(isElite ? 0xffb24d : 0xff4444);
      if (shield > 0) {
        this.enemyHpBar.circle(x, y - 4, Math.max(8, w * 0.35));
        this.enemyHpBar.stroke({ color: 0x7fc8ff, width: 1, alpha: 0.55 });
      }
      if (fuse > 0 && Math.floor(fuse / 4) % 2 === 0) {
        this.enemyHpBar.circle(x, y - 4, Math.max(7, w * 0.3));
        this.enemyHpBar.stroke({ color: 0xff7b3d, width: 1, alpha: 0.8 });
      }
    }
  }

  private syncEntities(
    map: Map<number, Sprite>,
    layer: Container,
    store: StoreSnapshot | undefined,
    prevStore: StoreSnapshot | undefined,
    texture: Texture,
    tintFor?: (index: number) => number,
  ): void {
    const seen = new Set<number>();
    const a = this.alpha();
    const prevIndex = new Map<number, number>();
    if (prevStore) {
      for (let i = 0; i < prevStore.slots.length; i++) prevIndex.set(prevStore.slots[i], i);
    }
    if (store) {
      for (let i = 0; i < store.slots.length; i++) {
        const slot = store.slots[i];
        seen.add(slot);
        let sprite = map.get(slot);
        if (!sprite) {
          sprite = new Sprite(texture);
          sprite.anchor.set(0.5, 0.5);
          map.set(slot, sprite);
          layer.addChild(sprite);
        }
        let x = store.fields.x[i];
        let y = store.fields.y[i];
        const pi = prevIndex.get(slot);
        if (pi !== undefined && prevStore) {
          x = lerp(prevStore.fields.x[pi], x, a);
          y = lerp(prevStore.fields.y[pi], y, a);
        }
        sprite.position.set(x, y);
        sprite.tint = tintFor ? tintFor(i) : 0xffffff;
      }
    }
    for (const [slot, sprite] of map) {
      if (!seen.has(slot)) {
        layer.removeChild(sprite);
        map.delete(slot);
      }
    }
  }

  /** Enemies: interpolated positions + per-content tint and radius-based scale. */
  private syncEnemies(
    store: StoreSnapshot | undefined,
    prevStore: StoreSnapshot | undefined,
  ): void {
    const seen = new Set<number>();
    const a = this.alpha();
    const prevIndex = new Map<number, number>();
    if (prevStore) {
      for (let i = 0; i < prevStore.slots.length; i++) prevIndex.set(prevStore.slots[i], i);
    }
    if (store) {
      for (let i = 0; i < store.slots.length; i++) {
        const slot = store.slots[i];
        seen.add(slot);
        let sprite = this.enemySprites.get(slot);
        if (!sprite) {
          // Per-enemy pixel sprite keyed by def id; tint stays for state colors.
          const def = this.enemies[store.fields.kind[i]];
          sprite = new Sprite(enemySprite(def?.id ?? ""));
          sprite.anchor.set(0.5, 0.5);
          this.enemySprites.set(slot, sprite);
          this.enemyLayer.addChild(sprite);
        }
        const def = this.enemies[store.fields.kind[i]];
        const baseScale = def ? Math.max(0.6, def.radius / 6) : 1;
        const slowed = (store.fields.slowTicks?.[i] ?? 0) > 0;
        this.enemyBaseScale.set(slot, baseScale);
        sprite.tint = slowed ? 0x9fdcff : (def?.tint ?? 0xffffff);
        sprite.scale.set(baseScale);

        let x = store.fields.x[i];
        let y = store.fields.y[i];
        const pi = prevIndex.get(slot);
        if (pi !== undefined && prevStore) {
          x = lerp(prevStore.fields.x[pi], x, a);
          y = lerp(prevStore.fields.y[pi], y, a);
        }
        sprite.position.set(x, y);
      }
    }
    for (const [slot, sprite] of this.enemySprites) {
      if (!seen.has(slot)) {
        this.enemyLayer.removeChild(sprite);
        this.enemySprites.delete(slot);
        this.enemyBaseScale.delete(slot);
      }
    }
  }

  /** Sync floor pickups (heal/vacuum/nuke/freeze/chest/gold), tinted by kind. */
  private syncPickups(
    store: StoreSnapshot | undefined,
    prevStore: StoreSnapshot | undefined,
  ): void {
    const seen = new Set<number>();
    const a = this.alpha();
    const prevIndex = new Map<number, number>();
    if (prevStore) {
      for (let i = 0; i < prevStore.slots.length; i++) prevIndex.set(prevStore.slots[i], i);
    }
    if (store) {
      for (let i = 0; i < store.slots.length; i++) {
        const slot = store.slots[i];
        seen.add(slot);
        let sprite = this.pickupSprites.get(slot);
        if (!sprite) {
          sprite = new Sprite(this.textures.gem);
          sprite.anchor.set(0.5, 0.5);
          this.pickupSprites.set(slot, sprite);
          this.pickupLayer.addChild(sprite);
        }
        const kind = store.fields.kind[i];
        sprite.texture =
          kind === 6
            ? this.textures.key
            : kind === 7
              ? this.textures.magnet
              : kind === 8
                ? this.textures.bomb
                : this.textures.gem;
        let x = store.fields.x[i];
        let y = store.fields.y[i];
        const pi = prevIndex.get(slot);
        if (pi !== undefined && prevStore) {
          x = lerp(prevStore.fields.x[pi], x, a);
          y = lerp(prevStore.fields.y[pi], y, a);
        }
        sprite.position.set(x, y);
        sprite.tint = PICKUP_COLORS[store.fields.kind[i]] ?? 0xffffff;
      }
    }
    for (const [slot, sprite] of this.pickupSprites) {
      if (!seen.has(slot)) {
        this.pickupLayer.removeChild(sprite);
        this.pickupSprites.delete(slot);
      }
    }
  }

  /** Bushes are soft props rendered behind pickups and actors. */
  private syncBushes(store: StoreSnapshot | undefined, prevStore: StoreSnapshot | undefined): void {
    const seen = new Set<number>();
    const a = this.alpha();
    const prevIndex = new Map<number, number>();
    if (prevStore) {
      for (let i = 0; i < prevStore.slots.length; i++) prevIndex.set(prevStore.slots[i], i);
    }
    if (store) {
      for (let i = 0; i < store.slots.length; i++) {
        const slot = store.slots[i];
        seen.add(slot);
        let sprite = this.bushSprites.get(slot);
        if (!sprite) {
          sprite = new Sprite(this.textures.bush);
          sprite.anchor.set(0.5, 0.7);
          this.bushSprites.set(slot, sprite);
          this.bushLayer.addChild(sprite);
        }
        let x = store.fields.x[i];
        let y = store.fields.y[i];
        const pi = prevIndex.get(slot);
        if (pi !== undefined && prevStore) {
          x = lerp(prevStore.fields.x[pi], x, a);
          y = lerp(prevStore.fields.y[pi], y, a);
        }
        const sway = Math.sin(performance.now() / 700 + slot * 1.7) * 0.8;
        sprite.position.set(x + sway, y);
        sprite.scale.set(1.15);
      }
    }
    for (const [slot, sprite] of this.bushSprites) {
      if (!seen.has(slot)) {
        this.bushLayer.removeChild(sprite);
        this.bushSprites.delete(slot);
      }
    }
  }

  /** Run chests: golden chest + claim progress ring. */
  private syncChests(store: StoreSnapshot | undefined, prevStore: StoreSnapshot | undefined): void {
    const seen = new Set<number>();
    const a = this.alpha();
    const prevIndex = new Map<number, number>();
    if (prevStore) {
      for (let i = 0; i < prevStore.slots.length; i++) prevIndex.set(prevStore.slots[i], i);
    }
    this.chestGraphics.clear();
    const now = performance.now();
    if (store) {
      for (let i = 0; i < store.slots.length; i++) {
        const slot = store.slots[i];
        seen.add(slot);
        let sprite = this.chestSprites.get(slot);
        if (!sprite) {
          sprite = new Sprite(this.textures.chest);
          sprite.anchor.set(0.5, 0.7);
          this.chestSprites.set(slot, sprite);
          this.chestLayer.addChild(sprite);
        }
        let x = store.fields.x[i];
        let y = store.fields.y[i];
        const pi = prevIndex.get(slot);
        if (pi !== undefined && prevStore) {
          x = lerp(prevStore.fields.x[pi], x, a);
          y = lerp(prevStore.fields.y[pi], y, a);
        }
        const opening = (store.fields.openingTicks?.[i] ?? 0) > 0;
        const bob = opening ? 0 : Math.sin(now / 280 + slot) * 1.2;
        sprite.position.set(x, y + bob);
        sprite.scale.set(opening ? 1.65 + Math.sin(now / 80) * 0.05 : 1.55);

        const glow = opening ? 0.5 : 0.24 + Math.sin(now / 320 + slot) * 0.08;
        this.chestGraphics.circle(x, y - 5, 18).fill({ color: 0xffd66b, alpha: glow });
        // A dotted ring avoids the open arc endpoints and anti-aliasing seams
        // produced by thin stroked Pixi arcs at this canvas resolution.
        this.drawProgressDots(
          this.chestGraphics,
          x,
          y - 5,
          22,
          opening ? Math.max(0, Math.min(1, 1 - (store.fields.openingTicks?.[i] ?? 0) / 90)) : 0,
          opening ? 0xffffff : 0xffdf8a,
          opening ? 0.9 : 0.28,
        );
      }
    }
    for (const [slot, sprite] of this.chestSprites) {
      if (!seen.has(slot)) {
        this.chestLayer.removeChild(sprite);
        this.chestSprites.delete(slot);
      }
    }
  }

  /** Draw a segmented progress ring with filled pips (no stroked arc seams). */
  private drawProgressDots(
    graphics: Graphics,
    x: number,
    y: number,
    radius: number,
    pct: number,
    color: number,
    alpha: number,
  ): void {
    const total = 28;
    const active = Math.ceil(Math.max(0, Math.min(1, pct)) * total);
    for (let i = 0; i < total; i++) {
      const angle = -Math.PI / 2 + (i / total) * Math.PI * 2;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (i < active) {
        graphics.circle(px, py, 1.5).fill({ color, alpha });
      } else {
        graphics.circle(px, py, 1.1).fill({ color: 0x1a2634, alpha: 0.5 });
      }
    }
  }

  /** Add screen shake (used by explosions/nukes). */
  addShake(amount: number): void {
    if (!this.shakeEnabled) return;
    this.shake = Math.min(4, this.shake + amount);
  }

  /** Toggle screen shake (settings). */
  setShake(enabled: boolean): void {
    this.shakeEnabled = enabled;
    if (!enabled) this.shake = 0;
  }

  /** Toggle floating damage numbers (accessibility). */
  setDamageNumbers(enabled: boolean): void {
    this.damageNumbersEnabled = enabled;
    if (!enabled) {
      for (const d of this.damage) d.sprite.destroy();
      this.damage.length = 0;
    }
  }

  /** Set the local player's champion tint. */
  /** Assign champion pixel sprites per player slot (co-op aware). */
  setPartyChampions(
    members: { id: number; characterId?: string; class?: string; skinNum?: number }[],
  ): void {
    this.championTextures.clear();
    for (const member of members) {
      const texture = championSprite(member.characterId, member.class, member.skinNum);
      if (texture) this.championTextures.set(member.id, texture);
    }
  }

  setChampionColor(color: number): void {
    this.championColor = color;
  }

  /** Find a ability def by its ability-store slot (for fire visuals). */
  private abilityDefAt(slot: number): AbilityDef | null {
    if (!this.curr) return null;
    const store = getStore(this.curr, "ability");
    if (!store) return null;
    const idx = store.slots.indexOf(slot);
    if (idx < 0) return null;
    return this.abilities[store.fields.defIndex[idx]] ?? null;
  }

  /** Spawn a short visual for a ability firing (arc for sweeps, ring for auras). */
  private spawnFireEffect(abilitySlot: number, aimedAngle?: number): void {
    const def = this.abilityDefAt(abilitySlot);
    const p = this.playerPosition();
    if (!def || !p) return;
    const angle = aimedAngle ?? Math.atan2(p.fy, p.fx);
    if (def.behavior === "sweep") {
      const arc = typeof def.params.arc === "number" ? def.params.arc : 1.2;
      this.effects.push({
        kind: "arc",
        x: p.x,
        y: p.y,
        angle,
        arc,
        radius: def.base.area,
        life: 6,
        maxLife: 6,
        color: 0xffffff,
      });
    } else if (def.behavior === "aura") {
      this.effects.push({
        kind: "ring",
        x: p.x,
        y: p.y,
        angle: 0,
        arc: 0,
        radius: def.base.area,
        life: 8,
        maxLife: 8,
        color: 0x66ccff,
      });
    } else {
      this.effects.push({
        kind: "ring",
        x: p.x,
        y: p.y,
        angle: 0,
        arc: 0,
        radius: 12,
        life: 4,
        maxLife: 4,
        color: 0xffdd88,
      });
    }
  }

  /** Ground pools / damage zones (drawn under enemies). */
  private drawZones(): void {
    this.zoneGraphics.clear();
    const store = this.curr ? getStore(this.curr, "zone") : undefined;
    if (!store) return;
    for (let i = 0; i < store.slots.length; i++) {
      this.zoneGraphics.circle(store.fields.x[i], store.fields.y[i], store.fields.radius[i]);
      this.zoneGraphics.fill({ color: 0xaa44ff, alpha: 0.18 });
      this.zoneGraphics.circle(store.fields.x[i], store.fields.y[i], store.fields.radius[i]);
      this.zoneGraphics.stroke({ width: 1, color: 0xcc88ff, alpha: 0.4 });
    }
  }

  /** Filled ring segment; used for slashes and shockwaves. */
  private drawAnnularSector(
    graphics: Graphics,
    x: number,
    y: number,
    inner: number,
    outer: number,
    start: number,
    end: number,
    color: number,
    alpha: number,
  ): void {
    const steps = Math.max(8, Math.ceil(Math.abs(end - start) / 0.14));
    graphics.moveTo(x + Math.cos(start) * outer, y + Math.sin(start) * outer);
    for (let i = 1; i <= steps; i++) {
      const angle = start + ((end - start) * i) / steps;
      graphics.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
    }
    for (let i = steps; i >= 0; i--) {
      const angle = start + ((end - start) * i) / steps;
      graphics.lineTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
    }
    graphics.closePath().fill({ color, alpha });
  }

  private drawAnnularRing(
    graphics: Graphics,
    x: number,
    y: number,
    inner: number,
    outer: number,
    color: number,
    alpha: number,
  ): void {
    this.drawAnnularSector(graphics, x, y, inner, outer, 0, Math.PI * 2, color, alpha);
  }

  /** Enemy ability telegraphs (ground runes, beams, meteors). */
  private drawHazards(): void {
    this.hazardGraphics.clear();
    const store = this.curr ? getStore(this.curr, "hazard") : undefined;
    if (!store) return;
    const pulse = 0.18 + (Math.sin(performance.now() / 95) + 1) * 0.045;
    for (let i = 0; i < store.slots.length; i++) {
      const x = store.fields.x[i];
      const y = store.fields.y[i];
      const radius = store.fields.radius[i];
      const kind = store.fields.kind[i];
      if (kind === 1) {
        const angle = store.fields.angle[i];
        const length = store.fields.length[i];
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const nx = -sin * radius;
        const ny = cos * radius;
        this.hazardGraphics
          .moveTo(x + nx, y + ny)
          .lineTo(x + cos * length + nx, y + sin * length + ny)
          .lineTo(x + cos * length - nx, y + sin * length - ny)
          .lineTo(x - nx, y - ny)
          .closePath()
          .fill({ color: 0xff4d3d, alpha: pulse });
        this.hazardGraphics
          .moveTo(x, y)
          .lineTo(x + cos * length, y + sin * length)
          .stroke({ color: 0xffbba0, width: 1, alpha: 0.45 });
      } else {
        this.hazardGraphics.circle(x, y, radius).fill({ color: 0xff4d3d, alpha: pulse });
        this.hazardGraphics.circle(x, y, Math.max(4, radius - 4)).fill({
          color: 0xffaa66,
          alpha: pulse * 0.5,
        });
      }
    }
  }

  /** Transient ability-fire visuals (arcs/rings). */
  private drawEffects(): void {
    this.fxGraphics.clear();
    for (const fx of this.effects) {
      const alpha = fx.life / fx.maxLife;
      if (fx.kind === "arc") {
        // Fill an annular sector instead of stroking an arc. Stroked sub-pixel
        // arcs are the source of the jagged debris around melee slashes.
        this.drawAnnularSector(
          this.fxGraphics,
          fx.x,
          fx.y,
          fx.radius * 0.48,
          fx.radius,
          fx.angle - fx.arc / 2,
          fx.angle + fx.arc / 2,
          fx.color,
          alpha * 0.38,
        );
      } else {
        const radius = fx.radius * (1 - alpha * 0.4);
        this.drawAnnularRing(
          this.fxGraphics,
          fx.x,
          fx.y,
          radius * 0.9,
          radius,
          fx.color,
          alpha * 0.7,
        );
      }
      fx.life -= 1;
    }
    for (let i = this.effects.length - 1; i >= 0; i--) {
      if (this.effects[i].life <= 0) this.effects.splice(i, 1);
    }
  }
}
