# Stage 0 Remediation Plan — June 11, 2026

## Overview

22 findings from the Stage 0 audit across 10 targets. Each finding is documented with location, root cause, proposed fix, risk assessment, and priority.

**Risk framework:**
- **No risk**: Display-only changes, no data flow impact
- **Low risk**: Isolated logic changes, testable with single target
- **Medium risk**: Touches scoring or data reconciliation, requires golden set validation
- **High risk**: Touches prompt logic or enrichment flow, could degrade existing outputs

---

## CRITICAL FINDINGS (4)

### C1: Score Calibration — Strong Fits Scoring as Poor Fits

| Field | Detail |
|-------|--------|
| **Finding** | Marriott (67%, should be 80-90%), Chipotle (67%, should be 75-90%), Boeing (49%, should be 55-70%) score as poor/potential fits despite being strong BHN targets. Acme Widgets (49%) scores too high for a nonexistent company. Marriott REGRESSED from 85% to 67%. |
| **Targets affected** | Marriott, Chipotle, Boeing, Acme Widgets, Feeding America |
| **Location** | `src/lib/fitScoring.js` — `computeFitScore()`, `computeDim1()`, `computeDim2()`, `computeDim3()` |
| **Root cause** | Option C signal extraction + weight tuning. The LLM extracts 14 structured signals, JS computes score. Weights under-value `industryMatch` (hospitality/QSR = core BHN vertical), `buyerIntent` (loyalty program expansion), and `orgSize` (large enterprises with employee programs). Over-values signals that small/niche companies can satisfy. |
| **Remediation** | 1. Run all 10 targets through Option C with verbose signal output. 2. Compare extracted signals vs expected values. 3. Identify which dimensions are under-weighted. 4. Tune weights in `computeFitScore()` using the 10-target golden set. 5. Validate that tuned weights don't degrade Stripe/Circle/Polymarket/Kalshi scores. |
| **Risk** | **High** — Weight changes affect every score. Must validate against all 10 targets before deploying. Use golden set comparison: run before/after for all 10, reject any change that degrades a correctly-scored target. |
| **Priority** | #1 — Blocks Stage 1 |
| **Estimated effort** | 4-6 hours (signal extraction analysis + weight tuning + validation) |

### C2: Revenue/Volume Conflation — Trading Volume Displayed as Revenue

| Field | Detail |
|-------|--------|
| **Finding** | Kalshi overview card shows "$178.0B" as "ANNUAL REVENUE / ARR" — this is annualized trading volume, not revenue. Actual revenue is ~$1.5B. Could also affect Stripe ($1.9T volume vs $5.84B revenue) and Polymarket. |
| **Targets affected** | Kalshi (confirmed), potentially Stripe, Polymarket |
| **Location** | Revenue reconciliation logic in `src/App.jsx` — `mergeDeepIntel()` function (~line 2700) and the consistency validator (~line 8543) |
| **Root cause** | Revenue reconciliation grabs the largest dollar figure from P9 text. For exchanges/payment processors, the largest figure is trading/payment volume, not revenue. The logic doesn't distinguish "volume" from "revenue". |
| **Remediation** | Add a volume-exclusion filter to the revenue extraction regex. If P9 text contains "trading volume", "payment volume", "total volume", or "transaction volume" near a dollar figure, exclude that figure from revenue candidates. Fall back to figures near "revenue", "net revenue", "annual revenue", "ARR". |
| **Risk** | **Medium** — Touches revenue reconciliation which is critical for public companies. Must test against: Kalshi (volume should NOT become revenue), Stripe ($1.9T volume should NOT override $5.84B revenue), Marriott ($26.19B should remain), Boeing ($89.5B should remain), Circle ($2.86B should remain). |
| **Priority** | #2 — Material misstatement visible to users |
| **Estimated effort** | 2-3 hours |

### C3: Fit Check Enrichment Shows Wrong Data

