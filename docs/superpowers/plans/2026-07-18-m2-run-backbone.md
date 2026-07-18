# M2 Layer A — Run Backbone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a durable, tenant-scoped Run backbone — `runs` + `run_events`, a BullMQ producer/consumer, a bounded deterministic worker state machine, and SSE delivery with `Last-Event-ID` replay — surfaced as truthful mobile run states, with no model provider, sandbox, or artifact.

**Architecture:** The web app creates a `queued` run row plus its first `run.queued` event in one transaction, then enqueues a BullMQ job. The worker consumes the job, transitions the run to `running`, executes a small fixed set of real deterministic steps (each persisted to PostgreSQL as a `run_events` row, then published to a Redis channel), and finishes in a terminal state. A Next.js SSE route replays persisted events by `seq` (`Last-Event-ID`) then subscribes to Redis for live events. PostgreSQL is the durable source of truth; Redis is transport only.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Drizzle ORM + PostgreSQL 17, BullMQ + Redis 7, Next.js 16 App Router, ioredis, Zod, Vitest, Testcontainers, Playwright.

## Global Constraints

- Node.js 22 only (`engines.node` `>=22.13.0 <23`); ESM everywhere; TypeScript strict with `noUncheckedIndexedAccess`.
- Zod validates every external boundary. Mutation services return `ActionResult<T>` (`success`/`failure` from `@wakil/shared`); errors are stable app codes mapped to Arabic messages, never leaking SQL, stack traces, provider details, or cross-tenant row existence.
- Every user-owned query takes `workspaceId` from the session-derived `ServiceContext`; client-supplied workspace/user IDs are never trusted. A missing row and a cross-tenant row both return `NOT_FOUND`.
- PostgreSQL is the durable source of truth; Redis is transport/ephemeral only. Replay/reconnect must work from PostgreSQL alone.
- Schema changes require a committed migration via `pnpm db:generate` (inspect SQL, test clean + existing DB). `drizzle-kit push` is banned. UUID PKs with DB defaults; `timestamptz` timestamps. `run_events` is append-only (no update/delete paths).
- Retryable mutations accept and enforce idempotency keys (reuse → replay original result; changed payload → `IDEMPOTENCY_CONFLICT`).
- No fake progress: every UI event describes actual persisted work. No assistant messages, artifacts, plans, or timers-as-progress. The `conversation_messages.role = 'user'` CHECK stays unchanged.
- Never log full prompts, message content, tokens, or credentials. `run_events.data` and audit metadata carry safe keys only (indices, label keys, lengths, codes) — never request text or content.
- `apps/web` and `apps/worker` never import each other's code; they communicate only through DB records, the BullMQ job, and events. The job payload type lives in `packages/shared`.
- New runtime dependency limited to `bullmq` (consumed immediately by web + worker). No `packages/model-router`, `packages/sandbox`, `packages/agent-core`, `packages/skills`, or `templates/`.
- Milestone gate before "done": `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration:migrations`, `pnpm test:integration`, `pnpm build`, and the Playwright `mobile-390`/`mobile-430` suites. `CHANGELOG.md` entry only after verification passes.

---

## File structure

**`packages/db`**
- Create `src/schema/runs.ts` — `runs` and `run_events` tables.
- Modify `src/schema/index.ts` — export the new schema.
- Create `migrations/0001_*.sql` (+ `meta`) — generated migration.
- Modify `tests/migrations.integration.test.ts` — assert new tables/constraints and tenant FKs.

**`packages/shared`**
- Create `src/contracts/runs.ts` — run status/event enums, step keys, event payload, `startRun`/`cancelRun` contracts, job payload type, queue/channel constants, Arabic label map.
- Modify `src/errors.ts` — add `RUN_ALREADY_ACTIVE` code + Arabic message.
- Modify `src/index.ts` — re-export run contracts.
- Create `src/contracts/runs.test.ts` — contract + label unit tests.

**`apps/worker`**
- Modify `package.json` — add `bullmq`.
- Create `src/runs/steps.ts` — pure deterministic step list.
- Create `src/runs/events.ts` — `appendRunEvent` (seq assignment + insert) and `publishRunEvent`.
- Create `src/runs/processor.ts` — job processor (transitions, limits, cancellation).
- Modify `src/index.ts` — start a BullMQ `Worker` instead of idling.
- Create `src/runs/steps.test.ts`, `src/runs/processor.integration.test.ts`.

**`apps/web`**
- Create `src/server/features/runs/queue.ts` — BullMQ producer singleton.
- Create `src/server/features/runs/mutations.ts` — `startRun`, `cancelRun`.
- Create `src/server/features/runs/queries.ts` — tenant-scoped run/event reads.
- Create `src/server/actions/runs.ts` — server actions.
- Modify `src/server/redis.ts` — add `createRedisSubscriber()`.
- Create `app/api/projects/[projectId]/runs/[runId]/events/route.ts` — SSE endpoint.
- Create `app/(app)/projects/[projectId]/run-panel.tsx` — client SSE panel.
- Modify `app/(app)/projects/[projectId]/conversation-view.tsx` — mount the panel + start action.
- Modify `app/(app)/projects/[projectId]/page.tsx` — load latest run + events for first paint.
- Create `src/server/features/runs/mutations.integration.test.ts`, `queries.integration.test.ts`.
- Create `e2e/runs.spec.ts` (+ screenshot baselines under `e2e/__screenshots__/`).

---

## Task 1: Database schema — `runs` and `run_events`

**Files:**
- Create: `packages/db/src/schema/runs.ts`
- Modify: `packages/db/src/schema/index.ts`
- Generate: `packages/db/migrations/0001_*.sql` (+ `meta/`)
- Test: `packages/db/tests/migrations.integration.test.ts`

**Interfaces:**
- Consumes: `workspaces` (`tenancy.js`), `projects` (`projects.js`), `conversations` (`conversations.js`), `users` (`auth.js`).
- Produces: `runs` and `runEvents` Drizzle tables. Columns — `runs`: `id, workspaceId, projectId, conversationId, status, createdByUserId, errorCode, stepCount, cancelRequestedAt, createdAt, startedAt, finishedAt`; `runEvents`: `id, workspaceId, runId, seq, type, data, createdAt`.

- [ ] **Step 1: Write the failing migration assertion**

Add to `packages/db/tests/migrations.integration.test.ts`, inside the existing `describe`, extend the clean-schema `arrayContaining` list and add a new test:

```typescript
it("creates the runs backbone with tenant and active-run constraints", async () => {
  const tables = await sql<{ table_name: string }[]>`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name in ('runs', 'run_events')
    order by table_name
  `;
  expect(tables.map((r) => r.table_name)).toEqual(["run_events", "runs"]);

  const activeIdx = await sql<{ indexname: string }[]>`
    select indexname from pg_indexes
    where tablename = 'runs' and indexname = 'runs_one_active_per_project'
  `;
  expect(activeIdx).toHaveLength(1);

  const seqUnique = await sql<{ conname: string }[]>`
    select conname from pg_constraint
    where conname = 'run_events_run_seq_unique'
  `;
  expect(seqUnique).toHaveLength(1);
});
```

Also add `"run_events"` and `"runs"` to the `expect.arrayContaining([...])` list in the existing "applies the complete schema" test.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @wakil/db test:integration:migrations`
Expected: FAIL — `runs`/`run_events` tables do not exist yet.

- [ ] **Step 3: Write the schema**

Create `packages/db/src/schema/runs.ts`:

```typescript
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth.js";
import { conversations } from "./conversations.js";
import { projects } from "./projects.js";
import { workspaces } from "./tenancy.js";

export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    status: text("status").notNull().default("queued"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    errorCode: text("error_code"),
    stepCount: integer("step_count").notNull().default(0),
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    // Composite key is the target for tenant-preserving run_events foreign keys.
    unique("runs_id_workspace_unique").on(table.id, table.workspaceId),
    // Composite FKs stop a run from crossing tenant/project/conversation ownership.
    foreignKey({
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [projects.id, projects.workspaceId],
      name: "runs_project_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.conversationId, table.workspaceId],
      foreignColumns: [conversations.id, conversations.workspaceId],
      name: "runs_conversation_workspace_fk",
    }).onDelete("cascade"),
    index("runs_workspace_project_created_idx").on(
      table.workspaceId,
      table.projectId,
      table.createdAt,
    ),
    // At most one active run per project, enforced at the database level.
    uniqueIndex("runs_one_active_per_project")
      .on(table.projectId)
      .where(sql`${table.status} in ('queued', 'running')`),
    check(
      "runs_status_check",
      sql`${table.status} in ('queued', 'running', 'succeeded', 'failed', 'cancelled')`,
    ),
  ],
);

