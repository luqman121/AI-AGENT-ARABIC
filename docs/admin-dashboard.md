# Admin Dashboard

An internal, secure operations dashboard built directly into the Wakil web app at `/admin`. It is
**not** a separate application and uses no admin framework — it reuses the existing stack (Next.js
App Router, Drizzle, Auth.js), design tokens, Cairo typography, and Arabic RTL shell.

## Purpose

Give trusted staff a truthful, real-data view of customers, projects, runs, usage, and system
health, plus a small set of carefully-guarded write operations. Every screen shows persisted data
only; there is no mock analytics and no fabricated activity.

## Roles and permissions

Platform roles live on `users.role` and are **distinct** from the workspace-scoped tenancy role.

| Role      | `/admin` access | Reads                       | Mutations           |
| --------- | --------------- | --------------------------- | ------------------- |
| `user`    | No (redirected) | —                           | —                   |
| `support` | Yes             | All admin pages (read-only) | None                |
| `admin`   | Yes             | All admin pages             | All admin mutations |

The matrix is defined once in `@wakil/shared` (`PERMISSIONS_BY_ROLE`, `can`, `canAccessAdmin`) and
is enforced **server-side**. The UI only mirrors the matrix; it never grants access on its own.

- **Page/layout guard:** `requireAdminPage(minimum)` (in `apps/web/src/server/admin/rbac.ts`) runs
  in the admin `layout.tsx` and every page. No session → `/sign-in`; suspended → `/suspended`;
  insufficient role → `/new` (a safe, non-revealing redirect that never confirms the dashboard
  exists).
- **Action/route guard:** `requireAdminAction(permission)` throws `AdminForbiddenError` for the
  exact permission required; callers translate it into a generic Arabic failure. This runs in every
  server action and in the `/api/admin/system` route handler.

Roles are read from PostgreSQL **on every request** (`getSessionAccount`), never trusted from the
JWT, so a role change or suspension takes effect immediately.

### Provisioning the first admin

Platform roles cannot be granted through the UI (no self-promotion path exists). Provision the first
administrator with a direct database write, then manage the rest from `/admin/users`.

```sql
-- Grant admin to an existing account (the user must have signed in at least once).
UPDATE users SET role = 'admin' WHERE email = 'ops@your-domain.example';
```

After the first admin exists, further role changes go through the audited `changeUserRoleAction`
(admin only).

## Routes

| Route                         | Purpose                                                                  |
| ----------------------------- | ------------------------------------------------------------------------ |
| `/admin`                      | Overview: headline metrics, recent users/runs/failures, health           |
| `/admin/users`                | Server-paginated, filterable customer list with usage rollups            |
| `/admin/users/[userId]`       | Customer detail, usage, recent projects/runs/errors, actions             |
| `/admin/projects`             | Project list with latest-run status and storage size                     |
| `/admin/projects/[projectId]` | Project detail (request escaped as plain text; attachment metadata only) |
| `/admin/runs`                 | Run list with status/date filters                                        |
| `/admin/runs/[runId]`         | Run detail with a safe event timeline (no assistant content)             |
| `/admin/usage`                | Aggregated usage by model, output kind, and top users/projects           |
| `/admin/system`               | Live health of Postgres, Redis, storage, queue, worker                   |
| `/admin/audit`                | Immutable ledger of all privileged actions                               |

Arabic RTL navigation labels: نظرة عامة، العملاء، المشاريع، عمليات التنفيذ، الاستخدام، حالة النظام،
سجل الإدارة.

## Safe mutations (admin only)

Each action validates input at the boundary (Zod), runs inside a single transaction that loads a
`before` snapshot, mutates, and writes an immutable audit row, then revalidates the affected paths.
All are rate-limited (`admin.action`, 30/min per actor).

| Action                    | Guard             | Rules / safety                                                                                                                                                           |
| ------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Suspend / reactivate user | `user.suspend`    | Cannot suspend the **last active admin** (even yourself).                                                                                                                |
| Change plan               | `user.plan`       | `free` / `pro` / `business`.                                                                                                                                             |
| Change usage limit        | `user.limit`      | Integer **micros** of USD, or null to restore the plan default.                                                                                                          |
| Change role               | `user.role`       | Cannot demote the **last active admin**.                                                                                                                                 |
| Cancel run                | `run.cancel`      | Only `queued`/`running`; sets `cancelRequestedAt` for **real cooperative** cancellation.                                                                                 |
| Retry run                 | `run.retry`       | Only `failed`; inserts a **new** queued run + `run.queued` event and **re-enqueues via BullMQ** (never a status flip). Blocked if the project already has an active run. |
| Archive project           | `project.archive` | Safe status change to `archived`.                                                                                                                                        |

