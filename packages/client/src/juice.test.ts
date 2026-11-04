import { describe, expect, it } from "vitest";
import { KillStreakTracker, streakName } from "./juice";

describe("kill streaks", () => {
  it("escalates inside the window and resets outside it", () => {
    const tracker = new KillStreakTracker();
    expect(tracker.registerKill(0)).toBe("");
    expect(tracker.registerKill(400)).toBe("DOUBLE KILL");
    expect(tracker.registerKill(900)).toBe("TRIPLE KILL");
    expect(tracker.registerKill(1400)).toBe("QUADRA KILL");
    // Far outside the 2s window from the first kill: chain restarts.
    expect(tracker.registerKill(3_600)).toBe("");
    expect(tracker.registerKill(3_900)).toBe("DOUBLE KILL");
  });

  it("caps at RAMPAGE", () => {
    const tracker = new KillStreakTracker();
    let name = "";
    for (let i = 0; i < 9; i++) name = tracker.registerKill(i * 100);
    expect(name).toBe("RAMPAGE");
    expect(streakName(12)).toBe("RAMPAGE");
    expect(streakName(1)).toBe("");
  });

  it("chains uneven gaps while each kill lands inside the window", () => {
    const tracker = new KillStreakTracker();
    expect(tracker.registerKill(0)).toBe("");
    expect(tracker.registerKill(1_900)).toBe("DOUBLE KILL");
    // 500ms after the previous kill: the chain keeps growing.
    expect(tracker.registerKill(2_400)).toBe("TRIPLE KILL");
    tracker.reset();
    expect(tracker.registerKill(10_000)).toBe("");
  });
});
