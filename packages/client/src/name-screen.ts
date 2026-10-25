// Name entry shown after champion select, before the co-op lobby.
export class NameScreen {
  private readonly root: HTMLElement;
  private readonly input: HTMLInputElement;
  private confirmCb: ((name: string) => void) | null = null;

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "name-screen";
    this.root.style.display = "none";

    const title = document.createElement("div");
    title.className = "lobby-title";
    title.textContent = "YOUR NAME";
    this.root.appendChild(title);

    this.input = document.createElement("input");
    this.input.className = "lobby-input";
    this.input.placeholder = "summoner name";
    this.input.maxLength = 16;
    this.input.value = "player";
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.confirm();
    });
    this.root.appendChild(this.input);

    const btn = document.createElement("button");
    btn.className = "meta-play";
    btn.textContent = "CONTINUE";
    btn.addEventListener("click", () => this.confirm());
    this.root.appendChild(btn);

    document.body.appendChild(this.root);
  }

  show(): void {
    this.root.style.display = "flex";
    this.input.focus();
    this.input.select();
  }

  hide(): void {
    this.root.style.display = "none";
  }

  onConfirm(cb: (name: string) => void): void {
    this.confirmCb = cb;
  }

  private confirm(): void {
    const name = (this.input.value.trim() || "player").slice(0, 16);
    this.hide();
    this.confirmCb?.(name);
  }
}
