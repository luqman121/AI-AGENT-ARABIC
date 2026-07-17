---
name: project-wakil
description:
  Wakil monorepo structure, milestone scope, and the security/boundary invariants QA must enforce
metadata:
  type: project
---

Wakil (وكيل) is an Arabic-first, Gulf-focused, mobile-first PWA. pnpm + Turborepo, Node 22, TS
strict, ESM. Governing docs: `AGENTS.md` and `GOAL.md` (source of truth) plus
`docs/implementation-plan.md`.

**Milestone scope:** Only M0 (foundation) and M1 (product shell) are allowed. Speculative M2+ code
is a violation — no BullMQ, model SDKs, sandbox (E2B/Daytona), provider adapters,
runs/run_events/SSE, billing, or generated-code execution until a real consumer exists.

**Key invariants to enforce in every QA pass:**

- No secrets committed. `.env.example` = names only, blank values. `.env.local` is gitignored.
- Env validation must fail fast with Zod, reporting names not values (redaction).
- `apps/web` and `apps/worker` must NOT import each other; they communicate via DB
  records/queue/events. Browser code must not import server env/db client.
- Tenant scoping via `workspaceId`; user-owned queries scoped to authenticated workspace.
- `drizzle-kit push` is banned (must not be a repo script). Schema changes require committed
  migrations via `drizzle-kit generate` + `pnpm db:migrate`.
- No mock/fake data, fake progress, or fake streaming on completed screens.

**Priority order (from GOAL.md):** 1) security/tenant isolation, 2) correctness/truthful state, 3)
mobile Arabic usability, 4) reliability, 5) a11y/perf, 6) polish.
