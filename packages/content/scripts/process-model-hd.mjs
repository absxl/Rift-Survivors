// Processes raw model-viewer captures into HD playable character renders
// (docs/10 D-057): full-resolution keyed cutouts — NOT pixelated — for the
// re-resolved 1600x900 game. Each capture holds the champion model twice
// (stacked viewports) on a uniform dark background; this keys it out via
// border flood-fill, picks the cleaner half, tight-crops, and writes
// packages/client/public/art/model/{id}.png.
// Run: node packages/content/scripts/process-model-hd.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// scripts -> content -> packages -> repo root
const ROOT = path.dirname(path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))));
const CAPTURES = path.join(ROOT, ".art-captures");
const OUT = path.join(ROOT, "packages/client/public/art/model");
const OUT_SKINS = path.join(ROOT, "packages/client/public/art/model-skin");
const BG = [23, 23, 23]; // viewer background #171717
const KEY_TOLERANCE = 38;
const MAX_DIM = 512; // HD render bound (fits a 96px on-screen unit at 5x zoom)

/** Flood-fill key from the borders: the background is edge-connected and
 * within tolerance of #171717; the model is a single connected blob. */
function keyBackground(data, width, height) {
  const isBg = new Uint8Array(width * height);
  const near = (i) => {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const dr = r - BG[0];
    const dg = g - BG[1];
    const db = b - BG[2];
    return Math.sqrt(dr * dr + dg * dg + db * db) <= KEY_TOLERANCE;
  };
  const queue = [];
  for (let x = 0; x < width; x++) queue.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) queue.push(y * width, y * width + width - 1);
  while (queue.length > 0) {
    const i = queue.pop();
    if (isBg[i] || !near(i)) continue;
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

function viewInfoHeight(view) {
  return view.height;
}

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
  return count > 300 ? { minX, minY, maxX, maxY, count } : null;
}

async function processOne(id, outDir) {
  const input = path.join(CAPTURES, `${id}.png`);
  try {
    await fs.access(input);
  } catch {
    return "missing";
  }
  const raw = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // Trim the viewer's bottom UI strip (health-bar edge leaks into the canvas).
  const trimBottom = 26;
  const trimmed = await sharp(raw.data, {
    raw: { width: raw.info.width, height: raw.info.height, channels: 4 },
  })
    .extract({ left: 0, top: 0, width: raw.info.width, height: raw.info.height - trimBottom })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const full = trimmed.data;
  const fullInfo = trimmed.info;
  const half = Math.floor(fullInfo.height / 2);
  // The two stacked viewports are separated by a ~32px white divider; it
  // intrudes into the last rows of the top half and the first rows of the
  // bottom half, so both candidate views exclude the divider band entirely.
  const views = [
    { label: "top", top: 0, height: half - 8 },
    { label: "bottom", top: half + 34, height: fullInfo.height - half - 34 },
  ];

  const candidates = [];
  for (const viewInfo of views) {
    const view = full.subarray(
      viewInfo.top * fullInfo.width * 4,
      (viewInfo.top + viewInfo.height) * fullInfo.width * 4,
    );
    const mask = keyBackground(view, fullInfo.width, viewInfo.height);
    const bounds = contentBounds(mask, fullInfo.width, viewInfo.height);
    if (bounds) candidates.push({ ...viewInfo, view, mask, bounds });
  }
  if (candidates.length === 0) return "empty";
  candidates.sort((a, b) => b.bounds.count - a.bounds.count);
  const best = candidates[0];

  // Drop small disconnected foreground components (viewer UI remnants like
  // health-bar dashes) — keep only blobs at least 3% of the largest.
  const w = fullInfo.width;
  const h = viewInfoHeight(best);
  const seen = new Uint8Array(w * h);
  const keep = new Uint8Array(w * h);
  const sizes = [];
  const components = [];
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || !best.mask[start]) continue;
    const stack = [start];
    seen[start] = 1;
    const members = [];
    while (stack.length > 0) {
      const i = stack.pop();
      members.push(i);
      const x = i % w;
      const y = (i / w) | 0;
      for (const n of [
        x > 0 ? i - 1 : -1,
        x < w - 1 ? i + 1 : -1,
        y > 0 ? i - w : -1,
        y < h - 1 ? i + w : -1,
      ]) {
        if (n >= 0 && !seen[n] && best.mask[n]) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    sizes.push(members.length);
    components.push(members);
  }
  const largest = Math.max(...sizes, 0);
  for (const members of components) {
    if (members.length >= largest * 0.03) {
      for (const i of members) keep[i] = 1;
    }
  }
  for (let i = 0; i < w * h; i++) best.mask[i] = keep[i];
  best.bounds = contentBounds(best.mask, w, h);
  if (!best.bounds) return "empty";
  const pad = 8;
  const x0 = Math.max(0, best.bounds.minX - pad);
  const y0 = Math.max(0, best.bounds.minY - pad);
  const x1 = Math.min(fullInfo.width, best.bounds.maxX + pad + 1);
  const y1 = Math.min(best.height, best.bounds.maxY + pad + 1);
  const cropW = x1 - x0;
  const cropH = y1 - y0;

  const crop = Buffer.alloc(cropW * cropH * 4);
  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      const src = ((y0 + y) * fullInfo.width + (x0 + x)) * 4;
      const dst = (y * cropW + x) * 4;
      const fg = best.mask[(y0 + y) * fullInfo.width + (x0 + x)];
      crop[dst] = best.view[src];
      crop[dst + 1] = best.view[src + 1];
      crop[dst + 2] = best.view[src + 2];
      crop[dst + 3] = fg ? 255 : 0;
    }
  }
  await sharp(crop, { raw: { width: cropW, height: cropH, channels: 4 } })
    .resize(MAX_DIM, MAX_DIM, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 92, alphaQuality: 90 })
    .toFile(path.join(outDir, `${id}.webp`));
  return `${best.label} ${cropW}x${cropH}`;
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  await fs.mkdir(OUT_SKINS, { recursive: true });
  const keyMap = JSON.parse(await fs.readFile(path.join(CAPTURES, "keymap.json"), "utf8"));
  const skinQueue = JSON.parse(await fs.readFile(path.join(CAPTURES, "skin-queue.json"), "utf8"));
  const failed = [];
  let ok = 0;
  for (const id of Object.keys(keyMap).sort()) {
    try {
      const result = await processOne(id, OUT);
      if (result === "missing" || result === "empty") failed.push(id);
      else ok++;
    } catch (error) {
      console.error(` ${id}: ERR ${error.message.slice(0, 60)}`);
      failed.push(id);
    }
  }
  for (const entry of skinQueue) {
    try {
      const result = await processOne(entry.id, OUT_SKINS);
      if (result === "missing" || result === "empty") failed.push(entry.id);
      else ok++;
    } catch (error) {
      console.error(` ${entry.id}: ERR ${error.message.slice(0, 60)}`);
      failed.push(entry.id);
    }
  }
  console.log(`OK ${ok} HD renders -> ${OUT}`);
  if (failed.length > 0) console.log("failed:", failed.join(", "));
}

main();
