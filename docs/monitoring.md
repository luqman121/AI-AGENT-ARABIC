# Monitoring and alerts

No monitoring vendor or production telemetry destination is configured, so monitoring is not yet
operational. Use the deployment platform's metrics/logs plus an OpenTelemetry Collector as the
provider-neutral baseline. Add an approved error tracker only after security, residency, retention,
and cost review; do not send prompts, uploads, generated files, email addresses, cookies, signed
URLs, or credentials.

## Logging contract

- Emit JSON with timestamp, severity, `service`, environment, immutable release SHA, and a generated
  request/job correlation ID where practical. Web and worker use Pino service tags and credential
  redaction; worker job logs include run ID and status without provider payloads.
- Keep user/workspace identifiers pseudonymous and avoid project titles, prompts, message bodies,
  file contents, object keys, provider payloads, authorization headers, cookies, and URL query
  strings. Treat signed URL query strings as credentials.
- Configure ingress access logs to omit/redact query strings and sensitive headers. Keep production
  debug logging disabled; default worker level is `info`.
- Retain security/audit logs according to policy, operational application logs for 14-30 days, and
  restrict access by least privilege. Test redaction before enabling a new sink.

## Required metrics and dashboards

| Area       | Signals                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------- |
| Web        | external uptime, `/api/health`, `/api/ready`, request rate, p50/p95/p99 latency, 4xx/5xx            |
| Worker     | `/health`, `/ready`, process restarts, active jobs, job duration, event-loop lag, memory/CPU        |
| Queue      | waiting/active/delayed/stalled/failed counts, oldest waiting age, completion/failure rate           |
| PostgreSQL | availability, connections/pool saturation, latency, errors, locks, storage, replication/backup      |
| Redis      | availability, latency, connections, memory, eviction, persistence status, rejected connections      |
| R2         | read/write/delete/sign errors and latency, operation volume, storage growth, unsigned-access probes |
| Release    | migration status, deployment status, health progression, rollback count, release SHA                |

## Alert thresholds

Tune thresholds after two weeks of production baseline data. Use minimum event/request counts to
avoid noise and group related dependency failures into one incident.

### Critical (page immediately)

- Public web probe fails from two locations for 5 minutes, or readiness has no healthy instance for
  3 minutes.
- Worker liveness/readiness has no healthy consumer for 5 minutes while queued work exists.
- PostgreSQL or Redis fails three consecutive probes over 2 minutes.
- HTTP 5xx exceeds 5% for 5 minutes with at least 100 requests.
- Oldest queued job exceeds 10 minutes or waiting depth exceeds 200 for 10 minutes.
- Ten or more failed jobs in 15 minutes, or the same run type fails repeatedly across releases.
- R2 operations exceed 10% errors for 5 minutes with at least 20 operations.
- A database backup fails after one automatic retry, or the restore/PITR window becomes unavailable.
- Two consecutive deployment/preflight failures for the same release, or a rollout leaves no healthy
  old/new revision.

### Warning (investigate during support hours)

- p95 web latency exceeds 2 seconds for 15 minutes with at least 100 requests.
- HTTP 5xx exceeds 2% for 10 minutes with at least 100 requests.
- Oldest queued job exceeds 2 minutes or waiting depth exceeds 50 for 10 minutes.
- Three failed jobs in 15 minutes; any stalled-job event; Redis memory exceeds 75%; database pool
  exceeds 80%; or disk/storage exceeds 75%.
- R2 operations exceed 2% errors for 10 minutes with at least 20 operations.
- Worker memory exceeds 80% of its limit for 15 minutes or restarts three times in 30 minutes.

### Informational

- Deployment started/completed, migration completed, worker scaled, token rotated, lifecycle rule
  changed, backup completed, or restore drill completed. Route these to the release timeline, not a
  pager.

## Escalation and validation

The on-call engineer acknowledges critical alerts within 10 minutes, checks the release timeline and
dependency dashboards, and follows `docs/rollback.md`. Escalate database/Redis/R2 provider incidents
to the provider after confirming network and credentials without exposing them. Each quarter,
trigger synthetic non-production alerts, confirm routing, silence duplicates, and update
owner/contact details in the private incident system.
