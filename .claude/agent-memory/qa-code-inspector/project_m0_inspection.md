---
name: project-m0-inspection
description:
  Baseline QA findings for Wakil M0 foundation, inspected 2026-07-17 — what is solid and what to
  re-check
metadata:
  type: project
---

First QA pass over M0 (2026-07-17). Overall: M0 is structurally sound and unusually disciplined on
security/boundaries. No critical/major defects found. Schema and migration SQL are consistent.

**Confirmed solid (do not re-flag as broken):**

- Composite tenant FKs `(project_id, workspace_id)` on conversations and
  `(conversation_id, workspace_id)` on conversation_messages correctly prevent cross-workspace
  linkage; migration integration test proves 23503 rejection.
- Env redaction: all three env modules report names only. Worker pino redacts
  DATABASE_URL/REDIS_URL. migrate.ts `safeErrorSummary` strips creds from connection strings.
- `pg_trgm` extension is created before the GIN trgm indexes in migration 0000 — correct order.
- `workspaces_owner_user_unique` enforces one personal workspace per owner (M1 assumption 1).
- No banned deps present (no BullMQ/model SDKs/sandbox/S3 SDK). `drizzle-kit push` is NOT a script —
  only `db:generate`/`db:migrate`.

**Known accepted trade-offs (waived — do not re-flag):**

- Smoke test runs web on port 3100 while dev uses 3000 — intentional isolation.
- Worker is idle-only with readiness checks; not in docker-compose — by design.
- CI does not run smoke/e2e/integration-non-migrations — plan acknowledges this; M1 adds e2e.

**Minor items raised (re-check if touched):**

- `apps/web/vitest.config.ts` uses `include: ["**/*.test.ts"]` (broad) vs worker/db which scope to
  src/tests — could pick up future stray test files.
- Playwright `playwright.config.ts` references `testDir: ./e2e` which does not exist yet (M1), and
  there is no `test:e2e` script in web package.json yet.
- `apps/worker/src/index.ts` calls `main()` unconditionally at module load (no entrypoint guard like
  migrate.ts has) — fine today since nothing imports it, but revisit if it becomes importable.
