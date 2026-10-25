# Co-op room server image (docs/08). Builds the server (bundling @rift/* packages,
# `ws` resolved from node_modules) and runs it on PORT (default 8787).
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @rift/server build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
COPY --from=build /app ./
EXPOSE 8787
CMD ["node", "packages/server/dist/index.js"]
