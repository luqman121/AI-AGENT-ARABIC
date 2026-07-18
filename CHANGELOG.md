# Changelog

All notable changes to Wakil are documented in this file.

## Unreleased

### Single-composer create flow and auto-started planning run

- Replaced the two-field `/new` form (separate title and request) with the single request
  composer, matching the approved design system's documented "request composer is the visual
  hero of `/new`" rule. The server now derives a project title from the request text
  (word-boundary truncated) when the client sends none.
- The first planning run now starts automatically right after project creation instead of
  requiring a manual "إعداد الخطة" tap, so the conversation shows real, persisted execution
  progress immediately after the user submits their idea. Starting the website execution run
  remains an explicit, separate user action.
- Added a truthful "thinking" state to the run panel — an animated icon plus Arabic status text —
  shown only while a real run is queued or running with no persisted step yet; it is replaced by
  the real step checklist as soon as persisted events arrive. Respects `prefers-reduced-motion`
  via the existing global rule.
- Updated Playwright coverage (journey, run states, accessibility, offline-mutation specs) and
  added unit/integration coverage for the derived-title behavior. Verified `pnpm lint`,
  `pnpm typecheck`, `pnpm test`, `pnpm format:check`, and `pnpm build`; Playwright/Testcontainers
  verification requires a Docker daemon that was not available in this session and was not run.

### M3 — Production Release Readiness

- Added separate digest-pinned, non-root production images for the Next.js web service, BullMQ
  worker, and one-shot Drizzle migration job, plus a private production Compose topology and
  credential-safe build context.
- Added dependency-aware web and worker readiness endpoints, structured redacted logging, bounded
  worker concurrency and failed-job retention, and graceful worker shutdown for `SIGTERM` and
  `SIGINT`.
- Hardened runtime environment validation for PostgreSQL, Redis, SMTP, authentication callbacks,
  Cloudflare R2, worker limits, and service-specific configuration without exposing values to the
  browser or logs.
- Expanded CI with formatting, lint, typecheck, unit/integration, production build, Compose,
  container, dependency-audit, and workflow gates. Added a protected manual release-preflight
  workflow that performs no migration or deployment.
- Added safe production smoke tooling and operator runbooks for environment inventory, deployment,
  architecture, migrations, Redis, monitoring and alerts, backup/restore, rollback, security,
  mobile-device checks, and the release procedure.
- Verified all local quality, integration, storage, workflow, Compose, image-build, migration, and
  container smoke gates. The real email sign-in journey passed at both required mobile viewports. No
  production deployment or provider-side configuration was performed.

### Cloudflare R2 storage migration

- Switched production artifact configuration from Amazon S3 endpoints to Cloudflare R2's
  S3-compatible API while retaining AWS SDK v3, the existing storage abstraction, object keys, and
  application APIs.
- Kept artifacts private and preserved exact upload content metadata plus tenant-authorized,
  five-minute signed preview and ZIP download URLs.
- Added fail-fast R2 endpoint, `auto` region, and path-style validation while retaining loopback
  MinIO for local development and tests.
- Added focused R2 signing/upload tests and a cleanup-safe `pnpm storage:health` lifecycle check for
  upload, metadata, read, private access, signed download, deletion, and cleanup. Corrected Git and
  Prettier ignores so artifact package source is tracked and formatted normally.
- Verified the complete temporary-object lifecycle against the configured private Cloudflare R2
  bucket, including five-minute presigning, unsigned-access denial, deletion, and confirmed cleanup.

### M2 Layer C — Sandbox and Static Website Artifacts

Added a review-before-execution slice that generates, validates, previews, and downloads one
self-contained static Arabic website without publishing or running generated content in Wakil's
control plane.

- **Explicit execution:** successful planning runs now offer a separate execution action linked to
  the reviewed plan. A newer user request makes the plan stale and requires review again.
- **Bounded generation:** added the versioned `static-site.ar.v1` prompt and a size-, token-, cost-,
  attempt-, cancellation-, and deadline-bounded agent turn. Generated HTML is schema-checked,
  rejects remote assets and unsafe embeds/forms, and receives a restrictive CSP.
