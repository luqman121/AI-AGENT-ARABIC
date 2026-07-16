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
package, and starts the web and idle worker apps. Existing `.env.local` values are never
overwritten.

Local endpoints:

| Service       | URL / address                      |
| ------------- | ---------------------------------- |
| Web           | `http://127.0.0.1:3000`            |
| Web liveness  | `http://127.0.0.1:3000/api/health` |
| PostgreSQL    | `127.0.0.1:5432`                   |
| Redis         | `127.0.0.1:6379`                   |
| MinIO API     | `http://127.0.0.1:9000`            |
| MinIO console | `http://127.0.0.1:9001`            |
| Mailpit SMTP  | `127.0.0.1:1025`                   |
| Mailpit UI    | `http://127.0.0.1:8025`            |

The MinIO bootstrap service creates `wakil-dev` as a private bucket. M0 does not include application
storage access or public object URLs.

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
pnpm build
pnpm test:smoke
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
