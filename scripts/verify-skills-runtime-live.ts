#!/usr/bin/env -S pnpm exec tsx
/**
 * Standalone LIVE verification for the website Skills Runtime.
 *
 * Calls the real @wakil/agent-core generation functions against a real
 * model provider through @wakil/model-router — no Docker, no queue, no
 * database required. This intentionally exercises only the generation
 * logic (the part this increment changed); it does not replace the
 * Docker-gated worker integration tests, which additionally verify queueing,
 * cancellation, event persistence, and storage upload.
 *
 * Usage (set exactly one provider key; never commit it):
 *   OPENROUTER_API_KEY=sk-... OPENROUTER_MODEL=<model> \
 *     pnpm exec tsx scripts/verify-skills-runtime-live.ts
 *
 * Optional: TRIAL=a|b|c to run a single trial instead of all three.
 *
 * Output: artifacts/live-verification/<trial-id>/{plan.txt,legacy.html,
 * runtime.html,result.json} — artifacts/ is gitignored. The API key is read
 * from the environment and never written to any output file or the console.
 */
import {
  generatePlanningTurn,
  generateStaticSite,
  generateStaticSiteWithReview,
  type PlanningLimits,
  type StaticSiteGenerationLimits,
} from "../packages/agent-core/src/index.ts";
import {
  createAnthropicAdapter,
  createGoogleAdapter,
  createOpenAiAdapter,
  createOpenRouterAdapter,
  type ModelProviderAdapter,
} from "../packages/model-router/src/index.ts";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

type ProviderConfig = { adapter: ModelProviderAdapter; model: string; provider: string };

function resolveProvider(): ProviderConfig {
  if (process.env.OPENROUTER_API_KEY) {
    const baseUrl = process.env.OPENROUTER_BASE_URL;
    return {
      adapter: createOpenRouterAdapter({
        apiKey: process.env.OPENROUTER_API_KEY,
        ...(baseUrl ? { baseUrl } : {}),
      }),
      model: process.env.OPENROUTER_MODEL ?? "openrouter/auto",
      provider: "openrouter",
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      adapter: createOpenAiAdapter({ apiKey: process.env.OPENAI_API_KEY }),
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      provider: "openai",
    };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      adapter: createAnthropicAdapter({ apiKey: process.env.ANTHROPIC_API_KEY }),
      model: process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest",
      provider: "anthropic",
    };
  }
  if (process.env.GOOGLE_API_KEY) {
    return {
      adapter: createGoogleAdapter({ apiKey: process.env.GOOGLE_API_KEY }),
      model: process.env.GOOGLE_MODEL ?? "gemini-1.5-flash",
      provider: "google",
    };
  }
  throw new Error(
    "No provider configured. Set one of OPENROUTER_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY.",
  );
}

const TRIALS = [
  {
    id: "trial-a-arabic-platform",
    text: "أنشئ لي صفحة عربية احترافية لمنصة وكيل ذكي تساعد أصحاب الأعمال في الخليج على إنشاء المواقع والمستندات والملفات من خلال محادثة بسيطة. اجعل التجربة موجهة للموبايل أولاً، واضحة وسهلة، ولا تستخدم شهادات أو أرقام عملاء غير حقيقية.",
  },
  {
    id: "trial-b-arabic-local-service",
    text: "أنشئ موقعاً عربياً احترافياً لشركة صيانة منازل في مسقط تقدم خدمات الكهرباء والسباكة والتكييف. يجب أن يكون الموقع مناسباً للهاتف، واضحاً للعائلات، ويحتوي على زر طلب خدمة واضح، دون اختراع تقييمات أو أرقام عملاء.",
  },
  {
    id: "trial-c-english-saas",
    text: "Create a professional mobile-first SaaS landing page for a small-business invoice management platform. Use a distinctive but restrained visual identity, a clear primary action, and no fabricated testimonials, customer logos, or usage statistics.",
  },
] as const;

const planningLimits: PlanningLimits = {
  deadlineMs: 60_000,
  inputCostMicrosPerMillionTokens: 1,
  maxAttempts: 2,
  maxCostMicros: 1_000_000,
  maxDeltaEvents: 512,
  maxOutputChars: 8_000,
  maxOutputTokens: 1_500,
  outputCostMicrosPerMillionTokens: 1,
};

