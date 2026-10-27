import { randomBytes } from "node:crypto";
// Account HTTP surface: Discord OAuth, local dev login, profile nickname, and
// server-side save persistence. The game WebSocket is still guest-friendly; this
// module makes the account/cloud-save foundation real and testable before the
// Discord application is deployed.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AccountStore, DiscordIdentity } from "./accounts";

const SESSION_COOKIE = "rift_session";
const STATE_COOKIE = "rift_oauth_state";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_BODY = 512 * 1024;

export interface AuthConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri: string;
  clientOrigin?: string;
  devAuth: boolean;
  secureCookies: boolean;
}

export function authConfigFromEnv(overrides: Partial<AuthConfig> = {}): AuthConfig {
  const redirectUri =
    overrides.redirectUri ??
    process.env.DISCORD_REDIRECT_URI ??
    "http://localhost:5173/auth/discord/callback";
  return {
    clientId: overrides.clientId ?? process.env.DISCORD_CLIENT_ID,
    clientSecret: overrides.clientSecret ?? process.env.DISCORD_CLIENT_SECRET,
    redirectUri,
    clientOrigin: overrides.clientOrigin ?? process.env.CLIENT_ORIGIN,
    devAuth: overrides.devAuth ?? process.env.RIFT_DEV_AUTH === "1",
    secureCookies: overrides.secureCookies ?? redirectUri.startsWith("https://"),
  };
}

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const pair of header.split(";")) {
    const index = pair.indexOf("=");
    if (index < 0) continue;
    cookies[pair.slice(0, index).trim()] = decodeURIComponent(pair.slice(index + 1).trim());
  }
  return cookies;
}

function cookie(name: string, value: string, maxAgeSec: number, secure: boolean): string {
  return `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}${
    secure ? "; Secure" : ""
  }`;
}

