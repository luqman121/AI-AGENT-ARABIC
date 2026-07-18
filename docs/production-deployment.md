# Production deployment guide

This guide is provider-neutral. It prepares a release but does not authorize a production deploy.

## Immutable images

Build all targets from the same reviewed commit and tag them with the full commit SHA:

```bash
docker build --target web --tag <registry>/wakil-web:<commit-sha> .
docker build --target worker --tag <registry>/wakil-worker:<commit-sha> .
docker build --target migrate --tag <registry>/wakil-migrate:<commit-sha> .
```

The Dockerfile uses multi-stage builds, pinned Node.js/pnpm versions, standalone Next.js output,
production-only worker/migration dependencies, non-root runtime users, and no local environment
files in the build context. Scan the images and software bill of materials before registry push.

`infra/docker-compose.production.yml` expresses the service boundaries and can be used by a
compatible private host. It intentionally contains no PostgreSQL or Redis credentials and publishes
no application port directly; attach only the `ingress` network to the approved TLS proxy. Managed
PostgreSQL, managed Redis, R2, SMTP, model, and Daytona endpoints are injected at runtime.

## Release order

1. Complete `docs/production-release-checklist.md` through “Before deployment”.
2. Run CI and the manual `Production release preflight` for the exact commit. Configure the GitHub
   `production` environment with required reviewers; do not add production secrets to PR jobs.
3. Build, scan, sign, and push the three immutable images.
4. Back up PostgreSQL and verify the restore point.
5. Run the migration image once on the private network and require exit code zero.
6. Deploy web and worker with zero active traffic, validate readiness, then shift traffic gradually.
7. Run the production smoke test from a network that can reach both public web and private worker:

```bash
SMOKE_BASE_URL=https://<public-host> \
SMOKE_WORKER_URL=https://<private-health-host> \
pnpm test:production-smoke
```

`SMOKE_UNSIGNED_OBJECT_URL` may optionally reference a non-user, unsigned fixture and must return
401, 403, or 404. Never pass a signed URL, credentials, object contents, or a user object.
Authorized signed-download verification remains a manual test using a dedicated release-test account
and fixture because the repository has no safe production test identity.

The script requires HTTPS except for loopback. `SMOKE_ALLOW_HTTP=true` exists only for isolated
local container-network validation and must not be set during a production smoke test.

## Runtime policy

- Restart web/worker on failure with exponential platform backoff; do not restart a successful
  migration job. Keep at least two web instances when the platform permits.
- Use readiness for traffic admission and liveness for restart. Do not make public readiness output
  reveal dependency names or errors.
- Give the worker a termination grace period of at least the maximum job duration. Deploy worker
  revisions with a drain/replace strategy so active jobs can finish.
- Set memory/CPU limits from staging measurements. App containers have no persistent volume; all
  durable state belongs to PostgreSQL or R2.
- Do not enable CORS for broad origins. Current browser requests are same-origin, and R2 downloads
  use short-lived signed navigation URLs rather than client credentials.

## CI/CD boundary

Pull-request CI has read-only repository permissions and no production environment or secrets. It
runs formatting, lint, typecheck, unit/integration/migration tests, the production build, and all
three Docker builds. The manual release preflight is serialized through the protected `production`
environment but deliberately stops before migrations, registry pushes, deployment, and health checks
because no production platform is approved. Add provider-specific deploy steps only after deployment
credentials, protected-environment reviewers, registry, and rollback commands are approved.

## Troubleshooting

- Web liveness 200 but readiness 503: check private PostgreSQL/Redis reachability and runtime env;
  do not restart repeatedly before identifying the dependency.
- Worker liveness 200 but readiness 503: check Redis/BullMQ connectivity, queue permissions, and
  whether shutdown/drain is active.
- Migration exits nonzero: stop rollout, preserve logs with redaction, inspect database locks and
  migration ledger, and do not start web/worker on the new version.
- R2 401/403: verify endpoint jurisdiction, bucket, and the service's bucket-scoped token (web Read
  only; worker Read & Write). Permission changes may take up to one minute to propagate.
- Signed URL fails: confirm server clocks, five-minute expiry, endpoint, and that the bucket remains
  private. Never “fix” it by making the bucket public.
