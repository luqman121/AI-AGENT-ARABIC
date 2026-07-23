# Wakil M0-M2 Implementation Plan

## Arabic agent workspace UI upgrade (2026-07-23)

- **Scope:** upgrade the existing production-oriented Wakil repository in place toward a polished
  Arabic-first, mobile-first agent workspace. This run preserves the current backend contracts:
  Auth.js, PostgreSQL/Drizzle, BullMQ, persisted run events/SSE, private S3/R2 artifacts, tenant
  authorization, admin dashboard, worker boundaries, and the current static-site artifact
  capability.
- **Architecture discovered:** pnpm/Turborepo monorepo; `apps/web` is Next.js 16 App Router with
  Arabic RTL root and server actions/API routes; `apps/worker` processes bounded planning/execution
  jobs; `packages/db` owns Drizzle schema/migrations for workspaces, projects, conversations,
  attachments, runs, run events, artifacts, usage, and audit; `packages/shared` owns Zod contracts
  and run event labels; `packages/ui` owns reusable RTL components and design tokens; private
  artifact previews/downloads are served via server-side signed URLs.
- **Reference audit:** Adorable (MIT), bolt.diy (MIT), Onlook (Apache-2.0), and Vibra Code
  (AGPL-3.0) were shallow-cloned outside the source tree under `/tmp/wakil-open-source-refs`. No
  source was copied. Details are recorded in `docs/OPEN_SOURCE_REFERENCES.md`.
- **Implementation slices:** (1) document open-source references and license boundaries, (2) add the
  missing presentation shortcut while keeping unsupported output types disabled, (3) enhance the
  project workspace into a desktop split layout with recent-project navigation and preview/result
  side panel while retaining the existing mobile-first chat/composer flow, and (4) add preview
  viewport controls for desktop/tablet/mobile without exposing object keys or changing signed URL
  authorization.
- **Assumptions:** broad PDF/spreadsheet/presentation/image/audio generation remains unavailable
  until backend capabilities exist; unsupported shortcuts stay disabled and labeled truthfully.
  Visual editing remains reference-only/feature-flag future work. No database migration is required.
- **Verification plan:** run formatting check, lint, strict typecheck, unit tests, production build,
  and the relevant Playwright/e2e smoke if services are available. Browser verification must inspect
  the Arabic home/workspace/preview at mobile and desktop sizes, with RTL/LTR boundaries and console
  errors checked.
- **Acceptance:** user can still create a real project/run from the Arabic composer, existing real
  run events remain the progress source, refresh restores project state, preview/download remain
  tenant-authorized, desktop users get practical navigation/preview structure, mobile users keep a
  full-width conversation and sticky composer, and open-source attribution is documented.

## M3 production release readiness (2026-07-18)

- **Scope:** prepare the existing web, worker, PostgreSQL, Redis, and private Cloudflare R2 system
  for production operations without deploying it or adding product functionality.
- **Files:** production environment and operations documentation; web and worker readiness code;
  environment schemas and focused tests; Docker build and Compose definitions; safe production smoke
  checks; CI release gates; root scripts; `GOAL.md`; and `CHANGELOG.md`.
- **Assumptions:** deployment-provider credentials and production infrastructure are not available
  to this run. The deployment target remains provider-neutral behind a managed TLS ingress. R2
  credentials already passed the cleanup-safe live lifecycle check and will not be printed.
- **Implementation slices:** (1) environment/security hardening, (2) dependency-aware web and worker
  health, graceful operation, and queue failure retention, (3) separate immutable web, worker, and
  migration containers, (4) CI preflight and safe smoke tooling, and (5) operator runbooks and
  release checklist.
- **Verification:** formatting, lint, strict typecheck, unit and integration tests, production
  build, migration validation against non-production PostgreSQL, storage tests, workflow validation,
  every production Docker target, Compose rendering, and local health/smoke checks.
- **Acceptance:** no production secret reaches source, logs, browser code, forked PRs, or container
  layers; only the web ingress is public; migrations run once; readiness accurately reflects
  dependencies; worker concurrency and failure retention are bounded; all local gates pass; and
  provider/manual checks are reported truthfully.
- **Non-goals:** deployment, production data changes, publishing, billing, new artifact types,
  domains, messaging integrations, teams, workspace switching, or any M4 feature.

**Status:** complete locally. The initial Repository and Git review found a clean branch with no
staged or uncommitted files. M3 added production-safe configuration validation, separate non-root
web/worker/migration images, dependency-aware readiness, graceful worker shutdown, bounded queue
failure retention, CI/release preflight gates, safe smoke tooling, and the complete operator runbook
set. No commit or deployment was performed.

**Verification evidence:** `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm test:integration:migrations`, `pnpm test:integration`, `pnpm build`, `pnpm storage:health`,
`pnpm audit --prod`, and `pnpm peers check` passed. All production Docker targets built, both
Compose files rendered, workflow YAML and actionlint checks passed, the dedicated migration image
applied migrations to local PostgreSQL, and the production web/worker container smoke test passed.
The real Mailpit magic-link journey passed six tests across `390x844` and `430x932`. Temporary
storage objects and smoke containers were cleaned up.

**Proposed commit sequence:** (1) production environment and dependency hardening, (2) web/worker
readiness and lifecycle hardening, (3) production containers and smoke tooling, (4) CI release
preflight gates, and (5) M3 operator documentation and verification evidence. These commits require
explicit user approval.

