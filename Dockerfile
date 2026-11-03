# Co-op room server image (docs/08). Builds the server (bundling @rift/* packages,
# `ws` resolved from node_modules) and runs it on PORT (default 8787).
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @rift/server build

# Stage a minimal runtime: the self-contained bundle plus the one external
# dependency (`ws`, no transitive deps). The workspace itself is NOT copied.
# cp -L dereferences pnpm's symlinked node_modules.
RUN mkdir -p /runtime/packages/server/dist /runtime/node_modules \
  && cp packages/server/dist/index.js /runtime/packages/server/dist/ \
  && cp -rL packages/server/node_modules/ws /runtime/node_modules/ws \
  && printf '{"name":"rift-server-runtime","private":true,"type":"module"}\n' > /runtime/package.json

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
RUN addgroup -S rift && adduser -S rift -G rift \
  && mkdir -p /data && chown rift:rift /data
COPY --from=build /runtime ./
USER rift
ENV RIFT_ACCOUNTS_FILE=/data/accounts.json
VOLUME /data
EXPOSE 8787
CMD ["node", "packages/server/dist/index.js"]
