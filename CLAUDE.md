# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Cambrian Catalyst** (repo name `cambrian-playbook`) — a B2B sales-intelligence app at `cambriancatalyst.ai`. Sellers enter their URL + target accounts; the app generates an ICP, deep account briefs, deterministic fit scores, and discovery coaching via a proprietary "RIVER" methodology and an embedded coach ("Milton"). It sits upstream of the CRM — it is not a CRM/dialer/sequencer.

Stack: React 19 + Vite 6 SPA (no TypeScript, no router) → Vercel serverless functions (`api/`) → Anthropic Claude (sole AI provider) + Supabase (Postgres/Auth/RLS) + Stripe, HubSpot, Apollo.io.

This codebase was vibe-coded by a salesperson and is now under engineering maintenance. Expect the docs to lag the code — **when a doc and the code disagree, the code wins** (see "Documentation index" for which docs are stale).

## Commands

```bash
npm run dev            # Vite dev server (frontend only; api/ functions need `vercel dev` or the deployed env)
npm run build          # Production build
npm run lint           # ESLint
npm run test:lint      # Tier A: static knowledge-layer lint — no LLM calls, run freely
npm run test:backtest  # ICP backtest --self-test — no LLM calls, run freely
npm run test:golden    # Tier B: golden-set lite (5 companies × 1 run) — CALLS LIVE ANTHROPIC API
npm run test:golden:full  # 25 × 3 runs — expensive, normally CI-only (weekly cron)
npm test               # lint + backtest self-test + golden lite
```

**Test policy: run `test:lint` and `test:backtest` freely. The golden-set tests generate real briefs against the live Anthropic API (needs `ANTHROPIC_API_KEY`, costs money) — ask before running them.** For that reason avoid bare `npm test` by default; run the two free tiers individually.

There is no Jest/Vitest — tests are plain Node scripts under `tests/`. A separate LLM-drift harness lives in `scripts/consistency/` (not part of `npm test`).

## Branch & deploy workflow (the rule)

Full workflow: **[docs/branching.md](docs/branching.md)**. Summary:

- Every branch is backed by a GitHub issue and named `xxx/issue-yyy-zzzz` (prefix `feature`, `bugfix`, `doc`, …; most work is `feature` or `bugfix`). Example: `feature/issue-12-hubspot-sync`.
- **All new branches are cut from `staging`.** Work branches PR into `dev` for initial testing, then PR into `staging` for integration testing on the Vercel preview (`cambrian-playbook-git-staging-*.vercel.app`).
- `staging` is always ready to flip to **`main`** (production). Merge to main in small batches, **tagging before each merge**.
- Vercel auto-deploys `main` to production (`cambriancatalyst.ai`). Never run `vercel --prod` manually, and especially never from inside `src/`.
- Staging shares the **production** Supabase database — be careful with migrations and data writes from staging.
- Rollback = reset to the last good tag (e.g. `v2.0.0-stable`) and force-push. Release history: docs/AUDIT_GUIDE.md and docs/archive/PRODUCTION_RELEASE_2026-06-09.md.
- Before shipping any scoring or brief-pipeline change: run the 10-target Stage-0 validation (always include Stripe for contamination and Boeing for revenue/HQ); reject the change if any correctly-scored target regresses >5 points. Protocol in docs/STAGE_0_REMEDIATION_PLAN.md.
- **Never attribute Claude anywhere on GitHub** — no "Generated with Claude Code", "Co-Authored-By: Claude", or similar in commit messages, PR bodies, or comments on issues/PRs.
- **Infrastructure changes go through Terraform applied by GitHub Actions** (`.github/workflows/terraform.yml`, issue #73) — never the AWS console, never a local `terraform apply`. Merging `dev`/`staging`/`main` auto-applies `infra/envs/*` to the matching account (production gated by required-reviewer approval). The one-time bootstraps in issues #9/#73 were the last laptop applies. Sole standing exception: the laptop-only layers `infra/org/` and `infra/github-oidc/`, which stay out of CI by design and are applied locally as the management account only with explicit human sign-off. Console access is read-only/diagnostic.

## Architecture

### Source map

```
src/
├── main.jsx                 # entry → <App/>
├── App.jsx                  # ★ ~17,000-line MONOLITH — nearly all UI, state (127 useState),
│                            #   and AI orchestration (generateBrief ~line 1624, scoreFit,
│                            #   buildSellerICP, consistency validator ~line 8543)
├── components/              # the few extracted pieces: SuperAdmin, UserDashboard,
│                            #   OrgPanel, ReportPanel
├── stages/S9_SolutionFit.jsx
├── lib/
│   ├── api.js               # callAI / callAIRaw / streamAI → all Claude via /api/claude(-stream)
│   ├── supabase.js          # REST/Auth client, anon key + JWT, auto-refresh
│   ├── org.js               # org context / members / invitations
│   ├── fitScoring.js        # ★ "Option C" deterministic fit-score engine (LIVE)
│   └── utils.js, useSortable.js
├── config/constants.js      # model IDs, limits
└── data/                    # ★ KNOWLEDGE LAYER — proprietary IP (~26+ *Knowledge.js modules,
                             #   prompts/, riverFramework.js, negotiationFrameworks.js, …)
api/                         # Vercel serverless functions (underscore files = shared, not routed)
├── _guard.js                # 7-layer guard: Supabase JWT, origin allowlist, per-IP rate limit,
│                            #   model allowlist, tool allowlist (web_search only), input caps,
│                            #   max_tokens 8000; forces temperature:0 + top_k:1; 529 fallback map
├── _usage.js                # org run limits + token/cost logging (service_role key)
├── claude.js                # Anthropic proxy, non-streaming (maxDuration 120)
├── claude-stream.js         # Anthropic proxy, SSE (maxDuration 300)
├── knowledge.js             # serves the knowledge layer to authed clients (keeps IP out of bundle)
├── enrich.js / enrich-free.js  # Apollo.io / SEC EDGAR + Wikidata enrichment
├── hubspot.js + _hubspot.js # OAuth + CRM push (single function: Vercel 12-function limit)
├── checkout.js, stripe-webhook.js, invite.js, referral.js, contact.js
├── admin.js + _admin-action.js  # superuser-only (SUPERUSER_EMAIL) analytics/actions
└── cron-*.js                # 3 Vercel crons (CRON_SECRET): monthly token reset,
                             #   weekly data refresh, weekly seller profiles
api-aws/                     # AWS Lambda ports of api/ endpoints (issue #86, strangler pattern —
                             #   Vercel api/ stays live; shared/ = ported guard/usage/adapter/secrets;
                             #   deployed by infra/modules/api via the Terraform pipeline; see its README)
supabase/migrations/         # 32 sequential SQL migrations (orgs, RLS, usage log, data-science tables)
scripts/                     # ops: nightly-backup, check-rls, pl.mjs (P&L), smoke-brief,
                             #   variance diagnostics, consistency/ drift harness
tests/                       # knowledge-lint.js, golden-set/, icp-backtest/ (see Commands)
.github/workflows/           # knowledge-lint, golden-set lite (PR) / full (weekly), backup, security-scan
public/                      # static legal pages (/privacy /terms /support via vercel.json rewrites)
drive/, docs/                # business docs & internal design docs (see index below)
docs/archive/                # historical session/audit/release logs (see index below)
```

### How it fits together

- **The browser never calls Anthropic or holds the API key.** All Claude traffic goes `src/lib/api.js` → `/api/claude` or `/api/claude-stream` → `api/_guard.js` → Anthropic (with prompt caching enabled). CSP in `vercel.json` enforces this.
- **Models** (`src/config/constants.js`, allowlist in `api/_guard.js:18`): Haiku `claude-haiku-4-5-20251001` is the workhorse; Sonnet `claude-sonnet-4-6` for brief sections and ICP pass 2; Opus `claude-opus-4-6` only for ICP pass 1 and P3 strategy. On 529 overload the guard falls back per `MODEL_FALLBACK` (Opus→Sonnet, Sonnet↔Haiku). Historical gotcha: P3 under concurrent load must not use Opus (rate limits) — it was deliberately moved to Sonnet.
- **Brief generation** = staggered micro-calls (p1 overview … p9), 3 waves / max 3 concurrent, 90s hard timeout, with a synchronous cross-section consistency validator before the brief is marked complete. Rationale for every guardrail is in docs/ROOT_CAUSE_ANALYSIS.md.
- **Fit scoring is deterministic** ("Option C", `src/lib/fitScoring.js`): the LLM only extracts 14 signals; JS computes the score. Dim1 Product Fit 45% / Dim2 Customer Lookalike 30% / Dim3 Competitive Displacement 25%. Labels: ≥75 Strong / ≥55 Potential / else Poor; competitors score 0. Spec: docs/OPTION_C_SCORING_SPEC.md.
- **Knowledge layer** (`src/data/`): ~3,650+ lines of curated sales heuristics — the product's IP. Served only through JWT-gated `/api/knowledge.js`; **must never be imported into client-bundle code paths**. Keyword-matching injection functions live in App.jsx (~lines 517–800).
- **Supabase**: browser uses the anon key + user JWT under RLS; server functions use the service_role key. Key tables: `orgs`, `org_members`/`users`, `invitations`, `sessions`, `account_outputs`, `api_usage_log`, plus ~10 data-science/telemetry tables. RLS policies use `auth.uid()::text = user_id` — the `::text` cast is required.
- **App.jsx is canonical.** Some extracted modules under `src/lib/` and `src/data/prompts/` have drifted from the inline versions in App.jsx and are reference-only — `fitScoring.js` is the notable exception that IS live. Verify before assuming an extracted module is what runs.

### Environment variables

Server (`process.env`): `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_KEY`, `SUPABASE_JWT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_{STARTER,PRO,TEAM,ENTERPRISE}`, `HUBSPOT_CLIENT_ID/SECRET`, `HUBSPOT_TOKEN_KEY`, `APOLLO_API_KEY`, `CRON_SECRET`, `SUPERUSER_EMAIL`, `ALLOW_GUEST`.
Client (`import.meta.env`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_URL`, `VITE_API_URL` (API origin, issue #83; empty = same-origin), `VITE_API_ENDPOINT_ORIGINS` (JSON per-endpoint origin overrides for AWS-migrated endpoints, issue #86).

**`ANTHROPIC_API_KEY` must never get a `VITE_` prefix** — that would bundle it into the browser (this exact leak happened once; the v100 proxy architecture exists to prevent it). The Supabase anon key is intentionally `VITE_`-prefixed and safe to expose.

## Product doctrine (encoded throughout the prompts — don't undo it)

- **Anti-fabrication is P0**: "Empty is ALWAYS better than wrong." Never let prompts invent seller stats, target-company facts, people, or URLs. Every statistic carries a source tag (`[proof pack]`, `[web search]`, `[industry benchmark]`, `[estimated]`, `[unsupported — verify with seller]`). Email sign-offs are `[Your name here]`, never an invented name.
- **Identity contamination** is the recurring failure mode (ambiguous names: Stripe vs Stripe Construction, Apollo.io vs Apollo Global, Mercury, Delta…). Defenses: P1 companySnapshot injected into later sections, enrichment treated as unverified hints (never ground truth), corroboration gate. Known weak spot: `api/enrich-free.js` matches SEC EDGAR by *name*, not domain.
- **Determinism**: guard forces `temperature: 0` + `top_k: 1`; ICP uses anchored enum buckets; scoring is computed in JS — all to prevent run-to-run drift. Don't add sampling randomness.
- Known gotcha: the Supabase brief cache once served stale incomplete briefs and silently skipped regeneration; cache validation now requires `solutionMapping` to be present.

## Documentation index

Read on demand — don't preload. **Durable** = still-accurate reference. **Historical** = point-in-time log; consult only for archaeology/provenance. Where docs conflict, newer wins (June 2026 "v2.x" era > April 2026 "v99–v108" era) and code beats both.

### Durable references (docs/)

- **docs/ARCHITECTURE.md** — the authoritative June-2026 structural audit: App.jsx internals, p1–p9 pipeline, guard layers, Supabase schema, 16 known architectural issues. Start here for any deep structural work.
- **docs/OPTION_C_SCORING_SPEC.md** — canonical spec for the deterministic fit-scoring engine (signals, dims, weights, expected scores).
- **docs/ROOT_CAUSE_ANALYSIS.md** — why each brief-pipeline guardrail exists (6 systemic data-quality root causes and their structural fixes).
- **docs/AUDIT_GUIDE.md** — the standing QA procedure for auditing a generated brief (contamination checks, tolerances, source-tag rules) + release history.
- **docs/STAGE_0_REMEDIATION_PLAN.md** — most recent open-issues work-plan (June 11) with file/line pointers; includes the pre-ship validation protocol. Check items against current code before acting — some may be done.
- **docs/AGENT_CONTEXT.md** — richest single onboarding doc, but written for the April-2026 app: its App.jsx size, model strategy, 5-call pipeline, 40/30/30 scoring, and "known gaps" list are **superseded**. Its security/env/deploy guidance remains good.
- **docs/branching.md** — the branching/release workflow: issue-backed branches, naming scheme, branch → dev → staging → main flow.
- **docs/kanban.md** — Fibonacci story-point estimation scale for sprint/Kanban items (point meanings, split thresholds, velocity guidance).
- **docs/aws-migration-plan.md** — living plan for the Vercel → AWS migration: Vercel→AWS tech mapping, Step Functions/Fargate/SQS job architecture, Bedrock evaluation, Jest test-suite prerequisite, Terraform + Amplify phases.
- **docs/refactoring.md** — phased plan to decompose the App.jsx monolith into tested modules/components (Jest+RTL infra, pure-logic extraction, domain hooks, stage components, pipeline isolation for the AWS port).
- **docs/cambrian-catalyst-overview.md** — canonical product primer: workflow, RIVER framework, Milton, positioning, current pricing.
- **docs/knowledge-layer.md** — what's *in* the knowledge layer: 13 frameworks with injection text, scoring heuristics, ICP enums, RFP sources.
- **docs/knowledge-layer-review.md** — how the layer works internally: file inventory, injection mechanics, calibration rules, coverage gaps.
- **docs/feature-inventory.md** — stage-by-stage feature map (April snapshot; broadly accurate).
- **docs/wireframe.md** — ASCII wireframes of all 10 steps + panels (layout durable; its pricing/Opus-tier numbers are stale).
- **docs/cost-model.md** — unit-economics methodology (runnable via `node scripts/pl.mjs`); its pricing tiers are superseded by the overview.
- **docs/knowledge-layer-dump.txt** — 355KB raw dump of `src/data/*.js`; read `src/data/` directly instead (the dump drifts).
- **docs/cambrian-catalyst-inventory.xlsx** — binary feature inventory (regenerate via `scripts/export-inventory.mjs`).

### Historical logs — `docs/archive/` (skip unless doing archaeology)

- **CHANGELOG.md** — April-era v99→v108 history (JWT auth, proxy pivot, Clerk removal). Does not cover June v2.x.
- **PRODUCTION_RELEASE_2026-06-09.md** — v2.1.1 release record; source of the branch/tag/rollback conventions above.
- **SESSION_SUMMARY_2026-06-08.md**, **SESSION_AUDIT_2026-06-08.md** — near-duplicate June-8 session logs.
- **SESSION_2026-06-09-10.md** — June 9–10 commit-level log of the Option C + root-cause fixes.
- **STAGE_0_AUDIT_PLAN.md** — the 10-target golden-set matrix (matrix reusable; V0.1 results obsolete). Test seller = Blackhawk Network.
- **STAGE_0_FINAL_AUDIT_RESULTS.md** — June-11 final Stage-0 outcome (6/8 pass; score calibration failed) — the latest recorded quality state.
- **STAGE_0_STATUS.md**, **STAGE_0_FINAL_STATUS.md**, **STAGE_0_AUDIT_STATUS.md**, **STAGE_0_AUDIT_V0.2.md**, **STAGE_0_POST_AUDIT_FIXES.md**, **OPTION_C_TEST_PLAN.md** — intermediate status/fix snapshots from June 8–11, each superseded by the two docs above.
- **status-2026-05-04.md** — May-4 beta-launch snapshot (its pricing table is the authoritative one: Starter $99/Pro $349/Team $799/Enterprise $2,500).
- **ux-plan.md** — aspirational UX plan; partly reversed (dark mode was later removed).

### Known cross-doc conflicts (resolved)

- Fit bands: ≥75 Strong / ≥55 Potential (per `src/lib/fitScoring.js:98`); ignore the 65/40 bands in the overview doc.
- Scoring weights: 45/30/25 deterministic (Option C); the 40/30/30 LLM scheme in AGENT_CONTEXT/overview is the old system.
- Model IDs: trust `src/config/constants.js` + `api/_guard.js` (Sonnet is `claude-sonnet-4-6` as of July 2026); docs citing `claude-sonnet-4-5-20250929` predate the update.
- Pricing: overview + status-2026-05-04 are authoritative; cost-model.md and wireframe.md figures are earlier drafts.

# AWS Guidance

- Prefer the AWS MCP Server for AWS interactions — it provides sandboxed
  execution, observability, and audit logging. If unavailable, use the
  AWS CLI directly.
- Before starting a task, check whether a relevant AWS skill is available.
  Load the skill with `retrieve_skill` and prefer its guidance over
  general knowledge.
- When uncertain about specific AWS details (API parameters, permissions,
  limits, error codes), verify against documentation rather than guessing.
  State uncertainty explicitly if you cannot confirm.
- When creating infrastructure, prefer infrastructure-as-code (AWS CDK or
  CloudFormation) over direct CLI commands.
- When working with infrastructure, follow AWS Well-Architected Framework
  principles.
- Do not use em dashes in AWS resource names or descriptions. Use
  hyphens instead.

## Secret Safety

- MUST load the `aws-secrets-manager` skill first for any secret,
  credential, API key, token, or password task. MUST NOT call
  `secretsmanager get-secret-value` or `batch-get-secret-value`, and MUST
  NOT hit the Secrets Manager Agent daemon directly. MUST use
  `{{resolve:secretsmanager:secret-id:SecretString:json-key}}` with
  `asm-exec` so the secret resolves at runtime without entering context.