## Cloudflare R2 storage migration (2026-07-18)

- **Scope:** migrate the production object-storage configuration from Amazon S3 to Cloudflare R2
  while preserving the existing S3-compatible artifact API, private-object policy, PostgreSQL
  object-key metadata, and five-minute signed preview/download URLs.
- **Files:** update the shared artifact client and tests, web/worker environment validation,
  `.env.example`, `.gitignore`, Turbo environment pass-through, root/package scripts, development
  documentation, and this changelog. No database migration or application API change is required.
- **Assumptions:** AWS SDK v3 remains the protocol client because R2 implements the S3 API. Local
  development and browser tests continue using private MinIO on loopback. Wakil artifacts remain
  private and have no configured permanent public URL.
- **Verification:** focused artifact and environment tests must prove R2 endpoint signing and reject
  non-R2 remote endpoints; a cleanup-safe functional health command must validate the complete
  temporary object lifecycle; formatting, lint, typecheck, unit tests, and build must pass.
- **Acceptance:** uploads retain content type, disposition, length, and checksum metadata; downloads
  continue through short-lived signed URLs on the R2 S3 API domain; database rows continue storing
  object keys rather than URLs; no credentials or permanent public artifact URLs reach the browser.

**Status:** complete. Focused storage and environment tests, the complete local MinIO lifecycle
check, formatting, lint, typecheck, unit tests, and the production build pass. A live private
Cloudflare R2 lifecycle check also passed bucket connectivity, temporary upload, metadata and
checksum verification, direct read, unsigned-access denial, five-minute signed download, deletion,
and confirmed cleanup without exposing credentials or object keys.

## M2 Layer C completion evidence (2026-07-18)

The implemented slice follows the approved scope, security boundaries, limits, and acceptance
criteria recorded in `docs/superpowers/specs/2026-07-18-m2-layer-c-sandbox-artifacts-design.md`.

- **Delivered:** a separate execution run after the latest reviewed plan; bounded static Arabic site
  generation; fixed-command validation in a private, ephemeral, network-blocked Daytona sandbox;
  immutable private HTML/ZIP storage; and tenant-authorized five-minute preview/download links.
- **Boundaries:** provider SDKs remain inside `packages/model-router`, the Daytona SDK remains
  inside `packages/sandbox`, and generated HTML is never executed in the web or worker container.
  Publishing, external effects, and non-website artifact types remain out of scope.
- **Durability:** the additive `0003_fearless_the_stranger.sql` migration records linked planning
  and execution runs, sandbox accounting, artifact metadata, immutable object keys, checksums, and
  the truthful artifact lifecycle events used by SSE replay.
- **Verification:** formatting, lint, strict typecheck, package tests, 4/4 clean-database migration
  tests, 4 database integration tests, 4 worker integration tests, 27 web integration tests, and the
  production build passed. The additive migration was also applied successfully to the existing
  development database. The complete mobile non-visual suite passed 22/22 tests and the visual suite
  passed 24/24 tests, including the private artifact preview at `390x844` and `430x932`; both
  changed preview screenshots were inspected.
- **External-call boundary:** deterministic tests use fake model/sandbox boundaries and local
  S3-compatible storage. No paid production model or Daytona execution was used during the gate.

**Status:** M0, M1, M2 Layer A, M2 Layer B, and M2 Layer C are implemented and locally verified.

## M2 Layer B completion evidence (2026-07-18)

The implemented slice follows the approved scope, limits, and acceptance criteria recorded in
`docs/superpowers/specs/2026-07-18-m2-layer-b-live-agent-design.md`.

- **Delivered:** one bounded real model-backed Arabic planning turn, durable assistant streaming,
  one validated final assistant message, explicit failure states, and persisted accounting.
- **Files:** new `packages/model-router`, `packages/agent-core`, and `packages/skills`; focused
  run/message schema and migration changes; worker composition; shared contracts; conversation/run
  UI; provider configuration documentation; and unit, integration, eval, and mobile E2E coverage.
- **Assumptions:** Layer B produces a plan only; it has no tools, code execution, artifacts, or
  external side effects. Layer C starts only after the complete Layer B gate passes.
- **Provider routing:** OpenRouter is primary; direct OpenAI, Anthropic, and Google adapters are
  explicit alternatives. Model configuration remains environment-driven, credentials remain
  server-only, and there is no silent cross-provider fallback.
- **Verification:** formatting, lint, strict typecheck, package tests, 4/4 clean-database migration
  tests, 4 database integration tests, 3 worker integration tests, 25 web integration tests, the
  production build, 22/22 functional mobile tests, and 22/22 visual mobile tests passed. Changed run
  states were inspected at `390x844` and `430x932`.
- **Provider test boundary:** adapter contracts and the complete browser flow use deterministic
  local HTTP/SSE fixtures. No production provider credential or paid request was used.
- **Acceptance:** provider routing, validation, durable deltas and replay, cancellation, refusal and
  error mapping, terminal-message idempotency, and configured limits pass the Layer B gate.

**Status:** M0, M1, M2 Layer A, and M2 Layer B are implemented and locally verified. Layer C remains
out of scope and requires a separately approved milestone.

## M2 Layer A completion evidence (2026-07-18)

The completed implementation follows the reviewed task-by-task plan at
`docs/superpowers/plans/2026-07-18-m2-run-backbone.md`.

