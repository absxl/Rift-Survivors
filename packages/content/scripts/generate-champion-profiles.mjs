// One-off profile audit/generator. Fetches the official champion page and the
// wiki Universe page, normalizes region associations, and writes a checked-in
// profile data file. Run from the repo root:
//
//   node packages/content/scripts/generate-champion-profiles.mjs
//
// Network data is only used while generating; the game never fetches at runtime.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const CACHE = join(process.env.TEMP ?? ROOT, "rift-profile-cache");
const VERIFIED = "2026-10-29";
const OFFICIAL_BASE = "https://www.leagueoflegends.com/en-au/champions/";
const WIKI_BASE = "https://wiki.leagueoflegends.com/en-us/";
const OFFICIAL_SLUGS = new Map([
  ["nunu-willump", "nunu"],
  ["renata-glasc", "renata"],
  ["wukong", "monkeyking"],
]);

const CUSTOM = [
  { id: "ahri", name: "Ahri", title: "the Nine-Tailed Fox", region: "Ionia" },
  { id: "lux", name: "Lux", title: "the Lady of Luminosity", region: "Demacia" },
  { id: "brand", name: "Brand", title: "the Burning Vengeance", region: "Noxus" },
  { id: "annie", name: "Annie", title: "the Dark Child", region: "Noxus" },
  { id: "syndra", name: "Syndra", title: "the Dark Sovereign", region: "Ionia" },
  { id: "veigar", name: "Veigar", title: "the Tiny Master of Evil", region: "Bandle City" },
  { id: "xerath", name: "Xerath", title: "the Magus Ascendant", region: "Shurima" },
  { id: "ryze", name: "Ryze", title: "the Rune Mage", region: "Runeterra" },
];

const REGIONS = [
  "Bandle City",
  "Bilgewater",
  "Demacia",
  "Freljord",
  "Ionia",
  "Ixtal",
  "Mount Targon",
  "Noxus",
  "Piltover",
  "Runeterra",
  "Shadow Isles",
  "Shurima",
  "Void",
  "Zaun",
];

const REGION_ALIASES = new Map([
  ["targon", "Mount Targon"],
  ["mount targon", "Mount Targon"],
  ["the freljord", "Freljord"],
  ["freljord", "Freljord"],
  ["the void", "Void"],
  ["void", "Void"],
  ["shuriman", "Shurima"],
  ["shurima", "Shurima"],
  ["bandle city", "Bandle City"],
]);

function canonicalRegion(value) {
  const cleaned = value
    .replace(/\{\{[^|}]*\|/g, "")
    .replace(/\[\[|\]\]/g, "")
    .replace(/\}\}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return REGION_ALIASES.get(cleaned.toLowerCase()) ?? (REGIONS.includes(cleaned) ? cleaned : null);
}

function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function plain(value) {
  return decodeEntities(
    String(value ?? "")
      .replace(/\{\{[^{}]*\}\}/g, "")
      .replace(/\[\[[^|\]]*\|([^\]]*)\]\]/g, "$1")
      .replace(/\[\[([^\]]*)\]\]/g, "$1")
      .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function cleanList(value) {
  const parts = plain(value)
    .replace(/\|\w+\s*=/g, " ")
    .split(/\s*\*\s*/)
    .map((part) => part.replace(/^[,;]+|[,;]+$/g, "").trim())
    .filter(Boolean);
  if (parts.length === 0) return undefined;
  return parts.join(", ");
}

function field(raw, key) {
  const re = new RegExp(`\\|${key}\\s*=\\s*([\\s\\S]*?)(?=\\n\\|[a-zA-Z])`, "i");
  return re.exec(raw)?.[1]?.trim() ?? "";
}

function regionMentions(value) {
  const text = plain(value).replace(/outside\s+[A-Z][a-z]+/g, "");
  const found = [];
  for (const region of REGIONS) {
    if (new RegExp(`(^|[^A-Za-z])${region.replace(/ /g, "\\s+")}($|[^A-Za-z])`, "i").test(text)) {
      found.push(region);
    }
  }
  if (/\bTargonian\b|\bMount Targon\b|\bTargon\b/i.test(text) && !found.includes("Mount Targon")) {
    found.push("Mount Targon");
  }
  if (/\bShuriman\b/i.test(text) && !found.includes("Shurima")) found.push("Shurima");
  return found;
}

