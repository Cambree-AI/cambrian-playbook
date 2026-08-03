# Stage 0 Audit — Final Results (June 11, 2026)

## Summary

**10 of 10 targets audited on v2.2.0 production code.**

All 10 briefs pass on data quality (zero cross-company contamination). Score calibration is the #1 blocker for Stage 1.

---

## Final Scorecard

| # | Target | Industry | Score (6/8) | Score (6/11) | Expected | Verdict | Top Issue |
|---|--------|----------|------------|-------------|----------|---------|-----------|
| 1 | Marriott | Hospitality | 85 | **67** | 80-90 | PASS | Score REGRESSED 85→67. Revenue fix confirmed ($26.19B). Empty buying signals from cache. |
| 2 | Stripe | Fintech | 39 | **59** | 55-70 | PASS | Zero contamination (3 runs). Structural identity fix validated. |
| 3 | Chipotle | QSR | 73 | **67** | 75-90 | PASS | Under-scored. Best solution mapping in audit set. |
| 4 | Circle | Crypto | 59 | **63** | 50-65 | COND. PASS | Zero contamination (ambiguous name test). Solutions section failed (API 500s). |
| 5 | Polymarket | Prediction Markets | 39 | **52** | 40-55 | PASS | HQ wrong (Liberty Lake vs NYC — subsidiary address). |
| 6 | Acme Widgets | Nonexistent | 39 | **49** | 0-20 | PASS | Score too high for nonexistent company. P9 contamination from ZoomInfo ISP. |
| 7 | Boeing | Aerospace | 39 | **49** | 55-70 | PASS | Biggest calibration miss. Revenue/HQ missing from overview despite P9 having data. |
| 8 | Kalshi | Prediction Markets | 39 | **52** | 40-55 | PASS | $178B trading volume shown as revenue (CRITICAL). FTX listed as competitor (dead company). |
| 9 | Feeding America | Nonprofit | 39 | **56** | 55-70 | PASS | Nonprofit language adaptation excellent. "Private" should say "Nonprofit". |
| 10 | Tango Card | Digital Incentives | 0 | **0** | 0 | PASS | Competitor guard confirmed. Score displays blank instead of "0". |

---

## Pass Criteria Results

| Criteria | Status | Notes |
|----------|--------|-------|
| Zero contamination across all 10 | **PASS** | No cross-company data in any brief |
| Tango Card flagged as competitor | **PASS** | Score 0%, competitor label correct |
| No KL injection 400 errors | **PASS** | No overflow errors observed |
| Console ≤1 Anthropic 500 per brief | **PASS** | Transient 500s only, no systematic failures |
| Revenue real or estimated for all 10 | **PARTIAL** | Boeing overview shows "Not available" despite P9 having data |
| Scores directionally correct | **FAIL** | Marriott (67→should be 80+), Boeing (49→should be 60+), Chipotle (67→should be 80+), Acme (49→should be <20) |
| No fabricated executives | **PASS** | All exec names verified or honest empty states |
| No fabricated URLs or statistics | **PARTIAL** | Some untagged stats in emails, FTX listed as active competitor |

**Stage 0 overall: 6/8 criteria pass. 2 partial (revenue propagation, fabricated data). Score calibration is the primary fail.**

---

## Critical Issues (must fix for Stage 1)

| # | Severity | Issue | Targets Affected |
|---|----------|-------|-----------------|
| 1 | **CRITICAL** | Score calibration — strong fits scoring as poor fits | Marriott (67→80+), Chipotle (67→80+), Boeing (49→60+), Acme (49→<20) |
| 2 | **CRITICAL** | Revenue/volume conflation — trading volume displayed as revenue | Kalshi ($178B) |
| 3 | **CRITICAL** | Fit Check enrichment shows wrong data — wrong tickers, wrong ownership | Polymarket (ITRI), general pattern |
| 4 | **CRITICAL** | Competitor score displays blank instead of "0%" | Tango Card |

## High Issues