- **Delivered:** durable schema/events, shared contracts, BullMQ producer/consumer, bounded worker,
  tenant-safe run services/actions, SSE replay/live delivery, truthful mobile UI, and mobile E2E
  coverage.
- **Files:** changes remained within the files enumerated by Tasks 1-12 in the reviewed plan, plus
  factual source-of-truth and changelog updates.
- **Tests:** `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
  `pnpm test:integration:migrations`, `pnpm test:integration`, and `pnpm build`.
- **Assumptions:** ignored `.superpowers/` files are local execution state; Redis is transport only;
  the deterministic worker steps describe real persisted system work and never claim AI output.
- **Acceptance:** all Layer A behavior and gates in `GOAL.md` and the reviewed plan pass; no model,
  sandbox, artifact, or publishing behavior is added.
- **Verification:** all repository gates passed, both consecutive local migrations succeeded, the
  full non-visual suite passed 11/11 tests at each mobile viewport, and the visual suite passed
  16/16 tests across both viewports. Run and affected conversation screenshots were inspected.

## 1. Sources and current repository state

This plan is derived from the repository `AGENTS.md` and `GOAL.md`. There were no existing files
under `docs/` at the time of inspection.

### Repository inventory

| Area                           | Current state                                        |
| ------------------------------ | ---------------------------------------------------- |
| Product source                 | `AGENTS.md` and `GOAL.md` only                       |
| Product code                   | None                                                 |
| Product documentation          | No `docs/` directory before this plan                |
| Package manifests and lockfile | None                                                 |
| Apps and packages              | None                                                 |
| Infrastructure                 | None                                                 |
| Database schema and migrations | None                                                 |
| Tests and screenshots          | None                                                 |
| CI                             | None                                                 |
| Changelog                      | None                                                 |
| Git                            | The directory is not currently a Git worktree        |
| Repository-local tooling       | `.codex/skills/` exists, but is not application code |

### Local tool observations

| Tool     | Observed state                            | Required action before M0 verification                                   |
| -------- | ----------------------------------------- | ------------------------------------------------------------------------ |
| Node.js  | `v24.15.0`                                | Use Node.js 22 as locked by `AGENTS.md`                                  |
| Corepack | `0.34.6`                                  | Use it to install the package-manager version pinned in `package.json`   |
| pnpm     | No direct `pnpm` command found            | Activate the pinned version through Corepack                             |
| Docker   | CLI `29.4.3`; daemon was not reachable    | Start Docker Desktop/Engine before infrastructure and integration checks |
| Git      | CLI installed; repository not initialized | Initialize the worktree before M0 is declared complete                   |

The Docker inspection also could not read the user-level Docker configuration in the current
sandbox. No conclusion about registry credentials can be made from that error; local Compose
verification still requires a reachable Docker daemon.

## 2. Scope and sequencing

Implementation is split into two independently accepted milestones:

1. **M0 - Foundation:** establish a reproducible monorepo, buildable web and idle worker
   applications, local infrastructure, the database package and initial schema migration,
   environment validation, tests, CI, and one development startup command.
2. **M1 - Core Product Shell:** add authentication, tenant-safe project and conversation
   persistence, the Arabic RTL mobile product shell, real CRUD and search behavior, truthful
   non-execution states, PWA/offline foundations, and mobile end-to-end coverage.

M0 must pass its complete gate and receive a factual `CHANGELOG.md` entry before M1 work starts. M1
must not be folded into the M0 implementation run.

### Explicit non-goals for both milestones

- Agent planning or execution loops.
- Model SDKs, model routing behavior, prompts, or model fallback logic.
- BullMQ producers, consumers, run processing, or simulated progress.
- `runs`, `run_events`, SSE, or `Last-Event-ID` replay; these belong to M2.
- Generated-code execution or any in-process code execution.
- E2B, Daytona, or another sandbox implementation.
- Artifact generation, upload, signed download links, or preview execution.
- Billing checkout, credit purchase, or paid side effects.
- Production publishing, external messaging, or deployment automation.
- Placeholder provider/sandbox frameworks with no M0/M1 consumer.
- Fake plans, fake assistant messages, fake streaming, or timed progress UI.

`packages/agent-core`, `packages/model-router`, `packages/sandbox`, `packages/skills`, and
`templates/` therefore remain absent until a later milestone has a real consumer. The M0 worker is
an idle process boundary with readiness checks only; it does not import BullMQ.

## 3. Assumptions

1. M1 provisions one private personal workspace for each new user. The schema supports
   membership-based tenant checks, but workspace switching and team invitations are out of scope.
2. Email magic-link authentication is the deterministic local and CI sign-in path through Mailpit.
   Google OAuth is enabled only when both Google environment values are present; missing credentials
   must never cause a silent fallback.
3. The M1 create form accepts a required project title and a required natural- language request.
   Arabic leads the UI, but mixed Arabic/English content is not rejected.
4. Creating a project atomically creates its first conversation and first user-authored request
   message. M1 may append user-authored requirements, but it never fabricates an assistant response.
5. Project search covers project titles and saved user request text within the active workspace.
   PostgreSQL trigram indexes are used because Arabic substring search must not depend on an English
   text-search configuration.
6. Archive is a soft state. Archived projects are excluded from the default list and can be viewed
   through an explicit archive filter; permanent deletion and restore are not part of M1.
7. The preview and usage routes are authenticated, tenant-scoped shells. Before execution exists
   they show truthful empty states, not example artifacts, fabricated consumption, or fake metrics.
8. Offline support is conservative: static PWA shell assets and a dedicated offline page may be
   cached, but authenticated HTML, RSC payloads, API data, prompts, and project records are
   network-only. Offline mutations are not queued in M1.
9. Exact patch versions are resolved for Node.js 22 during M0 and committed in `package.json` and
   `pnpm-lock.yaml`. Locked major choices from `AGENTS.md` are not changed during version
   resolution.
10. Local-only service credentials may have explicit development defaults in Compose. `.env.example`
    contains variable names with blank values only, and a gitignored `.env.local` holds generated or
    user-supplied values.

## 4. Architecture and ownership boundaries

### M0/M1 directory target

```text
apps/
  web/                     # Next.js UI, Auth.js, server actions, route handlers
  worker/                  # Idle Node.js process boundary; no queue consumption
