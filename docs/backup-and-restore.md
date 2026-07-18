# Backup and restore

No production backup configuration or successful restore is visible from this repository. The
following controls are required manual production configuration; do not mark them complete until a
dated restore drill proves them.

## PostgreSQL

- Enable encrypted automated backups at least daily, retain daily backups for 35 days and monthly
  backups for 12 months (adjust only to an approved retention policy), and enable point-in-time
  recovery with at least a seven-day window when the provider supports it.
- Keep backups in a separate failure domain/account with least-privileged restore access. Alert on
  missed backups, loss of PITR coverage, encryption failure, or untested credentials.
- Before every schema release, create a named pre-migration restore point. Never put backup URLs,
  encryption keys, database dumps, or access credentials in Git.

## Redis and queues

Redis is transport and ephemeral coordination, but queued work is operationally important. Use a
private authenticated instance with `noeviction` and managed persistence or AOF. PostgreSQL remains
the source for user-visible run state/events. After Redis loss, reconcile database runs in
queued/running states, re-enqueue only through the idempotent job boundary, and never invent missing
progress. A Redis restore must not overwrite newer PostgreSQL truth.

## Cloudflare R2

R2 object deletion is irreversible through the current S3 API, and the application legitimately
needs `DeleteObject`. Do not assume native object version recovery. Keep both application tokens
bucket-scoped, restrict delete-capable credentials to the worker, and alert on unusual delete/error
volume.

For artifacts whose approved retention exceeds acceptable data-loss risk, schedule an encrypted copy
to a separately credentialed bucket/account or another object-storage provider using a tool such as
`rclone`. Use immutable dated prefixes/manifests and verify object count, bytes, metadata, and
SHA-256 samples. The backup credential must not be available to the application. Cloudflare
documents [rclone copy support](https://developers.cloudflare.com/r2/examples/rclone/) and lifecycle
rules for expiry; review lifecycle rules carefully because expiry deletes objects.

Define and approve artifact retention before adding a lifecycle rule. Never apply a blanket delete
rule to user artifacts without product/legal approval. Keep incomplete multipart cleanup separate
from artifact retention.

## Application configuration

Back up deployment manifests, protected-environment settings, DNS/ingress configuration, alert
rules, and secret _names/owners_ in the infrastructure system. Back up secret values only in an
approved encrypted secret manager with access audit and recovery keys; plaintext exports and Git are
prohibited. Test credential rotation independently from data restore.

## Quarterly restore drill

1. Open a tracked drill with owner, recovery point objective (RPO), recovery time objective (RTO),
   and an isolated non-production destination.
2. Restore the selected PostgreSQL backup/PITR point to a new private database. Do not overwrite an
   existing environment.
3. Run `pnpm db:migrate` only if the restored schema predates the tested release, then verify tenant
   counts, constraints, sessions, run/event ordering, artifact rows, and representative reads.
4. Create a fresh Redis instance, start one worker, and reconcile/re-enqueue a synthetic
   non-production run through normal idempotent paths.
5. Restore a sampled R2 backup prefix into a separate test bucket and verify object count, content
   length, metadata, SHA-256, unsigned denial, and authorized signed read. Never use user objects in
   a public test.
6. Run readiness and smoke checks, record actual RPO/RTO, delete isolated drill resources only after
   evidence review, and remediate failures with an owner/deadline.
