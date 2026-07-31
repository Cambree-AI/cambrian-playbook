# STAGE 0 — Validation Audit Plan
## Seller: Blackhawk Network (blackhawknetwork.com)
## 10 Targets Across Diverse Profiles

**Purpose:** Validate that staging code produces clean, accurate briefs across all company types — not just one low-data target. Every failure mode from the Brightpath audit (contamination, stubs, blank edges, empty fields, section failures) must be confirmed fixed across the full spectrum.

**Process:** Run each target as a full brief on staging. Export PDF. Record fit score. Document results in the checklist below. All 10 must pass before merging staging → main.

---

## Target Matrix

| # | Company | Industry | Size | Ownership | Profile Type | What It Stresses |
|---|---------|----------|------|-----------|-------------|-----------------|
| 1 | **Marriott International** | Hospitality | ~120K | Public (NASDAQ: MAR) | Large public, strong fit | All sections rich. SEC filings. Glassdoor. Real execs. BHN sells gift cards into loyalty programs — direct product fit. Should be highest fit score. |
| 2 | **Stripe** | Fintech | ~8K | Private (VC-backed) | VC-backed, multi-KL trigger | P8 board/investors should be rich. Tests KL injection cap (fintech + payments + AI). Tests VC-backed handling. |
| 3 | **Chipotle Mexican Grill** | QSR / Restaurants | ~115K | Public (NYSE: CMG) | Public, cross-vertical fit | Gift card/loyalty is core to QSR. Displacement angle should target existing loyalty vendors. Competitor edges should reference specific programs. |
| 4 | **Circle** | Crypto | ~1K | Private (VC-backed) | Ambiguous name, niche vertical | "Circle" matches Circle K, CircleCI, Circle Medical, etc. Contamination defense worst-case. Tests identity anchor with a single common word. |
| 5 | **Polymarket** | Prediction Markets | ~50 | Private (VC-backed) | Tiny, niche, potentially bad fit | 50 employees in prediction markets — unclear how BHN's products map. Tests whether displacement angle and product mapping handle weak/no fit honestly. Fit score should be LOW. |
| 6 | **Acme Widgets LLC** | SMB Manufacturing | ~75 | Private (Bootstrapped) | Tiny private, obscure | Minimal web presence. Revenue/HQ backfill, exec empty state, sentiment coaching tip. Confirms private-company fixes hold. May be a fabricated/sample company — tests how the brief handles a target that barely exists online. |
| 7 | **Boeing** | Aerospace & Defense | ~170K | Public (NYSE: BA) | Large public, indirect fit | Massive enterprise with complex procurement. BHN could sell employee rewards/incentives but it's not the obvious fit. Tests whether the brief stretches vs stays honest about indirect mapping. |
| 8 | **Kalshi** | Prediction Markets | ~100 | Private (VC-backed) | Small VC-backed, bad fit | Regulated prediction market exchange — almost no product overlap with BHN. Should score as Poor Fit. Tests whether the system produces an honest "this isn't a good target" signal rather than fabricating connections. |
| 9 | **Feeding America** | Nonprofit | ~500 | Nonprofit | Nonprofit, different buying motion | Nonprofits buy differently — donor engagement, volunteer recognition, corporate partnership rewards. Tests whether the brief adapts to nonprofit language/context. BHN has legitimate gift card use cases here. |
| 10 | **Tango Card** | Digital Incentives | ~200 | Private | Direct competitor | BHN and Tango Card are direct competitors. The system MUST flag this — fit score should be 0 or near-0. Competitor check logic must fire. Tests the "prospect IS a competitor" guard. |

---

## Per-Target Checklist

Run each target and check every item. Mark P (pass), F (fail), or N/A.

### Section Completeness
| Check | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|-------|---|---|---|---|---|---|---|---|---|---|
| No "sections incomplete" banner | | | | | | | | | | |
| Quick Take populated | | | | | | | | | | |
| Elevator Pitch populated | | | | | | | | | | |
| Strategic Analysis populated | | | | | | | | | | |
| Opening Angle populated | | | | | | | | | | |
| Outreach Emails (2) populated | | | | | | | | | | |
| Solution Mapping (products) | | | | | | | | | | |
| Champion Intelligence | | | | | | | | | | |
| Case Studies | | | | | | | | | | |
| Company Overview populated | | | | | | | | | | |
| Financial Intelligence populated | | | | | | | | | | |
| Competitive Positioning populated | | | | | | | | | | |
| Board & Investors populated | | | | | | | | | | |
| Watch-Outs populated | | | | | | | | | | |
| 5 Questions populated | | | | | | | | | | |

