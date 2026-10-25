// Full-screen notice shown when the authoritative co-op connection drops mid-run.
export class ConnectionLost {
  private readonly root: HTMLElement;

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "connection-lost";
    this.root.style.display = "none";

    const title = document.createElement("div");
    title.className = "pause-title";
    title.textContent = "CONNECTION LOST";
    this.root.appendChild(title);

    const hint = document.createElement("div");
    hint.className = "pause-hint";
    hint.textContent = "THE ROOM SERVER IS UNREACHABLE.";
    this.root.appendChild(hint);

    const button = document.createElement("button");
    button.className = "meta-play";
    button.textContent = "RETURN TO MENU";
    button.addEventListener("click", () => window.location.reload());
    this.root.appendChild(button);

    document.body.appendChild(this.root);
  }

  show(): void {
    this.root.style.display = "flex";
  }

  hide(): void {
    this.root.style.display = "none";
  }
}
