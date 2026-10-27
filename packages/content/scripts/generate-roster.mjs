import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "packs",
  "roster.ts",
);
const GROUPS = {
  Demacia: [
    "Garen",
    "Lux",
    "Jarvan IV",
    "Fiora",
    "Vayne",
    "Galio",
    "Sona",
    "Sylas",
    "Shyvana",
    "Quinn",
    "Xin Zhao",
    "Kayle",
    "Morgana",
    "Poppy",
    "Lucian",
  ],
  Noxus: [
    "Alistar",
    "Darius",
    "Draven",
    "Swain",
    "Katarina",
    "Cassiopeia",
    "Samira",
    "Riven",
    "Kled",
    "Sion",
    "Vladimir",
    "Elise",
    "Briar",
    "Rell",
    "Annie",
    "Talon",
    "Ambessa",
    "LeBlanc",
    "Mordekaiser",
  ],
  Ionia: [
    "Ahri",
    "Akali",
    "Irelia",
    "Yasuo",
    "Yone",
    "Zed",
    "Shen",
    "Karma",
    "Kennen",
    "Lee Sin",
    "Master Yi",
    "Wukong",
    "Lillia",
    "Sett",
    "Rakan",
    "Xayah",
    "Syndra",
    "Varus",
    "Kayn",
    "Hwei",
    "Jhin",
    "Ivern",
    "Yunara",
  ],
  Freljord: [
    "Trundle",
    "Ashe",
    "Braum",
    "Sejuani",
    "Tryndamere",
    "Nunu & Willump",
    "Anivia",
    "Volibear",
    "Olaf",
    "Udyr",
    "Ornn",
    "Lissandra",
    "Gnar",
    "Gragas",
    "Aurora",
  ],
  Piltover: [
    "Caitlyn",
    "Vi",
    "Jayce",
    "Heimerdinger",
    "Ezreal",
    "Orianna",
    "Camille",
    "Seraphine",
    "Corki",
    "Mel",
  ],
  Zaun: [
    "Jinx",
    "Ekko",
    "Viktor",
    "Warwick",
    "Singed",
    "Twitch",
    "Zac",
    "Dr. Mundo",
    "Renata Glasc",
    "Zeri",
    "Blitzcrank",
    "Janna",
    "Ziggs",
    "Urgot",
  ],
  Bilgewater: [
    "Gangplank",
    "Miss Fortune",
    "Graves",
    "Twisted Fate",
    "Pyke",
    "Illaoi",
    "Tahm Kench",
    "Nautilus",
    "Fizz",
    "Nami",
    "Nilah",
  ],
  "Shadow Isles": [
    "Thresh",
    "Hecarim",
    "Kalista",
    "Yorick",
    "Maokai",
    "Viego",
    "Gwen",
    "Senna",
    "Karthus",
    "Vex",
    "Locke",
  ],
  Shurima: [
    "Azir",
    "Nasus",
    "Renekton",
    "Sivir",
    "Xerath",
    "Amumu",
    "Rammus",
    "Taliyah",
    "Akshan",
    "K'Sante",
    "Skarner",
    "Naafiri",
    "Smolder",
    "Aatrox",
  ],
  "Mount Targon": [
    "Leona",
    "Diana",
    "Taric",
    "Aurelion Sol",
    "Soraka",
    "Zoe",
    "Pantheon",
    "Aphelios",
  ],
  Ixtal: ["Qiyana", "Neeko", "Nidalee", "Rengar", "Zyra", "Malphite", "Milio"],
  "Bandle City": ["Teemo", "Lulu", "Veigar", "Tristana", "Yuumi", "Rumble"],
  Void: [
    "Cho'Gath",
    "Kha'Zix",
    "Kog'Maw",
    "Rek'Sai",
    "Vel'Koz",
    "Kassadin",
    "Kai'Sa",
    "Malzahar",
    "Bel'Veth",
  ],
  Runeterra: [
    "Ryze",
    "Brand",
    "Bard",
    "Kindred",
    "Nocturne",
    "Fiddlesticks",
    "Evelynn",
    "Shaco",
    "Jax",
    "Zilean",
    "Zaahen",
  ],
};
const RARITY = {
  Lux: "epic",
  Brand: "epic",
  Ahri: "common",
  Ryze: "legendary",
  Syndra: "epic",
  Veigar: "epic",
  Annie: "rare",
  Xerath: "epic",
};
const EXISTING = new Set(["Lux", "Brand", "Ahri", "Ryze", "Syndra", "Veigar", "Annie", "Xerath"]);
const regionOf = {};
for (const [region, names] of Object.entries(GROUPS))
  for (const name of names) {
    if (regionOf[name]) throw new Error(`duplicate region for ${name}`);
    regionOf[name] = region;
  }