- **Sandbox boundary:** added `packages/sandbox` with a Daytona adapter that creates private,
  ephemeral sandboxes with outbound networking blocked, uploads only the generated HTML and a
  trusted validator, runs one fixed command, and deletes the sandbox with a TTL backstop.
- **Private artifacts:** added `packages/artifacts` to create checksummed HTML previews and ZIP
  downloads, store them under tenant/run/artifact-scoped immutable keys in private S3-compatible
  storage, and issue tenant-authorized five-minute signed URLs.
- **Durable lifecycle:** added the `0003_fearless_the_stranger.sql` migration for linked execution
  runs, sandbox accounting, artifact records, and truthful sandbox/artifact events. Artifact upload,
  assistant completion, accounting, and terminal run state are committed transactionally.
- **Mobile preview:** added truthful Arabic execution states plus a separate-origin preview in an
  iframe sandbox without same-origin privilege, with explicit ZIP download and preview controls.
- **Verification:** formatting, lint, strict typecheck, unit tests, 4/4 clean migration tests, 4
  database integration tests, 4 worker integration tests, 27 web integration tests, and the
  production build passed. The migration applied successfully to the existing development database.
  The 22/22 non-visual and 24/24 visual Playwright suites passed at `390x844` and `430x932`,
  including the new private artifact preview, and both preview screenshots were inspected. No paid
  production model or Daytona request was made during verification.

### M2 Layer B — Live Agent and Model Router

Added one bounded, real model-backed Arabic planning turn without generated-code execution, sandbox
access, artifacts, paid side effects, or publishing.

- **Provider boundary:** added `packages/model-router` with normalized streaming adapters for
  OpenRouter (primary), OpenAI Responses, Anthropic Messages, and Google GenerateContent. Provider
  selection, model IDs, endpoints, and credentials are server-only configuration; cross-provider
  fallback is never silent.
- **Bounded agent:** added `packages/agent-core` and the versioned `planning.ar.v1` prompt/eval
  suite in `packages/skills`, with cancellation, deadline, attempt, output-token, output-character,
  delta-event, and spend limits plus schema validation for concise numbered Arabic plans.
- **Durable execution:** the worker loads the tenant-scoped user request, persists each assistant
  delta before publication, and transactionally saves exactly one final assistant message,
  accounting fields, and terminal events. Retries cannot duplicate a terminal result.
- **Schema and accounting:** added the committed `0002_mute_catseye.sql` migration for assistant
  messages, tenant-preserving run/message references, provider attempts, prompt/completion tokens,
  provider cost, model configuration key, prompt version, and live-agent event types.
- **Truthful mobile UI:** conversation messages distinguish user and assistant roles; the run panel
  renders persisted streamed text and explicit Arabic refusal, provider-failure, limit,
  cancellation, reconnecting, and completed states at both required mobile viewports.
- **Verification:** Node.js 22.23.1; formatting, lint, strict typecheck, package tests, 4/4
  migration tests, 4 database integration tests, 3 worker integration tests, 25 web integration
  tests, production build, 22/22 functional Playwright tests, and 22/22 visual Playwright tests
  passed. Changed run screenshots at `390x844` and `430x932` were inspected. Provider contract tests
  used a local HTTP/SSE server; no production provider request or credential was used.

### M2 Layer A — Run Backbone

Added the durable, tenant-scoped execution backbone without model providers, generated code, sandbox
execution, artifacts, or fabricated AI progress.

- **Durable lifecycle:** `runs` and append-only `run_events` tables with tenant-preserving foreign
  keys, ordered per-run sequence numbers, status constraints, and a database-enforced one-active-run
  limit per project.
- **Typed queue boundary:** shared Zod run/action/event contracts and BullMQ job payloads; the web
  producer deduplicates by `runId`, and enqueue retries recover safely from a committed run whose
  first Redis delivery failed.
- **Bounded worker:** the separate worker consumes the runs queue, executes three real deterministic
  system checks under step/time limits, persists every event before Redis publication, and supports
  cooperative cancellation.
- **Tenant-safe web flow:** authenticated, rate-limited, idempotent start/cancel actions; foreign
  project/run IDs return the same not-found result and never reveal row existence.
- **Replayable realtime:** a Node.js SSE route validates IDs, disables caching/buffering, supports
  `Last-Event-ID`, buffers subscribe/replay races, de-duplicates by sequence, and closes on terminal
  events. PostgreSQL remains the replay source of truth.
