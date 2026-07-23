# Skills Runtime — Live Verification Runbook

This runbook exists because the sandboxed session that built the Skills Runtime integration
(Increments 1–2.5) could not complete two verification steps required before enabling
`AGENT_SKILLS_RUNTIME_ENABLED` anywhere: **Docker-gated worker integration tests** and a **live
model-provider trial**. Both were blocked by the sandbox's environment, not by anything in the code.
Run the steps below in an environment that has Docker registry access and a provider API key (a
normal developer machine or CI runner) before flipping the feature flag on for real users.

## Why this runbook exists (environment findings)

Recorded here for anyone re-verifying the finding rather than re-discovering it:

- **Docker registry pulls are policy-blocked in the build sandbox.** `dockerd` itself starts fine,
  but pulling any image (tested against Docker Hub's CDN and GHCR) is rejected by the sandbox's
  egress proxy with `403` / `connect_rejected` ("policy denial"). This blocks `docker compose up`
  and Testcontainers-based integration tests (`PostgreSqlContainer`) in that specific sandbox.
- **Only `api.anthropic.com` is directly reachable from that sandbox**; `openrouter.ai`,
  `api.openai.com`, and `generativelanguage.googleapis.com` return `403` at the proxy's CONNECT
  step. No provider API key was available there in any case.
- Neither limitation is present on a normal developer machine or a standard CI runner — this runbook
  is written for those environments.

## 1. Docker-gated worker integration tests

Start the documented local stack (Postgres, Redis, MinIO, Mailpit) the same way `pnpm dev` does, or
let the tests provision their own Testcontainers Postgres — both paths are supported:

```bash
# Option A: point tests at the existing pnpm dev stack
pnpm dev                      # starts infra/docker-compose.yml + web + worker
# in another shell:
TEST_DATABASE_URL=postgres://wakil:wakil_local_only@127.0.0.1:5432/wakil \
  pnpm --filter @wakil/worker test:integration

# Option B: let Testcontainers provision Postgres automatically (needs Docker + registry access)
pnpm --filter @wakil/worker test:integration
```

This runs every `apps/worker/src/**/*.integration.test.ts` file, including the skills-runtime cases
added in Increment 2 (`processor.integration.test.ts`):

- `includes the compiled skill instructions in the developer prompt when the flag is enabled`
- `keeps the legacy prompt path (no skill instructions appended) when the flag is disabled`
- `fails the run with DESIGN_VALIDATION_FAILED and uploads nothing when the critic keeps blocking after repairs`

plus the full existing suite: run completion, ordered event sequencing, cooperative cancellation,
artifact/storage behavior, and the plan-then-execute flow.

**Pass criteria:** all tests green. If a skills-runtime case fails, capture the assertion failure
and the actual developer-prompt content it printed — do not weaken the assertion to make it pass;
open an issue against `apps/worker/src/runs/processor.ts` or
`packages/agent-core/src/static-site.ts` instead.

Also run the DB migration and web integration suites for completeness:

```bash
pnpm test:integration:migrations
pnpm --filter @wakil/web test:integration
```

## 2. Live provider trial

Use a **development/test API key only** — never a production key, and never commit or log it.

### 2a. Fast path: standalone script (no Docker required)

`scripts/verify-skills-runtime-live.ts` calls the real `@wakil/agent-core` generation functions
(`generatePlanningTurn`, `generateStaticSite`, `generateStaticSiteWithReview`) through a real
`@wakil/model-router` adapter — no queue, database, or Docker needed. It runs Trials A/B/C (below)
through both the legacy and runtime-enabled paths and writes evidence to
`artifacts/live-verification/` (gitignored).

```bash
# Set exactly one provider key.
OPENROUTER_API_KEY=sk-...  OPENROUTER_MODEL=<model>  pnpm exec tsx scripts/verify-skills-runtime-live.ts
# or: OPENAI_API_KEY=... OPENAI_MODEL=...
# or: ANTHROPIC_API_KEY=... ANTHROPIC_MODEL=...
# or: GOOGLE_API_KEY=... GOOGLE_MODEL=...

# Run a single trial only:
TRIAL=a pnpm exec tsx scripts/verify-skills-runtime-live.ts
```

Inspect `artifacts/live-verification/<trial-id>/result.json` for: token usage (planning +
generation), `skillsRuntime` metadata (selected skill ids/versions, skipped skills, `used`/
`fallbackUsed`), the Design Critic `review` (score, blocking/major/minor issues, `passed`), and
`repairAttempts`. `legacy.html` and `runtime.html` hold the actual generated pages for the two paths
— diff them directly.

### 2b. Full path: through the real worker (needs Docker + a key)

```bash
# infra/docker-compose.yml + web + worker, using .env.local
AGENT_SKILLS_RUNTIME_ENABLED=true pnpm dev
```

Set the provider key and `AGENT_SKILLS_RUNTIME_ENABLED=true` in `.env.local` (gitignored, never
committed) for the **worker** process only — keep it `false` in any shared/production configuration.
Then submit the trial prompts through the actual product UI (create a project, paste the prompt, let
it plan then execute) and inspect the resulting run in `/admin/runs/<id>` and the generated preview.

## 3. Trial prompts (run all three)

**Trial A — Arabic AI platform**

```
أنشئ لي صفحة عربية احترافية لمنصة وكيل ذكي تساعد أصحاب الأعمال في الخليج على إنشاء المواقع والمستندات والملفات من خلال محادثة بسيطة. اجعل التجربة موجهة للموبايل أولاً، واضحة وسهلة، ولا تستخدم شهادات أو أرقام عملاء غير حقيقية.
```

**Trial B — Arabic local service business**

```
أنشئ موقعاً عربياً احترافياً لشركة صيانة منازل في مسقط تقدم خدمات الكهرباء والسباكة والتكييف. يجب أن يكون الموقع مناسباً للهاتف، واضحاً للعائلات، ويحتوي على زر طلب خدمة واضح، دون اختراع تقييمات أو أرقام عملاء.
```

**Trial C — English SaaS website**

```
Create a professional mobile-first SaaS landing page for a small-business invoice management platform. Use a distinctive but restrained visual identity, a clear primary action, and no fabricated testimonials, customer logos, or usage statistics.
```

### What to verify per trial

- Arabic trials (A, B) select `arabic-rtl-ui`; the English trial (C) does not.
- No trial selects `pdf-studio`, `spreadsheet-studio`, `document-studio`, or `presentation-studio`.
- The adapter receives exactly `{ system, developer, user }` (already asserted in unit tests;
  spot-check the real call if you add logging).
- `skillsRuntime` metadata contains only ids/versions/counts — never full instruction text.
- The generated HTML and any customer-visible summary never mention internal skill names, prompt
  content, or the model provider.

## 4. Render and inspect the real output

Reuse the existing Playwright pattern from `packages/agent-core/src/website-render-check.test.ts`
(already proven in this repo, no new dependency) against the saved `legacy.html` / `runtime.html`
files. A minimal one-off script:

```ts
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const html = readFileSync(
  "artifacts/live-verification/trial-a-arabic-platform/runtime.html",
  "utf8",
);
const browser = await chromium.launch();
for (const vp of [
  { w: 390, h: 844 },
  { w: 430, h: 932 },
  { w: 768, h: 1024 },
  { w: 1440, h: 900 },
]) {
  const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({ path: `artifacts/live-verification/trial-a-${vp.w}.png` });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  console.log(vp.w, "overflow:", overflow);
  await page.close();
}
await browser.close();
```

Check for each trial/viewport: page loads, correct `lang`/`dir`, no horizontal overflow, no clipped
main content, no console errors, a real (non-`href="#"`) primary CTA, no missing entry content, and
no fabricated claims.

## 5. Merge checklist

Once the above passes:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm format:check
```

Then merge `claude/skills-runtime` into `main` with `AGENT_SKILLS_RUNTIME_ENABLED` still `false` in
every shared/production configuration. Enabling it for real traffic is a separate, deliberate
decision — do it gradually, with the worker's structured `skills_runtime.website` log line as your
first operational signal.
