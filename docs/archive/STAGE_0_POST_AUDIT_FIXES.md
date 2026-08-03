# STAGE 0 — POST-AUDIT FIX SUMMARY
## June 8, 2026

**Audit scope:** 10 briefs generated with Blackhawk Network as seller across diverse target profiles.
**Verdict:** FAIL — 4 blocking issues identified and fixed. Ready for re-run.

---

## What was tested

| # | Target | Type | Fit Score | Sections Failed |
|---|--------|------|-----------|----------------|
| 1 | Marriott International | Large public, strong fit | 85% | strategy, financial, solutions (3) |
| 2 | Stripe | VC-backed, multi-KL | 39% | strategy (1) + **severe contamination** |
| 3 | Chipotle Mexican Grill | Public, cross-vertical | 73% | strategy, financial (2) |
| 4 | Circle | Ambiguous name | 59% | strategy, competitive, financial (3) |
| 5 | Polymarket | Tiny, bad fit | 39% | strategy, competitive (2) |
| 6 | Acme Widgets LLC | Tiny/obscure, unfindable | 39% | none |
| 7 | Boeing | Large public, known customer | 39% | strategy, financial (2) |
| 8 | Kalshi | Small VC, bad fit | 39% | strategy (1) |
| 9 | Feeding America | Nonprofit | 39% | strategy (1) |
| 10 | Tango Card | Direct competitor (acquired) | 0% | none |

---

## Blocking issues found and fixed

### 1. P3 Strategy failed 8/10 runs

**What happened:** The strategy section (elevator pitch, strategic theme, opening angle, outreach emails) used Opus — the most expensive and slowest model. Under concurrent load with 8 other API calls, Opus consistently got rate-limited or timed out. 8 of 10 briefs were missing their most user-visible sections.

**Root cause:** Opus has lower rate limits than Sonnet/Haiku. When 9 calls fire simultaneously, Opus (the slowest to return) gets deprioritized or rejected by Anthropic's infrastructure.

**Fix:** Switched P3 from Opus to Sonnet. Sonnet handles structured strategy output with comparable quality — elevator pitches, outreach emails, and opening angles are formulaic enough that Sonnet's reasoning is sufficient, especially given the rich context from `baseFull` (seller proof pack, KL injections, ICP).

**Opus retained for:** ICP build pass 1 only — the one call where deep web search + reasoning about what a seller actually sells genuinely requires the highest-capability model. ICP builds fire in isolation (no concurrent competition), so Opus reliability is not an issue there.

**Commit:** `88b03ec`

---

### 2. Stripe financial section contaminated with wrong company

**What happened:** The entire Financial Intelligence section for Stripe was about an adhesives & sealants manufacturer:
- Revenue estimate: "~14,000 employees in the adhesives & sealants industry, estimated $1.4-$2.1 billion"
- Margins: "Adhesives & sealants manufacturers typically operate at 35-45% gross margins"
- Segments: "construction sealants (40-45%), industrial adhesives (25-30%)"
- Competitive: "Insufficient data in the Adhesives & Sealants category for stripe.com"
- HQ field: "CHICAGO HEIGHTS, IL" (adhesives company's address, not Stripe's SF/Dublin)

**Root cause:** P9 (financial deep dive) uses `deepIntelIdentity` for its identity context, which was weaker than P1's `identityAnchor`. The web search for "Stripe financial data" returned results for Stripe Construction Products (an adhesives/sealants manufacturer in Chicago Heights, IL). Without `site:stripe.com` enforcement, the model accepted the wrong company's data.

**Fix:** `deepIntelIdentity` (used by P7, P8, P9) now matches P1's identity anchor strength:
- Enforces `site:URL` or `"URL"` in search queries
- Explicit contamination warning about same-name companies
- Per-fact verification: "Did this come from the target URL?"
- Instruction to return empty string rather than risk wrong-company data

**Commit:** `88b03ec`

---

### 3. Sentiment template said "< 50 employees" for massive companies

**What happened:** 7 of 10 briefs showed the empty sentiment state: "No Glassdoor reviews, press coverage, or public sentiment found for {company}. This is common for private companies with fewer than 50 employees." This appeared for:
- Marriott (414,000 employees, public)
- Boeing (170,000 employees, public)
- Chipotle (130,000 employees, public)
- Stripe (8,500 employees)
- Circle (1,100 employees, public)
- Kalshi (~494 employees)
- Feeding America (692 employees, nonprofit)

**Root cause:** Hardcoded fallback text that was written for the Brightpath Consulting case (30 employees, private) and never parameterized.

**Fix:** The sentiment empty state now uses the brief's actual `employeeCount` and `publicPrivate` fields to generate three tiers of context-appropriate messaging:

| Company profile | Message |
|----------------|---------|
| Public or >1,000 employees | "No Glassdoor reviews found despite being a publicly traded company / a {size}-employee organization. May indicate parent/subsidiary brand for employer listings." |
| 51-1,000 employees | "This is common for mid-sized companies — may operate under a different brand name or have limited digital presence." |
| ≤50 employees | "This is common for smaller private companies with limited public presence." |

