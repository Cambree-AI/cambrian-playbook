# CAMBRIAN CATALYST — ARCHITECTURE DOCUMENT

**Generated**: June 8, 2026
**Purpose**: Comprehensive reference for redesigning the monolith into a modern component architecture
**Codebase**: React + Vite + Vercel Serverless + Supabase + Anthropic API

---

## 1. FILE STRUCTURE & LINE COUNTS

### Core Application

| File | Lines | Purpose |
|------|-------|---------|
| `src/App.jsx` | 16,000 | **THE MONOLITH** — entire app in one component |
| `src/components/OrgPanel.jsx` | 545 | Organization settings panel |
| `src/components/ReportPanel.jsx` | 393 | Reporting/analytics UI |
| `src/components/SuperAdmin.jsx` | 2,255 | Admin dashboard |
| `src/components/UserDashboard.jsx` | 1,292 | User/team management |
| `src/stages/S9_SolutionFit.jsx` | 280 | Post-call solution review (only extracted stage) |
| `src/lib/api.js` | 160 | API request wrapper |
| `src/lib/org.js` | 94 | Org context helpers |
| `src/lib/supabase.js` | 139 | Supabase auth/session client |
| `src/lib/useSortable.js` | 95 | Table sort hook |
| `src/lib/utils.js` | 129 | Utility functions |
| `src/config/constants.js` | 6 | Config constants |
| `src/main.jsx` | 12 | React entry point |
| `src/App.css` | 1,800 | All styles (single file) |

### Serverless Functions (api/)

| File | Lines | Purpose |
|------|-------|---------|
| `api/_guard.js` | 400 | JWT auth, rate limiting, model allowlist, input caps |
| `api/_usage.js` | 200 | Token/run usage tracking + billing |
| `api/_hubspot.js` | 300 | HubSpot OAuth helpers |
| `api/_admin-action.js` | 200 | Admin mutation handler |
| `api/claude.js` | 141 | Anthropic proxy (non-streaming) |
| `api/claude-stream.js` | ~200 | Anthropic proxy (SSE streaming) |
| `api/knowledge.js` | 500 | Knowledge layer endpoint |
| `api/enrich.js` | 200 | Apollo enrichment (paid) |
| `api/enrich-free.js` | 250 | Free enrichment (SEC EDGAR, Wikidata) |
| `api/hubspot.js` | 700 | HubSpot OAuth + CRM push |
| `api/admin.js` | 800 | Admin operations |
| `api/contact.js` | 80 | Contact form |
| `api/checkout.js` | 120 | Stripe checkout session |
| `api/stripe-webhook.js` | 200 | Stripe billing events |
| `api/invite.js` | 150 | Org invitations |
| `api/referral.js` | 180 | Referral program |
| `api/cron-reset-tokens.js` | 80 | Monthly run cap reset |
| `api/cron-data-refresh.js` | 80 | Weekly KL refresh |
| `api/cron-seller-profiles.js` | 80 | Weekly seller profile refresh |

### Knowledge Layers (src/data/)

**45 JS files, 18,055 total lines** — domain intelligence injected into AI prompts.

Largest files:
- `preRfpSignalKnowledge.js` (750 lines)
- `rfpProcurementKnowledge.js` (589 lines)
- `executivePerspectivesKnowledge.js` (559 lines)
- `aiMlKnowledge.js` (547 lines)
- `healthcareSaasKnowledge.js` (529 lines)
- `gamingKnowledge.js` (525 lines)
- `complianceKnowledge.js` (523 lines)

Plus data files: `outcomes.js`, `riverFramework.js`, `sampleAccounts.js`, `verticalPlaybooks.js`, `rfpSources.js`, `sources_manifest.json`, `compliance-knowledge-layer.json`

### Database Migrations (supabase/migrations/)

27 sequential SQL migrations (001-027) covering auth, orgs, sessions, usage, data science tables, RLS policies.

### CI/CD (.github/workflows/)

- `golden-set-full.yml` — nightly brief quality regression
- `golden-set-lite.yml` — fast smoke test
- `knowledge-lint.yml` — KL citation/format checks
- `nightly-backup.yml` — database backup
- `security-scan.yml` — dependency vulnerability scan

---

## 2. APP.JSX — THE MONOLITH (16,000 lines)

