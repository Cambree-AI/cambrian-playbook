# api-aws/ — AWS Lambda API sources (issue #86)

Lambda sources for the Vercel → AWS function migration (Phase 3+,
docs/aws-migration-plan.md §8). **Vercel's `api/` directory stays live and
untouched** — endpoints move here one at a time (strangler pattern), and the
Vercel copy of an endpoint is deleted only in the final conversion issue.

## Layout

```
api-aws/
├── shared/            # bundled into every function (see decision record below)
│   ├── guard.js       # port of api/_guard.js: origin allowlist, CORS, JWT (HS256 + JWKS), caps
│   ├── usage.js       # port of api/_usage.js: api_usage_log via Supabase REST
│   ├── adapter.js     # APIGW HTTP API (payload v2) event/response ⇄ Vercel (req, res)
│   ├── secrets.js     # cold-start Secrets Manager load → process.env
│   ├── provision.js   # port of api/_provision.js: trial-org provisioning (issue #87)
│   └── fetch-ssrf.js  # port of api/_fetch-ssrf.js: SSRF validation (issue #87);
│                      #   the fetch-ssrf suite runs against BOTH copies
├── contact/index.js   # pilot endpoint (issue #86)
├── knowledge/index.js # JWT-gated knowledge layer (issue #87) — bundles src/data/**
├── enrich-free/index.js # SEC EDGAR + Wikidata enrichment (issue #87)
├── request-access/index.js # beta request form + promo auto-provision (issue #87)
├── invite/index.js    # org invitations, admin JWT (issue #87)
├── referral/index.js  # referral codes + reward processing (issue #87)
├── fetch/index.js     # SSRF-defended leadership-page fetcher + render (issue #87)
├── build.mjs          # esbuild: <name>/index.js → dist/<name>/index.mjs
└── package.json       # esbuild only; `npm run build`
```

Each subdirectory containing an `index.js` is an endpoint, deployed as one
Lambda routed at `/api/<name>` by `infra/modules/api` (route paths mirror
Vercel so the client swap is mechanical).

## Decision record: shared code is a **bundled module, not a Lambda layer**

esbuild bundles `shared/` into every function zip. Chosen over a layer
because: one artifact per function (no layer-version coordination between
code and infra applies), esbuild tree-shakes unused shared code, cold starts
are identical, and zips stay tiny (~7KB). Revisit only if a port needs a
large native dependency. `@aws-sdk/*` is never bundled — nodejs22.x ships
SDK v3 in the runtime.

Platform-level differences from the Vercel originals (every port inherits
these; do not re-add them per endpoint):

- **No in-memory rate limiting.** The `checkRateLimit` Map in `api/_guard.js`
  relies on warm-instance reuse that Lambda doesn't guarantee. Baseline
  protection is API Gateway stage throttling (`infra/modules/api`
  `throttling_*` vars); per-user usage plans are the Phase 8 follow-up.
- **`CAMBREE_ENV=prod` replaces `VERCEL_ENV=production`** for fail-closed
  behavior (set by Terraform on every function).
- **Supabase over REST/pooler only** (plan §6): Lambdas must use the
  PostgREST API (as `shared/usage.js` does) or the Supavisor pooler — never a
  direct Postgres connection.

**Keep `shared/guard.js` in sync with `api/_guard.js`** (origin allowlist,
CORS headers, JWT semantics) until Vercel is decommissioned. The
`api-aws-tests` workflow triggers on changes to either copy.

## Secrets (the one manual step per environment)

Terraform creates the per-env Secrets Manager **container only** —
`cambree/<env>/api-env` — with no value, so secret values never exist in git
or Terraform state. After the first apply in an env, set the value **once**:

```sh
# Write the JSON locally (never commit it), e.g. secrets.json:
# { "SUPABASE_SERVICE_KEY": "...", "SUPABASE_JWT_SECRET": "...", "ANTHROPIC_API_KEY": "..." }
aws secretsmanager put-secret-value \
  --secret-id cambree/<env>/api-env \
  --secret-string file://secrets.json
rm secrets.json
```

