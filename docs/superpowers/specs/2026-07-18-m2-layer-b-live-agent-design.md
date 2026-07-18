# M2 Layer B — Live Agent and Model Router Design

**Status:** Approved for implementation on 2026-07-18. OpenRouter is the primary provider; direct
OpenAI, Anthropic, and Google adapters are also approved.

## 1. Outcome and scope

Layer B replaces the Layer A deterministic preparation steps with one bounded, real model-backed
agent turn. Given the latest saved user request, Wakil produces a short Arabic execution plan,
streams truthful assistant output through persisted run events, and saves exactly one completed
assistant message.

This is the smallest useful vertical slice before sandbox execution exists. It does not generate or
execute code, create artifacts, publish anything, or claim that a downloadable result exists.

Layer C remains a separate milestone and may start only after Layer B passes its complete gate.

## 2. User-visible flow

1. The user starts a run from the existing conversation screen.
2. The worker loads the run's own latest user message, scoped by workspace, project, and
   conversation.
3. The agent asks the configured provider for a concise Arabic plan using a versioned prompt and a
   validated response.
4. Persisted `assistant.delta` events let the user see the real provider output as it arrives.
5. On success, the worker atomically saves one `assistant` conversation message, usage totals, and
   the terminal run event.
6. On refusal, malformed output, cancellation, timeout, rate limiting, or a budget breach, the run
   fails or cancels with a stable application code. No partial assistant message is presented as a
   completed answer.

## 3. Package boundaries

### `packages/model-router`

- Defines provider-neutral request, streamed event, usage, refusal, and error contracts.
- Owns the OpenRouter, OpenAI, Anthropic, and Google adapters and all provider-specific code.
- Validates external responses with Zod before returning them to the worker.
- Applies request timeout, bounded retries with jitter for retryable failures, and explicit
  rate-limit handling.
- Receives the model name through validated server configuration. Model names and fallbacks are
  never hard-coded in product logic.
- Never logs API keys, prompts, user content, raw provider responses, or response bodies.

OpenRouter is the default configured route. Direct OpenAI, Anthropic, and Google routes are selected
explicitly through server configuration. There is no automatic provider fallback because it could
silently change cost or behavior.

### `packages/agent-core`

- Defines the bounded Layer B state machine:
  `load-request -> generate-plan -> validate-plan -> commit-response`.
- Enforces cancellation checks, deadlines, maximum provider attempts, output-token ceiling, and
  provider-spend ceiling.
- Accepts a model-router interface; it does not import a provider SDK.
- Returns explicit safe outcomes rather than throwing provider-specific errors across boundaries.

### `packages/skills`

- Stores the reviewed, versioned Arabic planning prompt and its output schema.
- Separates system instructions, product/developer constraints, and untrusted user content.
- Includes representative Arabic eval fixtures for normal requests, ambiguity, prompt injection,
  unsafe requests, refusal, and malformed provider output.

### Existing applications

- `apps/worker` composes the agent, model router, database, cancellation, and durable event writer.
- `apps/web` continues to read PostgreSQL-backed messages and run events. It never receives provider
  credentials or imports provider code.
- Web and worker still communicate only through typed records, queue jobs, and events.

## 4. Prompt and response contract

The first prompt version produces a short Arabic Markdown plan, not hidden reasoning and not
generated source code. The accumulated provider response is validated into:

```ts
type AssistantPlan = {
  content: string;
};
```

Constraints:

- Arabic is the default response language.
- `content` is 1–8,000 characters and follows a short summary plus 2–6 numbered steps.
- The response must not include chain-of-thought, credentials, executable commands, publishing
  claims, artifact claims, or unreviewed external side effects.
- User content is placed only in the user-content field and is always treated as untrusted.
- Provider refusals and incomplete/malformed responses are explicit outcomes.

The canonical assistant message is the size-limited, validated accumulated text. It is rendered as
text/Markdown by trusted UI components, never as unsanitized HTML.

## 5. Durable data and events

A committed Drizzle migration will:

- expand `conversation_messages.role` from only `user` to `user | assistant`;
- add nullable `run_id` to assistant messages, with a uniqueness rule ensuring at most one final
  assistant message per run;
