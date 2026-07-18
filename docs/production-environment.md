# Production environment inventory

No application variable is required at build time. Build production images without runtime
credentials, then inject variables at process start through the deployment platform's encrypted
secret/config store. No current variable uses `NEXT_PUBLIC_`, `VITE_`, or `PUBLIC_`; browser code
must not receive any variable listed here. Values must never be stored in Git, image layers, CI
artifacts, or logs.

Legend: **web**, **worker**, and **migrate** identify runtime scope. **Required** means required for
a production service to provide its approved M0-M2 behavior; “selected” means only for the
configured provider. Client exposure is **none** for every row.

## Core services

| Variable             | Purpose                                          | Scope                | Required           | Classification          |
| -------------------- | ------------------------------------------------ | -------------------- | ------------------ | ----------------------- |
| `NODE_ENV`           | Enables production runtime behavior              | web, worker          | yes (`production`) | non-secret, server-only |
| `LOG_LEVEL`          | Structured-log threshold                         | web, worker          | no; default `info` | non-secret, server-only |
| `DATABASE_URL`       | PostgreSQL connection and credentials            | web, worker, migrate | yes                | secret, server-only     |
| `REDIS_URL`          | Redis/BullMQ endpoint, TLS mode, and credentials | web, worker          | yes                | secret, server-only     |
| `WORKER_CONCURRENCY` | Maximum parallel BullMQ jobs                     | worker               | no; default `4`    | non-secret, server-only |
| `WORKER_HEALTH_PORT` | Private worker health listener                   | worker               | no; default `3001` | non-secret, server-only |

`DATABASE_URL` accepts only `postgres://` or `postgresql://`. `REDIS_URL` accepts only `redis://` or
`rediss://`; use `rediss://` whenever the managed provider requires TLS. Do not expose PostgreSQL,
Redis, or the worker health port to the public Internet.

## Cloudflare R2

| Variable               | Purpose                                 | Scope       | Required    | Classification                |
| ---------------------- | --------------------------------------- | ----------- | ----------- | ----------------------------- |
| `S3_ENDPOINT`          | Account/jurisdiction R2 S3 API endpoint | web, worker | yes         | non-secret, server-only       |
| `S3_REGION`            | SDK signing region                      | web, worker | yes; `auto` | non-secret, server-only       |
| `S3_BUCKET`            | Private application bucket name         | web, worker | yes         | sensitive config, server-only |
| `S3_ACCESS_KEY_ID`     | Bucket-scoped S3 credential identifier  | web, worker | yes         | secret, server-only           |
| `S3_SECRET_ACCESS_KEY` | Bucket-scoped S3 credential secret      | web, worker | yes         | secret, server-only           |
| `S3_FORCE_PATH_STYLE`  | Required R2 request addressing mode     | web, worker | yes; `true` | non-secret, server-only       |

