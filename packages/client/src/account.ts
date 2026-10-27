// Browser account client for the friends server. Same-origin `/api` and `/auth`
// are proxied to the Node server in dev; production should reverse-proxy them.
import type { SaveData } from "./save/save";

export interface AccountInfo {
  id: string;
  nickname: string;
  avatarUrl?: string;
  discordLinked: boolean;
}

export interface AuthConfigInfo {
  discordEnabled: boolean;
  devAuth: boolean;
}

interface MeResponse {
  account: AccountInfo;
  save: Partial<SaveData> | null;
  discordEnabled: boolean;
  devAuth: boolean;
}

export class AccountClient {
  account: AccountInfo | null = null;
  discordEnabled = false;
  devAuth = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSave: SaveData | null = null;

  async restore(): Promise<{ account: AccountInfo; save: Partial<SaveData> | null } | null> {
    try {
      const response = await fetch("/api/me", {
        credentials: "same-origin",
        signal: AbortSignal.timeout(2500),
      });
      if (response.ok) {
        const data = (await response.json()) as MeResponse;
        this.account = data.account;
        this.discordEnabled = data.discordEnabled;
        this.devAuth = data.devAuth;
        return { account: data.account, save: data.save };
      }
      if (response.status === 401) {
        await this.loadConfig();
        return null;
      }
    } catch {
      // Offline/local mode is valid; the profile stays local.
    }
    return null;
  }

  async loadConfig(): Promise<void> {
    try {
      const response = await fetch("/api/auth-config", {
        credentials: "same-origin",
        signal: AbortSignal.timeout(1500),
      });
      if (!response.ok) return;
      const data = (await response.json()) as AuthConfigInfo;
      this.discordEnabled = data.discordEnabled;
      this.devAuth = data.devAuth;
    } catch {
      // Local mode.
    }
  }

  loginWithDiscord(): void {
    window.location.href = "/auth/discord";
  }

  async devLogin(nickname: string): Promise<string | null> {
    try {
      const response = await fetch("/api/dev-login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        return data.error ?? "Could not create the local account.";
      }
      window.location.reload();
      return null;
    } catch {
      return "Server unavailable.";
    }
  }

  async setNickname(nickname: string): Promise<string | null> {
    if (!this.account) return null;
    try {
      const response = await fetch("/api/nickname", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        account?: AccountInfo;
        error?: string;
      };
      if (!response.ok || !data.account) return data.error ?? "Nickname update failed.";
      this.account = data.account;
      return null;
    } catch {
      return "Server unavailable.";
    }
  }

  async logout(): Promise<void> {
    try {
      await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
    } catch {
      // Still clear the local session UI.
    }
    this.account = null;
    window.location.reload();
  }

  /** Debounced full-save upload. Only active for a logged-in account. */
  queueSave(save: SaveData): void {
    if (!this.account) return;
    this.lastSave = save;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flushSave(), 600);
  }

  async flushSave(): Promise<void> {
    if (!this.account || !this.lastSave) return;
    const snapshot = this.lastSave;
    this.lastSave = null;
    try {
      await fetch("/api/save", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ save: snapshot }),
      });
    } catch {
      console.warn("[account] cloud save upload failed; local save is still current");
    }
  }
}