### 2.1 Module-Level Globals (Lines 1-560)

**Knowledge Layer Variables** (~160 `let KL_*` declarations):
- Negotiation frameworks: `KL_NEGOTIATIONS`, `KL_FISHER_URY`, `KL_GRAHAM`, `KL_JOLT`, `KL_CHALLENGER`, `KL_FOUR_FORCES`
- Scoring rules: `KL_FIT_RULES`, `KL_BUYING_SIGNALS`, `KL_QUESTION_BANK`
- 35+ vertical-specific KLs: `KL_PAYMENTS`, `KL_BANKING`, `KL_HEALTHCARE`, etc.
- Cross-cutting: `KL_EXEC_PERSPECTIVES`, `KL_APPROVAL_GATES`, `KL_PE_HOLDCO`

Loaded async via `fetchKnowledgeLayer()` (lines 160-298) from `/api/knowledge`. Trial users get core only; paid users get all verticals.

**Auth Globals:**
- `_authToken` — JWT token (module-level, not reactive)
- `_trackingCtx` — per-request tracking headers
- `HAIKU`, `SONNET`, `OPUS` — model ID constants
- `activeModel()` — returns Haiku (default for all callAI calls)

**Brief Schema:**
- `BLANK_BRIEF` — 333-field skeleton with all sections initialized to null/empty
- `P1_FIELDS` — allowlist of fields P1 (overview) can set

### 2.2 Module-Level Functions (Lines 365-2,600) — OUTSIDE the React component

#### Parsing & Validation (~200 lines)
| Function | Line | Purpose |
|----------|------|---------|
| `safeParseJSON(text)` | 491 | Robust JSON parser — handles smart quotes, trailing commas |
| `extractJsonWithKey(text, key)` | 523 | Brace-walking parser anchored on key name |
| `stripCitations(obj)` | 551 | Removes `<cite>` tags from web_search results |
| `repairJSON(s)` | ~510 | Fixes common JSON malformations |

#### AI & API (~400 lines)
| Function | Line | Purpose |
|----------|------|---------|
| `claudeFetch(body, opts)` | 1126 | Non-streaming Anthropic proxy with 3x retry (handles 429/500/529) |
| `streamAI(prompt, onChunk, maxTok)` | 1184 | Streaming with JSON parse fallback |
| `streamAIWithSearch(prompt, onChunk, maxTok, opts)` | 1261 | Streaming + web_search tool support |
| `callAI(prompt, opts)` | 1358 | Synchronous AI call (callAI → claudeFetch → parse) |
| `buildSellerProofPack(...)` | ~1490 | Aggregates seller context into prompt injection |

#### Knowledge Injection (~800 lines)
| Function | Line | Purpose |
|----------|------|---------|
| `_rankAndCapKls(pairs, targetInd, ...)` | 605 | 2-tier relevance ranking: Tier 1 (full, max 2) + Tier 2 (truncated, max 3) |
| `_matchVerticals(text)` | 656 | Keyword scoring for vertical selection |
| `getVerticalInjection(sellerICP, targetInd)` | 682 | Format vertical intelligence for prompt |
| `getPaymentsInjection(...)` | ~750 | Payments-specific (2+ keyword threshold) |
| `getBankingInjection(...)` | ~780 | Banking-specific |
| `getHealthcareInjection(...)` | ~810 | Healthcare-specific |
| ... 25+ more `get*Injection()` | 750-1100 | One per vertical, each with keyword thresholds |

#### Deal Scoring (~100 lines)
| Function | Line | Purpose |
|----------|------|---------|
| `calcConfidence(gates, riverData)` | 428 | 0-100 deal health from RIVER gates |
| `calcDealHealth(gates, riverData)` | 445 | Per-stage breakdown |
| `confColor(score)` | 479 | Red/amber/green for score ranges |

#### Brief Generation (~900 lines)
| Function | Line | Purpose |
|----------|------|---------|
| `generateBrief(member, sellerUrl, ...)` | 1624 | **THE BIG ONE** — orchestrates p1-p10, returns skeleton + promises |

