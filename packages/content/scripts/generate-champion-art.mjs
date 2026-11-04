// Generates the official-art-derived game art (docs/10 D-054): per champion
// and per obtainable skin, a 16x16 indexed icon sprite and a 120x68 quantized
// splash card, sourced from Riot's public Data Dragon CDN. Owner-approved for
// this private fan project. Run: node packages/content/scripts/generate-champion-art.mjs
// Outputs (committed): packages/client/public/art/** + manifest + skins registry.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// scripts -> content -> packages -> repo root
const ROOT = path.dirname(path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))));
const ART_DIR = path.join(ROOT, "packages/client/public/art");
const CACHE = path.join(process.env.TEMP ?? ROOT, "rift-art-cache");
const OUT_MANIFEST = path.join(ROOT, "packages/client/src/assets/art-manifest.generated.ts");
const OUT_SKINS = path.join(ROOT, "packages/content/src/champions/skins.generated.ts");
const DDRAGON_VERSION = "16.21.1";
const DDRAGON = `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}`;

const ICON_SIZE = 16;
const CARD_W = 480;
const CARD_H = 272;

// The 8 hand-authored champions from lol.ts (roster.ts holds the other 165).
const CUSTOM_IDS = ["lux", "brand", "ahri", "ryze", "syndra", "veigar", "annie", "xerath"];

async function fetchCached(url, key) {
  const file = path.join(CACHE, `${key}.bin`);
  try {
    return await fs.readFile(file);
  } catch {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(file, buffer);
    return buffer;
  }
}

async function fetchJson(url, key) {
  const raw = await fetchCached(url, key);
  return JSON.parse(raw.toString("utf8"));
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index).catch((error) => ({ error }));
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

