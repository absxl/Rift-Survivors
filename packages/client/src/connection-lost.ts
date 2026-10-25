// Full-screen notice shown while a co-op connection drops or is being retried.
export class ConnectionLost {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly hint: HTMLElement;

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "connection-lost";
    this.root.style.display = "none";

    this.title = document.createElement("div");
    this.title.className = "pause-title";
    this.title.textContent = "CONNECTION LOST";
    this.root.appendChild(this.title);

    this.hint = document.createElement("div");
    this.hint.className = "pause-hint";
    this.hint.textContent = "THE ROOM SERVER IS UNREACHABLE.";
    this.root.appendChild(this.hint);

    const button = document.createElement("button");
    button.className = "meta-play";
    button.textContent = "RETURN TO MENU";
    button.addEventListener("click", () => window.location.reload());
    this.root.appendChild(button);

    document.body.appendChild(this.root);
  }

  show(message = "CONNECTION LOST", hint = "THE ROOM SERVER IS UNREACHABLE."): void {
    this.title.textContent = message;
    this.hint.textContent = hint;
    this.root.style.display = "flex";
  }

  hide(): void {
    this.root.style.display = "none";
  }
}
