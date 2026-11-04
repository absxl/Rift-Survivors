// Game shell (docs/10 D-056/D-063): a properly gated three-stage flow —
// boot screen ("CLICK TO START") → splash-carousel title ("CLICK TO ENTER")
// → hub. The hub stays hidden until the title dissolves, so the raw game
// never flashes before the wallpaper. `skip()` jumps straight to the hub for
// return visits after a run. All animation collapses under reduced-motion.
import { championCardURL } from "../assets/champion-sprites";

export interface BootOptions {
  onAudioUnlock: () => void;
  /** Called when the boot screen's start button is pressed. */
  onBootComplete: () => void;
  /** Called when the title layer is dismissed (entering the hub). */
  onTitleComplete: () => void;
  /** Champion ids with card art, for the title carousel. */
  splashIds: string[];
}

export class GameShell {
  private readonly boot: HTMLElement;
  private readonly title: HTMLElement;
  private titleTimer: number | null = null;

  constructor(options: BootOptions) {
    this.boot = buildBoot({
      onAudioUnlock: options.onAudioUnlock,
      onStart: () => {
        options.onBootComplete();
        this.dismissBoot();
      },
    });
    this.title = buildTitle({
      onAudioUnlock: options.onAudioUnlock,
      onEnter: () => {
        options.onTitleComplete();
        this.dismissTitle();
      },
      splashIds: options.splashIds,
    });
    // Both stages start hidden; play() reveals the boot screen.
    this.boot.style.display = "none";
    this.title.style.display = "none";
    document.body.append(this.boot, this.title);
  }

  /** Show the boot screen. Call once at startup. */
  play(): void {
    this.boot.style.display = "flex";
  }

  /** Boot fade-out, then the title carousel becomes interactive. */
  dismissBoot(): void {
    this.boot.classList.add("boot-out");
    window.setTimeout(() => {
      this.boot.style.display = "none";
      this.title.style.display = "grid";
      this.title.classList.add("title-in");
    }, 620);
  }

  /** Dissolve the title into the hub. */
  dismissTitle(): void {
    if (this.titleTimer !== null) {
      window.clearInterval(this.titleTimer);
      this.titleTimer = null;
    }
    this.title.classList.add("title-out");
    window.setTimeout(() => {
      this.title.style.display = "none";
    }, 850);
  }

  /** Return visits after a run: straight to the hub, no shell replay. */
  skip(): void {
    if (this.titleTimer !== null) {
      window.clearInterval(this.titleTimer);
      this.titleTimer = null;
    }
    this.boot.style.display = "none";
    this.title.style.display = "none";
  }
}

function buildBoot(options: { onAudioUnlock: () => void; onStart: () => void }): HTMLElement {
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

  window.setTimeout(() => fill.classList.add("full"), 60);
  window.setTimeout(() => {
    prompt.style.visibility = "visible";
    prompt.focus();
  }, 1400);
  root.append(crest, logo, bar, prompt);
  return root;
}

function buildTitle(options: {
  onAudioUnlock: () => void;
  onEnter: () => void;
  splashIds: string[];
}): HTMLElement {
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
  root.addEventListener("click", () => {
    if (root.classList.contains("title-out")) return;
    options.onAudioUnlock();
    options.onEnter();
  });
  window.addEventListener("keydown", (e) => {
    if (root.style.display === "none" || root.classList.contains("title-out")) return;
    if (e.key === "Enter" || e.key === " ") {
      options.onAudioUnlock();
      options.onEnter();
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
