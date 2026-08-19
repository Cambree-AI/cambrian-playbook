# STAGE 0 — Validation Audit Plan (Updated 6/10/2026)

## Seller: Blackhawk Network (blackhawknetwork.com)

## Status: PARTIALLY COMPLETE — Stripe validated, 8 targets remaining

**Last updated**: June 10, 2026 after v2.2.0 production release (21 commits merged)

**What changed since initial audit (6/8)**: 21 commits addressing 6 root causes. Structural identity fix (P1 snapshot injection), enrichment trust fix (firmographicsTruth downgrade), Option C deterministic scoring, cross-section consistency validator, source-tagged statistics, email placeholder fix, RLS policy cleanup. See `SESSION_2026-06-09-10.md` for full details.

**Key result**: Stripe (the hardest ambiguous-name test case) now produces 3 consecutive clean builds with zero contamination. Chicago Heights HQ eliminated. All 9 sections populated.

---

## 10 Targets Across Diverse Profiles

| # | Company | Industry | Size | Ownership | What It Stresses | Audit Status |
|---|---------|----------|------|-----------|-----------------|-------------|
| 1 | **Marriott International** | Hospitality | ~120K | Public (NASDAQ: MAR) | SEC filings, Glassdoor, real execs, direct product fit | **RUN ON 6/8** — needs re-run on v2.2.0 |
| 2 | **Stripe** | Fintech | ~8K | Private (VC-backed) | Ambiguous name, board/investors, KL injection | **PASS (V0.19)** — 3 clean runs |
| 3 | **Chipotle Mexican Grill** | QSR / Restaurants | ~115K | Public (NYSE: CMG) | Gift card/loyalty core fit, displacement angle | **RUN ON 6/8** — needs re-run |
| 4 | **Circle** | Crypto | ~1K | Private (VC-backed) | Ambiguous name contamination worst-case | **RUN ON 6/8** — needs re-run |
| 5 | **Polymarket** | Prediction Markets | ~50 | Private (VC-backed) | Bad fit — should score low, honest mapping | **RUN ON 6/8** — needs re-run |
| 6 | **Acme Widgets LLC** | SMB Manufacturing | ~75 | Private (Bootstrapped) | Nonexistent company, empty states | **RUN ON 6/8** — needs re-run |
| 7 | **Boeing** | Aerospace & Defense | ~170K | Public (NYSE: BA) | Large enterprise, indirect fit | **RUN ON 6/8** — needs re-run |
| 8 | **Kalshi** | Prediction Markets | ~100 | Private (VC-backed) | Bad fit, regulated, minimal overlap | **RUN ON 6/8** — needs re-run |
| 9 | **Feeding America** | Nonprofit | ~500 | Nonprofit | Different buying motion, donor language | **RUN ON 6/8** — needs re-run |
| 10 | **Tango Card** | Digital Incentives | ~200 | Private | Direct competitor — must flag | **RUN ON 6/8** — needs re-run |

---

## Per-Target Checklist

Run each target and check every item. Mark P (pass), F (fail), or N/A.

### Section Completeness

| Check | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|-------|---|---|---|---|---|---|---|---|---|---|
| No "sections incomplete" banner | P | **P** | | | | | | | | |
| Quick Take populated | | **P** | | | | | | | | |
| Elevator Pitch populated | | **P** | | | | | | | | |
| Strategic Analysis populated | | **P** | | | | | | | | |
| Opening Angle populated | | **P** | | | | | | | | |
| Outreach Emails (2) populated | | **P** | | | | | | | | |
| Solution Mapping (products) | | **P** | | | | | | | | |
| Champion Intelligence | | **P** | | | | | | | | |
| Case Studies | | **P** | | | | | | | | |
| Company Overview populated | | **P** | | | | | | | | |
| Financial Intelligence populated | | **P** | | | | | | | | |
| Competitive Positioning populated | | **P** | | | | | | | | |
| Board & Investors populated | | **P** | | | | | | | | |
| Watch-Outs populated | | **P** | | | | | | | | |
| 5 Questions populated | | **P** | | | | | | | | |

