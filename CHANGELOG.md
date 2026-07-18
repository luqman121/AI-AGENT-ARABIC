# Changelog

All notable changes to Wakil are documented in this file.

## Unreleased

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
