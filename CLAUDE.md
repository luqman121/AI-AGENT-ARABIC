# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository.

## Source of truth

Read `GOAL.md` (product goal, current milestone scope) and `AGENTS.md` (full repository rules)
before planning or editing. `docs/implementation-plan.md` maps milestones to concrete files and
acceptance criteria. Approved documents in `docs/` are the product source of truth; do not re-ask
decisions already settled there.

**Current state:** M0 (foundation) is implemented and verified. M1 (auth, tenant-scoped
projects/conversations, Arabic RTL mobile shell) is the next milestone. Do not implement the live
agent, BullMQ run processing, model providers, sandbox integration, billing, or publishing — those
are later milestones. Do not create `packages/agent-core`, `model-router`, `sandbox`, `skills`, or
`templates/` until a milestone has a real consumer.

## Project

Wakil (وكيل): an Arabic-first, Gulf-focused, mobile-first PWA where a non-technical user describes a
project in Arabic and an AI agent produces a real downloadable artifact (website, PDF, spreadsheet,
presentation, image, simple web game). Speak to the user in concise Arabic unless they request
otherwise; keep code, identifiers, commands, logs, and commit messages in English.

## Commands

Requires Node.js 22 (enforced — other majors are rejected; a vendored copy lives in
`.tools/node-v22.23.1-win-x64/`) and pnpm via Corepack (`corepack enable && corepack install`).
Integration tests and `pnpm dev` need a running Docker daemon.

```bash
pnpm install --frozen-lockfile   # one-time setup
pnpm dev                         # THE dev startup path: starts Docker services, migrates, runs web + worker
pnpm dev:down                    # stop Docker services (volumes persist)

# Milestone gate (all must pass before declaring work complete):
pnpm lint
pnpm typecheck
pnpm test
pnpm build

# Also when applicable:
pnpm format:check
pnpm test:integration:migrations # Testcontainers PostgreSQL 17; needs Docker
pnpm test:integration
pnpm test:smoke                  # needs services up (pnpm dev infra)

# Database:
pnpm db:generate                 # drizzle-kit generate — only after a deliberate schema edit
pnpm db:migrate                  # apply committed migrations (drizzle-kit push is banned)
```

Run a single test file:
`pnpm --filter @wakil/db exec vitest run tests/migrations.integration.test.ts` (same pattern with
`@wakil/web` / `@wakil/worker`). Turbo runs per-package `lint`/`typecheck`/`test`/`build` scripts,
so `pnpm --filter <pkg> test` works too.

Local services from `pnpm dev`: web `127.0.0.1:3000` (health at `/api/health`), PostgreSQL `5432`,
Redis `6379`, MinIO `9000`/console `9001`, Mailpit SMTP `1025`/UI `8025`. Details in
`docs/development.md`.

## Architecture

pnpm workspaces + Turborepo monorepo. TypeScript strict (`noUncheckedIndexedAccess`), ESM
everywhere, Zod at every external boundary.

- `apps/web` — Next.js 16 App Router (React 19), Arabic `lang="ar" dir="rtl"` by default. Server env
  validated at startup in `src/env.ts` (fails fast with field names, never values).
- `apps/worker` — separate idle Node process: env validation, PostgreSQL/Redis readiness checks,
  structured pino logs. No queue/agent code yet (M2+).
- `packages/db` (`@wakil/db`) — Drizzle ORM schema (`src/schema/`: auth, tenancy, projects,
  conversations, idempotency, audit), lazy client factory (importing schema opens no connection),
  migration runner (`src/migrate.ts`), committed SQL in `migrations/`.
- `infra/docker-compose.yml` — PostgreSQL 17, Redis 7, MinIO (private bucket via one-shot init
  service), Mailpit.
- `scripts/dev.mjs` — the single dev bootstrap; generates a gitignored `.env.local` (never
  overwrites existing values) and injects env into child processes explicitly.

Planned for M1: `packages/shared` (Zod contracts) and `packages/ui` (RTL design system); see
`docs/implementation-plan.md` §7.

### Hard boundaries

- `apps/web` and `apps/worker` must never import each other's implementation code; they communicate
  only through typed DB records, queue jobs, and events.
- Provider SDKs only behind `packages/model-router`; sandbox SDKs only behind `packages/sandbox`
  (neither exists yet — don't add them early).
- Generated or user-supplied code never executes in the web or worker process.
- Browser modules never import the database client or server env modules.

### Data and tenancy invariants

- PostgreSQL is the durable source of truth; Redis is transport/ephemeral only.
- Every user-owned query is scoped to the authenticated workspace; take `workspaceId` explicitly and
  verify membership. Never trust client-supplied workspace/user IDs.
- Retryable mutations accept and enforce idempotency keys. UUID primary keys with DB defaults;
  timestamps with time zone. Usage history is append-only.
- Schema changes require a committed migration (`pnpm db:generate`, inspect SQL, run clean +
  existing-database migration tests). Never `drizzle-kit push`.

## Key rules (condensed from AGENTS.md — read it in full)

- Truthful state only: no mock data on screens declared complete, no fake streaming/progress, no
  fabricated assistant replies or metrics. UI progress must describe actual persisted work.
- Never commit secrets; keep `.env.example` synced with names only (blank values). Don't log
  prompts, file contents, tokens, or credential values.
- Mobile-first Arabic RTL: acceptance viewports are `390x844` and `430x932`; ≥44px touch targets; no
  horizontal overflow or clipped Arabic text. Cairo typography. Scope code/URLs/IDs to `dir="ltr"`.
- Prefer Server Components; `"use client"` only where interactivity requires it. No business logic
  in UI components or route handlers — it lives in server-side feature services.
- Handle loading, empty, error, offline/reconnecting, and other real states. Errors are stable app
  codes mapped to simple Arabic messages; never leak SQL, stack traces, or cross-tenant row
  existence.
- No new dependency unless used immediately by the current milestone. No hard-coded model IDs in UI
  or business logic.
- Update `CHANGELOG.md` with a factual entry only after verification passes. Milestones are
  implemented one at a time — stop when the current milestone in `GOAL.md` is complete.
- Destructive changes, publishing, external side effects, and meaningful cost increases require
  explicit user approval.
