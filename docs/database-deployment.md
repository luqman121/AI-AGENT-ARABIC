# Database deployment

Wakil uses ordered, committed Drizzle SQL migrations under `packages/db/migrations`. Production must
run migrations through the dedicated migration image or `pnpm db:migrate`; never use
`drizzle-kit push`. The migrator opens a single PostgreSQL connection, uses Drizzle's migration
ledger, applies pending migrations in order, and exits. Re-running it is expected to be idempotent.

## Before deployment

1. Confirm the release commit contains the expected SQL and migration metadata.
2. Confirm no second migration job, web startup hook, or worker startup hook can run concurrently.
3. Create a provider snapshot/backup and record its opaque identifier outside Git. Verify the most
   recent automated backup is restorable and the retention window is sufficient.
4. Test the exact release image and migration set against both an empty non-production database and
   a restored copy of the current schema. Review lock duration and required free space.
5. Stop if a migration is destructive, rewrites a large table, or has no compatible application
   rollout path. Obtain explicit maintenance approval.

## Apply once

Use one of these equivalent paths:

```bash
pnpm db:migrate
```

```bash
docker run --rm --network <private-network> \
  --env DATABASE_URL \
  wakil-migrate:<commit-sha>
```

Inject `DATABASE_URL` from the production secret store. Do not place it in shell history, command
arguments, logs, or an image. A successful command prints only `Database migrations applied.` and
exits zero. A nonzero exit blocks the web/worker rollout.

## Post-migration verification

1. Verify the migration ledger contains every committed migration through
   `0003_fearless_the_stranger.sql` (or the newer release head).
2. Verify representative tenant-scoped reads, authentication session reads, queue-run reads, and
   artifact metadata reads through the application readiness/smoke path.
3. Check database error rate, connection use, lock waits, replication lag, and query latency before
   continuing rollout.
4. Preserve the backup until the release passes its observation window.

## Connection budget

Each web or worker process currently caps its PostgreSQL client pool at five connections; the
migration job uses one. Before scaling, reserve provider/admin capacity and require
`5 × (web instances + worker instances) + migration/admin headroom` to stay below the database
limit. Use a provider pooler in transaction-compatible mode when the instance count makes direct
connections unsafe, and load-test session/auth and worker transactions before changing pool mode.

## Rollback limitations

The repository contains forward migrations, not generated down migrations. Never hand-edit the
migration ledger. Application rollback is safe only while the old image understands the new schema.
For an irreversible or incompatible migration, stop traffic and restore the pre-deployment database
snapshot, accepting loss of writes after that snapshot, or ship a reviewed forward fix. The release
checklist must record which path applies before migration.