| Field | Detail |
|-------|--------|
| **Finding** | Polymarket Fit Check showed "Public (ITRI)" — wrong entity from free enrichment matching by company name via SEC EDGAR. Polymarket is private/VC-backed. The enrichment matched a different public company. |
| **Targets affected** | Polymarket (confirmed), potentially any company with ambiguous name |
| **Location** | `api/enrich-free.js` — `edgarSearchCIK()` searches by company name only, ignores domain. Results flow to Fit Check display via `setCohorts()` at ~line 7641 in `src/App.jsx`. |
| **Root cause** | `enrich-free.js` searches SEC EDGAR by company name, finds wrong entity for private companies or ambiguous names. Domain parameter is accepted but never used in EDGAR lookup. The wrong ticker/ownership then displays in the Fit Check table before P1 has a chance to correct it. |
| **Remediation** | Two-part fix: (1) In `enrich-free.js`, if EDGAR returns a result, validate that the result's SIC code or industry is plausibly related to the target's domain. If the company name is common (single word, <8 chars), require domain validation or skip EDGAR. (2) In the Fit Check display, add a "unverified" badge on enrichment-sourced ownership/ticker until P1 confirms. |
| **Risk** | **Medium** — Changing `enrich-free.js` could affect enrichment for other companies. Must test against: Marriott (should still show MAR), Boeing (should still show BA), Chipotle (should still show CMG), Circle (should still show CRCL). Private companies should show "Private" not a wrong ticker. |
| **Priority** | #3 — Material misinformation at the decision point |
| **Estimated effort** | 3-4 hours |

### C4: Competitor Score Displays Blank Instead of "0%"

| Field | Detail |
|-------|--------|
| **Finding** | Tango Card Fit Check score field is blank. Should show "0% - Competitor" in red. A blank looks like a scoring failure, not a deliberate competitor flag. |
| **Targets affected** | Any company flagged as competitor |
| **Location** | Fit Check table rendering in `src/App.jsx` — the score display conditional (~line 13987 area) |
| **Root cause** | When `isCompetitor` is true and score is 0, the display logic likely renders an empty string or skips the score badge. The "Competitor" label shows in the Fit Score Distribution chart but not in the table row. |
| **Remediation** | In the Fit Check table score cell, add explicit handling: if score === 0 and competitor flag is set, render "0% - Competitor" with red styling. |
| **Risk** | **No risk** — Display-only change. Does not affect scoring logic or data flow. |
| **Priority** | #4 — Quick fix, high visibility |
| **Estimated effort** | 30 minutes |

---

## HIGH FINDINGS (13)

### H1: Revenue Not Propagating from P9 to Overview Card

| Field | Detail |
|-------|--------|
| **Finding** | Boeing overview shows "Not available in current search results" for revenue, but P9 Financial section has full quarterly data ($89.5B FY2025). Quick Take also correctly references $89.5B. The overview card's revenue field didn't get populated. |
| **Targets affected** | Boeing (confirmed) |
| **Location** | P1 prompt for `revenue` field in overview JSON (~line 1878), and revenue reconciliation in `mergeDeepIntel()` (~line 2729) |
| **Root cause** | P1's web search for Boeing may have found "net fee revenue" or failed to extract a clean revenue figure. The revenue reconciliation in mergeDeepIntel checks if P9's figure is >2x P1's figure, but if P1 returned empty, the reconciliation has nothing to override. There's no fallback that says "if P1 revenue is empty but P9 has revenue data, use P9's figure." |
| **Remediation** | In the consistency validator, add: if `current.revenue` is empty/falsy but `current.financialDeepDive?.revenueTrend` contains a dollar figure, extract and set it. |
| **Risk** | **Low** — Additive logic (only fires when revenue is empty). Cannot degrade existing populated revenue fields. Test against Boeing (should now show $89.5B) and verify Stripe, Marriott, Chipotle still show their correct values. |
| **Priority** | #5 |
| **Estimated effort** | 1-2 hours |

### H2: HQ Wrong or Missing for Known Companies

