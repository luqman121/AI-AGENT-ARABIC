# M2 Layer A — Run Backbone Design

**Status:** Approved for planning on 2026-07-18. Supersedes nothing; extends the M0/M1 foundation.

## 1. Context and scope

M0 (foundation) and M1 (auth, tenant-scoped projects/conversations, Arabic RTL mobile shell) are
implemented and verified. The next milestone, M2, as sketched in `GOAL.md` and `AGENTS.md`, bundles
several independent subsystems: the run lifecycle and realtime spine, the live agent and model
providers, and the sandbox plus artifact generation. Building all of them in one run violates
`AGENTS.md` ("do not implement all milestones in one run") and is too large for a single spec.

M2 is therefore decomposed into vertical slices:

- **Layer A — Run backbone (this spec):** `runs` + `run_events`, BullMQ producer/consumer, a bounded
  deterministic worker state machine, SSE delivery with `Last-Event-ID` replay, and truthful mobile
  run states. No model provider, no sandbox, no artifact.
- **Layer B — Live agent + model providers (future spec):** `packages/model-router`, a provider
  behind an adapter, the real agent state machine, assistant messages, token streaming as
  `run_events`.
- **Layer C — Sandbox + artifacts (future spec):** `packages/sandbox`, generated-code execution,
  artifact upload to private S3, signed downloads, sandboxed preview iframe.

This spec covers **Layer A only**. It establishes the highest-risk architectural spine (durable
events, replay, tenancy, limits, cancellation) and can be built and verified locally with no
provider credentials or external sandbox, and with no fake progress.

### Approved decisions

- The run performs **explicit real system steps**: a bounded deterministic state machine whose
  `run_events` truthfully describe the machine's own persisted state transitions. The UI shows those
  system events as "technical progress", never framed as AI output. No assistant reply, no artifact,
  no fabricated progress.
- **One active run per project** at a time, enforced at the database level.
- A run is **triggered from the conversation view** (`/projects/[projectId]`) via a "start run"
  action tied to the latest user request message, guarded by an idempotency key.

## 2. Architecture and boundaries

```text
Conversation view (/projects/[projectId])
  -> startRun server action (shared Zod contract)
  -> runs feature service (membership + rate limit + idempotency + one-active check)
  -> DB transaction: insert runs row (queued) + run.queued event (seq=1) + audit row
  -> enqueue BullMQ job { runId, workspaceId, projectId } on the "runs" queue
      (worker) consume job
        -> load run, transition running (persist run.started)
        -> bounded deterministic state machine
             -> for each step: persist run.step event FIRST, then publish to Redis run:{runId}
        -> transition terminal (succeeded | failed | cancelled), persist terminal event
  -> SSE endpoint replays persisted run_events (Last-Event-ID) then subscribes to Redis
```

Boundary rules (unchanged from `AGENTS.md`):

- `apps/web` and `apps/worker` never import each other's implementation code. They communicate only
  through typed DB records, the BullMQ job, and persisted events. The job payload type lives in
  `packages/shared`.
- Redis is transport and ephemeral coordination only. PostgreSQL is the durable source of truth.
  Reconnect and replay read from PostgreSQL alone, so a missed Redis publish never loses an event.
- Browser modules never import the database client or server env.

### New dependency

- `bullmq` — consumed immediately by both `apps/web` (producer) and `apps/worker` (consumer). This
  is the locked queue choice in `AGENTS.md`. No other new runtime dependency; SSE uses the native
  streaming `Response`.

## 3. Data model (new migration)

A single new committed migration adds two tables. Timestamps are `timestamptz`; UUIDs use database
defaults. Non-obvious constraints are documented beside the Drizzle schema.

### `runs`

