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

export function championColor(id: string | undefined): number {
  return id ? (COLORS[id] ?? 0x44aaff) : 0x44aaff;
}