| Field | Detail |
|-------|--------|
| **Finding** | Boeing HQ shows "Not found" (should be Arlington, VA). Polymarket shows "LIBERTY LAKE, WA" (should be New York, NY — Liberty Lake is the QCEX subsidiary address). |
| **Targets affected** | Boeing, Polymarket |
| **Location** | P1 prompt `headquarters` field, and the HQ cross-field check in cache-serve and consistency validator |
| **Root cause** | For Boeing: P1's web search didn't return a clean HQ despite it being widely known. For Polymarket: P1 found the QCEX subsidiary's registered address instead of the parent company's. The companySnapshot correctly says "New York" but the headquarters field picked up the wrong entity. |
| **Remediation** | Strengthen the existing snapshot-based HQ correction: if `companySnapshot` mentions a city and `headquarters` is empty or doesn't match, use the snapshot city. This logic exists in the cache-serve path but needs to also fire in the fresh-build consistency validator. |
| **Risk** | **Low** — The snapshot HQ correction already exists for cache-serve. Extending it to fresh builds uses the same proven logic. Test against: Boeing (should now show Arlington, VA from snapshot), Polymarket (should show NYC from snapshot), Stripe (should remain San Francisco). |
| **Priority** | #6 |
| **Estimated effort** | 1 hour |

### H3: FTX Listed as Active Competitor

| Field | Detail |
|-------|--------|
| **Finding** | Kalshi's Watch-Outs section lists "FTX" as a likely competitor. FTX collapsed in November 2022 and is in bankruptcy. Listing it is factually wrong and embarrassing. |
| **Targets affected** | Kalshi |
| **Location** | P10 or P7 competitive analysis prompt, or the watch-outs generation in P3/P4 |
| **Root cause** | The LLM's web search or training knowledge includes FTX as a historical competitor. No filter checks whether a named competitor is still operating. |
| **Remediation** | Add a post-merge filter in the consistency validator: maintain a small blocklist of known-defunct companies (FTX, Lehman Brothers, etc.) and strip them from competitor lists and watch-outs. Alternatively, add to the competitive prompt: "Do NOT list companies that have been acquired, gone bankrupt, or ceased operations." |
| **Risk** | **No risk** — Post-merge filter, purely subtractive. Cannot degrade valid competitor data. |
| **Priority** | #7 |
| **Estimated effort** | 30 minutes |

### H4: Buying Signals Section Empty (Headers Only)

| Field | Detail |
|-------|--------|
| **Finding** | Marriott buying signals show category labels ("Revenue Per Available Room", "Net Room Growth") with no actual numbers or context. Recent Triggers show Glassdoor categories instead of business triggers. |
| **Targets affected** | Marriott (cache hit) |
| **Location** | P5 sentiment/buying signals extraction, or cache serving stale data |
| **Root cause** | Brief was loaded from cache ("Loaded from cache (today)"). The cached version likely had a partial P5 result. A fresh Full Rebuild would likely fix this. |
| **Remediation** | (1) Verify with a fresh Full Rebuild. (2) If the issue persists, check P5 prompt for buying signal extraction — it may be returning category names instead of specific data points. (3) Add cache validation: if buying signals are just labels with no numbers, mark section as incomplete and trigger backfill. |
| **Risk** | **Low** — Cache validation is additive. Fresh rebuild test costs nothing. |
| **Priority** | #8 |
| **Estimated effort** | 1 hour (verify), 2-3 hours (if prompt fix needed) |

### H5: Quick Take RISK Field Empty

| Field | Detail |
|-------|--------|
| **Finding** | Marriott Quick Take shows the red "RISK" pill with no text. |
| **Targets affected** | Marriott (cache hit) |
| **Location** | Quick Take generation (post-allDone), or cache serving stale data |
| **Root cause** | Same cache issue as H4. Quick Take fires after all sections complete. If cached from a prior incomplete run, the RISK field may be empty. |
| **Remediation** | Same as H4 — verify with fresh rebuild first. Add cache validation for Quick Take: if any of FINDING/OPPORTUNITY/RISK is empty, reject cache and trigger fresh generation. |
| **Risk** | **No risk** — Cache validation is purely additive. |
| **Priority** | #9 |
| **Estimated effort** | 30 minutes (verify), 1 hour (if cache validation needed) |

### H6: Brief Still Generates for 0% Competitors

