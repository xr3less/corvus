# syntax=docker/dockerfile:1

# Corvus web (Next.js 16, App Router) — production image.
#
# Build context is the REPO ROOT (see .github/workflows/deploy.yml `build` job),
# because this is an npm-workspaces monorepo: the app depends on the shared
# @corvus/spec and @corvus/ai workspace packages, both of which must be compiled
# before `next build` (web resolves them through their package.json "exports").
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
COPY packages/ai/package.json packages/ai/package.json
RUN npm ci

# Shared workspace packages — web imports their compiled dist:
#   @corvus/spec -> app/api/{interview,simulate,spec,templates} + dashboard (parseSpec, simulateDraft, explain)
#   @corvus/ai   -> apps/web/lib/ai/{lanes,router,cost,builder-prompt}.ts re-export shims
# Both are needed: `npm ci` links node_modules/@corvus/* to these paths, and Node
# resolves the `main`/`exports` entries at build and at runtime.
COPY tsconfig.base.json ./
COPY packages/spec/package.json packages/spec/package.json
COPY packages/spec/tsconfig.json packages/spec/tsconfig.json
COPY packages/spec/src packages/spec/src
COPY packages/ai/package.json packages/ai/package.json
COPY packages/ai/tsconfig.json packages/ai/tsconfig.json
COPY packages/ai/src packages/ai/src

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

# Order matters: @corvus/ai's sources import @corvus/spec, so spec's dist must
# exist before ai is type-checked/emitted.
RUN npm run build --workspace @corvus/spec \
 && npm run build --workspace @corvus/ai \
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
