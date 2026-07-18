# syntax=docker/dockerfile:1.7
FROM node:22.23.1-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3 AS base

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.13.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY eslint.config.mjs prettier.config.mjs tsconfig.base.json .env.example ./
COPY scripts/prepare-standalone.mjs ./scripts/prepare-standalone.mjs
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile

FROM base AS build

RUN pnpm build \
    && pnpm --filter @wakil/worker deploy --prod --legacy /opt/worker \
    && pnpm --filter @wakil/db deploy --prod --legacy /opt/migrate

FROM node:22.23.1-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3 AS web

ENV HOSTNAME=0.0.0.0 \
    NODE_ENV=production \
    PORT=3000

WORKDIR /app

COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]

FROM node:22.23.1-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3 AS worker

ENV NODE_ENV=production \
    WORKER_HEALTH_PORT=3001

WORKDIR /app

COPY --from=build --chown=node:node /opt/worker ./

USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist/index.js"]

FROM node:22.23.1-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3 AS migrate

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build --chown=node:node /opt/migrate ./

USER node
CMD ["node", "dist/migrate.js"]