#### UI Components (~1,400 lines, defined outside App())
| Component | Line | Purpose |
|-----------|------|---------|
| `ChatPanel` | ~2700 | Milton AI coaching chat |
| `CompanyLogo` | ~2800 | Logo with domain fallback |
| `EmptyState` | ~2830 | Empty state card |
| `InfoTip` | ~2860 | Inline tooltip |
| `StepHint` | ~2880 | Step progression hint |
| `MilestoneCelebration` | ~2920 | Celebration toast |
| `CommandPalette` | ~2970 | Cmd-K search |
| `BriefLoader` | ~3050 | Brief generation spinner with quips |
| `AuthShell` | ~3100 | Auth wrapper |
| `PasswordGate` | ~3150 | Login/signup form |
| `PieChart` | ~3250 | Fit score visualization |
| `CohortDrillDown` | ~3300 | Cohort expansion view |
| `RiverFieldCard` | ~3400 | RIVER field editor |
| `ExportMenu` | ~3480 | PDF/CSV export buttons |
| `EF` | ~3520 | Inline editable field (click to edit) |
| `GuidePanel` | ~3600 | Help guides drawer |
| `FitSortTh` | ~3700 | Sortable table header |
| `StarButton` | ~3750 | Favorite star toggle |

### 2.3 useState Declarations (127 states)

#### Authentication & Session (8 vars)
```
authed                  — boolean login flag
showLanding             — landing page visibility
sbUser                  — Supabase user object {id, email, ...}
sbToken                 — JWT token string
showSavePrompt          — save session modal visibility
savedSessions           — [{id, name, created_at, ...}]
currentSessionId        — active session UUID
sessionMode             — "full" | "quick"
```

#### Seller Context (10 vars)
```
sellerUrl               — seller company URL (the anchor for everything)
sellerInput             — free-text seller entry field
sellerStage             — funding stage dropdown
sellerICP               — {marketCategory, icp: {industries[], companySize, buyerPersonas[], ...}}
sellerICPInput          — user's optional ICP description
sellerDocs              — [{name, label, content}] seller documents (max 6)
sellerProofPoints       — case studies, ROI metrics
sellerExclusions        — things seller doesn't do
productUrls             — seller product page URLs for scanning
products                — [{id, name, description}] seller products (max 20)
```

#### ICP Build (7 vars)
```
icpTargeting            — {segment, headcount[], revenue[], ownership[], geography[]}
icpLoading              — ICP generation in-flight
icpStatus               — progress message string
icpTab                  — "icp" | "rfp" tab selector
icpEdits                — [{field, oldValue, newValue, timestamp}] audit trail
icpLastEditTime         — timestamp of last user edit
icpDelta                — {alignments[], gaps[], recommendations[]}
```

#### Target Account Import (15 vars)
```
rows                    — parsed CSV rows
headers                 — column names
mapping                 — {company, industry, acv, lead_source, ...}
fileName                — uploaded file name
drag                    — file drag hover state
importMode              — "csv" | "quick"
targetIndustries        — selected industry filters (up to 3)
targetIndInput          — free-text industry input
targetHeadcount         — selected size band filters
targetRevenue           — selected revenue band filters
targetOwnership         — selected ownership type filters
targetGenLoading        — AI account generation in-flight
targetGenError          — error message
targetGenNote           — suggestion note
disqualified            — {company: "reason"} map
```

#### Fit Scoring (8 vars)
```
fitScores               — {company: {score, label, reason, dim1, dim2, dim3, ...}}
fitScoring              — scoring in-flight flag
fitScoreExpected        — expected count for progress bar
fitWeights              — {dim1: 45, dim2: 30, dim3: 25} (user-adjustable)
intelAdjustments        — per-company modifier adjustments
intelModalTarget        — company name for intel modal
fitSortKey              — sort column key
fitSortDir              — "asc" | "desc"
```

#### Account Selection & Brief (13 vars)
```
selectedAccount         — active account {company, company_url, ind, ...}
accountQueue            — multi-select queue [{company, ...}] (max 5)
queueIdx                — which queue item is active (0-4)
brief                   — generated brief (333 fields — see BLANK_BRIEF)
briefLoading            — generation in-flight
briefStatus             — progress message
briefError              — error string
riverHypo               — RIVER hypothesis object
discoveryQs             — product-specific discovery questions
accountDocs             — target-specific documents (RFPs, notes)
contactRole             — "VP Sales", "Head of Ops", etc.
solutionFit             — post-call SA review
postCall                — post-call scoring/routing
```

