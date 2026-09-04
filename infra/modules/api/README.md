# infra/modules/api — API Gateway + Lambda platform (issue #86)

The platform Vercel serverless functions port onto (migration Phase 3+,
docs/aws-migration-plan.md §8). One instantiation per env in
`infra/envs/*/api.tf`.

## What it creates

- **API Gateway HTTP API** (not REST — cheaper, simpler; auth is JWT-in-code
  via `api-aws/shared/guard.js` to preserve `api/_guard.js` semantics, so no
  API Gateway authorizer) with a `$default` auto-deploy stage.
- **One Lambda per `endpoints` key** (nodejs22.x, arm64), routed at
  `ANY /api/<name>` — method policy and CORS stay in handler code for parity
  with Vercel routing. Code comes from `api-aws/dist/<name>/` (built by CI
  before plan/apply; `archive_file` hashes it into the plan, so code-only
  merges redeploy).
- **CloudWatch log groups** (Lambda per-function + API access logs), retention
  `log_retention_days` (default 30).
- **Stage throttling** (`throttling_rate_limit`/`throttling_burst_limit`) —
  the platform replacement for the Vercel in-memory per-IP limiter. Per-user
  usage plans: Phase 8.
- **Secrets Manager container** `cambree/<env>/api-env` — container only,
  never a version: no secret value in git or state. Filled once per env via
  `aws secretsmanager put-secret-value` (documented in api-aws/README.md).
  Every Lambda gets `SECRETS_ARN` + `GetSecretValue` on exactly that ARN.
- **Per-endpoint IAM roles**: basic execution + read on the env secret.

## Inputs of note

- `endpoints` — map keyed by endpoint name; keys must match `api-aws/<name>/`
  directories. Optional per-endpoint `timeout_seconds` (10), `memory_mb`
  (256), `environment` (plaintext only).
- `common_environment` — plaintext env vars on every function. **Never put a
  secret here — this map lands in Terraform state.** Secrets go in the
  container.
- `dist_dir` — path to `api-aws/dist`; plan fails if CI didn't build first.

## Outputs

`api_endpoint` (the invoke URL — feed it to the SPA's
`VITE_API_ENDPOINT_ORIGINS` map), `secret_name`/`secret_arn`,
`lambda_function_names`.

## Adding an endpoint

Follow the port recipe in **api-aws/README.md** — the Terraform half is just
a new key in each env's `endpoints` map.
