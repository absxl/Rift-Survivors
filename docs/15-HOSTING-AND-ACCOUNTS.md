# 15 - Hosting, accounts, and the Discord path

Last updated: 2026-10-27

## What is implemented

- Full roster/class content: 173 champions, six classes, class weapons, placeholder class moves.
- Noxian Warfront as a second stage with stage selection, enemy pools, rules overrides, and palette.
- Local Showdown-style profile with:
  - editable nickname, validation, and reserved names,
  - lifetime stats, runs played, best run, selected champion/stage.
- Server-side accounts and saves:
  - `GET /api/me`
  - `POST /api/dev-login` (only when `RIFT_DEV_AUTH=1`)
  - `PUT /api/nickname`
  - `PUT /api/save`
  - `POST /api/logout`
  - `GET /api/auth-config`
  - `GET /auth/discord` + `GET /auth/discord/callback`
- Account records live in a JSON file (`data/accounts.json` by default). Sessions are in memory for now.
- The browser syncs the full save after each `persistSave` when signed in.
- Co-op lobby names use the profile name. A valid account cookie also overrides the in-lobby name with the account nickname.
- The client loads a server save on login when one exists; otherwise it uploads the local save.
- Discord login is coded but intentionally not configured yet. The dev cloud-login path exists for local testing.

## Local account testing

Start the server with dev auth enabled:

```powershell
$env:RIFT_DEV_AUTH="1"
$env:RIFT_ACCOUNTS_FILE="data/accounts.json"
node packages/server/dist/index.js
```

Start the client:

```powershell
corepack pnpm --filter @rift/client exec vite --host 0.0.0.0 --port 5173
```

Enter Profile -> **DEV CLOUD LOGIN**. The local profile name is used as the dev account name, the save is uploaded, and subsequent changes are synced.

Never enable `RIFT_DEV_AUTH` on a public server.

## Discord application setup (deferred deployment)

1. Create an application at <https://discord.com/developers/applications>.
2. Add the OAuth2 redirect URI:
   - local: `http://localhost:5173/auth/discord/callback`
   - production: `https://<your-domain>/auth/discord/callback`
3. Copy the client ID and secret into the server environment.
4. Set `DISCORD_REDIRECT_URI` and `CLIENT_ORIGIN`.
5. For production, terminate HTTPS at a reverse proxy and keep the client and `/api`/`/auth` on the same origin, or configure cookies/CORS deliberately.

Environment variables are documented in `.env.example`. Node 22 can load a file with:

```powershell
node --env-file=.env packages/server/dist/index.js
```

The Vite dev server proxies `/api` and `/auth` to `127.0.0.1:8787`, which keeps cookies same-origin during development. Production needs the same reverse-proxy pattern or an equivalent cookie/CORS configuration.

## Account data model

`packages/server/src/accounts.ts` stores:

```json
{
  "version": 1,
  "accounts": [
    {
      "id": "uuid",
      "discordId": "optional",
      "nickname": "ShowdownName",
      "avatarUrl": "optional",
      "createdAt": 0,
      "updatedAt": 0,
      "save": { "version": 5 }
    }
  ]
}
```

Nicknames are globally unique case-insensitively, 3-20 characters, letters/numbers/underscore/hyphen, with reserved names blocked. The rules live in `packages/shared/src/nickname.ts` so client and server do not drift.

Server saves are uploaded as opaque JSON. The current server trusts the client-sent save for solo result submission. Co-op still sends each player's meta bonuses; a later hardening pass should compute and validate all meta from the server account instead.

Sessions are in-memory and expire after 30 days. A server restart logs everyone out but does not lose saves. For production, persist sessions or use signed tokens and add rate limiting/CSRF protection where needed.

## Cloudflare

### Can it be free?

For a small friends/Reddit-scale experiment, **yes, within free-tier limits**, but not by deploying this repository as-is.

### Option A - Cloudflare Tunnel + this Node server (fastest)

- Put the static client on **Cloudflare Pages** (free).
- Run the current Node server on your PC or a small persistent box.
- Expose it with **Cloudflare Tunnel** (`cloudflared`) over HTTPS.
- Pros: no server port; keeps WebSockets and the JSON account store working.
- Cons: your machine must stay online; not reliable for a large Reddit audience; account data lives on your machine (back it up).

### Option B - Cloudflare Pages + a Node host (recommended for now)

- Client on Pages.
- Current Node `ws` server on a host with a persistent disk, e.g. Fly.io/Render/Railway (free/cheap tiers; disk persistence varies).
- Point `VITE_SERVER_URL` at the WebSocket endpoint and `CLIENT_ORIGIN` at the Pages URL.
- This is the least code churn and supports the current 30 Hz server and file-backed accounts.
- Use a persistent volume for `RIFT_ACCOUNTS_FILE` and regular backups.

### Option C - Full Cloudflare Workers + Durable Objects port

- Pages for static assets.
- Workers for `/api` and `/auth`; Durable Objects for WebSocket rooms and/or account state; D1 or Durable Object SQLite for saves.
- Cloudflare's free plan currently includes a small Durable Objects/Workers allocation (daily requests, duration, SQLite rows) that can run a small friend group. Long-lived game rooms consume duration, so monitor usage.
- **This requires porting the server**: the current `ws` + Node HTTP/filesystem implementation is not directly deployable to Workers.
- Discord OAuth can work on Workers, but the callback/cookie/secret configuration must be set in Cloudflare secrets.
- This is the best long-term path for a public Reddit launch, but it is a separate backend milestone.

Do **not** expect Cloudflare Pages alone to run the co-op server or server-side accounts. Pages only serves static files.

## Current limitations

- Discord app is not deployed; dev login is the working account path.
- No friends list, Discord invite embeds, or social profile page yet.
- Co-op rooms are authenticated only for display-name override; account save validation in the game server is still client-trusted.
- Local/server save conflicts are resolved by "server save wins" when a server save exists; there is no merge UI.
- No rate limiting on dev login, account creation, or save uploads.
- No automatic account data backups.
- No Cloudflare Workers port yet.
- No password login; Discord is the intended identity provider.
