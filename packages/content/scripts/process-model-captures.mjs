// Processes raw model-viewer captures (.art-captures/{id}.png) into playable
// character sprites (docs/10 D-057): each capture holds the champion model on
// a uniform dark background, keyed out here, then tight-cropped and quantized
// to a 16x24 indexed sprite at public/art/sprite/{id}.png.
// Run: node packages/content/scripts/process-model-captures.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// scripts -> content -> packages -> repo root
const ROOT = path.dirname(path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))));
const CAPTURES = path.join(ROOT, ".art-captures");
const OUT = path.join(ROOT, "packages/client/public/art/sprite");
const BG = [23, 23, 23]; // viewer background #171717
const BG_TOLERANCE = 26; // also absorbs the faint watermark pattern
const SPRITE_W = 16;
const SPRITE_H = 24;

/** Alpha-mask the background via flood fill from the borders: the viewer
 * background (plus its faint watermark pattern) is edge-connected and within
 * tolerance of #171717, while the model is a single connected blob. This keeps
 * dark and white models intact where global color matching over-pruned. */
function keyBackground(data, width, height) {
  const isBg = new Uint8Array(width * height);
  const nearBackground = (i) => {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const dr = r - BG[0];
    const dg = g - BG[1];
    const db = b - BG[2];
    return Math.sqrt(dr * dr + dg * dg + db * db) <= BG_TOLERANCE + 12;
  };
  const queue = [];
  for (let x = 0; x < width; x++) {
    queue.push(x, (height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    queue.push(y * width, y * width + width - 1);
  }
  while (queue.length > 0) {
    const i = queue.pop();
    if (isBg[i] || !nearBackground(i)) continue;
    isBg[i] = 1;
    const x = i % width;
    const y = (i / width) | 0;
    if (x > 0) queue.push(i - 1);
    if (x < width - 1) queue.push(i + 1);
    if (y > 0) queue.push(i - width);
    if (y < height - 1) queue.push(i + width);
  }
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) mask[i] = isBg[i] ? 0 : 1;
  return mask;
}

/** Tight bounding box of foreground pixels; null when the half is empty. */
function contentBounds(mask, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return count > 200 ? { minX, minY, maxX, maxY, count } : null;
}

async function processOne(id) {
  const input = path.join(CAPTURES, `${id}.png`);
  try {
    await fs.access(input);
  } catch {
    return "missing";
  }
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const half = Math.floor(info.height / 2);

  const candidates = [];
  for (const [label, top] of [
    ["top", 0],
    ["bottom", half],
  ]) {
    const view = data.subarray(top * info.width * 4, (top + half) * info.width * 4);
    const mask = keyBackground(view, info.width, half);
    const bounds = contentBounds(mask, info.width, half);
    if (bounds) candidates.push({ label, view, mask, bounds });
  }
  if (candidates.length === 0) return "empty";
  // Prefer the half with the most foreground content.
  candidates.sort((a, b) => b.bounds.count - a.bounds.count);
  const best = candidates[0];

  const pad = 6;
  const x0 = Math.max(0, best.bounds.minX - pad);
  const y0 = Math.max(0, best.bounds.minY - pad);
  const x1 = Math.min(info.width, best.bounds.maxX + pad + 1);
  const y1 = Math.min(half, best.bounds.maxY + pad + 1);
  const cropW = x1 - x0;
  const cropH = y1 - y0;

  const crop = Buffer.alloc(cropW * cropH * 4);
  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      const src = ((y0 + y) * info.width + (x0 + x)) * 4;
      const dst = (y * cropW + x) * 4;
      const fg = best.mask[(y0 + y) * info.width + (x0 + x)];
      crop[dst] = best.view[src];
      crop[dst + 1] = best.view[src + 1];
      crop[dst + 2] = best.view[src + 2];
      crop[dst + 3] = fg ? 255 : 0;
    }
  }
  await sharp(crop, { raw: { width: cropW, height: cropH, channels: 4 } })
    .resize(SPRITE_W, SPRITE_H, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ palette: true, colors: 24, compressionLevel: 9 })
    .toFile(path.join(OUT, `${id}.png`));
  return `${best.label} ${cropW}x${cropH}`;
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const keyMap = JSON.parse(await fs.readFile(path.join(CAPTURES, "keymap.json"), "utf8"));
  const ids = Object.keys(keyMap).sort();
  const results = {};
  const failed = [];
  for (const id of ids) {
    try {
      results[id] = await processOne(id);
      if (results[id] === "missing" || results[id] === "empty") failed.push(id);
    } catch (error) {
      results[id] = `ERR ${error.message.slice(0, 60)}`;
      failed.push(id);
    }
  }
  const ok = ids.length - failed.length;
  console.log(`OK ${ok}/${ids.length} sprites`);
  if (failed.length > 0) console.log("failed:", failed.join(", "));
  for (const [id, r] of Object.entries(results).slice(0, 8)) console.log(` ${id}: ${r}`);
}

main();
