// Generates per-champion ability reference data from wiki.leagueoflegends.com.
// Same contract as generate-champion-profiles.mjs (D-033): fetched once by this
// checked-in audit script, cached under TEMP, and the game never fetches at
// runtime. Output: src/champions/abilities.generated.ts.
//
// Run: node packages/content/scripts/generate-champion-abilities.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// scripts -> content -> packages -> repo root
const ROOT = path.dirname(path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))));
const CACHE = path.join(process.env.TEMP ?? ROOT, "rift-abilities-cache");
const OUT = path.join(ROOT, "packages/content/src/champions/abilities.generated.ts");
const VERIFIED = "2026-11-03";
const WIKI_API = "https://wiki.leagueoflegends.com/en-us/api.php";
const UA = "RiftSurvivorsAbilityAudit/1.0 (private fan project)";

// Wiki page titles differ from Data Dragon names for a few champions.
const WIKI_NAME_OVERRIDES = {
  nunu: "Nunu",
  renata: "Renata",
  wukong: "Wukong",
  monkeyking: "Wukong",
  mel: "Mel",
  aurora: "Aurora",
  ambessa: "Ambessa",
};

// The 8 hand-authored champions from lol.ts (roster.ts holds the other 165).
const CUSTOM_IDS = ["lux", "brand", "ahri", "ryze", "syndra", "veigar", "annie", "xerath"];