All three tiers include actionable coaching for the rep.

**Commit:** `88b03ec`

---

### 4. Open positions "none found" for large employers

**What happened:** Marriott (414,000 employees) showed "No open positions found on public job boards or marriott's website" — obviously incorrect for one of the world's largest employers.

**Root cause:** P6 had a single-pass approach: two web searches (company site + job boards). For large companies, careers pages are often JavaScript-heavy, ATS-gated (Workday, Greenhouse, iCIMS), and not indexed by general web search. When both searches returned nothing useful, the fallback was a generic "none found" message that sounded like the company wasn't hiring.

**Fix:** P6 now has three phases:

| Phase | What it searches | When it fires |
|-------|-----------------|---------------|
| **Phase 1** (existing) | `site:company.com careers` + `"company" jobs site:linkedin.com OR site:indeed.com` | Always |
| **Phase 2** (new) | `"company" jobs site:indeed.com OR site:linkedin.com/jobs` + `"company" careers site:glassdoor.com OR site:builtin.com OR site:ziprecruiter.com` | Only if Phase 1 found nothing |
| **Phase 3** (new) | Size-aware honest empty message | Only if Phase 2 also found nothing |

Phase 3 message varies by company size:
- **>5,000 employees:** "No specific positions found via web search. For a company of this size (~X employees), roles are very likely available on their internal careers portal or ATS platforms (Workday, Greenhouse, Lever). Check directly before your call."
- **≤5,000 employees:** "No open positions found. Check their careers page directly."

No roles are ever invented. The directive "Job postings must be sourced exclusively from the company website" is maintained — the fix adds more places to LOOK, not more places to fabricate from.

**Commit:** `88b03ec`

---

## What passed in the audit (no fix needed)

| Check | Result | Detail |
|-------|--------|--------|
| Circle contamination defense | **PASS** | Zero references to Circle K, CircleCI, or Circle Medical despite maximally ambiguous name |
| Tango Card competitor guard | **PASS** | Score = 0, brief says "do not pursue — internal subsidiary". Correctly identified BHN acquisition. |
| Executive accuracy | **PASS** | Real names across all 10 briefs. No stubs, no hallucinated names. Marriott had 6 execs, Stripe had 6, Chipotle had 6. |
| Revenue data | **PASS** | Real figures for public companies (Marriott $6.7B, Chipotle $3.1B, Boeing $22.2B, Stripe $5.1B) |
| Headlines / Buying Signals | **PASS** | Real, grounded, current data across all briefs |
| 5 Questions | **PASS** | All 10 briefs had 5 questions, all grounded in the brief's own research |
| Products mapped | **PASS** | 3-5 products mapped per brief (where solutions section loaded) |
| No KL 400 errors | **PASS** | Stripe (fintech + payments + AI) didn't overflow |
| Console errors | **PASS** | Zero HTTP errors, CSP violations, or JS errors in all 4 console screenshots |
| Watch-Outs | **PASS** | Relevant procurement risks identified per target |

---

## Known issues NOT blocking Stage 0 (tracked for later stages)

| Issue | Stage | Detail |
|-------|-------|--------|
| Fit score clustering at 39% | Stage 1 | 6/10 targets scored exactly 39%. Boeing (known BHN customer) scored 39%. Option C (client-side deterministic scoring) is the structural fix. |
| Chipotle scored 73% (should be ~85%) | Stage 1 | QSR gift cards = BHN's core business. Under-scored due to LLM scoring limitations. |
| Acme Widgets scored 39% (should be 0) | Stage 1 | Company can't be found online. Unfindable targets need a "Cannot Evaluate" status. |
| P9 financial failed 50% of runs | Stage 2 | Rate limiting under concurrent load. Token-budget-aware scheduler will fix. |
| Feeding America employee discrepancy | Stage 2 | Fit page: ~4,000, Brief: 692. Different sources, needs reconciliation. |
| Polymarket HQ wrong (Liberty Lake, WA) | Stage 2 | Likely from QCEX acquisition data, not Polymarket's NYC HQ. |
| Polymarket revenue inflated ($587M) | Stage 2 | May conflate trading volume with company revenue. |
| Brief build times 75-120 seconds | Stage 3 | Cost/speed optimization via model re-tiering and caching. |
| ICP build is slow | Stage 3 | Opus + extensive web search for large sellers. Split into Opus research → Sonnet structure. |

---

## Next step

Re-run Stage 0 audit on the same 10 targets after hard-refresh. Priority validation targets:
1. **Marriott** — strategy section should now load (Sonnet), sentiment should show appropriate text for 414K-employee public company
2. **Stripe** — financial section should be about Stripe (payments), not adhesives. HQ should be San Francisco or Dublin, not Chicago Heights.
3. **Boeing** — strategy should load, sentiment should be size-appropriate

If these three pass, run the remaining 7 and assess.
