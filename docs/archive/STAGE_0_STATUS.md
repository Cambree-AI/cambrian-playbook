# STAGE 0 — CURRENT STATUS
## Updated June 9, 2026

---

## EXECUTIVE SUMMARY

Stage 0 goal: validate that staging code produces clean, accurate briefs across diverse company types, then merge to production.

**Current state:** Marriott V0.7 is the first fully passing brief — 18/19 sections loaded, 9/9 web-verified, 19 pages. The root cause of 5 consecutive empty-P4 runs was a **Supabase brief cache** serving a stale incomplete brief from the first failed run. Cache validation now requires solutionMapping. 9 targets remain to be tested.

---

## WORK COMPLETED (27 commits on staging)

### Staging Environment
- Staging branch auto-deploying on push
- Origin guard accepts preview URLs
- CSP allows Vercel Live
- All env vars confirmed for Production + Preview
- Shared Supabase DB (approved)

### Brief Accuracy Fixes
| Fix | Commit | Verified |
|-----|--------|---------|
| P6 hallucinated job postings killed | `a61955f` | All runs |
| Exec stubs → actionable empty state | `c81b7de` | All runs |
| Bad /about link → root domain | `7179feb` | All runs |
| Competitor edges blank → filled | `c81b7de` | All runs |
| Displacement angle wrong → correct | `c81b7de` | All runs |
| Revenue backfill from P9 | `5c77f4b` | Brightpath, Marriott |
| Cross-company contamination defense | `5222fb6` | Circle (passed), Brightpath (passed) |
| P9 identity anchor (Stripe adhesives) | `88b03ec` | Needs Stripe re-test |
| Sentiment template dynamic text | `88b03ec` | Marriott V0.7 (no template bug) |
| P6 open positions multi-pass | `88b03ec` | Marriott V0.7 (3 roles found) |

### Section Reliability Fixes
| Fix | Commit | Verified |
|-----|--------|---------|
| gateMap → lazy generation (step 6) | `31e366f` | All runs (banner gone) |
| P3 Strategy: Opus → Sonnet | `88b03ec` | Marriott V0.7 (loads consistently) |
| Wave stagger (3 waves of 3) | `2e42e6e` + `9c66083` + `9e8121c` | Marriott V0.7 |
| P4 token cap: 4500 → 7500 | `9c66083` | Marriott V0.7 |
| P4 moved to Wave 1 (was timing out) | `9e8121c` | Marriott V0.7 |
| Brief cache validation: requires solutionMapping | `fd161be` | **ROOT CAUSE FIX** — Marriott V0.7 |
| Hard timeout: 45s → 90s | `8030e49` + `9c66083` | All runs |

### Console Error Fixes
| Fix | Commit |
|-----|--------|
| CSP blocking Vercel Live | `d2b279a` |
| account_outputs 409 spam | `31b4dac` |
| competitor_intel 400 | `6fc38a7` |
| Exec pre-cache crash | `1707681` |

### Fit Scoring
| Fix | Commit | Status |
|-----|--------|--------|
| Decision tree prompt | `558fc08` | **Reverted** (`c38f384`) — shifted baseline |
| Original prompt restored | `c38f384` | Active — variance remains (Stage 1 fix) |

---

## V0.1 AUDIT RESULTS (10 targets, BHN seller)

| # | Target | Score | Sections Failed | Key Issues |
|---|--------|-------|----------------|------------|
| 1 | Marriott | 85% | 3 (strategy, financial, solutions) | Sentiment template bug, open positions wrong |
| 2 | Stripe | 39% | 1 (strategy) | **Financial section about adhesives company** |
| 3 | Chipotle | 73% | 2 (strategy, financial) | Should be ~85% fit |
| 4 | Circle | 59% | 3 (strategy, competitive, financial) | Identity defense passed (no contamination) |
| 5 | Polymarket | 39% | 2 (strategy, competitive) | HQ may be wrong (Liberty Lake vs NYC) |
| 6 | Acme Widgets | 39% | 0 (CLEAN) | Should be 0 — unfindable company |
| 7 | Boeing | 39% | 2 (strategy, financial) | Known BHN customer — should be 75%+ |
| 8 | Kalshi | 39% | 1 (strategy) | Score correct |
| 9 | Feeding America | 39% | 1 (strategy) | Employee count discrepancy |
| 10 | Tango Card | 0% | 0 (CLEAN) | Correctly flagged as acquired subsidiary |