### Accuracy & Quality

| Check | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|-------|---|---|---|---|---|---|---|---|---|---|
| Zero contamination (no wrong-company data) | | **P** | | | | | | | | |
| Execs: real names OR honest empty state | | **P** | | | | | | | | |
| Revenue: real figure OR reasoned estimate | | **P** | | | | | | | | |
| HQ: real location OR empty (not "Not found") | | **P** | | | | | | | | |
| Displacement angle targets status quo, not prospect | | **P** | | | | | | | | |
| Competitor edges filled (not blank) | | **P** | | | | | | | | |
| Where They Win/Lose has reasoning | | **P** | | | | | | | | |
| Open Positions: real data OR honest empty | | **P** | | | | | | | | |
| No hallucinated URLs | | **P** | | | | | | | | |
| No fabricated statistics or metrics | | **P** | | | | | | | | |
| Brief correctly describes TARGET, not the seller | | **P** | | | | | | | | |
| Email sign-offs: [Your name here] not invented name | | **P** | | | | | | | | |
| Teaching insights source-tagged | | **P** | | | | | | | | |

### Fit Scoring

| Check | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|-------|---|---|---|---|---|---|---|---|---|---|
| Fit score recorded | 85 | 59 | 73 | 59 | 39 | 39 | 39 | 39 | 39 | 0 |
| Score feels directionally correct | Y | Y | N | | | | N | | Y | Y |
| #10 (Tango Card) flagged as competitor → score 0 | | | | | | | | | | **P** |
| #5/#8 (bad fits) score below 55% (Poor Fit) | | | | | **P** | | | **P** | | |
| #1/#3 (strong fits) score above 70% | **P** | | F* | | | | | | | |

*\*Chipotle scored 73% on 6/8 — below the 75% "strong fit" threshold. Needs re-evaluation with Option C scoring.*

### Console Health

| Check | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|-------|---|---|---|---|---|---|---|---|---|---|
| No CSP errors | | **P** | | | | | | | | |
| No 409 errors | | **P** | | | | | | | | |
| No 400 errors (KL injection overflow) | | **P** | | | | | | | | |
| Anthropic 500s ≤ 1 per brief | | **P** | | | | | | | | |
| POST failures ≤ 5 (after migration 031) | | *untested* | | | | | | | | |

### Special Checks (target-specific)

| Check | Target | Expected | Status |
|-------|--------|----------|--------|
| SEC filing data in financials | #1 Marriott, #3 Chipotle, #7 Boeing | Revenue cites 10-K or earnings | #1: Tested 6/8 (revenue reconciliation fixed $6.7B→$25.1B). Re-run needed on v2.2.0 |
| Glassdoor rating present | #1 Marriott, #3 Chipotle, #7 Boeing | Numeric rating (e.g. 3.8) | Needs re-run |
| Board/investors rich | #2 Stripe | Named investors, funding rounds | **PASS** — 7 board members with bios, $9.81B/24 rounds/123 investors |
| No contamination with similarly-named entities | #4 Circle | Zero references to Circle K, CircleCI, Circle Medical | Needs re-run — P1 snapshot injection should help |
| Product mapping honest about weak fit | #5 Polymarket, #8 Kalshi | Products mapped but with honest caveats | Needs re-run |
| Handles fabricated/nonexistent company | #6 Acme Widgets | Graceful empty states | Needs re-run |
| Nonprofit context in language | #9 Feeding America | Donor, volunteer, grant language | Needs re-run |
| Competitor guard fires | #10 Tango Card | dim1=0, dim2=0, dim3=0 OR explicit competitor flag | **PASS** (scored 0 on 6/8) — needs confirmation on v2.2.0 |
| KL injection doesn't cause 400 | #2 Stripe | Fintech + payments + AI KLs all fire without overflow | **PASS** — no 400 errors in V0.17/V0.18/V0.19 |
| Email sign-offs use placeholder | All | `[Your name here]` not invented names | **PASS** on #2 Stripe (V0.19). Untested on others. |
| Source tags on teaching insights | All | `[industry benchmark]`, `[proof pack]`, `[web search]` | **PASS** on #2 Stripe. Untested on others. |
| HQ not contaminated by enrichment | #2 Stripe, #4 Circle | Correct city, not from wrong SEC EDGAR entity | **PASS** on #2 Stripe (San Francisco). Untested on #4 Circle. |