function clearCookie(name: string): string {
  return `${name}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

export function sessionTokenFromCookieHeader(header: string | undefined): string | null {
  return parseCookies(header)[SESSION_COOKIE] ?? null;
}

function sessionToken(req: IncomingMessage): string | null {
  return sessionTokenFromCookieHeader(req.headers.cookie);
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > MAX_BODY) throw new Error("body too large");
    chunks.push(buffer);
  }
  if (length === 0) return null;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function cors(req: IncomingMessage, res: ServerResponse, config: AuthConfig): void {
  const origin = req.headers.origin;
  if (!origin) return;
  if (!config.clientOrigin || origin === config.clientOrigin) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("access-control-allow-credentials", "true");
    res.setHeader("vary", "origin");
  }
}

async function exchangeDiscord(
  code: string,
  config: AuthConfig,
): Promise<{ identity: DiscordIdentity; accessToken: string } | null> {
  if (!config.clientId || !config.clientSecret) return null;
  const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
    }),
  });
  if (!tokenResponse.ok) {
    console.error("[auth] discord token exchange failed", tokenResponse.status);
    return null;
  }
  const token = (await tokenResponse.json()) as { access_token?: string };
  if (!token.access_token) return null;
  const userResponse = await fetch("https://discord.com/api/users/@me", {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  if (!userResponse.ok) return null;
  const user = (await userResponse.json()) as {
    id: string;
    username: string;
    global_name?: string | null;
    avatar?: string | null;
  };
  return {
    accessToken: token.access_token,
    identity: {
      id: user.id,
      username: user.username,
      globalName: user.global_name ?? undefined,
      avatar: user.avatar ?? undefined,
    },
  };
}

/**
 * Handle account routes. Returns true when the request was handled, false when
 * the caller should fall through to 404 (or the WebSocket/health server).
 */
export async function handleAccountHttp(
  req: IncomingMessage,
  res: ServerResponse,
  store: AccountStore,
  config: AuthConfig,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  cors(req, res, config);
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
      "access-control-allow-headers": "content-type",
    });
    res.end();
    return true;
  }

  if (url.pathname === "/api/auth-config") {
    json(res, 200, {
      discordEnabled: Boolean(config.clientId && config.clientSecret),
      devAuth: config.devAuth,
    });
    return true;
  }

  if (url.pathname === "/auth/discord" && req.method === "GET") {
    if (!config.clientId || !config.clientSecret) {
      json(res, 503, { error: "Discord login is not configured." });
      return true;
    }
    const state = randomBytes(24).toString("hex");
    res.setHeader("set-cookie", cookie(STATE_COOKIE, state, 600, config.secureCookies));
    const authorize = new URL("https://discord.com/oauth2/authorize");
    authorize.searchParams.set("client_id", config.clientId);
    authorize.searchParams.set("redirect_uri", config.redirectUri);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("scope", "identify");
    authorize.searchParams.set("state", state);
    res.writeHead(302, { location: authorize.toString() });
    res.end();
    return true;
  }

  if (url.pathname === "/auth/discord/callback" && req.method === "GET") {
    const storedState = parseCookies(req.headers.cookie)[STATE_COOKIE];
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    if (!state || !storedState || state !== storedState || !code) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("Invalid Discord login state. Close this tab and try again.");
      return true;
    }
    const result = await exchangeDiscord(code, config);
    if (!result) {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end("Discord login failed. Close this tab and try again.");
      return true;
    }
    const account = store.getOrCreateDiscord(result.identity);
    const token = store.createSession(account.id);
    res.setHeader("set-cookie", [
      cookie(SESSION_COOKIE, token, SESSION_TTL_MS / 1000, config.secureCookies),
      clearCookie(STATE_COOKIE),
    ]);
    res.writeHead(302, { location: config.clientOrigin ?? "/" });
    res.end();
    return true;
  }

  if (url.pathname === "/api/dev-login" && req.method === "POST") {
    if (!config.devAuth) {
      json(res, 404, { error: "dev login disabled" });
      return true;
    }
    let body: { nickname?: string } | null = null;
    try {
      body = (await readBody(req)) as { nickname?: string } | null;
    } catch {
      json(res, 400, { error: "invalid body" });
      return true;
    }
    const account = body?.nickname ? store.getOrCreateDev(body.nickname) : null;
    if (!account) {
      json(res, 400, { error: "invalid nickname or Discord-linked account" });
      return true;
    }
    const token = store.createSession(account.id);
    res.setHeader(
      "set-cookie",
      cookie(SESSION_COOKIE, token, SESSION_TTL_MS / 1000, config.secureCookies),
    );
    json(res, 200, {
      account: store.publicAccount(account),
      save: store.getSave(account.id),
    });
    return true;
  }

  const account = store.getSessionAccount(sessionToken(req));

  if (url.pathname === "/api/me" && req.method === "GET") {
    if (!account) {
      json(res, 401, { error: "not logged in" });
      return true;
    }
    json(res, 200, {
      account: store.publicAccount(account),
      save: store.getSave(account.id),
      discordEnabled: Boolean(config.clientId && config.clientSecret),
      devAuth: config.devAuth,
    });
    return true;
  }

  if (url.pathname === "/api/logout" && req.method === "POST") {
    store.deleteSession(sessionToken(req));
    res.setHeader("set-cookie", clearCookie(SESSION_COOKIE));
    json(res, 200, { ok: true });
    return true;
  }

  if (!account) {
    if (url.pathname.startsWith("/api/")) {
      json(res, 401, { error: "not logged in" });
      return true;
    }
    return false;
  }

  if (url.pathname === "/api/save" && req.method === "PUT") {
    let body: { save?: unknown } | null = null;
    try {
      body = (await readBody(req)) as { save?: unknown } | null;
    } catch {
      json(res, 400, { error: "invalid or too-large save" });
      return true;
    }
    if (!body || typeof body.save !== "object" || body.save === null) {
      json(res, 400, { error: "save required" });
      return true;
    }
    store.putSave(account.id, body.save);
    json(res, 200, { ok: true, updatedAt: Date.now() });
    return true;
  }

  if (url.pathname === "/api/nickname" && (req.method === "PUT" || req.method === "POST")) {
    let body: { nickname?: string } | null = null;
    try {
      body = (await readBody(req)) as { nickname?: string } | null;
    } catch {
      json(res, 400, { error: "invalid body" });
      return true;
    }
    if (!body?.nickname) {
      json(res, 400, { error: "nickname required" });
      return true;
    }
    const result = store.setNickname(account.id, body.nickname);
    if (!result.ok) {
      json(res, 409, { error: result.error });
      return true;
    }
    json(res, 200, { account: store.publicAccount(result.account) });
    return true;
  }

  return false;
}