async function readRoster() {
  const source = await fs.readFile(path.join(ROOT, "packages/content/src/packs/roster.ts"), "utf8");
  const champions = [];
  const pattern = /champion\(\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]*)",\s*"([^"]*)"/g;
  for (const m of source.matchAll(pattern)) {
    champions.push({ id: m[1], name: m[2] });
  }
  return champions;
}

/** Skin selection: 2 for champions with <=5 real skins, floor(n/2) above. */
function obtainableSkins(skins) {
  const real = skins.filter((s) => s.num !== 0);
  const count = real.length <= 5 ? Math.min(2, real.length) : Math.floor(real.length / 2);
  if (count === 0) return [];
  // Evenly spaced across the list so each era of the champion is represented.
  const picked = [];
  for (let i = 0; i < count; i++) {
    const index = Math.round(((i + 0.5) / count) * real.length) - 1;
    picked.push(real[Math.max(0, Math.min(real.length - 1, index))]);
  }
  return picked;
}

async function writeIcon(buffer, outPath) {
  await sharp(buffer)
    .resize(ICON_SIZE, ICON_SIZE, { fit: "cover" })
    .png({ palette: true, colors: 32, compressionLevel: 9 })
    .toFile(outPath);
}

async function writeCard(buffer, outPath) {
  await sharp(buffer)
    .resize(CARD_W, CARD_H, { fit: "cover", position: "attention" })
    .png({ palette: true, colors: 48, compressionLevel: 9 })
    .toFile(outPath);
}

/** Same slug rule as generate-roster.mjs, used to match roster ids to
 * Data Dragon's internal champion keys via the champion's display name. */
function slug(name) {
  return name
    .toLowerCase()
    .replace(/['’\.&]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  await fs.mkdir(CACHE, { recursive: true });
  await fs.mkdir(path.join(ART_DIR, "icon"), { recursive: true });
  await fs.mkdir(path.join(ART_DIR, "card"), { recursive: true });

  const roster = await readRoster();
  const all = [
    ...roster,
    ...CUSTOM_IDS.filter((id) => !roster.some((r) => r.id === id)).map((id) => ({ id, name: id })),
  ].sort((a, b) => a.id.localeCompare(b.id));
  if (all.length !== 173) throw new Error(`expected 173 champions, parsed ${all.length}`);

  // One index fetch: map slug(name) -> Data Dragon internal key (e.g.
  // "Nunu & Willump" -> "Nunu", "Wukong" -> "MonkeyKing").
  const index = await fetchJson(`${DDRAGON}/data/en_US/champion.json`, "champion-index");
  const bySlug = new Map();
  for (const champion of Object.values(index.data)) {
    bySlug.set(slug(champion.name), champion.id);
    bySlug.set(champion.name.toLowerCase(), champion.id);
    bySlug.set(champion.id.toLowerCase(), champion.id);
  }

  const manifest = {};
  const skinRegistry = {};
  const warnings = [];

  await mapLimit(all, 8, async (entry) => {
    const camel = bySlug.get(slug(entry.name)) ?? bySlug.get(entry.id.toLowerCase());
    if (!camel) {
      warnings.push(`${entry.id}: no ddragon key for "${entry.name}"`);
      return;
    }
    let champData = null;
    try {
      champData = await fetchJson(`${DDRAGON}/data/en_US/champion/${camel}.json`, `json-${camel}`);
    } catch {
      warnings.push(`${entry.id}: no ddragon data (${camel})`);
      return;
    }
    const champion = Object.values(champData.data)[0];
    const skins = champion.skins ?? [];
    const picked = obtainableSkins(skins);
    skinRegistry[entry.id] = {
      total: Math.max(0, skins.length - 1),
      obtainable: picked.map((s) => ({ num: s.num, name: s.name })),
    };

    const art = { icon: true, card: true, skins: [] };
    try {
      const icon = await fetchCached(
        `${DDRAGON}/img/champion/${champion.image.full}`,
        `icon-${camel}-0`,
      );
      await writeIcon(icon, path.join(ART_DIR, "icon", `${entry.id}.png`));
      const splash = await fetchCached(
        `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${camel}_0.jpg`,
        `splash-${camel}-0`,
      );
      await writeCard(splash, path.join(ART_DIR, "card", `${entry.id}.png`));
    } catch (error) {
      warnings.push(`${entry.id}: base art failed (${error.message})`);
      art.icon = false;
      art.card = false;
    }

    for (const skin of picked) {
      try {
        const icon = await fetchCached(
          `${DDRAGON}/img/champion/${camel}_${skin.num}.png`,
          `icon-${camel}-${skin.num}`,
        );
        await writeIcon(icon, path.join(ART_DIR, "icon", `${entry.id}_${skin.num}.png`));
        const splash = await fetchCached(
          `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${camel}_${skin.num}.jpg`,
          `splash-${camel}-${skin.num}`,
        );
        await writeCard(splash, path.join(ART_DIR, "card", `${entry.id}_${skin.num}.png`));
        art.skins.push(skin.num);
      } catch (error) {
        warnings.push(`${entry.id} skin ${skin.num}: ${error.message}`);
      }
    }
    manifest[entry.id] = art;
  });

  const withIcon = Object.values(manifest).filter((m) => m.icon).length;
  if (withIcon !== 173) {
    console.error(`FAIL: only ${withIcon}/173 champion icons generated. Warnings:`);
    for (const warning of warnings) console.error(" -", warning);
    process.exitCode = 1;
  } else {
    console.log(
      `OK: 173 champion icons, ${Object.values(manifest).reduce((n, m) => n + m.skins.length, 0)} skin icons`,
    );
    for (const warning of warnings) console.log(" -", warning);
  }

  const manifestOut = `// GENERATED by scripts/generate-champion-art.mjs — do not edit by hand.
// Official-art-derived game art manifest (docs/10 D-054). The game reads
// packages/client/public/art/** at runtime; this table tells it what exists.
export interface ArtManifestEntry {
  icon: boolean;
  card: boolean;
  skins: number[];
}

export const CHAMPION_ART: Record<string, ArtManifestEntry> = ${JSON.stringify(manifest, null, 2)};
`;
  await fs.writeFile(OUT_MANIFEST, manifestOut, "utf8");

  const skinsOut = `// GENERATED by scripts/generate-champion-art.mjs — do not edit by hand.
// Obtainable skins per champion (docs/10 D-054/D-055): 2 when the champion has
// <= 5 real skins, floor(n/2) above, evenly spaced across the list. Sources:
// Data Dragon ${DDRAGON_VERSION} champion JSON (verified ${new Date().toISOString().slice(0, 10)}).
export interface ObtainableSkin {
  num: number;
  name: string;
}

export interface ChampionSkinData {
  total: number;
  obtainable: ObtainableSkin[];
}

export const CHAMPION_SKINS: Record<string, ChampionSkinData> = ${JSON.stringify(skinRegistry, null, 2)};
`;
  await fs.writeFile(OUT_SKINS, skinsOut, "utf8");
  console.log(`wrote ${OUT_MANIFEST} and ${OUT_SKINS}`);
}

main();