| Field | Detail |
|-------|--------|
| **Finding** | Tango Card scored 0% (competitor) but a full 19-page brief was still generated, consuming a run. Users who ignore the score and click "Research" waste a session. |
| **Targets affected** | Any company flagged as competitor |
| **Location** | Brief generation trigger in `src/App.jsx` — `generateBrief()` function entry point |
| **Root cause** | No guard checks the fit score before generating a brief. The competitor flag is set at scoring time but not re-checked at brief generation time. |
| **Remediation** | Add a confirmation dialog before brief generation when score is 0 or competitor flag is set: "This company was flagged as a competitor (0% fit). Generating a brief will use one of your runs. Continue?" |
| **Risk** | **No risk** — UI guard only. Does not affect brief content or scoring. |
| **Priority** | #10 |
| **Estimated effort** | 30 minutes |

### H7: "Private" Displayed for Nonprofits

| Field | Detail |
|-------|--------|
| **Finding** | Feeding America's ownership field shows "Private" instead of "Nonprofit" or "501(c)(3)". This mischaracterizes the organization and could cause a salesperson to approach with wrong framing. |
| **Targets affected** | Feeding America, any nonprofit |
| **Location** | P1 prompt `ownership` field instructions, and the ownership-driven search routing logic (~line 1830) |
| **Root cause** | P1's ownership classification options include "Public", "Private", "PE-backed", "VC-backed" but "Nonprofit" is already in the list. P1 may have defaulted to "Private" because the enrichment data or prompt didn't strongly enough push for nonprofit classification. |
| **Remediation** | (1) Check if the P1 prompt's ownership options include "Nonprofit" — if not, add it. (2) Add a post-merge check: if `companySnapshot` contains "nonprofit", "501(c)(3)", "tax-exempt", "charity", or "foundation", override ownership to "Nonprofit". (3) In the firmographicsTruth block, if the target URL ends in `.org` and industry contains "nonprofit" or "charity", hint at nonprofit status. |
| **Risk** | **Low** — Post-merge override is purely corrective. URL heuristic (.org) could false-positive on some tech companies (.org domains) but the snapshot text check is reliable. |
| **Priority** | #11 |
| **Estimated effort** | 1 hour |

### H8: P9 Financials Pulling from Wrong ZoomInfo Entity

| Field | Detail |
|-------|--------|
| **Finding** | Acme Widgets P9 financial section describes an "Internet Service Providers company" with "$10M-$25M revenue and 100-249 employees" — this is a different entity found via ZoomInfo name matching, not the target company. |
| **Targets affected** | Acme Widgets (confirmed), potentially any company with generic name |
| **Location** | P9 financial deep dive prompt and web search results |
| **Root cause** | P9's web search for "Acme Widgets financial data" found a ZoomInfo listing for a different company. The P1 companySnapshot injection (added for P7/P8/P9) should have prevented this, but if P1 itself found limited data, the snapshot may not have been specific enough to filter. |
| **Remediation** | (1) Verify P1 snapshot injection is working for P9 (it should be — we added it in the structural identity fix). (2) If P9 still finds wrong-entity financial data despite the snapshot, add an explicit instruction: "If the only financial data you find is from a data aggregator (ZoomInfo, Crunchbase, Apollo) matched by company name only, and the industry or description doesn't match the company described above, discard it and state 'No published financial data available.'" |
| **Risk** | **Low** — Prompt instruction change is purely additive. Worst case: P9 returns "No data" more often for obscure companies, which is better than wrong data. |
| **Priority** | #12 |
| **Estimated effort** | 1 hour |

### H9: Employee Count Mismatch — Fit Check vs Brief

| Field | Detail |
|-------|--------|
| **Finding** | Marriott Fit Check shows 414,000 employees but brief overview shows ~148,000. The 414K includes managed property employees (from enrichment/scoring), while 148K is corporate/direct employees (from P1 web search). Both numbers are "correct" for different definitions. |
| **Targets affected** | Marriott (confirmed), potentially any large company with franchise/managed workforce model |
| **Location** | Fit Check enrichment in `setCohorts()` (~line 7648) vs P1 overview `employeeCount` field, and the corroboration gate (~line 8558) |
| **Root cause** | The Fit Check stage uses enrichment employee count (414K from SEC 10-K which includes managed properties). P1's web search finds a different number (148K corporate employees). The corroboration gate now preserves P1's value (our fix), but this creates inconsistency between Fit Check and brief. |
| **Remediation** | (1) For public companies, use the 10-K employee count consistently in both Fit Check AND brief. (2) In the brief overview, if the employee count from P1 differs significantly from the Fit Check value AND the Fit Check value matches the 10-K, use the Fit Check value. (3) Alternatively, show both: "~148,000 corporate; ~414,000 including managed properties" in the brief. |
| **Risk** | **Medium** — Changing employee count propagation affects the consistency validator tolerance bands. Must validate that the fix doesn't cause the validator to incorrectly strip employee references in P4 solutions. Test against Marriott, Boeing, Chipotle, Stripe. |
| **Priority** | #13 |
| **Estimated effort** | 2-3 hours |