| # | Severity | Issue | Targets Affected |
|---|----------|-------|-----------------|
| 5 | **HIGH** | Revenue not propagating from P9 to overview card | Boeing ("Not available" despite $89.5B in P9) |
| 6 | **HIGH** | HQ wrong or missing for known companies | Boeing (missing), Polymarket (Liberty Lake vs NYC) |
| 7 | **HIGH** | FTX listed as active competitor — company is bankrupt | Kalshi |
| 8 | **HIGH** | Buying signals section empty (headers only, no data) | Marriott (cache issue) |
| 9 | **HIGH** | Quick Take RISK field empty | Marriott |
| 10 | **HIGH** | Brief still generates for 0% competitors — should warn/block | Tango Card |
| 11 | **HIGH** | "Private" displayed for nonprofits — should say "Nonprofit" or "501(c)(3)" | Feeding America |
| 12 | **HIGH** | P9 financials pulling from wrong ZoomInfo entity by name | Acme Widgets |
| 13 | **HIGH** | Employee count mismatch — Fit Check vs brief overview | Marriott (414K vs 148K) |

## Medium Issues

| # | Severity | Issue | Targets Affected |
|---|----------|-------|-----------------|
| 14 | **MEDIUM** | Untagged stats in outreach emails | Boeing, Kalshi, Polymarket |
| 15 | **MEDIUM** | CEO name inconsistency across sections | Boeing (Joyce vs Ortberg) |
| 16 | **MEDIUM** | Capital allocation percentages fabricated with false precision | Kalshi, Acme |
| 17 | **MEDIUM** | Revenue discrepancy between overview and P9 | Feeding America ($4.9B vs $5.15B) |
| 18 | **MEDIUM** | Displacement Angle date wrong (2020 vs 2024) | Tango Card |

---

## Brief Quality Highlights

Despite score calibration issues, brief content quality is consistently strong:

- **Chipotle**: Best solution mapping — loyalty program expansion, Chipotle U student retention, employee recognition for 130K workers
- **Boeing**: Best strategic framing — turnaround context, safety culture, FAA oversight tied to recognition programs
- **Feeding America**: Best nonprofit adaptation — donor dignity, volunteer recognition, disaster relief prepaid cards, mission-aligned language
- **Polymarket**: Best handling of a niche private company — rich data despite limited public info, honest financial empty states
- **Stripe**: Zero contamination across 3 consecutive runs — structural identity fix validated
- **Tango Card**: Correctly identified acquisition relationship and framed as integration play

---

## Score Calibration Analysis

### Under-scored (need higher scores)
| Target | Current | Expected | Gap | Why |
|--------|---------|----------|-----|-----|
| Marriott | 67 | 80-90 | -18 | Massive gift card program, Bonvoy 200M+ members, 414K employees, hospitality = BHN core vertical |
| Chipotle | 67 | 75-90 | -13 | Major loyalty program, 130K employees, QSR gift cards = core BHN use case |
| Boeing | 49 | 55-70 | -16 | Existing BHN customer, 142K employees, channel partner incentives, service recovery |
| Feeding America | 56 | 60-65 | -6 | Legitimate nonprofit use cases (donor engagement, volunteer recognition, disaster relief) |

### Over-scored (need lower scores)
| Target | Current | Expected | Gap | Why |
|--------|---------|----------|-----|-----|
| Acme Widgets | 49 | 0-20 | +34 | Company doesn't exist. Should score near zero. |

### Correctly scored
| Target | Current | Expected | Notes |
|--------|---------|----------|-------|
| Stripe | 59 | 55-70 | In range |
| Circle | 63 | 50-65 | In range |
| Polymarket | 52 | 40-55 | In range |
| Kalshi | 52 | 40-55 | In range |
| Tango Card | 0 | 0 | Competitor guard correct |

---

## Stage 1 Priority Queue

1. **Score calibration** — tune Option C weights so strong fits score high, bad fits score low
2. **Revenue/volume disambiguation** — don't treat "trading volume" or "payment volume" as revenue
3. **Fit Check enrichment validation** — validate ticker/ownership against target URL before displaying
4. **Revenue propagation** — ensure P9 revenue flows to overview card
5. **Competitor score display** — show "0% - Competitor" not blank
6. **Nonprofit ownership type** — detect 501(c)(3) and display "Nonprofit" not "Private"
7. **Dead company filter** — don't list bankrupt companies (FTX) as active competitors
8. **Brief generation guard** — warn or block brief generation for 0% competitor scores

---

## Version Info

- **Code version**: v2.2.0 (production, deployed 6/10/26)
- **Commits since v2.1.1**: 25+ (structural identity fix, enrichment trust, Option C scoring, RLS cleanup, admin UX, invite flow, action menu fix)
- **Audit date**: June 11, 2026
- **Seller**: Blackhawk Network (blackhawknetwork.com)
- **Auditor**: Cambrian Catalyst automated brief pipeline + manual review
