# Wakil Repository Instructions

## 1. Mission

Build **Wakil (وكيل)**: an Arabic-first, Gulf-focused, mobile-first PWA where a non-technical user
describes a project and an AI agent produces a real, downloadable result such as a website, PDF,
spreadsheet, presentation, image, or simple web game.

The primary product flow is:

1. User describes the desired result in Arabic.
2. Wakil presents a short, understandable plan.
3. The user sees truthful execution progress.
4. Wakil produces a validated preview and artifact.
5. The user downloads or explicitly publishes it.

Read `GOAL.md` before planning or editing. Treat approved documents in `docs/` as the product source
of truth.

## 2. Communication and Decision Rules

- Speak to the user in concise Arabic unless they request another language.
- Keep code, identifiers, filenames, commands, URLs, logs, and commit messages in English.
- Do not ask again about decisions already established in `GOAL.md` or `docs/`.
- Ask a question only when the answer materially changes product scope, architecture, security,
  cost, or irreversible work.
- State assumptions before implementing when a small ambiguity can be handled safely.
- Lead progress reports with the outcome, then verification, then remaining risks.
- Never claim a feature works without running the relevant verification.

## 3. Execution Workflow

For every milestone:

1. Inspect the repository and relevant source-of-truth documents.
2. Create or update `docs/implementation-plan.md` with scope, files, tests, assumptions, and
   acceptance criteria.
3. Implement the smallest coherent vertical slice.
4. Verify it with the required commands and mobile UI checks.
5. Update `CHANGELOG.md` with a short factual entry.
6. Report completed acceptance criteria, failures, and remaining risks.

Do not implement all milestones in one run. The current allowed scope is defined in `GOAL.md`. Stop
when that milestone is complete.

Do not rewrite working code or restructure the repository unless the current milestone requires it
and the benefit is documented.

Use parallel agents only for truly independent investigation or QA. Do not allow multiple agents to
edit overlapping files.

## 4. Approved Stack

- Package manager: pnpm
- Monorepo: pnpm workspaces + Turborepo
- Runtime: Node.js 22
- Web: Next.js 16 App Router, React 19, TypeScript strict mode
- Styling: Tailwind CSS
- UI primitives: Radix UI / shadcn/ui, customized to Wakil's design system
- Validation: Zod at every external boundary
- Database: PostgreSQL 17+
- ORM: Drizzle ORM + drizzle-kit
- Authentication: Auth.js with email and Google OAuth
- Queue: Redis 7+ + BullMQ
- Realtime progress: persisted run events delivered through SSE
- Storage: private S3-compatible object storage with short-lived signed URLs
- Testing: Vitest, Playwright, and Testcontainers where integration coverage is needed
- Observability: structured logs, OpenTelemetry, and Sentry adapters

Do not replace an approved technology without documenting the reason and obtaining user approval.

## 5. Repository Boundaries

Use this target structure:

```text
apps/
  web/                 # Next.js PWA, API, auth, SSE
  worker/              # BullMQ jobs and agent execution
packages/
  agent-core/          # State machine, planner, tool contracts, policies
  model-router/        # Provider adapters and capability routing
  sandbox/             # E2B/Daytona adapter boundary
  skills/              # Built-in, reviewed skill definitions
  db/                  # Drizzle schema and migrations
  shared/              # Zod schemas, events, constants, utilities
  ui/                  # Wakil RTL design system and components
templates/
infra/
docs/
```

- `apps/web` must not import implementation code from `apps/worker`, or the reverse.
- Web and worker communicate only through typed database records, queue jobs, and events.
- Provider SDKs are allowed only behind `packages/model-router` adapters.
- Sandbox SDKs are allowed only behind `packages/sandbox` adapters.
- Generated or user-supplied code must never execute inside the web or worker container.
- Do not create abstractions without a current consumer, except for provider and sandbox boundaries.

## 6. Architecture Invariants

- PostgreSQL is the durable source of truth.
- Redis is transport and ephemeral coordination, never the only store for user-visible run history.
- Long-running work is always represented by a `Run` and processed by the worker.
- Agent execution is a bounded state machine, not an unbounded loop.
- Every run has time, tool-call, token, provider-spend, and sandbox-minute limits.
- Persist `run_events`; SSE must support `Last-Event-ID` replay.
- Mutations that can be retried must accept and enforce idempotency keys.
- Publishing, external messaging, paid actions, and other sensitive effects require explicit user
  approval.
- Model names and fallbacks are configuration, never hard-coded product logic.
- User-visible progress must describe actual persisted work. Never expose hidden chain-of-thought.

## 7. Database and Tenancy