---

## MEDIUM FINDINGS (5)

### M1: Untagged Stats in Outreach Emails

| Field | Detail |
|-------|--------|
| **Finding** | Boeing insight email: "Textron ran a similar operational reset in 2019 and used real-time recognition programs to cut voluntary turnover by 18%" — untagged, likely fabricated. Kalshi insight email: "cut 30-day churn by 40%" — untagged. Polymarket elevator pitch: "cut their payout time from 72 hours to under 10 minutes" — untagged. |
| **Targets affected** | Boeing, Kalshi, Polymarket |
| **Location** | P3 outreach email generation prompt (~line 2052) |
| **Root cause** | The email prompt says "[Your name here]" for sign-off but doesn't explicitly require source tags on statistics within the email body. The P4 teaching insight prompt requires tags, but P3 emails don't have the same requirement. |
| **Remediation** | Add to P3 email prompt: "If you cite a specific statistic or percentage in the email body, you MUST tag it: [proof pack], [web search], or [industry benchmark]. If you cannot identify a source, write the insight without a specific number." |
| **Risk** | **Low** — Prompt-only change. May make emails slightly less specific (qualitative instead of quantitative), which is actually better than fabricating numbers. |
| **Priority** | #14 |
| **Estimated effort** | 30 minutes |

### M2: CEO Name Inconsistency Across Sections

| Field | Detail |
|-------|--------|
| **Finding** | Boeing Quick Take says "David L. Joyce" as new CEO, but the Executives section lists "Robert Kelly Ortberg" as CEO. Joyce is listed as a board member. Both names appear in earnings quotes at different dates. |
| **Targets affected** | Boeing |
| **Location** | P1 overview (Quick Take CEO reference) vs P2 executives vs P9 earnings quotes |
| **Root cause** | Boeing had a CEO transition. P1/Quick Take may have found a newer source naming Joyce, while P2 executives found Ortberg from an earlier period. The cross-section consistency validator checks CEO conflicts but may not have caught this because both names appear in legitimate Boeing contexts. |
| **Remediation** | Strengthen the CEO consistency check: if P1's companySnapshot names a CEO and P2's executive list names a different CEO, log a warning and use P2's version (P2 does a dedicated executive search). Add date-awareness: prefer the most recent CEO reference. |
| **Risk** | **Low** — Consistency check is purely corrective. |
| **Priority** | #15 |
| **Estimated effort** | 1-2 hours |

### M3: Capital Allocation Percentages Fabricated

| Field | Detail |
|-------|--------|
| **Finding** | Kalshi P9: "Capital allocation appears weighted toward institutional sales infrastructure (40%), product development (30%), regulatory/legal defense (20%), and consumer growth (10%)." Acme Widgets P9: similar fabricated breakdown. No source for these percentages. |
| **Targets affected** | Kalshi, Acme Widgets |
| **Location** | P9 financial deep dive prompt — `capitalPriorities` field |
| **Root cause** | P9 prompt says "Where is capex going?" For private companies with no public data, the LLM fabricates plausible-sounding allocation percentages. The source tagging requirement doesn't apply to the financial section's analytical fields. |
| **Remediation** | Add to P9 prompt for capital priorities: "For private companies, describe strategic priorities qualitatively. Do NOT fabricate specific allocation percentages (e.g., '40% to R&D') unless citing a specific source. Write: 'Capital appears focused on [area 1], [area 2], and [area 3] based on [evidence]' instead of assigning made-up percentages." |
| **Risk** | **No risk** — Prompt instruction change. Makes output more honest for private companies. |
| **Priority** | #16 |
| **Estimated effort** | 30 minutes |

