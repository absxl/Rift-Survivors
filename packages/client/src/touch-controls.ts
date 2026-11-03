// Touch controls: a analog movement stick plus the run-level actions that are
// normally bound to Esc/Tab. Combat is fully automatic, so movement is the only
// gameplay input needed on a phone.
import type { Input } from "./input";

interface TouchControlCallbacks {
  onPause: () => void;
  onStats: () => void;
}

export class TouchControls {
  private readonly root: HTMLElement;
  private readonly joystick: HTMLElement;
  private readonly knob: HTMLElement;
  private pointerId: number | null = null;
  private active = false;

  constructor(
    private readonly input: Input,
    callbacks: TouchControlCallbacks,
  ) {
    this.root = document.createElement("div");
    this.root.className = "touch-controls";

    this.joystick = document.createElement("div");
    this.joystick.className = "touch-joystick";
    this.joystick.setAttribute("role", "group");
    this.joystick.setAttribute("aria-label", "Movement joystick");
    const ring = document.createElement("div");
    ring.className = "touch-joystick-ring";
    this.knob = document.createElement("div");
    this.knob.className = "touch-joystick-knob";
    this.joystick.append(ring, this.knob);

    const actions = document.createElement("div");
    actions.className = "touch-actions";
    const stats = this.button("STATS", "Show run statistics", callbacks.onStats);
    const pause = this.button("II", "Pause the run", callbacks.onPause);
    pause.classList.add("touch-button-pause");
    actions.append(stats, pause);

    this.root.append(this.joystick, actions);
    document.body.appendChild(this.root);

    this.joystick.addEventListener("pointerdown", this.onPointerDown);
    this.joystick.addEventListener("pointermove", this.onPointerMove);
    this.joystick.addEventListener("pointerup", this.onPointerUp);
    this.joystick.addEventListener("pointercancel", this.onPointerUp);
    this.joystick.addEventListener("lostpointercapture", this.onPointerUp);
    this.joystick.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  setActive(active: boolean): void {
    this.active = active;
    this.root.classList.toggle("active", active);
    if (!active) this.resetStick();
  }

  private button(label: string, ariaLabel: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "touch-button";
    button.textContent = label;
    button.setAttribute("aria-label", ariaLabel);
    button.addEventListener("click", onClick);
    return button;
  }

  private resetStick(): void {
    this.pointerId = null;
    this.input.clearTouch();
    this.knob.style.transform = "translate(0px, 0px)";
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.active || this.pointerId !== null) return;
    event.preventDefault();
    this.pointerId = event.pointerId;
    this.joystick.setPointerCapture(event.pointerId);
    this.updateStick(event);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    event.preventDefault();
    this.updateStick(event);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    this.resetStick();
  };

  private updateStick(event: PointerEvent): void {
    const rect = this.joystick.getBoundingClientRect();
    const radius = Math.max(1, rect.width * 0.32);
    let dx = event.clientX - (rect.left + rect.width / 2);
    let dy = event.clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(dx, dy);
    if (length > radius) {
      dx = (dx / length) * radius;
      dy = (dy / length) * radius;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.input.setTouchVector(dx / radius, dy / radius);
  }
}
