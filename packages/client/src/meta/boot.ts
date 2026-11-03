// Game shell: boot screen + title layer (docs/10 D-056). The boot screen
// plays once (logo shimmer + load bar + CLICK TO START, which also unlocks
// audio); the title layer is a full-bleed splash carousel over the hub that
// dissolves on first input. All animation collapses under prefers-reduced-motion.
import { championCardURL } from "../assets/champion-sprites";

export interface BootOptions {
  onAudioUnlock: () => void;
  onStart: () => void;
  /** Champion ids with card art, for the title carousel. */
  splashIds: string[];
}

export class GameShell {
  private readonly boot: HTMLElement;
  private readonly title: HTMLElement;
  private titleTimer: number | null = null;

  constructor(options: BootOptions) {
    this.boot = buildBoot(options);
    this.title = buildTitle(options);
    document.body.append(this.boot, this.title);
  }

  /** Play the boot sequence; resolves when the player continues past it. */
  play(): void {
    this.boot.style.display = "flex";
    this.title.style.display = "grid";
    this.title.classList.add("hidden");
  }

  /** Called by the boot screen when the player clicks to start. */
  dismissBoot(): void {
    this.boot.classList.add("boot-out");
    window.setTimeout(() => {
      this.boot.style.display = "none";
      this.title.classList.remove("hidden");
      this.title.classList.add("title-in");
    }, 650);
  }

  /** Dissolve the title layer into the hub. */
  dismissTitle(): void {
    this.stopCarousel();
    this.title.classList.add("title-out");
    window.setTimeout(() => {
      this.title.style.display = "none";
    }, 900);
  }

  private stopCarousel(): void {
    if (this.titleTimer !== null) {
      window.clearInterval(this.titleTimer);
      this.titleTimer = null;
    }
  }
}

function buildBoot(options: BootOptions): HTMLElement {
  const root = document.createElement("div");
  root.className = "boot";
  const crest = document.createElement("img");
  crest.src = "brand/rift-survivors-crest-ornate.png";
  crest.alt = "";
  crest.className = "boot-crest";
  const logo = document.createElement("div");
  logo.className = "boot-logo";
  logo.textContent = "RIFT SURVIVORS";
  const bar = document.createElement("div");
  bar.className = "boot-bar";
  const fill = document.createElement("div");
  fill.className = "boot-bar-fill";
  bar.appendChild(fill);
  const prompt = document.createElement("button");
  prompt.className = "boot-start";
  prompt.textContent = "CLICK TO START";
  prompt.style.visibility = "hidden";
  prompt.addEventListener("click", () => {
    options.onAudioUnlock();
    options.onStart();
  });

  // Fake-then-real load: bar fills over ~1.4s, then the prompt appears.
  window.setTimeout(() => fill.classList.add("full"), 60);
  window.setTimeout(() => {
    prompt.style.visibility = "visible";
    prompt.focus();
  }, 1500);
  root.append(crest, logo, bar, prompt);
  return root;
}

function buildTitle(options: BootOptions): HTMLElement {
  const root = document.createElement("div");
  root.className = "title-screen";
  root.setAttribute("role", "button");
  root.setAttribute("aria-label", "Enter the Rift");

  const layers: HTMLElement[] = [];
  const ids = options.splashIds.slice(0, 24);
  for (const id of ids) {
    const url = championCardURL(id);
    if (!url) continue;
    const layer = document.createElement("div");
    layer.className = "title-splash";
    layer.style.backgroundImage = `url(${url})`;
    root.appendChild(layer);
    layers.push(layer);
  }
  if (layers.length > 0) layers[0].classList.add("active");

  const vignette = document.createElement("div");
  vignette.className = "title-vignette";
  const logo = document.createElement("div");
  logo.className = "title-logo";
  logo.textContent = "RIFT SURVIVORS";
  const sub = document.createElement("div");
  sub.className = "title-sub";
  sub.textContent = "CLICK TO ENTER";

  root.append(vignette, logo, sub);
  let index = 0;
  options.onStart; // the title continues into the hub on click below
  root.addEventListener("click", () => {
    if (root.classList.contains("title-out")) return;
    options.onAudioUnlock();
    options.onStart();
  });
  window.addEventListener("keydown", (e) => {
    if (root.style.display === "none" || root.classList.contains("title-out")) return;
    if (e.key === "Enter" || e.key === " ") {
      options.onAudioUnlock();
      options.onStart();
    }
  });

  // Carousel: cross-fade splash layers every 5s with a slow ken-burns pan.
  if (layers.length > 1) {
    window.setInterval(() => {
      layers[index].classList.remove("active");
      index = (index + 1) % layers.length;
      layers[index].classList.add("active");
    }, 5000);
  }
  return root;
}
