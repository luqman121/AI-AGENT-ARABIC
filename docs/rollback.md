# Production rollback

Every release uses immutable web, worker, and migration images tagged with the same full commit SHA.
Record the last known-good SHA and schema compatibility before deployment. Rollback is not
authorized merely by this document; the incident/release owner makes the decision.

## Trigger

Rollback or stop traffic when the new revision fails readiness after the configured startup window,
causes a critical error/latency/job-failure regression, violates tenant/security boundaries, or
cannot complete its migration safely. Prefer stopping a rollout while the known-good revision still
serves traffic.

## Application and worker rollback

1. Freeze further deployments and record timestamps, release SHAs, migration result, and symptoms.
2. Stop routing new traffic/jobs to the bad revision. Mark new workers unready and allow bounded
   active jobs to drain; do not kill them unless continuing is unsafe.
3. Point web and worker independently to their previous immutable image SHA. They must use the same
   contract-compatible release pair unless a documented mixed-version window was tested.
4. Restore traffic gradually after both previous revisions pass liveness/readiness. Run the smoke
   script, inspect queue/database state, and monitor at least one full alert window.
5. Reconcile queued/running/failed database runs. Re-enqueue only through existing idempotent paths;
   never edit run history or fabricate success.

## Database decision

Do not automatically reverse Drizzle migrations. If the previous application is compatible with the
new additive schema, leave the schema in place and roll back only images. If compatibility is
uncertain, stop and forward-fix. If a destructive/incompatible migration was applied, image rollback
is unsafe: enter maintenance mode, stop writers, and either ship a reviewed forward fix or restore
the named pre-migration database backup. A restore loses writes after its recovery point and
requires explicit incident-owner approval and reconciliation.

## R2 compatibility

Current artifact rows store provider-independent immutable object keys and metadata, so web/worker
image rollback must continue using the same private bucket and signing contract. Do not delete,
rename, bulk-copy, or make the bucket public during rollback. If a release changed object format or
retention, verify the previous reader can consume new objects before rolling it back; otherwise
forward-fix the reader.

## Failed-health automatic rollback policy

The platform may automatically stop traffic shifting when new web/worker readiness fails, but it
must not automatically restore a database or delete R2 data. Cap automated rollback to the prior
signed image SHA. Repeated rollback or health failure pages the release owner and blocks additional
deployments until a root cause and safe next revision are reviewed.