### Accuracy & Quality
| Check | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|-------|---|---|---|---|---|---|---|---|---|---|
| Zero contamination (no wrong-company data) | | | | | | | | | | |
| Execs: real names OR honest empty state | | | | | | | | | | |
| Revenue: real figure OR reasoned estimate | | | | | | | | | | |
| HQ: real location OR empty (not "Not found") | | | | | | | | | | |
| Displacement angle targets status quo, not prospect | | | | | | | | | | |
| Competitor edges filled (not blank) | | | | | | | | | | |
| Where They Win/Lose has reasoning | | | | | | | | | | |
| Open Positions: real data OR honest empty | | | | | | | | | | |
| No hallucinated URLs (every link should resolve) | | | | | | | | | | |
| No fabricated statistics or metrics | | | | | | | | | | |
| Brief correctly describes TARGET, not the seller | | | | | | | | | | |

### Fit Scoring
| Check | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|-------|---|---|---|---|---|---|---|---|---|---|
| Fit score recorded | | | | | | | | | | |
| Score feels directionally correct | | | | | | | | | | |
| #10 (Tango Card) flagged as competitor → score 0 | | | | | | | | | | |
| #5/#8 (bad fits) score below 55% (Poor Fit) | | | | | | | | | | |
| #1/#3 (strong fits) score above 70% | | | | | | | | | | |

### Console Health
| Check | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|-------|---|---|---|---|---|---|---|---|---|---|
| No CSP errors | | | | | | | | | | |
| No 409 errors | | | | | | | | | | |
| No 400 errors (KL injection overflow) | | | | | | | | | | |
| Anthropic 500s ≤ 1 per brief | | | | | | | | | | |

### Special Checks (target-specific)
| Check | Target | Expected |
|-------|--------|----------|
| SEC filing data in financials | #1 Marriott, #3 Chipotle, #7 Boeing | Revenue cites 10-K or earnings |
| Glassdoor rating present | #1 Marriott, #3 Chipotle, #7 Boeing | Numeric rating (e.g. 3.8) |
| Board/investors rich | #2 Stripe | Named investors, funding rounds |
| No contamination with similarly-named entities | #4 Circle | Zero references to Circle K, CircleCI, Circle Medical |
| Product mapping honest about weak fit | #5 Polymarket, #8 Kalshi | Products mapped but with honest caveats, not forced connections |
| Handles fabricated/nonexistent company | #6 Acme Widgets | Graceful empty states, not hallucinated data |
| Nonprofit context in language | #9 Feeding America | Donor, volunteer, grant language — not corporate sales |
| Competitor guard fires | #10 Tango Card | dim1=0, dim2=0, dim3=0 OR explicit competitor flag |
| KL injection doesn't cause 400 | #2 Stripe | Fintech + payments + AI KLs all fire without overflow |

---

## AUDIT RESULTS — June 8, 2026

---

### Scoring Summary

| # | Target | Fit Score | Label | Correct? | Notes |
|---|--------|-----------|-------|----------|-------|
| 1 | Marriott International | 85% | Strong Fit | Yes | Good calibration |
| 2 | Stripe | 39% | Poor Fit | **No** | Brief has severe adhesives/sealants contamination in P9. Score may be fine given contaminated context. |
| 3 | Chipotle Mexican Grill | 73% | Potential Fit | **No** | Should be ~85%. Huge loyalty program, major gift card business. Under-scored. |
| 4 | Circle | 59% | Potential Fit | Borderline | Quick entry couldn't suggest URL. |
| 5 | Polymarket | 39% | Poor Fit | Yes | Bad fit, correctly scored. Build time: 99s. |
| 6 | Acme Widgets LLC | 39% | Poor Fit | **No** | Company can't be found online. Should be 0 or flagged as unverifiable. Build time: 75s. |
| 7 | Boeing | 39% | Poor Fit | **No** | Boeing is a known BHN customer today. Should be 75%+. Terrible calibration. Build time: 85s. |
| 8 | Kalshi | 39% | Poor Fit | Yes | High-risk industry BHN would avoid. Build time: 92s. Console had errors. |
| 9 | Feeding America | 39% | Poor Fit | Yes | Employee count discrepancy: fit page shows ~4,000, brief shows 692. Build time not noted. |
| 10 | Tango Card | 0% | Competitor | Nuanced | BHN acquired Tango in 2024. Historically a reseller. Competitor guard fired correctly but relationship is more complex. Build time: 120s+. |