- **Truthful Arabic mobile UI:** an RTL run panel shows only persisted technical events, including
  queued, running, reconnecting, cancellation-requested, cancelled, failed, and succeeded states. It
  explicitly states that Layer A does not generate AI content.
- **Verification:** Node.js 22.23.1; formatting, lint, strict typecheck, unit tests, 4 migration
  integration tests, 25 web integration tests, 3 worker integration tests, production build, two
  consecutive local migrations, 11/11 non-visual Playwright tests at each mobile viewport, and 16/16
  visual tests across `390x844` and `430x932`. All changed primary screenshots were inspected.

### Verification maintenance

- Fixed the database integration-test command so the root-level migration suite is collected by the
  full `pnpm test:integration` gate.
- Excluded local `.superpowers/` execution state from repository formatting and formatted the
  committed M2 planning documents.

### M1 — Core Product Shell

Added the Arabic-first, mobile-first authenticated product shell on top of the M0 foundation.
Verified on Node.js 22.23.1 with the full gate (format, lint, typecheck, unit, migration and service
integration, build, smoke) plus Playwright functional, visual, accessibility, and PWA suites at
`390x844` and `430x932`.

- **Authentication**: Auth.js with email magic-link sign-in through Mailpit and conditional Google
  OAuth (shown only when both `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` validate; a half-configured pair
  fails startup). Database sessions via the Drizzle adapter; sign-out; cookie-based route proxy with
  real authorization enforced server-side in the `(app)` layout.
- **Workspace provisioning**: first authenticated access creates exactly one personal workspace and
  owner membership transactionally and idempotently (race-safe under concurrent retries).
- **Tenant-safe services** (`apps/web/src/server/features/`): project queries/mutations,
  conversation queries/mutations, idempotency, rate limiting, and audit logging. Every user-owned
  query is scoped to the session-derived `workspaceId`; client-supplied IDs are never trusted.
  Project creation commits project + conversation + first message + idempotency record + audit row
  in one transaction. Idempotency replays the original result for a repeated key, conflicts on a
  changed payload, and prevents duplicate creates under concurrency. Rate limiting fails closed with
  a retryable Arabic error when Redis is unavailable. Audit metadata rejects prompt/title/message
  keys.
- **Shared contracts** (`packages/shared`): Zod schemas for create/rename/archive/search/append and
  idempotency keys mirroring the database CHECK constraints, stable app error codes, and an
  Arabic-only error message map.
- **Design system** (`docs/design-system.md`) and **`packages/ui`**: dark layered surfaces, a
  restrained violet accent with cyan reserved for status, self-hosted Cairo WOFF2 (SIL OFL), and ~25
  accessible RTL components (buttons, fields, search, dialog/confirm, dropdown, segmented filter,
  app header, bottom navigation, page shell, project list item, message item, the signature request
  composer, skeleton, empty/error states, status banner, toast, LTR and visually-hidden helpers).
  WCAG AA contrast, visible focus, ≥44px targets, and reduced-motion support.
- **Routes** (App Router): `/`, `/sign-in` (+ check-email), `/new`, `/projects`,
  `/projects/[projectId]`, `/projects/[projectId]/preview`, `/usage`, `/account`, `/offline`, with
  `loading`/`error`/`not-found` states. Server Components for reads; client components only for
  forms, dialogs, pending state, connectivity, and service-worker registration.
- **Truthful states**: loading, empty, populated, search results, no results, archived, validation
  and recoverable errors, missing/inaccessible projects, offline, reconnecting, unsaved failed
  mutations, and truthful empty preview/usage — no fake assistant replies, plans, progress, or
  metrics.
- **PWA**: Arabic manifest, standard + maskable icons, and a service worker with a strict cache
  allowlist (offline fallback + versioned public shell only; never authenticated pages, RSC, auth,
  actions, API, or project data; non-GET never intercepted; no offline mutation replay).
- **Infra fix**: disabled Mailpit reverse-DNS stall so magic-link email delivery is fast locally.
- **Schema**: `accounts` OAuth token columns renamed to the snake_case identifiers the Auth.js
  Drizzle adapter expects; no new migration required (M0 migration already covers all M1 tables).
