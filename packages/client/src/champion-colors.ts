// Cosmetic champion identity colors (placeholder-art phase). The player sprite is
// tinted with the champion's color so each mage reads differently at a glance.
const COLORS: Record<string, number> = {
  lux: 0xffe066,
  brand: 0xff6633,
  ahri: 0xff66cc,
  ryze: 0x4488ff,
  syndra: 0xaa66ff,
  veigar: 0x9a4cff,
  annie: 0xff8844,
  xerath: 0x44ccff,
};

const EXTRA_COLORS = [
  0x66d9c8, 0xe07a9a, 0x8fb7ff, 0xc9a76a, 0x9cd36b, 0xd58cff, 0x74c9e8, 0xff9c6b, 0xb8d36b,
  0x8d9cff, 0xf0a7d0, 0x64d1a4, 0xd9b86a, 0x9b7ee8, 0x6fc5d8, 0xe38b6a,
];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function championColor(id: string | undefined): number {
  if (!id) return 0x44aaff;
  return COLORS[id] ?? EXTRA_COLORS[hash(id) % EXTRA_COLORS.length];
}
