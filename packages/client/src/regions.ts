// Region themes for the gacha/collection UI. Purely presentation; champion
// region assignments come from content.
export interface RegionStyle {
  color: string;
  accent: string;
  blurb: string;
}

const REGIONS: Record<string, RegionStyle> = {
  Demacia: {
    color: "#d9c26a",
    accent: "#7aa7d8",
    blurb: "Disciplined light, polished steel, and a kingdom that fears what it cannot name.",
  },
  Noxus: {
    color: "#d85b4a",
    accent: "#5a2020",
    blurb: "Ambition is the only law. Every flame is a ladder.",
  },
  Ionia: {
    color: "#f29ac8",
    accent: "#4fb9a2",
    blurb: "Spirit and balance, where the wind remembers every footstep.",
  },
  Shurima: {
    color: "#f0bf5a",
    accent: "#9b6a2f",
    blurb: "Buried dynasties and ascended wills, waking beneath the sun.",
  },
  "Bandle City": {
    color: "#b591e8",
    accent: "#6fcf7d",
    blurb: "Small doors, impossible roads, and mischief with very sharp teeth.",
  },
  Runeterra: {
    color: "#7fb7e8",
    accent: "#2b4f78",
    blurb: "The old world itself: runes, roads, and the weight of ages.",
  },
};

const FALLBACK: RegionStyle = {
  color: "#8ab0c0",
  accent: "#2b4f78",
  blurb: "A corner of the Rift with its own stories to tell.",
};

export function regionStyle(region: string): RegionStyle {
  return REGIONS[region] ?? FALLBACK;
}
