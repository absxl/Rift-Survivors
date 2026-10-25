// Short centered announcement (boss rush, etc.). Purely visual, never blocks input.
export class Banner {
  private readonly root: HTMLElement;
  private timer: number | null = null;

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "banner";
    this.root.style.display = "none";
    document.body.appendChild(this.root);
  }

  show(text: string, durationMs = 2600): void {
    this.root.textContent = text;
    this.root.style.display = "block";
    this.root.classList.remove("banner-show");
    // Force a reflow so the animation restarts on consecutive banners.
    void this.root.offsetWidth;
    this.root.classList.add("banner-show");
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.root.style.display = "none";
      this.timer = null;
    }, durationMs);
  }
}
