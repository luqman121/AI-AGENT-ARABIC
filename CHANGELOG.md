# Changelog

All notable changes to Wakil are documented in this file.

## Unreleased

### Arabic agent workspace UI

- Documented the inspected open-source reference repositories and license boundaries in
  `docs/OPEN_SOURCE_REFERENCES.md`. Adorable and bolt.diy were treated as MIT references, Onlook as
  Apache-2.0, and Vibra Code as AGPL-3.0 visual/product-behavior reference only; no external source
  code was copied into Wakil.
- Centralized the Arabic home/workspace/result copy, output capability metadata, and the disabled
  visual editing flag in a focused product layer. The authenticated prompt-first home now uses the
  requested Arabic headline and supporting copy, and shows real tenant-scoped recent projects.
- Kept `static_site` as the only enabled output shortcut. App, PDF, spreadsheet, presentation,
  image, audio, document, and other intents remain visible but disabled with a truthful
  backend-capability explanation; no fake generator or production progress was added.
- Added a compact mobile workspace switcher for conversation, the dedicated preview route, and real
  activity, plus jump-to-latest scroll management that stops forcing the user to the bottom while
  they are reviewing earlier messages. The desktop three-column workspace and sticky mobile composer
  remain intact.
- Restored the locked planning boundary: the initial planning run may start after project creation,
  but a succeeded plan now waits for the explicit `ابدأ إنشاء الموقع` action before execution. The
  existing SSE, cancellation, worker, sandbox, and artifact contracts remain unchanged.
- Rebuilt the preview controls as a focused client component with desktop/tablet/mobile viewport
  state, refresh, open-in-new-tab, stable authorized-link copying, browser full-screen, an explicit
  LTR address island, exact scrollable 390/768 stages, and the existing sandboxed, short-lived
  signed artifact URL. Authenticated preview links are labeled as private rather than public sharing
  links.
- Generalized artifact result labels, icons, ready copy, and preview-action visibility by actual
  artifact kind. Only the currently previewable static-site artifact exposes preview actions;
  unsupported future kinds do not claim a viewer exists.
- Added jsdom component coverage for recent projects, mobile workspace navigation, preview controls,
  stable link copying, LTR boundaries, sandbox restrictions, visual-editing flags, capability
  selection, and artifact action visibility. Updated Playwright flows for the Arabic home, mobile
  workspace navigation, recent projects, and preview controls.
