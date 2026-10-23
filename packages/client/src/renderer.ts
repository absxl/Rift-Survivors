import type { SimEvent, StoreSnapshot, WorldSnapshot } from "@rift/sim";
// Pixel-perfect renderer: draws the world from snapshots with a camera locked to
// the local player, interpolating between the two most recent snapshots. Also
// renders projectiles, hit flashes and pooled damage numbers from sim events.
import { Container, Graphics, Sprite, Text, TilingSprite } from "pixi.js";
import type { Texture } from "pixi.js";
import { type PlaceholderTextures, createPlaceholderTextures } from "./assets/placeholder";

export const VIEW_W = 480;
export const VIEW_H = 270;

const MAX_DAMAGE = 96;
const FLASH_FRAMES = 5;

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
  text: Text;
  active: boolean;
  x: number;
  y: number;
  life: number;
}

export class GameRenderer {
  private prev: WorldSnapshot | null = null;
  private curr: WorldSnapshot | null = null;
  private prevTime = 0;
  private currTime = 0;
  private events: SimEvent[] = [];

  private readonly ground: TilingSprite;
  private readonly playerSprite: Sprite;
  private readonly hpBar: Graphics;
  private readonly gemLayer: Container;
  private readonly projectileLayer: Container;
  private readonly enemyLayer: Container;
  private readonly gemSprites = new Map<number, Sprite>();
  private readonly projectileSprites = new Map<number, Sprite>();
  private readonly enemySprites = new Map<number, Sprite>();
  private readonly enemyFlash = new Map<number, number>();
  private readonly damage: DamageEntry[] = [];
  private readonly textures: PlaceholderTextures;

  constructor(private readonly stage: Container) {
    this.textures = createPlaceholderTextures();

    this.ground = new TilingSprite({
      texture: this.textures.ground,
      width: VIEW_W,
      height: VIEW_H,
    });
    this.stage.addChild(this.ground);

    this.gemLayer = new Container();
    this.projectileLayer = new Container();
    this.enemyLayer = new Container();
    this.stage.addChild(this.gemLayer);
    this.stage.addChild(this.projectileLayer);
    this.stage.addChild(this.enemyLayer);

    this.playerSprite = new Sprite(this.textures.player);
    this.playerSprite.anchor.set(0.5, 0.5);
    this.stage.addChild(this.playerSprite);

    this.hpBar = new Graphics();
    this.stage.addChild(this.hpBar);

    for (let i = 0; i < MAX_DAMAGE; i++) {
      const text = new Text({
        text: "",
        style: { fontFamily: "monospace", fontSize: 7, fill: 0xffffff },
      });
      text.anchor.set(0.5, 0.5);
      text.visible = false;
      this.stage.addChild(text);
      this.damage.push({ text, active: false, x: 0, y: 0, life: 0 });
    }
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
    const idx = store.slots.indexOf(0);
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
    const w = this.curr.worldWidth || VIEW_W;
    const h = this.curr.worldHeight || VIEW_H;

    let camX = player ? player.x : w / 2;
    let camY = player ? player.y : h / 2;
    if (w > VIEW_W) camX = Math.max(VIEW_W / 2, Math.min(w - VIEW_W / 2, camX));
    else camX = w / 2;
    if (h > VIEW_H) camY = Math.max(VIEW_H / 2, Math.min(h - VIEW_H / 2, camY));
    else camY = h / 2;

    const ox = Math.round(camX - VIEW_W / 2);
    const oy = Math.round(camY - VIEW_H / 2);

    // Process events → hit flash + damage numbers.
    for (const e of this.events) {
      if (e.type === "hit") {
        if (e.target === "enemy") this.enemyFlash.set(e.targetSlot, FLASH_FRAMES);
        this.spawnDamage(e.x, e.y, e.amount);
      }
    }

    this.ground.tilePosition.set(-ox, -oy);
    this.gemLayer.position.set(-ox, -oy);
    this.projectileLayer.position.set(-ox, -oy);
    this.enemyLayer.position.set(-ox, -oy);

    this.syncEntities(
      this.gemSprites,
      this.gemLayer,
      getStore(this.curr, "gem"),
      this.textures.gem,
    );
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

    if (player) {
      this.playerSprite.visible = true;
      this.playerSprite.position.set(player.x - ox, player.y - oy);
      this.playerSprite.scale.x = player.fx < 0 ? -1 : 1;
      this.drawHpBar(player.x - ox, player.y - oy, player.hp, player.maxHp);
    } else {
      this.playerSprite.visible = false;
    }

    this.updateDamageNumbers(ox, oy);
  }

  private spawnDamage(x: number, y: number, amount: number): void {
    for (const d of this.damage) {
      if (d.active) continue;
      d.active = true;
      d.x = x;
      d.y = y;
      d.life = 40;
      d.text.text = String(Math.round(amount));
      d.text.visible = true;
      return;
    }
  }

  private updateDamageNumbers(ox: number, oy: number): void {
    for (const d of this.damage) {
      if (!d.active) continue;
      d.y -= 0.4;
      d.life -= 1;
      if (d.life <= 0) {
        d.active = false;
        d.text.visible = false;
      } else {
        d.text.position.set(d.x - ox, d.y - oy);
      }
    }
  }

  private drawHpBar(x: number, y: number, hp: number, max: number): void {
    this.hpBar.clear();
    const pct = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
    const w = 16;
    this.hpBar.rect(x - w / 2, y + 9, w, 2).fill(0x000000);
    this.hpBar.rect(x - w / 2 + 1, y + 10, (w - 2) * pct, 1).fill(0x44ff66);
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
}
