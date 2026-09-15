# syntax=docker/dockerfile:1

# Corvus web (Next.js 16, App Router) — production image.
#
# Build context is the REPO ROOT (see .github/workflows/deploy.yml `build` job),
# because this is an npm-workspaces monorepo: the app depends on the shared
# @corvus/spec workspace package, which must be compiled before `next build`.
#
# Pattern: Next.js standalone output (next.config.js sets output: 'standalone').
# Reference followed: https://github.com/vercel/next.js/blob/canary/examples/with-docker/Dockerfile
#
# COPY lines are explicit on purpose: the repo has no root .dockerignore, so copying
# a whole app directory would sweep in node_modules/, .next/ and .env.local.

FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Manifests first (without sources) so `npm ci` stays cached when only code changes.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/gateway/package.json apps/gateway/package.json
COPY packages/spec/package.json packages/spec/package.json
RUN npm ci

# Shared contract package (@corvus/spec) — web imports its compiled dist.
COPY tsconfig.base.json ./
COPY packages/spec/package.json packages/spec/package.json
COPY packages/spec/tsconfig.json packages/spec/tsconfig.json
COPY packages/spec/src packages/spec/src

# @corvus/web sources — explicit paths only, never the whole directory.
COPY apps/web/package.json apps/web/package.json
COPY apps/web/next.config.js apps/web/next.config.js
COPY apps/web/postcss.config.mjs apps/web/postcss.config.mjs
COPY apps/web/tsconfig.json apps/web/tsconfig.json
COPY apps/web/next-env.d.ts apps/web/next-env.d.ts
COPY apps/web/app apps/web/app
COPY apps/web/components apps/web/components
COPY apps/web/lib apps/web/lib
COPY apps/web/public apps/web/public

RUN npm run build --workspace @corvus/spec \
 && npm run build --workspace @corvus/web

# --- runner: minimal traced server ---------------------------------------------
FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Next reads these at runtime. Docker injects HOSTNAME=<container-id> otherwise,
# which would bind the server to the container hostname instead of all interfaces.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Traced standalone tree (apps/web/server.js + its minimal node_modules).
COPY --from=builder /app/apps/web/.next/standalone ./
# static/ and public/ are never traced — copy them in by hand.
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

# The pick/vote route writes JSON under <cwd>/.pick-votes at runtime, and the
# standalone server may touch .next/cache — both must be writable by `node`.
RUN mkdir -p /app/.pick-votes /app/apps/web/.next/cache \
 && chown -R node:node /app
USER node

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
