# /apps/web/Dockerfile
#
# Self-host image for the Frameboard Next.js frontend. Multi-stage:
# deps → builder (Next standalone output) → runner. The pnpm workspace
# layout means we copy the whole repo into the build stage and let
# pnpm resolve the workspace graph; the runner stage is just the
# standalone server bundle, kept slim.
#
# IMPORTANT: NEXT_PUBLIC_API_BASE_URL and NEXT_PUBLIC_DEV_USER_EMAIL
# are inlined at build time. The orchestrator (docker-compose.full.yml)
# passes them in via --build-arg → ENV → build command.

FROM node:22-alpine AS deps
WORKDIR /repo

# Enable corepack pnpm at the version pinned by packageManager.
RUN corepack enable && corepack prepare [email protected] --activate

# Manifests first so the install layer caches across code edits.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile


FROM node:22-alpine AS builder
WORKDIR /repo

RUN corepack enable && corepack prepare [email protected] --activate

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /repo/packages/shared/node_modules ./packages/shared/node_modules

# Source.
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Public env vars baked into the build (Next inlines NEXT_PUBLIC_*).
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8001
ARG NEXT_PUBLIC_DEV_USER_EMAIL=self-host@example.com
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL} \
    NEXT_PUBLIC_DEV_USER_EMAIL=${NEXT_PUBLIC_DEV_USER_EMAIL} \
    BUILD_STANDALONE=1 \
    NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter @frameboard/web build


FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

# Next 15 standalone output already includes a minimal node_modules.
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