function parseRegions(raw) {
  const regionRaw = field(raw, "region");
  const current = [];
  const all = [];
  const lines = regionRaw.split("\n");
  for (const line of lines) {
    const currentLine = line.replace(/<s>[\s\S]*?<\/s>/gi, "").replace(/<del>[\s\S]*?<\/del>/gi, "");
    for (const match of currentLine.matchAll(/\{\{fi\|([^}|]+)/gi)) {
      const region = canonicalRegion(match[1]);
      if (region && !current.includes(region)) current.push(region);
    }
    for (const match of currentLine.matchAll(/\[\[(?:Universe:)?([^|\]]+)(?:\|[^\]]*)?\]\]/g)) {
      const region = canonicalRegion(match[1]);
      if (region && !current.includes(region)) current.push(region);
    }
    for (const match of line.matchAll(/\{\{fi\|([^}|]+)/gi)) {
      const region = canonicalRegion(match[1]);
      if (region && !all.includes(region)) all.push(region);
    }
    for (const match of line.matchAll(/\[\[(?:Universe:)?([^|\]]+)(?:\|[^\]]*)?\]\]/g)) {
      const region = canonicalRegion(match[1]);
      if (region && !all.includes(region)) all.push(region);
    }
  }
  return { current, all };
}

function parseOfficial(html, fallbackTitle) {
  const title = decodeEntities(
    /data-testid="supertitle"[\s\S]{0,800}?data-testid="text">([^<]+)/i.exec(html)?.[1]?.trim() ??
      fallbackTitle,
  );
  const roleBlock = /data-testid="roles"([\s\S]*?)(?:data-testid="difficulty"|$)/i.exec(html)?.[1] ?? "";
  const rolesText = /data-testid="meta-details"[^>]*>([^<]+)/i.exec(roleBlock)?.[1]?.trim() ?? "";
  const roles = rolesText
    .split("/")
    .map((role) => role.trim())
    .filter(Boolean);
  const difficulty =
    /data-testid="difficulty"[\s\S]*?data-testid="meta-details"[^>]*>([^<]+)/i.exec(html)?.[1]?.trim() ??
    "";
  const description =
    /data-testid="description"[\s\S]*?data-testid="rich-text-html"><div>([\s\S]*?)<\/div>/i.exec(html)?.[1] ??
    "";
  return { title, roles, difficulty, description: plain(description) };
}

function firstPart(value) {
  const parts = plain(value)
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts[0] ?? "";
}

function makeSummary(name, profile, classLabel) {
  const roles = profile.roles.length ? profile.roles.join(" / ") : classLabel;
  const species = firstPart(profile.species) || "champion";
  const origin = firstPart(profile.origin) || profile.regions[0];
  const faction = firstPart(profile.faction);
  let summary = `${name}, ${profile.title}, is a ${species} ${roles} from ${origin}.`;
  if (faction) summary += ` ${name} is associated with ${faction}.`;
  summary += ` ${name} is connected to ${profile.regions.join(" and ")}.`;
  return summary.replace(/\s+/g, " ").trim();
}

const SUMMARY_OVERRIDES = {
  ahri: "A fox-like Vesani of Ionia, Ahri is a spirit-mage and soul-devourer searching for the memories of her lost tribe.",
  lux: "A luminous noble of Demacia, Lux hides forbidden light magic behind a disciplined Crownguard smile.",
  brand: "Once a Freljordian apprentice of Ryze, Brand is now a living pyre of world-rune fire and vengeance.",
  annie: "A Noxian child prodigy bound to the pyromantic bear Tybaulk, Annie is as cheerful as she is dangerous.",
  syndra: "An Ionian force-mage of immense potential, Syndra refuses every cage built to contain her.",
  veigar: "A yordle sorcerer twisted by Noxian captivity, Veigar styles himself the Tiny Master of Evil.",
  xerath: "An ascended Shuriman magus of raw arcane energy, Xerath seeks to unmake the empire that bound him.",
  ryze: "A world-worn rune mage, Ryze carries the burden of Runeterra's oldest and most dangerous magic.",
  riven: "A Noxian soldier broken by the invasion of Ionia, Riven is an exile seeking redemption with a blade reforged from her past.",
  samira: "A Shuriman-born daredevil who found a home in Noxus, Samira turns danger into style and every battlefield into a performance.",
  kayn: "A Noxian child raised by the Order of Shadow in Ionia, Kayn wields the Darkin scythe Rhaast—and fights for control of his own body.",
  aatrox: "A Darkin god-warrior imprisoned in his own blade, Aatrox marches across Runeterra seeking an end to his tortured existence.",
  "aurelion-sol": "A celestial dragon who forged the stars, Aurelion Sol suffers the indignity of a Targonian crown—and dreams of freedom.",
};