**Score distribution:** Six targets scored exactly 39% — the model defaults to this value when uncertain. This clustering confirms fit scoring is not calibrated.

---

### Section Completeness

| # | Target | Banner | Failed Sections | Total Pages |
|---|--------|--------|----------------|-------------|
| 1 | Marriott | **3 sections** | strategy, financial, solutions | 10 |
| 2 | Stripe | **1 section** | strategy | 15 |
| 3 | Chipotle | **2 sections** | strategy, financial | 14 |
| 4 | Circle | **3 sections** | strategy, competitive, financial | 14 |
| 5 | Polymarket | **2 sections** | strategy, competitive | 13 |
| 6 | Acme Widgets | **CLEAN** | none | 10 |
| 7 | Boeing | **2 sections** | strategy, financial | 17 |
| 8 | Kalshi | **1 section** | strategy | 13 |
| 9 | Feeding America | **1 section** | strategy | 19 |
| 10 | Tango Card | **CLEAN** | none | 18 |

**Strategy (P3) failed 8/10 runs.** This is the #1 reliability problem. P3 uses Opus which is the most expensive model and most likely to get rate-limited under concurrent load.

**Financial (P9) failed 5/10 runs.** When it did load for Stripe, it was contaminated.

**Only 2 of 10 briefs had zero failures** (Acme Widgets, Tango Card — ironically the two least useful targets).

---

### Detailed Per-Brief Audit

#### #1 Marriott International (85%, 10 pages)

**SECTIONS FAILED:** strategy, financial, solutions (3 of 9)

