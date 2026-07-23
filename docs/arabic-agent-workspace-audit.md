# Arabic Agent Workspace Audit

Date: 2026-07-23  
Branch: `feat/arabic-agent-workspace-ui`

## Scope and decision

This audit maps the existing Wakil repository against the requested Arabic-first, mobile-first agent
workspace. The upgrade remains in the current repository and preserves the established backend. This
slice does not add unsupported generators, database migrations, a browser shell, a public storage
bucket, or a fake terminal. Visual editing remains a reference-only future capability behind a
feature flag.

## Architecture discovered

| Area           | Existing implementation                                                                            | Decision                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Monorepo       | pnpm 11 workspaces and Turborepo                                                                   | Preserve.                                                                            |
| Web            | Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS                                   | Reuse server components and limit client components to interaction.                  |
| UI             | `packages/ui`, Radix-based primitives, Wakil semantic design tokens, Cairo, RTL root               | Extend existing primitives; do not import reference-project UI code.                 |
| Authentication | Auth.js JWT sessions, credentials and optional Google OAuth                                        | Preserve both flows.                                                                 |
| Tenancy        | PostgreSQL workspace membership and tenant-scoped queries                                          | Preserve ownership checks for every project, run, attachment, preview, and artifact. |
| Data           | PostgreSQL 17 and Drizzle schema/migrations                                                        | No schema change required for the UI slice.                                          |
| Queue          | Redis and BullMQ, separate worker, reconciliation of queued runs                                   | Preserve worker boundary and server-side execution.                                  |
| Realtime       | Persisted `run_events`, Redis publication, SSE replay using `Last-Event-ID`, heartbeat and cleanup | Reuse; no timer-based progress.                                                      |
| Agent          | Bounded planning run followed by a separate execution run                                          | Preserve run kinds and limits.                                                       |
| Sandbox        | External Daytona adapter with private, network-blocked execution                                   | Preserve; generated code never runs in web/worker.                                   |
| Storage        | Private R2/S3-compatible storage with short-lived signed preview/download URLs                     | Preserve private object keys and server authorization.                               |
| Artifacts      | Current production capability is a validated static Arabic website plus ZIP                        | Keep unsupported output types disabled with truthful explanations.                   |
| Operations     | Separate immutable web, worker, and migration images; health/readiness; CI and release preflight   | No deployment in this task.                                                          |
| Tests          | Vitest unit/integration, Playwright mobile/a11y/PWA/journey/run coverage                           | Add focused tests for new UI behavior and rerun the full relevant gate.              |

## Existing product behavior to preserve

- Arabic root document uses `lang="ar"` and `dir="rtl"`.
- Cairo and semantic design tokens are already present.
- The new-project composer supports multiline input, file/image/audio attachments, previews,
  removal, validation, upload status, voice recording, idempotent project creation, and real upload
  APIs.
- Output shortcuts already write structured `OutputKind` metadata; unsupported types are disabled.
- Project creation persists the first conversation and starts a real planning run.
- The run UI consumes persisted events and maps them to truthful stage-based progress.
- SSE replay, duplicate-sequence protection, reconnection state, cancellation, refresh recovery, and
  automatic planning-to-execution handoff already exist.
- The workspace has a desktop three-column layout and a mobile full-width conversation with a sticky
  safe-area-aware composer.
- Preview and ZIP download use authorized, short-lived signed URLs.
- Preview includes desktop/tablet/mobile viewport modes and a sandboxed iframe on a separate origin.
- Existing project rename/archive/search/list flows and the admin dashboard remain functional.

## Gap assessment

### Safe to complete in this slice

1. Centralize new workspace copy and output-capability metadata instead of duplicating labels and
   disabled-state explanations.
2. Align the authenticated home headline and supporting text with the prompt-first product
   direction.
3. Show recent projects beneath the home composer using the existing tenant-scoped query.
4. Add clear mobile workspace navigation for conversation, preview, and activity without showing a
   desktop sidebar.
5. Add a jump-to-latest control and accessible scroll behavior to long conversations.
6. Improve preview controls with a stable copy-link action and full-screen behavior while keeping
   the signed artifact URL private.
7. Make artifact-result presentation generic and truthful for future kinds while rendering only
   capabilities returned by the backend.
8. Add focused unit/component/browser coverage for capability selection, mobile workspace
   navigation, direction boundaries, preview controls, and artifact action visibility.

### Existing backend capability required; do not fake

- PDF, spreadsheet, presentation, image, audio, web-application, archive, and generic-file
  generators.
- Production publishing, custom domains, or public share pages.
- GitHub linking, snapshots/checkpoints, visual element selection, code editing, shell input, or
  interactive terminal.
- Duplicate/delete project mutations that are not exposed by current APIs.
- True percentage progress or progress estimates not supplied by persisted events.

These remain hidden, disabled with an Arabic explanation, or behind a disabled feature flag until a
later backend milestone is approved.

## Security and licensing constraints

- No reference repository source is copied or adapted.
- Adorable and bolt.diy are MIT; Onlook is Apache-2.0; Vibra Code is AGPL-3.0.
- Vibra Code is used only to study mobile product behavior. No AGPL code, assets, styles, or
  component structure are transplanted.
- Reference clones stay under `/tmp/wakil-open-source-refs` and are not committed.
- Private object keys, provider credentials, prompts, stack traces, and internal infrastructure
  details stay server-side.
- No database reset, backend replacement, production deployment, or remote push occurs in this task.

## Implementation order

1. Foundations: messages/capabilities layer and feature flags.
2. Home: prompt-first copy and recent projects.
3. Workspace: mobile navigation and conversation scroll recovery.
4. Preview/results: full-screen/copy controls and generic truthful artifact presentation.
5. QA: focused tests, format, lint, typecheck, unit/integration tests, production build,
   Playwright/responsive checks where the local service harness is available.

## Acceptance for this slice

- Existing website flow remains real and tenant-authorized end to end.
- Unsupported output types remain visibly unavailable and are never submitted as working
  capabilities.
- Mobile users can move between conversation, preview, and activity without a persistent desktop
  sidebar.
- Preview controls work without exposing canonical storage object keys.
- Run progress remains based only on persisted backend events.
- RTL and explicit LTR boundaries remain correct.
- Existing auth, admin, queue, storage, database, Docker, and CI behavior is preserved.
- All modified behavior is covered by focused tests and the affected quality gates pass.