- Every user-owned query must be scoped to the authenticated workspace or tenant.
- Use UUID primary keys unless an external authentication table requires another format.
- Use transactions for credit reservation, usage settlement, and other multi-record invariants.
- Usage history is an append-only ledger; a cached balance may be maintained transactionally.
- Schema changes require a committed migration.
- Run `drizzle-kit generate` and the approved migration command after schema changes.
- Never use `drizzle-kit push` for shared or production environments.
- Add indexes and constraints intentionally; document non-obvious ones beside the schema.

## 8. Security Rules

- Never commit secrets. Keep `.env.example` synchronized with names only.
- Validate environment variables at startup with Zod and fail fast without printing values.
- Do not expose provider, storage, database, Redis, or deployment credentials to the browser or
  sandbox.
- Object storage is private; authorize tenant membership before issuing a short-lived download URL.
- Web previews run on a separate origin in a sandboxed iframe with a restrictive CSP.
- Apply least privilege, upload limits, MIME validation, rate limits, and audit logs.
- Treat prompts, uploads, generated files, tool output, and third-party content as untrusted input.
- Do not log full prompts, file contents, access tokens, cookies, or secrets.
- Destructive changes, publishing, external side effects, and meaningful cost increases require
  explicit approval.

## 9. Product and UI Rules

### Arabic and RTL

- Arabic RTL is the default for the full product.
- Use Cairo for Arabic UI typography, with Cairo Bold for headings and Cairo Medium for body text.
- Scope code, URLs, IDs, email addresses, numbers that require it, and terminal output to
  `dir="ltr"`.
- Icons, navigation, drawers, arrows, tabs, spacing, and animations must behave correctly in RTL.
- Use simple Gulf-friendly Arabic copy; hide technical detail behind progressive disclosure.

### Mobile-first

- Design the mobile product first, not a compressed desktop dashboard.
- The main acceptance viewports are `390x844` and `430x932`.
- Respect safe-area insets, mobile keyboards, thumb reach, and at least 44px touch targets.
- The bottom navigation and chat composer remain usable without covering content.
- No horizontal overflow, clipped Arabic text, tiny desktop tables, or hover-only interactions.
- Desktop layouts may enhance the mobile experience but must not redefine it.

### Human-made visual quality

- Use the design tokens in `docs/design-system.md`; do not invent page-specific styles.
- Prefer clear hierarchy, intentional asymmetry, useful whitespace, and content-led layouts.
- Avoid generic AI-SaaS patterns: excessive glass cards, neon glow everywhere, gradients on every
  element, identical rounded cards, decorative blobs without purpose, and oversized empty hero
  sections.
- Use one primary visual accent per screen. Shadows are subtle and layered, not muddy or neon.
- Vary component composition based on content while keeping tokens consistent.
- Use real Arabic product copy and realistic states; do not ship lorem ipsum or fake metrics.
- Motion must explain state or hierarchy. Support `prefers-reduced-motion` and avoid constant
  ambient animation.
- Meet WCAG AA contrast, visible focus, keyboard navigation, semantic landmarks, labels, and
  accessible error messages.

## 10. Component and Code Quality

- Prefer Server Components. Add `"use client"` only where browser state or interactivity requires
  it.
- Keep client components small and avoid broad global state.
- Use shared Zod schemas for API, queue, and event contracts.
- Prefer explicit, readable code over clever abstractions.
- Avoid `any`; document rare exceptions.
- Handle loading, empty, running, reconnecting, approval, failed, cancelled, completed, and
  quota-exceeded states.
- Do not add a dependency unless it is used immediately and improves the current milestone.
- Do not place business logic inside UI components or route handlers.

## 11. Verification and Definition of Done

Use repository scripts when present. The minimum milestone gate is:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Also run, when applicable:

```bash
pnpm test:integration
pnpm test:e2e
```

For UI changes:

- Run Playwright at `390x844` and `430x932`.
- Capture and inspect screenshots for every changed primary state.
- Verify no console errors, hydration warnings, horizontal overflow, clipped RTL content, or
  keyboard/composer overlap.
- Verify reduced motion and keyboard navigation.

For database changes, run migrations against a clean database and an existing development database.

A milestone is not complete if required checks fail. Report the exact failing check and the smallest
next action.

## 12. Prohibited Shortcuts

- No mock data on a screen declared complete unless the current milestone explicitly calls it a
  prototype.
- No fake streaming, fake progress, or timers presented as real execution.
- No generated-code execution in the control plane.
- No public buckets or permanent artifact URLs.
- No hard-coded model IDs in UI or core business logic.
- No silent fallbacks that change cost, permissions, or user-visible output.
- No secrets in source, fixtures, screenshots, logs, or examples.
- No skipping tests because a change appears small.