| Check | Result | Detail |
|-------|--------|--------|
| Contamination | **PASS** | Clean — all content about Marriott |
| Company Overview | **PASS** | Revenue $6.7B, HQ Bethesda MD, 414K employees, NASDAQ: MAR — all correct |
| Executives | **PASS** | 6 real names: Anthony Capuano (CEO), Jennifer Mason (CFO), Shawn Hill (CDO), Naveen Manga (CIO), Drew Pinto (EVP CRTO), Satya Anand (Group President). Detailed bios and mandate angles. |
| Revenue | **PASS** | $6.7B — real SEC-sourced figure |
| Displacement angle | **PASS** | "Marriott likely manages gift card, incentive, and customer loyalty reward programs through a combination of in-house solutions and legacy vendors" — correct framing |
| Competitor edges | **PASS** | 6 competitors (Hilton, Hyatt, IHG, Wyndham, Accor, Choice Hotels), all edges filled with detailed analysis |
| Where Win/Lose | **PASS** | Excellent reasoning — wins on scale/luxury, loses to Hyatt on value and Wyndham/Choice on economy |
| Financial Intelligence | **FAIL** | Section failed to load |
| Solutions/Products | **FAIL** | Section failed to load — 0 products mapped |
| 5 Questions | **PASS** | 5 grounded questions, all cite specific data (1,200 deals, citizenM acquisition, 146 countries) |
| Open Positions | **FAIL** | "No open positions found" — WRONG for a 414K-employee company constantly hiring |
| Sentiment | **FAIL** | Says "common for private companies with fewer than 50 employees" — Marriott is PUBLIC with 414K employees. Named #7 Best Workplace per the brief's own headlines. TEMPLATE BUG. |
| Headlines | **PASS** | 5 real headlines (Q1 2026 results, 2025 growth, citizenM acquisition, leadership changes, #7 Best Workplace) |
| Buying Signals | **PASS** | 14 signals, all grounded in real data |

**Issues:** 3 sections failed (strategy, financial, solutions = the most important sections). Sentiment template bug. Open positions wrong for a massive employer.

---

#### #2 Stripe (39%, 15 pages)

**SECTIONS FAILED:** strategy (1 of 9)

| Check | Result | Detail |
|-------|--------|--------|
| Contamination | **CRITICAL FAIL** | P9 financial section is entirely about an adhesives & sealants company. References "~14,000 employees in the adhesives & sealants industry", H.B. Fuller, construction sealants, low-VOC formulations, petrochemical inputs. Competitive positioning also contaminated: "Insufficient data available from web search to determine competitive win patterns in the Adhesives & Sealants category for stripe.com" |
| Company Overview | **PARTIAL** | Revenue $5.1B correct, valuation $159B correct, but **HQ listed as "CHICAGO HEIGHTS, IL"** — this is the adhesives company's HQ, not Stripe (San Francisco/Dublin). The companySnapshot text correctly says "San Francisco & Dublin" but the HQ field is wrong. |
| Executives | **PASS** | 6 real names: Patrick Collison (CEO), John Collison (President), Steffan Tomlinson (CFO), David Singleton (CTO), Eileen O'Mara (CRO), Jeff Titterton (CMO). All accurate with real bios. |
| Revenue | **PASS** | $5.1B (2024) — correct |
| Displacement angle | **PASS** | Not in failed strategy section — found in Watch-Outs area |
| Competitor edges | **FAIL** | Competitive section contaminated with adhesives language — 0 edges filled |
| Where Win/Lose | **FAIL** | Both say "Insufficient data in the Adhesives & Sealants category" |
| Financial Intelligence | **CRITICAL FAIL** | Entire section fabricated for a different company — adhesives revenue estimates, specialty chemicals margins, construction sealant segments |
| Solutions/Products | **PASS** | 4 products mapped: Gift Card Distribution, Employee Recognition, Loyalty API, Compliance Advisory — all well-reasoned for BHN→Stripe |
| 5 Questions | **PASS** | 5 strong questions grounded in Stripe's real data (288 new products, $1.9T payment volume, Crypto.com partnership) |
| Open Positions | **PASS** | 5 real positions listed (Backend Engineer, Data Analyst, etc.) with strategic interpretation |
| Sentiment | **FAIL** | Template bug: "common for private companies with fewer than 50 employees" — Stripe has ~8,500 |
| Headlines | **PASS** | 5 real headlines (Sessions 2026, $159B valuation, Crypto.com, PayPal acquisition rumor, Robinhood investment) |

**Root cause of contamination:** P9 (deepIntelIdentity) searched for "Stripe financial data" and found Stripe Construction Products (adhesives/sealants manufacturer in Chicago Heights, IL). The identity anchor didn't prevent this because P9 uses a different identity context than P1. The model confused two completely different companies.

---

#### #3 Chipotle Mexican Grill (73%, 14 pages)

**SECTIONS FAILED:** strategy, financial (2 of 9)

| Check | Result | Detail |
|-------|--------|--------|
| Contamination | **PASS** | Clean — all content about Chipotle |
| Company Overview | **PASS** | Revenue $3.1B, HQ Newport Beach CA, 130K employees, NYSE: CMG — all correct. 4,100+ restaurants noted. |
| Executives | **PASS** | Real names: Scott Boatwright (CEO), Adam Rymer (CFO), Jason Kidd (COO), Curt Garner (CSTO), Fernando Machado (CBO), Ilene Eskenazi (CLO/CHRO) |
| Revenue | **PASS** | $3.1B — correct |
| Displacement angle | **PASS** | "Chipotle likely manages gift cards, loyalty rewards, and employee incentive programs through either in-house systems or legacy payment processors" |
| Competitor edges | **PASS** | 5 competitors (Taco Bell, Qdoba, Moe's, Panera, McDonald's), all edges filled |
| Where Win/Lose | **PASS** | Win: urban health-conscious millennials/Gen Z. Lose: value-oriented competitors, price sensitivity. |
| Financial Intelligence | **FAIL** | Section failed to load |
| Solutions/Products | **PASS** | 4 products mapped |
| 5 Questions | **PASS** | 5 grounded questions |
| Open Positions | **PASS** | 5 positions listed (Crew Member, Kitchen Leader, etc.) |
| Sentiment | **FAIL** | Template bug: "common for private companies with fewer than 50 employees" — Chipotle is PUBLIC with 130K employees |

**Issues:** Strategy and Financial failed. Sentiment template bug. Fit score at 73% should be higher — Chipotle is a massive gift card business.

---

#### #4 Circle (59%, 14 pages)

**SECTIONS FAILED:** strategy, competitive, financial (3 of 9)

| Check | Result | Detail |
|-------|--------|--------|
| Contamination | **PASS** | Clean — correctly identifies Circle Internet Group (CRCL), USDC/EURC stablecoin business. No Circle K or CircleCI contamination. Identity anchor worked. |
| Company Overview | **PASS** | Revenue $694M (Q1 2026) / $2.7B FY2025, HQ New York NY, ~1,100 employees, NYSE: CRCL — all plausible |
| Executives | **PASS** | Real names: Jeremy Allaire (CEO), Jeremy Fox-Geen (CFO), Li Fan (CTO), Elisabeth Carpenter (COO), Mandeep Walia (CCO), Nikhil Chandhok (CPO) |
| Financial Intelligence | **FAIL** | Section failed to load |
| Competitive | **FAIL** | Section failed to load |
| Sentiment | **FAIL** | Template bug: "fewer than 50 employees" — Circle is public with ~1,100 |

**Positive:** The identity anchor/contamination defense worked perfectly for this ambiguous-name company. Zero wrong-entity references despite "Circle" matching many companies.

---

#### #5 Polymarket (39%, 13 pages)

**SECTIONS FAILED:** strategy, competitive (2 of 9)

| Check | Result | Detail |
|-------|--------|--------|
| Contamination | **MINOR** | HQ listed as "Liberty Lake, WA" — likely from QCEX (acquired entity), not Polymarket's NYC HQ |
| Company Overview | **PARTIAL** | Revenue $587M seems too high for a 50-person prediction market startup — may be conflating trading volume with company revenue |
| Executives | **PASS** | Real names: Shayne Coplan (CEO), Christopher Giancarlo (advisor), Balaji Srinivasan, Naval Ravikant — accurate for a startup (founder + notable advisors) |
| Sentiment | **PASS** | Template actually correct here — Polymarket IS a private company with ~50 employees |
| Financial | **PRESENT** | Has data but revenue figure ($587M) is suspect |

---

#### #6 Acme Widgets LLC (39%, 10 pages)

**SECTIONS FAILED:** none (CLEAN banner)

| Check | Result | Detail |
|-------|--------|--------|
| Contamination | **PASS** | Clean — correctly identifies company can't be verified |
| Company Overview | **HONEST** | "Acme Widgets LLC could not be verified as a major employer with public presence. Search results returned multiple unrelated Acme Widget entities with minimal recent activity. Recommend verifying company legal name, location, and industry classification before proceeding with outreach." |
| Executives | **PASS** | Empty state — "No named executives found" |
| Revenue | **FAIL** | "Not found" placeholder still showing |
| Financial | **MOSTLY EMPTY** | Section headers present but no data |
| Competitive | **EMPTY** | No competitors, no edges |
| Solutions/Products | **PASS** | 4 products mapped despite no company data — generic but reasonable |
| 5 Questions | **PASS** | 5 questions present |

**Issue:** Company correctly identified as unverifiable, but scored 39% instead of 0. A company that can't be found online shouldn't get a "Poor Fit" — it should get a "Cannot Evaluate" or 0.

---

#### #7 Boeing (39%, 17 pages)

**SECTIONS FAILED:** strategy, financial (2 of 9)

| Check | Result | Detail |
|-------|--------|--------|
| Contamination | **PASS** | Clean — all content about Boeing |
| Company Overview | **PASS** | Revenue $22.2B, ~170K employees, NYSE: BA — correct. CEO Kelly Ortberg quote included. |
| Executives | **PASS** | Real name: Robert Kelly Ortberg (CEO) — only 1 exec found but it's correct |
| Displacement angle | **PASS** | "Boeing likely manages employee incentives, rewards, and gift card programs through a combination of internal HR systems and legacy vendors" |
| Competitor edges | **PASS** | 5 competitors, all edges filled |
| Financial Intelligence | **FAIL** | Section failed to load — huge miss for a public company with rich 10-K data |
| Sentiment | **FAIL** | Template bug: "fewer than 50 employees" — Boeing has 170K |

**Critical fit score issue:** Boeing scored 39% but is a known BHN customer for employee rewards/incentives. The scoring model has no access to BHN's actual customer list, so it can't know this. This is the exact problem Option C must solve.

---

#### #8 Kalshi (39%, 13 pages)

**SECTIONS FAILED:** strategy (1 of 9)

| Check | Result | Detail |
|-------|--------|--------|
| Contamination | **PASS** | Clean |
| Executives | **PASS** | Real names: Tarek Mansour, Weisi Duan |
| Competitor edges | **PASS** | 4 competitors, all filled |
| Financial | **FAIL** | Missing |
| Sentiment | **FAIL** | Template bug |

**Note:** 39% feels correct for a prediction markets exchange — high-risk, regulated, minimal BHN product overlap. Joe confirmed this is a reasonable score.

---

#### #9 Feeding America (39%, 19 pages)

**SECTIONS FAILED:** strategy (1 of 9)

| Check | Result | Detail |
|-------|--------|--------|
| Contamination | **PASS** | Clean |
| Company Overview | **PASS** | Correctly identifies as nonprofit hunger-relief organization, 250+ food banks, 60,000+ pantries |
| Executives | **PASS** | Real names: Linda Nageotte, Paul Henrys |
| Revenue | **PASS** | $4.9B in total public support and revenue (FY2023) — correct for a nonprofit of this scale |
| Financial Intelligence | **PASS** | Excellent — cites $5.15B FY2023 revenue, 87.9% donated goods, 7.3% fundraising. Real data. |
| Displacement angle | **PASS** | "Feeding America likely manages corporate partnerships, donor engagement, and volunteer coordination" — nonprofit-appropriate |
| Sentiment | **FAIL** | Template bug: "fewer than 50 employees" |
| Employee count discrepancy | **FAIL** | Brief shows 692 employees. Fit score page showed ~4,000. Brief also mentions 450,000 volunteers. The 692 is likely the paid staff count (correct), while ~4,000 on the fit page may include some volunteer/chapter estimates. |

**Issue:** Employee count inconsistency between fit score page and brief. Both numbers may be "correct" from different sources, but the discrepancy is confusing.

---

#### #10 Tango Card (0%, 18 pages)

**SECTIONS FAILED:** none (CLEAN banner)

| Check | Result | Detail |
|-------|--------|--------|
| Contamination | **PASS** | Clean |
| Competitor guard | **PASS** | Score = 0. Brief correctly identifies: "Acquired by Blackhawk Network in May 2024 with integration completed March 2025" |
| Company Overview | **PASS** | "Seattle-based digital rewards and e-gift card platform founded in 2009. Acquired by Blackhawk Network (Silver Lake-backed)" |
| Executives | **PASS** | David Leeds (CEO/Founder) — correct |
| Revenue | **PASS** | Estimates $40-80M with third-party sources ($47.7M Getlatka, $80.1M ZoomInfo) |
| Financial Intelligence | **PASS** | Present with reasonable estimates |
| Sentiment | **PASS** | Correctly says "Do not pursue — Tango Card is an internal Blackhawk Network subsidiary, not an external prospect" |
| Competitor edges | **PASS** | 5 competitors, all filled |
| Solutions/Products | **PASS** | 4 products mapped |

**Nuance (Joe's note):** Tango was historically a BHN reseller, then acquired in 2024. Through a reseller lens it's a customer, through a competitive lens it's a rival. The system correctly identified the acquisition and flagged it as internal. The 0% score and "do not pursue" sentiment are appropriate post-acquisition.

---

## SYSTEMATIC ISSUES FOUND

### CRITICAL — Must fix before re-running Stage 0

#### 1. P3 (Strategy/Opus) fails 80% of runs
**Impact:** Missing elevator pitch, strategic theme, opening angle, outreach emails — the most user-visible sections.
**Root cause:** Opus is the slowest/most expensive model, rate-limited under concurrent load with 8 other calls.
**Fix options:** (a) Fallback to Sonnet when Opus times out, (b) Defer P3 like gateMap and generate lazily, (c) Move P3 to fire after p1/p2 settle.
**Maps to:** Stage 2 (token-budget-aware scheduler).

#### 2. P9 (Financial) contamination for ambiguous company names
**Impact:** Stripe's financial section is about an adhesives company. HQ field also contaminated.
**Root cause:** P9 uses `deepIntelIdentity` which doesn't enforce `site:` search. Web search for "Stripe financial data" returned a different company (Stripe Construction Products).
**Fix:** Apply the same `site:` search enforcement and contamination warning to `deepIntelIdentity` that P1 uses via `identityAnchor`.

#### 3. Sentiment template bug — hardcoded "< 50 employees"
**Impact:** 7 of 10 briefs show "common for private companies with fewer than 50 employees" for companies that are public and/or have thousands/hundreds of thousands of employees. Makes the product look broken.
**Root cause:** Hardcoded fallback text in the empty sentiment state that ignores the actual company data.
**Fix:** Replace with dynamic text using the brief's own `employeeCount` and `publicPrivate` fields.

### HIGH — Must fix before Stage 0 passes

#### 4. P9 (Financial) fails 50% of runs
**Impact:** No financial intelligence for 5 of 10 targets, including all 3 large public companies that should have the richest 10-K data.
**Root cause:** Same as P3 — rate limiting under concurrent load. P9 uses Sonnet but fires simultaneously with p7 and p8.
**Fix:** Part of Stage 2 scheduler. Could also add Sonnet fallback retry.

#### 5. Fit score clustering at 39%
**Impact:** 6 of 10 targets scored exactly 39% regardless of actual fit. Boeing (known customer) scored the same as Polymarket (zero product overlap).
**Root cause:** LLM defaults to dim1=22 + dim2=10 + dim3=5 = 37 → snaps to 39 when uncertain. No access to seller's actual customer list.
**Fix:** Stage 1 (Option C — client-side deterministic scoring).

#### 6. Open Positions says "none found" for massive employers
**Impact:** Marriott (414K employees) shows "No open positions found" — obviously wrong.
**Root cause:** P6 web search didn't find job listings, and the fallback is honest-empty. But "no positions found" for a 414K-employee company is misleading.
**Fix:** Add size-aware fallback: if employeeCount > 10,000, replace with "Check [company].com/careers for current openings — large employers typically have hundreds of open positions."

### MEDIUM — Track for later stages

#### 7. Polymarket HQ contamination (Liberty Lake, WA)
Likely from QCEX acquisition data, not Polymarket's NYC HQ.

#### 8. Polymarket revenue inflated ($587M for 50-person startup)
May be conflating trading volume with company revenue.

#### 9. Feeding America employee count discrepancy
Fit page: ~4,000. Brief: 692. Different sources, both potentially correct (paid staff vs. total including chapter staff).

#### 10. Acme Widgets scored 39% despite being unverifiable
Should be 0 or "Cannot Evaluate" — scoring an unfindable company at 39% is misleading.

---

## STAGE 0 VERDICT: **FAIL**

### Criteria Assessment

| Criteria | Result | Detail |
|----------|--------|--------|
| Zero incomplete banners across all 10 | **FAIL** | 8 of 10 had banners |
| Zero contamination across all 10 | **FAIL** | Stripe financial section entirely fabricated for wrong company |
| Revenue shows real or estimate for all 10 | **FAIL** | Acme Widgets still shows "Not found" |
| Tango Card identified as competitor | **PASS** | Score = 0, brief says "do not pursue" |
| No KL injection 400 errors | **PASS** | No 400 errors observed |
| Fit scores directionally correct | **FAIL** | Boeing (known customer) = 39%, Chipotle = 73% (should be 85%), 6 targets all at 39% |
| No fabricated execs/URLs/statistics | **FAIL** | Stripe financials entirely fabricated for wrong company |
| Console ≤1 Anthropic 500 per brief | **PASS** | Console screenshots showed 0 HTTP errors |

### What Must Be Fixed Before Re-Running Stage 0

1. **P3 (Opus) fallback to Sonnet** — 80% failure rate makes the brief unusable
2. **P9 identity anchor** — deepIntelIdentity needs site: search enforcement
3. **Sentiment template** — replace hardcoded "<50 employees" with dynamic text
4. **Open positions size-aware fallback** — "none found" is wrong for 414K-employee companies

### What Waits for Later Stages (per roadmap)

- Fit scoring calibration → Stage 1 (Option C)
- Section reliability → Stage 2 (scheduler)
- Financial reliability → Stage 2 (scheduler)
- Cost optimization → Stage 3

---

## After Stage 0 Passes

1. Merge staging → main (production gets all 21+ commits)
2. Establish the standing flow: staging → validate → merge in small batches
3. Proceed to Stage 1 (deterministic scoring + golden set repair)