The endpoint must be an `r2.cloudflarestorage.com` endpoint in production. Inject different values
under the same `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` runtime names per service: web needs a
bucket-scoped **Object Read only** token to authorize and sign private reads; worker needs a
bucket-scoped **Object Read & Write** token to upload, inspect, and delete. Cloudflare documents
that the write scope includes `PutObject`, `DeleteObject`, `DeleteObjects`, and `CopyObject`;
neither service requires account-wide bucket administration. See the
[R2 token documentation](https://developers.cloudflare.com/r2/api/tokens/) and
[temporary credential operation table](https://developers.cloudflare.com/r2/api/s3/temporary-credentials/).

Token scope cannot be inferred from an Access Key ID. Manually verify it in Cloudflare: **R2 object
storage → Overview → Manage R2 API tokens → select each application token**. Confirm web is **Object
Read only**, worker is **Object Read & Write**, both name only the application bucket, and neither
has Admin permission. Then open the bucket **Settings** and confirm both the `r2.dev` public URL and
custom public domains are disabled. Never copy a token into a ticket or terminal output.

## Authentication and email

| Variable             | Purpose                                                 | Scope | Required                        | Classification                |
| -------------------- | ------------------------------------------------------- | ----- | ------------------------------- | ----------------------------- |
| `AUTH_SECRET`        | Auth.js cookie/token cryptographic secret               | web   | yes                             | secret, server-only           |
| `AUTH_URL`           | Canonical production callback/base URL                  | web   | yes; HTTPS                      | non-secret, server-only       |
| `AUTH_GOOGLE_ID`     | Google OAuth client identifier                          | web   | optional pair                   | sensitive config, server-only |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret                              | web   | optional pair                   | secret, server-only           |
| `EMAIL_FROM`         | Verified magic-link sender                              | web   | yes                             | non-secret, server-only       |
| `SMTP_HOST`          | SMTP server hostname                                    | web   | yes                             | non-secret, server-only       |
| `SMTP_PORT`          | SMTP server port                                        | web   | yes                             | non-secret, server-only       |
| `SMTP_SECURE`        | Direct TLS (`true`) or provider STARTTLS mode (`false`) | web   | yes, provider-specific          | non-secret, server-only       |
| `SMTP_USER`          | SMTP login name                                         | web   | optional pair/provider-specific | secret, server-only           |
| `SMTP_PASSWORD`      | SMTP login secret                                       | web   | optional pair/provider-specific | secret, server-only           |

Set the provider callback to `${AUTH_URL}/api/auth/callback/google` when Google sign-in is enabled.
The application rejects non-HTTPS production `AUTH_URL` values except loopback smoke environments.
The ingress must preserve the canonical host and HTTPS forwarding headers. `SMTP_USER` and
`SMTP_PASSWORD` are all-or-nothing.

## Model routing and execution

| Variable                                      | Purpose                                                  | Scope  | Required                 | Classification          |
| --------------------------------------------- | -------------------------------------------------------- | ------ | ------------------------ | ----------------------- |
| `MODEL_PROVIDER`                              | Selects `openrouter`, `openai`, `anthropic`, or `google` | worker | no; default `openrouter` | non-secret, server-only |
| `MODEL_DEADLINE_MS`                           | Provider request deadline                                | worker | no; bounded default      | non-secret, server-only |
| `MODEL_MAX_ATTEMPTS`                          | Provider attempt limit                                   | worker | no; bounded default      | non-secret, server-only |
| `MODEL_MAX_COST_MICROS`                       | Planning-run spend cap                                   | worker | no; bounded default      | non-secret, server-only |
| `MODEL_MAX_DELTA_EVENTS`                      | Planning event count cap                                 | worker | no; bounded default      | non-secret, server-only |
| `MODEL_MAX_OUTPUT_CHARS`                      | Planning response character cap                          | worker | no; bounded default      | non-secret, server-only |
| `MODEL_MAX_OUTPUT_TOKENS`                     | Planning output token cap                                | worker | no; bounded default      | non-secret, server-only |
| `MODEL_INPUT_COST_MICROS_PER_MILLION_TOKENS`  | Accounting rate for selected model                       | worker | yes                      | non-secret, server-only |
| `MODEL_OUTPUT_COST_MICROS_PER_MILLION_TOKENS` | Accounting rate for selected model                       | worker | yes                      | non-secret, server-only |
| `OPENROUTER_API_KEY`                          | OpenRouter credential                                    | worker | selected provider only   | secret, server-only     |
| `OPENROUTER_BASE_URL`                         | Optional OpenRouter-compatible endpoint override         | worker | optional                 | non-secret, server-only |
| `OPENROUTER_MODEL`                            | Selected OpenRouter model                                | worker | selected provider only   | non-secret, server-only |
| `OPENAI_API_KEY`                              | OpenAI credential                                        | worker | selected provider only   | secret, server-only     |
| `OPENAI_BASE_URL`                             | Optional OpenAI-compatible endpoint override             | worker | optional                 | non-secret, server-only |
| `OPENAI_MODEL`                                | Selected OpenAI model                                    | worker | selected provider only   | non-secret, server-only |
| `ANTHROPIC_API_KEY`                           | Anthropic credential                                     | worker | selected provider only   | secret, server-only     |
| `ANTHROPIC_BASE_URL`                          | Optional Anthropic endpoint override                     | worker | optional                 | non-secret, server-only |
| `ANTHROPIC_MODEL`                             | Selected Anthropic model                                 | worker | selected provider only   | non-secret, server-only |
| `GOOGLE_API_KEY`                              | Google model credential                                  | worker | selected provider only   | secret, server-only     |
| `GOOGLE_BASE_URL`                             | Optional Google model endpoint override                  | worker | optional                 | non-secret, server-only |
| `GOOGLE_MODEL`                                | Selected Google model                                    | worker | selected provider only   | non-secret, server-only |
| `EXECUTION_MODEL_MAX_COST_MICROS`             | Static-site generation spend cap                         | worker | no; bounded default      | non-secret, server-only |
| `EXECUTION_MODEL_MAX_HTML_BYTES`              | Generated HTML byte limit                                | worker | no; bounded default      | non-secret, server-only |
| `EXECUTION_MODEL_MAX_OUTPUT_CHARS`            | Generation character cap                                 | worker | no; bounded default      | non-secret, server-only |
| `EXECUTION_MODEL_MAX_OUTPUT_TOKENS`           | Generation token cap                                     | worker | no; bounded default      | non-secret, server-only |
| `DAYTONA_API_KEY`                             | External sandbox credential                              | worker | yes for execution runs   | secret, server-only     |
| `DAYTONA_API_URL`                             | Optional Daytona control-plane endpoint                  | worker | optional                 | non-secret, server-only |
| `DAYTONA_TARGET`                              | Optional sandbox target identifier                       | worker | optional                 | non-secret, server-only |
| `SANDBOX_COMMAND_TIMEOUT_SECONDS`             | Per-command sandbox timeout                              | worker | no; bounded default      | non-secret, server-only |
| `SANDBOX_MAX_DURATION_MS`                     | Total sandbox duration cap                               | worker | no; bounded default      | non-secret, server-only |
| `SANDBOX_TTL_MINUTES`                         | Ephemeral sandbox TTL                                    | worker | no; bounded default      | non-secret, server-only |
| `ARTIFACT_MAX_ZIP_BYTES`                      | ZIP upload size cap                                      | worker | no; bounded default      | non-secret, server-only |

Do not configure unselected provider credentials. Base URL overrides require a security review; omit
them to use the adapter defaults.

## Deployment-only inputs

`POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` are required only when operating the local
or self-hosted Compose PostgreSQL container; `POSTGRES_PASSWORD` is secret. `WAKIL_IMAGE_TAG` is a
required non-secret immutable image version (use the commit SHA) for production Compose.
`WEB_S3_ACCESS_KEY_ID`/`WEB_S3_SECRET_ACCESS_KEY` and
`WORKER_S3_ACCESS_KEY_ID`/`WORKER_S3_SECRET_ACCESS_KEY` are secret production-Compose inputs that
map the two least-privileged tokens to each container's standard `S3_*` runtime names.
`SMOKE_BASE_URL` and `SMOKE_WORKER_URL` are non-secret operator inputs to the post-deploy smoke
script; `SMOKE_UNSIGNED_OBJECT_URL` is optional sensitive test-fixture input and must never be a
signed URL. `SMOKE_ALLOW_HTTP` is a non-secret local-container-only override and must be absent in
production. These are not application runtime variables.

There is no direct web-to-worker HTTP credential: web and worker coordinate through tenant-scoped
PostgreSQL records and the private Redis queue. No monitoring provider variables are currently
implemented. Add provider-specific monitoring variables only when that provider is approved.
