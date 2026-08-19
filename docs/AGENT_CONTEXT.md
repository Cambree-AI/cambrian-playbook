# Cambrian Catalyst — RIVER Playbook Engine
**Agent onboarding context. Last updated: 2026-04-20 (tag `v108-security-perf`)**

---

## What this app does
Any-model sales intelligence tool for Cambrian Catalyst LLC (West Seattle).
Takes a seller's website + a list of target accounts, runs AI research,
and produces account briefs, discovery frameworks, and post-call routing —
all structured around the RIVER framework (Reality, Impact, Vision, Entry, Route).
Supports B2B, B2C, B2B2C, B2G, marketplace, and hybrid sales models.

---

## Live URLs
- Production: https://cambrian-playbook.vercel.app
- GitHub: https://github.com/Jgalanoii/cambrian-playbook
- Local: `~/Desktop/cambrian-playbook`
- Supabase: `xtnidawfuaxwwwcnkewu.supabase.co`

---

## Tech stack
- Frontend: React 19 + Vite 6
- Styling: `src/App.css` (~580 lines — includes design tokens, Phase 1-3 CSS, dark mode overrides, focus mode, skeleton shimmer, command palette, print rules), Google Fonts (Lora + DM Sans) loaded via `@import` in App.css
- UX: Cmd-K command palette, keyboard shortcuts, dark mode toggle, in-call focus mode, stage transition animations, section collapse on Brief, company logos via Clearbit, responsive 1200px desktop width
- Auth + DB: Supabase (anon key auth, `sessions` table with RLS)
- AI: Anthropic Claude via serverless proxies (`/api/claude.js`, `/api/claude-stream.js`), guarded by `api/_guard.js` (JWT auth, rate limiting, model/tool/input caps)
- Knowledge layer: sensitive heuristics served from `/api/knowledge.js` behind JWT auth — NOT in client bundle
- Chat: "Milton" embedded sales coach with full knowledge layer, dry humor, anti-fabrication rules
- Deployment: Vercel (auto-deploy from `main`)
- Models: `claude-haiku-4-5-20251001` (primary). `claude-sonnet-4-5` allow-listed as **automatic fallback** when Haiku returns 529 — substitution happens server-side in the proxy.

---

## Repository layout
```
src/
  App.jsx                ~5,150 lines — the monolith (extraction in progress)
  App.css                ~440 lines — design tokens + all class styles + print rules
                         (extracted from App.jsx in v106)
  main.jsx               entry
  config/constants.js    COHORT_COLORS (15), MAX_OUTCOMES, MAX_DOCS, MAX_PRODUCTS
  lib/
    api.js               callAI + streamAI wrappers (NOT yet imported — App.jsx has evolved versions with auth headers + retry)
    supabase.js          sbAuth / sbGetUser / sbSessions helpers — IMPORTED by App.jsx
    utils.js             parseACV, labelOrgSize, buildCohorts, calcConfidence (NOT yet imported — needs COHORT_COLORS dependency fix)
  data/
    outcomes.js          universal business imperatives
    riverFramework.js    RIVER_STAGES (imported by App.jsx)
    sampleAccounts.js    100 sample companies across 19 industries
    negotiationFrameworks.js
    rfpSources.js        global RFP registry + CPV/NAICS codes
    prompts/
      fitScoring.js      FIT_SCORING_RULES — served via /api/knowledge.js
      icpGeneration.js   ICP_ENUM_BUCKETS, ICP_FRAMEWORKS — reference
      briefGeneration.js BUYING_SIGNALS, BRIEF_FRAMEWORKS — served via /api/knowledge.js
      negotiationInjections.js  ALL_NEGOTIATION_INJECTIONS — served via /api/knowledge.js
  stages/
    S9_SolutionFit.jsx   EXTRACTED — presentational component
                         (S1/S5/S6/S8 still inline in App.jsx)
  components/             (empty — extraction not yet started)
  hooks/                  (empty)
api/
  claude.js               60s timeout. temperature:0 enforced. Sonnet fallback on 529.
  claude-stream.js        120s timeout, SSE. Same fallback before stream starts.
  _guard.js               JWT auth + rate limiting (60/min/IP) + model allow-list +
                          tool allow-list + max_tokens cap (8000) + input size caps
                          (120KB messages, 12KB system). ALLOW_GUEST env var for guest mode.
  knowledge.js            Serves sensitive knowledge layer data behind JWT auth.
                          Scoring heuristics, framework injections, NAICS/CPV codes.
scripts/
  consistency/
    test-icp.mjs          ICP drift measurement (per-seller, N runs)
    test-fit.mjs          Fit-score consistency per (seller, account) pair
    test-brief.mjs        Brief field drift across N runs (4 micro-calls in parallel)
    test-pipeline.mjs     Hypothesis + Discovery consistency with fixed brief input
    sellers.json          golden seller list — currently 8 digital-rewards sellers
    README.md             how to run
    results/              gitignored — regenerated per run
  pl.mjs                  Runnable P&L scenario calculator (--users, --fallback, etc.)
  check-rls.mjs           Supabase RLS verification script + manual checklist
docs/
  cost-model.md           Cost model + pricing tier proposal + sensitivity analysis
```

