// Generated icon art (docs/10 D-050): archetype templates × palettes produce
// data-URLs for ability and item icons in the hotbar, shop and level-up cards.
// All original pixel art; the archetype comes from the def's behavior/tier, the
// palette from damage type / item tier.
import { type SpritePalette, cachedRasterize } from "./pixel-art";

// 12x12 icon templates. Slots: O outline, C main, c shade, A accent, B bright.
const TEMPLATES: Record<string, string[]> = {
  // ability archetypes
  orb: [
    "............",
    "....OOOO....",
    "...OCCCCO...",
    "..OCCBACCO..",
    "..OCBCCACO..",
    "..OCCCCCCO..",
    "..OCAACCCO..",
    "..OCCCCCCO..",
    "...OCCCCO...",
    "....OOOO....",
    "............",
    "............",
  ],
  bolt: [
    "............",
    "............",
    ".........OC.",
    "........OCC.",
    ".......OCC..",
    "......OCC...",
    "..O..OCC....",
    ".OCOCCO.....",
    ".OCCCO......",
    "..OCO.......",
    "..AA........",
    "............",
  ],
  sweep: [
    "............",
    "....OOOO....",
    "..OOC..COO..",
    ".OC......CO.",
    ".OC......CO.",
    "OC........CO",
    "OC........CO",
    "OC........CO",
    ".OC......CO.",
    ".OCA....ACO.",
    "..OOC..COO..",
    "....OOOO....",
  ],
  aura: [
    "............",
    "....OOOO....",
    "...OA..AO...",
    "..O..CC..O..",
    ".O.OCCCCO.O.",
    ".O.OCCBCO.O.",
    ".O.OCCCCO.O.",
    ".O.OCCCCO.O.",
    "..O..CC..O..",
    "...OA..AO...",
    "....OOOO....",
    "............",
  ],
  nova: [
    "............",
    "..C..OO..C..",
    "...COCCOC...",
    "..OCAAAACO..",
    "..OCAACACO..",
    "OOCCACCCCCOO",
    "..OCCCCCCO..",
    "..OCAAAACO..",
    "...COCCOC...",
    "..C..OO..C..",
    "............",
    "............",
  ],
  beam: [
    "............",
    "............",
    ".O..........",
    "OBCOCCCCCCCO",
    "OABCCCCCCCCO",
    "OBCOCCCCCCCO",
    ".O..........",
    "............",
    "............",
    "............",
    "............",
    "............",
  ],
  chain: [
    "............",
    ".O..........",
    "OCO.O.......",
    "OCOCO.O.....",
    ".OCOCOCO.O..",
    "..OCOCOCOCO.",
    "...OCOCOCO..",
    "....OCOCO...",
    ".....OCO....",
    "......O.....",
    "............",
    "............",
  ],
  hook: [
    "............",
    ".OO.........",
    "OCCO........",
    "OCACO.......",
    "OCACO.......",
    ".OCACO......",
    "..OCACO.....",
    "...OCACO....",
    "....OCCCO...",
    ".....OCCO...",
    "......OO....",
    "............",
  ],
  zone: [
    "............",
    "............",
    "............",
    "...OOOOOO...",
    "..OCCCCCCO..",
    ".OCCAAACC CO",
    ".OCAACCAACO.",
    ".OCCAAACCCO.",
    "..OCCCCCCO..",
    "...OOOOOO...",
    "............",
    "............",
  ],
  dash: [
    "............",
    "............",
    "A...........",
    ".AA.....OO..",
    "..AA...OCCO.",
    "...AA..OCCO.",
    "....AAOOCCO.",
    "......OCCO..",
    ".....OCCCO..",
    "....OOCCO...",
    "......OO....",
    "............",
  ],
  shield: [
    "............",
    "...OOOOOO...",
    "..OCCCCCCO..",
    "..OCBCCACO..",
    ".OCCBCCCACO.",
    ".OCCCBCCCAO.",
    ".OCCCCBCCAO.",
    "..OCCCBCCO..",
    "..OCCCCCCO..",
    "...OCCCCO...",
    "....OOOO....",
    "............",
  ],
  turret: [
    "............",
    "....OO......",
    "...OCCO.....",
    "..OCBACO....",
    "..OCCCCO....",
    ".OOCACCOO...",
    "OCCCCCCCCO..",
    "OCAACCAAACO.",
    "OCCCCCCCCO..",
    ".OOOOCOOO...",
    "....OCO.....",
    "...OOOOO....",
  ],
  pet: [
    "............",
    "..OO....OO..",
    ".OAAO..OAAO.",
    ".OAEAOOAEAO.",
    ".OAAAAOAAAO.",
    "..OAAAAAAO..",
    "..OAAAAAAO..",
    "..OCAAAACO..",
    "..OCAAAACO..",
    "...OAAAAO...",
    "...OO..OO...",
    "............",
  ],
  // item archetypes
  sword: [
    "............",
    ".........OB.",
    "........OBB.",
    ".......OBCO.",
    "......OBCO..",
    ".....OBCO...",
    "..O.OBCO....",
    "..OOBCO.....",
    "...OCO......",
    "..OAO.O.....",
    ".OAO........",
    "..O.........",
  ],
  tome: [
    "............",
    "..OOOOOOOO..",
    ".OCCCCCCCAO.",
    ".OCOCOCOCAO.",
    ".OCCCCCCCCO.",
    ".OCOCOCOCAO.",
    ".OCCCCCCCCO.",
    ".OCOCOCOCAO.",
    ".OCCCCCCCCO.",
    ".OAAAAAAAAO.",
    "..OOOOOOOO..",
    "............",
  ],
  armor: [
    "............",
    "..OOO..OOO..",
    ".OCCC OOCCC.",
    ".OCCCCCCCCO.",
    ".OCCCAACCCO.",
    ".OCACCCCCAO.",
    ".OCCCCCCCCO.",
    ".OCACCCCCAO.",
    ".OCCCCCCCCO.",
    "..OCCCCCCO..",
    "...OOOOOO...",
    "............",
  ],
  cloak: [
    "............",
    "...OOOOOO...",
    "..OCCCCCCO..",
    ".OCCCCCCCCO.",
    ".OCACAACACO.",
    ".OCCCCCCCCO.",
    ".OCACCCCCAO.",
    ".OCCCCCCCCO.",
    "..OCCACCCO..",
    "..OCCCCCCO..",
    "...OCOOCO...",
    "............",
  ],
  gem: [
    "............",
    "............",
    "....OOOO....",
    "...OBCCAO...",
    "..OBCCCCAO..",
    ".OBCCCCCCAO.",
    ".OCCCCCCCCO.",
    "..OCCCCCCO..",
    "...OCCCCO...",
    "....OC CO...",
    ".....OO.....",
    "............",
  ],
  ring: [
    "............",
    "............",
    "....OOOO....",
    "..OOC..COO..",
    ".OC......CO.",
    ".OC......CO.",
    "OC........CO",
    "OC........CO",
    ".OCA....ACO.",
    ".OCCA..ACCO.",
    "..OOC..COO..",
    "....OOOO....",
  ],
  staff: [
    "............",
    "......OB....",
    ".....OBACO..",
    "....OCACCO..",
    "....OCCCO...",
    "....OCCO....",
    "...OCCO.....",
    "...OCCO.....",
    "..OCCO......",
    "..OCCO......",
    ".OCCO.......",
    "..OO........",
  ],
  potion: [
    "............",
    "....OOOO....",
    "....OCO.....",
    "....OCO.....",
    "...OCCCO....",
    "..OCCACCO...",
    ".OCACAAACO..",
    ".OCAAAAACO..",
    ".OCAAAAAACO.",
    ".OCCCCCCCCO.",
    "..OOOOOOOO..",
    "............",
  ],
};

