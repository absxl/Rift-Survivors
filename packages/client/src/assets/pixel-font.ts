// Crisp 5x7 pixel text, rendered from hand-drawn glyphs onto a canvas (nearest
// filtered, hard edges — no anti-aliasing). `renderPixelTextSprite` returns a
// Sprite for a string; `PixelText` wraps it for strings that change over time.
import { Sprite, Texture } from "pixi.js";

const COLS = 5;
const ROWS = 7;
const ADVANCE = COLS + 1;

// Each glyph is 7 rows of 5 chars; '#' = filled.
const GLYPHS: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["#####", "...#.", "..#..", "...#.", "....#", "#...#", ".###."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", "..#..", "..#..", "..#.."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  ":": [".....", "..#..", "..#..", ".....", "..#..", "..#..", "....."],
  ".": [".....", ".....", ".....", ".....", ".....", "..##.", "..##."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  "%": ["##...", "##..#", "...#.", "..#..", ".#...", "#..##", "...##"],
};

export function renderPixelTextSprite(text: string, scale = 1, tint = 0xffffff): Sprite {
  const upper = text.toUpperCase();
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, upper.length * ADVANCE);
  canvas.height = ROWS;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas unavailable");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#ffffff";

  for (let i = 0; i < upper.length; i++) {
    const rows = GLYPHS[upper[i]];
    if (!rows) continue;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (rows[r].charAt(c) === "#") ctx.fillRect(i * ADVANCE + c, r, 1, 1);
      }
    }
  }

  const texture = Texture.from(canvas);
  texture.source.scaleMode = "nearest";
  const sprite = new Sprite(texture);
  sprite.scale.set(scale);
  sprite.tint = tint;
  return sprite;
}

/** A text sprite that re-renders (and swaps itself) when the string changes. */
export class PixelText {
  private sprite: Sprite;
  private current: string;

  constructor(
    text: string,
    private readonly scale: number,
    private readonly tint = 0xffffff,
  ) {
    this.sprite = renderPixelTextSprite(text, scale, tint);
    this.current = text;
  }

  get display(): Sprite {
    return this.sprite;
  }

  set text(value: string) {
    if (value === this.current) return;
    this.current = value;
    const old = this.sprite;
    this.sprite = renderPixelTextSprite(value, this.scale, this.tint);
    this.sprite.position.copyFrom(old.position);
    this.sprite.anchor.copyFrom(old.anchor);
    if (old.parent) old.parent.addChild(this.sprite);
    old.destroy();
  }
}
