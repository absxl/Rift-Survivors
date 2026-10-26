// Run-end overlay: shows the run stats and a CONTINUE button that returns to the
// meta screen (via a reload so the persisted save is reloaded cleanly).
export interface RunEndStats {
  time: string;
  kills: number;
  gold: number;
  chests: number;
  newAchievements: string[];
}

export class RunEndUI {
  private readonly root: HTMLElement;
  private readonly stats: HTMLElement;
  private continueCb: (() => void) | null = null;

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "run-end";
    this.root.style.display = "none";

    const title = document.createElement("div");
    title.className = "run-end-title";
    title.textContent = "GAME OVER";
    this.root.appendChild(title);

    this.stats = document.createElement("div");
    this.stats.className = "run-end-stats";
    this.root.appendChild(this.stats);

    const btn = document.createElement("button");
    btn.className = "meta-play";
    btn.textContent = "CONTINUE";
    btn.addEventListener("click", () => {
      if (this.continueCb) this.continueCb();
    });
    this.root.appendChild(btn);

    document.body.appendChild(this.root);
  }

  show(stats: RunEndStats): void {
    let text = `TIME ${stats.time}   KILLS ${stats.kills}   GOLD +${stats.gold}   CHESTS +${stats.chests} (OPEN IN SHOP)`;
    if (stats.newAchievements.length > 0) {
      text += `\nACHIEVEMENT: ${stats.newAchievements.join(", ")}`;
    }
    this.stats.textContent = text;
    this.root.style.display = "flex";
  }

  onContinue(cb: () => void): void {
    this.continueCb = cb;
  }
}