#### RIVER Sales Methodology (4 vars)
```
activeRiver             — current RIVER stage (0-4)
gateAnswers             — {gate_id: "answer string"}
gateNotes               — freeform notes per gate
riverData               — {discovery_prompt_id: "text"}
```

#### RFP & Deal Context (5 vars)
```
dealValue               — "$10K-$50K" etc.
dealClassification      — "Top-Line Revenue" etc.
rfpData                 — {open[], closed[], signals[], loading, error}
accountRfpData          — per-account RFP intel
rfpFilter               — "all" | "private" | "government"
```

#### Cohort & Outcomes (5 vars)
```
cohorts                 — [{id, name, color, size, pct, members[]}]
selectedCohort          — active cohort object
selectedOutcomes        — user-selected outcome strings
customOutcome           — free-form outcome text
quickBriefInput         — a la carte brief company name
```

#### Chat & Coaching (4 vars)
```
chatMessages            — [{role: "user"|"assistant", content}]
chatLoading             — chat in-flight
miltonMsgCount          — total Milton messages sent
miltonNudge             — cheeky validation message
```

#### Organization & Billing (4 vars)
```
orgCtx                  — {id, name, plan, run_count, max_runs, userRole}
hubspotStatus           — {connected, portalId, ownerId}
notes                   — post-call freeform notes
expandedObjs            — {company: true/false} collapse state
```

#### UI State (20+ vars)
```
step                    — workflow step (0-9)
showSessions            — session list drawer
orgPanelOpen            — org settings panel
superAdminOpen          — admin dashboard
moreMenuOpen            — header dropdown
helpOpen                — help menu
favPanelOpen            — favorites drawer
contactFormOpen         — contact form modal
resourcesOpen           — resources panel
guidesOpen              — guides drawer
activeGuide             — "user" | "admin" | "api"
chatOpen                — Milton chat panel
cmdOpen                 — Cmd-K command palette
confirmModal            — {message, onConfirm, onCancel}
undoAction              — {label, undo, timerId}
copied                  — clipboard feedback state
celebrateStep           — milestone celebration ID
collapsedBB             — Set of collapsed brief section keys
editToast               — edit confirmation toast
favorites               — [{id, type, label, content, company, step}]
resourceTab             — "tools" | "guides"
```

#### Document Management (5 vars)
```
sellerDocs              — seller documents
accountDocs             — target documents
docDrag                 — drag state for seller docs
prodDocDrag             — drag state for product docs
urlScanStatus           — "scanning" | "found" | "none"
```

### 2.4 useRef Declarations (15 refs)

| Ref | Purpose |
|-----|---------|
| `dsSessionRef` | Data science session UUID |
| `dsSessionStart` | Session start timestamp |
| `proofPackCache` | Memoized proof pack `{key, value}` |
| `prevSellerUrlRef` | Track seller URL changes |
| `celebratedRef` | Set of milestones fired this session |
| `hubspotCheckedRef` | Flag: checked HubSpot status this session |
| `lastGenSig` | Signatures for dedup: `{icp, brief, hypo, postCall}` |
| `fileRef` | File input DOM ref (CSV upload) |
| `docRef` | File input DOM ref (seller docs) |
| `prodDocRef` | File input DOM ref (product docs) |
| `execCacheRef` | Pre-fetched executives: `{company: promise/result}` |
| `briefPreCacheRef` | Pre-fetched brief sections: `{company: {overview, live}}` |
| `enrichmentCacheRef` | Apollo enrichment: `{domain: result}` |
| `lastAutoSaveSnap` | Last saved state snapshot for dirty detection |
| `autoSaveRetryRef` | Auto-save retry timer ID |
| `prevStepRef` | Track step changes for milestone detection |
| `prevICPRef` | Track ICP changes |
| `icpBuiltRef` | Flag: ICP has been built at least once |

### 2.5 useEffect Hooks (20+)