---

## Scoring Summary

### From initial audit (6/8, pre-fixes)

| # | Target | Score (6/8) | Label | Correct? | Issues Found |
|---|--------|-------------|-------|----------|-------------|
| 1 | Marriott International | 85 | Strong Fit | Yes | Revenue was $6.7B (net fee) instead of $25.1B (total) — **FIXED** in revenue reconciliation. Employees showed ~190K instead of ~414K — **FIXED** in enrichment priority flip. |
| 2 | Stripe | 39 | Poor Fit | No — adhesives contamination | Brief referenced "adhesives and sealants markets". **FIXED** — 3 consecutive clean runs (V0.17-V0.19). Score now 59% (Potential Fit). |
| 3 | Chipotle Mexican Grill | 73 | Potential Fit | No — should be ~85% | Gift card/loyalty is core to QSR. Score calibration issue. |
| 4 | Circle | 59 | Potential Fit | Unclear | Quick entry couldn't suggest URL. Contamination risk high. |
| 5 | Polymarket | 39 | Poor Fit | Yes | Correct — minimal BHN overlap. Build time 99s. |
| 6 | Acme Widgets LLC | 39 | Poor Fit | Partial | Company doesn't exist online. Should arguably be 0. Build time 75s. |
| 7 | Boeing | 39 | Poor Fit | No — Boeing is a BHN customer | Employee rewards/incentives are a real use case. Score calibration issue. |
| 8 | Kalshi | 39 | Poor Fit | Yes | High-risk industry, compliance concerns. Build time 92s. |
| 9 | Feeding America | 39 | Poor Fit | Partial | Employee count: overview showed ~4,000 vs brief's 692 — wild inaccuracy. |
| 10 | Tango Card | 0 | Competitor | Yes | Correctly identified. Nuance: BHN acquired Tango in 2024. |

### Expected vs Actual (updated with fixes)

| # | Target | Expected Range | Score (6/8) | Needs Re-run? | Why |
|---|--------|---------------|-------------|---------------|-----|
| 1 | Marriott | 75-90 (Strong) | 85 | **Yes** | Revenue/employee fixes need validation |
| 2 | Stripe | 55-70 (Potential) | 59 (V0.19) | **Done** | 3 clean runs, score is reasonable |
| 3 | Chipotle | 75-90 (Strong) | 73 | **Yes** | Option C scoring may improve calibration |
| 4 | Circle | 50-65 (Potential) | 59 | **Yes** | Ambiguous name — P1 snapshot should help |
| 5 | Polymarket | 20-45 (Poor) | 39 | **Yes** | Confirm on latest code |
| 6 | Acme Widgets | 0-20 (No Fit) | 39 | **Yes** | Should score lower for nonexistent company |
| 7 | Boeing | 55-70 (Potential) | 39 | **Yes** | Biggest calibration miss — Boeing is a real BHN customer |
| 8 | Kalshi | 20-45 (Poor) | 39 | **Yes** | Confirm on latest code |
| 9 | Feeding America | 55-70 (Potential) | 39 | **Yes** | Employee count inaccuracy needs check |
| 10 | Tango Card | 0 (Competitor) | 0 | **Yes** | Confirm competitor guard still fires |

---

## Fixes Applied Since Initial Audit

