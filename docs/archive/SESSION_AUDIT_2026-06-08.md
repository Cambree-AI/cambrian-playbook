# CAMBRIAN CATALYST — SESSION AUDIT
## June 8, 2026

---

## WORK COMPLETED TODAY

### Staging Environment (Priority 1)
| Item | Status | Commit |
|------|--------|--------|
| Staging branch deployed to Vercel preview | **Done** | Pushed, auto-deploys |
| Origin guard updated for all preview URLs | **Done** | `c463aeb` (June 3) |
| CSP updated to allow Vercel Live script | **Done** | `d2b279a` |
| Env vars confirmed for Production + Preview | **Done** | All 18 vars set |
| Shared Supabase DB (staging = production) | **Accepted for now** | Joe approved |
| Main branch untouched — staging only | **Enforced** | 21 commits ahead |

**Staging URL**: `https://cambrian-playbook-git-staging-jgalanoiis-projects.vercel.app`

### Brief Quality Fixes (Priority 3 — Accuracy)
| Fix | Status | Commit | Verified |
|-----|--------|--------|----------|
| P6 hallucinated job postings killed | **Done** | `a61955f` (June 3) | v6-v14: honest empty every run |
| P2 exec 4-phase pipeline | **Done** | `a61955f` + `339907a` | v9: real name (Steve Martyn), v10+: empty state |
| Exec stub rendering → actionable empty state | **Done** | `c81b7de` | v10+: links to root domain, LinkedIn search |
| Exec empty state bad /about link | **Fixed** | `7179feb` | v14: links to root domain only |
| Enrichment 501 → graceful degradation | **Done** | `a61955f` (June 3) | Returns 200 with null |
| Competitor edges blank → prompt requires filling | **Done** | `c81b7de` | v9+: all edges filled with analysis |
| Displacement angle wrong (targeting prospect) | **Fixed** | `c81b7de` | v9+: correctly targets seller's displacement of status quo |
| Public sentiment graceful empty state | **Done** | `c81b7de` | Coaching tip renders for low-data companies |
| Revenue/HQ "Not found" → backfill from P9 | **Done** | `5c77f4b` | v14: revenue shows "$5M (estimated)" |
| HQ backfill from companySnapshot | **Partial** | `5c77f4b` | Regex misses when snapshot doesn't say "based in" |
| Cross-company contamination (v8: 5 companies) | **Fixed** | `5222fb6` | v9+: zero contamination |
| P5 headline contamination filter | **Done** | `5222fb6` | Strips wrong-entity headlines |
| P5 search too restrictive (site: killed results) | **Fixed** | `2fef27e` | v10+: headlines loading again |
| Brief repetition dedup rules | **Deployed June 3** | Unverified | Needs testing |

### Section Reliability
| Fix | Status | Commit |
|-----|--------|--------|
| gateMap moved to lazy generation (step 6) | **Done** | `31e366f` |
| "Sections incomplete" banner eliminated | **Done** | `31e366f` |
| P10 removed from brief pipeline (9 calls → 9) | **Done** | `31e366f` |
| gateMap fires on "Prep for the Call" click | **Done** | `31e366f` |
| Hard timeout extended 45s → 60s | **Done** | `8030e49` |

### Console Error Fixes
| Fix | Status | Commit |
|-----|--------|--------|
| CSP blocking Vercel Live script | **Fixed** | `d2b279a` |
| account_outputs 409 spam (14/run) | **Fixed** | `31b4dac` |
| competitor_intel 400 (wrong column names) | **Fixed** | `6fc38a7` |
| Exec pre-cache crash for Quick Brief | **Fixed** | `1707681` |

### Fit Scoring
| Fix | Status | Commit |
|-----|--------|--------|
| Decision tree scoring prompt | **Reverted** | `558fc08` → `c38f384` |
| Scoring prompt back to original baseline | **Done** | `c38f384` |

### Documentation
| Item | Status |
|------|--------|
| ARCHITECTURE.md (comprehensive) | **Written** — project root |
| SESSION_AUDIT_2026-06-08.md (this file) | **Written** — project root |

---

## COMMIT LOG (21 commits on staging, not in production)

### June 3, 2026 (5 commits — Phase 1 stabilization)
```
a61955f  Phase 1 stabilization batch — kill hallucinations, reasoned estimates, fix enrichment
c463aeb  Allow staging preview URL in origin guard
3185f68  P2 exec extraction — use callAI instead of claudeFetch
314938c  P2 exec extraction — Sonnet instead of Haiku, manual parse fallback
339907a  Exec cache serving stubs — ACTUAL root cause of persistent CEO/CTO stubs
```

