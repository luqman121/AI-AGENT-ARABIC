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

M0, M1, M2 Layer A, M2 Layer B, and **M2 Layer C — Sandbox and Static Website Artifacts** are
complete. Layer C was approved by the user on 2026-07-18 and is specified in:

- `docs/superpowers/specs/2026-07-18-m2-layer-c-sandbox-artifacts-design.md`

**Status:** M2 Layer C is implemented and locally verified with Daytona as the sandbox provider and
private S3-compatible artifact storage. Publishing and non-website artifact types remain out of
scope.

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

### M2 Layer B — Live Agent and Model Router

- A bounded real agent turn that produces a concise Arabic execution plan.
- Versioned prompts and Arabic eval fixtures.
- OpenRouter primary plus direct OpenAI, Anthropic, and Google adapters behind
  `packages/model-router`.
- Durable assistant deltas, a final assistant message, replay, cancellation, and explicit errors.
- Time, attempt, token, event-size, and provider-spend limits.

### M2 Layer C — Sandbox and Static Website Artifacts

- A separate, explicitly started execution run linked to the reviewed Layer B plan.
- Bounded generation of one self-contained static Arabic website.
- Private, ephemeral Daytona execution with outbound networking blocked.
- Sandbox validation before private S3-compatible preview and ZIP upload.
- Tenant-authorized short-lived preview/download URLs and mobile execution states.

Do not implement PDF/spreadsheet/presentation/image generation, billing checkout, custom domains,
external messaging, or production publishing in this milestone.

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

- Complete the approved M2 Layer C static-website slice without expanding into publishing or other
  artifact types.
- Prove review-before-execution, sandbox isolation, private object storage, tenant authorization,
  signed URL expiry, cancellation, retry idempotency, and configured model/sandbox/artifact limits.
- Never execute generated content in the web or worker container and never expose control-plane
  credentials to the sandbox or browser.
- Pass formatting, lint, typecheck, unit, migration, integration, build, and both mobile Playwright
  gates before declaring the milestone complete.
- Update `CHANGELOG.md` only with behavior verified in this run.
