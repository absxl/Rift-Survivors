// Procedural pixel-art placeholder textures (docs/06: no ripped assets; the game
// looks classic from day one). Real art goes in assets/local/ later; the loader
// will prefer it over these.
import { Texture } from "pixi.js";

const PX = 16;

function makeTexture(size: number, draw: (ctx: CanvasRenderingContext2D) => void): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas unavailable");
  ctx.imageSmoothingEnabled = false;
  draw(ctx);
  const texture = Texture.from(canvas);
  texture.source.scaleMode = "nearest";
  return texture;
}

export interface PlaceholderTextures {
  player: Texture;
  enemy: Texture;
  gem: Texture;
  projectile: Texture;
  ground: Texture;
}

export function createPlaceholderTextures(): PlaceholderTextures {
  const player = makeTexture(PX, (ctx) => {
    // Light base so the champion color tint reads clearly.
    ctx.fillStyle = "#c8d0dc";
    ctx.fillRect(3, 2, 10, 12);
    ctx.fillStyle = "#eef3f8";
    ctx.fillRect(3, 2, 10, 4);
    ctx.fillStyle = "#1a2230";
    ctx.fillRect(6, 5, 2, 2);
  });

  const enemy = makeTexture(PX, (ctx) => {
    ctx.fillStyle = "#a53a3a";
    ctx.fillRect(2, 2, 12, 12);
    ctx.fillStyle = "#cf5b5b";
    ctx.fillRect(2, 2, 12, 3);
    ctx.fillStyle = "#240e0e";
    ctx.fillRect(6, 6, 2, 2);
  });

  const gem = makeTexture(8, (ctx) => {
    ctx.fillStyle = "#1f8f6f";
    ctx.fillRect(3, 0, 2, 2);
    ctx.fillRect(1, 2, 6, 2);
    ctx.fillRect(3, 4, 2, 2);
    ctx.fillStyle = "#8ff0d0";
    ctx.fillRect(3, 2, 1, 1);
  });

  const projectile = makeTexture(4, (ctx) => {
    ctx.fillStyle = "#ffe066";
    ctx.fillRect(1, 0, 2, 4);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(1, 1, 2, 2);
  });

  const ground = makeTexture(PX, (ctx) => {
    ctx.fillStyle = "#101820";
    ctx.fillRect(0, 0, PX, PX);
    ctx.fillStyle = "#151f29";
    ctx.fillRect(0, 0, PX, 1);
    ctx.fillRect(0, 0, 1, PX);
    ctx.fillStyle = "#0c1319";
    ctx.fillRect(PX - 1, 0, 1, PX);
    ctx.fillRect(0, PX - 1, PX, 1);
  });

  return { player, enemy, gem, projectile, ground };
}