---

## Environment variables
| Variable | Where | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Vercel server-side only (NO `VITE_` prefix) | Claude API key — used by `/api/claude*.js` |
| `VITE_SUPABASE_URL` | Vercel + `.env.local` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Vercel + `.env.local` | Supabase anon key |
| `ALLOW_GUEST` | Vercel (all envs) | Set to `"true"` to let guest mode bypass JWT auth |

**Critical**: `ANTHROPIC_API_KEY` must NEVER get `VITE_` prefix — it would end up in the browser bundle.

---

## App flow (10 steps)
0. Auth (Supabase)
1. Seller URL → ICP build
2. ICP review + RFP Intel tab
3. Account import (CSV / sample / **Build my target accounts**) → cohort build
4. Accounts table → fit scoring
5. Account Review → Brief generation
6. RIVER hypothesis + talk tracks
7. In-call discovery capture (sales + architecture tracks)
8. Post-call routing + email
9. **Solution Fit Review** (in `src/stages/S9_SolutionFit.jsx`)

Each stage has Print-to-PDF + JSON Data export buttons (v106).

---

## Key functions in App.jsx
| Function | Purpose |
|---|---|
| `setAuthToken()` / `authHeaders()` | Module-level JWT token management. Set on login, sent with every proxy call. |
| `claudeFetch()` | Shared retry wrapper for /api/claude. Handles 429 + 529 with exp backoff. Sends JWT. |
| `streamAI()` | SSE streaming helper. Retries initial POST on 529. Sends JWT. |
| `callAI()` | Non-streaming Haiku JSON wrapper. 3× retry + JSON repair. Sends JWT. |
| `fetchKnowledgeLayer()` | Fetches sensitive heuristics from /api/knowledge on login. Populates KL_* vars. |
| `buildSellerProofPack()` | Composes "why buy from us" block. Rules #1-9 including anti-fabrication. |
| `generateBrief()` | NON-ASYNC. Returns `{skeleton, mergers, earlyDone, allDone}`. 5 micro-calls; pre-cache uses Promises. earlyDone (p1+p3+p4) fires hypothesis early. |
| `scoreFit()` | Parallel batch scoring. 3-dimension: ICP Alignment + Customer Similarity + Competitive Landscape. Pre-caches top 3 accounts after completion. |
| `buildRiverHypo()` | **Streamed** (streamAI, 4000 tok). Full knowledge layer injected. Progressive rendering. |
| `generateDiscoveryQs()` | **Streamed** (streamAI, 3500 tok). Sales + Architecture dual-track. |
| `runPostCall()` | **Streamed** (streamAI, 3500 tok). Proof pack + Fisher/Ury + Graham injected. Detects lazy reps. |
| `buildSolutionFit()` | **Streamed** (streamAI, 4000 tok). Graham Margin of Safety injected. |
| `sendChatMessage()` | Milton chat handler. Full knowledge layer in system prompt. Never reveals methodology. |
| `fetchRFPIntel()` | Two parallel calls (open + closed) with web_search + NAICS/CPV codes. |
| `buildSellerICP()` | Two-phase ICP: research (web_search) + anchored generation. Anti-fabrication rules. |
| `pickAccount()` | 2256 | Brief wrapper — paints skeleton, merges micro-results, fires hypothesis + discovery in background. |
| `buildRiverHypo()` | 2318 | RIVER hypothesis + JOLT + talk tracks. normalizeRiverField guards against object-shape leaks. |
| `generateDiscoveryQs()` | 2497 | TWO tracks per RIVER stage: SALES (Mom Test/Voss/Cialdini) + ARCHITECTURE (Rajput/McSweeney/Richards-Ford/Fowler/DMAIC). |
| `runPostCall()` | 2570 | Synthesize call → routing decision (FAST_TRACK/NURTURE/DISQUALIFY) + CRM note + follow-up email. |
| `buildSolutionFit()` | 2620 | Post-call SA review. Renders via `<S9SolutionFit/>`. Now grounded in seller proof pack. |

