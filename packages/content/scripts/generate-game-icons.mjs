// Generates real in-game icons (docs/10 D-059):
//   - ability icons for every authored champion kit ({id}-q / {id}-r) from
//     Data Dragon spell images (spells[0] = Q, spells[3] = R)
//   - item icons for the whole shop from CommunityDragon item data, which
//     covers removed nostalgia items as well as live ones
// Outputs committed to packages/client/public/art/{ability,item}/ plus
// manifest TS so the client knows what exists. Never fetched at runtime.
// Run: node packages/content/scripts/generate-game-icons.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// scripts -> content -> packages -> repo root
const ROOT = path.dirname(path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))));
const ART = path.join(ROOT, "packages/client/public/art");
const CACHE = path.join(process.env.TEMP ?? ROOT, "rift-icons-cache");
const DDRAGON_VERSION = "16.21.1";
const DDRAGON = `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}`;
const CDRAGON_ITEMS =
  "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/items.json";
const CDRAGON_ASSET =
  "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default";
const ICON_SIZE = 96;

const CUSTOM_IDS = ["lux", "brand", "ahri", "ryze", "syndra", "veigar", "annie", "xerath"];

// shop item id -> live LoL item name (CommunityDragon "name" / "localizedName")
const ITEM_NAMES = {
  "long-sword": "Long Sword",
  dagger: "Dagger",
  "cloack-of-agility": "Cloak of Agility",
  pickaxe: "Pickaxe",
  "bf-sword": "B. F. Sword",
  "amplifying-tome": "Amplifying Tome",
  "blasting-wand": "Blasting Wand",
  "needlessly-large-rod": "Needlessly Large Rod",
  "aether-wisp": "Aether Wisp",
  "ruby-crystal": "Ruby Crystal",
  "giants-belt": "Giant's Belt",
  "kindle-gem": "Kindlegem",
  "cloth-armor": "Cloth Armor",
  "chain-vest": "Chain Vest",
  "null-magic-mantle": "Null-Magic Mantle",
  "negatron-cloak": "Negatron Cloak",
  "rejuvenation-bead": "Rejuvenation Bead",
  "faerie-charm": "Faerie Charm",
  "sapphire-crystal": "Sapphire Crystal",
  sheen: "Sheen",
  "trinity-force": "Trinity Force",
  hexdrinker: "Hexdrinker",
  "maw-of-malmortius": "Maw of Malmortius",
  "haunting-guise": "Haunting Guise",
  "bami-cinder": "Bami's Cinder",
  "bramble-vest": "Bramble Vest",
  "spectre-cowl": "Spectre's Cowl",
  "infinity-edge": "Infinity Edge",
  "rabadons-deathcap": "Rabadon's Deathcap",
  "ludens-companion": "Luden's Echo", // current live name; older shop name kept
  "liandrys-torment": "Liandry's Torment",
  "kraken-slayer": "Kraken Slayer",
  "the-collector": "The Collector",
  bloodthirster: "Bloodthirster",
  "navori-flickerblade": "Navori Flickerblade",
  "rapid-firecannon": "Rapid Firecannon",
  "runaans-hurricane": "Runaan's Hurricane",
  "rod-of-ages": "Rod of Ages",
  "archangels-staff": "Archangel's Staff",
  "void-staff": "Void Staff",
  shadowflame: "Shadowflame",
  morellonomicon: "Morellonomicon",
  "nashors-tooth": "Nashor's Tooth",
  "zhonyas-hourglass": "Zhonya's Hourglass",
  "banshees-veil": "Banshee's Veil",
  thornmail: "Thornmail",
  "warmogs-armor": "Warmog's Armor",
  "dead-mans-plate": "Dead Man's Plate",
  "randuins-omen": "Randuin's Omen",
  "frozen-heart": "Frozen Heart",
  "deaths-dance": "Death's Dance",
  "sterakks-gage": "Sterak's Gage",
  "gargoyle-stoneplate": "Gargoyle Stoneplate",
  "guardian-angel": "Guardian Angel",
  "knights-vow": "Knight's Vow",
  "zekes-convergence": "Zeke's Convergence",
  redemption: "Redemption",
  "ardent-censer": "Ardent Censer",
  "staff-of-flowing-water": "Staff of Flowing Water",
  "mikaels-blessing": "Mikael's Blessing",
  "force-of-nature": "Force of Nature",
  "deathfire-grasp": "Deathfire Grasp",
  "heart-of-gold": "Heart of Gold",
  "innervating-locket": "Innervating Locket",
  ohmwrecker: "Ohmwrecker",
  "atmas-impaler": "Atma's Impaler",
  "moonflair-spellblade": "Moonflair Spellblade",
  "twin-shadows": "Twin Shadows",
  "executioners-calling": "Executioner's Calling",
};

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

const normalize = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