packages/
  db/                      # Drizzle schema, client, migration runner
  shared/                  # Zod request contracts and shared constants
  ui/                      # M1 design tokens and reusable RTL components
infra/
  docker-compose.yml       # PostgreSQL, Redis, MinIO, Mailpit
docs/
  design-system.md         # Added before M1 UI implementation
  development.md
  implementation-plan.md
scripts/
  dev.mjs                  # Cross-platform local bootstrap/orchestration
.github/workflows/ci.yml
```

The web and worker applications may import public exports from `packages/db` and `packages/shared`;
neither app may import implementation code from the other. Browser modules never import the database
client or server environment modules.

M1 request flow:

```text
Arabic form / Server Action
  -> shared Zod contract
  -> authenticated application service
  -> active-workspace membership check
  -> rate limit and idempotency enforcement
  -> Drizzle transaction
  -> tenant-scoped PostgreSQL rows + audit event
  -> revalidated Server Component UI
```

Business rules live in server-side feature services, not page components or route handlers. Every
project or conversation query takes `workspaceId` as an explicit input and verifies membership
before accessing a user-owned row.

## 5. Dependency plan

Only dependencies with an immediate M0/M1 consumer are added.

| Owner             | Runtime dependencies                                                                                                                                                | Development dependencies / purpose                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Root              | None                                                                                                                                                                | `turbo`, TypeScript, ESLint, Prettier, Vitest, coverage, shared script tooling                  |
| `apps/web`        | Next.js 16, React 19, Auth.js, `@auth/drizzle-adapter`, `nodemailer`, Zod, Drizzle exports, `ioredis`, Lucide icons                                                 | Next ESLint config, Playwright, `@axe-core/playwright`, React and Nodemailer types              |
| `apps/worker`     | Zod, database exports, `ioredis`, `pino` structured logger                                                                                                          | `tsx` for development, Vitest                                                                   |
| `packages/db`     | `drizzle-orm`, `postgres`, Zod                                                                                                                                      | `drizzle-kit`, Testcontainers PostgreSQL, Vitest                                                |
| `packages/shared` | Zod                                                                                                                                                                 | Vitest                                                                                          |
| `packages/ui`     | React peer dependency, the used Radix dialog/alert-dialog/dropdown/tabs/tooltip/slot primitives, `class-variance-authority`, `clsx`, `tailwind-merge`, Lucide icons | Tailwind CSS and its Next/PostCSS integration                                                   |
| PWA               | No broad caching framework in M1                                                                                                                                    | A small reviewed service worker and web manifest are sufficient for the restricted cache policy |

Provider SDKs, sandbox SDKs, BullMQ, payment SDKs, and S3 SDKs are deliberately absent. MinIO is
exercised as infrastructure in M0, but application storage code waits for the artifact milestone.

## 6. M0 - Foundation

### M0.1 Repository and shared toolchain

Create:

- Initialize a new Git worktree with `git init -b main`; adding or changing a remote is a separate
  explicit action once the destination is known.
- `.gitignore`, `.editorconfig`, `.npmrc`, `.nvmrc`, and `.node-version`.
- Root `package.json` with `engines.node` fixed to Node 22, an exact `packageManager` entry, and
  root scripts listed in the verification section.
- `pnpm-workspace.yaml`, `pnpm-lock.yaml`, and `turbo.json`.
- `tsconfig.base.json`, `eslint.config.mjs`, `prettier.config.mjs`, and `.prettierignore`.
- Root `vitest.workspace.ts` and common test setup only when consumed by at least two workspaces.
- `CHANGELOG.md` with an Unreleased section; add the factual M0 entry only after all M0 acceptance
  checks pass.

Tooling requirements:

- TypeScript strict mode, including `noUncheckedIndexedAccess`.
- ESLint covers TypeScript, React/Next, import boundaries, and unused code.
- Prettier formats source and documentation; formatting is checked in CI.
- Turbo tasks declare inputs, outputs, dependencies, and persistent development tasks without
  caching secrets or `.env*`.
- The lockfile is committed and CI uses `--frozen-lockfile`.

### M0.2 Buildable application boundaries

Create a minimal Next.js 16 App Router application in `apps/web`:

- `app/layout.tsx` establishes Arabic `lang="ar"` and `dir="rtl"` defaults.
- `app/api/health/route.ts` exposes liveness only and never returns environment values or dependency
  credentials.
- `src/env.ts` validates server environment at process start with Zod and returns redacted issue
  names only.
- The web package has independent `lint`, `typecheck`, `test`, and `build` tasks.
- M0 does not ship a provisional product dashboard or pretend the product flow is available.

Create a separate Node.js TypeScript application in `apps/worker`:

- `src/index.ts` validates environment, checks PostgreSQL and Redis readiness, emits
  structured/redacted lifecycle logs, and stays idle until shutdown.
- `src/env.ts` is server-only and fails fast without printing values.
- `src/readiness.ts` is independently testable.
- No queue, run, agent, model, or sandbox imports exist.

### M0.3 Local infrastructure and environment

Create `infra/docker-compose.yml` with pinned image versions and health checks:

- PostgreSQL 17 with a named volume.
- Redis 7 with persistence suitable for local development, but no claim that it stores durable
  product history.
- MinIO with a separate one-shot initialization service that creates a private local bucket and
  verifies public access is disabled.
- Mailpit with SMTP and browser UI ports.

Create `.env.example` with names only, grouped by owner:

- Database: `DATABASE_URL` and Compose PostgreSQL names.
- Redis: `REDIS_URL`.
- Storage: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and
  path-style configuration.
- Email: `SMTP_HOST`, `SMTP_PORT`, `EMAIL_FROM`.
- Auth for M1: `AUTH_SECRET`, `AUTH_URL`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET`.