---

## AI call inventory
All calls go through `/api/claude` (standard) or `/api/claude-stream` (SSE). Proxies force `temperature:0`.
Server-side fallback: any 529 from Haiku triggers automatic retry with `claude-sonnet-4-5`.

| Call | Model | Max tok | Streaming | Tools | Notes |
|---|---|---|---|---|---|
| ICP phase 1 (research) | Haiku | 2000 | No | `web_search` (×1) | Critical for sellers Haiku doesn't know from training. |
| ICP phase 2 (build) | Haiku | 6000 | Yes (streamAI) | — | Anchored enum schema. |
| `fetchRFPIntel` open | Haiku | 2500 | No | `web_search` (×2) | One of two parallel calls. |
| `fetchRFPIntel` closed | Haiku | 2500 | No | `web_search` (×2) | Companion parallel call. |
| `generateTargets` | Haiku | 4000 | No | `web_search` (×2) | "Build my target accounts" CTA. |
| `scoreFit` batch | Haiku | 5500 | No | — | 20 accounts/batch, all batches in parallel. |
| `generateBrief` p1–p4 | Haiku | 1200–2600 | Yes (streamAI) | — | Overview, execs, strategy, solutions. |
| `generateBrief` p5 | Haiku | 1800 | No | `web_search` (×1) | Live news/sentiment. |
| `buildRiverHypo` | Haiku | 5500 | No | — | RIVER + JOLT + talk tracks. |
| `generateDiscoveryQs` | Haiku | 5500 | No | — | Sales + architecture tracks. |
| `runPostCall` | Haiku | 5500 | No | — | Routing + email + CRM note. |
| `buildSolutionFit` | Haiku | 5500 | No | — | SA review. |

---

## Resilience (v106)

### Sonnet fallback on Anthropic 529
When Anthropic returns `overloaded_error`, the proxy automatically retries the same request with Sonnet 4.5 substituted in. Cost: ~3× per affected call. Headers/body tag: `x-fallback-model: claude-sonnet-4-5` and `_fallbackModel` field. Verified live during the 2026-04-16 Haiku capacity event.

### Client-side retry
`claudeFetch()` wraps the user-facing fetches with exponential backoff:
- 529 / overloaded_error: 2s → 5s → 10s
- 429 / rate_limit_error: 15s → 30s → 45s
- Network errors: 2s/4s/6s
- Returns `{error: {type:"unavailable", message:"..."}}` after retries exhausted so callers can surface a friendly error.

Applied at: `scanSellerUrl`, `buildSellerICP` (both phases), `fetchRFPIntel` (per-class), `generateBrief` p5, `generateTargets`. `callAI` and `streamAI` have their own equivalent retry baked in.