async function fetchCached(url, key) {
  const file = join(CACHE, key);
  if (existsSync(file)) return readFile(file, "utf8");
  const response = await fetch(url, {
    headers: { "user-agent": "RiftSurvivorsProfileAudit/1.0 (private fan project)" },
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = await response.text();
  await writeFile(file, text);
  return text;
}

async function mapLimit(items, limit, fn) {
  const results = Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function readRoster() {
  const source = await readFile(join(ROOT, "../src/packs/roster.ts"), "utf8");
  const re = /champion\(\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)"/g;
  const champions = [];
  for (const match of source.matchAll(re)) {
    champions.push({
      id: match[1],
      name: match[2],
      title: match[3],
      region: match[4],
    });
  }
  return champions;
}

async function main() {
  await mkdir(CACHE, { recursive: true });
  const roster = await readRoster();
  const champions = [...CUSTOM, ...roster].sort((a, b) => a.name.localeCompare(b.name));
  if (champions.length !== 173) {
    throw new Error(`expected 173 champions, found ${champions.length}`);
  }

  const profiles = await mapLimit(champions, 4, async (champion) => {
    const slug =
      OFFICIAL_SLUGS.get(champion.id) ?? champion.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const officialUrl = `${OFFICIAL_BASE}${slug}/`;
    const wikiPath = `Universe:${champion.name}`;
    const wikiUrl = `${WIKI_BASE}${encodeURIComponent(wikiPath)}`;
    let official = { title: champion.title, roles: [], difficulty: "", description: "" };
    let wikiRaw = "";
    const warnings = [];
    try {
      official = parseOfficial(await fetchCached(officialUrl, `official-${slug}.html`), champion.title);
    } catch (error) {
      warnings.push(`official: ${String(error)}`);
    }
    try {
      wikiRaw = await fetchCached(
        `https://wiki.leagueoflegends.com/en-us/api.php?action=parse&page=${encodeURIComponent(wikiPath)}&prop=wikitext&format=json&formatversion=2`,
        `wiki-${champion.id}.json`,
      );
    } catch (error) {
      warnings.push(`wiki: ${String(error)}`);
    }
    const parsed = wikiRaw ? JSON.parse(wikiRaw) : null;
    const raw = parsed?.parse?.wikitext ?? "";
    const regions = parseRegions(raw);
    const originRaw = field(raw, "originplace");
    const originRegions = regionMentions(originRaw);
    const allRegions = [...new Set([...regions.current, ...originRegions])];
    const fallbackRegion = canonicalRegion(champion.region) ?? "Runeterra";
    const unordered = allRegions.length > 0 ? allRegions : [fallbackRegion];
    // Preserve the curated primary when it is a valid association; otherwise
    // use the first canonical wiki region. This keeps Riven on Noxus, Rengar on
    // Ixtal, and corrects genuinely wrong assignments like Corki/Alistar.
    const rosterRegion = canonicalRegion(champion.region);
    const primary = rosterRegion && unordered.includes(rosterRegion) ? rosterRegion : unordered[0];
    const finalRegions = [primary, ...unordered.filter((region) => region !== primary)];
    const profile = {
      title: official.title || champion.title,
      regions: finalRegions,
      origin: cleanList(originRaw),
      residence: cleanList(field(raw, "residence")),
      faction: cleanList(field(raw, "faction").split("|related")[0]),
      species: cleanList(field(raw, "species")),
      occupation: cleanList(field(raw, "occupation")),
      roles: official.roles.length > 0 ? official.roles : [champion.class ?? "Mage"],
      difficulty: official.difficulty || undefined,
      sources: {
        official: officialUrl,
        wiki: wikiUrl,
        verifiedAt: VERIFIED,
      },
    };
    profile.summary =
      SUMMARY_OVERRIDES[champion.id] ??
      makeSummary(champion.name, profile, champion.class ?? "champion");
    return { id: champion.id, profile, warnings };
  });

  const warnings = profiles.flatMap((entry) =>
    entry.warnings.map((warning) => `${entry.id}: ${warning}`),
  );
  if (warnings.length > 0) {
    console.warn(warnings.join("\n"));
  }

  const records = Object.fromEntries(profiles.map(({ id, profile }) => [id, profile]));
  const output = [
    "// AUTO-GENERATED by packages/content/scripts/generate-champion-profiles.mjs",
    `// Sources verified ${VERIFIED}; see profile.sources for each champion.`,
    'import type { ChampionProfile } from "@rift/sim";',
    "",
    "export const CHAMPION_PROFILES: Record<string, ChampionProfile> = ",
    JSON.stringify(records, null, 2),
    ";",
    "",
  ].join("\n");
  await writeFile(join(ROOT, "../src/champions/profiles.generated.ts"), output);
  console.log(`wrote ${profiles.length} profiles`);
  const multi = Object.values(records).filter((profile) => profile.regions.length > 1);
  console.log(`multi-region: ${multi.length}`);
  for (const profile of multi) {
    console.log(`  ${profile.regions.join(" + ")} — ${profile.title}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
