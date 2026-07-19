# Wakil

Wakil is an Arabic-first, RTL, mobile-first AI workspace. The current production-shaped flow lets an
authenticated user create a project from one request composer, optionally attach validated private
input files, receive a persisted planning run, review the plan, explicitly start static-site
execution, and open or download the resulting private artifact.

## Current product scope

Implemented:

- Auth.js email sign-in and optional Google OAuth.
- Tenant-scoped projects, conversations, attachments, runs, events, and artifacts.
- One automatically started planning run after project creation.
- Explicit user approval before the separate website execution run.
- Durable BullMQ/PostgreSQL run processing with replayable SSE progress.
- Private S3-compatible storage (Cloudflare R2 in production, MinIO locally).
- Arabic RTL PWA shell with a standalone `/offline.html` navigation fallback; authenticated HTML,
  RSC, APIs, prompts, projects, and mutations are never cached.
- Mobile coverage at `390x844` and `430x932`.

Not implemented yet: publishing generated sites, arbitrary generated-code execution, multi-output
generation beyond the approved static-site path, and durable voice recording/transcription.

`GOAL.md` is the product source of truth. `AGENTS.md` defines repository rules and quality gates.

## Prerequisites

- Node.js 22.x (the repository currently requires `>=22.13.0 <23`).
- pnpm 11.13.1.
- PostgreSQL 17+, Redis 7+, SMTP, and private S3-compatible storage.
- Docker/Compose for the standard local stack and isolated Testcontainers integration gate.

## Local setup

```bash
cp .env.example .env.local
pnpm install --frozen-lockfile
docker compose -f infra/docker-compose.yml up -d
pnpm db:migrate
pnpm dev
```

Do not put credentials in tracked files. Production uses Cloudflare R2; loopback MinIO endpoints are
accepted only for local development and tests.

## Quality gates

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm test:e2e
pnpm test:e2e:visual
```

The Playwright suites run both configured mobile projects. `test:e2e` contains 22 functional tests
and `test:e2e:visual` contains 24 state/visual tests, for 46 checks in the complete mobile gate.

The integration harness starts disposable PostgreSQL/Redis containers by default. On hosts without a
container runtime, set `TEST_DATABASE_URL` to a dedicated disposable PostgreSQL database and
`TEST_REDIS_URL` to an isolated Redis database. The migration suite resets its supplied database and
must never target development or production data.

## Runtime verification

After a production build, run the dependency-aware smoke checks against live web and worker
endpoints:

```bash
SMOKE_BASE_URL=http://127.0.0.1:3100 \
SMOKE_WORKER_URL=http://127.0.0.1:3001 \
SMOKE_ALLOW_HTTP=true \
pnpm test:production-smoke
```

The smoke command verifies web liveness/readiness, authentication-page availability, and worker
liveness/readiness. Deployment, migration, rollback, backup, security, and monitoring procedures are
under `docs/`.
