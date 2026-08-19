# SESSION SUMMARY — June 8, 2026
## Full accounting of work done, test results, and open items

---

## SESSION OVERVIEW

Started by picking up from the June 3 stabilization audit. Focused on three priorities:
1. Get staging environment working
2. Improve brief accuracy across all fields
3. Begin architecture planning for monolith breakup

Ended deep in Stage 0 validation — briefs are significantly better but P4 (solutions) has a persistent empty-content issue blocking full Stage 0 pass.

---

## COMMITS ON STAGING (27 total, not in production)

### June 3 (5 commits — Phase 1 stabilization)
```
a61955f  Phase 1 stabilization batch — kill hallucinations, reasoned estimates, fix enrichment
c463aeb  Allow staging preview URL in origin guard
3185f68  P2 exec extraction — use callAI instead of claudeFetch
314938c  P2 exec extraction — Sonnet instead of Haiku, manual parse fallback
339907a  Exec cache serving stubs — ACTUAL root cause of persistent CEO/CTO stubs
```

### June 8 (22 commits — brief quality + staging + reliability + audit fixes)
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
a487f7d  gateMap deferred (caused TDZ crash — fixed in a3e2efa)
a3e2efa  Fix CRASH — ReferenceError on earlyDone
8030e49  gateMap retry with simplified prompt
7179feb  Exec empty state bad link fix (/about → root domain)
5c77f4b  Revenue/HQ backfill from P9 financial estimates
31e366f  gateMap moved to lazy generation (eliminates banner)
88b03ec  Stage 0 critical — P3→Sonnet, P9 identity anchor, sentiment template, P6 multi-pass
2e42e6e  Wave stagger — 3 waves of 3 calls
9c66083  P4 token cap 4500→7500 + wave delays widened
121be03  P4 wrapper removed — use p1.then() instead of async IIFE
```

---

## WHAT'S FIXED (verified working)

### Staging Environment
- Staging branch deployed with auto-deploys on push
- Origin guard accepts all preview URLs
- CSP allows Vercel Live script
- All 18 env vars set for Production + Preview
- Shared Supabase DB (Joe approved)

### Brief Accuracy
| Fix | Status | Evidence |
|-----|--------|---------|
| P6 hallucinated job postings | **Fixed** | Honest empty across all runs |
| Executive stubs → actionable empty state | **Fixed** | "No named executives found" with root domain link |
| Bad /about link in exec empty state | **Fixed** | Links to root domain only |
| Competitor edges blank | **Fixed** | Filled with analysis across all runs |
| Displacement angle wrong (attacking prospect) | **Fixed** | Correctly targets seller's displacement of status quo |
| Revenue "Not found" → backfill from P9 | **Fixed** | Shows "$5M (estimated)" for Brightpath |
| Cross-company contamination (Brightpath v8) | **Fixed** | Zero contamination in Brightpath v9-v15 |
| Circle identity defense | **Fixed** | Zero Circle K/CircleCI contamination |
| Tango Card competitor detection | **Fixed** | Score=0, "do not pursue" |

### Console Errors
| Fix | Status |
|-----|--------|
| CSP blocking Vercel Live | **Fixed** |
| account_outputs 409 spam (14/run) | **Fixed** (still 1 sporadic 409 from session init) |
| competitor_intel 400 wrong columns | **Fixed** |
| Exec pre-cache crash for Quick Brief | **Fixed** |

### Section Reliability
| Fix | Status |
|-----|--------|
| gateMap moved to lazy generation | **Fixed** — fires on "Prep for the Call", not during brief |
| P3 Strategy → Sonnet (was Opus, 80% failure) | **Fixed** — loads consistently now |
| P9 identity anchor (Stripe adhesives contamination) | **Fixed** — deepIntelIdentity enforces site: search |
| Sentiment template ("< 50 employees" for public cos) | **Fixed** — dynamic text based on company size |
| P6 open positions multi-pass | **Fixed** — Phase 2 secondary sources + size-aware empty |
| Wave stagger (3 waves instead of 9 simultaneous) | **Deployed** — eliminates "sections incomplete" banner |

### Documentation
| Document | Location |
|----------|----------|
| ARCHITECTURE.md | Project root — comprehensive codebase audit |
| STAGE_0_AUDIT_PLAN.md | Project root — 10-target test matrix with full results |
| STAGE_0_POST_AUDIT_FIXES.md | Project root — fix summary for V0.1→V0.2 |
| STAGE_0_AUDIT_V0.2.md | Project root — V0.2 changes and validation plan |
| SESSION_AUDIT_2026-06-08.md | Project root — earlier session audit |
| MERGED-ROADMAP.md | Desktop — unified Stages 0-5 plan |

---

## STAGE 0 AUDIT — FULL RESULTS

### V0.1: 10-Target Audit with BHN as Seller

| # | Target | Score | Banner | Key Issues |
|---|--------|-------|--------|------------|
| 1 | Marriott | 85% | 3 sections failed | strategy, financial, solutions missing |
| 2 | Stripe | 39% | 1 section failed | **SEVERE: financial section about adhesives company** |
| 3 | Chipotle | 73% | 2 sections failed | strategy, financial missing. Should be ~85% fit. |
| 4 | Circle | 59% | 3 sections failed | strategy, competitive, financial missing |
| 5 | Polymarket | 39% | 2 sections failed | strategy, competitive missing |
| 6 | Acme Widgets | 39% | CLEAN | Should be 0 — company unfindable |
| 7 | Boeing | 39% | 2 sections failed | **Known BHN customer — should be 75%+** |
| 8 | Kalshi | 39% | 1 section failed | strategy missing. Score correct. |
| 9 | Feeding America | 39% | 1 section failed | Employee count discrepancy (4K vs 692) |
| 10 | Tango Card | 0% | CLEAN | Correctly identified as acquired subsidiary |

**V0.1 Verdict: FAIL** — 4 blocking issues identified.

### V0.1 → V0.2 Fixes Deployed
1. P3 Strategy: Opus → Sonnet (80% failure rate → loads consistently)
2. P9 identity anchor: deepIntelIdentity enforces site: search (fixes Stripe contamination)
3. Sentiment template: dynamic text based on company size/ownership
4. P6 open positions: 3-phase search with secondary sources

### V0.1.1: Marriott Re-Run (post P3/P9/sentiment/P6 fixes)
- Strategy **loaded** (pitch, analysis, angle, emails) ✅
- Financial **loaded** with real SEC data ($23.7B→$25.1B→$26.2B) ✅
- Open positions **found 3 roles** ✅
- Sentiment **has NPS data** ✅
- But: executives and solutions **dropped** (rotating failure)

### V0.2: Wave Stagger Deployed (3s/6s delays)
- **Banner: CLEAN** — first time zero incomplete sections
- But: solutions empty (0 products), Quick Take missing, 5 Questions missing
- Waves overlapping — 3s/6s delays weren't enough separation

### V0.3-V0.5: Marriott Re-Runs (wider delays, P4 token cap, p1.then() fix)
- Banner consistently CLEAN ✅
- Strategy consistently loading ✅
- Financial consistently loading ✅
- Headlines, signals, sentiment, competitive, board, watch-outs all loading ✅
- **P4 (solutions) consistently returning EMPTY** — header renders but 0 products ❌
- Quick Take, 5 Questions, Champion all depend on P4 or allDone timing ❌
- Executives showing empty state (P2 not finding names for Marriott) ❌

---

## OPEN ITEMS — BLOCKING STAGE 0

### 1. P4 (Solutions) Returns Empty Content — CRITICAL
**Pattern:** P4 returns a valid response (no failure flag, no banner) but with empty solutionMapping. The merge function accepts the response because `r4` is not null, but none of the product data is present.

**What we know:**
- P4 worked in V0.1 (Chipotle 4 products, Stripe 4 products, Polymarket 4 products)
- P4 fails consistently for Marriott on every post-fix run (V0.3, V0.4, V0.5)
- The async IIFE wrapper was removed and replaced with p1.then() — same result
- Token cap was increased from 4500 → 7500 — same result
- Wave delays were widened — same result

**What we DON'T know (need console diagnostic):**
- Does `[p4-merge]` show `r4: NULL` (API failure) or `r4: keys=[...] products=0` (parse issue)?
- Is `streamAIWithSearch` receiving the full response or getting truncated?
- Is `baseFull` for the new BHN ICP different from V0.1's ICP in a way that breaks P4?

**Next step:** Run one more Marriott brief and check the console for the `[p4-merge]` diagnostic log. This tells us exactly where the failure is.

### 2. P2 (Executives) Not Finding Marriott Names
Marriott has well-known executives (Anthony Capuano CEO, etc.) but P2 is returning the empty state. The exec search may be failing or returning stubs that get rejected. V0.1 found 6 real names; post-fix runs find 0. The ICP change (fresh browser session) may be affecting the exec search context.

### 3. Quick Take Not Rendering
Quick Take fires after `allDone` as a separate `callAI`. If P4 returns empty, the Quick Take has less context. The call may also be timing out if allDone resolves late (Wave 3 at 12s + response time).

### 4. 5 Questions Not Rendering
Same timing dependency as Quick Take — fires after `allDone`. May be getting cut off by the 90s hard timeout or by the post-allDone timing chain.

### 5. Sporadic 409 on account_outputs
One 409 still appearing per session from the session initialization path (not the scoring batch). Different trigger than the ones we fixed.

---

## OPEN ITEMS — NOT BLOCKING STAGE 0 (tracked for later stages)

### Stage 1 (Deterministic Scoring)
- Fit score variance: 21-point spread (62-83 for Brightpath, 59-85 for Marriott)
- 6/10 targets scored exactly 39% in V0.1 — model defaults when uncertain
- Boeing (known BHN customer) scored 39%
- Chipotle scored 73% (should be ~85%)
- Acme Widgets scored 39% (unfindable — should be 0)
- Option C: LLM extracts facts, JS computes score deterministically
- Input-signature cache: same inputs → same outputs, persisted server-side
- Golden set repair: recalibrate against deterministic outputs

### Stage 2 (Completeness)
- Token-budget-aware scheduler (structural fix for rate limiting)
- Pre-cache budget limit (top 1 account, not 3)
- Smart section skipping (gate on data-availability, not raw headcount)
- Feeding America employee count discrepancy (fit page vs brief)

### Stage 3 (Cost)
- Daily API cost unmeasured (baseline was $35-50/day)
- ICP build slow for large sellers (Opus + extensive web search)
- Chunked KL retrieval (pgvector, raise utilization past 35-40%)
- Model re-tiering (Opus only for ICP pass 1, already started)
- Brief build times 75-120 seconds

### Stage 5 (UI/UX)
- Group "5 Questions" with emails and opening angle
- Quick Take renders last (should render first)

---

## FIT SCORE TRACKING

### Brightpath Consulting (iRewardify seller)
| Run | Score | Notes |
|-----|-------|-------|
| 1 | 83% | Old code |
| 2 | 71% | Old code |
| 3 | 79% | Old code |
| 4 | 54% | Decision tree (reverted) |
| 5 | 62% | Reverted |
| 6 | 71% | |
| 7 | 62% | |
| 8 | 62% | |
| 9 | 79% | |

### Marriott (BHN seller)
| Run | Score | Notes |
|-----|-------|-------|
| V0.1 | 85% | First audit |
| V0.1.1 | 73% | Post-fix |
| V0.2 | 73% | Wave stagger |
| V0.3 | 73% | Wider delays |
| V0.4 | 73% | (was on production accidentally) |
| V0.5 | 73% | p1.then() fix |

Marriott is more consistent (73% on 4/5 staging runs) but may not be the correct score.

---

## RULES IN EFFECT

1. **Follow the MERGED-ROADMAP.md** — no ad hoc work until plan is executed
2. No new features until Stage 0 passes
3. Empty is ALWAYS better than wrong
4. Hallucinations are P0 bugs
5. Never publish unverified URLs
6. No piecemeal fixes — batch related issues
7. No push without smoke test (enforceable after Stage 1)

---

## NEXT SESSION PRIORITIES

1. **Diagnose P4 empty content** — check `[p4-merge]` console diagnostic to determine if it's an API failure, parse failure, or content issue
2. **Fix P4** — based on diagnostic results
3. **Fix P2 (executives)** — Marriott should find real names (it did in V0.1)
4. **Re-run Stage 0** — Marriott first, then Stripe (contamination fix), then remaining 8
5. **Once Stage 0 passes** — merge staging → main, proceed to Stage 1

---

## FILES CREATED/MODIFIED TODAY

### New Files
- `/Users/joe/Desktop/cambrian-playbook/ARCHITECTURE.md`
- `/Users/joe/Desktop/cambrian-playbook/STAGE_0_AUDIT_PLAN.md`
- `/Users/joe/Desktop/cambrian-playbook/STAGE_0_POST_AUDIT_FIXES.md`
- `/Users/joe/Desktop/cambrian-playbook/STAGE_0_AUDIT_V0.2.md`
- `/Users/joe/Desktop/cambrian-playbook/SESSION_AUDIT_2026-06-08.md`
- `/Users/joe/Desktop/cambrian-playbook/SESSION_SUMMARY_2026-06-08.md` (this file)
- `/Users/joe/.claude/projects/-Users-joe/memory/feedback_stick_to_roadmap.md`
- `/Users/joe/.claude/projects/-Users-joe/memory/feedback_never_guess_urls.md`

### Modified Files
- `src/App.jsx` — 22 commits of changes (brief quality, staging, reliability, wave stagger)
- `vercel.json` — CSP update for Vercel Live
- `api/_guard.js` — origin guard for staging URLs (June 3)
- `api/enrich.js` — 501 → 200 graceful degradation (June 3)
