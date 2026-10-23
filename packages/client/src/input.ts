// Move-only input: keyboard (WASD/arrows) + gamepad left stick. No aiming/dash.
import type { PlayerInput } from "@rift/sim";

export class Input {
  private readonly keys = new Set<string>();

  attach(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  detach(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.keys.clear();
  }

  read(): PlayerInput {
    let x = 0;
    let y = 0;
    if (this.keys.has("a") || this.keys.has("arrowleft")) x -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) x += 1;
    if (this.keys.has("w") || this.keys.has("arrowup")) y -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) y += 1;

    const gamepad = this.readGamepad();
    x += gamepad.x;
    y += gamepad.y;
    return { playerId: 0, moveX: x, moveY: y };
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    this.keys.add(e.key.toLowerCase());
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };

  private readGamepad(): { x: number; y: number } {
    if (typeof navigator === "undefined" || !navigator.getGamepads) return { x: 0, y: 0 };
    const pads = navigator.getGamepads();
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const x = pad.axes[0] ?? 0;
      const y = pad.axes[1] ?? 0;
      if (Math.abs(x) > 0.15 || Math.abs(y) > 0.15) return { x, y };
    }
    return { x: 0, y: 0 };
  }
}