`scripts/dev.mjs` provides the documented command path:

1. Confirm Node.js 22 and the Docker daemon.
2. Create a gitignored root `.env.local` with generated local-only values when absent, without
   overwriting user values, and inject the validated values into child processes explicitly rather
   than relying on app-directory discovery.
3. Run `docker compose up -d --wait`.
4. Apply committed migrations.
5. Start the web and idle worker through Turbo.
6. Forward termination signals cleanly. Infrastructure remains available until `pnpm dev:down` is
   run.

After the one-time `pnpm install`, the standard start command is exactly:

```bash
pnpm dev
```

Document service URLs, reset behavior, log locations, and troubleshooting in `docs/development.md`.
Do not print generated credential values in normal output.

### M0.4 Database package and initial migration

Create `packages/db` with:

- `drizzle.config.ts` reading validated server-only environment.
- A lazy PostgreSQL client factory so importing schemas has no connection side effect.
- Schema files grouped as `auth.ts`, `tenancy.ts`, `projects.ts`, `conversations.ts`,
  `idempotency.ts`, and `audit.ts`.
- A migration runner used by `pnpm db:migrate`.
- Generated SQL and Drizzle metadata under `packages/db/migrations/`.

The initial M0 migration lays down the data foundation consumed by M1, without exposing M1 UI or
auth flows:

| Table / object          | Required behavior                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| Auth.js tables          | UUID users plus accounts, sessions, and verification tokens with adapter-compatible uniqueness and cascades |
| `workspaces`            | UUID key, owner user reference, name, timestamps, one personal workspace per owner                          |
| `workspace_members`     | Composite workspace/user key, constrained role, membership indexes                                          |
| `projects`              | Workspace and creator references, title, active/archived state, archive timestamp, timestamps               |
| `conversations`         | Workspace/project ownership with composite foreign keys preventing cross-tenant linkage                     |
| `conversation_messages` | Workspace/conversation ownership, constrained M1 user role, text content, timestamps                        |
| `idempotency_keys`      | Workspace/user/operation/key uniqueness, request hash, minimal response metadata, expiry                    |
| `audit_logs`            | Append-only actor, workspace, action, target identifiers, safe metadata, timestamp                          |
| `pg_trgm` indexes       | Workspace-filtered Arabic substring search support for project title and request content                    |

Non-obvious indexes and constraints are documented beside the Drizzle schema. Prompts and message
bodies never appear in audit metadata, idempotency responses, or logs. UUIDs use database defaults.
Timestamps are stored with time zone.

Migration tests use temporary PostgreSQL 17 containers to prove both required paths:

1. **Clean database:** apply every migration, inspect expected constraints and indexes, and run
   representative inserts.
2. **Existing development database:** migrate, seed durable rows, run the migration command again,
   and prove data and row counts are unchanged.

Any later M1 schema correction requires a new committed migration and repeats both paths.
`drizzle-kit push` is not defined as a repository script.

### M0.5 CI and documentation

Create `.github/workflows/ci.yml` for pushes and pull requests:

- Ubuntu runner with Node.js 22, Corepack, pinned pnpm, and pnpm cache.
- Frozen dependency installation.
- `format:check`, `lint`, `typecheck`, unit tests, migration integration tests, and `build` as named
  steps.
- Test output and coverage artifacts on failure, with secrets excluded.
- Concurrency cancellation for superseded branch runs.

CI configuration must not contain provider, OAuth, storage, or production credentials. Local
development service values used in tests are explicitly non-production.

### M0 tests

| Test level  | Coverage                                                                                             |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| Unit        | Environment schemas accept valid shapes, reject missing/paired values, and redact values from errors |
| Unit        | Worker readiness distinguishes PostgreSQL/Redis failures without logging URLs                        |
| Unit        | Root TypeScript/Turbo config and package boundary checks                                             |
| Integration | PostgreSQL 17 clean migration and repeated existing-database migration                               |
| Integration | Schema tenant foreign keys, uniqueness, archive constraints, and private MinIO bucket initialization |
| Smoke       | Web liveness route, idle worker startup/shutdown, and all Compose health checks                      |

M0 contains no completed product screen, so no product-state screenshot is required. The Playwright
browser and mobile viewport projects are configured in M0 and first exercised against product states
in M1.

