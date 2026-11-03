// Champion sprite registry: id + class → rasterized pixel texture (D-048).
import type { Texture } from "pixi.js";
import type { ChampionSpriteStyle } from "./champion-palettes-a-m";
import { PALETTES_A_M } from "./champion-palettes-a-m";
import { PALETTES_N_Z } from "./champion-palettes-n-z";
import { DARK, type SpritePalette, cachedRasterize } from "./pixel-art";
import { TEMPLATES, type TemplateId } from "./sprite-templates";

const STYLES: Record<string, ChampionSpriteStyle> = {
  ...PALETTES_A_M,
  ...PALETTES_N_Z,
};

const CLASS_TEMPLATE: Record<string, TemplateId> = {
  mage: "mage",
  tank: "tank",
  fighter: "fighter",
  assassin: "assassin",
  marksman: "marksman",
  support: "support",
};

/** Fallback palette for unknown ids (matches the old flat player look). */
const FALLBACK: ChampionSpriteStyle = {
  hair: 0x8899aa,
  skin: 0xe8c8a8,
  cloth: 0x445068,
  accent: 0x58c8e8,
};

function paletteFor(style: ChampionSpriteStyle): SpritePalette {
  return {
    O: 0x10141c,
    S: style.skin,
    s: darken(style.skin, 0.72),
    H: style.hair,
    C: style.cloth,
    c: darken(style.cloth, 0.7),
    A: style.accent,
    M: 0x9aa4b2,
    E: 0x10141c,
    D: darken(style.cloth, 0.45),
  };
}

function darken(color: number, factor: number): number {
  const r = Math.round(((color >> 16) & 0xff) * factor);
  const g = Math.round(((color >> 8) & 0xff) * factor);
  const b = Math.round((color & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

/**
 * Texture for a champion. Falls back through: authored palette → class
 * template → generic. Unknown ids keep a sensible look.
 */
export function championSprite(characterId: string | undefined, className?: string): Texture {
  const id = characterId ?? "";
  const style = STYLES[id] ?? FALLBACK;
  const templateId = style.template ?? CLASS_TEMPLATE[className ?? ""] ?? "fighter";
  const template = TEMPLATES[templateId];
  return cachedRasterize(`champ:${id}:${templateId}`, template, {
    ...paletteFor(style),
    [DARK]: darken(style.cloth, 0.45),
  });
}

/** Data-URL portrait for DOM surfaces (HUD portrait, party frames). */
export function championSpriteDataURL(characterId: string | undefined, className?: string): string {
  const id = characterId ?? "";
  const style = STYLES[id] ?? FALLBACK;
  const templateId = style.template ?? CLASS_TEMPLATE[className ?? ""] ?? "fighter";
  const rows = TEMPLATES[templateId];
  const palette = paletteFor(style);
  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
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
  return canvas.toDataURL();
}