| Column                | Type / constraint                                                                  |
| --------------------- | ---------------------------------------------------------------------------------- |
| `id`                  | uuid pk, default random                                                             |
| `workspace_id`        | uuid not null → `workspaces.id` on delete cascade                                   |
| `project_id`          | uuid not null                                                                       |
| `conversation_id`     | uuid not null                                                                       |
| `status`              | text not null, CHECK ∈ (`queued`,`running`,`succeeded`,`failed`,`cancelled`)        |
| `created_by`          | uuid not null → users                                                               |
| `error_code`          | text null (stable app error code on failure only)                                  |
| `step_count`          | integer not null default 0                                                          |
| `cancel_requested_at` | timestamptz null                                                                    |
| `created_at`          | timestamptz not null default now()                                                 |
| `started_at`          | timestamptz null                                                                    |
| `finished_at`         | timestamptz null                                                                    |

Constraints and indexes:

- Composite FK `(project_id, workspace_id)` → `projects (id, workspace_id)` on delete cascade, and
  `(conversation_id, workspace_id)` → `conversations (id, workspace_id)` on delete cascade. This
  prevents a run from crossing tenant or project ownership, mirroring the `conversations` pattern.
- **Partial unique index** `runs_one_active_per_project` on `(project_id)`
  `WHERE status IN ('queued','running')` — enforces one active run per project at the database level.
- Index `(workspace_id, project_id, created_at)` for tenant-scoped listing.
- `unique (id, workspace_id)` so `run_events` can reference the pair.

### `run_events` (append-only ledger)

| Column         | Type / constraint                                                                            |
| -------------- | -------------------------------------------------------------------------------------------- |
| `id`           | uuid pk, default random                                                                      |
| `workspace_id` | uuid not null → `workspaces.id` on delete cascade                                             |
| `run_id`       | uuid not null                                                                                 |
| `seq`          | integer not null (monotonic per-run sequence, starts at 1)                                    |
| `type`         | text not null, CHECK ∈ (`run.queued`,`run.started`,`run.step`,`run.succeeded`,`run.failed`,`run.cancelled`) |
| `data`         | jsonb not null default `'{}'` (safe metadata only: step index, label key — never request text or content) |
| `created_at`   | timestamptz not null default now()                                                           |

Constraints and indexes:

- Composite FK `(run_id, workspace_id)` → `runs (id, workspace_id)` on delete cascade.
- `unique (run_id, seq)` — the basis for `Last-Event-ID` replay.
- Index `(run_id, seq)` for ordered replay reads.
- Append-only: no update or delete paths in application code.

`seq` is assigned as `max(seq)+1` per run inside the same transaction that persists each event
(`run.queued` = 1 from web; subsequent events from the worker). Every event is persisted to
PostgreSQL before being published to Redis.

## 4. Worker state machine

- States: `queued → running → (succeeded | failed | cancelled)`.
- The `run.queued` event (`seq = 1`) is persisted by the web `startRun` transaction at creation, so
  replay from `seq > 0` includes the queued state even before the worker starts.
- On job receipt: load the run, verify it is still `queued`, transition to `running`, persist
  `run.started` (`seq = 2`).
