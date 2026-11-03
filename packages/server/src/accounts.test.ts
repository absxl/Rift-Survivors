import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AccountStore } from "./accounts";

const temps: string[] = [];

function tempFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rift-accounts-"));
  temps.push(dir);
  return path.join(dir, "accounts.json");
}

afterEach(() => {
  while (temps.length > 0) {
    const dir = temps.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("account store", () => {
  it("creates unique nicknames, sessions, and persists the save", () => {
    const file = tempFile();
    const store = new AccountStore({ file });
    const first = store.getOrCreateDiscord({ id: "one", username: "summoner" });
    const second = store.getOrCreateDiscord({ id: "two", username: "summoner" });
    expect(first.nickname.toLowerCase()).toBe("summoner");
    expect(second.nickname.toLowerCase()).not.toBe("summoner");

    const token = store.createSession(first.id);
    expect(store.getSessionAccount(token)?.id).toBe(first.id);
    expect(store.putSave(first.id, { version: 5, gold: 123 })).toBe(true);
    expect(store.getSave(first.id)).toMatchObject({ version: 5, gold: 123 });

    const reloaded = new AccountStore({ file });
    expect(reloaded.getSave(first.id)).toMatchObject({ gold: 123 });
    // Sessions persist across restarts so players stay logged in.
    expect(reloaded.getSessionAccount(token)?.id).toBe(first.id);
  });

  it("persists sessions across restarts and drops expired ones on load", () => {
    const file = tempFile();
    let now = 1000;
    const store = new AccountStore({ file, now: () => now, sessionTtlMs: 100 });
    const account = store.getOrCreateDev("Persist");
    if (!account) throw new Error("dev account missing");
    const token = store.createSession(account.id);

    const reloaded = new AccountStore({ file, now: () => now, sessionTtlMs: 100 });
    expect(reloaded.getSessionAccount(token)?.id).toBe(account.id);

    now += 101;
    const later = new AccountStore({ file, now: () => now, sessionTtlMs: 100 });
    expect(later.getSessionAccount(token)).toBeNull();
  });

  it("enforces nickname format and global uniqueness", () => {
    const store = new AccountStore({ file: null });
    const a = store.getOrCreateDev("Alpha");
    const b = store.getOrCreateDev("Beta");
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    if (!a || !b) throw new Error("dev accounts missing");
    expect(store.setNickname(b.id, "Alpha")).toMatchObject({ ok: false });
    expect(store.setNickname(b.id, "Al")).toMatchObject({ ok: false });
    expect(store.setNickname(b.id, "Alpha-2")).toMatchObject({ ok: true });
    expect(store.findById(b.id)?.nickname).toBe("Alpha-2");
  });

  it("links Discord identities to one account and keeps the avatar", () => {
    const store = new AccountStore({ file: null });
    const first = store.getOrCreateDiscord({
      id: "discord-1",
      username: "name",
      globalName: "Name",
      avatar: "abc",
    });
    const second = store.getOrCreateDiscord({
      id: "discord-1",
      username: "name",
      globalName: "Name",
      avatar: "def",
    });
    expect(second.id).toBe(first.id);
    expect(second.avatarUrl).toContain("/def.png");
  });

  it("expires sessions", () => {
    let now = 1000;
    const store = new AccountStore({ file: null, now: () => now, sessionTtlMs: 100 });
    const account = store.getOrCreateDev("Expiry");
    if (!account) throw new Error("dev account missing");
    const token = store.createSession(account.id);
    expect(store.getSessionAccount(token)).toBeTruthy();
    now += 101;
    expect(store.getSessionAccount(token)).toBeNull();
  });
});