**V0.1 Verdict: FAIL** — P3 failed 8/10, Stripe contaminated, sentiment template wrong, scores clustered at 39%.

---

## POST-FIX MARRIOTT RUNS

| Run | Score | Banner | Products | Execs | Quick Take | 5 Questions | Issue |
|-----|-------|--------|----------|-------|------------|-------------|-------|
| V0.1 | 85% | 3 failed | 0 (failed) | 6 names | N/A | 5 found | P3/P4/P9 all failed |
| V0.1.1 | 73% | 2 failed | 0 (failed) | 0 (failed) | N/A | 5 found | P2/P4 dropped (rotating) |
| V0.2 | 73% | CLEAN | 0 | 0 | Missing | Missing | Wave stagger working but P4 empty |
| V0.3 | 73% | CLEAN | 0 | 0 | Missing | Missing | P4 still empty |
| V0.4 | — | — | — | — | — | — | Accidentally on production |
| V0.5 | 73% | CLEAN | 0 | 0 | Missing | Missing | P4 still empty — same pattern |
| V0.6 | — | — | — | — | — | — | Anthropic 500 errors |
| **V0.7** | **73%** | **CLEAN** | **3 mapped** | **1 name** | **Loaded** | **5 found** | **PASSING — cache fix was root cause** |

**Root cause of V0.2-V0.6 failures:** Supabase brief cache was serving a stale incomplete brief from V0.1's failed P4 run. Cache validation didn't check for solutionMapping. Every "run" was replaying the cached empty brief — `generateBrief()` never fired.

---

## MARRIOTT V0.7 — PASSING BRIEF

| Section | Status | Detail |
|---------|--------|--------|
| Banner | **CLEAN** | Zero incomplete sections |
| Web-verified | **9/9** | |
| Pages | **19** | Up from 10 on V0.1 |
| Quick Take | **Loaded** | Record pipeline, 610K rooms, asset-light model |
| Elevator Pitch | **Loaded** | |
| Strategic Analysis | **Loaded** | |
| Opening Angle | **Loaded** | |
| Outreach Emails | **Loaded** | |
| Products | **3 mapped** | Gift Card Distribution, Employee Recognition, Promotional Incentives |
| Champion | **Loaded** | VP of Loyalty / Head of Marriott Bonvoy |
| Case Studies | Missing | P4 didn't return case study data |
| Company Overview | **Loaded** | Revenue $6.7B, HQ Bethesda MD |
| Executives | **1 real name** | Anthony Capuano (CEO) — should find more |
| Headlines | **Loaded** | Real, current |
| Buying Signals | **Loaded** | |
| Open Positions | **Loaded** | 3 roles found |
| Sentiment | **Loaded** | NPS/Bonvoy signal — template bug fixed |
| Financial | **Loaded** | SEC data: $23.7B→$25.1B→$26.2B |
| Competitive | **5 competitors, 5 edges** | All filled |
| Board & Investors | **Loaded** | |
| Watch-Outs | **Loaded** | |
| 5 Questions | **Loaded** | 5 grounded (India expansion, citizenM, CFO conference, Bonvoy, buybacks) |
| Displacement | **Correct** | Targets seller displacement of internal/legacy systems |
| Contamination | **Clean** | |