- Execute a small fixed set of **real deterministic steps** (e.g., verify the request message exists
  and belongs to the run's tenant/project, record numbered progress steps, finalize). Each step
  persists a `run.step` event with a stable label key in `data`, then publishes it.
- **Layer A limits:** a wall-clock time limit (default 60s) and a step-count limit. Exceeding either
  transitions the run to `failed` with a stable `error_code`. Token, provider-spend, and
  sandbox-minute limits are out of scope for Layer A.
- **Cooperative cancellation:** the web `cancelRun` mutation sets `cancel_requested_at`. The worker
  checks it between steps and transitions to `cancelled`, persisting `run.cancelled`.
- On unexpected failure, the run transitions to `failed` with a stable `error_code`; no stack trace,
  SQL, or secret is persisted or logged.

## 5. SSE delivery and replay

- Endpoint: `GET /api/projects/[projectId]/runs/[runId]/events` — authenticated and tenant-scoped
  (membership verified; the run must belong to the session workspace and the given project).
- On connect: read the `Last-Event-ID` request header, replay persisted `run_events` with
  `seq > lastId` from PostgreSQL in order, then subscribe to the Redis channel `run:{runId}` for new
  events, de-duplicating by `seq`. Each SSE message carries its `seq` as the event id.
- On a terminal event (`run.succeeded` / `run.failed` / `run.cancelled`), the stream closes.
- Reconnect and replay are correct from PostgreSQL alone. Redis missing a publish never loses an
  event, because the client replays by `seq` on reconnect.

## 6. Services and contracts

- `packages/shared`: Zod contracts for `startRun` and `cancelRun`, the run-status enum, the
  run-event-type enum and event payload schema, new stable error codes, and the BullMQ job payload
  type.
- `apps/web/src/server/features/runs/`:
  - `mutations.ts` — `startRun` and `cancelRun`. Each validates with Zod, enforces membership and
    rate limits, accepts an idempotency key, writes safe audit metadata, and enforces the
    one-active-run rule. `startRun` commits the run row and audit row in one transaction, then
    enqueues the job. Idempotent replay of the same key returns the original `runId`; a changed
    payload returns a conflict; an existing active run returns a stable "run already active" app
    code.
  - `queries.ts` — tenant-scoped fetch of a run and its events.
  - Reuses the existing `idempotency`, `rate-limit`, and `audit` services.
- Error results are stable application codes mapped to simple Arabic messages. They never leak SQL,
  stack traces, provider details, or cross-tenant row existence.

## 7. UI (Arabic RTL, mobile)

- On `/projects/[projectId]`: a **"بدء التشغيل"** action tied to the latest user request message
  (client component). While a run is active, a live run panel driven by SSE shows the real events in
  order with Arabic labels mapped from the event type and step label key, a status chip, and a
  cancel button.
- Truthful states: `queued`, `running`, `succeeded`, `failed` (Arabic error message), `cancelled`,
  `reconnecting` (shown only while an SSE reconnect is actually pending), and `offline`. No assistant
  reply, no artifact, no fabricated progress. The `conversation_messages.role = 'user'` CHECK stays
  unchanged.
- Server Components for initial reads; client components only for the start/cancel actions, the SSE
  subscription, and pending/connectivity state. Route-level `loading`/`error` cover real states.

## 8. Testing

- **Unit:** state-machine transitions, `seq` assignment, time/step limit enforcement, cancellation,
  Arabic event-label mapping, all Zod contracts.
- **Integration (Testcontainers PostgreSQL + Redis):** create run → worker processes → events
  persisted in order; `Last-Event-ID` replay returns the correct tail; one-active-per-project
  conflict; idempotent start and conflicting-payload conflict; two-workspace tenant isolation
  (guessed UUIDs cannot read runs or events); cancellation path; timeout → `failed`. The new
  migration is tested against clean and existing databases.
- **E2E (Playwright `mobile-390` and `mobile-430`):** start a run, observe the real event stream,
  each terminal state, cancel, reconnecting (drop the SSE connection), and offline. Screenshots for
  `run-queued`, `run-running`, `run-succeeded`, `run-failed`, `run-cancelled`, and `run-reconnecting`
  in both projects, with the standard RTL, no-horizontal-overflow, and ≥44px assertions.

## 9. Explicit non-goals (Layer A)

Model providers and routing, the live agent, sandbox execution, artifacts/S3, signed downloads,
preview iframes, assistant messages, publishing, and token/provider-spend/sandbox-minute limits.
These belong to Layers B and C and must not be introduced here. `packages/model-router`,
`packages/sandbox`, `packages/agent-core`, `packages/skills`, and `templates/` remain absent.

## 10. Verification gate

The Layer A milestone is complete only when `pnpm lint`, `pnpm typecheck`, `pnpm test`, and
`pnpm build` pass, plus the applicable `pnpm format:check`, `pnpm test:integration:migrations`,
`pnpm test:integration`, and the mobile Playwright suites at `390x844` and `430x932`. `CHANGELOG.md`
gets a factual entry only after verification passes.