| Approx Line | Deps | Purpose |
|-------------|------|---------|
| ~4150 | `[]` | Clear legacy localStorage entries on mount |
| ~4218 | `[sellerUrl]` | Reset seller context on URL change |
| ~4247 | `[sellerExclusions]` | Sync exclusions into ICP |
| ~4298 | `[sbUser]` | Check HubSpot connection on login |
| ~4352 | `[icpTargeting]` | Auto-populate target generation dropdowns |
| ~6847 | `[]` | Build ICP on mount if empty |
| ~7135 | `[sbUser]` | Load saved sessions on user change |
| ~7156 | `[brief, riverHypo, postCall, ...]` | Auto-save session (debounced 10s) |
| ~7187 | `[]` | Keyboard shortcuts (Cmd-K, Cmd-S, arrow nav) |
| ~7230 | `[step]` | Milestone celebration on step change |
| ~7247 | `[cohorts.length]` | Celebrate: prospects_added |
| ~7249 | `[fitScoring]` | Celebrate: first_fit |
| ~7251 | `[brief?.companySnapshot]` | Celebrate: brief_built |
| ~7253 | `[riverHypo?.reality]` | Celebrate: hypothesis_ready |
| ~7255 | `[step===7]` | Celebrate: call_started |
| ~7257 | `[postCall?.dealRoute]` | Celebrate: post_call |
| ~9543 | `[]` | HubSpot OAuth callback listener |
| ~9542 | `[selectedAccount, sellerUrl]` | Pre-cache exec + brief for selected account |
| ~9866 | `[disambigOptions]` | Focus management in modals |

---

## 3. BRIEF GENERATION PIPELINE

### 3.1 The 10 Micro-Calls (p1-p10)

All fire from `generateBrief()` (~line 1624). Returns a skeleton immediately, then merges sections as promises resolve.

| Call | Name | Model | Web Search | What It Returns | Typical Time |
|------|------|-------|-----------|-----------------|-------------|
| **p1** | Overview | Sonnet | 1 search | companySnapshot, revenue, employees, HQ, founded, ownership, competitors, watchOuts | ~2-3s |
| **p2** | Executives | Sonnet | 2 searches | keyExecutives[{name, title, background, angle}], sellerSnapshot | ~3-5s |
| **p3** | Strategy | Sonnet | 1 search | elevatorPitch, strategicTheme, openingAngle, outreachEmails[], fiveQuestions[] | ~4-6s |
| **p4** | Solutions | Sonnet | 1 search | solutionMapping[], caseStudies[], keyContacts[], techStack, mobilizer | ~4-6s |
| **p5** | Live Search | Haiku | 2 searches | recentHeadlines[], recentSignals[], growthSignals[], workforceProfile, cultureProfile, sentimentScores, incumbentVendors | ~2-3s |
| **p6** | Open Roles | Haiku | 2 searches | openRoles: {summary, roles[{title, dept, signal}]} | ~2-3s |
| **p7** | Competitive | Sonnet | 2 searches | competitivePositioning: {marketPosition, primaryCompetitors[], whereWinning, whereLosing, displacementAngle} | ~3-4s |
| **p8** | Board | Sonnet | 2 searches | boardAndInvestors: {boardMembers[], leadInvestors, investmentThesis, boardMandate} | ~3-4s |
| **p9** | Financial | Sonnet | 2 searches | financialDeepDive: {revenueTrend, marginTrend, segmentBreakdown, capitalPriorities, earningsInsight, guidanceQuote} | ~3-4s |
| **p10** | Gate Map | Sonnet | 0 | gateMap: {sellerGates, buyerGates, criticalPath, mapAdvice} | ~1-2s (delayed 5s) |

**Total concurrent API calls**: 9 immediate + 1 delayed (p10 waits 5s)
**Total web searches**: ~17 across all calls

### 3.2 Call Grouping

```
Immediate:  p1, p2, p3, p4, p5, p6, p7, p8, p9  (9 concurrent)
Delayed:    p10 (fires after 5s delay)

earlyDone = Promise.allSettled([p1, p3, p4])   — triggers hypothesis build
deepIntelDone = Promise.allSettled([p7, p8, p9, p10])  — competitive/financial/board/gates

Mergers (fire independently as each promise resolves):
  overview:   p1  → mergeOverview()
  executives: p2  → mergeExecs()
  strategy:   p3  → mergeStrategy()
  solutions:  p4  → mergeSolutions()
  live:       p5  → mergeLive()
  roles:      p6  → mergeRoles()
  deepIntel:  [p7,p8,p9,p10] → mergeDeepIntel()  (includes revenue/HQ backfill from p9)
```