Copy values from the Vercel project's env vars for the matching environment.
Include only keys an AWS endpoint actually reads (the pilot needs
`SUPABASE_SERVICE_KEY`; `knowledge` adds `SUPABASE_JWT_SECRET` — the first
ported endpoint that verifies HS256 JWTs; `request-access` adds
`RESEND_API_KEY`; `invite` adds `SUPERUSER_EMAIL` — plaintext-ish config, but
it rides the container so per-env values stay out of git; `fetch` adds
`FIRECRAWL_API_KEY` for Stage-2 render escalation — without it the endpoint
still works but bot-protected/SPA pages return render_failed); add keys as later ports need them by running
`put-secret-value` again with the full updated JSON. Note: secrets are cached
per Lambda instance for its lifetime, so an updated value only reaches
instances started after the change — redeploy the function (or wait for
instance recycling) to force a refresh.

Every Lambda receives the container's ARN as `SECRETS_ARN`; `shared/secrets.js`
fetches it on cold start and merges keys into `process.env` (Terraform-set
plaintext env vars win over secret keys).

## Build & deploy

- CI (`.github/workflows/terraform.yml`) runs `npm ci && npm run build` here
  before every `terraform plan`/`apply`; `archive_file` zips `dist/<name>/`
  so a code-only merge redeploys through the same pipeline (changed
  `source_code_hash`).
- Local check: `cd api-aws && npm ci && npm run build`.
- Unit tests: `npm run test:apiaws` from the repo root (no network, no AWS —
  Supabase JWKS/REST are mocked in `tests/api-aws/`).

## Port recipe (per endpoint — the mechanical checklist)

1. **Create `api-aws/<name>/index.js`.** Copy the handler body from
   `api/<name>.js` verbatim; import `applyCors`/`isAllowedOrigin`/`verifyJwt`
   from `../shared/guard.js`, usage logging from `../shared/usage.js`, and
   wrap with `httpAdapter` from `../shared/adapter.js`:
   `export const handler = httpAdapter(yourHandler);`
   Call `await loadSecrets()` first if the endpoint reads any secret env var.
   Delete `checkRateLimit` calls (platform difference above). `await` any
   write you care about — Lambda freezes on return, so fire-and-forget dies.
2. **Await-audit.** Anything the Vercel copy left dangling
   (`.catch(() => {})` fire-and-forget) must either be awaited or accepted as
   lost on freeze.
3. **Secrets.** If the endpoint needs a new secret key, add it to the JSON in
   `cambree/<env>/api-env` in each env (manual step above). Plaintext config
   goes in `common_environment` / the endpoint's `environment` map in
   `infra/envs/*/api.tf`.
4. **Terraform.** Add the endpoint key to the `endpoints` map in
   `infra/envs/{dev,staging,prod}/api.tf` (override `timeout_seconds` /
   `memory_mb` if the defaults 10s/256MB don't fit).
5. **Tests.** Add `tests/api-aws/<name>.test.js` mirroring
   `contact.test.js`: drive the real `handler` with APIGW v2 events, mock
   every external service via a `globalThis.fetch` stub, and assert status
   codes + response bodies **byte-identical to the Vercel copy** (that's the
   parity oracle). Add the file to the `test:apiaws` script if you create a
   new test file, and the Vercel original's path to
   `.github/workflows/api-aws-tests.yml` trigger paths. This step is
   enforced: `tests/api-aws/coverage.test.js` fails CI for any endpoint
   whose test is missing or unwired.
6. **Merge through dev.** The terraform workflow plans on the PR and applies
   on merge; verify with the curl matrix (disallowed origin → 403, preflight
   → 204 + ACAO, oversized body → 400, happy path) against
   `<api_endpoint output>/api/<name>`, and diff responses against the Vercel
   endpoint for identical inputs.
7. **Point the SPA at it.** Set the env's Amplify build var
   `VITE_API_ENDPOINT_ORIGINS` (in `infra/envs/<env>/amplify.auto.tfvars`) to
   include `{"/api/<name>": "<api_endpoint output>"}`. Amplify does not
   rebuild on env-var changes — trigger a release. Vercel-served deploys keep
   using the Vercel endpoint (the var is unset there) until cutover.
   **CSP prerequisite (one-time per env, not per endpoint):** the env's
   `api_endpoint` origin must be in the `connect-src` list in `customHttp.yml`
   — otherwise the browser blocks the call before it leaves the page
   (all three envs added 2026-09-03).
8. **Promote** dev → staging → main. The Vercel copy stays deployed but
   unreferenced; it is removed in the final conversion issue.