### M4: Revenue Discrepancy Between Overview and P9

| Field | Detail |
|-------|--------|
| **Finding** | Feeding America overview shows "$4.9 billion (2026)" but P9 says "$5.15 billion for fiscal year 2024". Different fiscal years, both potentially correct, but the inconsistency is confusing. |
| **Targets affected** | Feeding America |
| **Location** | P1 revenue extraction vs P9 revenue trend |
| **Root cause** | P1 found a 2026 figure, P9 found a FY2024 figure. The revenue reconciliation compares magnitudes but doesn't reconcile fiscal year labels. For nonprofits with June 30 fiscal years, the "2026" figure may actually be the same as the FY2024 figure (FY ending June 30, 2024 = calendar year 2024). |
| **Remediation** | Low priority — the numbers are close ($4.9B vs $5.15B, ~5% difference) and from different time periods. The consistency validator could add a cross-check: if P1 and P9 revenue are within 20%, keep P9's figure (more authoritative from financial filing). |
| **Risk** | **Low** — Revenue reconciliation refinement. |
| **Priority** | #17 |
| **Estimated effort** | 1 hour |

### M5: Displacement Angle Date Wrong

| Field | Detail |
|-------|--------|
| **Finding** | Tango Card displacement angle says "Blackhawk Network acquired Tango Card in May 2020" but the actual acquisition was May 2024. |
| **Targets affected** | Tango Card |
| **Location** | P7 competitive positioning — displacement angle field |
| **Root cause** | LLM training knowledge may have mixed dates, or the web search returned confusing results about the acquisition timeline. The correct date (May 2024) appears elsewhere in the brief. |
| **Remediation** | This is a one-off LLM error. The cross-section consistency validator could check if the same company/acquisition is referenced with different dates across sections and flag or correct. However, this is a low-ROI fix for a rare edge case. |
| **Risk** | **No risk** — Rare edge case, low frequency. |
| **Priority** | #18 |
| **Estimated effort** | Not worth a dedicated fix. Would be caught by broader fact-checking improvements. |

---

## Implementation Sequence

### Phase 1: Quick wins (no risk, 1-2 hours total)
1. C4 — Competitor score display (30 min)
2. H3 — FTX dead company filter (30 min)
3. H6 — Brief generation warning for competitors (30 min)
4. M3 — Capital allocation fabrication guard (30 min)

### Phase 2: Display/propagation fixes (low risk, 3-4 hours total)
5. H1 — Revenue propagation from P9 to overview (1-2 hr)
6. H2 — HQ snapshot correction for fresh builds (1 hr)
7. H7 — Nonprofit ownership detection (1 hr)
8. M1 — Email stat source tagging (30 min)

### Phase 3: Data quality fixes (medium risk, 4-5 hours total)
9. C2 — Revenue/volume disambiguation (2-3 hr)
10. C3 — Fit Check enrichment validation (3-4 hr, can run in parallel)
11. H8 — P9 ZoomInfo entity guard (1 hr)
12. H9 — Employee count reconciliation (2-3 hr)

### Phase 4: Score calibration (high risk, 4-6 hours)
13. C1 — Option C weight tuning with golden set validation

### Phase 5: Verify and validate
14. H4/H5 — Marriott fresh rebuild to verify cache issues
15. M2 — CEO consistency check (1-2 hr)
16. Full golden set re-run: all 10 targets on final code

---

## Validation Protocol

Before deploying any Phase 3 or Phase 4 change:

1. Run all 10 targets through Fit Check scoring
2. Compare scores against the expected ranges in the audit tracker
3. Reject any change where a correctly-scored target (Stripe, Circle, Polymarket, Kalshi, Tango Card) regresses by more than 5 points
4. Reject any change where a strong-fit target (Marriott, Chipotle) drops below its 6/11 score
5. Run Stripe Full Rebuild to verify zero contamination still holds
6. Run Boeing Full Rebuild to verify revenue/HQ propagation

**No changes ship to production without completing this validation.**