export const runEvents = pgTable(
  "run_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    runId: uuid("run_id").notNull(),
    // Monotonic per-run sequence starting at 1; the basis for Last-Event-ID replay.
    seq: integer("seq").notNull(),
    type: text("type").notNull(),
    // Safe metadata only (step index, label key). Never request text or content.
    data: jsonb("data").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("run_events_run_seq_unique").on(table.runId, table.seq),
    index("run_events_run_seq_idx").on(table.runId, table.seq),
    foreignKey({
      columns: [table.runId, table.workspaceId],
      foreignColumns: [runs.id, runs.workspaceId],
      name: "run_events_run_workspace_fk",
    }).onDelete("cascade"),
    check(
      "run_events_type_check",
      sql`${table.type} in ('run.queued', 'run.started', 'run.step', 'run.succeeded', 'run.failed', 'run.cancelled')`,
    ),
  ],
);
```

- [ ] **Step 4: Export the schema**

In `packages/db/src/schema/index.ts` add (keep alphabetical grouping):

```typescript
export * from "./runs.js";
```

- [ ] **Step 5: Generate the migration**

Run: `pnpm db:generate`
Expected: a new `packages/db/migrations/0001_*.sql` file. Open it and confirm it contains `create table "runs"`, `create table "run_events"`, the partial unique index `runs_one_active_per_project ... where status in ('queued', 'running')`, `run_events_run_seq_unique`, both composite foreign keys, and the two CHECK constraints. Confirm it does **not** alter any existing M1 table.

- [ ] **Step 6: Run the migration tests to verify they pass**

Run: `pnpm --filter @wakil/db test:integration:migrations`
Expected: PASS (clean-schema, idempotent existing-DB, and the new runs-backbone test).

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/schema/runs.ts packages/db/src/schema/index.ts packages/db/migrations packages/db/tests/migrations.integration.test.ts
git commit -m "feat(db): add runs and run_events schema with one-active-per-project constraint"
```

---

## Task 2: Shared contracts, enums, and Arabic labels

**Files:**
- Create: `packages/shared/src/contracts/runs.ts`
- Modify: `packages/shared/src/errors.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/contracts/runs.test.ts`

**Interfaces:**
- Consumes: `idempotencyKeySchema`, `projectIdSchema` from `./fields.js`.
- Produces:
  - `RUN_STATUSES` = `["queued","running","succeeded","failed","cancelled"]`, type `RunStatus`.
  - `RUN_EVENT_TYPES` = `["run.queued","run.started","run.step","run.succeeded","run.failed","run.cancelled"]`, type `RunEventType`.
  - `RUN_STEP_KEYS` = `["validate-request","record-checkpoint","finalize"]`, type `RunStepKey`.
  - `runEventPayloadSchema` → `RunEventPayload` = `{ seq: number; type: RunEventType; stepKey?: RunStepKey; stepIndex?: number; createdAtIso: string }`.
  - `startRunInputSchema` → `StartRunInput` = `{ projectId: string; idempotencyKey: string }`.
  - `cancelRunInputSchema` → `CancelRunInput` = `{ projectId: string; runId: string; idempotencyKey: string }`.
  - `runIdSchema`.
  - `RunJobData` = `{ runId: string; workspaceId: string; projectId: string }`.
  - `RUNS_QUEUE_NAME = "wakil-runs"`, `runEventChannel(runId: string): string`.
  - `runEventLabel(payload: { type: RunEventType; stepKey?: RunStepKey }): string` (Arabic).
  - New error code `RUN_ALREADY_ACTIVE`.

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/src/contracts/runs.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import {
  cancelRunInputSchema,
  runEventChannel,
  runEventLabel,
  RUN_EVENT_TYPES,
  RUN_STEP_KEYS,
  RUNS_QUEUE_NAME,
  startRunInputSchema,
} from "./runs.js";

