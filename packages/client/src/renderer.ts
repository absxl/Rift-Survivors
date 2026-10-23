import type { StoreSnapshot, WorldSnapshot } from "@rift/sim";
// Pixel-perfect renderer: draws the world from snapshots with a camera locked to
// the local player, interpolating between the two most recent snapshots.
import { Container, Graphics, Sprite, TilingSprite } from "pixi.js";
import type { Texture } from "pixi.js";
import { type PlaceholderTextures, createPlaceholderTextures } from "./assets/placeholder";

export const VIEW_W = 480;
export const VIEW_H = 270;

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
}

export class GameRenderer {
  private prev: WorldSnapshot | null = null;
  private curr: WorldSnapshot | null = null;
  private prevTime = 0;
  private currTime = 0;

  private readonly ground: TilingSprite;
  private readonly playerSprite: Sprite;
  private readonly hpBar: Graphics;
  private readonly gemLayer: Container;
  private readonly enemyLayer: Container;
  private readonly gemSprites = new Map<number, Sprite>();
  private readonly enemySprites = new Map<number, Sprite>();
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
    this.enemyLayer = new Container();
    this.stage.addChild(this.gemLayer);
    this.stage.addChild(this.enemyLayer);

    this.playerSprite = new Sprite(this.textures.player);
    this.playerSprite.anchor.set(0.5, 0.5);
    this.stage.addChild(this.playerSprite);

    this.hpBar = new Graphics();
    this.stage.addChild(this.hpBar);
  }

  get latest(): WorldSnapshot | null {
    return this.curr;
  }

  receive(s: WorldSnapshot): void {
    this.prev = this.curr;
    this.curr = s;
    this.prevTime = this.currTime;
    this.currTime = performance.now();
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

    // Camera locked to the player, clamped to the world, snapped to whole pixels.
    let camX = player ? player.x : w / 2;
    let camY = player ? player.y : h / 2;
    if (w > VIEW_W) camX = Math.max(VIEW_W / 2, Math.min(w - VIEW_W / 2, camX));
    else camX = w / 2;
    if (h > VIEW_H) camY = Math.max(VIEW_H / 2, Math.min(h - VIEW_H / 2, camY));
    else camY = h / 2;

    const ox = Math.round(camX - VIEW_W / 2);
    const oy = Math.round(camY - VIEW_H / 2);

    this.ground.tilePosition.set(-ox, -oy);
    this.gemLayer.position.set(-ox, -oy);
    this.enemyLayer.position.set(-ox, -oy);

    this.syncEntities(
      this.gemSprites,
      this.gemLayer,
      getStore(this.curr, "gem"),
      this.textures.gem,
    );
    this.syncEntities(
      this.enemySprites,
      this.enemyLayer,
      getStore(this.curr, "enemy"),
      this.textures.enemy,
    );

    if (player) {
      this.playerSprite.visible = true;
      this.playerSprite.position.set(player.x - ox, player.y - oy);
      this.playerSprite.scale.x = player.fx < 0 ? -1 : 1;
      this.drawHpBar(player.x - ox, player.y - oy, player.hp, 100);
    } else {
      this.playerSprite.visible = false;
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
