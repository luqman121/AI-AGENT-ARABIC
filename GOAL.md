# Wakil Product Goal

## Main Goal

Create an Arabic-first, Gulf-focused, mobile-first PWA that lets a non-technical user describe what
they need and receive a real, validated artifact from their phone while seeing honest execution
progress.

Wakil is not a desktop IDE translated into Arabic. It is a phone-native creation experience for
websites and useful files.

## Target User

- A small-business owner who needs a website or business file without hiring a developer.
- A creator who needs a polished PDF or presentation.
- An employee who needs a structured spreadsheet or report.
- A beginner who wants a simple page or web game from a natural-language request.

## North-star Flow

1. Open Wakil on a phone.
2. Sign in and describe the desired result in simple Arabic.
3. Review a short plan.
4. Start the run and see truthful, understandable progress.
5. Preview the result.
6. Download it or explicitly approve publishing.
7. Return later and find the project, history, artifacts, and usage preserved.

## MVP Definition of Done

A new user can open Wakil at `390x844` or `430x932`, sign in, create a project in Arabic, request a
website, see a short plan and persisted execution events, receive a working preview and valid ZIP,
inspect usage, and reopen the saved project later. Generated code runs only in an isolated external
sandbox.

## Current Milestone Scope

M0 and M1 are complete. Implement **M2 Layer A — Run Backbone only**, as approved by the user on
2026-07-18 and specified in:

- `docs/superpowers/specs/2026-07-18-m2-run-backbone-design.md`
- `docs/superpowers/plans/2026-07-18-m2-run-backbone.md`

**Status:** M2 Layer A was completed and locally verified on 2026-07-18. Any Layer B or Layer C work
requires a new reviewed scope.

### M0 — Foundation

- pnpm/Turborepo monorepo structure.
- Next.js web app and separate worker app.
- Shared TypeScript, lint, formatting, typecheck, test, and build configuration.
- Docker Compose for PostgreSQL, Redis, object-storage development service, and local email testing.
- Drizzle schema package, migrations, and environment validation.
- CI that runs lint, typecheck, tests, and build.
- One documented command path to start the development environment.

### M1 — Core Product Shell

- Auth.js email and Google sign-in foundation.
- Workspace-scoped projects and conversations persisted in PostgreSQL.
- Arabic RTL mobile screens for create, conversation shell, projects, preview shell, usage, and
  account.
- Real database-backed create, list, open, rename, archive, and search flows.
- Loading, empty, error, and offline/reconnecting UI states.
- Wakil design tokens and reusable mobile UI components.
- Playwright coverage and screenshots at `390x844` and `430x932`.

### M2 Layer A — Run Backbone

- Durable, tenant-scoped `runs` and append-only `run_events` records.
- BullMQ producer and worker consumer with a bounded deterministic state machine.
- Persist events before Redis publication; PostgreSQL remains the replay source of truth.
- SSE delivery with `Last-Event-ID` replay and tenant-safe authorization.
- Idempotent start, cooperative cancellation, and one active run per project.
- Truthful Arabic mobile run states and Playwright coverage at `390x844` and `430x932`.

Do not implement the live AI agent, model providers, assistant responses, generated-code execution,
external sandbox integration, artifacts, billing checkout, or production publishing in this
milestone. Do not present deterministic system steps as AI output.

## Locked Architecture

- Next.js 16 + React 19 + TypeScript.
- pnpm workspaces + Turborepo.
- PostgreSQL + Drizzle as durable source of truth.
- Redis + BullMQ for future long-running jobs.
- Persisted `run_events` + SSE with `Last-Event-ID` replay in M2.
- Private S3-compatible storage with signed links.
- Separate worker and isolated external E2B/Daytona sandbox.
- Provider and sandbox adapters; configurable model routing.
- Built-in, reviewed, permission-scoped product skills.

## Design Goal

The experience should feel designed by a strong Gulf product team: calm, useful, tactile, and
unmistakably mobile. Arabic content and task creation lead the hierarchy. Dark layered surfaces,
restrained violet/blue/cyan accents, subtle depth, Cairo typography, real product states, and
intentional motion should create a premium identity without generic AI-template styling.

## Priority Order

1. Security and tenant isolation.
2. Correctness and truthful state.
3. Mobile Arabic usability.
4. Reliability and recoverability.
5. Accessibility and performance.
6. Visual polish.
7. Additional features.

## Success Criteria for This Codex Run

- Complete the approved M2 Layer A implementation plan without expanding into Layers B or C.
- Prove tenant isolation, idempotent start, one-active-run enforcement, ordered durable events,
  replay, cancellation, and bounded worker execution with tests.
- Show only persisted, truthful technical progress in the Arabic RTL mobile UI.
- Pass formatting, lint, typecheck, unit, migration, integration, build, and both mobile Playwright
  gates before declaring the milestone complete.
- Update `CHANGELOG.md` only with behavior verified in this run.