---

## Seller Proof Pack (v106)

`buildSellerProofPack({sellerICP, sellerDocs, products})` produces a unified "why buy from us" block prepended to every customer-facing prompt:
- What we sell + market category
- Unique differentiators (cite to justify "why us")
- Named customers (Cialdini social proof — never invent)
- Competitive alternatives (Sun Tzu — know terrain)
- Success factors (frame outcomes in customer's language)
- Priority trigger (urgency framing)
- Traction channels
- Uploaded proof docs (case studies — quote when relevant)
- Product catalog (use exact names; never invent)

Plus explicit instructions: cite specific named customers, use real differentiators, flag unsupported claims as `[unsupported — verify with seller]` rather than asserting them.

Injected into: `generateBrief` base context, `buildRiverHypo` prompt, `buildSolutionFit` prompt, and (lighter) `scoreFit`. Brief schema for `solutionMapping[]` and `caseStudies[]` updated to require named-customer + differentiator citation per item.

---

## ICP consistency system

1. **Anchored enum schema** — `companySize`, `revenueRange`, `dealSize`, `salesCycle`, `adoptionProfile`, `ownershipTypes`, `geographies` are PICK-ONE from fixed buckets.
2. **localStorage cache** keyed by `icp:v3:<userId>:<url>`. Bumped to v3 in the tier-vocabulary purge. Old keys auto-purged on app boot via `purgeStaleCaches()`.
3. **Explicit Regenerate button** (forceRefresh:true).
4. **Phase 1 uses `web_search`** — critical for obscure sellers.
5. **Cache quality gate** — ICPs containing "Unknown" / "Unable to determine" / "PICK ONE" in core fields are NOT persisted.

### Verifying consistency
```bash
node scripts/consistency/test-icp.mjs            # ~$0.55 for 8 sellers × 3 runs
node scripts/consistency/test-fit.mjs            # ~$2 for fit consistency on 25 accounts
node scripts/consistency/test-brief.mjs          # ~$1 for brief field drift
node scripts/consistency/test-pipeline.mjs       # hypothesis + discovery
```
Update prompts in `App.jsx` then sync the harnesses or tests won't reflect reality.

---

## RFP Intel system (v106 rewrite)

- **Two parallel Haiku calls** — one for OPEN RFPs, one for CLOSED awards. Each with its own `web_search` budget (max_uses:2). Each renders independently.
- **Auto-trigger** on ICP completion via `useEffect` watching a stable `icpSignature`. When the user clicks the RFP tab, data is usually already loaded.
- **localStorage cache** keyed by `rfp:v3:<userId>:<url>:<marketCategory>`. Force-refresh on ICP change so stale RFP doesn't sit against new ICP.
- **Prompt enriched** with full ICP context (industries/size/revenue/geography/personas/trigger/disqualifiers/competitors/differentiators) + concrete search-query patterns.
- **`isGovernment` boolean required** on every row. Filter predicates strict `=== true / === false`. Filter buttons show live counts.
- **`awardedTo` accuracy** — only populated if `web_search` confirms the vendor. Otherwise empty → UI renders "— unverified".
- **Data-integrity disclaimer** above tables. **Source URLs clickable** when present.

---

## Data model
### Supabase: `sessions`
- `id` (uuid)
- `user_id` (text) — RLS: `auth.uid()::text = user_id` (cast required)
- `name` (text)
- `seller_url` (text)
- `data` (jsonb) — full serialized app state via `getSessionSnap()`

Session blob fields: `sellerUrl, sellerInput, productUrls, sellerICP, products, sellerDocs, rows, headers, mapping, fileName, importMode, cohorts, selectedCohort, fitScores, accountQueue, selectedAccount, selectedOutcomes, dealValue, dealClassification, brief, riverHypo, gateAnswers, riverData, notes, postCall, solutionFit, contactRole`.

---

## RIVER framework
5 stages: Reality → Impact → Vision → Entry Points → Route. Each has Gates (MC), Discovery (text), Talk Track, Objections. Confidence 0–98% via `calcConfidence()` (gate answers + discovery text length).

In-call discovery now produces TWO question tracks per stage (v106):
- **SALES** (Mom Test, Voss calibrated questions, Cialdini social proof, etc.)
- **ARCHITECTURE** (Rajput business→digital alignment, McSweeney stakeholder alignment, Richards/Ford quality attributes, Fowler integration patterns, DMAIC maturity, pilot scoping, adjacent-system risk)

Architecture answers feed `buildSolutionFit` automatically via `riverData` (`sa_<stage>_<idx>` keys). SA + onboarding start at ~70% context instead of 0%.

---

## Knowledge layer — negotiation & influence
Defined in `src/data/negotiationFrameworks.js` + `src/data/prompts/negotiationInjections.js`. **Not yet imported by App.jsx** — reference-only until stages are extracted.

| Framework | Stage | Use |
|---|---|---|
| Voss — Never Split the Difference | S7 | Calibrated How/What questions, labeling, accusation audit |
| Fisher/Ury — Getting to Yes | S7+S8 | BATNA, interests vs positions |
| Cialdini — Influence | S5+S6 | Social proof, authority, scarcity |
| Sun Tzu — Art of War | S3+S5 | Know enemy, adapt to terrain (Moore), underserved stakeholder |
| Graham — Intelligent Investor | S4+S8 | Margin of safety (3–5× value), disqualify fast |
| Crucial Conversations | S7 | Safety signals, STATE method |
| JOLT Effect | S6 | Judge/Offer/Limit/Take-risk — indecision kills 40–60% of deals |
| Challenger Customer | S5 | Mobilizers (13%), commercial insight |

---

## Knowledge layer — fit scoring (`src/data/prompts/fitScoring.js`)

After v106 the public-facing vocabulary is "high-friction industries" / "underserved high-fit segments" — the `Tier 1` / `The Wall` labels were purged from all customer-facing prompts.

### High-friction (score 5–25%)
Heavy manufacturing 5.9% · Aerospace & Defense Prime 5.8% · Telecom 6.1% · Energy Oil/Gas 11.3% · Energy Utilities 13.4% · Mass Market Retail 13.6% · Top-5 US Banks (JPM/BAC/WF/Citi/Goldman) 12.6%.

### Underserved high-fit (score 60–80%)
Large Private Insurance/Finance 65.2% · Large Private Tech/Data/Media 64.5% · Large Private Professional Services 63.3% · P&C/Life/Specialty 62.5% · CPG HPC/Beauty 61.9% · Regional/Community Banks 59.5% · Healthcare IT/Digital Health 54.9%.

### Stage thresholds
Seed 23.7% · Series A 33.6% · Series B 41.8% · Series C 49.0% · Series D+ 55.6%.

### Buying signals
Recent funding <12mo +8 · Private vs public +5–8 · >200K employees (Seed–C) −15 · >50% union −20.

---

## Knowledge layer — RFP sources (`src/data/rfpSources.js`)

Priority order (non-government first per UX):
1. Private/Commercial — Fortune 500, Ariba, Coupa, Jaggaer, SAP Fieldglass
2. US Federal — SAM.gov, FPDS-NG, USASpending.gov
3. EU/UK — TED Europa (27 countries), Find a Tender, Contracts Finder
4. Multilateral — World Bank, UNGM, ADB, IDB
5. US State/Local — DemandStar, state portals
6. APAC — AusTender, GeBIZ, GETS NZ, MERX Canada
7. LatAm — CompraNet, Mercado Público, SEACE, SICE

### RFP signal scoring
Active match +20 · Recent award +10 · Historical buyer +5 · Incumbent risk −10.

---

## Security

### Current posture (verified daily)
- `ANTHROPIC_API_KEY`: server-side only, no VITE_ prefix
- Supabase anon key: VITE_ prefixed (intentional — anon keys are public)
- RLS on sessions: `auth.uid()::text = user_id`
- All Claude calls via proxy — no direct browser→Anthropic
- `temperature:0` enforced server-side regardless of client request body
- Model allow-list: `claude-haiku-4-5-20251001`, `claude-sonnet-4-5` (fallback only — clients can't request Sonnet directly)
- Tool allow-list: `web_search_20250305` only, max_uses capped at 3
- max_tokens capped at 8000
- Origin allow-list: `cambrian-playbook.vercel.app`, `cambrian-playbook-*.vercel.app` (Vercel previews), `localhost`
- Security headers: HSTS, CSP frame-ancestors:none, X-Frame-Options:DENY, X-Content-Type-Options:nosniff, Referrer-Policy, Permissions-Policy

### Verified daily
```bash
# 11-probe pen test against production
URL=https://cambrian-playbook.vercel.app
# See `git log` commit b2c... or rerun the probe block from prior conversation
```

### Known gaps
- No JWT auth on `/api/claude*` — model/tool allow-list bounds per-request cost but not requests-per-second
- No Sonnet-fallback telemetry (count/cost) — hard to track weekly fallback impact
- No rate limiting (would use `@upstash/ratelimit` on Vercel)

---

## Cost model
See `docs/cost-model.md` for the full analysis. Headlines:
- Light user (5 deals/mo): ~$0.57/mo COGS
- Medium user (20 deals/mo): ~$2.47/mo
- Heavy user (50 deals/mo): ~$6.84/mo
- Power user (100+ deals/mo): ~$16.45/mo
- Tier margins (Starter $39 → Enterprise $299): 91-98% gross margin
- Sonnet fallback adds ~3× per affected call

Run scenarios: `node scripts/pl.mjs --users=5000 --fallback=0.10`

---

## Known tech debt
- `App.jsx` is ~5,150 lines. Only S9 extracted. `S1/S5/S6/S8` still inline.
- `src/lib/api.js`, `src/lib/supabase.js`, `src/lib/utils.js` — exist but App.jsx has duplicate implementations. Once stages extract, wire imports and delete duplicates.
- `src/data/prompts/*.js` reference modules — drifted from live App.jsx prompts. Sync after each prompt change OR mark as canonical-source-only.
- `exportToExcel` schema — built for old brief shape; hasn't been updated for new fields (`provenWith`, `measurableOutcome`, etc.)
- Brief Phase 2 (Executives) name hallucination — fix is to add `web_search` to that micro-call. Not yet shipped.
- Fit-score boundary hysteresis — accounts hovering at score 50 flip between Potential/Poor across runs.
- Narrative ICP fields (`topPains`, `priorityInitiative`, `uniqueDifferentiators`) still drift run-to-run — only enum-anchored fields are stable.
- `sellerStage` variable is in scope only inside the React component (not accessible to extracted prompts).
- Briefs/Hypotheses saved to Supabase before v106 still carry tier vocabulary; only ICP/RFP got cache versioning + auto-purge.

---

## Modularization roadmap
### Done
- `src/config/constants.js`, `src/lib/api.js`, `src/lib/supabase.js`, `src/lib/utils.js` (extracted but App.jsx has duplicates — not yet imported)
- `src/data/outcomes.js`, `riverFramework.js`, `sampleAccounts.js`, `negotiationFrameworks.js`, `rfpSources.js`
- `src/data/prompts/fitScoring.js`, `icpGeneration.js`, `briefGeneration.js`, `negotiationInjections.js` (drifted)
- `src/App.css` (extracted in v106)
- `src/stages/S9_SolutionFit.jsx` (extracted in v102)

### Next — stage extraction (safest → largest)
- [ ] `src/stages/S8_PostCall/`
- [ ] `src/stages/S6_Hypothesis/`
- [ ] `src/stages/S1_ICP/` (trickiest — lots of state + cache logic)
- [ ] `src/stages/S5_Brief/` (largest — do last)

### Then — shared components
- [ ] `components/UI/EditableField.jsx`
- [ ] `components/UI/LoadingBox.jsx`
- [ ] `components/UI/PieChart.jsx`
- [ ] `components/Auth/AuthShell.jsx` (already standalone — just move file)
- [ ] `components/Layout/Header.jsx`

---

## Git tags
- `v99-clean` — early stable
- `v100-stable` — last stable before API migration
- `v101-modular-foundation` — lib/data/config extracted, knowledge layer complete
- `v102-icp-consistency` — anchored ICP schema + localStorage cache + S9 extract + Brief streaming + consistency harness
- `v103-obscure-seller-fix` — web_search Phase 1 + cache quality gate
- `v104-security-hardening` — model/tool allow-list + origin check + security headers
- `v105-ux-polish` — design tokens + stepper redesign + login on app shell
- `v106-pipeline-quality` — RFP rewrite, Sonnet fallback, brief skeleton, target generation, proof pack, print/export, cost model, tier vocabulary purge, canonical fit labels
- **`v107-ux-phases`** — UX Phases 1-3 (elevation, Cmd-K, dark mode, focus mode, transitions), company logos, desktop width 860→1200, exec hallucination fix (web_search on p2), fit hysteresis 50→55, target-gen filters, open-positions careers-first search

---

## Deployment
Vercel auto-deploys from `main`. **Never** run `vercel --prod` from `src/` — always from project root.

Daily security verification: 11-probe pen test (see CHANGELOG v106 entry). All passing as of 2026-04-16.

---

## Seller context (Cambrian Catalyst)
- Founder: Joe G — solo operator, West Seattle
- Background: Tango (digital rewards/RaaS), Grant Thornton (compliance)
- Focus: GTM + revenue growth consulting, fintech/payments/digital incentives
- Active client: Savvi AI (ABM engagement)
- This tool: internal GTM intelligence for client engagements

---

## Pending — awaiting user direction
- [ ] **Agent/Assistant UX** — Patterns A/B/C/D outlined; user picking target persona (rep mid-flow / rep prepping / rep on live call)
- [ ] **Personal LinkedIn + connection mapping** — Idea 1 (LinkedIn input) + Path A (inferred warm-intro signals) ready to build
- [ ] **Field-level appropriateness audit** — three interpretations (schema/reasonableness/semantic) — user picking scope
- [ ] **Manual proof-point entry UI** on setup page (ROI numbers, awards, case-study links)

## Pending — quality fixes flagged but not shipped
- [ ] Brief Executives micro-call hallucination — add `web_search`
- [ ] Fit-score boundary hysteresis (≥55 for Potential, OR show numeric prominently)
- [ ] Narrative ICP field anchoring (topPains, priorityInitiative, etc.)
- [ ] Find Targets — quality regenerate loop if <10 Strong Fits
- [ ] Find Targets — dedupe against rows[] in addition to ICP customerExamples

## Pending — operational
- [ ] Supabase JWT auth on `/api/claude*`
- [ ] Sonnet-fallback telemetry (count, cost, by-route)
- [ ] Rate limiting (@upstash/ratelimit)
- [ ] Brief/Hypothesis cache versioning + auto-purge for old tier-vocabulary sessions

## Pending — test coverage
- [ ] Post-call routing consistency (needs synthetic RIVER notes)
- [ ] Solution Fit consistency (same dependency)
- [ ] LLM-as-judge for narrative semantic accuracy

## Pending — modularization
- [ ] Extract S8 PostCall (next natural stage after S9)
- [ ] Wire `src/lib/*` imports + delete duplicates from App.jsx
- [ ] Refresh `src/data/prompts/*.js` to match current App.jsx prompts (or mark App.jsx as canonical)
- [ ] Update `exportToExcel` for the new brief schema (`provenWith`, `measurableOutcome`, etc.)