### 3.3 Merge Functions

Each merger takes the API result and patches `brief` state:

- `mergeOverview(r1)` — Sets P1_FIELDS only. **Contamination detector**: strips multi-company snapshots.
- `mergeExecs(r2)` — Sets keyExecutives. Rejects stub-only cache.
- `mergeStrategy(r3)` — Sets pitch, theme, angle, emails, questions. Backfills publicSentiment if p5 missed it.
- `mergeSolutions(r4)` — Sets solutionMapping, caseStudies, contacts, techStack, mobilizer.
- `mergeLive(r5)` — Sets headlines, signals, sentiment, workforce, culture. **Contamination filter**: strips wrong-entity headlines.
- `mergeRoles(r6)` — Sets openRoles. Validates data before accepting.
- `mergeDeepIntel(r7,r8,r9,r10)` — Sets competitive, board, financial, gateMap. **Backfills**: revenue from P9 revenueTrend, HQ from P1 companySnapshot.

### 3.4 Context Layers (Injected into prompts)

```
baseLight (target-only context)
├── Identity anchor (site: search strategy, contamination guard)
├── Apollo enrichment context (if available)
├── Fallback firmographics (from member data)
├── SEC filing context (if public company)
├── Empty field rule + exceptions
├── Anti-hallucination rules
└── Stability/consistency rules

baseFull (baseLight + seller context)
├── baseLight
├── Universal negotiation/sales context
├── Seller description + products
├── Proof pack (case studies, ROI)
├── Knowledge layer injections (2-tier ranked, capped)
├── Cross-session intelligence (prior competitor intel)
├── Deal context (cohort, outcomes)
└── Anti-repetition rule
```

### 3.5 Knowledge Injection (2-Tier Ranking)

To prevent 400 errors from oversized prompts:

- **Tier 1** (full content, max 2 verticals): Highest relevance to target industry
- **Tier 2** (truncated to 500 chars, max 3 verticals): Secondary matches
- **Cross-cutting** (always injected, capped):
  - Executive Perspectives: 4,000 chars
  - Approval Gates: 3,000 chars
  - PE/Holdco: conditional on ownership type
  - Accounting, B2B Sales, OKR/KPI: 2,000 chars each

### 3.6 Caching & Pre-fetch

**At account select (step 4):**
- `execCacheRef[company]` — fires p2-equivalent (exec search)
- `briefPreCacheRef[company].overview` — fires p1-equivalent
- `briefPreCacheRef[company].live` — fires p5-equivalent
- `enrichmentCacheRef[domain]` — fires Apollo enrichment

**At brief generation (step 5):**
- Checks cache refs first → reuses if valid
- Rejects exec cache if all stubs (CEO/CTO only)
- Rejects brief cache if missing critical sections

### 3.7 Error Handling

- **Per-call retry**: 3 attempts with exponential backoff (3s/6s/12s for 500s, 15s for 429s)
- **Hard timeout**: 60 seconds — clears all loading states
- **Per-section failure**: Adds to `_failedSections[]`, renders "X sections incomplete" banner
- **gateMap auto-retry**: If first attempt returns null, retries with simplified prompt
- **Revenue/HQ backfill**: If P1 left empty, fills from P9 financial estimates

---

## 4. API LAYER (Vercel Serverless)

### 4.1 Guard System (`api/_guard.js`)

**7 layers of defense:**

1. **JWT Auth** — HMAC-SHA256 / ES256 / RS256 signature verification via Supabase JWKS
2. **Origin Allowlist** — `cambriancatalyst.ai`, `*.cambrian-playbook*.vercel.app`, `localhost`
3. **Rate Limiting** — Per-IP sliding window (in-memory, per-instance)
4. **Model Allowlist** — `claude-haiku-4-5-20251001`, `claude-sonnet-4-5-20250929`, `claude-opus-4-6`
5. **Tool Allowlist** — `web_search_20250305` only
6. **Input Size Cap** — 250KB messages + 30KB system prompt
7. **Output Cap** — 8,000 max_tokens

**Overrides:**
- `temperature: 0` and `top_k: 1` hardcoded (deterministic output)
- Model fallback chain: Opus → Sonnet → Haiku (on 529 overload)

### 4.2 Proxy Flow

