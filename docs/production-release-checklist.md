# Production release checklist

Release SHA: `________________` Owner: `________________` Date: `________________`

No checked repository item authorizes deployment. Provider and production actions require an
approved owner, protected environment, credentials, and change window.

## Before deployment

- [ ] Review all uncommitted and staged changes; confirm no generated, debug, temporary, unrelated,
      local environment, credential, or health-check object remains.
- [ ] Review and approve the proposed logical commit plan; commit/push the exact reviewed files.
- [ ] Require green format, lint, typecheck, unit/integration/migration tests, production build,
      workflow validation, three Docker builds, Compose config, storage tests, and local smoke test.
- [ ] Configure production secrets from `docs/production-environment.md` in the protected secret
      manager; confirm no public-prefixed server secret and no secret in build arguments.
- [ ] Verify web uses a bucket-scoped Object Read only R2 token, worker uses bucket-scoped Object
      Read & Write (including delete), and the bucket remains private.
- [ ] Configure the GitHub `production` environment with required reviewers and branch/tag policy;
      never expose production secrets to pull requests or forks.
- [ ] Build, scan, sign, and push web/worker/migration images tagged with the full commit SHA.
- [ ] Verify PostgreSQL and Redis private networking, TLS/authentication, capacity, Redis
      `noeviction`/persistence, and database connection limits.
- [ ] Verify monitoring dashboards, critical alert routing, on-call ownership, maintenance window,
      and provider status pages.
- [ ] Back up the database, record the restore point privately, verify latest automated backup and
      PITR status, and confirm rollback/schema compatibility.
- [ ] Confirm backup/restore policy for R2 and Redis and that deployment configuration recovery is
      available.
- [ ] Complete a staging restore drill and the staging smoke/mobile checks for the release
      candidate.

## During deployment

- [ ] Freeze the release SHA and announce the deployment window.
- [ ] Run the migration image exactly once; require zero exit status before application rollout.
- [ ] Deploy web with no traffic, verify liveness/readiness, then shift traffic gradually.
- [ ] Deploy worker separately with drain/replace behavior and verify queue connection/readiness.
- [ ] Verify PostgreSQL connection, errors, locks, latency, and migration ledger.
- [ ] Verify Redis connection, queue depth, oldest job, failed/stalled jobs, memory, and eviction.
- [ ] Keep the previous immutable web/worker images available and watch rollback thresholds.

## After deployment

- [ ] Run `pnpm test:production-smoke` from an approved network and retain non-sensitive evidence.
- [ ] Verify homepage, authentication page, a database-backed authorized read, Redis/queue
      readiness, worker readiness, private unsigned R2 denial, authorized signed fixture download,
      and expiry.
- [ ] Complete `docs/mobile-release-checklist.md` on physical Android Chrome and iPhone Safari.
- [ ] Confirm web/worker uptime, HTTP 5xx/latency, queue/failed jobs, PostgreSQL, Redis, R2, CPU,
      memory, and disk/storage dashboards are receiving release-tagged data.
- [ ] Trigger/verify one safe informational and one synthetic warning alert; confirm critical paging
      route without causing a production outage.
- [ ] Verify the scheduled database backup and R2 backup-copy job after the release.
- [ ] Observe one full critical-alert window, record results, and close the release only when
      stable.

## Rollback decision

- [ ] Record whether the migration is backward-compatible, forward-fix only, or requires a database
      restore; identify the decision owner before rollout.
- [ ] Roll back on security/tenant isolation failure, unavailable healthy capacity, critical error
      regression, unsafe migration, or thresholds in `docs/monitoring.md`.
- [ ] Follow `docs/rollback.md`; never automatically reverse migrations, restore databases, delete
      objects, or make R2 public.
- [ ] After rollback, reconcile database run state and queue jobs through idempotent application
      paths and verify the previous release with smoke checks.

## Manual verification

- [ ] Production deployment platform, registry, ingress, DNS/TLS, and rollback commands approved.
- [ ] Production service credentials exist, are least-privileged, and have named rotation owners.
- [ ] R2 scope/private settings verified in the Cloudflare dashboard without displaying the token.
- [ ] PostgreSQL backup/PITR and restore access verified.
- [ ] Redis durability/eviction and private exposure verified.
- [ ] SMTP sender/domain and OAuth callback configuration verified.
- [ ] Monitoring, alerts, escalation contacts, and backup schedules verified.
- [ ] Real-device test evidence attached for both required mobile platforms.
- [ ] Explicit deployment approval recorded.
