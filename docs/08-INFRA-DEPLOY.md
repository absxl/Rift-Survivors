# 08 — Infrastructure & Deploy

Goal: friends open a URL, enter a room code, play. Cheapest/simplest path first.

## Environments
| Env | Client | Server |
|---|---|---|
| Local dev | `pnpm dev` (Vite :5173) | `pnpm dev:server` (ws :8787) |
| Production | static host | one small Node container |

## Solo-only (no server needed)
M0–M9 produce a fully playable solo game. Deploy it as static files first so friends can try it:
- **Cloudflare Pages** (free) or GitHub Pages, build command `pnpm --filter client build`, output `packages/client/dist`.
- Restrict access if desired (Cloudflare Access, or just keep the URL private).
- **Do not deploy `assets/local/`** — the CI build must exclude it (add a check that fails the build if
  `dist/` contains anything from `assets/local/`).

## Co-op server options (pick one; all are fine at 1 room / 4 players)
| Option | Cost | Notes |
|---|---|---|
| **Fly.io** (Dockerfile) | ~free–$5/mo | Easiest; `fly launch`, region near the players (e.g. `cdg`/`mad`), 1 shared CPU 256 MB is plenty |
| **Small VPS** (Hetzner CX22 etc.) | ~€4/mo | Docker + Caddy for TLS; full control |
| **Home machine + Cloudflare Tunnel** | free | No port-forwarding, TLS handled by Cloudflare; machine must stay on |
| Render / Railway | free tier / few $ | Free tiers sleep → first connection slow |

WebSockets need **`wss://`** when the client is served over HTTPS. Use TLS termination (Fly/Caddy/Cloudflare).

## Dockerfile (server)
```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages ./packages
RUN pnpm install --frozen-lockfile && pnpm --filter server build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787
COPY --from=build /app/packages/server/dist ./dist
COPY --from=build /app/node_modules ./node_modules
EXPOSE 8787
CMD ["node", "dist/index.js"]
```
(Agent: adjust to the real build output; verify the image builds and runs before finishing M12.)

## Config
- Client reads `VITE_SERVER_URL` (e.g. `wss://rift.example.com`) at build time; default `ws://localhost:8787`.
- Server env: `PORT`, `MAX_ROOMS` (default 20), `ALLOWED_ORIGINS` (comma list; reject other origins).
- No secrets are required in v1. Never commit `.env`.

## CI/CD (GitHub Actions)
1. On PR: `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
2. On `main`: deploy client to Pages; build+push server image / `fly deploy`.
3. Cache the pnpm store.

## Observability (minimal)
- Server logs one JSON line per room event (create/join/leave/end) and per-minute stats
  (tick time p50/p99, players, snapshot bytes).
- `/health` endpoint returns `{ ok: true, rooms, version }`.
- If tick time p99 > 25 ms, log a warning (budget is 33 ms).

## Capacity note
One server tick for 500 enemies should cost ~2–4 ms, so a tiny instance handles several rooms. Revisit only
if you add many concurrent rooms.
