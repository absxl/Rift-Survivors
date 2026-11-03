// Pixel-art runtime (docs/10 D-048): palette-indexed sprite matrices rasterized
// to Pixi textures at boot. All art is original, hand-authored as ASCII
// matrices; colors come from per-champion/per-enemy palettes. Nearest sampling
// keeps the pixel look; tints still multiply for hit-flash/downed states.
import { Texture } from "pixi.js";

export interface SpritePalette {
  /** Slot chars → hex colors. '.' is always transparent. */
  [slot: string]: number | undefined;
}

export const OUTLINE = "O";
export const SKIN = "S";
export const SKIN_DARK = "s";
export const HAIR = "H";
export const CLOTH = "C";
export const CLOTH_DARK = "c";
export const ACCENT = "A";
export const METAL = "M";
export const EYE = "E";
export const DARK = "D";

/** Rasterize an ASCII sprite matrix (rows of slot chars) into a Texture. */
export function rasterize(rows: string[], palette: SpritePalette): Texture {
  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const slot = rows[y][x];
      if (slot === "." || slot === " ") continue;
      const color = palette[slot];
      if (color === undefined) continue;
      ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const texture = Texture.from(canvas);
  texture.source.scaleMode = "nearest";
  return texture;
}

/** Keyed texture cache so each sprite rasterizes exactly once. */
const cache = new Map<string, Texture>();

export function cachedRasterize(key: string, rows: string[], palette: SpritePalette): Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const texture = rasterize(rows, palette);
  cache.set(key, texture);
  return texture;
}

/** Flip a matrix horizontally (for left-facing variants). */
export function flipRows(rows: string[]): string[] {
  return rows.map((row) => row.split("").reverse().join(""));
}

/** Shade every color of a palette toward dark (for downed/dead variants). */
export function shade(palette: SpritePalette, factor: number): SpritePalette {
  const out: SpritePalette = {};
  for (const [slot, color] of Object.entries(palette)) {
    if (color === undefined) continue;
    const r = Math.round(((color >> 16) & 0xff) * factor);
    const g = Math.round(((color >> 8) & 0xff) * factor);
    const b = Math.round((color & 0xff) * factor);
    out[slot] = (r << 16) | (g << 8) | b;
  }
  return out;
}