```
Browser                  Vercel Function              Anthropic API
───────                  ──────────────              ─────────────
claudeFetch(body) ──→   /api/claude ──→              POST /v1/messages
                        guard(req, res)
                        ├─ verifyJwt()
                        ├─ isAllowedOrigin()
                        ├─ checkRateLimit()
                        ├─ sanitizeBody()
                        │  ├─ validate model
                        │  ├─ cap max_tokens
                        │  ├─ enforce temp=0
                        │  └─ sanitize tools
                        └─ logUsage()
                                                      ←─── response
                        return response ──→ browser
```

### 4.3 Cron Jobs

| Endpoint | Schedule | Purpose |
|----------|----------|---------|
| `/api/cron-reset-tokens` | 1st of month | Reset org run counts |
| `/api/cron-data-refresh` | Monday 8am | Refresh knowledge layer cache |
| `/api/cron-seller-profiles` | Monday 9am | Re-enrich stale seller profiles |

---

## 5. DATA LAYER

### 5.1 Supabase Tables

#### Core
- `auth.users` — Supabase-managed (email, password, OAuth)
- `orgs` — {id, name, plan, run_count, run_limit, stripe_customer_id, created_at}
- `org_members` — {user_id, org_id, role: "admin"|"member", invited_at, joined_at}
- `invitations` — {email, org_id, token, expires_at}

#### Session Persistence
- `session_outputs` — {id, user_id, org_id, session_name, data: JSONB, created_at}
- `account_outputs` — {id, user_id, org_id, seller_url, target_company, target_domain, output_type: "brief"|"fit_score"|"session_summary", data: JSONB, is_latest, superseded_at}

#### Usage & Billing
- `api_usage_log` — {user_id, org_id, model, input_tokens, output_tokens, cache_read_tokens, web_searches, endpoint, cost, target_company, seller_url}
- `org_usage` — aggregated monthly view

#### Data Science (6 tables)
- `rfp_intel_signals` — RFP/procurement intelligence
- `brief_quality_signals` — per-brief quality metrics
- `discovery_signals` — pre/post-call hypothesis quality
- `competitor_intel` — verified competitor-customer relationships
- `kl_effectiveness` — which knowledge layers improve output quality
- `session_journey` — full user journey per session (funnel analytics)

#### RLS Policies
- Users see only their own org's data
- Admins see all org members + outputs
- Service role has full access (for cron jobs)
- Authenticated users can INSERT to data science tables

### 5.2 Client-Side Persistence

**localStorage keys:**
- `cambrian_session_v1` — full session state (auto-saved every 10s, debounced)
- `icp:v3:${sellerUrl}` — cached ICP per seller
- `rfp:v6:${company}:${sellerUrl}` — cached RFP results
- `brief_cache:${company}:${sellerUrl}` — cached brief data

**useRef caches (session-only):**
- `execCacheRef` — {company: promise|result} exec pre-fetch
- `briefPreCacheRef` — {company: {overview, live}} brief pre-fetch
- `enrichmentCacheRef` — {domain: apolloResult} enrichment
- `proofPackCache` — {key: string, value: object} memoized proof pack

---

## 6. STATE FLOW

### Complete Data Pipeline

```
sellerUrl (user enters URL)
    │
    ▼
buildSellerICP()  [Opus — web search + deep reasoning]
    │
    ▼
sellerICP = {
  sellerName, sellerDescription, marketCategory,
  icp: {
    industries[], companySize, revenueRange, dealSize,
    buyerPersonas[], customerExamples[], verifiedCustomers[],
    competitiveAlternatives[{name, theirCustomers[]}],
    productCatalog[{name, description, industries[]}],
    namedCustomerProfiles[{name, industry, useCase, ...}],
    disqualifiers[], uniqueDifferentiators[],
    linesOfBusiness[{name, description, buyerProfile, ...}]
  }
}
    │
    ▼
Import accounts (CSV or AI-generated targets)
    │
    ▼
cohorts[] = [{name, color, members[{company, company_url, ind, ...}]}]
    │
    ▼
scoreFit()  [Haiku — batch of 10, parallel batches]
    │
    ▼
fitScores = {company: {score, label, dim1, dim2, dim3, reason, ...}}
    │
    ▼
selectedAccount = {company, company_url, ind, employees, ...}
    │
    ▼
generateBrief()  [p1-p10 micro-calls, progressive merge]
    │
    ▼
brief = {333 fields — snapshot, execs, strategy, solutions, headlines, ...}
    │
    ▼
buildRiverHypo()  [Haiku — uses brief + ICP]
    │
    ▼
riverHypo = {reality, impact, value, executive, rationale}
    │
    ▼
Live Call: gateAnswers, gateNotes, riverData (user-captured)
    │
    ▼
buildPostCall()  [Haiku — uses brief + hypothesis + gate answers]
    │
    ▼
postCall = {dealRoute, confidence, nextSteps, followUpEmail}
    │
    ▼
Push to HubSpot / Export PDF / Save Session
```