### M0 acceptance criteria

- A fresh clone using Node.js 22 can install with the frozen lockfile.
- `pnpm dev` starts healthy PostgreSQL, Redis, private MinIO, Mailpit, the web app, and the idle
  worker after the one-time install.
- Web and worker build independently and do not import each other.
- Missing or invalid environment values fail fast with names, never values.
- The committed migration succeeds against clean and already-migrated PostgreSQL 17 databases
  without losing seeded data.
- Redis is not the only store for any user-visible record.
- No provider, BullMQ, sandbox, billing, generated execution, or publishing code exists.
- The CI workflow executes the required gates on Node.js 22.
- `docs/development.md` documents the single startup path and clean shutdown.
- `CHANGELOG.md` contains a factual M0 entry after, not before, verification.

### Exact M0 verification commands

Run from the repository root in this order:

```bash
node --version
corepack enable
corepack install
pnpm --version
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration:migrations
pnpm build
docker compose -f infra/docker-compose.yml config --quiet
docker compose -f infra/docker-compose.yml up -d --wait
pnpm db:migrate
pnpm db:migrate
pnpm test:smoke
docker compose -f infra/docker-compose.yml ps
pnpm dev:down
git status --short
```

`node --version` must report `v22.x`. The second `pnpm db:migrate` is an explicit idempotence check,
not a substitute for the clean/existing Testcontainers test. The minimum milestone gate is the
unmodified set `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`; every additional
applicable command above must also pass before M0 is complete.

## 7. M1 - Core Product Shell

M1 starts only after M0 is accepted.

### M1.1 Design system before screens

Create `docs/design-system.md` and have it reviewed before composing product screens. It defines:

- Primitive, semantic, and component token layers.
- Dark neutral layered surfaces with a restrained violet primary accent and cyan reserved for
  meaningful status, avoiding one-hue and gradient-heavy screens.
- WCAG AA text, control, focus, disabled, destructive, and status contrast.
- Cairo Medium (`500`) for Arabic body text and Cairo Bold (`700`) for headings, self-hosted as
  WOFF2 with its license to avoid a runtime font request.
- Spacing, type, radius (cards at 8px or less), elevation, border, icon, motion, safe-area, and
  minimum 44px target tokens.
- RTL icon direction, logical spacing, focus, reduced-motion, and responsive behavior at the two
  acceptance viewports.

Implement the approved values once in `packages/ui/src/styles/tokens.css`, expose them to Tailwind,
and consume semantic tokens only from components and screens.

Build only immediately used components in `packages/ui`:

- Button, icon button with tooltip, text field, textarea, search field, and form error.
- Dialog, dropdown menu, confirmation dialog, tabs, and status banner using Radix primitives.
- App header, bottom navigation, page shell, project list item, message item, request composer,
  skeleton, empty state, and error state.
- Visually hidden text, focus ring, and LTR isolation helpers.

### M1.2 Auth.js and workspace provisioning

Create:

- `apps/web/src/auth.ts` for Auth.js configuration and the Drizzle adapter.
- `apps/web/app/api/auth/[...nextauth]/route.ts`.
- `apps/web/app/(auth)/sign-in/page.tsx` with Arabic email and conditional Google controls.
- `apps/web/src/server/auth/` for verified session access and personal-workspace provisioning.
- `apps/web/src/proxy.ts` for route protection compatible with Next.js 16.

Requirements:

- Email magic links use Mailpit locally; tokens are single-use and expiring.
- Google is shown only when both required values validate. The email path remains explicit; there is
  no cost/permission-changing fallback.
- First authenticated access provisions the personal workspace and owner membership transactionally
  and idempotently.
- Session-derived user identity is the only accepted actor identity. Client workspace or user IDs
  are never trusted as authorization.
- Auth and mutation logs contain IDs/action names only, not email links, cookies, OAuth tokens,
  prompts, or secrets.

### M1.3 Tenant-safe application services

Add shared Zod contracts under `packages/shared/src/contracts/` for:

- Create project and initial request.
- Rename project.
- Archive project.
- Search/filter projects.
- Append a user requirement message.
- Idempotency key headers/fields and normalized error codes.

Add feature services under `apps/web/src/server/features/`:

- `projects/queries.ts` for tenant-scoped list, open, archived filter, and search.
- `projects/mutations.ts` for transactional create, rename, and archive.
- `conversations/queries.ts` and `conversations/mutations.ts`.
- `idempotency/service.ts`, `audit/service.ts`, and `rate-limit/service.ts`.

All mutations validate with Zod, enforce membership and rate limits, accept an idempotency key, and
write safe audit metadata. The Redis rate limiter fails closed with a retryable Arabic error if its
decision cannot be obtained. Reusing the same key and request returns the first minimal result;
reusing it with a different request hash returns a conflict. Project creation commits the project,
conversation, first message, idempotency record, and audit row in one transaction.

Error results are stable application codes mapped to simple Arabic messages. They do not leak SQL,
stack traces, row existence across tenants, or technical provider details.

### M1.4 Arabic RTL mobile routes

Create these authenticated App Router routes:

| Route                           | Real M1 behavior                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `/`                             | Redirect by real session state to sign-in or the authenticated create/projects flow             |
| `/new`                          | Create a project from an Arabic title and request, then open its conversation                   |
| `/projects`                     | List active projects, search title/request text, show no-results, and switch to archived filter |
| `/projects/[projectId]`         | Open the saved conversation, append user requirements, rename, or archive                       |
| `/projects/[projectId]/preview` | Show a tenant-scoped truthful empty preview state; no iframe or artifact is invented            |
| `/usage`                        | Show an authenticated truthful no-execution/no-usage state without fabricated balances          |
| `/account`                      | Show real session identity, enabled sign-in methods, and sign-out                               |
| `/offline`                      | Static Arabic offline fallback without cached private project data                              |

Use Server Components for initial reads. Client components are limited to forms, dialogs,
connectivity, service-worker registration, and pending interaction state. Route-level `loading.tsx`,
`error.tsx`, and `not-found.tsx` cover real loading, recoverable failure, and inaccessible/missing
project behavior.

The bottom navigation exposes create, projects, usage, and account. The conversation composer is
fixed within the mobile shell without covering the latest message, respects the safe area, and
persists user text only. All code, IDs, email addresses, and URLs use explicit `dir="ltr"` isolation
where needed.

### M1.5 PWA and connectivity states

Create:

- `apps/web/app/manifest.ts`.
- Versioned PNG maskable/standard app icons and source/license metadata.
- `apps/web/public/sw.js` with a reviewed allowlist cache policy.
- A small service-worker registration component and connectivity state hook.

Requirements:

- Manifest starts in the authenticated app, uses standalone display, Arabic metadata, and theme
  colors from approved tokens.
- Service worker caches only the offline fallback and versioned public shell assets. It never caches
  authenticated navigation, RSC, auth, action, API, or project responses.
- Offline status comes from browser network events and failed real requests.
- Reconnecting is shown only while a real refresh/retry is pending after connectivity returns. No
  timer is presented as execution or recovery.
- Failed mutations stay visibly unsaved and are not silently queued.

### M1.6 Migrations and data verification

If implementation reveals a necessary schema change:

1. Edit the Drizzle schema.
2. Run `pnpm db:generate` to create a new migration.
3. Inspect generated SQL and migration metadata.
4. Run clean and existing-database migration tests.
5. Commit the migration; never use `drizzle-kit push`.

Tenant integration tests must use at least two users and two workspaces and prove that list, open,
search, rename, archive, preview, usage, and conversation access cannot cross the workspace
boundary, including guessed UUIDs.

### M1 tests

| Test level    | Coverage                                                                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Unit          | All shared Zod contracts, Arabic error mapping, connectivity reducer, and cache allowlist                                                 |
| Component     | RTL semantics, keyboard focus, dialog labels, 44px targets, LTR isolation, reduced motion                                                 |
| Integration   | Auth adapter schema, personal workspace provisioning, membership checks, CRUD/search/archive, message append, rate limiting, audit safety |
| Integration   | Create idempotency replay, conflicting payload, rollback, and concurrent duplicate requests                                               |
| Security      | Cross-tenant UUID access, unauthenticated actions, untrusted workspace IDs, log/audit redaction, private response cache headers           |
| E2E           | Mailpit email sign-in, create/open/rename/archive/search, append requirement, sign-out/sign-in persistence                                |
| E2E           | Empty, loading, error, offline, reconnecting, validation, no-results, archived, preview-empty, and usage-empty states                     |
| Accessibility | Axe checks, visible focus, semantic landmarks/labels, full keyboard flow, contrast review                                                 |
| PWA           | Manifest/installability, offline fallback, private-route network-only policy, no offline mutation replay                                  |

Google OAuth is verified with configuration/unit coverage in CI and a manual local smoke test when
real development credentials are available. CI must not contact Google or store OAuth credentials.

### Mobile screenshot and interaction matrix

Configure two named Playwright projects:

- `mobile-390`: Chromium viewport `390x844`.
- `mobile-430`: Chromium viewport `430x932`.

Capture and inspect each state below in both projects:

```text
auth-sign-in
auth-validation-error
create-default
create-validation-error
projects-empty
projects-populated
projects-search-results
projects-no-results
projects-archived
projects-loading
global-error
offline
reconnecting
conversation-default
conversation-rename-dialog
conversation-archive-confirmation
preview-empty
usage-empty
account
```

Store committed visual baselines under `apps/web/e2e/__screenshots__/<project>/` and ignored run
artifacts under `artifacts/playwright/`. Production components are used for every screenshot; test
fixtures only seed realistic tenant data or force an actual boundary failure. They are never shipped
as product data.

For every state, Playwright must assert:

- `document.documentElement.scrollWidth <= window.innerWidth`.
- No console error, uncaught page error, hydration warning, clipped Arabic label, or overlapping
  bounding boxes for fixed navigation/composer and content.
- Every interactive target is at least 44px in both dimensions.
- Logical RTL order and explicit LTR isolation are correct.

Additional interaction checks:

- Focus the composer and repeat overlap assertions with a reduced mobile viewport to approximate an
  open software keyboard.
- Emulate safe-area insets in the browser test harness.
- Run the keyboard-only create, rename, archive, search, navigation, and sign-out flows.
- Run with `prefers-reduced-motion: reduce` and assert nonessential transitions are disabled.
- Toggle Playwright offline mode, attempt a mutation, restore connectivity, and verify the UI
  reports the real unsaved/retry state without duplicate writes.

Headless Chromium cannot reproduce every native mobile keyboard implementation. A real-device
keyboard smoke check remains a documented residual check, but the automated reduced-viewport and
safe-area assertions are mandatory.