let lastRequestAt = 0;
const MIN_SPACING_MS = 350;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Space requests out and retry 429s with backoff — the wiki rate-limits. */
async function fetchCached(url, key) {
  const file = path.join(CACHE, `${key}.txt`);
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    for (let attempt = 0; ; attempt++) {
      const wait = lastRequestAt + MIN_SPACING_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastRequestAt = Date.now();
      const response = await fetch(url, { headers: { "user-agent": UA } });
      if (response.ok) {
        const text = await response.text();
        await fs.writeFile(file, text, "utf8");
        return text;
      }
      if (response.status === 429 && attempt < 5) {
        const retryAfter = Number(response.headers.get("retry-after")) || 3 * (attempt + 1);
        await sleep(retryAfter * 1000);
        continue;
      }
      throw new Error(`${response.status} ${url}`);
    }
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

async function wikiWikitext(page) {
  const url = `${WIKI_API}?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json&formatversion=2&redirects=1`;
  const raw = await fetchCached(url, `page-${page.replace(/[^\w-]/g, "_")}`);
  const parsed = JSON.parse(raw);
  if (!parsed.parse) throw new Error(parsed.error?.info ?? `no parse for ${page}`);
  return parsed.parse.wikitext ?? "";
}

/** Read a `|key = value` block that ends at the next top-level `|key`. */
function field(raw, key) {
  const match = raw.match(new RegExp(`\\|${key}\\s*=([\\s\\S]*?)(?=\\n\\|[a-zA-Z]|\\n\\}\\})`));
  return match ? match[1].trim() : "";
}

/** Strip wiki templates/links/markup into readable text. */
function plain(value) {
  if (!value) return "";
  let text = value;
  // Nested templates need repeated passes; replacements are not re-scanned.
  for (let i = 0; i < 8 && /\{\{/.test(text); i++) {
    text = text.replace(/\{\{([^{}]*)\}\}/g, (m) => {
      const parts = m.slice(2, -2).split("|");
      const keep = parts.find((p) => !/^[a-z][\w-]*$/i.test(p.trim()) && p.trim() !== "");
      return keep ?? "";
    });
  }
  return text
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2")
    .replace(/'''?/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstNumber(value) {
  const match = String(value ?? "").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

/** Extract AP/AD ratios from a leveling/description block. */
function ratios(...blocks) {
  const text = blocks.join(" ");
  let ap = null;
  let ad = null;
  for (const m of text.matchAll(/\(\+\s*([\d.]+)\s*%\s*(AP|AD)/gi)) {
    const value = Number(m[1]) / 100;
    if (m[2].toUpperCase() === "AP") ap = Math.max(ap ?? 0, value);
    else ad = Math.max(ad ?? 0, value);
  }
  return { ap, ad };
}

function damageType(value) {
  const text = plain(value).toLowerCase();
  if (text.includes("true") && !text.includes("magic") && !text.includes("physical")) return "true";
  if (text.includes("magic")) return "magic";
  if (text.includes("physical")) return "physical";
  return null;
}

/** Parse one `Template:Data <Champion>/<key>` ability template. */
async function parseAbility(champion, key, dataTemplate) {
  const raw = await wikiWikitext(`Template:${dataTemplate}`);
  // Line 1 is `{{{{{1<noinclude>|Ability data</noinclude>}}}|<Name>|{{{2|}}}|...`
  // — the first clean pipe token after the invocation header is the name.
  const line1 = raw.split("\n")[0]?.replace(/<noinclude>[\s\S]*?<\/noinclude>/g, "") ?? "";
  const name =
    line1
      .split("|")
      .map((token) => token.replace(/[{}]/g, "").trim())
      .find((token) => token.length > 1 && /^[A-Za-z0-9'.!?:\-\s&]+$/.test(token)) ?? key;
  const leveling = field(raw, "leveling");
  const description = field(raw, "description");
  const blurb = field(raw, "blurb");
  const { ap, ad } = ratios(leveling, description);
  const cooldownRaw = field(raw, "cooldown");
  return {
    key,
    name,
    description: plain(description).slice(0, 400),
    blurb: plain(blurb).slice(0, 260),
    cooldown: firstNumber(cooldownRaw),
    apRatio: ap,
    adRatio: ad,
    damageType: damageType(field(raw, "damagetype")),
    targeting: plain(field(raw, "targeting")) || null,
  };
}

/** Champion page → the `{{Data <Champion>/<X>|Ability}}` data templates.
 * Pages name them either by skill letter (Data X/Q) or by ability name
 * (Data Galio/Winds of War); letters win, otherwise the page's ordered
 * Data templates map 1:1 onto I/Q/W/E/R. */
async function abilityTemplates(champion) {
  const raw = await wikiWikitext(champion);
  const found = {};
  const ordered = [];
  for (const m of raw.matchAll(/\{\{Data [^}|]+/g)) {
    const template = m[0].slice(2).trim();
    ordered.push(template);
    const tail = template.toLowerCase().split("/")[1] ?? "";
    const key =
      tail === "i"
        ? "I"
        : tail === "q"
          ? "Q"
          : tail === "w"
            ? "W"
            : tail === "e"
              ? "E"
              : tail === "r"
                ? "R"
                : null;
    if (key && !found[key]) found[key] = template;
  }
  const keys = ["I", "Q", "W", "E", "R"];
  for (let i = 0; i < keys.length && ordered.length >= 5; i++) {
    if (!found[keys[i]]) found[keys[i]] = ordered[i];
  }
  return found;
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

async function main() {
  await fs.mkdir(CACHE, { recursive: true });
  const roster = await readRoster();
  const all = [
    ...roster,
    ...CUSTOM_IDS.filter((id) => !roster.some((r) => r.id === id)).map((id) => ({ id, name: id })),
  ].sort((a, b) => a.id.localeCompare(b.id));
  if (all.length !== 173) throw new Error(`expected 173 champions, parsed ${all.length}`);

  const records = {};
  const warnings = [];
  await mapLimit(all, 2, async (entry) => {
    try {
      const championPage = WIKI_NAME_OVERRIDES[entry.id] ?? entry.name;
      const templates = await abilityTemplates(championPage);
      // Some pages omit a skill's transclusion even though the data template
      // exists; try the letter-named template directly as a fallback.
      for (const key of ["Q", "W", "E", "R"]) {
        if (!templates[key]) {
          try {
            await wikiWikitext(`Template:Data ${championPage}/${key}`);
            templates[key] = `Data ${championPage}/${key}`;
          } catch {
            // genuinely missing; handled by the authoring pass
          }
        }
      }
      const abilities = {};
      for (const key of ["Q", "W", "E", "R"]) {
        const template = templates[key];
        if (!template) {
          warnings.push(`${entry.id}: no ${key} data template`);
          continue;
        }
        abilities[key] = await parseAbility(entry.id, key, template);
      }
      records[entry.id] = {
        wikiPage: championPage,
        abilities,
        sources: {
          official: `https://www.leagueoflegends.com/en-au/champions/${entry.id}/`,
          wiki: `https://wiki.leagueoflegends.com/en-us/${championPage}`,
          verifiedAt: VERIFIED,
        },
      };
      if (!abilities.Q || !abilities.R) warnings.push(`${entry.id}: missing Q or R`);
    } catch (error) {
      warnings.push(`${entry.id}: ${error.message}`);
    }
  });

  const count = Object.keys(records).length;
  if (count !== 173) {
    console.error(`FAIL: only ${count}/173 champions resolved. Warnings:`);
    for (const warning of warnings) console.error(" -", warning);
    process.exitCode = 1;
  } else {
    console.log(`OK: ${count} champions, ${warnings.length} warnings`);
    for (const warning of warnings) console.log(" -", warning);
  }

  const header = `// GENERATED by scripts/generate-champion-abilities.mjs — do not edit by hand.
// Source: wiki.leagueoflegends.com ability data templates, verified ${VERIFIED}.
// Original gameplay blurbs; descriptions are abbreviated wiki text for the
// authoring pass. The game never fetches at runtime (docs/10 D-033 policy).
import type { ChampionAbilityData } from "@rift/sim";

export const CHAMPION_ABILITIES: Record<string, ChampionAbilityData> = `;

  await fs.writeFile(OUT, `${header}${JSON.stringify(records, null, 2)};\n`, "utf8");
  console.log(`wrote ${OUT}`);
}

main();
