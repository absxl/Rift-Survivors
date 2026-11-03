// Region themes for the gacha/collection UI. Purely presentation; champion
// region assignments come from content profiles.
import type { CharacterDef } from "@rift/sim";

export const DARKIN_CHEST = "Darkin";

export const REGION_ORDER = [
  "Demacia",
  "Noxus",
  "Ionia",
  "Shurima",
  "Bandle City",
  "Runeterra",
  "Freljord",
  "Piltover",
  "Zaun",
  "Bilgewater",
  "Shadow Isles",
  "Mount Targon",
  "Ixtal",
  "Void",
] as const;

export interface RegionStyle {
  color: string;
  accent: string;
  blurb: string;
  /** Abstract CSS motif class, not an official symbol. */
  motif: string;
  /** Source file under /public/regions; PNGs resolve through normalized derivatives. */
  crest: string;
}

const REGIONS: Record<string, RegionStyle> = {
  Demacia: {
    color: "#d9c26a",
    accent: "#7aa7d8",
    blurb: "Disciplined light, polished steel, and a kingdom that fears what it cannot name.",
    motif: "wings",
    crest: "demacia.png",
  },
  Noxus: {
    color: "#d85b4a",
    accent: "#5a2020",
    blurb: "Ambition is the only law. Every flame is a ladder.",
    motif: "blades",
    crest: "noxus.png",
  },
  Ionia: {
    color: "#f29ac8",
    accent: "#4fb9a2",
    blurb: "Spirit and balance, where the wind remembers every footstep.",
    motif: "petals",
    crest: "ionia.png",
  },
  Shurima: {
    color: "#f0bf5a",
    accent: "#9b6a2f",
    blurb: "Buried dynasties and ascended wills, waking beneath the sun.",
    motif: "sun",
    crest: "shurima.png",
  },
  "Bandle City": {
    color: "#b591e8",
    accent: "#6fcf7d",
    blurb: "Small doors, impossible roads, and mischief with very sharp teeth.",
    motif: "rings",
    crest: "bandle-city.png",
  },
  Runeterra: {
    color: "#7fb7e8",
    accent: "#2b4f78",
    blurb: "The old world itself: runes, roads, and the weight of ages.",
    motif: "runes",
    crest: "runeterra.svg",
  },
  Freljord: {
    color: "#93d7ef",
    accent: "#315b77",
    blurb: "Ice, old gods, and tribes that survive by refusing to break.",
    motif: "shards",
    crest: "freljord.png",
  },
  Piltover: {
    color: "#e1c27a",
    accent: "#6f5630",
    blurb: "Progress at any cost, polished in brass and hextech light.",
    motif: "gears",
    crest: "piltover.png",
  },
  Zaun: {
    color: "#9bd45d",
    accent: "#3e5a28",
    blurb: "Beneath the city of progress, chemistry and ambition leak.",
    motif: "vials",
    crest: "zaun.png",
  },
  Bilgewater: {
    color: "#65c7b5",
    accent: "#24594f",
    blurb: "Salt, gunpowder, and a tide that always brings another score.",
    motif: "waves",
    crest: "bilgewater.png",
  },
  "Shadow Isles": {
    color: "#8fd6b0",
    accent: "#2c4b43",
    blurb: "The Black Mist keeps what it takes, and the dead keep walking.",
    motif: "mist",
    crest: "shadow-isles.png",
  },
  "Mount Targon": {
    color: "#c9b4ff",
    accent: "#4f3f7b",
    blurb: "A mountain of gods, and the terrible price of climbing it.",
    motif: "stars",
    crest: "mount-targon.png",
  },
  Ixtal: {
    color: "#78d68b",
    accent: "#2f663d",
    blurb: "An ancient elemental civilization hidden inside the jungle.",
    motif: "leaves",
    crest: "ixtal.png",
  },
  Void: {
    color: "#c67cff",
    accent: "#54246f",
    blurb: "Nothing that comes from the Void comes back unchanged.",
    motif: "rift",
    crest: "void.png",
  },
  [DARKIN_CHEST]: {
    color: "#e26455",
    accent: "#65151d",
    blurb: "God-warriors bound in blade and blood, still dreaming of the sun they broke.",
    motif: "blade",
    crest: "darkin.svg",
  },
};

const FALLBACK: RegionStyle = {
  color: "#8ab0c0",
  accent: "#2b4f78",
  blurb: "A corner of the Rift with its own stories to tell.",
  motif: "runes",
  crest: "runeterra.svg",
};

export function regionStyle(region: string): RegionStyle {
  return REGIONS[region] ?? FALLBACK;
}

/** Public URL for a region's golden crest. PNG crests are the normalized
 * square transparent derivatives; SVG crests already use a square viewBox. */
export function regionCrest(region: string): string {
  const crest = regionStyle(region).crest;
  return crest.endsWith(".png") ? `/regions/normalized/${crest}` : `/regions/${crest}`;
}

/** Darkin is a lore faction/chest pool, not a region in REGION_ORDER. */
export function isDarkinChampion(champion: CharacterDef): boolean {
  return /\bdarkin\b/i.test(champion.profile?.species ?? "");
}

/** Every region a champion can be pulled from, with backwards compatibility. */
export function championRegions(champion: CharacterDef): string[] {
  const regions = champion.profile?.regions?.filter(Boolean);
  if (regions && regions.length > 0) return regions;
  return [champion.region ?? "Runeterra"];
}

export interface RegionTheme {
  primary: string;
  colors: string[];
  acc: string;
  motifs: string[];
  crests: string[];
  style: RegionStyle;
}

/** Build a deterministic multi-region blend for cards and dossiers. */
export function regionTheme(regions: string[]): RegionTheme {
  const primary = regions[0] ?? "Runeterra";
  const known: string[] = REGION_ORDER.filter(
    (region) => region !== primary && regions.includes(region),
  );
  const extra = regions.filter(
    (region) =>
      region !== primary && !REGION_ORDER.includes(region as (typeof REGION_ORDER)[number]),
  );
  const normalized = [primary, ...known, ...extra];
  const style = regionStyle(primary);
  return {
    primary,
    colors: normalized.map((region) => regionStyle(region).color),
    acc: style.accent,
    motifs: normalized.map((region) => regionStyle(region).motif),
    crests: normalized.map(regionCrest),
    style,
  };
}
