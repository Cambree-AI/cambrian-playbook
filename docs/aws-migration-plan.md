# AWS Migration Plan

Status: **DRAFT — living document** (started 2026-07-30, issue #1 follow-on work)

Goal: migrate Cambrian Catalyst from Vercel to AWS as an **Amplify-hosted** frontend with all backend processing moved server-side onto **Step Functions + ECS Fargate + SQS**, all infrastructure defined in **Terraform**, and a **Jest test suite** (with mocked LLM calls) in place before the replatform.

Related docs: [ARCHITECTURE.md](ARCHITECTURE.md) (current structure), [branching.md](branching.md) (dev/staging/main flow the AWS environments must mirror).

---

## 1. Vercel-specific technology inventory → AWS mapping

| Vercel today | Where it lives | AWS target |
|---|---|---|
| Static hosting + CDN for the Vite SPA | Vercel build of `index.html` + `src/` | **Amplify Hosting** (S3 + CloudFront managed) |
| Serverless functions (`api/*.js`) | 15 Node functions | Split: light request/response endpoints → **Lambda behind API Gateway**; heavy AI pipeline → **Step Functions + Fargate** (§3) |
| `vercel.json` rewrites (`/privacy`, `/terms`, `/support`, SPA fallback) | `vercel.json` | Amplify **custom rewrites/redirects** |
| `vercel.json` security headers (HSTS, CSP, X-Frame-Options, …) | `vercel.json` | Amplify **custom headers** (`customHttp.yml`) / CloudFront response-headers policy. CSP `connect-src` must be updated for new API + Bedrock endpoints |
| `maxDuration` overrides (claude.js 120s, claude-stream.js 300s) | `vercel.json` + `export const config` | Non-issue on Fargate (no hard timeout); Lambda endpoints capped at 15 min |
| Vercel Cron (3 jobs: monthly token reset, weekly data refresh, weekly seller profiles) | `vercel.json` `crons` + `api/cron-*.js` | **EventBridge Scheduler** → Lambda (or SQS → existing job system), `CRON_SECRET` replaced by IAM |
| Preview deployments per branch (staging validation) | Vercel Git integration | Amplify **branch deployments**: `dev`, `staging`, `main` each auto-build; mirrors docs/branching.md |
| Environment variables / secrets | Vercel project settings | **SSM Parameter Store / Secrets Manager**, injected via Terraform into Amplify, Lambda, and Fargate task definitions |
| SSE streaming (`api/claude-stream.js` → `streamAI`) | Brief sections p1/p3/p4 stream to the UI | Replaced by the async job model (§3): status polling or **API Gateway WebSockets / AppSync subscriptions** for progress updates. (API Gateway does not proxy SSE well.) |
| Vercel 12-function limit workarounds (`hubspot.js` consolidation) | `api/hubspot.js` | No longer needed — can split into natural endpoints |
| Domain `cambriancatalyst.ai` | Vercel DNS | **Route 53** + ACM certificate, attached to Amplify |

**Stays as-is (not part of this migration):** Supabase (Postgres/Auth/RLS), Stripe, HubSpot, Apollo.io, SEC EDGAR. A later phase may evaluate RDS + Cognito, but the JWT verification in `api/_guard.js` continues to validate Supabase JWTs from Lambda/Fargate.

**LLM provider:** Anthropic API today; evaluate **Amazon Bedrock** for the Claude calls (§4).

---

## 2. Target architecture (summary)

```
Browser (Amplify-hosted SPA)
   │  submit job / poll status          direct (unchanged)
   ▼                                    ▼
API Gateway ── Lambda (auth = _guard logic, job submit/status,   Supabase (auth, data, RLS)
   │            knowledge, enrich, stripe, hubspot, invite, …)
   ▼
  SQS (job queue, DLQ)
   ▼
Step Functions (per-job state machine: ICP build, brief pipeline p1–p9
   │            waves, consistency validator, fit-signal extraction)
   ▼
ECS Fargate tasks (containerized workers; knowledge layer + prompts baked
   │            into the image, never client-side)
   ▼
Bedrock (Claude Haiku/Sonnet) and/or Anthropic API (web_search calls)
   ▼
Results → Supabase (account_outputs etc.) → frontend polls/subscribes
```

The key structural change: today `src/App.jsx` orchestrates the entire brief pipeline client-side (`generateBrief()`, 9 staggered micro-calls, wave timing, consistency validator). That orchestration moves into a **Step Functions state machine**; the frontend's job becomes *submit → watch progress → render results*. This is the largest refactor in the plan and is why the test suite comes first.

---

## 3. Backend processing: Step Functions + Fargate + SQS

- **SQS** is the intake: an API Lambda validates the request (JWT, org run limits — today's `_guard.js`/`_usage.js` logic) and enqueues a job (`icp_build`, `brief_generate`, `fit_score`, `post_call`). A DLQ captures poisoned jobs.
- **Step Functions** (Standard workflow) models what App.jsx does today with timers and promises:
  - Wave 1 (p1/p3/p5) → Wave 2 (p2/p4/p6) → Wave 3 (p7/p8/p9) as `Map`/`Parallel` states with max-concurrency 3;
  - the **synchronous consistency validator** as a required terminal state before a brief is marked complete (preserves the ROOT_CAUSE_ANALYSIS.md guarantee);
  - retries/backoff on Anthropic 500/529 replace the hand-rolled `claudeFetch` retry;
  - the 90s hard timeout becomes per-state `TimeoutSeconds`.
- **Fargate** runs the worker container for LLM-calling states (long-running, no Lambda 15-min ceiling, room for pdfjs/large prompts). The knowledge layer (`src/data/`) and prompt fragments are baked into this image — this replaces `/api/knowledge.js` as the way IP stays out of the client bundle. Small glue states can be Lambda where cheaper.
- **Progress/streaming:** each state writes progress to a job-status record; the SPA polls a `GET /jobs/:id` Lambda (v1) with an upgrade path to WebSockets/AppSync push (v2). The current SSE token-streaming UX is retired.
- **Job/state storage:** job metadata + intermediate p1–p9 outputs in Supabase (or DynamoDB if we want AWS-native job state — open question §9).

## 4. Bedrock evaluation (cost lever for Sonnet/Haiku)

- Claude Haiku and Sonnet are available on Bedrock; invoking via Bedrock (especially with cross-region inference profiles and batch/provisioned options) may reduce cost vs. direct Anthropic API for the high-volume research calls — a per-model cost comparison against the rates in `api/admin.js` is a Phase 5 task.
- **Constraint:** the Anthropic-hosted `web_search` server tool is **not available through Bedrock**. Pipeline steps that use it (p2 executives, p5 live search, smoke tests) must either (a) stay on the direct Anthropic API, or (b) replace web_search with our own search integration. Plan for a **dual-provider client** in the worker: Bedrock for non-search calls, Anthropic API for search calls, selected per pipeline step.
- Model IDs, the `_guard.js` allowlist, and `MODEL_FALLBACK` must be re-expressed as Bedrock model/inference-profile IDs; keep `temperature: 0` / `top_k: 1` determinism settings.
- Validation gate: run the golden set (lite, then full) against Bedrock output and diff against Anthropic-API baselines before switching any step — same >5-point regression rule as scoring changes.

## 5. Test suite (prerequisite work)

Build this **before** replatforming — it is the safety net for extracting logic out of App.jsx and for the orchestration rewrite.

- **Jest** as the runner for JS unit tests; **React Testing Library** (+ jsdom) for component tests. (Note: repo is Vite/ESM — configure Jest with babel-jest or use vitest-compatible config decisions early; the requirement is Jest.)
- **Unit targets (pure logic first):** `src/lib/fitScoring.js` (deterministic — ideal), `src/lib/utils.js`, `src/lib/org.js`, the consistency-validator and `mergeDeepIntel()` logic (must be extracted from App.jsx into `src/lib/` to be testable — this extraction is itself a migration deliverable).
- **Component targets:** extracted components (`OrgPanel`, `ReportPanel`, `SuperAdmin`, `UserDashboard`, `S9_SolutionFit`), then new components as App.jsx is decomposed.
- **LLM mocking (required):** no Jest test may call the live LLM. Mock at the client seam — `src/lib/api.js` (`callAI`/`callAIRaw`/`streamAI`) — with fixture responses (recorded real outputs, e.g. golden-set report JSON). Backend worker tests mock the Bedrock/Anthropic SDK the same way. The existing live-API **golden set** remains a separate integration tier (CI-gated, not part of `jest`).
- CI: Jest runs on every PR (free, fast); knowledge-lint stays; golden-set lite stays PR-optional/label-gated per the existing test policy.

## 6. Lambda scaling & concurrency (thousands of users)

Concurrency ≈ requests/sec × average duration, so Lambda limits bite on long handlers, not user count. Design rules:

- **No long-running work on Lambda.** All LLM pipeline calls (30–300s each) run on Fargate behind SQS — 200 simultaneous briefs × 9 micro-calls would otherwise consume the default regional limit (1,000 concurrent executions, shared across all functions) instantly. Lambda handlers stay short (<1s).
- **Light endpoints are safe at this scale:** ~200 req/s at 300ms ≈ 60 concurrent executions. Load follows active requests, not seats.
- **Job-status polling is the endpoint that scales with load:** 1,000 active briefs polling every 2s ≈ 500 req/s (still ~50–100 concurrent at 100–200ms). This is the strongest argument for the WebSockets/AppSync push upgrade (§9) — push removes the traffic class entirely.
- **Supabase connections, not Lambda concurrency, are the likelier scaling failure.** Hundreds of concurrent Lambdas opening direct Postgres connections will exhaust Supabase's pool first. Lambdas must use Supabase's pooler (Supavisor, transaction mode) or the REST/PostgREST API — never direct connections.
- **Phase 0 task:** request a Lambda concurrency quota raise (soft limit; tens of thousands available via support ticket).
- **Reserved concurrency** for critical functions (`stripe-webhook`, job submit) so bursty endpoints can't starve payments.
- **Cache the cacheable:** the knowledge endpoint is static per plan tier — CloudFront/API Gateway caching removes most of its traffic.
- **API Gateway throttling/usage plans** provide backpressure (and replace `_guard.js`'s in-memory per-IP limiter).
- **Burst behavior:** each function scales at ~1,000 concurrent per 10s; sudden spikes throttle briefly even under quota. SQS-backed paths absorb this; synchronous clients must retry with backoff.

## 7. Terraform

All AWS infrastructure is Terraform-managed from a new `infra/` directory — no console-created resources.

- **State:** S3 backend + DynamoDB lock table; one workspace/state per environment (`dev`, `staging`, `prod`) matching the branch model.
- **Modules (proposed):** `network` (VPC, subnets, endpoints), `ecr`, `ecs-worker` (cluster, task defs, autoscaling), `queue` (SQS + DLQ), `orchestration` (Step Functions, IAM roles), `api` (API Gateway, Lambdas), `crons` (EventBridge Scheduler), `secrets` (Secrets Manager/SSM), `amplify` (the Amplify app, branch config, domain, headers/rewrites), `dns` (Route 53, ACM), `observability` (CloudWatch dashboards/alarms, log groups, cost alarms).
- Amplify itself is created via Terraform (`aws_amplify_app`, `aws_amplify_branch`, `aws_amplify_domain_association`) so hosting config is code, not console.
- Bedrock access (model-invocation IAM policies, inference profiles) is Terraform-managed.

## 8. Migration phases (in order)

Each phase = issue-backed branches per docs/branching.md; every phase ends with the app fully working (strangler pattern — Vercel stays live until Phase 9 cutover).

1. **Phase 0 — Foundations.** AWS account/org, Terraform state backend, `infra/` skeleton, ECR repo, Secrets Manager entries mirroring Vercel env vars, CI credentials (GitHub OIDC → AWS), Lambda concurrency quota raise (§6).
2. **Phase 1 — Jest test suite.** Jest + RTL wiring, LLM mock layer at `src/lib/api.js`, unit tests for `fitScoring.js` and lib modules, first component tests, CI job. Extract validator/merge logic from App.jsx as needed to test it.
3. **Phase 2 — Amplify hosting (frontend parity).** Terraform-created Amplify app connected to the GitHub repo; branch builds for `dev`/`staging`/`main`; port rewrites + security headers from `vercel.json`; SPA still calls the existing Vercel `api/` (CORS/CSP updated). Validate on a test domain.
4. **Phase 3 — Port light API endpoints.** `knowledge`, `enrich`, `enrich-free`, `checkout`, `stripe-webhook`, `contact`, `invite`, `referral`, `hubspot`, `admin` → Lambda + API Gateway, reusing `_guard.js`/`_usage.js` logic as a shared layer. Point the SPA at the new API per environment.
5. **Phase 4 — Job system.** SQS + Step Functions + Fargate worker image (knowledge layer baked in). Re-implement ICP build and the p1–p9 brief pipeline as state machines; frontend switches from client orchestration to submit/poll. This retires `api/claude.js` / `api/claude-stream.js` and the client-side `generateBrief()`.
6. **Phase 5 — Bedrock evaluation.** Dual-provider worker client; cost + golden-set quality comparison; migrate non-search steps to Bedrock if both pass; keep Anthropic API for web_search steps.
7. **Phase 6 — Crons.** Re-point the three cron jobs at EventBridge Scheduler → Lambda/SQS; retire `CRON_SECRET` for IAM auth.
8. **Phase 7 — Observability & cost.** CloudWatch dashboards for job throughput/failures/DLQ depth, per-model token cost metrics (replacing `api_usage_log` console views or feeding it), budget alarms.
9. **Phase 8 — Hardening & load validation.** Golden-set full run on the AWS stack, Stage-0 10-target validation, rate limiting at API Gateway (replacing `_guard.js` in-memory limiter), WAF if warranted.
10. **Phase 9 — Cutover & decommission.** Route 53 migration of `cambriancatalyst.ai` to Amplify, monitor, then remove Vercel project, `vercel.json`, and dead `api/` code.

## 9. Open questions

- Job/intermediate state store: Supabase (fewer moving parts, RLS reuse) vs. DynamoDB (AWS-native, TTL) — decide in Phase 4 design.
- Progress UX: is polling acceptable at launch, or is push (WebSockets/AppSync) required to replace the current token-streaming feel?
- Bedrock pricing/commitment model (on-demand vs. provisioned throughput vs. batch) — needs a real cost model run (`scripts/pl.mjs` update) with current volumes.
- Amplify Gen 2 backend constructs vs. plain Terraform for the API — current plan says Terraform for everything except what Amplify Hosting requires; revisit if Amplify features (e.g. auth UI) become attractive.
- Does the in-memory per-IP rate limiter in `_guard.js` need a distributed replacement (API Gateway throttling + usage plans) earlier than Phase 8?
- Supabase Auth long-term: keep, or fold into Cognito in a post-migration phase?
