# Wakil Development Environment

## Prerequisites

- Node.js `22.23.1` (the repository rejects other major versions).
- Corepack.
- Docker Desktop or another Docker Engine with Compose v2.
- Git.

## First setup

Run once from the repository root:

```bash
corepack enable
corepack install
pnpm install --frozen-lockfile
```

The package-manager version is pinned in `package.json`. Do not install an unversioned global pnpm.

## Start development

```bash
pnpm dev
```

This is the supported startup path. It creates a gitignored `.env.local` when needed, starts and
health-checks the local services, applies committed database migrations, builds the database
package, and starts the web and worker apps. Existing `.env.local` values are never overwritten.

Local endpoints:

| Service       | URL / address                      |
| ------------- | ---------------------------------- |
| Web           | `http://localhost:3000`            |
| Web liveness  | `http://localhost:3000/api/health` |
| PostgreSQL    | `127.0.0.1:5432`                   |
| Redis         | `127.0.0.1:6379`                   |
| MinIO API     | `http://127.0.0.1:9000`            |
| MinIO console | `http://127.0.0.1:9001`            |
| Mailpit SMTP  | `127.0.0.1:1025`                   |
| Mailpit UI    | `http://127.0.0.1:8025`            |

Always open the web app at `localhost`, not `127.0.0.1`. Next.js's Turbopack dev server resolves its
own request origin as `localhost` regardless of the Host header used to reach it, so `AUTH_URL` is
set to `http://localhost:3000` and email magic-link sign-in only verifies correctly when the browser
also uses that host.

The MinIO bootstrap service creates `wakil-dev` as a private bucket. M0 does not include application
storage access or public object URLs.

## Model provider configuration

Layer B runs one bounded Arabic planning turn in the worker. OpenRouter is the default provider;
direct OpenAI, Anthropic, and Google connections are explicit alternatives. Copy variable names from
`.env.example` into the gitignored `.env.local` and configure exactly the provider selected by
`MODEL_PROVIDER`:

| Provider     | Required variables                       | Optional base URL     |
| ------------ | ---------------------------------------- | --------------------- |
| `openrouter` | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | `OPENROUTER_BASE_URL` |
| `openai`     | `OPENAI_API_KEY`, `OPENAI_MODEL`         | `OPENAI_BASE_URL`     |
| `anthropic`  | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`   | `ANTHROPIC_BASE_URL`  |
| `google`     | `GOOGLE_API_KEY`, `GOOGLE_MODEL`         | `GOOGLE_BASE_URL`     |

Model identifiers are configuration and are never selected in browser code. The worker also requires
`MODEL_INPUT_COST_MICROS_PER_MILLION_TOKENS` and `MODEL_OUTPUT_COST_MICROS_PER_MILLION_TOKENS`; set
these to the selected model's current rates so the preflight spend check is conservative. OpenRouter
replaces the estimate with returned provider cost when present. The remaining `MODEL_MAX_*` and
`MODEL_DEADLINE_MS` variables define the hard time, attempt, output, event, and spend ceilings.

The worker fails fast with field names only when the selected provider is incomplete. It never
prints credential values and never silently falls back to a different provider. Restart `pnpm dev`
after changing server environment configuration.

## Stop services

Stop the web/worker process with `Ctrl+C`, then stop infrastructure:

```bash
pnpm dev:down
```

Named volumes intentionally remain. To reset local data, first stop development, then explicitly run
`docker compose -f infra/docker-compose.yml down --volumes`. This permanently deletes local
PostgreSQL, Redis, MinIO, and Mailpit data.

## Database migrations

Generate SQL only after a deliberate schema edit:

```bash
pnpm db:generate
```

Inspect the generated SQL, then apply committed migrations with:

```bash
pnpm db:migrate
```

`drizzle-kit push` is intentionally not available.

## Verification

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration:migrations
pnpm test:integration
pnpm build
pnpm test:e2e
pnpm test:e2e:visual
```

The integration suite requires a reachable Docker daemon and starts an isolated PostgreSQL 17
container. Logs and environment errors name failed fields or dependencies without printing
credential values.

## Troubleshooting

- A Node version error means the active runtime is not major version 22. Switch runtimes before
  installing or verifying.
- A Docker connection error means Docker Desktop/Engine is not running or the current user cannot
  access it.
- Port conflicts on `3000`, `5432`, `6379`, `8025`, `9000`, or `9001` must be resolved before
  `pnpm dev` can complete.
- `.env.local` is private and gitignored. Compare variable names with `.env.example`; never paste
  its values into logs or issues.