- Verified `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (17 package tasks; web
  55/55, UI 28/28), and `pnpm build`. Integration and Playwright execution remain blocked on this
  host by a missing container runtime and `.env.local`; the suites were invoked and their
  prerequisite failures recorded. No database migration, remote push, or production deployment was
  performed.
- Promoted the direct-IP deployment safeguards that were previously server-local patches: an
  explicit `ALLOW_INSECURE_HTTP_PREVIEW` gate for HTTP previews, a browser-safe UUID fallback for
  HTTP origins, and a sign-in proxy rule that avoids stale-cookie redirect loops.

### Internal admin dashboard

- Added a secure, real-data operations dashboard inside the web app at `/admin` (no separate app, no
  admin framework) covering overview, users, projects, runs, usage, system health, and an audit log.
  Arabic RTL, mobile-first, built on the existing design tokens and Cairo typography.
- Introduced platform roles (`user`/`support`/`admin`) on `users`, distinct from the workspace
  tenancy role. `support` is read-only across every page; `admin` may perform mutations. The
  permission matrix lives once in `@wakil/shared` and is enforced **server-side** on layouts, pages,
  the system route handler, and every server action. Roles are read from the database per request
  (never trusted from the JWT), so a role change or suspension takes effect immediately. Suspended
  accounts are redirected to a public `/suspended` page.
- Added guarded admin mutations, each validated at the boundary, wrapped in a transaction with a
  redacted before/after audit row, and rate-limited: suspend/reactivate, change plan, change usage
  limit (integer micros), change role (admin only), cancel run (real cooperative cancel), retry run
  (a genuine new queued run re-enqueued via BullMQ — never a status flip), and archive project.
  Suspending or demoting the last active admin is refused. Permanent deletion is intentionally not
  implemented (object-storage cleanup semantics are undefined; documented in
  `docs/admin-dashboard.md`).
- Security: `password_hash` is never selected or serialized (the user detail query returns only a
  boolean presence flag); customer content is rendered as plain text; private attachments show
  metadata only; the `admin_audit_logs` ledger is append-only, cross-tenant, and redacts any
  password/hash/secret/token/key before persisting. Usage is aggregated directly from the `runs`
  table (integer micros, no floats, no double-counting) with supporting indexes; lists use
  server-side pagination and filters with no unbounded counts.
- Added migration `0008` (additive: `admin_audit_logs`, new `users` role/status/plan/limit columns,
  and read indexes on `users`/`runs`/`projects`), an `Admin link` on the account page for
  support/admin, and an optional `WORKER_HEALTH_URL` env var for the system page. Prepared (unused)
  env flags for future Langfuse/PostHog integration without adding any external dependency.
- Tests: added unit tests for the RBAC matrix, cost/format helpers, audit redaction, and input
  validation (`packages/shared`, run in `pnpm test`); integration specs for RBAC enforcement,
  `password_hash` never returned, audit creation/redaction/immutability, and cancel/retry/last-admin
  validation; and a Playwright admin spec. Verified `pnpm lint`, `pnpm typecheck`, `pnpm test`,
  `pnpm format:check`, and `pnpm build`. The integration and Playwright suites require Docker (and,
  for e2e, the full local stack) and were not run in this session.

### Automatic run flow and a calm working screen

- Made the run fully automatic: a succeeded planning run now continues straight into the website
  build with no manual "start execution" tap. The customer sends one idea and the flow proceeds to
  the final result on its own. The build remains a bounded, isolated sandbox run; cancellation stays
  available while work is in progress.
- Redesigned the project working screen around a calm "agent is working" state: a slowly rotating
  brain, one honest status line, and a short unified checklist (understand → plan → build →
  finalize) driven by the real persisted run events. The agent's thinking/plan text is hidden by
  default and shown only behind an opt-in "عرض التفاصيل" disclosure. Removed the boxy panel chrome.
- Replaced `execution-timeline` (which referenced undefined theme tokens and rendered largely
  unstyled) with a new `AgentWorking` component using the app's real design tokens; corrected the
  cancelled run to read as a neutral state rather than a failure.
- Polished the working screen to production quality without changing the flow: a smaller, "alive"
  brain (slow rotation + breathing + a soft glow), tighter one-handed mobile density, an
  event-driven status line (each label maps to a real event, with a graceful generic fallback), an
  honest "stage N of 4" indicator (no fake percentages), a three-state checklist with smooth colour
  transitions and an animated completion check, and the details turned into a premium accordion
  timeline (rotating chevron, height animation, capped plan text). Reworked the success state into a
  calm completion moment — an animated success mark, a branded cover, and one clear "معاينة النتيجة"
  action with download/share beneath — and made the bottom action show only Cancel while working.
  Added GPU-friendly, reduced-motion-aware motion primitives to the design system.
- Final craft pass on the working and success screens: tightened the type rhythm to the 16/14/12
  scale, replaced uniform gaps with optical spacing, and added first-class `radius-lg` and a soft
  premium shadow to the design tokens. The success card now uses that soft elevation and larger
  radius, a stylized (honest, non-screenshot) website placeholder, a single prominent "معاينة
  النتيجة" action, and a de-emphasized rebuild — lighter overall, with the creation-date noise
  removed. Fixed a clipped nested shadow on the result cover.
- Updated the Playwright run specs to the new UI and automatic flow. Note: the e2e harness
  configures no sandbox, so the automatic build stops at the sandbox-configuration step there;
  reaching it confirms planning succeeded. Verified `pnpm lint`, `pnpm typecheck`, `pnpm test`,
  `pnpm format:check`, and `pnpm build`; Playwright requires Docker (and a sandbox for the full
  build path) and was not run in this session.

### Email + password sign-in

- Replaced the email magic-link sign-in with direct email + password authentication backed by the
  local PostgreSQL database. Signing in with a new email creates the account and logs in
  immediately; a known email logs in when the password matches. There is no email round-trip.
- Added a nullable `password_hash` column to `users` (committed migration `0007`) storing a
  self-describing scrypt hash (`scrypt$cost$r$p$salt$hash`) produced with Node's built-in crypto —
  no new dependency. Passwords are verified in constant time and never logged or returned. OAuth
  accounts keep a null hash and cannot sign in with a password.
- Switched Auth.js to the Credentials provider with JWT sessions (required by that provider) while
  keeping the Drizzle adapter for user persistence and the optional Google provider intact. Account
  creation happens in the sign-in server action; the provider only verifies an existing hash.
- Rebuilt the sign-in screen with email and password fields, removed the now-unreachable check-email
  page, and updated the account screen and route guards accordingly.
- Updated Playwright helpers and specs to sign in with a password. Verified `pnpm lint`,
  `pnpm typecheck`, `pnpm test`, `pnpm format:check`, and `pnpm build`; Playwright/Testcontainers
  verification requires a Docker daemon that was not available in this session and was not run.

### Private attachments, durable execution, and mobile verification

- Added tenant-scoped private input attachments for project creation and follow-up messages, with
  content-signature validation, a 10 MiB per-file limit, an atomic six-file project limit, upload
  rate limiting, immutable storage keys, and orphan-object cleanup when database persistence fails.
- Added authorized attachment metadata/download APIs and kept attachment objects private in the
  S3-compatible store. Voice recording/transcription remains a truthful disabled affordance and is
  not claimed as implemented.
- Improved queued-run reconciliation, separated BullMQ blocking and producer Redis connections, and
  hardened planning-to-execution recovery and private artifact preview/download handling.
- Improved RTL/mobile behavior, dynamic composer clearance, 44 px touch targets, live regions, error
  announcements, keyboard focus, offline mutation feedback, and Blob URL cleanup.
- Added a strict service-worker allowlist and standalone offline fallback without caching
  authenticated HTML, RSC, API, project, prompt, or mutation responses.
- Verified the complete 46-check Playwright mobile gate at `390x844` and `430x932`, including
  accessibility, keyboard, offline, PWA, durable real-run, visual-state, and private artifact flows.

### Mobile create and agent-workspace redesign

- Redesigned the `/new` create screen to match a mobile agent-app reference layout: header with a
  profile link, a centered "مرحبًا {الاسم}، ماذا تريد أن تنشئ اليوم؟" greeting using the
  authenticated user's first name, a horizontally scrollable artifact-type pill row, and the request
  composer in normal page flow (no longer fixed above the bottom navigation on this screen).
- Added `ArtifactTypeScroller` (`@wakil/ui`) with `موقع ويب` and `أخرى` selectable — the only two
  intents that map to a real Wakil pipeline today — and the remaining pills (`تصميم`, `عرض تقديمي`,
  `PDF`, `Excel`, `صورة`, `بحث`) shown disabled with a "قريبًا" label for layout parity without
  claiming a generation capability that does not exist. No new backend artifact types were added;
  per `GOAL.md`, non-website generation stays out of scope until a separately approved milestone.
- Redesigned `RequestComposer` with a functional private attachment picker, a truthful disabled
  voice-input affordance, and a `sticky` prop so the same component serves both the fixed
  conversation composer and the in-flow create-screen composer.
- Reordered the project conversation so saved messages render before the run panel (the submitted
  request appears at the top, with live agent status directly beneath it), redesigned the run
  panel's execution log into an `ExecutionTimeline` with per-row status icons and an expand/collapse
  control for long histories (defaults open so existing saved-event assertions keep seeing every
  step), and added an inline `ArtifactResultCard` shown in the conversation once a website execution
  run succeeds, instead of only linking out to the separate preview page.
- Reduced the bottom navigation to three items (`المشاريع`, `إنشاء`, `الحساب`) with `إنشاء`
  centered, and moved the usage-history link into the account page.
- Verified `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check`, and `pnpm build` for the
  whole workspace, plus a full local `pnpm dev` + Playwright pass (mobile-390 and mobile-430) of the
  a11y, journey, offline-mutation, PWA, and real-run-execution specs. Fixed a pre-existing flaky
  `journey.spec.ts` locator (three elements already matched the same request substring — derived
  title, message bubble, and the Next.js route announcer — independent of this change).

### Single-composer create flow and auto-started planning run

- Replaced the two-field `/new` form (separate title and request) with the single request composer,
  matching the approved design system's documented "request composer is the visual hero of `/new`"
  rule. The server now derives a project title from the request text (word-boundary truncated) when
  the client sends none.
- The first planning run now starts automatically right after project creation instead of requiring
  a manual "إعداد الخطة" tap, so the conversation shows real, persisted execution progress
  immediately after the user submits their idea. Starting the website execution run remains an
  explicit, separate user action.
- Added a truthful "thinking" state to the run panel — an animated icon plus Arabic status text —
  shown only while a real run is queued or running with no persisted step yet; it is replaced by the
  real step checklist as soon as persisted events arrive. Respects `prefers-reduced-motion` via the
  existing global rule.
- Updated Playwright coverage (journey, run states, accessibility, offline-mutation specs) and added
  unit/integration coverage for the derived-title behavior. Verified `pnpm lint`, `pnpm typecheck`,
  `pnpm test`, `pnpm format:check`, and `pnpm build`; Playwright/Testcontainers verification
  requires a Docker daemon that was not available in this session and was not run.

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