const ABILITY_ARCHETYPE: Record<string, string> = {
  "shoot-nearest": "orb",
  "line-skillshot": "bolt",
  sweep: "sweep",
  aura: "aura",
  "strike-random": "nova",
  "ground-pool": "zone",
  orbit: "nova",
  bounce: "orb",
  boomerang: "nova",
  "cone-burst": "nova",
  nova: "nova",
  chain: "chain",
  beam: "beam",
  "hook-pull": "hook",
  "homing-orb": "orb",
  "dash-strike": "dash",
  "fling-knockup": "aura",
  "shield-pulse": "shield",
  turret: "turret",
};

const DAMAGE_PALETTES: Record<string, SpritePalette> = {
  fire: { O: 0x1c0c08, C: 0xe85828, c: 0xa83018, A: 0xf8c848, B: 0xf8e878 },
  arcane: { O: 0x14081c, C: 0x9848d8, c: 0x6828a0, A: 0xe8a8f8, B: 0xf0d8ff },
  light: { O: 0x1c1808, C: 0xe8c848, c: 0xb08828, A: 0xf8f0b8, B: 0xfffde8 },
  physical: { O: 0x10141c, C: 0x8898b8, c: 0x586880, A: 0xd8e0f0, B: 0xf0f4ff },
  frost: { O: 0x081420, C: 0x58a8d8, c: 0x3868a8, A: 0xc8e8f8, B: 0xe8f8ff },
  celestial: { O: 0x1c1408, C: 0xd8b858, c: 0xa88828, A: 0xf8e8c0, B: 0xfff8e0 },
  none: { O: 0x10141c, C: 0x5888c8, c: 0x3868a8, A: 0xb8d8f0, B: 0xe0f0ff },
};