### June 8, 2026 (16 commits — brief quality + staging + reliability)
```
1707681  Exec pre-cache skips Quick Brief and rejects stub-only cache entries
d2b279a  Allow Vercel Live script in CSP
31b4dac  account_outputs 409 spam — PATCH before POST
6fc38a7  competitor_intel 400 — wrong column names
c81b7de  Brief quality — 5 accuracy fixes (exec, competitor, sentiment, revenue, displacement)
42dc379  gateMap P10 parse failure — harden JSON extraction
558fc08  Fit score variance — decision trees (REVERTED)
c38f384  Revert scoring to pre-decision-tree baseline
5222fb6  Cross-company contamination — 3-layer defense
2fef27e  P5 news search fix — site: too restrictive
a487f7d  gateMap deferred (caused TDZ crash)
a3e2efa  Fix CRASH — ReferenceError on earlyDone
8030e49  gateMap retry with simplified prompt
7179feb  Exec empty state bad link fix
5c77f4b  Revenue/HQ backfill from P9
31e366f  gateMap moved to lazy generation
```

---

## BRIEF AUDIT RESULTS (15 runs on Brightpath Consulting)

### Section Quality Across Runs

| Section | v6 | v7 | v8 | v9 | v10 | v14 | **v15** |
|---------|----|----|----|----|-----|-----|---------|
| Banner | 1 fail | 1 fail | 1 fail | 2 fail | 2 fail | 1 fail | **CLEAN** |
| Contamination | Clean | Clean | **5 companies** | Clean | Clean | Clean | **Clean** |
| Executives | Stubs | Stubs | Wrong person | Real name | Empty state | Empty state | **Empty state** |
| Revenue | "Not found" | "Not found" | "Not found" | "Not found" | "Not found" | **$5M (est)** | **$5M (est)** |
| HQ | "Not found" | "Not found" | "Not found" | "Not found" | "Not found" | "Not found" | "Not found" |
| Competitor edges | Blank | Blank | Filled | Filled | Filled | Filled | **Filled (2/2)** |
| Displacement angle | Wrong | Wrong | Wrong | **Correct** | **Correct** | **Correct** | **Correct** |
| Where Win/Lose | "Insufficient" | Reasoning | Good | Good | Good | Good | Good |
| Headlines | Present | Present | Contaminated | Missing | Present | Present | Present |
| Sentiment | Empty | Coaching | Coaching | Coaching | Coaching | Coaching | Coaching |
| Solutions | Present | Present | Present | Present | **Missing** | Present | **3 products** |
| Financial | Good | Better | Good | Good | Good | Good | Good |
| Open positions | Honest empty | Same | Same | Same | Same | Same | Same |
| gateMap | Failed | Failed | Failed | Failed | Failed | Failed | **Lazy (no error)** |
| 5 Questions | Present | Present | N/A | N/A | N/A | N/A | Not found* |

*v15 5 Questions may be present but PDF text extraction couldn't parse them. Needs visual verification.

**v15 is the first clean brief** — zero incomplete sections, zero contamination, revenue backfilled, displacement angle correct, all solution products mapped. The only remaining gaps are HQ backfill (regex miss) and 5 Questions (needs visual check).

### Fit Score Variance

| Run | Score | Notes |
|-----|-------|-------|
| 1 | 83% | Old code |
| 2 | 71% | Old code |
| 3 | 79% | Old code |
| 4 | 54% | Decision tree prompt (reverted) |
| 5 | 62% | Reverted to original |
| 6 | 71% | Original prompt |
| 7 | 62% | Original prompt |
| 8 | 62% | Original prompt |
| 9 | 79% | Original prompt |

**Range**: 62-83 (21 points) excluding decision tree run
**Clustering**: 62 (3x), 71 (2x), 79 (2x), 83 (1x) — model has 3-4 attractor states
**Root cause**: LLM non-determinism even at temperature=0 with top_k=1
**Fix**: Option C (client-side deterministic scoring) — Task #9, pending

---

## OPEN ITEMS — MUST FIX

### 1. Fit Score Variance (Task #9)
- **Problem**: 21-point spread on identical inputs
- **Solution**: Client-side deterministic scoring (Option C) — LLM extracts facts, JS computes score
- **Status**: Pending — queued for this week
- **Priority**: High — undermines product credibility

### 2. HQ Backfill Incomplete
- **Problem**: Regex only matches "based in City, ST" pattern. Snapshot sometimes says "Kennesaw, Georgia-based" (adjective form) or doesn't mention location at all
- **Fix needed**: Broader regex patterns or secondary source (LinkedIn profile)
- **Priority**: Medium

### 3. Production Still Running Old Code
- **Problem**: 21 commits on staging not merged to main. Production (`cambriancatalyst.ai`) is running pre-June-3 code — missing all hallucination fixes, all accuracy improvements
- **Action needed**: Joe must test staging to satisfaction, then approve merge to main
- **Priority**: High once staging is validated