describe("run contracts", () => {
  it("accepts a valid startRun input", () => {
    const parsed = startRunInputSchema.safeParse({
      projectId: "30000000-0000-4000-8000-000000000001",
      idempotencyKey: "abcdef0123456789abcd",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a startRun input with a bad idempotency key", () => {
    const parsed = startRunInputSchema.safeParse({
      projectId: "30000000-0000-4000-8000-000000000001",
      idempotencyKey: "short",
    });
    expect(parsed.success).toBe(false);
  });

  it("requires runId for cancelRun", () => {
    const parsed = cancelRunInputSchema.safeParse({
      projectId: "30000000-0000-4000-8000-000000000001",
      idempotencyKey: "abcdef0123456789abcd",
    });
    expect(parsed.success).toBe(false);
  });

  it("maps every event type and step key to a non-empty Arabic label", () => {
    for (const type of RUN_EVENT_TYPES) {
      expect(runEventLabel({ type }).length).toBeGreaterThan(0);
    }
    for (const stepKey of RUN_STEP_KEYS) {
      expect(runEventLabel({ type: "run.step", stepKey }).length).toBeGreaterThan(0);
    }
  });

  it("namespaces the redis channel and queue", () => {
    expect(runEventChannel("abc")).toBe("wakil:run:abc");
    expect(RUNS_QUEUE_NAME).toBe("wakil-runs");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @wakil/shared test`
Expected: FAIL — `./runs.js` does not exist.

- [ ] **Step 3: Write the contracts**

Create `packages/shared/src/contracts/runs.ts`:

```typescript
import { z } from "zod";

import { idempotencyKeySchema, projectIdSchema } from "./fields.js";

export const RUN_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const RUN_EVENT_TYPES = [
  "run.queued",
  "run.started",
  "run.step",
  "run.succeeded",
  "run.failed",
  "run.cancelled",
] as const;
export type RunEventType = (typeof RUN_EVENT_TYPES)[number];

/** Fixed, deterministic steps executed by the worker in this milestone. */
export const RUN_STEP_KEYS = ["validate-request", "record-checkpoint", "finalize"] as const;
export type RunStepKey = (typeof RUN_STEP_KEYS)[number];

export const runIdSchema = z.uuid({ error: "معرّف التشغيل غير صالح." });

export const runEventPayloadSchema = z.object({
  seq: z.number().int().positive(),
  type: z.enum(RUN_EVENT_TYPES),
  stepKey: z.enum(RUN_STEP_KEYS).optional(),
  stepIndex: z.number().int().nonnegative().optional(),
  createdAtIso: z.string(),
});
export type RunEventPayload = z.infer<typeof runEventPayloadSchema>;

export const startRunInputSchema = z.object({
  projectId: projectIdSchema,
  idempotencyKey: idempotencyKeySchema,
});
export type StartRunInput = z.infer<typeof startRunInputSchema>;

export const cancelRunInputSchema = z.object({
  projectId: projectIdSchema,
  runId: runIdSchema,
  idempotencyKey: idempotencyKeySchema,
});
export type CancelRunInput = z.infer<typeof cancelRunInputSchema>;

/** BullMQ job payload; the only worker-facing contract for a run. */
export type RunJobData = {
  runId: string;
  workspaceId: string;
  projectId: string;
};

export const RUNS_QUEUE_NAME = "wakil-runs";

export function runEventChannel(runId: string): string {
  return `wakil:run:${runId}`;
}

const STEP_LABELS: Record<RunStepKey, string> = {
  "validate-request": "التحقق من الطلب",
  "record-checkpoint": "تسجيل نقطة تحقّق",
  finalize: "إنهاء التحضير",
};

const TYPE_LABELS: Record<RunEventType, string> = {
  "run.queued": "في قائمة الانتظار",
  "run.started": "بدأ التشغيل",
  "run.step": "خطوة",
  "run.succeeded": "اكتمل التشغيل",
  "run.failed": "تعذّر إكمال التشغيل",
  "run.cancelled": "أُلغي التشغيل",
};

/** Arabic label for a persisted event; step events use their step label. */
export function runEventLabel(payload: { type: RunEventType; stepKey?: RunStepKey }): string {
  if (payload.type === "run.step" && payload.stepKey) return STEP_LABELS[payload.stepKey];
  return TYPE_LABELS[payload.type];
}
```

- [ ] **Step 4: Add the error code**

In `packages/shared/src/errors.ts`, add `"RUN_ALREADY_ACTIVE"` to `APP_ERROR_CODES` (before `"INTERNAL_ERROR"`), and add to `APP_ERROR_MESSAGES`:

```typescript
  RUN_ALREADY_ACTIVE: "هناك تشغيل نشط بالفعل لهذا المشروع. انتظر انتهاءه أو ألغِه ثم أعد المحاولة.",
```

- [ ] **Step 5: Re-export from the package index**

In `packages/shared/src/index.ts`, add a block:

```typescript
export {
  cancelRunInputSchema,
  runEventChannel,
  runEventLabel,
  runEventPayloadSchema,
  runIdSchema,
  RUN_EVENT_TYPES,
  RUN_STATUSES,
  RUN_STEP_KEYS,
  RUNS_QUEUE_NAME,
  startRunInputSchema,
  type CancelRunInput,
  type RunEventPayload,
  type RunEventType,
  type RunJobData,
  type RunStatus,
  type RunStepKey,
  type StartRunInput,
} from "./contracts/runs.js";
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @wakil/shared test && pnpm --filter @wakil/shared typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): add run contracts, enums, job payload, and Arabic labels"
```

---

## Task 3: Worker — BullMQ dependency and deterministic step list

**Files:**
- Modify: `apps/worker/package.json`
- Create: `apps/worker/src/runs/steps.ts`
- Test: `apps/worker/src/runs/steps.test.ts`

**Interfaces:**
- Consumes: `RUN_STEP_KEYS`, `RunStepKey` from `@wakil/shared`.
- Produces: `RUN_STEPS: readonly RunStepKey[]`, `STEP_LIMIT: number`, `TIME_LIMIT_MS: number`.

- [ ] **Step 1: Add the dependency**

In `apps/worker/package.json`, add to `dependencies` (keep alphabetical): `"bullmq": "5.63.1"`, `"@wakil/shared": "workspace:*"`. Then run:

Run: `pnpm install`
Expected: lockfile updates; `bullmq` and `@wakil/shared` resolve for `@wakil/worker`.

- [ ] **Step 2: Write the failing test**

Create `apps/worker/src/runs/steps.test.ts`:

```typescript
import { RUN_STEP_KEYS } from "@wakil/shared";
import { describe, expect, it } from "vitest";

import { RUN_STEPS, STEP_LIMIT, TIME_LIMIT_MS } from "./steps.js";

describe("run steps", () => {
  it("runs the fixed deterministic step list in order", () => {
    expect(RUN_STEPS).toEqual(RUN_STEP_KEYS);
  });

  it("keeps the step count within the guard limit", () => {
    expect(RUN_STEPS.length).toBeLessThanOrEqual(STEP_LIMIT);
    expect(TIME_LIMIT_MS).toBe(60_000);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @wakil/worker test`
Expected: FAIL — `./steps.js` not found.

- [ ] **Step 4: Write the step list**

Create `apps/worker/src/runs/steps.ts`:

```typescript
import { RUN_STEP_KEYS, type RunStepKey } from "@wakil/shared";

/** Ordered deterministic steps; each emits one persisted run.step event. */
export const RUN_STEPS: readonly RunStepKey[] = RUN_STEP_KEYS;

/** Guard: a run may never emit more step events than this. */
export const STEP_LIMIT = 8;

/** Guard: wall-clock budget for the whole run before it fails. */
export const TIME_LIMIT_MS = 60_000;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @wakil/worker test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/worker/package.json apps/worker/src/runs/steps.ts apps/worker/src/runs/steps.test.ts pnpm-lock.yaml
git commit -m "feat(worker): add bullmq and the deterministic run step list"
```

---

## Task 4: Worker — event persistence (seq assignment) and Redis publish

**Files:**
- Create: `apps/worker/src/runs/events.ts`
- Test: `apps/worker/src/runs/events.integration.test.ts`

**Interfaces:**
- Consumes: `runs`, `runEvents` from `@wakil/db/schema`; `RunEventType`, `RunStepKey`, `runEventChannel` from `@wakil/shared`; a Drizzle transaction client; an ioredis client.
- Produces:
  - `appendRunEvent(tx, input: { runId: string; workspaceId: string; type: RunEventType; stepKey?: RunStepKey; stepIndex?: number }): Promise<{ seq: number; createdAtIso: string }>` — assigns `seq = max(seq)+1` for the run and inserts the row.
  - `publishRunEvent(redis, runId: string, payload: RunEventPayload): Promise<void>` — publishes JSON to `runEventChannel(runId)`.

- [ ] **Step 1: Write the failing integration test**

Create `apps/worker/src/runs/events.integration.test.ts`:

```typescript
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDatabaseClient } from "@wakil/db/client";
import { migrateDatabase } from "@wakil/db/migrate";
import { conversations, projects, runs, users, workspaces } from "@wakil/db/schema";
import { afterAll, beforeAll, expect, it } from "vitest";

import { appendRunEvent } from "./events.js";

let container: StartedPostgreSqlContainer;
let handle: ReturnType<typeof createDatabaseClient>;

const ids = {
  user: "10000000-0000-4000-8000-000000000001",
  workspace: "20000000-0000-4000-8000-000000000001",
  project: "30000000-0000-4000-8000-000000000001",
  conversation: "40000000-0000-4000-8000-000000000001",
  run: "50000000-0000-4000-8000-000000000001",
};

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17.10-alpine3.23").start();
  await migrateDatabase(container.getConnectionUri());
  handle = createDatabaseClient(container.getConnectionUri());
  const db = handle.db;
  await db.insert(users).values({ id: ids.user, email: "o@example.test" });
  await db.insert(workspaces).values({ id: ids.workspace, name: "W", ownerUserId: ids.user });
  await db
    .insert(projects)
    .values({ id: ids.project, workspaceId: ids.workspace, createdByUserId: ids.user, title: "P" });
  await db
    .insert(conversations)
    .values({ id: ids.conversation, workspaceId: ids.workspace, projectId: ids.project });
  await db.insert(runs).values({
    id: ids.run,
    workspaceId: ids.workspace,
    projectId: ids.project,
    conversationId: ids.conversation,
    createdByUserId: ids.user,
  });
}, 120_000);

afterAll(async () => {
  await handle?.close();
  await container?.stop();
});

it("assigns monotonic per-run seq values", async () => {
  const first = await handle.db.transaction((tx) =>
    appendRunEvent(tx, { runId: ids.run, workspaceId: ids.workspace, type: "run.started" }),
  );
  const second = await handle.db.transaction((tx) =>
    appendRunEvent(tx, {
      runId: ids.run,
      workspaceId: ids.workspace,
      type: "run.step",
      stepKey: "finalize",
      stepIndex: 0,
    }),
  );
  expect(first.seq).toBe(1);
  expect(second.seq).toBe(2);
});
```

Note: this package needs `@testcontainers/postgresql` as a dev dependency. Add `"@testcontainers/postgresql": "12.0.4"` to `apps/worker/package.json` devDependencies and add a `"test:integration": "vitest run src/**/*.integration.test.ts"` script plus set the base `test` script to exclude integration: `"test": "vitest run --exclude src/**/*.integration.test.ts"`. Run `pnpm install`.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @wakil/worker test:integration`
Expected: FAIL — `appendRunEvent` not found.

- [ ] **Step 3: Write the module**

Create `apps/worker/src/runs/events.ts`:

```typescript
import type { createDatabaseClient } from "@wakil/db/client";
import { runEvents } from "@wakil/db/schema";
import { runEventChannel, type RunEventPayload, type RunEventType, type RunStepKey } from "@wakil/shared";
import { eq, sql } from "drizzle-orm";
import type { Redis } from "ioredis";

// Drizzle transaction client type, derived from the db handle.
type Database = ReturnType<typeof createDatabaseClient>["db"];
type TransactionClient = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type AppendRunEventInput = {
  runId: string;
  workspaceId: string;
  type: RunEventType;
  stepKey?: RunStepKey;
  stepIndex?: number;
};

/** Inserts one append-only event with seq = max(seq)+1 for the run. */
export async function appendRunEvent(
  tx: TransactionClient,
  input: AppendRunEventInput,
): Promise<{ seq: number; createdAtIso: string }> {
  const next = (
    await tx
      .select({ seq: sql<number>`coalesce(max(${runEvents.seq}), 0) + 1` })
      .from(runEvents)
      .where(eq(runEvents.runId, input.runId))
  )[0];
  const seq = next?.seq ?? 1;

  const data: Record<string, number | string> = {};
  if (input.stepKey) data["stepKey"] = input.stepKey;
  if (typeof input.stepIndex === "number") data["stepIndex"] = input.stepIndex;

  const inserted = (
    await tx
      .insert(runEvents)
      .values({
        runId: input.runId,
        workspaceId: input.workspaceId,
        seq,
        type: input.type,
        data,
      })
      .returning({ createdAt: runEvents.createdAt })
  )[0];
  if (!inserted) throw new Error("run event insert returned no row");

  return { seq, createdAtIso: inserted.createdAt.toISOString() };
}

/** Publishes a live copy to Redis; PostgreSQL already holds the durable event. */
export async function publishRunEvent(
  redis: Redis,
  runId: string,
  payload: RunEventPayload,
): Promise<void> {
  await redis.publish(runEventChannel(runId), JSON.stringify(payload));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @wakil/worker test:integration`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/package.json apps/worker/src/runs/events.ts apps/worker/src/runs/events.integration.test.ts pnpm-lock.yaml
git commit -m "feat(worker): persist run events with per-run seq and Redis publish"
```

---

## Task 5: Worker — run processor and BullMQ consumer

**Files:**
- Create: `apps/worker/src/runs/processor.ts`
- Modify: `apps/worker/src/index.ts`
- Test: `apps/worker/src/runs/processor.integration.test.ts`

**Interfaces:**
- Consumes: `appendRunEvent`, `publishRunEvent` (Task 4); `RUN_STEPS`, `STEP_LIMIT`, `TIME_LIMIT_MS` (Task 3); `runs`, `conversationMessages` from `@wakil/db/schema`; `RunJobData` from `@wakil/shared`.
- Produces: `processRun(deps: { db: Database; redis: Redis }, job: RunJobData): Promise<RunStatus>` — transitions the run and returns its terminal status.

- [ ] **Step 1: Write the failing integration test**

Create `apps/worker/src/runs/processor.integration.test.ts`:

```typescript
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDatabaseClient } from "@wakil/db/client";
import { migrateDatabase } from "@wakil/db/migrate";
import {
  conversationMessages,
  conversations,
  projects,
  runEvents,
  runs,
  users,
  workspaces,
} from "@wakil/db/schema";
import { asc, eq } from "drizzle-orm";
import { Redis } from "ioredis";
import { afterAll, beforeAll, expect, it } from "vitest";

import { processRun } from "./processor.js";

let container: StartedPostgreSqlContainer;
let handle: ReturnType<typeof createDatabaseClient>;
let redis: Redis;

const ids = {
  user: "10000000-0000-4000-8000-000000000002",
  workspace: "20000000-0000-4000-8000-000000000002",
  project: "30000000-0000-4000-8000-000000000002",
  conversation: "40000000-0000-4000-8000-000000000002",
};

async function seedRun(runId: string): Promise<void> {
  await handle.db.insert(runs).values({
    id: runId,
    workspaceId: ids.workspace,
    projectId: ids.project,
    conversationId: ids.conversation,
    createdByUserId: ids.user,
  });
  // The web transaction writes run.queued (seq 1); mirror it here.
  await handle.db
    .insert(runEvents)
    .values({ runId, workspaceId: ids.workspace, seq: 1, type: "run.queued", data: {} });
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17.10-alpine3.23").start();
  await migrateDatabase(container.getConnectionUri());
  handle = createDatabaseClient(container.getConnectionUri());
  // A real Redis is not required for these assertions; use a throwaway that no-ops publish.
  redis = new Redis({ lazyConnect: true, maxRetriesPerRequest: 1 });
  redis.publish = (async () => 0) as unknown as Redis["publish"];
  const db = handle.db;
  await db.insert(users).values({ id: ids.user, email: "p@example.test" });
  await db.insert(workspaces).values({ id: ids.workspace, name: "W", ownerUserId: ids.user });
  await db
    .insert(projects)
    .values({ id: ids.project, workspaceId: ids.workspace, createdByUserId: ids.user, title: "P" });
  await db
    .insert(conversations)
    .values({ id: ids.conversation, workspaceId: ids.workspace, projectId: ids.project });
  await db.insert(conversationMessages).values({
    conversationId: ids.conversation,
    workspaceId: ids.workspace,
    role: "user",
    content: "أريد موقعًا بسيطًا",
  });
}, 120_000);

afterAll(async () => {
  await handle?.close();
  redis?.disconnect();
  await container?.stop();
});

it("runs to succeeded and emits ordered events", async () => {
  const runId = "50000000-0000-4000-8000-000000000010";
  await seedRun(runId);

  const status = await processRun({ db: handle.db, redis }, {
    runId,
    workspaceId: ids.workspace,
    projectId: ids.project,
  });
  expect(status).toBe("succeeded");

  const events = await handle.db
    .select({ seq: runEvents.seq, type: runEvents.type })
    .from(runEvents)
    .where(eq(runEvents.runId, runId))
    .orderBy(asc(runEvents.seq));
  expect(events.map((e) => e.type)).toEqual([
    "run.queued",
    "run.started",
    "run.step",
    "run.step",
    "run.step",
    "run.succeeded",
  ]);

  const run = (await handle.db.select().from(runs).where(eq(runs.id, runId)))[0];
  expect(run?.status).toBe("succeeded");
  expect(run?.stepCount).toBe(3);
  expect(run?.finishedAt).not.toBeNull();
});

it("cancels cooperatively when cancel_requested_at is set", async () => {
  const runId = "50000000-0000-4000-8000-000000000011";
  await seedRun(runId);
  await handle.db.update(runs).set({ cancelRequestedAt: new Date() }).where(eq(runs.id, runId));

  const status = await processRun({ db: handle.db, redis }, {
    runId,
    workspaceId: ids.workspace,
    projectId: ids.project,
  });
  expect(status).toBe("cancelled");
  const run = (await handle.db.select().from(runs).where(eq(runs.id, runId)))[0];
  expect(run?.status).toBe("cancelled");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @wakil/worker test:integration`
Expected: FAIL — `processRun` not found.

- [ ] **Step 3: Write the processor**

Create `apps/worker/src/runs/processor.ts`:

```typescript
import type { createDatabaseClient } from "@wakil/db/client";
import { conversationMessages, runs } from "@wakil/db/schema";
import {
  runEventLabel,
  type RunEventPayload,
  type RunJobData,
  type RunStatus,
} from "@wakil/shared";
import { and, eq } from "drizzle-orm";
import type { Redis } from "ioredis";

import { appendRunEvent, publishRunEvent } from "./events.js";
import { RUN_STEPS, STEP_LIMIT, TIME_LIMIT_MS } from "./steps.js";

type Database = ReturnType<typeof createDatabaseClient>["db"];

export type ProcessorDeps = { db: Database; redis: Redis };

async function emit(
  deps: ProcessorDeps,
  job: RunJobData,
  event: Parameters<typeof appendRunEvent>[1],
): Promise<void> {
  const { seq, createdAtIso } = await deps.db.transaction((tx) => appendRunEvent(tx, event));
  const payload: RunEventPayload = {
    seq,
    type: event.type,
    createdAtIso,
    ...(event.stepKey ? { stepKey: event.stepKey } : {}),
    ...(typeof event.stepIndex === "number" ? { stepIndex: event.stepIndex } : {}),
  };
  await publishRunEvent(deps.redis, job.runId, payload);
}

async function isCancelRequested(deps: ProcessorDeps, runId: string): Promise<boolean> {
  const row = (
    await deps.db
      .select({ cancelRequestedAt: runs.cancelRequestedAt })
      .from(runs)
      .where(eq(runs.id, runId))
  )[0];
  return Boolean(row?.cancelRequestedAt);
}

/** Runs the bounded deterministic state machine; returns the terminal status. */
export async function processRun(deps: ProcessorDeps, job: RunJobData): Promise<RunStatus> {
  // Claim the run: only a still-queued run transitions to running.
  const claimed = await deps.db
    .update(runs)
    .set({ status: "running", startedAt: new Date() })
    .where(and(eq(runs.id, job.runId), eq(runs.status, "queued")))
    .returning({ id: runs.id });
  if (claimed.length === 0) {
    const existing = (
      await deps.db.select({ status: runs.status }).from(runs).where(eq(runs.id, job.runId))
    )[0];
    return (existing?.status as RunStatus | undefined) ?? "failed";
  }

  await emit(deps, job, { runId: job.runId, workspaceId: job.workspaceId, type: "run.started" });

  const deadline = Date.now() + TIME_LIMIT_MS;
  let completedSteps = 0;

  try {
    for (const [index, stepKey] of RUN_STEPS.entries()) {
      if (await isCancelRequested(deps, job.runId)) {
        return finalize(deps, job, "cancelled", "run.cancelled", completedSteps);
      }
      if (completedSteps >= STEP_LIMIT) {
        return finalize(deps, job, "failed", "run.failed", completedSteps, "INTERNAL_ERROR");
      }
      if (Date.now() > deadline) {
        return finalize(deps, job, "failed", "run.failed", completedSteps, "INTERNAL_ERROR");
      }

      // Real, deterministic work per step.
      if (stepKey === "validate-request") {
        const message = (
          await deps.db
            .select({ id: conversationMessages.id })
            .from(conversationMessages)
            .where(eq(conversationMessages.workspaceId, job.workspaceId))
            .limit(1)
        )[0];
        if (!message) {
          return finalize(deps, job, "failed", "run.failed", completedSteps, "NOT_FOUND");
        }
      }

      await emit(deps, job, {
        runId: job.runId,
        workspaceId: job.workspaceId,
        type: "run.step",
        stepKey,
        stepIndex: index,
      });
      completedSteps += 1;
    }

    return finalize(deps, job, "succeeded", "run.succeeded", completedSteps);
  } catch {
    return finalize(deps, job, "failed", "run.failed", completedSteps, "INTERNAL_ERROR");
  }
}

async function finalize(
  deps: ProcessorDeps,
  job: RunJobData,
  status: RunStatus,
  eventType: "run.succeeded" | "run.failed" | "run.cancelled",
  stepCount: number,
  errorCode?: string,
): Promise<RunStatus> {
  await deps.db
    .update(runs)
    .set({ status, stepCount, finishedAt: new Date(), errorCode: errorCode ?? null })
    .where(eq(runs.id, job.runId));
  await emit(deps, job, { runId: job.runId, workspaceId: job.workspaceId, type: eventType });
  // Label lookup keeps the mapping exercised server-side; not persisted.
  void runEventLabel({ type: eventType });
  return status;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @wakil/worker test:integration`
Expected: PASS (both succeeded and cancelled cases).

- [ ] **Step 5: Wire the BullMQ consumer into the worker entrypoint**

Modify `apps/worker/src/index.ts`. Keep env validation, readiness checks, `--check` early return, and clean shutdown. Replace the idle `await new Promise(...)` block with a BullMQ Worker:

```typescript
import { createDatabaseClient } from "@wakil/db";
import { RUNS_QUEUE_NAME, type RunJobData } from "@wakil/shared";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { pathToFileURL } from "node:url";
import pino from "pino";

import { readWorkerEnv } from "./env.js";
import { checkReadiness } from "./readiness.js";
import { processRun } from "./runs/processor.js";
```

After the readiness check passes and the `--check` early return, replace the idle wait with:

```typescript
    // BullMQ's blocking connection requires maxRetriesPerRequest: null.
    const queueConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    const publisher = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 });

    const worker = new Worker<RunJobData>(
      RUNS_QUEUE_NAME,
      async (job) => {
        const status = await processRun({ db: database, redis: publisher }, job.data);
        logger.info({ runId: job.data.runId, status }, "run processed");
      },
      { connection: queueConnection, concurrency: 4 },
    );

    worker.on("failed", (job, error) => {
      logger.error({ runId: job?.data.runId, error: error.name }, "run job failed");
    });

    logger.info({ queue: RUNS_QUEUE_NAME, state: "consuming" }, "worker ready");

    await new Promise<void>((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
    });

    await worker.close();
    await Promise.allSettled([queueConnection.quit(), publisher.quit()]);
```

Keep the existing `finally` block that closes `database` and `redis`. Note the original readiness `redis` client stays for the readiness probe; the two new clients are dedicated to BullMQ transport and publishing.

- [ ] **Step 6: Typecheck and unit-test the worker**

Run: `pnpm --filter @wakil/worker typecheck && pnpm --filter @wakil/worker test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/worker/src
git commit -m "feat(worker): process runs via BullMQ with bounded state machine and cancellation"
```

---

## Task 6: Web — BullMQ producer

**Files:**
- Create: `apps/web/src/server/features/runs/queue.ts`

**Interfaces:**
- Consumes: `RUNS_QUEUE_NAME`, `RunJobData` from `@wakil/shared`; `getWebEnv` from `../../env`.
- Produces: `enqueueRun(job: RunJobData): Promise<void>`.

- [ ] **Step 1: Add the dependency**

In `apps/web/package.json` add `"bullmq": "5.63.1"` to `dependencies`. Run `pnpm install`.

- [ ] **Step 2: Write the producer**

Create `apps/web/src/server/features/runs/queue.ts`:

```typescript
import { RUNS_QUEUE_NAME, type RunJobData } from "@wakil/shared";
import { Queue } from "bullmq";
import { Redis } from "ioredis";

import { getWebEnv } from "../../../env";

const globalScope = globalThis as typeof globalThis & {
  __wakilRunQueue?: Queue<RunJobData>;
};

function getQueue(): Queue<RunJobData> {
  globalScope.__wakilRunQueue ??= new Queue<RunJobData>(RUNS_QUEUE_NAME, {
    connection: new Redis(getWebEnv().REDIS_URL, { maxRetriesPerRequest: null }),
  });
  return globalScope.__wakilRunQueue;
}

/** Enqueues a job keyed by runId so a duplicate enqueue is deduplicated. */
export async function enqueueRun(job: RunJobData): Promise<void> {
  await getQueue().add("run", job, {
    jobId: job.runId,
    removeOnComplete: true,
    removeOnFail: true,
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @wakil/web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json apps/web/src/server/features/runs/queue.ts pnpm-lock.yaml
git commit -m "feat(web): add BullMQ run producer"
```

---

## Task 7: Web — run queries and `startRun` mutation

**Files:**
- Create: `apps/web/src/server/features/runs/queries.ts`
- Create: `apps/web/src/server/features/runs/mutations.ts`
- Test: `apps/web/src/server/features/runs/mutations.integration.test.ts`

**Interfaces:**
- Consumes: `enqueueRun` (Task 6); `runs`, `runEvents`, `conversations` from `@wakil/db/schema`; `startRunInputSchema`, `runEventLabel`, `success`, `failure`, `ActionResult` from `@wakil/shared`; `beginIdempotent`, `completeIdempotent`, `hashRequest`, `enforceRateLimit`, `writeAuditLog` (existing services); `Database`, `ServiceContext` from `../types`.
- Produces:
  - `getLatestRun(db, ctx, projectId): Promise<RunSummary | null>` where `RunSummary = { id: string; status: RunStatus; errorCode: string | null }`.
  - `getRunEventsAfter(db, ctx, projectId, runId, afterSeq): Promise<RunEventPayload[]>`.
  - `getRunForStream(db, ctx, projectId, runId): Promise<{ status: RunStatus } | null>`.
  - `startRun(deps: { db; redis }, ctx, rawInput): Promise<ActionResult<{ runId: string }>>`.

For the audit action union, extend `AuditEntry.action` and `targetType` in `apps/web/src/server/features/audit/service.ts` to include `"run.started"`, `"run.cancelled"`, and target type `"run"`.

- [ ] **Step 1: Extend the audit union**

In `apps/web/src/server/features/audit/service.ts`, add `"run.started"` and `"run.cancelled"` to the `action` union and `"run"` to the `targetType` union.

- [ ] **Step 2: Write the queries**

Create `apps/web/src/server/features/runs/queries.ts`:

```typescript
import { runEvents, runs } from "@wakil/db/schema";
import { type RunEventPayload, type RunEventType, type RunStatus, type RunStepKey } from "@wakil/shared";
import { and, asc, desc, eq, gt } from "drizzle-orm";

import { getProjectById } from "../projects/queries";
import type { Database, ServiceContext } from "../types";

export type RunSummary = { id: string; status: RunStatus; errorCode: string | null };

/** Latest run for a project, tenant-scoped; null hides cross-tenant existence. */
export async function getLatestRun(
  db: Database,
  ctx: ServiceContext,
  projectId: string,
): Promise<RunSummary | null> {
  const project = await getProjectById(db, ctx, projectId);
  if (!project) return null;
  const row = (
    await db
      .select({ id: runs.id, status: runs.status, errorCode: runs.errorCode })
      .from(runs)
      .where(and(eq(runs.projectId, project.id), eq(runs.workspaceId, ctx.workspaceId)))
      .orderBy(desc(runs.createdAt))
      .limit(1)
  )[0];
  if (!row) return null;
  return { id: row.id, status: row.status as RunStatus, errorCode: row.errorCode };
}

/** Verifies the run belongs to the tenant + project before streaming. */
export async function getRunForStream(
  db: Database,
  ctx: ServiceContext,
  projectId: string,
  runId: string,
): Promise<{ status: RunStatus } | null> {
  const row = (
    await db
      .select({ status: runs.status })
      .from(runs)
      .where(
        and(
          eq(runs.id, runId),
          eq(runs.projectId, projectId),
          eq(runs.workspaceId, ctx.workspaceId),
        ),
      )
      .limit(1)
  )[0];
  return row ? { status: row.status as RunStatus } : null;
}

/** Ordered events with seq greater than afterSeq (Last-Event-ID replay). */
export async function getRunEventsAfter(
  db: Database,
  ctx: ServiceContext,
  projectId: string,
  runId: string,
  afterSeq: number,
): Promise<RunEventPayload[]> {
  const belongs = await getRunForStream(db, ctx, projectId, runId);
  if (!belongs) return [];
  const rows = await db
    .select({
      seq: runEvents.seq,
      type: runEvents.type,
      data: runEvents.data,
      createdAt: runEvents.createdAt,
    })
    .from(runEvents)
    .where(and(eq(runEvents.runId, runId), gt(runEvents.seq, afterSeq)))
    .orderBy(asc(runEvents.seq));

  return rows.map((row) => {
    const data = (row.data ?? {}) as { stepKey?: RunStepKey; stepIndex?: number };
    return {
      seq: row.seq,
      type: row.type as RunEventType,
      createdAtIso: row.createdAt.toISOString(),
      ...(data.stepKey ? { stepKey: data.stepKey } : {}),
      ...(typeof data.stepIndex === "number" ? { stepIndex: data.stepIndex } : {}),
    };
  });
}
```

- [ ] **Step 3: Write the failing mutation test**

Create `apps/web/src/server/features/runs/mutations.integration.test.ts`. It stands up PostgreSQL + a fake Redis and a spy `enqueueRun`. Because `startRun` imports `enqueueRun` from `./queue`, pass the enqueue function via `deps` instead of importing it directly (see Step 4 signature). Test body:

```typescript
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDatabaseClient } from "@wakil/db/client";
import { migrateDatabase } from "@wakil/db/migrate";
import { conversationMessages, conversations, projects, runs, users, workspaces } from "@wakil/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

import { startRun } from "./mutations";

// Minimal Redis stub: rate limiter uses incr/expire and status.
function fakeRedis() {
  const store = new Map<string, number>();
  return {
    status: "ready",
    async incr(key: string) {
      const next = (store.get(key) ?? 0) + 1;
      store.set(key, next);
      return next;
    },
    async expire() {
      return 1;
    },
  } as unknown as import("ioredis").Redis;
}

let container: StartedPostgreSqlContainer;
let handle: ReturnType<typeof createDatabaseClient>;
const ids = {
  user: "10000000-0000-4000-8000-000000000021",
  workspace: "20000000-0000-4000-8000-000000000021",
  project: "30000000-0000-4000-8000-000000000021",
  conversation: "40000000-0000-4000-8000-000000000021",
};
const ctx = { userId: ids.user, workspaceId: ids.workspace };

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17.10-alpine3.23").start();
  await migrateDatabase(container.getConnectionUri());
  handle = createDatabaseClient(container.getConnectionUri());
  const db = handle.db;
  await db.insert(users).values({ id: ids.user, email: "s@example.test" });
  await db.insert(workspaces).values({ id: ids.workspace, name: "W", ownerUserId: ids.user });
  await db.insert(projects).values({ id: ids.project, workspaceId: ids.workspace, createdByUserId: ids.user, title: "P" });
  await db.insert(conversations).values({ id: ids.conversation, workspaceId: ids.workspace, projectId: ids.project });
  await db.insert(conversationMessages).values({ conversationId: ids.conversation, workspaceId: ids.workspace, role: "user", content: "طلب" });
}, 120_000);

afterAll(async () => {
  await handle?.close();
  await container?.stop();
});

it("creates a queued run, writes run.queued, and enqueues once", async () => {
  const enqueue = vi.fn(async () => {});
  const result = await startRun(
    { db: handle.db, redis: fakeRedis(), enqueueRun: enqueue },
    ctx,
    { projectId: ids.project, idempotencyKey: "startrunkey0000001234" },
  );
  expect(result.ok).toBe(true);
  expect(enqueue).toHaveBeenCalledTimes(1);
  const run = (await handle.db.select().from(runs).where(eq(runs.projectId, ids.project)))[0];
  expect(run?.status).toBe("queued");
});

it("rejects a second active run for the same project", async () => {
  const enqueue = vi.fn(async () => {});
  const result = await startRun(
    { db: handle.db, redis: fakeRedis(), enqueueRun: enqueue },
    ctx,
    { projectId: ids.project, idempotencyKey: "startrunkey0000009999" },
  );
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.code).toBe("RUN_ALREADY_ACTIVE");
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `pnpm --filter @wakil/web test:integration`
Expected: FAIL — `startRun` not found.

- [ ] **Step 5: Write the mutation**

Create `apps/web/src/server/features/runs/mutations.ts`. Mirror `projects/mutations.ts` exactly (the `ServiceFailure`, `zodFieldErrors`, `runMutation` helpers). Inject `enqueueRun` through deps for testability; the action layer passes the real one. The one-active-per-project unique index throws on a duplicate insert — catch it as `RUN_ALREADY_ACTIVE`:

```typescript
import { conversations, runEvents, runs } from "@wakil/db/schema";
import {
  failure,
  startRunInputSchema,
  success,
  type ActionFailure,
  type ActionResult,
  type RunJobData,
} from "@wakil/shared";
import { and, asc, eq } from "drizzle-orm";
import type { Redis } from "ioredis";
import { z } from "zod";

import { writeAuditLog } from "../audit/service";
import { beginIdempotent, completeIdempotent, hashRequest } from "../idempotency/service";
import { enforceRateLimit } from "../rate-limit/service";
import { getProjectById } from "../projects/queries";
import type { Database, ServiceContext } from "../types";

export type RunMutationDeps = {
  db: Database;
  redis: Redis;
  enqueueRun: (job: RunJobData) => Promise<void>;
};

class ServiceFailure extends Error {
  constructor(readonly result: ActionFailure) {
    super(result.code);
  }
}

function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    fields[field] ??= issue.message;
  }
  return fields;
}

/** Postgres unique_violation on the partial active-run index. */
function isActiveRunConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505" &&
    "constraint_name" in error &&
    (error as { constraint_name?: string }).constraint_name === "runs_one_active_per_project"
  );
}

export async function startRun(
  deps: RunMutationDeps,
  ctx: ServiceContext,
  rawInput: unknown,
): Promise<ActionResult<{ runId: string }>> {
  const parsed = startRunInputSchema.safeParse(rawInput);
  if (!parsed.success) return failure("VALIDATION_FAILED", zodFieldErrors(parsed.error));
  const input = parsed.data;

  const limited = await enforceRateLimit(deps.redis, ctx.userId, "run.start");
  if (limited) return limited;

  const scope = {
    key: input.idempotencyKey,
    operation: "run.start",
    requestHash: hashRequest("run.start", { projectId: input.projectId }),
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  };

  let enqueue: RunJobData | null = null;
  try {
    const result = await deps.db.transaction(async (tx) => {
      const claim = await beginIdempotent(tx, scope);
      if (claim.kind === "conflict") throw new ServiceFailure(failure("IDEMPOTENCY_CONFLICT"));
      if (claim.kind === "replay") {
        const runId = claim.response["runId"];
        if (!runId) throw new ServiceFailure(failure("INTERNAL_ERROR"));
        return success({ runId });
      }

      const project = await getProjectById(tx as unknown as Database, ctx, input.projectId);
      if (!project) throw new ServiceFailure(failure("NOT_FOUND"));
      if (project.status !== "active") throw new ServiceFailure(failure("PROJECT_ARCHIVED"));

      const conversation = (
        await tx
          .select({ id: conversations.id })
          .from(conversations)
          .where(
            and(
              eq(conversations.projectId, project.id),
              eq(conversations.workspaceId, ctx.workspaceId),
            ),
          )
          .orderBy(asc(conversations.createdAt))
          .limit(1)
      )[0];
      if (!conversation) throw new ServiceFailure(failure("NOT_FOUND"));

      const run = (
        await tx
          .insert(runs)
          .values({
            workspaceId: ctx.workspaceId,
            projectId: project.id,
            conversationId: conversation.id,
            createdByUserId: ctx.userId,
          })
          .returning({ id: runs.id })
      )[0];
      if (!run) throw new ServiceFailure(failure("INTERNAL_ERROR"));

      await tx.insert(runEvents).values({
        runId: run.id,
        workspaceId: ctx.workspaceId,
        seq: 1,
        type: "run.queued",
        data: {},
      });

      await writeAuditLog(tx, {
        action: "run.started",
        actorUserId: ctx.userId,
        targetId: run.id,
        targetType: "run",
        workspaceId: ctx.workspaceId,
      });

      await completeIdempotent(tx, scope, { runId: run.id });
      enqueue = { runId: run.id, workspaceId: ctx.workspaceId, projectId: project.id };
      return success({ runId: run.id });
    });

    if (enqueue) await deps.enqueueRun(enqueue);
    return result;
  } catch (error) {
    if (error instanceof ServiceFailure) return error.result;
    if (isActiveRunConflict(error)) return failure("RUN_ALREADY_ACTIVE");
    return failure("INTERNAL_ERROR");
  }
}
```

Add `"run.start"` to `RATE_LIMITS` in `apps/web/src/server/features/rate-limit/service.ts`: `"run.start": { limit: 20, windowSeconds: 60 }`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @wakil/web test:integration`
Expected: PASS (queued+enqueue, and active-run conflict).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/server/features/runs apps/web/src/server/features/audit apps/web/src/server/features/rate-limit
git commit -m "feat(web): add run queries and tenant-safe startRun mutation"
```

---

## Task 8: Web — `cancelRun` mutation

**Files:**
- Modify: `apps/web/src/server/features/runs/mutations.ts`
- Test: `apps/web/src/server/features/runs/mutations.integration.test.ts`

**Interfaces:**
- Consumes: `cancelRunInputSchema` from `@wakil/shared`; existing helpers in the module.
- Produces: `cancelRun(deps: RunMutationDeps, ctx, rawInput): Promise<ActionResult<{ runId: string }>>`.

- [ ] **Step 1: Write the failing test**

Append to `mutations.integration.test.ts`:

```typescript
it("marks an active run as cancel-requested", async () => {
  // Insert a fresh running run directly for a second project to avoid the active conflict.
  const p2 = "30000000-0000-4000-8000-000000000022";
  await handle.db.insert(projects).values({ id: p2, workspaceId: ids.workspace, createdByUserId: ids.user, title: "P2" });
  const c2 = "40000000-0000-4000-8000-000000000022";
  await handle.db.insert(conversations).values({ id: c2, workspaceId: ids.workspace, projectId: p2 });
  const runId = "50000000-0000-4000-8000-000000000030";
  await handle.db.insert(runs).values({
    id: runId, workspaceId: ids.workspace, projectId: p2, conversationId: c2,
    createdByUserId: ids.user, status: "running", startedAt: new Date(),
  });

  const result = await cancelRun(
    { db: handle.db, redis: fakeRedis(), enqueueRun: async () => {} },
    ctx,
    { projectId: p2, runId, idempotencyKey: "cancelkey00000012345" },
  );
  expect(result.ok).toBe(true);
  const run = (await handle.db.select().from(runs).where(eq(runs.id, runId)))[0];
  expect(run?.cancelRequestedAt).not.toBeNull();
});
```

Add `cancelRun` to the import at the top of the test file.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @wakil/web test:integration`
Expected: FAIL — `cancelRun` not exported.

- [ ] **Step 3: Write the mutation**

Append to `apps/web/src/server/features/runs/mutations.ts` (add `cancelRunInputSchema` to the imports):

```typescript
export async function cancelRun(
  deps: RunMutationDeps,
  ctx: ServiceContext,
  rawInput: unknown,
): Promise<ActionResult<{ runId: string }>> {
  const parsed = cancelRunInputSchema.safeParse(rawInput);
  if (!parsed.success) return failure("VALIDATION_FAILED", zodFieldErrors(parsed.error));
  const input = parsed.data;

  const limited = await enforceRateLimit(deps.redis, ctx.userId, "run.cancel");
  if (limited) return limited;

  const scope = {
    key: input.idempotencyKey,
    operation: "run.cancel",
    requestHash: hashRequest("run.cancel", { projectId: input.projectId, runId: input.runId }),
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  };

  try {
    return await deps.db.transaction(async (tx) => {
      const claim = await beginIdempotent(tx, scope);
      if (claim.kind === "conflict") throw new ServiceFailure(failure("IDEMPOTENCY_CONFLICT"));
      if (claim.kind === "replay") return success({ runId: input.runId });

      const run = (
        await tx
          .select({ id: runs.id, status: runs.status })
          .from(runs)
          .where(
            and(
              eq(runs.id, input.runId),
              eq(runs.projectId, input.projectId),
              eq(runs.workspaceId, ctx.workspaceId),
            ),
          )
          .limit(1)
      )[0];
      if (!run) throw new ServiceFailure(failure("NOT_FOUND"));

      // Only active runs are cancellable; terminal runs replay as a no-op success.
      if (run.status === "queued" || run.status === "running") {
        await tx
          .update(runs)
          .set({ cancelRequestedAt: new Date() })
          .where(and(eq(runs.id, run.id), eq(runs.workspaceId, ctx.workspaceId)));
        await writeAuditLog(tx, {
          action: "run.cancelled",
          actorUserId: ctx.userId,
          targetId: run.id,
          targetType: "run",
          workspaceId: ctx.workspaceId,
        });
      }

      await completeIdempotent(tx, scope, { runId: run.id });
      return success({ runId: run.id });
    });
  } catch (error) {
    if (error instanceof ServiceFailure) return error.result;
    return failure("INTERNAL_ERROR");
  }
}
```

Add `"run.cancel": { limit: 20, windowSeconds: 60 }` to `RATE_LIMITS`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @wakil/web test:integration`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/features/runs/mutations.ts apps/web/src/server/features/runs/mutations.integration.test.ts apps/web/src/server/features/rate-limit/service.ts
git commit -m "feat(web): add cooperative cancelRun mutation"
```

---

## Task 9: Web — server actions, subscriber helper, and SSE route

**Files:**
- Create: `apps/web/src/server/actions/runs.ts`
- Modify: `apps/web/src/server/redis.ts`
- Create: `apps/web/app/api/projects/[projectId]/runs/[runId]/events/route.ts`

**Interfaces:**
- Consumes: `startRun`, `cancelRun` (Tasks 7-8); `enqueueRun` (Task 6); `getRunForStream`, `getRunEventsAfter` (Task 7); `requireAuthorizedContext`, `getDatabase`, `getRedis`; `runEventChannel`, `runEventPayloadSchema` from `@wakil/shared`.
- Produces: `startRunAction(input)`, `cancelRunAction(input)`; `createRedisSubscriber(): Redis`; the SSE `GET` handler.

- [ ] **Step 1: Add the subscriber helper**

Append to `apps/web/src/server/redis.ts`:

```typescript
/** A dedicated connection for pub/sub; subscriber mode blocks a shared client. */
export function createRedisSubscriber(): Redis {
  return new Redis(getWebEnv().REDIS_URL, { maxRetriesPerRequest: null });
}
```

- [ ] **Step 2: Write the server actions**

Create `apps/web/src/server/actions/runs.ts`:

```typescript
"use server";

import type { ActionResult } from "@wakil/shared";
import { revalidatePath } from "next/cache";

import { requireAuthorizedContext } from "../auth/session";
import { getDatabase } from "../db";
import { getRedis } from "../redis";
import { enqueueRun } from "../features/runs/queue";
import { cancelRun, startRun } from "../features/runs/mutations";

function deps() {
  return { db: getDatabase(), redis: getRedis(), enqueueRun };
}

export async function startRunAction(input: unknown): Promise<ActionResult<{ runId: string }>> {
  const ctx = await requireAuthorizedContext();
  const result = await startRun(deps(), ctx, input);
  if (result.ok && typeof input === "object" && input !== null && "projectId" in input) {
    revalidatePath(`/projects/${String((input as { projectId: unknown }).projectId)}`);
  }
  return result;
}

export async function cancelRunAction(input: unknown): Promise<ActionResult<{ runId: string }>> {
  const ctx = await requireAuthorizedContext();
  return cancelRun(deps(), ctx, input);
}
```

- [ ] **Step 3: Write the SSE route**

Create `apps/web/app/api/projects/[projectId]/runs/[runId]/events/route.ts`:

```typescript
import { runEventChannel, runEventPayloadSchema } from "@wakil/shared";

import { requireAuthorizedContext } from "../../../../../../../src/server/auth/session";
import { getDatabase } from "../../../../../../../src/server/db";
import { createRedisSubscriber } from "../../../../../../../src/server/redis";
import { getRunEventsAfter, getRunForStream } from "../../../../../../../src/server/features/runs/queries";

const TERMINAL = new Set(["run.succeeded", "run.failed", "run.cancelled"]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; runId: string }> },
): Promise<Response> {
  const { projectId, runId } = await params;
  const ctx = await requireAuthorizedContext();
  const db = getDatabase();

  const run = await getRunForStream(db, ctx, projectId, runId);
  if (!run) return new Response("Not found", { status: 404 });

  const lastEventId = Number.parseInt(request.headers.get("last-event-id") ?? "0", 10);
  const afterSeq = Number.isFinite(lastEventId) && lastEventId > 0 ? lastEventId : 0;

  const encoder = new TextEncoder();
  const subscriber = createRedisSubscriber();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function send(json: string) {
        const parsed = runEventPayloadSchema.safeParse(JSON.parse(json));
        if (!parsed.success) return;
        controller.enqueue(
          encoder.encode(`id: ${parsed.data.seq}\ndata: ${JSON.stringify(parsed.data)}\n\n`),
        );
        if (TERMINAL.has(parsed.data.type)) close();
      }

      let closed = false;
      function close() {
        if (closed) return;
        closed = true;
        subscriber.disconnect();
        try {
          controller.close();
        } catch {
          // already closed
        }
      }

      request.signal.addEventListener("abort", close);

      // 1) Subscribe first so no event published during replay is lost.
      await subscriber.subscribe(runEventChannel(runId));
      subscriber.on("message", (_channel, message) => send(message));

      // 2) Replay persisted events (deduplicated by seq on the client).
      const replay = await getRunEventsAfter(db, ctx, projectId, runId, afterSeq);
      for (const event of replay) {
        controller.enqueue(
          encoder.encode(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`),
        );
        if (TERMINAL.has(event.type)) {
          close();
          return;
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
    },
  });
}
```

Note: the client de-duplicates by `seq`, so a rare replay/live overlap is harmless. Verify the relative import depth (`../` count) matches the file's actual location before running.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @wakil/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/actions/runs.ts apps/web/src/server/redis.ts "apps/web/app/api/projects/[projectId]/runs"
git commit -m "feat(web): add run actions and SSE endpoint with Last-Event-ID replay"
```

---

## Task 10: Web — run panel UI and conversation wiring

**Files:**
- Create: `apps/web/app/(app)/projects/[projectId]/run-panel.tsx`
- Modify: `apps/web/app/(app)/projects/[projectId]/conversation-view.tsx`
- Modify: `apps/web/app/(app)/projects/[projectId]/page.tsx`

**Interfaces:**
- Consumes: `startRunAction`, `cancelRunAction`; `runEventLabel`, `runEventPayloadSchema`, `RunStatus`, `RunEventPayload` from `@wakil/shared`; `getLatestRun`, `getRunEventsAfter` (Task 7); `newIdempotencyKey`.
- Produces: `RunPanel` client component; `ConversationView` gains `initialRun` + `initialEvents` props.

- [ ] **Step 1: Load initial run state in the page**

In `apps/web/app/(app)/projects/[projectId]/page.tsx`, after the conversation load, add:

```typescript
import { getLatestRun, getRunEventsAfter } from "../../../../src/server/features/runs/queries";
```

and before rendering:

```typescript
  const latestRun = await getLatestRun(getDatabase(), ctx, projectId);
  const initialEvents = latestRun
    ? await getRunEventsAfter(getDatabase(), ctx, projectId, latestRun.id, 0)
    : [];
```

Pass to `ConversationView`:

```tsx
      initialRun={latestRun}
      initialEvents={initialEvents}
```

- [ ] **Step 2: Write the RunPanel component**

Create `apps/web/app/(app)/projects/[projectId]/run-panel.tsx`. It renders the current run status chip, the ordered real events with Arabic labels, a start button (when no active run), and a cancel button (while active). It subscribes to the SSE endpoint via `EventSource`, de-duplicating by `seq`, and shows `reconnecting` while `EventSource` is in its reconnecting state:

```tsx
"use client";

import { Button, StatusBanner } from "@wakil/ui";
import {
  runEventLabel,
  runEventPayloadSchema,
  type RunEventPayload,
  type RunStatus,
} from "@wakil/shared";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { newIdempotencyKey } from "../../../../src/lib/idempotency-key";
import { cancelRunAction, startRunAction } from "../../../../src/server/actions/runs";

type RunSummary = { id: string; status: RunStatus; errorCode: string | null };

const ACTIVE = new Set<RunStatus>(["queued", "running"]);
const STATUS_LABEL: Record<RunStatus, string> = {
  queued: "في قائمة الانتظار",
  running: "قيد التشغيل",
  succeeded: "اكتمل",
  failed: "تعذّر الإكمال",
  cancelled: "أُلغي",
};

export function RunPanel({
  projectId,
  initialRun,
  initialEvents,
  archived,
}: {
  projectId: string;
  initialRun: RunSummary | null;
  initialEvents: RunEventPayload[];
  archived: boolean;
}) {
  const [run, setRun] = useState<RunSummary | null>(initialRun);
  const [events, setEvents] = useState<RunEventPayload[]>(initialEvents);
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [startKey, setStartKey] = useState(newIdempotencyKey);
  const [cancelKey] = useState(newIdempotencyKey);
  const [pending, startTransition] = useTransition();
  const seenRef = useRef<Set<number>>(new Set(initialEvents.map((e) => e.seq)));

  const isActive = run !== null && ACTIVE.has(run.status);

  const applyEvent = useCallback((payload: RunEventPayload) => {
    if (seenRef.current.has(payload.seq)) return;
    seenRef.current.add(payload.seq);
    setEvents((prev) => [...prev, payload]);
    if (payload.type === "run.succeeded") setRun((r) => (r ? { ...r, status: "succeeded" } : r));
    if (payload.type === "run.failed") setRun((r) => (r ? { ...r, status: "failed" } : r));
    if (payload.type === "run.cancelled") setRun((r) => (r ? { ...r, status: "cancelled" } : r));
    if (payload.type === "run.started") setRun((r) => (r ? { ...r, status: "running" } : r));
  }, []);

  useEffect(() => {
    if (!run || !ACTIVE.has(run.status)) return;
    const source = new EventSource(`/api/projects/${projectId}/runs/${run.id}/events`);
    source.onopen = () => setReconnecting(false);
    source.onmessage = (message) => {
      const parsed = runEventPayloadSchema.safeParse(JSON.parse(message.data));
      if (parsed.success) applyEvent(parsed.data);
    };
    source.onerror = () => setReconnecting(true);
    return () => source.close();
  }, [projectId, run, applyEvent]);

  function start() {
    if (pending) return;
    startTransition(async () => {
      const result = await startRunAction({ projectId, idempotencyKey: startKey });
      if (result.ok) {
        seenRef.current = new Set();
        setEvents([]);
        setRun({ id: result.data.runId, status: "queued", errorCode: null });
        setStartKey(newIdempotencyKey());
        setError(undefined);
      } else {
        setError(result.message);
      }
    });
  }

  function cancel() {
    if (!run) return;
    startTransition(async () => {
      const result = await cancelRunAction({ projectId, runId: run.id, idempotencyKey: cancelKey });
      if (!result.ok) setError(result.message);
    });
  }

  if (archived) return null;

  return (
    <section aria-label="تشغيل المشروع" className="mb-4 rounded-lg border border-[var(--wk-border)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-sm text-[var(--wk-text-muted)]">التشغيل التقني</span>
        {run ? <span className="text-sm font-medium">{STATUS_LABEL[run.status]}</span> : null}
      </div>

      {events.length > 0 ? (
        <ol className="mb-3 flex flex-col gap-2">
          {events.map((event) => (
            <li key={event.seq} className="text-sm">
              {runEventLabel(event)}
            </li>
          ))}
        </ol>
      ) : null}

      {reconnecting ? (
        <StatusBanner tone="info" className="mb-3">
          جارٍ إعادة الاتصال لمتابعة التشغيل…
        </StatusBanner>
      ) : null}

      {run?.status === "failed" ? (
        <StatusBanner tone="danger" className="mb-3">
          تعذّر إكمال التشغيل. أعد المحاولة.
        </StatusBanner>
      ) : null}

      {error ? (
        <StatusBanner tone="danger" className="mb-3">
          {error}
        </StatusBanner>
      ) : null}

      {isActive ? (
        <Button variant="secondary" onClick={cancel} loading={pending}>
          إلغاء التشغيل
        </Button>
      ) : (
        <Button onClick={start} loading={pending}>
          بدء التشغيل
        </Button>
      )}
    </section>
  );
}
```

Note: confirm `Button` supports a `variant="secondary"` prop and `StatusBanner` accepts `tone`/`className` (they are used in `conversation-view.tsx`). If `Button` has no `variant`, use a plain `Button` for cancel. Confirm the CSS variable names (`--wk-border`, `--wk-text-muted`) against `packages/ui/src/styles/tokens.css`; use whatever the design system actually defines.

- [ ] **Step 3: Mount the panel in the conversation view**

In `conversation-view.tsx`, extend `ViewProps` with `initialRun` and `initialEvents`, import `RunPanel`, and render it at the top of `<main>` (before the messages list):

```tsx
<RunPanel
  projectId={projectId}
  initialRun={initialRun}
  initialEvents={initialEvents}
  archived={archived}
/>
```

Thread the two new props through from `page.tsx` (Step 1).

- [ ] **Step 4: Typecheck and build**

Run: `pnpm --filter @wakil/web typecheck && pnpm --filter @wakil/web build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(app)/projects/[projectId]"
git commit -m "feat(web): add truthful run panel with live SSE and cancellation"
```

---

## Task 11: End-to-end mobile coverage and screenshots

**Files:**
- Create: `apps/web/e2e/runs.spec.ts`
- Create baselines under: `apps/web/e2e/__screenshots__/mobile-390/` and `mobile-430/`

**Interfaces:**
- Consumes: the existing Playwright config, projects `mobile-390`/`mobile-430`, and the existing auth/seed helpers (mirror an existing spec such as the conversation flow).

- [ ] **Step 1: Read an existing e2e spec**

Open `apps/web/e2e/` and read one existing spec to reuse the sign-in/seed helpers, the two mobile projects, and the screenshot + overflow/44px assertion helpers. Match its structure exactly.

- [ ] **Step 2: Write the run E2E spec**

Create `apps/web/e2e/runs.spec.ts` covering, for both mobile projects: sign in, open a project, click "بدء التشغيل", wait for the ordered real events to appear, and assert the terminal "اكتمل" status. Assert `document.documentElement.scrollWidth <= window.innerWidth`, no console errors, and ≥44px targets for the start/cancel buttons. Add a cancellation case (start, click "إلغاء التشغيل", assert "أُلغي"). Capture screenshots named `run-queued`, `run-running`, `run-succeeded`, `run-cancelled` (and `run-reconnecting` by dropping the network for the SSE request, if the harness supports route abort). Follow the exact `expect(...).toHaveScreenshot(...)` pattern used by the existing spec.

Because the worker must process the run, the E2E run requires `pnpm dev` infra (PostgreSQL, Redis) and a running worker. Document in the spec header that these tests need the worker consuming the queue (the existing smoke/e2e harness or a spawned worker). If the current e2e harness does not start the worker, spawn it in the spec's global setup with `tsx apps/worker/src/index.ts`, or gate these tests behind the same infra the other integration-style e2e tests use.

- [ ] **Step 3: Generate and inspect baselines**

Run:
```bash
pnpm --filter @wakil/web exec playwright install chromium
pnpm test:e2e:visual -- --project=mobile-390 --update-snapshots
pnpm test:e2e:visual -- --project=mobile-430 --update-snapshots
```
Inspect each generated screenshot: Arabic labels not clipped, no horizontal overflow, run panel legible at both widths.

- [ ] **Step 4: Run the suites without update flags**

Run:
```bash
pnpm test:e2e -- --project=mobile-390
pnpm test:e2e -- --project=mobile-430
pnpm test:e2e:visual -- --project=mobile-390
pnpm test:e2e:visual -- --project=mobile-430
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e
git commit -m "test(web): add mobile e2e coverage and baselines for the run backbone"
```

---

## Task 12: Full milestone gate, changelog, and docs

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `.env.example` (only if a new env name is introduced — none is expected; verify)

- [ ] **Step 1: Run the complete gate**

From the repo root with healthy infra (`pnpm dev` infra up):

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration:migrations
pnpm test:integration
pnpm build
pnpm db:migrate
pnpm db:migrate
```
Expected: every command passes; the second `db:migrate` is a no-op idempotence check.

- [ ] **Step 2: Manual truthful-state check**

With `pnpm dev` running (web + worker), sign in, open a project, click "بدء التشغيل", and confirm: real ordered events appear, the status reaches "اكتمل", a second start while active is refused with the Arabic active-run message, cancel produces "أُلغي", and no assistant message/artifact/fake progress appears. Reload mid-run and confirm events replay from the server (Last-Event-ID) rather than restarting.

- [ ] **Step 3: Update the changelog**

Add a factual entry under `## Unreleased` in `CHANGELOG.md` describing the run backbone (runs/run_events schema and migration, BullMQ producer/consumer, bounded deterministic worker state machine with time/step limits and cooperative cancellation, SSE with Last-Event-ID replay, one-active-run-per-project enforcement, and the truthful mobile run panel). State the exact verification performed.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: record M2 Layer A run backbone in changelog after verification"
```

---

## Self-review notes

- **Spec coverage:** §2 architecture → Tasks 5-6, 9; §3 data model → Task 1; §4 state machine/limits/cancellation → Tasks 3, 5, 8; §5 SSE/replay → Task 9; §6 services/contracts → Tasks 2, 7, 8; §7 UI → Task 10; §8 testing → Tasks 1, 2, 4, 5, 7, 8, 11; §9 non-goals honored (no model/sandbox/artifact deps); §10 verification gate → Task 12.
- **Type consistency:** `RunJobData`, `RunEventPayload`, `RunStatus`, `RunStepKey`, `RUNS_QUEUE_NAME`, and `runEventChannel` are defined once in Task 2 and consumed unchanged by Tasks 4-10. `appendRunEvent`, `processRun`, `enqueueRun`, `startRun`, `cancelRun`, `getLatestRun`, `getRunEventsAfter`, `getRunForStream` names are used identically across producing and consuming tasks.
- **Known verification points for the implementer:** exact dependency versions (`bullmq`) must match what pnpm resolves for Node 22; the SSE route's relative import depth; whether `Button` exposes `variant` and the real design-token variable names; and whether the e2e harness already starts the worker. Each is flagged inline at its task.