const ITEM_PALETTES: Record<string, SpritePalette> = {
  component: { O: 0x10141c, C: 0x8898b8, c: 0x586880, A: 0xc8d0e0, B: 0xe8f0f8 },
  epic: { O: 0x10141c, C: 0x6858c8, c: 0x483898, A: 0xb8a8f0, B: 0xe8e0ff },
  legendary: { O: 0x1c1408, C: 0xc8a038, c: 0x987820, A: 0xf0e0b0, B: 0xfff8d8 },
};

function paletteForDamage(tags?: string[], damageType?: string): SpritePalette {
  if (tags?.includes("damage:fire")) return DAMAGE_PALETTES.fire;
  if (tags?.includes("damage:frost")) return DAMAGE_PALETTES.frost;
  if (tags?.includes("damage:light")) return DAMAGE_PALETTES.light;
  if (tags?.includes("damage:celestial")) return DAMAGE_PALETTES.celestial;
  if (tags?.includes("damage:arcane")) return DAMAGE_PALETTES.arcane;
  if (tags?.includes("damage:physical")) return DAMAGE_PALETTES.physical;
  return DAMAGE_PALETTES[damageType ?? "none"] ?? DAMAGE_PALETTES.none;
}

function iconKey(archetype: string, slot: string): string {
  return `icon:${archetype}:${slot}`;
}

/** Ability icon as a Pixi Texture (hotbar / level-up cards). */
export function abilityIcon(def: {
  behavior: string;
  tags?: string[];
  damageType?: string;
}): import("pixi.js").Texture {
  const archetype = ABILITY_ARCHETYPE[def.behavior] ?? "orb";
  const palette = paletteForDamage(def.tags, def.damageType);
  return cachedRasterize(iconKey(archetype, paletteSlot(palette)), TEMPLATES[archetype], palette);
}

function paletteSlot(p: SpritePalette): string {
  return `${p.C?.toString(16)}-${p.A?.toString(16)}`;
}

/** Item icon as a Pixi Texture (shop cards). */
export function itemIcon(def: { tier: string; id: string }): import("pixi.js").Texture {
  const archetype = archetypeForItem(def.id);
  return cachedRasterize(
    iconKey(archetype, def.tier),
    TEMPLATES[archetype],
    ITEM_PALETTES[def.tier] ?? ITEM_PALETTES.component,
  );
}

/** Item icon as a data-URL for the DOM shop grid. */
export function itemIconURL(def: { tier: string; id: string }): string {
  const texture = itemIcon(def);
  const source = texture.source as { resource?: HTMLCanvasElement };
  const canvas = source.resource;
  return canvas instanceof HTMLCanvasElement ? canvas.toDataURL() : "";
}

/** Ability icon as a data-URL for DOM surfaces (hotbar, level-up cards). */
export function abilityIconURL(def: {
  behavior: string;
  tags?: string[];
  damageType?: string;
}): string {
  const texture = abilityIcon(def);
  const source = texture.source as { resource?: HTMLCanvasElement };
  const canvas = source.resource;
  return canvas instanceof HTMLCanvasElement ? canvas.toDataURL() : "";
}

function archetypeForItem(id: string): string {
  if (id.includes("sword") || id.includes("blade") || id.includes("edge") || id.includes("cleaver"))
    return "sword";
  if (id.includes("tome") || id.includes("grasp") || id.includes("morello") || id.includes("staff"))
    return "tome";
  if (id.includes("armor") || id.includes("mail") || id.includes("plate") || id.includes("vest"))
    return "armor";
  if (id.includes("cloak") || id.includes("veil") || id.includes("shroud") || id.includes("omen"))
    return "cloak";
  if (id.includes("crystal") || id.includes("gem") || id.includes("heart") || id.includes("spark"))
    return "gem";
  if (id.includes("ring") || id.includes("censer") || id.includes("locket") || id.includes("charm"))
    return "ring";
  if (id.includes("rod") || id.includes("staff") || id.includes("wand")) return "staff";
  if (id.includes("potion") || id.includes("bead") || id.includes("elixir")) return "potion";
  return "gem";
}