const executionLimits: StaticSiteGenerationLimits = {
  deadlineMs: 90_000,
  inputCostMicrosPerMillionTokens: 1,
  maxAttempts: 2,
  maxCostMicros: 1_000_000,
  maxHtmlBytes: 250_000,
  maxOutputChars: 300_000,
  maxOutputTokens: 32_000,
  outputCostMicrosPerMillionTokens: 1,
};

const outRoot = fileURLToPath(new URL("../artifacts/live-verification", import.meta.url));

async function runTrial(trial: (typeof TRIALS)[number], provider: ProviderConfig) {
  const dir = join(outRoot, trial.id);
  await mkdir(dir, { recursive: true });
  const log = (msg: string) => process.stdout.write(`[${trial.id}] ${msg}\n`);

  log(`planning via ${provider.provider}/${provider.model}...`);
  const plan = await generatePlanningTurn({
    adapter: provider.adapter,
    isCancelled: async () => false,
    limits: planningLimits,
    model: provider.model,
    onDelta: async () => {},
    userRequest: trial.text,
  });
  if (!plan.ok) {
    await writeFile(
      join(dir, "result.json"),
      JSON.stringify({ ok: false, stage: "planning", code: plan.code }, null, 2),
    );
    log(`planning FAILED: ${plan.code}`);
    return;
  }
  await writeFile(join(dir, "plan.txt"), plan.plan.content, "utf8");
  log(`planning ok (${plan.usage.inputTokens}in/${plan.usage.outputTokens}out tokens)`);

  log("generating legacy path (AGENT_SKILLS_RUNTIME_ENABLED=false)...");
  const legacy = await generateStaticSite({
    adapter: provider.adapter,
    isCancelled: async () => false,
    limits: executionLimits,
    model: provider.model,
    reviewedPlan: plan.plan.content,
    userRequest: trial.text,
  });
  if (legacy.ok) await writeFile(join(dir, "legacy.html"), legacy.html, "utf8");
  log(`legacy path: ${legacy.ok ? "ok" : `FAILED (${legacy.code})`}`);

  log("generating runtime-enabled path (AGENT_SKILLS_RUNTIME_ENABLED=true) with Design Critic...");
  const runtime = await generateStaticSiteWithReview({
    adapter: provider.adapter,
    designReview: { enabled: true, maxRepairAttempts: 1 },
    isCancelled: async () => false,
    limits: executionLimits,
    model: provider.model,
    reviewedPlan: plan.plan.content,
    skillsRuntime: { enabled: true },
    userRequest: trial.text,
  });
  if (runtime.ok) await writeFile(join(dir, "runtime.html"), runtime.html, "utf8");
  log(
    `runtime path: ${runtime.ok ? "ok" : `FAILED (${runtime.code})`}, repairAttempts=${runtime.repairAttempts}, reviewPassed=${runtime.review?.passed}`,
  );

  const result = {
    trial: trial.id,
    provider: provider.provider,
    model: provider.model,
    planning: { ok: plan.ok, usage: plan.usage },
    legacy: legacy.ok
      ? {
          ok: true,
          usage: legacy.usage,
          skillsRuntime: legacy.skillsRuntime,
          htmlBytes: legacy.html.length,
        }
      : { ok: false, code: legacy.code },
    runtime: runtime.ok
      ? {
          ok: true,
          usage: runtime.usage,
          skillsRuntime: runtime.skillsRuntime,
          htmlBytes: runtime.html.length,
          repairAttempts: runtime.repairAttempts,
          review: runtime.review,
        }
      : { ok: false, code: runtime.code, repairAttempts: runtime.repairAttempts },
  };
  await writeFile(join(dir, "result.json"), JSON.stringify(result, null, 2), "utf8");
  log(`wrote ${dir}`);
}

async function main() {
  const provider = resolveProvider();
  process.stdout.write(`Provider resolved: ${provider.provider} (model=${provider.model})\n`);
  const only = process.env.TRIAL;
  const selected = only
    ? TRIALS.filter((t) => t.id.includes(`trial-${only.toLowerCase()}-`))
    : TRIALS;
  if (selected.length === 0) throw new Error(`No trial matches TRIAL=${only}`);
  for (const trial of selected) {
    await runTrial(trial, provider);
  }
  process.stdout.write(`\nDone. See ${outRoot}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  // Defensive redaction in case a provider ever echoes the key in an error string.
  const safe = message.replace(/(sk-[a-zA-Z0-9_-]{10,})/g, "[REDACTED]");
  process.stderr.write(`verify-skills-runtime-live failed: ${safe}\n`);
  process.exitCode = 1;
});
