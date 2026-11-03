// Per-champion sprite palettes (docs/10 D-048). Original color identities
// authored per champion: [template override?, hair, skin, cloth, accent].
// Template falls back to the champion's class when the first entry is a
// TemplateId string that differs; otherwise class default.
import type { TemplateId } from "./sprite-templates";

export interface ChampionSpriteStyle {
  template?: TemplateId;
  hair: number;
  skin: number;
  cloth: number;
  accent: number;
}

const P = (hex: string): number => Number.parseInt(hex, 16);

/** ch(id, template|hair, hair, skin, cloth, accent) */
function ch(
  id: string,
  a: string,
  b: string,
  c: string,
  d: string,
  e?: string,
): [string, ChampionSpriteStyle] {
  if (e === undefined) {
    return [id, { hair: P(a), skin: P(b), cloth: P(c), accent: P(d) }];
  }
  return [id, { template: a as TemplateId, hair: P(b), skin: P(c), cloth: P(d), accent: P(e) }];
}

// A–M champions.
export const PALETTES_A_M: Record<string, ChampionSpriteStyle> = Object.fromEntries([
  ch("aatrox", "8a1a10", "c8b0a0", "2a1418", "c83018"),
  ch("ahri", "f0a0d0", "ffe2cc", "f4f4f8", "40d8c8"),
  ch("akali", "202830", "e8c8a8", "204848", "40d0b0"),
  ch("akshan", "3a2a1a", "c89868", "8a5a28", "e8c860"),
  ch("alistar", "202020", "b08858", "886030", "e8d8b0"),
  ch("ambessa", "181818", "9a6a48", "782818", "d8b050"),
  ch("amumu", "587838", "88a860", "6878a0", "e8e0c0"),
  ch("anivia", "40c8e8", "a8e8f8", "2868a0", "c8f0ff"),
  ch("annie", "c85018", "ffdcc8", "b02848", "f0a030"),
  ch("aphelios", "182030", "d8b090", "283048", "98c8e8"),
  ch("ashe", "e8e8f0", "f4ded0", "c8d4e4", "58c8e0"),
  ch("aurelion-sol", "1848a0", "88c0f0", "283878", "f0b040"),
  ch("aurora", "c8b8e8", "f0dcc8", "8878c8", "68e0d8"),
  ch("azir", "d8b050", "d8a878", "b08828", "58c8e8"),
  ch("bard", "88c8f8", "c8e8f8", "f0e8d0", "58e0c8"),
  ch("belveth", "302038", "8858a8", "181020", "e060c0"),
  ch("blitzcrank", "c88828", "a86818", "785010", "58c8e8"),
  ch("brand", "f04818", "803020", "381008", "f8a030"),
  ch("braum", "d8d0c0", "f0d0b0", "2868a8", "e8c050"),
  ch("briar", "b02838", "f0dcc8", "482030", "e04040"),
  ch("caitlyn", "28202a", "f0d8c0", "7838a0", "e8c060"),
  ch("camille", "c8c8d8", "e8d0b8", "383848", "e84058"),
  ch("cassiopeia", "185848", "a8c888", "283830", "d84878"),
  ch("chogath", "382868", "8878b8", "281848", "d84088"),
  ch("corki", "683818", "e8b088", "885828", "e8d060"),
  ch("darius", "382018", "d8a888", "682820", "c8b0a0"),
  ch("diana", "283048", "e8d0b0", "c8c8d0", "98c8f0"),
  ch("dr-mundo", "88c858", "98d878", "c8d8e8", "e85868"),
  ch("draven", "282020", "e0b088", "884828", "e8d0a0"),
  ch("ekko", "382818", "8a5a38", "283840", "58e0c8"),
  ch("elise", "282038", "e8d0b8", "882838", "d84078"),
  ch("evelynn", "382030", "e8a8c0", "782848", "e878b8"),
  ch("ezreal", "e8d080", "f0d8b8", "2858a0", "f8e888"),
  ch("fiddlesticks", "383028", "989078", "282828", "c83828"),
  ch("fiora", "e8e8e8", "f0d8c0", "385878", "c8b040"),
  ch("fizz", "68d8c8", "a8e8d8", "c87828", "e8e8b0"),
  ch("galio", "c8b888", "78a8d8", "586878", "e8e0c0"),
  ch("gangplank", "282018", "d8a878", "883828", "e8c050"),
  ch("garen", "e8d8a0", "f0d0b0", "2868a8", "d8c878"),
  ch("gnar", "88b8e8", "b8d8f0", "e878b0", "f0e8d0"),
  ch("gragas", "b08858", "d8b088", "785838", "e8d0a0"),
  ch("graves", "383028", "d8a878", "785838", "e8d060"),
  ch("gwen", "a8d8e8", "f0dcc8", "385878", "e878b8"),
  ch("hecarim", "283038", "586878", "101820", "78e0c0"),
  ch("heimerdinger", "e8c868", "f0d8a8", "785838", "58c8e8"),
  ch("hwei", "283048", "e8d0b8", "385878", "e8b0c8"),
  ch("illaoi", "283830", "a87858", "c8a048", "58e0c8"),
  ch("irelia", "e8e0d0", "f0d0b0", "c85868", "d84868"),
  ch("ivern", "88c878", "98d888", "286048", "e8e8c0"),
  ch("janna", "e8e8d8", "f0dcc8", "a8d8e8", "78c8e8"),
  ch("jarvan-iv", "283048", "f0d0b0", "c8b040", "e8e8d8"),
  ch("jax", "384830", "98a878", "685838", "c8a048"),
  ch("jayce", "283040", "f0d0b0", "c83838", "e8d060"),
  ch("jhin", "d8d0c8", "f0d8c0", "383848", "e8c050"),
  ch("jinx", "40a8c8", "f0dcc8", "e85888", "f8d858"),
  ch("kaisa", "382848", "e8c8b0", "181020", "e84898"),
  ch("kalista", "284048", "88b8b0", "182830", "58e0c0"),
  ch("karma", "f0e8d8", "e8c8a8", "c8b0d8", "e8c860"),
  ch("karthus", "385848", "a8c0a8", "283830", "98e0d0"),
  ch("kassadin", "403858", "a898c8", "282038", "e84898"),
  ch("katarina", "b02828", "e8d0b0", "282828", "e8d8a0"),
  ch("kayle", "e8e0c0", "f8e8d0", "c8b868", "f8f0d0"),
  ch("kayn", "181820", "d8b8a0", "282830", "e83858"),
  ch("kennen", "b03028", "e8b088", "384848", "f0d040"),
  ch("khazix", "284038", "68a888", "182820", "c84878"),
  ch("kindred", "e8e4d8", "c8a878", "384848", "e84858"),
  ch("kogmaw", "8858a8", "b888d8", "483068", "e8d058"),
  ch("ksante", "283848", "a87858", "c89828", "e8d8b0"),
  ch("leblanc", "e8d8f0", "f0dcc8", "8838a8", "e878d8"),
  ch("lee-sin", "282828", "e8b088", "c85858", "e8d8a0"),
  ch("leona", "c8a040", "f0d8b8", "b87828", "f8f0c0"),
  ch("lillia", "e898c8", "f8dce8", "48a878", "f8e8a0"),
  ch("lissandra", "c8e0f0", "e8e0e8", "184878", "98e0f8"),
  ch("lucian", "282020", "8a5a38", "383848", "e8d8a0"),
  ch("lulu", "c888e8", "f0d8c8", "583888", "e8e070"),
  ch("lux", "e8d890", "f8e8d0", "2858a8", "f8f0c8"),
  ch("malphite", "586868", "788878", "384848", "a8e0c8"),
  ch("malzahar", "483868", "c8b8e8", "281838", "e84898"),
  ch("maokai", "385838", "688858", "283828", "98e0a8"),
  ch("master-yi", "e8e0d0", "e8c8a0", "283848", "c8a048"),
  ch("mel", "e8c860", "e8c8a0", "783818", "f8e8a8"),
  ch("milio", "b88828", "c89858", "e8e8e0", "58c8e8"),
  ch("miss-fortune", "b03028", "f0d8c0", "282830", "e8c050"),
  ch("mordekaiser", "383840", "887868", "181820", "e85838"),
  ch("morgana", "282038", "e8d0c0", "7838a0", "e8e0b0"),
]);
