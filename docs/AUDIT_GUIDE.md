# Brief Audit Guide — Cambrian Catalyst

## How to Audit a Brief

Run a Full Rebuild on staging for the target company. Print to PDF. Check every field below.

---

## 1. Contamination Check (Critical)

**What to look for**: Data from a DIFFERENT company with the same or similar name.

| Section | What to verify | Red flags |
|---------|---------------|-----------|
| Company Overview | HQ, revenue, employees, ownership, snapshot | Wrong city, wrong industry, wrong revenue scale |
| Financial Intelligence | Revenue trend, margins, segments, earnings quotes | Revenue from wrong entity, wrong CEO names in quotes |
| Competitive Positioning | Competitors listed, market position | Competitors from wrong industry (e.g., adhesives companies for a fintech) |
| Board & Investors | Board members, investors, investment thesis | Board members from wrong entity |
| Open Positions | Job titles, strategic interpretation | Roles from wrong company (e.g., manufacturing roles for a SaaS company) |
| Headlines | News items | News about wrong entity |

**Known ambiguous test cases**: Stripe (vs Stripe Construction Products), Mercury (vs Mercury Insurance), Apollo (vs Apollo Global), Delta (vs Delta Faucet), BrightPath (vs BrightPath Bio/Behavior).

**Current defenses** (as of V0.19):
- P1 companySnapshot injected into P7/P8/P9 as disambiguation context
- firmographicsTruth downgraded to non-authoritative for enrichment-sourced data
- HQ removed from firmographicsTruth entirely
- Corroboration gate: P1 > enrichment for HQ/employees/revenue
- Financial contamination filter: r9 nulled out when detected

---

## 2. Data Accuracy (High Priority)

### Overview Card
| Field | How to verify | Tolerance |
|-------|--------------|-----------|
| Revenue | Cross-check against P9 Financial section and public sources | Must be from same year, same metric (total vs net vs fee) |
| Employees | Cross-check P1 snapshot vs P4 solutions vs P9 text | ±50% acceptable for private companies; exact for public |
| HQ | Must match companySnapshot text | Zero tolerance — wrong HQ = contamination |
| Ownership | Public/Private/PE/VC/Nonprofit | Must be correct |
| Valuation/Funding | For private companies, check date and source | Must cite source (e.g., "February 2026 tender offer") |

### Financial Intelligence (P9)
| Field | What to verify |
|-------|---------------|
| Revenue Trend | Multi-year trajectory with specific figures and sources |
| Margin Trajectory | Must cite filing dates or analyst sources |
| Segment Breakdown | Revenue mix by product/business line |
| Capital Priorities | Where money is going (R&D, M&A, etc.) |
| Earnings Insight | Direct quote from executive with name, title, date |

### Executives (P2)
| Check | What to look for |
|-------|-----------------|
| Current | Are these people still at the company? |
| Correct entity | Are these executives at stripe.com, not some other Stripe? |
| Titles accurate | CEO, CFO, COO — do they match current reality? |

---

## 3. Source Tagging (Medium Priority)

Every statistic in Teaching Insights and Risk Removers must have a source tag:
- `[proof pack]` — from seller's uploaded documents
- `[web search]` — found during brief generation
- `[industry benchmark]` — general industry knowledge
- `[estimated]` — model inference, must be disclosed
- `[unsupported — verify with seller]` — no source found

**Red flag**: Specific percentages (63%, 2.3x, 40%) without any tag.

---

## 4. Cross-Section Consistency (Medium Priority)

| Check | Sections involved | What to look for |
|-------|-------------------|-----------------|
| Employee count | Overview vs P4 solutions vs P9 | Same number everywhere, or within 2x tolerance |
| Revenue | Overview vs P9 vs P3 strategy | Same figure, same metric |
| Member/user counts | P3 vs P9 | Should match or P3 should use qualitative language |
| Hiring claims | P3/P4 vs P6 | P3 should not cite specific hiring numbers |
| CEO name | P1 vs P2 vs P9 earnings quote | Must be consistent |

---

## 5. Email Sign-offs (Low Priority)

Emails should end with `[Your name here]` — NOT an invented first name like "Sarah", "Alex", "Mike".

If a name appears, the post-merge validator should replace it with a fun placeholder:
- "Your future favorite vendor"
- "Somebody who did their homework"
- "A human who actually read your 10-K"
- "Your friendly neighborhood sales rep"

---

## 6. Case Studies & PROVEN WITH (Low Priority)

- Should honestly state `[no analogue customer in our list — verify with seller]` when no match exists
- Should NOT fabricate customer names or case studies
- `[unsupported — verify with seller]` tag should appear on unverifiable claims

---

## Audit Scorecard Template

```
Company: _______________
Seller: _______________
Version: V0.___
Date: _______________
Build type: Full Rebuild / Cache Hit

CONTAMINATION:        [ ] ZERO  [ ] Found: _______________
SECTIONS COMPLETE:    ___/9
DATA CONFIDENCE:      [ ] High  [ ] Medium  [ ] Low

Overview:
  HQ:                 [ ] Correct  [ ] Wrong: _______________
  Revenue:            [ ] Correct  [ ] Wrong: _______________
  Employees:          [ ] Correct  [ ] Wrong: _______________
  Ownership:          [ ] Correct  [ ] Wrong: _______________

Financial (P9):       [ ] Clean  [ ] Contaminated  [ ] Missing
Competitive (P7):     [ ] Clean  [ ] Contaminated  [ ] Missing
Board (P8):           [ ] Clean  [ ] Contaminated  [ ] Missing
Headlines (P5):       [ ] Clean  [ ] Contaminated  [ ] Missing
Hiring (P6):          [ ] Clean  [ ] Contaminated  [ ] Missing
Sentiment (P5):       [ ] Clean  [ ] Contaminated  [ ] Missing

Source tags:           [ ] All tagged  [ ] Missing tags on: ___
Email sign-offs:       [ ] [Your name here]  [ ] Invented name: ___
Cross-section:         [ ] Consistent  [ ] Mismatches: ___

VERDICT:              [ ] Production-ready  [ ] Needs fixes
NOTES:
```

---

## Audit History

| Version | Date | Company | Verdict | Key Findings |
|---------|------|---------|---------|-------------|
| V0.16 | 6/9/26 | Stripe | FAIL | Adhesives contamination in P9, P7 empty, P8 missing, Chicago Heights HQ |
| V0.17 | 6/9/26 | Stripe | PASS (1 issue) | All sections clean except HQ still Chicago Heights from enrichment |
| V0.18 | 6/10/26 | Stripe | PASS | HQ fixed to San Francisco. Zero contamination. Email sign-off "Sarah" noted. |
| V0.19 | 6/10/26 | Stripe | PASS | Zero contamination. Email placeholder working. 14K employees in P4 (within tolerance). |

---

## Production Releases

| Date | Version | Commits | Key Changes |
|------|---------|---------|-------------|
| 6/9/26 | v2.1.1 | 37 | Stage 0 stabilization — wave stagger, cache backfill, identity anchors |
| 6/10/26 | v2.2.0 | 20 | Structural identity fix, enrichment trust, Option C scoring, RLS cleanup |