async function main() {
  await fs.mkdir(CACHE, { recursive: true });
  await fs.mkdir(path.join(ART, "ability"), { recursive: true });
  await fs.mkdir(path.join(ART, "item"), { recursive: true });

  // ---- Ability icons --------------------------------------------------------
  const rosterText = await fs.readFile(
    path.join(ROOT, "packages/content/src/packs/roster.ts"),
    "utf8",
  );
  const roster = [];
  for (const m of rosterText.matchAll(/champion\(\s*"([^"]+)",\s*"([^"]+)"/g)) {
    roster.push({ id: m[1], name: m[2] });
  }
  const all = [
    ...roster,
    ...CUSTOM_IDS.filter((id) => !roster.some((r) => r.id === id)).map((id) => ({ id, name: id })),
  ].sort((a, b) => a.id.localeCompare(b.id));
  if (all.length !== 173) throw new Error(`expected 173 champions, got ${all.length}`);

  const slug = (name) =>
    name
      .toLowerCase()
      .replace(/['’\.&]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const index = JSON.parse(
    (await fetchCached(`${DDRAGON}/data/en_US/champion.json`, "champion-index")).toString("utf8"),
  );
  const keyBySlug = new Map();
  for (const champion of Object.values(index.data)) {
    keyBySlug.set(slug(champion.name), champion.id);
    keyBySlug.set(champion.name.toLowerCase(), champion.id);
    keyBySlug.set(champion.id.toLowerCase(), champion.id);
  }
  const keyOverrides = { "nunu-willump": "Nunu", "renata-glasc": "Renata", wukong: "MonkeyKing" };

  const abilityManifest = {};
  const abilityWarnings = [];
  await mapLimit(all, 4, async (entry) => {
    const key =
      keyOverrides[entry.id] ??
      keyBySlug.get(slug(entry.name)) ??
      keyBySlug.get(entry.id.toLowerCase());
    if (!key) {
      abilityWarnings.push(`${entry.id}: no ddragon key`);
      return;
    }
    let champData;
    try {
      champData = JSON.parse(
        (await fetchCached(`${DDRAGON}/data/en_US/champion/${key}.json`, `champ-${key}`)).toString(
          "utf8",
        ),
      );
    } catch (error) {
      abilityWarnings.push(`${entry.id}: champion json ${error.message}`);
      return;
    }
    const champion = Object.values(champData.data)[0];
    const spells = champion.spells ?? [];
    const picks = [
      ["q", spells[0]],
      ["r", spells[3]],
    ];
    abilityManifest[entry.id] = {};
    for (const [slot, spell] of picks) {
      if (!spell?.image?.full) {
        abilityWarnings.push(`${entry.id}-${slot}: no spell image`);
        continue;
      }
      try {
        const png = await fetchCached(
          `${DDRAGON}/img/spell/${spell.image.full}`,
          `spell-${spell.image.full}`,
        );
        await sharp(png)
          .resize(ICON_SIZE, ICON_SIZE, { fit: "cover" })
          .webp({ quality: 90 })
          .toFile(path.join(ART, "ability", `${entry.id}-${slot}.webp`));
        abilityManifest[entry.id][slot] = true;
      } catch (error) {
        abilityWarnings.push(`${entry.id}-${slot}: ${error.message}`);
      }
    }
  });

  // ---- Item icons -----------------------------------------------------------
  const itemsJson = JSON.parse(
    (await fetchCached(CDRAGON_ITEMS, "cdragon-items")).toString("utf8"),
  );
  const byNormalizedName = new Map();
  for (const item of itemsJson) {
    for (const candidate of [item.name, item.localizedName]) {
      if (candidate && !byNormalizedName.has(normalize(candidate))) {
        byNormalizedName.set(normalize(candidate), item);
      }
    }
  }

  const itemManifest = {};
  const itemWarnings = [];
  await mapLimit(Object.entries(ITEM_NAMES), 4, async ([id, name]) => {
    const match = byNormalizedName.get(normalize(name));
    if (!match?.iconPath) {
      itemWarnings.push(`${id}: no CDragon match for "${name}"`);
      return;
    }
    try {
      // iconPath looks like "/LoL-Game-Data/assets/ASSETS/Items/Icons2D/x.png";
      // the CDN serves it as ".../default/assets/items/icons2d/x.png".
      const rel = match.iconPath.split(/assets\//i).pop() ?? "";
      const assetUrl = `${CDRAGON_ASSET}/assets/${rel.toLowerCase()}`;
      const png = await fetchCached(assetUrl, `item-${match.id}`);
      await sharp(png)
        .resize(ICON_SIZE, ICON_SIZE, { fit: "cover" })
        .webp({ quality: 90 })
        .toFile(path.join(ART, "item", `${id}.webp`));
      itemManifest[id] = true;
    } catch (error) {
      itemWarnings.push(`${id}: ${error.message}`);
    }
  });

  const abilityCount = Object.values(abilityManifest).reduce(
    (n, slots) => n + Object.keys(slots).length,
    0,
  );
  const itemCount = Object.keys(itemManifest).length;
  console.log(
    `OK: ${abilityCount} ability icons (${Object.keys(abilityManifest).length} champions), ${itemCount}/${Object.keys(ITEM_NAMES).length} item icons`,
  );
  for (const warning of [...abilityWarnings, ...itemWarnings]) console.log(" -", warning);

  const manifestOut = `// GENERATED by scripts/generate-game-icons.mjs — do not edit by hand.
// Real in-game icon manifest (docs/10 D-059): Data Dragon spell art + 
// CommunityDragon item art. Files live in public/art/{ability,item}/.
export const ABILITY_ICONS: Record<string, Partial<Record<"q" | "r", boolean>>> = ${JSON.stringify(abilityManifest, null, 2)};

export const ITEM_ICONS: Record<string, boolean> = ${JSON.stringify(itemManifest, null, 2)};
`;
  await fs.writeFile(
    path.join(ROOT, "packages/client/src/assets/icon-manifest.generated.ts"),
    manifestOut,
    "utf8",
  );
  console.log("wrote icon-manifest.generated.ts");
}

main();