### M1 acceptance criteria

- A user can sign in through a Mailpit-delivered email link and, when configured, initiate Google
  OAuth.
- First sign-in creates exactly one personal workspace and owner membership even under retries.
- At both required viewports a user can create an Arabic project request, reopen its saved
  conversation, append requirements, rename it, archive it, and search without horizontal overflow
  or covered content.
- Every user-owned read and mutation is scoped by authenticated membership, with two-workspace
  negative tests proving isolation.
- Refresh and sign-out/sign-in preserve database-backed project and conversation state.
- Retried creates do not duplicate projects; conflicting idempotency reuse is visible and safe.
- Loading, empty, validation, error, offline, reconnecting, missing, archived, preview-empty, and
  usage-empty states are truthful and accessible.
- No fake assistant reply, execution plan, progress event, artifact, usage value, or preview is
  displayed.
- PWA metadata and offline fallback work without caching private application data.
- Both mobile screenshot suites pass visual review, console/hydration checks, accessibility checks,
  reduced motion, keyboard navigation, and layout assertions.
- All M0 gates still pass, and M1 integration/e2e suites pass.
- `CHANGELOG.md` contains a factual M1 entry only after verification.

### Exact M1 verification commands

Run from the repository root with healthy M0 services:

```bash
node --version
pnpm install --frozen-lockfile
docker compose -f infra/docker-compose.yml up -d --wait
pnpm db:migrate
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration:migrations
pnpm test:integration
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e -- --project=mobile-390
pnpm test:e2e -- --project=mobile-430
pnpm test:e2e:visual -- --project=mobile-390
pnpm test:e2e:visual -- --project=mobile-430
pnpm test:a11y
pnpm test:pwa
pnpm dev:down
git status --short
```

During schema authoring, and only after deliberate schema edits, run:

```bash
pnpm db:generate
pnpm test:integration:migrations
```

The Playwright install command is provisioning, not a substitute for either viewport suite. Visual
baselines are updated intentionally during implementation and then rerun without update flags for
acceptance.

## 8. Planned file changes by milestone

### M0

```text
.editorconfig
.env.example
.gitignore
.github/workflows/ci.yml
.node-version
.npmrc
.nvmrc
.prettierignore
CHANGELOG.md
apps/web/{app,src,tests,...}
apps/worker/{src,tests,...}
docs/development.md
eslint.config.mjs
infra/docker-compose.yml
package.json
packages/db/{src,migrations,tests,drizzle.config.ts,...}
pnpm-lock.yaml
pnpm-workspace.yaml
prettier.config.mjs
scripts/dev.mjs
tsconfig.base.json
turbo.json
vitest.workspace.ts
```

### M1

```text
apps/web/app/(auth)/sign-in/...
apps/web/app/(app)/new/...
apps/web/app/(app)/projects/...
apps/web/app/(app)/usage/...
apps/web/app/(app)/account/...
apps/web/app/page.tsx
apps/web/app/api/auth/[...nextauth]/route.ts
apps/web/app/manifest.ts
apps/web/app/offline/...
apps/web/e2e/...
apps/web/public/fonts/...
apps/web/public/icons/...
apps/web/public/sw.js
apps/web/src/auth.ts
apps/web/src/proxy.ts
apps/web/src/server/auth/...
apps/web/src/server/features/...
docs/design-system.md
packages/db/migrations/...          # only if M1 needs a deliberate schema change
packages/shared/src/contracts/...
packages/shared/{package.json,tsconfig.json,tests,...}
packages/ui/src/...
```

Exact generated Next.js configuration and package-local manifest files are part of their owning
directories. The file list may become more specific during a milestone, but expanding product scope
requires a plan revision and approval.

## 9. Risks and blocking conditions

### Known risks

- The installed Node.js version is 24, while the approved runtime is 22. M0 results are invalid
  until tests run on Node.js 22.
- The Docker daemon was unavailable during planning. PostgreSQL, Redis, MinIO, Mailpit,
  Testcontainers, and migration verification cannot pass until it runs.
- Auth.js/Next.js 16 compatibility must be confirmed when exact patch versions are pinned; version
  resolution must not silently change the locked framework.
- Arabic substring search through `pg_trgm` requires the extension to be allowed by the eventual
  PostgreSQL host. M0 local and CI tests cover PostgreSQL 17; production hosting is outside the
  current scope.
- Real Google OAuth smoke testing needs user-owned development credentials and a registered local
  callback URL. Its absence does not block the email auth path or conditional Google foundation.
- Native keyboard behavior varies across iOS and Android and is only approximated by desktop
  Playwright; a real-device smoke check remains necessary before a production release.
- The folder is not a Git repository and has no remote. The workflow can be built and inspected
  locally, but a real hosted CI run cannot be proven until a GitHub repository/remote and runner are
  available.

### Blocking questions

There are no unresolved product, architecture, security, or cost questions that block review of this
plan. The only immediate gate is explicit approval of this plan. Before M0 can be declared complete,
Node.js 22, a running Docker daemon, and a GitHub remote for hosted CI evidence must be available.

## 10. Approval gate

Approval authorizes M0 implementation only. After approval, implement and verify M0, update
`CHANGELOG.md`, and report its acceptance evidence. Stop again before starting M1 unless the user
explicitly authorizes the next milestone after reviewing the M0 result.
