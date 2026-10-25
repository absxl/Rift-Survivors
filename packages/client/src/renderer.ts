import type { SimEvent, StoreSnapshot, WeaponDef, WorldSnapshot } from "@rift/sim";
// Pixel-perfect renderer: draws the world from snapshots with a camera locked to
// the local player, interpolating between the two most recent snapshots. Also
// renders projectiles, hit flashes and pooled damage numbers from sim events.
import { Container, Graphics, Sprite, TilingSprite } from "pixi.js";
import type { Texture } from "pixi.js";
import { renderPixelTextSprite } from "./assets/pixel-font";
import { type PlaceholderTextures, createPlaceholderTextures } from "./assets/placeholder";

export const VIEW_W = 480;
export const VIEW_H = 270;

const MAX_DAMAGE = 96;
const FLASH_FRAMES = 5;
// Pickup kind → tint (heal, vacuum, nuke, freeze, chest, gold).
const PICKUP_COLORS = [0x44ff66, 0x44ffff, 0xff8844, 0x4488ff, 0xffcc44, 0xffdd44];

function getStore(s: WorldSnapshot, kind: string): StoreSnapshot | undefined {
  return s.stores.find((st) => st.kind === kind);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
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
  private readonly playerLayer: Container;
  private readonly playerHpBar: Graphics;
  private readonly playerSprites = new Map<number, Sprite>();
  private localPlayerId = 0;
  private readonly gemLayer: Container;
  private readonly pickupLayer: Container;
  private readonly projectileLayer: Container;
  private readonly enemyLayer: Container;
  private readonly gemSprites = new Map<number, Sprite>();
  private readonly pickupSprites = new Map<number, Sprite>();
  private readonly projectileSprites = new Map<number, Sprite>();
  private readonly enemySprites = new Map<number, Sprite>();
  private readonly enemyFlash = new Map<number, number>();
  private readonly enemyHpBar: Graphics;
  private readonly zoneGraphics: Graphics;
  private readonly fxGraphics: Graphics;
  private readonly damage: DamageEntry[] = [];
  private readonly effects: FireEffect[] = [];
  private readonly textures: PlaceholderTextures;
  private shake = 0;
  private shakeEnabled = true;
  private championColor = 0x44aaff;

  constructor(
    private readonly stage: Container,
    private readonly weapons: WeaponDef[],
  ) {
    this.textures = createPlaceholderTextures();

    this.ground = new TilingSprite({
      texture: this.textures.ground,
      width: VIEW_W,
      height: VIEW_H,
    });
    this.stage.addChild(this.ground);

    this.gemLayer = new Container();
    this.pickupLayer = new Container();
    this.projectileLayer = new Container();
    this.enemyLayer = new Container();
    this.stage.addChild(this.gemLayer);
    this.stage.addChild(this.pickupLayer);
    this.stage.addChild(this.projectileLayer);
    this.stage.addChild(this.enemyLayer);

    this.enemyHpBar = new Graphics();
    this.enemyLayer.addChild(this.enemyHpBar);

    this.zoneGraphics = new Graphics();
    this.gemLayer.addChild(this.zoneGraphics);

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

  receive(s: WorldSnapshot, events: SimEvent[]): void {
    this.prev = this.curr;
    this.curr = s;
    this.prevTime = this.currTime;
    this.currTime = performance.now();
    this.events = events;
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
    const camX = player ? player.x : 0;
    const camY = player ? player.y : 0;
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

    // Process events → hit flash, damage numbers, weapon-fire visuals, shake.
    for (const e of this.events) {
      if (e.type === "hit") {
        if (e.target === "enemy") this.enemyFlash.set(e.targetSlot, FLASH_FRAMES);
        this.spawnDamage(e.x, e.y, e.amount);
        this.shake = Math.min(4, this.shake + 0.6);
      } else if (e.type === "weapon-fire") {
        this.spawnFireEffect(e.weaponId);
      }
    }

    this.ground.tilePosition.set(-ox, -oy);
    this.gemLayer.position.set(-ox, -oy);
    this.pickupLayer.position.set(-ox, -oy);
    this.projectileLayer.position.set(-ox, -oy);
    this.enemyLayer.position.set(-ox, -oy);

    this.drawZones();
    this.drawEffects();

    this.syncEntities(
      this.gemSprites,
      this.gemLayer,
      getStore(this.curr, "gem"),
      this.textures.gem,
    );
    this.syncPickups(getStore(this.curr, "pickup"));
    this.syncEntities(
      this.projectileSprites,
      this.projectileLayer,
      getStore(this.curr, "projectile"),
      this.textures.projectile,
    );
    this.syncEntities(
      this.enemySprites,
      this.enemyLayer,
      getStore(this.curr, "enemy"),
      this.textures.enemy,
    );

    // Enemy hit flash (brief scale pop).
    for (const [slot, sprite] of this.enemySprites) {
      const flash = this.enemyFlash.get(slot) ?? 0;
      if (flash > 0) {
        sprite.scale.set(1.2);
        this.enemyFlash.set(slot, flash - 1);
      } else {
        sprite.scale.set(1);
        this.enemyFlash.delete(slot);
      }
    }

    this.drawEnemyHealthBars(getStore(this.curr, "enemy"));

    this.playerLayer.position.set(-ox, -oy);
    this.syncPlayers(getStore(this.curr, "player"));

    this.updateDamageNumbers(ox, oy);
  }

  private spawnDamage(x: number, y: number, amount: number): void {
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
  }

  /** Render every player; the local one uses the champion color, allies a neutral tint. */
  private syncPlayers(store: StoreSnapshot | undefined): void {
    const seen = new Set<number>();
    if (store) {
      for (let i = 0; i < store.slots.length; i++) {
        const slot = store.slots[i];
        seen.add(slot);
        let sprite = this.playerSprites.get(slot);
        if (!sprite) {
          sprite = new Sprite(this.textures.player);
          sprite.anchor.set(0.5, 0.5);
          this.playerSprites.set(slot, sprite);
          this.playerLayer.addChild(sprite);
        }
        sprite.position.set(store.fields.x[i], store.fields.y[i]);
        sprite.tint = slot === this.localPlayerId ? this.championColor : 0x88aaff;
        sprite.scale.x = store.fields.facingX[i] < 0 ? -1 : 1;
      }
    }
    for (const [slot, sprite] of this.playerSprites) {
      if (!seen.has(slot)) {
        this.playerLayer.removeChild(sprite);
        this.playerSprites.delete(slot);
      }
    }
    this.drawPlayerHpBars(store);
  }

  private drawPlayerHpBars(store: StoreSnapshot | undefined): void {
    this.playerHpBar.clear();
    if (!store) return;
    const w = 16;
    for (let i = 0; i < store.slots.length; i++) {
      const hp = store.fields.hp[i];
      const maxHp = store.fields.maxHp[i];
      const pct = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
      const x = store.fields.x[i];
      const y = store.fields.y[i];
      this.playerHpBar.rect(x - w / 2, y + 9, w, 2).fill(0x000000);
      this.playerHpBar.rect(x - w / 2 + 1, y + 10, (w - 2) * pct, 1).fill(0x44ff66);
    }
  }

  /** Thin bar above any enemy that has taken damage. */
  private drawEnemyHealthBars(store: StoreSnapshot | undefined): void {
    this.enemyHpBar.clear();
    if (!store) return;
    const w = 12;
    for (let i = 0; i < store.slots.length; i++) {
      const hp = store.fields.hp[i];
      const maxHp = store.fields.maxHp[i];
      if (hp >= maxHp) continue;
      const x = store.fields.x[i];
      const y = store.fields.y[i];
      const pct = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
      this.enemyHpBar.rect(x - w / 2, y - 10, w, 2).fill(0x000000);
      this.enemyHpBar.rect(x - w / 2 + 1, y - 9, (w - 2) * pct, 1).fill(0xff4444);
    }
  }

  private syncEntities(
    map: Map<number, Sprite>,
    layer: Container,
    store: StoreSnapshot | undefined,
    texture: Texture,
  ): void {
    const seen = new Set<number>();
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
        sprite.position.set(store.fields.x[i], store.fields.y[i]);
      }
    }
    for (const [slot, sprite] of map) {
      if (!seen.has(slot)) {
        layer.removeChild(sprite);
        map.delete(slot);
      }
    }
  }

  /** Sync floor pickups (heal/vacuum/nuke/freeze/chest/gold), tinted by kind. */
  private syncPickups(store: StoreSnapshot | undefined): void {
    const seen = new Set<number>();
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
        sprite.position.set(store.fields.x[i], store.fields.y[i]);
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

  /** Toggle screen shake (settings). */
  setShake(enabled: boolean): void {
    this.shakeEnabled = enabled;
    if (!enabled) this.shake = 0;
  }

  /** Set the local player's champion tint. */
  setChampionColor(color: number): void {
    this.championColor = color;
  }

  /** Find a weapon def by its weapon-store slot (for fire visuals). */
  private weaponDefAt(slot: number): WeaponDef | null {
    if (!this.curr) return null;
    const store = getStore(this.curr, "weapon");
    if (!store) return null;
    const idx = store.slots.indexOf(slot);
    if (idx < 0) return null;
    return this.weapons[store.fields.defIndex[idx]] ?? null;
  }

  /** Spawn a short visual for a weapon firing (arc for sweeps, ring for auras). */
  private spawnFireEffect(weaponSlot: number): void {
    const def = this.weaponDefAt(weaponSlot);
    const p = this.playerPosition();
    if (!def || !p) return;
    const angle = Math.atan2(p.fy, p.fx);
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

  /** Transient weapon-fire visuals (arcs/rings). */
  private drawEffects(): void {
    this.fxGraphics.clear();
    for (const fx of this.effects) {
      const alpha = fx.life / fx.maxLife;
      if (fx.kind === "arc") {
        this.fxGraphics.arc(fx.x, fx.y, fx.radius, fx.angle - fx.arc / 2, fx.angle + fx.arc / 2);
        this.fxGraphics.stroke({ width: 2, color: fx.color, alpha });
      } else {
        this.fxGraphics.circle(fx.x, fx.y, fx.radius * (1 - alpha * 0.4));
        this.fxGraphics.stroke({ width: 2, color: fx.color, alpha });
      }
      fx.life -= 1;
    }
    for (let i = this.effects.length - 1; i >= 0; i--) {
      if (this.effects[i].life <= 0) this.effects.splice(i, 1);
    }
  }
}
