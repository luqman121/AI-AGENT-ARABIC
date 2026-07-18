# Production security review

This review records repository-verifiable controls separately from provider controls that require
manual production access.

## Verified in source

- Runtime environment parsing fails by variable name without printing values. Database, Redis,
  model, sandbox, SMTP, authentication, and R2 credentials are server-only and have no public env
  prefix. `.env*` files are ignored except the placeholder-only `.env.example`; Docker excludes all
  local environment files.
- R2 is accessed only from web/worker server modules through AWS SDK v3's S3-compatible client.
  PostgreSQL stores immutable object keys and metadata, not provider URLs. Preview/download URLs are
  tenant-authorized, generated server-side, and expire after five minutes.
- Object keys are derived from server-owned workspace/project/run/artifact identifiers, not raw
  filenames. Uploads enforce byte limits, content metadata, and SHA-256 before durable completion.
- The browser receives no storage/model/database/Redis/SMTP/sandbox credentials. Generated content
  executes only in the external sandbox and previews use a separate signed origin in a sandboxed
  iframe with restrictive policy.
- Web tenant reads and mutations authorize membership server-side. Redis-backed rate limits fail
  closed. Idempotency keys and database constraints bound retried run creation/queue delivery.
- Production `AUTH_URL` requires HTTPS except loopback smoke environments. Auth.js database sessions
  and production HTTPS enable secure session-cookie behavior. OAuth values and SMTP credentials are
  validated as complete pairs.
- No broad CORS policy is configured; application API access remains same-origin. Health responses
  contain only service and aggregate state. Web and worker structured logging redact configured
  credential families; worker errors log names rather than provider payloads.
- Web, worker, and migration run separately as non-root containers. Only web joins the ingress
  network; worker health, PostgreSQL, and Redis remain private.

## Required manual verification

- [ ] Cloudflare web token is bucket-scoped **Object Read only**; worker token is bucket-scoped
      **Object Read & Write** with delete operations; neither has Admin/account-wide permission.
- [ ] R2 `r2.dev` public URL and custom domains are disabled; a known unsigned fixture returns
      401/403/404 and an authorized five-minute signed URL expires.
- [ ] PostgreSQL and Redis accept connections only from approved private networks; TLS,
      authentication, firewall rules, and least-privileged database role are enabled.
- [ ] Production OAuth callback URLs exactly match HTTPS `AUTH_URL`; ingress accepts only the
      canonical host and strips/sets trusted forwarded headers. CORS remains restricted.
- [ ] Secret-manager access is split by service: web has auth/SMTP/R2 signing; worker has
      model/Daytona/R2; migration has only `DATABASE_URL`. Rotation owners and expiry are recorded.
- [ ] Dependency audit, image scan, and SBOM have no unresolved critical vulnerabilities or
      unreviewed high vulnerabilities at release time.
- [ ] Production error pages/log sinks have been exercised with synthetic failures and expose no
      stack trace, token, signed URL, prompt, file content, or personal data.
- [ ] Rate-limit thresholds and upload MIME/size policy match the approved production abuse model.

If any manual item fails, block deployment. Do not weaken bucket privacy, TLS, authorization,
validation, or error redaction to make a health check pass.
