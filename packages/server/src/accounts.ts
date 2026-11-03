import { randomUUID } from "node:crypto";
// Simple file-backed accounts for the friends server. Discord OAuth is the
// intended production login; the same store also supports a dev-only local login
// so server saves can be tested without a Discord application.
import fs from "node:fs";
import path from "node:path";
import { validateNickname } from "@rift/shared";

export interface AccountRecord {
  id: string;
  discordId?: string;
  nickname: string;
  avatarUrl?: string;
  createdAt: number;
  updatedAt: number;
  /** Opaque client SaveData. The server persists it; it does not interpret it. */
  save: unknown | null;
}

export interface PublicAccount {
  id: string;
  nickname: string;
  avatarUrl?: string;
  discordLinked: boolean;
}

export interface DiscordIdentity {
  id: string;
  username: string;
  globalName?: string;
  avatar?: string;
}

interface StoreFile {
  version: 2;
  accounts: AccountRecord[];
  /** Serialized sessions so a server restart does not log everyone out. */
  sessions?: Record<string, SessionRecord>;
}

interface SessionRecord {
  accountId: string;
  expiresAt: number;
}

export interface AccountStoreOptions {
  /** A file path, or null for an in-memory store (tests). */
  file?: string | null;
  sessionTtlMs?: number;
  now?: () => number;
}

const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export class AccountStore {
  private accounts: AccountRecord[] = [];
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly file: string | null;
  private readonly sessionTtlMs: number;
  private readonly now: () => number;

  constructor(options: AccountStoreOptions = {}) {
    this.file = options.file === undefined ? "data/accounts.json" : options.file;
    this.sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
    this.now = options.now ?? Date.now;
    this.load();
  }

  private load(): void {
    if (!this.file || !fs.existsSync(this.file)) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8")) as Partial<StoreFile>;
      if (Array.isArray(parsed.accounts)) {
        this.accounts = parsed.accounts.filter(
          (account): account is AccountRecord =>
            typeof account?.id === "string" && typeof account?.nickname === "string",
        );
      }
      if (parsed.sessions && typeof parsed.sessions === "object") {
        const now = this.now();
        for (const [token, session] of Object.entries(parsed.sessions)) {
          if (
            typeof token === "string" &&
            token.length > 0 &&
            session &&
            typeof session.accountId === "string" &&
            typeof session.expiresAt === "number" &&
            session.expiresAt > now
          ) {
            this.sessions.set(token, {
              accountId: session.accountId,
              expiresAt: session.expiresAt,
            });
          }
        }
      }
    } catch (error) {
      console.error("[accounts] could not load account file", error);
    }
  }

  private persist(): void {
    if (!this.file) return;
    const file = this.file;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const payload: StoreFile = {
        version: 2,
        accounts: this.accounts,
        sessions: Object.fromEntries(this.sessions),
      };
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
      fs.renameSync(tmp, file);
    } catch (error) {
      console.error("[accounts] could not persist account file", error);
    }
  }

  private uniqueNickname(base: string): string {
    let clean = base.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 20);
    if (clean.length < 3) clean = "Summoner";
    let candidate = clean;
    let suffix = 2;
    while (this.accounts.some((a) => a.nickname.toLowerCase() === candidate.toLowerCase())) {
      const tail = `-${suffix}`;
      candidate = `${clean.slice(0, Math.max(1, 20 - tail.length))}${tail}`;
      suffix++;
    }
    return candidate;
  }

  private create(nickname: string, discordId?: string, avatarUrl?: string): AccountRecord {
    const now = this.now();
    const account: AccountRecord = {
      id: randomUUID(),
      discordId,
      nickname: this.uniqueNickname(nickname),
      avatarUrl,
      createdAt: now,
      updatedAt: now,
      save: null,
    };
    this.accounts.push(account);
    this.persist();
    return account;
  }

  findById(id: string): AccountRecord | null {
    return this.accounts.find((account) => account.id === id) ?? null;
  }

  findByDiscordId(discordId: string): AccountRecord | null {
    return this.accounts.find((account) => account.discordId === discordId) ?? null;
  }

  findByNickname(nickname: string): AccountRecord | null {
    const key = nickname.toLowerCase();
    return this.accounts.find((account) => account.nickname.toLowerCase() === key) ?? null;
  }

  getOrCreateDiscord(identity: DiscordIdentity): AccountRecord {
    const existing = this.findByDiscordId(identity.id);
    const avatar = identity.avatar
      ? `https://cdn.discordapp.com/avatars/${identity.id}/${identity.avatar}.png`
      : undefined;
    if (existing) {
      existing.avatarUrl = avatar ?? existing.avatarUrl;
      existing.updatedAt = this.now();
      this.persist();
      return existing;
    }
    return this.create(identity.globalName || identity.username, identity.id, avatar);
  }

  /** Dev-only login: a local account selected by nickname, no Discord identity. */
  getOrCreateDev(nickname: string): AccountRecord | null {
    const validation = validateNickname(nickname);
    if (!validation.ok) return null;
    const existing = this.findByNickname(validation.value);
    if (existing) {
      if (existing.discordId) return null;
      return existing;
    }
    return this.create(validation.value);
  }

  setNickname(
    accountId: string,
    nickname: string,
  ): { ok: true; account: AccountRecord } | { ok: false; error: string } {
    const validation = validateNickname(nickname);
    if (!validation.ok) return { ok: false, error: validation.error ?? "Invalid nickname." };
    const account = this.findById(accountId);
    if (!account) return { ok: false, error: "Account not found." };
    const other = this.findByNickname(validation.value);
    if (other && other.id !== accountId) return { ok: false, error: "That name is already taken." };
    account.nickname = validation.value;
    account.updatedAt = this.now();
    this.persist();
    return { ok: true, account };
  }

  getSave(accountId: string): unknown | null {
    return this.findById(accountId)?.save ?? null;
  }

  putSave(accountId: string, save: unknown): boolean {
    const account = this.findById(accountId);
    if (!account) return false;
    account.save = save;
    account.updatedAt = this.now();
    this.persist();
    return true;
  }

  createSession(accountId: string): string {
    const token = randomUUID();
    this.sessions.set(token, {
      accountId,
      expiresAt: this.now() + this.sessionTtlMs,
    });
    // Persist so sessions survive a server restart.
    this.persist();
    return token;
  }

  getSessionAccount(token: string | null | undefined): AccountRecord | null {
    if (!token) return null;
    const session = this.sessions.get(token);
    if (!session) return null;
    if (session.expiresAt <= this.now()) {
      this.sessions.delete(token);
      this.persist();
      return null;
    }
    return this.findById(session.accountId);
  }

  deleteSession(token: string | null | undefined): void {
    if (!token) return;
    if (!this.sessions.delete(token)) return;
    this.persist();
  }

  publicAccount(account: AccountRecord): PublicAccount {
    return {
      id: account.id,
      nickname: account.nickname,
      avatarUrl: account.avatarUrl,
      discordLinked: Boolean(account.discordId),
    };
  }
}