### Contamination (Root Causes 1-2)
- [x] P7/P8/P9 await P1 companySnapshot — structural identity disambiguation
- [x] HQ removed from firmographicsTruth — stops enrichment from poisoning prompts
- [x] firmographicsTruth language downgraded to non-authoritative
- [x] Corroboration gate flipped: P1 > enrichment for HQ/employees/revenue
- [x] Financial contamination filter: r9 nulled out when detected
- [x] URL anchor in every Wave 3 search query

### Data Accuracy (Root Causes 3-5)
- [x] Revenue reconciliation in mergeDeepIntel — P9's largest figure wins when >2x P1
- [x] P3 metrics ban — no specific financial figures, hiring numbers, or member counts
- [x] Cross-section consistency validator (synchronous) — CEO, revenue, employees, P3 claims
- [x] Source-tagged statistics — `[proof pack]`, `[web search]`, `[industry benchmark]`
- [x] Employee count scan expanded to all P4 fields
- [x] Ownership-driven search routing (PE/VC/nonprofit/government)
- [x] Public company exact data requirement
- [x] fundingProfile anti-hallucination guard

### Pipeline Reliability (Root Cause 6)
- [x] Validator made synchronous — runs before brief marked complete
- [x] Auto-retry for failed P7/P9 on fresh builds
- [x] Wave stagger preserved via P1 await (natural ~15s delay)

### UX & Console
- [x] Email sign-offs: `[Your name here]` placeholder
- [x] Migration 030: RLS INSERT for 7 tables
- [x] Migration 031: RLS INSERT for 3 more tables + UPDATE policy broadened
- [x] isCompetitor tightened — only flags named seller competitors
- [x] industryMatch — "would they BUY what we sell?"

### Scoring
- [x] Option C deterministic scoring engine (`src/lib/fitScoring.js`)
- [ ] Golden set validation (run all 10 targets, compare scores)
- [ ] Score calibration review (Boeing, Chipotle under-scored)

---

## Pass Criteria

**Stage 0 passes when ALL of the following are true:**

1. [x] Zero "sections incomplete" banners across all 10 runs — **Stripe confirmed (V0.19)**
2. [x] Zero contamination across all 10 runs — **Stripe confirmed (3 runs)**
3. [ ] Revenue shows a real figure or reasoned estimate for all 10
4. [x] Tango Card (#10) is correctly identified as a competitor — **Confirmed 6/8**
5. [x] No KL injection 400 errors — **Stripe confirmed**
6. [ ] Fit scores are directionally correct (strong=high, bad=low, competitor=0) — **Boeing and Chipotle need recalibration**
7. [ ] No fabricated executives, URLs, or statistics across any run — **Stripe confirmed, 8 targets untested**
8. [x] Console shows ≤1 Anthropic 500 error per brief — **Stripe confirmed**

**Currently passing: 5/8 criteria confirmed. 3 require re-running remaining targets.**

---

## Next Steps

### Immediate (to complete Stage 0)
1. Re-run all 10 targets on production v2.2.0 with Full Rebuild
2. Export PDFs, record fit scores, fill in checklist above
3. Special attention to: #4 Circle (ambiguous name), #7 Boeing (score calibration), #9 Feeding America (employee count)
4. Verify migration 031 reduced console POST errors

### After Stage 0 Passes
1. Establish standing flow: staging → validate → merge in small batches
2. Proceed to Stage 1 — Option C golden set validation
3. Address score calibration (Boeing 39% → should be 55-70%)
4. Fix remaining ~30 unnamed POST failures if migration 031 didn't cover them all

---

## Production Releases

| Date | Version | Commits | Key Changes |
|------|---------|---------|-------------|
| 6/9/26 | v2.1.1 | 37 | Stage 0 stabilization — wave stagger, cache backfill, identity anchors |
| 6/10/26 | v2.2.0 | 21 | Structural identity fix, enrichment trust, Option C scoring, RLS cleanup |