### Why there is no permanent delete

Hard deletion of a project or run would need to remove uploaded artifacts and attachments from
object storage (R2/MinIO). Those cleanup semantics (lifecycle, retention, and cascade of shared
objects) are not defined for this milestone, so permanent deletion is **intentionally not
implemented**. Archiving is offered as the safe, reversible alternative. Revisit when storage
lifecycle rules are agreed.

## Usage tracking and cost

- Model cost is stored as **integer micros of USD** on `runs.providerCostMicros`. Floats are never
  used for storage. `microsToUsd` / `formatUsdFromMicros` are the only conversions, and only for
  display.
- All usage figures are **aggregated directly from the `runs` table** (token counts, cost, execution
  time), using SQL aggregate/`FILTER` expressions. There is deliberately **no separate
  `usage_events` table**: runs already hold the authoritative per-run totals, so aggregating them
  avoids double-counting a run's cost in two places. "This month" windows filter on
  `runs.createdAt >= start-of-UTC-month`.
- Per-user and per-project rollups use grouped subqueries left-joined once (no N+1), and lists fetch
  `pageSize + 1` rows to derive `hasNext` without an unbounded `COUNT`.

Indexes added for these cross-tenant reads: `runs_status_created_idx`, `runs_created_idx`,
`runs_created_by_created_idx`, `projects_created_idx`, `projects_status_created_idx`,
`projects_created_by_idx`, plus `users_role_idx`, `users_status_idx`, `users_created_at_idx`.

## Audit log

`admin_audit_logs` is a **cross-tenant, append-only** ledger, separate from the workspace-scoped
`audit_logs` used for customer actions.

- Every privileged mutation writes one row inside the same transaction as the mutation.
- `before`/`after` snapshots are passed through `redactAuditData`, which **drops any key** matching
  password/hash/secret/token/apikey/authorization/cookie/credential/session and coerces values to
  jsonb-safe primitives. Passwords, hashes, keys, secrets, and tokens can never reach the ledger.
- Rows are immutable: the admin UI never edits or deletes them, `actor_role` is constrained to
  `support`/`admin`, and the actor foreign key is `ON DELETE RESTRICT` so an actor with history
  cannot be hard-deleted.
- Filterable by action and target type at `/admin/audit`; a user's own entries are linked from the
  user detail page.

## Security guarantees

- `password_hash` is **never** selected into any admin query or serialized to the client — the user
  detail query returns only a boolean `hasPassword` (`password_hash is not null`).
- Customer-controlled content (project requests, names) is rendered as **plain text**; no
  `dangerouslySetInnerHTML`. Code, URLs, and IDs are scoped to `dir="ltr"`.
- Private attachments show **metadata only**; their contents are never auto-loaded into admin pages.
- Cross-tenant row existence, SQL, and stack traces are never leaked; failures map to stable Arabic
  messages.
- Retry invokes the **real** queue mechanism, so the dashboard cannot show fake progress.

## Optional observability integrations

The dashboard has **no dependency** on external analytics and adds no external SDKs. Clean
integration points are prepared behind env flags for a later milestone:

- `LANGFUSE_ENABLED` / `LANGFUSE_*`
- `POSTHOG_ENABLED` / `POSTHOG_*`

When unset (the default), nothing is loaded and the dashboard is fully functional from the local
database alone.

## Environment variables

| Variable            | Required | Purpose                                                                                                                                |
| ------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `WORKER_HEALTH_URL` | No       | If set, `/admin/system` probes the worker health endpoint; otherwise the worker status reads `unknown` (never a fabricated "healthy"). |

All other configuration is shared with the main app (see `docs/production-environment.md`). No new
required variables are introduced.

## Local testing

```bash
# Unit tests (RBAC matrix, cost/format helpers, redaction, input validation) — no Docker needed:
pnpm --filter @wakil/shared test        # includes tests/admin.test.ts

# Integration tests (require Docker: Testcontainers PostgreSQL + Redis):
pnpm --filter @wakil/web test:integration
#   tests/integration/admin-security.integration.test.ts  — password_hash never returned; audit redaction/immutability
#   tests/integration/admin-actions.integration.test.ts   — RBAC enforcement; cancel/retry validation; last-admin guard; real re-enqueue

# Browser tests (require the full local stack via `pnpm dev` plus a browser):
pnpm --filter @wakil/web test:e2e       # e2e/admin.spec.ts

# Standard milestone gate:
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

The e2e suite provisions `support`/`admin` accounts with a direct DB write (`e2e/db-admin.ts`)
because platform roles are intentionally not grantable through the UI.