### Shared vs. Step-Local State

**Shared (persists across steps):**
- sellerUrl, sellerICP, products, sellerDocs — seller context
- cohorts, fitScores — import/scoring results
- orgCtx, sbUser, sbToken — auth/billing
- step — current position

**Step-Local (reset on account change):**
- brief — regenerated per account
- riverHypo, postCall — per account
- gateAnswers, riverData — per call
- contactRole, selectedOutcomes — per account selection

---

## 7. EXTERNAL INTEGRATIONS

### Anthropic API
- **Endpoint**: `https://api.anthropic.com/v1/messages`
- **Models Used**:
  - Haiku (`claude-haiku-4-5-20251001`): scoring, enrichment, discovery, post-call, p5, p6
  - Sonnet (`claude-sonnet-4-5-20250929`): brief p1/p2/p4/p7/p8/p9, ICP pass 2
  - Opus (`claude-opus-4-6`): ICP pass 1, p3 strategy (highest-judgment calls)
- **Features**: web_search tool, streaming SSE, tool_use blocks
- **Rate Limits**: ~40K TPM, varies by tier
- **Cost**: Haiku ~$0.80/$4 per M tokens, Sonnet ~$3/$15, Opus ~$15/$75

### Supabase
- **Auth**: Email/password + JWT
- **Database**: PostgreSQL with RLS
- **Used for**: User management, session persistence, usage tracking, data science tables

### HubSpot
- **OAuth**: App client_id + secret
- **Actions**: Push company + note with session summary
- **Pattern**: PATCH old is_latest → POST new (prevents 409 conflicts)

### Apollo.io
- **Status**: Code exists but NOT LIVE (no API key connected)
- **Endpoint**: `/api/enrich` → Apollo org + people lookup
- **Fallback**: `/api/enrich-free` → SEC EDGAR, Wikidata

### Stripe
- **Checkout**: Creates session for plan upgrade
- **Webhook**: `checkout.session.completed` → updates org plan + run limits
- **Plans**: Trial (3 runs), Pro (50 runs), Team (500 runs)

---

## 8. KNOWN ARCHITECTURAL ISSUES

### Critical
1. **16K-line monolith** — 127 states, no component boundaries, every change risks breaking unrelated features
2. **10 concurrent API calls** — rate limiting causes rotating section failures, P10 consistently throttled
3. **No automated tests** — zero unit/integration/E2E tests
4. **No staging environment** — in progress (Vercel preview deployments on staging branch)

### High
5. **Fit score variance** — 21-point spread on identical inputs (LLM non-determinism). Fix planned: client-side deterministic scoring
6. **KL utilization at 35-40%** — 60% of knowledge layer intelligence never reaches prompts
7. **Brief 400 errors** — fintech sellers inject 130KB+ of KLs. Mitigated with 2-tier ranking but not eliminated
8. **Revenue/HQ empty for private companies** — conflicting prompt instructions (backfill from P9 implemented)

### Medium
9. **Pre-cache timing** — exec/brief pre-fetch sometimes still resolving when brief clicks
10. **Session persistence** — localStorage only, no server-side session state (data loss risk on crash)
11. **No component extraction** — only 1 of 9 steps extracted (S9_SolutionFit)
12. **CSS monolith** — 1,800 lines in single App.css

### Low
13. **26 knowledge.js keys served but never consumed** (bandwidth waste)
14. **`martech` vertical has no deep KL file**
15. **Apollo integration not live** (waiting on API key)
16. **`users` and `sessions` tables have no CREATE TABLE migration**