function slug(name) {
  return name
    .toLowerCase()
    .replace(/['’.&]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function classOf(tags) {
  const map = {
    Mage: "mage",
    Tank: "tank",
    Fighter: "fighter",
    Assassin: "assassin",
    Marksman: "marksman",
    Support: "support",
  };
  return map[tags[0]] ?? "mage";
}
(async () => {
  const versions = await (
    await fetch("https://ddragon.leagueoflegends.com/api/versions.json")
  ).json();
  const version = versions[0];
  const data = (
    await (
      await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/championFull.json`)
    ).json()
  ).data;
  const champs = Object.values(data).sort((a, b) => a.name.localeCompare(b.name));
  const missing = champs.filter((c) => !regionOf[c.name]).map((c) => c.name);
  const extra = Object.keys(regionOf).filter((n) => !champs.some((c) => c.name === n));
  const duplicates = champs
    .filter((c, i) => champs.findIndex((x) => x.name === c.name) !== i)
    .map((c) => c.name);
  console.log(
    JSON.stringify(
      {
        version,
        count: champs.length,
        missing,
        extra,
        duplicates,
        groups: Object.fromEntries(Object.entries(GROUPS).map(([r, n]) => [r, n.length])),
      },
      null,
      2,
    ),
  );
  if (missing.length || extra.length) process.exitCode = 1;
  const byClass = {};
  const lines = [];
  for (const c of champs) {
    if (EXISTING.has(c.name)) continue;
    const cls = classOf(c.tags);
    const index = byClass[cls] ?? 0;
    byClass[cls] = index + 1;
    const r = hash(c.name) % 100;
    const rarity =
      RARITY[c.name] ?? (r < 40 ? "common" : r < 75 ? "rare" : r < 95 ? "epic" : "legendary");
    const region = regionOf[c.name];
    const id = slug(c.name);
    lines.push(
      `  champion("${id}", ${JSON.stringify(c.name)}, ${JSON.stringify(c.title)}, "${region}", "${rarity}", "${cls}", ${index}),`,
    );
  }
  const header = `// AUTO-GENERATED ROSTER DATA (Riot Data Dragon ${version})\n// Regenerate with: node packages/content/scripts/generate-roster.mjs\n// Regions are curated primary-region assignments; rarities are provisional and\n// reviewable. Unique moves/weapons are intentionally deferred.\nimport type { CharacterDef } from "@rift/sim";\nimport { classDefinition, classPlaceholderMove, classStartingWeapon, classUpgradeIds } from "../champions/classes";\n\nfunction champion(\n  id: string,\n  name: string,\n  title: string,\n  region: string,\n  rarity: CharacterDef["rarity"],\n  className: string,\n  index: number,\n): CharacterDef {\n  const cls = classDefinition(className);\n  return {\n    id,\n    name,\n    description: \`\${name}, \${title}, joins the Rift as a \${cls.label} of \${region}.\`,\n    region,\n    rarity,\n    class: className,\n    startingWeapon: classStartingWeapon(className, index),\n    startingMove: classPlaceholderMove(className),\n    baseStats: { ...cls.baseStats },\n    growth: { ...cls.growth, mods: { ...cls.growth.mods } },\n    upgradeIds: classUpgradeIds(className),\n  };\n}\n\nexport const ROSTER_CHAMPIONS: CharacterDef[] = [\n`;
  const footer = "];\n";
  fs.writeFileSync(OUT, `${header}${lines.join("\n")}\n${footer}`);
  console.log("wrote", lines.length, "new champions");
})();
