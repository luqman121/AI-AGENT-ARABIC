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

Implement **M0 and M1 only**.

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

Do not implement the live agent, BullMQ run processing, model providers, generated-code execution,
external sandbox integration, billing checkout, or production publishing in this milestone.
Interfaces or schemas may be prepared only when required by M0/M1 and must not become speculative
frameworks.

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

- `docs/implementation-plan.md` maps M0/M1 to concrete files, tests, and acceptance criteria.
- The plan identifies unresolved blockers without changing locked decisions.
- No feature code is written before the plan is reviewed.
- After approval, M0 is implemented and verified before M1 begins.
