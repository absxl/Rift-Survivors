// Move-only input: keyboard (rebindable, arrows always work) + gamepad left
// stick / D-pad. No aiming/dash.
import type { PlayerInput } from "@rift/sim";
import type { Keybinds } from "./save/save";

export class Input {
  private readonly keys = new Set<string>();
  private keybinds: Keybinds = { up: "w", down: "s", left: "a", right: "d" };

  attach(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  detach(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.keys.clear();
  }

  /** Rebind movement keys from save settings (arrow keys always work too). */
  setKeybinds(keybinds: Keybinds): void {
    this.keybinds = { ...keybinds };
  }

  read(): PlayerInput {
    let x = 0;
    let y = 0;
    const kb = this.keybinds;
    if (this.keys.has(kb.left) || this.keys.has("arrowleft")) x -= 1;
    if (this.keys.has(kb.right) || this.keys.has("arrowright")) x += 1;
    if (this.keys.has(kb.up) || this.keys.has("arrowup")) y -= 1;
    if (this.keys.has(kb.down) || this.keys.has("arrowdown")) y += 1;

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
      const axisX = pad.axes[0] ?? 0;
      const axisY = pad.axes[1] ?? 0;
      // Standard mapping: D-pad up/down/left/right = buttons 12/13/14/15.
      const dpadX = (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0);
      const dpadY = (pad.buttons[13]?.pressed ? 1 : 0) - (pad.buttons[12]?.pressed ? 1 : 0);
      const x = Math.abs(axisX) > 0.15 ? axisX : dpadX;
      const y = Math.abs(axisY) > 0.15 ? axisY : dpadY;
      if (x !== 0 || y !== 0) return { x, y };
    }
    return { x: 0, y: 0 };
  }
}