### Remaining Minor Gaps
- **Case Studies missing** — P4 returned products and champion but no case studies
- **Only 1 executive** — Marriott has a large known exec team; P2 should find more
- **Late-loading sections** — Quick Take and 5 Questions fire after allDone, can take 60-90s. No visual indicator that content is still incoming. User exported PDF before they loaded.

---

## KNOWN ISSUES

### Blocking Stage 0 Pass
| Issue | Detail | Fix |
|-------|--------|-----|
| **9 targets untested** | Only Marriott re-run post-fix. Need Stripe (contamination fix), Circle, and 7 others. | Run remaining targets |
| **Brief build time 60-90s** | Wave stagger + post-allDone calls (Quick Take, 5Q) extend total time. No loading indicator for late sections. | Stage 5 UX (tabled) |
| **Case studies missing** | P4 returned products/champion but no case studies for Marriott | May need schema simplification or separate call |

### Not Blocking Stage 0 (per roadmap)
| Issue | Stage | Detail |
|-------|-------|--------|
| Fit score variance (21pt spread) | Stage 1 | Option C: client-side deterministic scoring |
| 6/10 targets scored exactly 39% | Stage 1 | Model defaults when uncertain |
| Boeing 39% (known BHN customer) | Stage 1 | No access to seller's actual customer list |
| Input-signature cache | Stage 1 | Same inputs → same outputs, server-persisted |
| Golden set repair | Stage 1 | Recalibrate against deterministic outputs |
| Token-budget-aware scheduler | Stage 2 | Structural fix for rate limiting |
| Pre-cache budget limit | Stage 2 | Top 1 account, not 3 |
| Smart section skipping | Stage 2 | Gate on data-availability, not headcount |
| Daily API cost unmeasured | Stage 3 | Baseline was $35-50/day |
| ICP build slow for large sellers | Stage 3 | Opus + extensive web search |
| Chunked KL retrieval | Stage 3 | pgvector, raise utilization past 35-40% |
| Group "5 Questions" with emails/angle | Stage 5 | UX logical grouping |
| Quick Take renders last | Stage 5 | Should render first |
| Late-loading indicator | Stage 5 | No "still building..." signal |

---

## STAGE 0 PASS CRITERIA (updated)

Stage 0 passes when:
1. Zero "sections incomplete" banners on ≥8 of 10 runs
2. Zero contamination across all 10 runs
3. Products mapped (solutionMapping) on ≥8 of 10 runs
4. Tango Card identified as competitor (score 0) ✅ Already passed
5. No KL injection 400 errors ✅ Already passed
6. Fit scores directionally correct — deferred to Stage 1
7. No fabricated executives, URLs, or statistics
8. Console shows ≤1 Anthropic 500 per brief (transient)

**Relaxed from original:** "zero banners across all 10" → "≥8 of 10" to account for transient Anthropic 500s. Fit score accuracy deferred to Stage 1 per roadmap.

---

## NEXT STEPS

1. **Run remaining 9 targets** — priority order: Stripe (contamination fix), Circle (3-section failure fix), Boeing, Chipotle, then remaining 5
2. **Assess results** — if ≥8 pass, Stage 0 passes
3. **Merge staging → main** — production gets all 27 commits
4. **Proceed to Stage 1** — deterministic scoring + golden set + input-signature cache

---

## DOCUMENTS

| File | Purpose |
|------|---------|
| `MERGED-ROADMAP.md` (Desktop) | Master plan — Stages 0-5 |
| `ARCHITECTURE.md` | Comprehensive codebase audit |
| `STAGE_0_AUDIT_PLAN.md` | 10-target test matrix + V0.1 full results |
| `STAGE_0_POST_AUDIT_FIXES.md` | V0.1→V0.2 fix summary |
| `STAGE_0_AUDIT_V0.2.md` | V0.2 changes |
| `STAGE_0_STATUS.md` (this file) | Current status |
| `SESSION_SUMMARY_2026-06-08.md` | Full session accounting |
| `SESSION_AUDIT_2026-06-08.md` | Earlier session audit |
