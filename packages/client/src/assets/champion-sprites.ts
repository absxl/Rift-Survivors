// Champion sprite registry: id (+skin) → official-art pixel texture (D-054),
// falling back to the D-048 template raster while art loads or on miss.
import { Assets, type Texture } from "pixi.js";
import { CHAMPION_ART } from "./art-manifest.generated";
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

/** Loaded official-art textures: `champ:{id}:{skinNum|default}` → Texture. */
const artTextures = new Map<string, Texture>();

/**
 * Preload the official-art icon sprites referenced by the run/party roster.
 * Call once at boot before the first run; misses fall back to template art.
 */
export async function preloadChampionArt(characterIds: string[]): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (const id of characterIds) {
    if (!CHAMPION_ART[id]?.icon || artTextures.has(`champ:${id}:default`)) continue;
    jobs.push(
      Assets.load(`art/icon/${id}.png`).then((texture: Texture) => {
        artTextures.set(`champ:${id}:default`, texture);
      }),
    );
  }
  await Promise.allSettled(jobs);
}

/** Public URL of a champion/skin icon for DOM surfaces, or "" on miss. */
export function championIconURL(characterId: string | undefined, skinNum?: number): string {
  const id = characterId ?? "";
  if (!id) return "";
  if (skinNum !== undefined) {
    return CHAMPION_ART[id]?.skins.includes(skinNum) ? `art/icon/${id}_${skinNum}.png` : "";
  }
  return CHAMPION_ART[id]?.icon ? `art/icon/${id}.png` : "";
}

/** Public URL of a pixelated splash card for DOM surfaces, or "" on miss. */
export function championCardURL(characterId: string | undefined, skinNum?: number): string {
  const id = characterId ?? "";
  if (!id) return "";
  if (skinNum !== undefined) {
    return CHAMPION_ART[id]?.skins.includes(skinNum) ? `art/card/${id}_${skinNum}.png` : "";
  }
  return CHAMPION_ART[id]?.card ? `art/card/${id}.png` : "";
}

/**
 * Texture for a champion (optionally a skin). Official art first; falls back
 * through: authored palette → class template → generic.
 */
export function championSprite(
  characterId: string | undefined,
  className?: string,
  skinNum?: number,
): Texture {
  const id = characterId ?? "";
  const artKey = skinNum === undefined ? `champ:${id}:default` : `champ:${id}:${skinNum}`;
  const art = artTextures.get(artKey);
  if (art) return art;
  const style = STYLES[id] ?? FALLBACK;
  const templateId = style.template ?? CLASS_TEMPLATE[className ?? ""] ?? "fighter";
  const template = TEMPLATES[templateId];
  return cachedRasterize(`champ:${id}:${templateId}`, template, {
    ...paletteFor(style),
    [DARK]: darken(style.cloth, 0.45),
  });
}

/** Data-URL portrait for DOM surfaces that need pixel data instead of a URL. */
export function championSpriteDataURL(characterId: string | undefined, className?: string): string {
  const url = championIconURL(characterId);
  if (url) return url;
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
