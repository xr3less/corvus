# syntax=docker/dockerfile:1

# Corvus gateway (multiplexed Discord gateway) — production image.
#
# Build context is the REPO ROOT (see .github/workflows/deploy.yml `build` job):
# this is an npm-workspaces monorepo and the gateway compiles with the
# root-installed toolchain. Runtime entrypoint is apps/gateway/dist/start.js,
# exactly what package.json "start" runs.
#
# Reference followed: https://docs.docker.com/language/nodejs/build-images/
#
# COPY lines are explicit on purpose: the repo has no root .dockerignore, so
# copying a whole directory would sweep in node_modules/, dist/ and .env files.

FROM node:24-bookworm-slim AS build
WORKDIR /app

# Manifests first (without sources) so `npm ci` stays cached when only code changes.
COPY package.json package-lock.json ./
COPY apps/gateway/package.json apps/gateway/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/spec/package.json packages/spec/package.json
RUN npm ci

COPY tsconfig.base.json ./
COPY apps/gateway/tsconfig.json apps/gateway/tsconfig.json
COPY apps/gateway/src apps/gateway/src
RUN npm run build --workspace @corvus/gateway \
 && npm prune --omit=dev \
 && npm cache clean --force

# --- runner: production dependencies + compiled dist ---------------------------
FROM node:24-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

# Keep the workspace shape so the node_modules/@corvus/* links resolve.
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/gateway/package.json ./apps/gateway/package.json
COPY --from=build /app/apps/gateway/dist ./apps/gateway/dist
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/packages/spec/package.json ./packages/spec/package.json

USER node
# compose.yml overrides `command` with `npm start`; both resolve to dist/start.js.
WORKDIR /app/apps/gateway
CMD ["node", "./dist/start.js"]