- add run accounting columns for `prompt_tokens`, `completion_tokens`, `provider_cost_micros`,
  `provider_attempts`, `model_config_key`, and `prompt_version`;
- extend run event types with `agent.started`, `assistant.delta`, `assistant.completed`,
  `agent.refused`, and `agent.limit_exceeded`.

`assistant.delta` events contain bounded text chunks from the real response and are persisted before
publication, preserving SSE replay. They are untrusted display content, not logs. Chunk and event
count limits prevent unbounded database growth.

The terminal database transaction saves the validated assistant message, final accounting fields,
and terminal event together. Partial deltas remain part of the run audit trail if the provider or
worker fails, but the conversation contains no incomplete assistant message.

## 6. Limits, cost, and failure policy

Every Layer B run has configuration-backed limits:

- wall-clock deadline;
- maximum provider attempts;
- maximum output tokens;
- maximum persisted delta events and characters;
- maximum provider cost in integer micro-units.

Before retrying, the router checks the remaining attempt, time, token, and spend budgets. A fallback
model is out of scope for this slice because a silent fallback may change cost or behavior.

Stable error codes distinguish configuration missing, provider unavailable, rate limited, refused,
invalid response, timeout, token limit, and spend limit. Arabic UI copy stays provider-neutral.

## 7. Security and tenancy

- The worker loads the exact run conversation under all of `run_id`, `workspace_id`, `project_id`,
  and `conversation_id`; it never selects an arbitrary workspace message.
- Provider credentials exist only in validated worker environment variables and `.env.example`
  contains names only.
- Full prompts, conversation content, deltas, credentials, cookies, and provider response bodies are
  never written to application logs or error messages.
- Streaming payloads and final output are validated and size-limited at the provider boundary.
- The UI renders assistant text as text, never as unsanitized HTML.
- Layer B has no tools with external side effects and no generated-code execution.

## 8. Mobile UI

The conversation view will distinguish user and assistant messages. During a run, the existing live
panel shows the real planning state and the currently persisted assistant text. It covers queued,
planning, streaming, reconnecting, refused, failed, cancelled, limit-exceeded, and completed states.

Arabic RTL remains the default, with LTR scoped only to identifiers or genuinely LTR content. Touch
targets remain at least 44px and the composer must remain usable with the mobile keyboard.

## 9. Tests and acceptance criteria

### Unit

- prompt schema, rendering, version, and Arabic eval fixtures;
- provider stream validation, refusal/error mapping, timeout, retry, and redacted logging;
- agent transitions, cancellation, token/spend/attempt/event limits;
- run-event contracts and assistant message rendering.

### Integration

- clean and existing-database migrations;
- exact tenant/project/conversation request selection;
- real adapter exercised against an injectable local HTTP test server, including streaming, refusal,
  malformed chunks, rate limit, retry, timeout, and disconnect;
- durable ordered delta replay and atomic final assistant-message commit;
- no cross-tenant access and no duplicate assistant message after job retry.

### E2E

- real persisted planning/streaming/completed UI states at `390x844` and `430x932`;
- cancellation, reconnect replay, refusal, provider failure, and limit-exceeded states;
- no console errors, hydration warnings, horizontal overflow, clipped RTL content, or composer
  overlap; keyboard navigation and reduced motion verified.

Layer B is complete only when format, lint, typecheck, unit, migration, integration, build, and both
mobile Playwright gates pass and `CHANGELOG.md` records only verified behavior.

## 10. Explicit non-goals

- generated code, tool execution, sandbox SDKs, templates, artifacts, object upload, signed download
  URLs, preview iframes, publishing, paid checkout, or external messaging;
- silent model fallback or model selection in the UI;
- exposing hidden reasoning or presenting simulated tokens/progress;
- production provider calls in tests.

## 11. Approved provider routing

- `openrouter` — primary route using OpenRouter's streaming Chat Completions API.
- `openai` — direct route using OpenAI's streaming Responses API.
- `anthropic` — direct route using Anthropic's streaming Messages API.
- `google` — direct route using Google's streaming Gemini `streamGenerateContent` API.

Each route has independent server-only API-key and model configuration. No model ID is hard-coded,
and selecting one route never silently falls back to another.
