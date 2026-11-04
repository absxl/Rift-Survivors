// Juice helpers (docs/10 D-061): pure client-side tracking for kill streaks.
// No sim impact — the streak is a cosmetic announcement only.

export const STREAK_WINDOW_MS = 2000;

/** Kill streak names by chain size (2+). Index = chain size. */
const STREAK_NAMES = ["", "", "DOUBLE KILL", "TRIPLE KILL", "QUADRA KILL", "PENTA KILL", "RAMPAGE"];

/**
 * Tracks kill timestamps as a chain: each kill within `windowMs` of the
 * previous one extends the chain; a longer gap restarts it at 1.
 */
export class KillStreakTracker {
  private lastKillAt = Number.NEGATIVE_INFINITY;
  private chain = 0;

  registerKill(nowMs: number, windowMs = STREAK_WINDOW_MS): string {
    if (nowMs - this.lastKillAt <= windowMs) this.chain += 1;
    else this.chain = 1;
    this.lastKillAt = nowMs;
    return streakName(this.chain);
  }

  reset(): void {
    this.chain = 0;
    this.lastKillAt = Number.NEGATIVE_INFINITY;
  }
}

export function streakName(chain: number): string {
  if (chain < 2) return "";
  return STREAK_NAMES[Math.min(chain, STREAK_NAMES.length - 1)];
}