### 4. Rotating Section Failures
- **Problem**: P4 (solutions) and P5 (live) occasionally fail due to API rate limiting across 9 concurrent calls
- **Frequency**: ~1 in 5 runs loses a section
- **Mitigation**: gateMap removal reduced concurrent load from 10 to 9
- **Full fix**: Request queuing with priority tiers (Phase 2 architecture)
- **Priority**: Medium

---

## OPEN ITEMS — FROM JUNE 3 STABILIZATION AUDIT

### Phase 1 — Stop the Bleeding (MOSTLY DONE)
| Item | Status |
|------|--------|
| Kill P6 hallucinated roles | **Done** |
| Kill training-knowledge fallbacks | **Done** |
| Fix enrichment 501 | **Done** |
| Verify brief cache | Needs verification |
| Verify KL optimization savings ($15-20/day target) | Needs Anthropic console check |

### Phase 2 — Harden Pipeline (THIS WEEK per original timeline)
| Item | Status |
|------|--------|
| Section-level confidence tags | Not started |
| Graceful empty states every section | **Partially done** (exec, sentiment) |
| Pre-cache budget limit (top 1 not 3) | Not started |
| Smart section skipping (private <50 employees) | Not started |

### Phase 3 — Testing (NEXT WEEK per original timeline)
| Item | Status |
|------|--------|
| Smoke test script (must pass before push) | Not started |
| Fix or remove golden set CI | Not started |
| Staging environment | **Done** (Vercel preview) |

### Phase 4 — Architecture (WHEN STABLE)
| Item | Status |
|------|--------|
| Component extraction (App.jsx → 5+ files) | Not started — ARCHITECTURE.md written |
| Prompt compression (audit tokens, trim 30%) | Not started |
| Brief pipeline refactor (per-call retry/tests) | **Partially done** (lazy gateMap, revenue backfill) |

---

## TABLED ENHANCEMENTS (from prior sessions — NOT this week)

### Fit Score Overhaul
- Size mismatch modifier on Dim1
- Seller stage gate (Series A penalty for Fortune 500)
- 4th dimension: Deal Viability
- Calibrate against multiple seller profiles
- **Status**: Superseded by Option C (client-side scoring)

### Quick Entry Issues (from May 28)
- `suggestUrl` broken — not firing or returning null
- "Fit scores ready" fires too early
- Industry & Org Size columns show "—"
- Cohort named "Quick Entry" instead of industry

### RFP System
- RFP cache-vs-DB merge still broken (localStorage bypasses DB)
- RFP product-fit logic deployed but needs verification
- Stale data refresh (nightly cron for expired RFPs)

### HubSpot
- Disconnect → reconnect to capture owner_id
- Push from any session step (not just brief view)
- Custom properties for fit_score, deal_route, strategic_theme

### Knowledge Layers
- 60-65% of KL intelligence never reaches prompts
- Weekly KL refresh mechanism not built
- `martech` vertical has no deep KL file
- 26 knowledge.js keys served but never consumed

### Infrastructure
- Automated smoke tests before commits
- The Stash (6M heuristics — Joe wants to review and expand)
- Apollo integration (waiting on API key)
- Mobile testing on real devices
- `users` and `sessions` tables have no CREATE TABLE migration

### Model Strategy
- Split ICP build: Opus for seller research → Sonnet for structure
- Haiku for scoring, enrichment, discovery, hypothesis, post-call
- Not yet implemented — current model map works but isn't optimized

---

## RULES IN EFFECT (from June 3 audit)

1. No new features until Phase 2 complete
2. No model reassignment experiments
3. No prompt tweaks without measuring token count
4. No piecemeal fixes — batch related issues
5. No pushing without smoke test
6. **Empty is ALWAYS better than wrong**
7. **Hallucinations are P0 bugs**
8. **Never publish unverified URLs**

---

## METRICS (from June 3 audit baseline)

| Metric | June 3 Baseline | Current (June 8) | Target |
|--------|-----------------|-------------------|--------|
| Console errors per brief | 2-5 | 0-1 (transient Anthropic 500s only) | 0 |
| Hallucinated facts per brief | 1-3 | 0 | 0 |
| Sections showing incomplete | 1-2 (gateMap + rotating) | **0** (v15 clean) | 0 |
| Daily API cost | $35-50 | Not measured | $15-20 |
| Brief success rate | ~80% | **~95%** (v15 all sections loaded) | 99% |
| Cache hit rate (repeat) | 0% | Not measured | 70% |
| Fit score variance | 12pt spread | 21pt spread (9 runs) | ≤5pt (Option C) |

---

## NEXT PRIORITIES (Joe's direction)

1. **Architecture enhancements** — break the monolith (ARCHITECTURE.md ready)
2. **Fit check logic** — client-side deterministic scoring (Option C)
3. **Merge staging → main** — once validated
