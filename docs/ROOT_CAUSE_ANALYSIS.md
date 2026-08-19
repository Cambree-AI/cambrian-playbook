# ROOT CAUSE ANALYSIS — Persistent Data Quality Issues
## June 9, 2026

---

## The Pattern

After 40+ commits of fixes, the same categories of errors keep appearing. We fix one instance (Stripe adhesives, BrightPath contamination, "115 loyalty jobs") but the SYSTEMIC cause persists. New briefs surface new instances of the same root problems.

This document identifies the ROOT CAUSES — not individual symptoms — and proposes structural fixes that prevent entire categories of failure.

---

## ROOT CAUSE 1: P1 overview ignores instructions for public company data

### Symptoms
- Marriott revenue: $6.7B (net fee revenue) instead of $25.1B (total) — persists across 10+ runs
- Marriott employees: ~190,000 instead of ~414,000 — persists across 5+ runs
- Despite explicit "TOTAL consolidated revenue" and "exact figure from annual report" instructions

### Why prompt instructions don't work
The P1 prompt says "TOTAL consolidated revenue — NOT a sub-metric" but the model still returns $6.7B because:
1. Marriott's own press releases emphasize "net fee revenues" ($6.7B) as the headline number
2. The web search returns Marriott's IR page which leads with fee revenue
3. The model follows the SEARCH RESULT over the PROMPT INSTRUCTION when they conflict
4. Temperature=0 with top_k=1 makes the model consistently pick the same wrong answer

### Structural fix needed
**Don't rely on the LLM to pick the right revenue metric.** Instead:
- P1 extracts ALL revenue figures it finds (total, fee, segment)
- P9 (financial) also extracts detailed revenue
- A POST-MERGE JavaScript validator selects the LARGEST revenue figure as "total revenue"
- The validator is deterministic — same inputs, same output, no LLM judgment

### Why the current reconciliation doesn't work
The revenue reconciliation at line ~8363 fires after allDone, but:
- The pipeline took 71 seconds on V0.10 (near the 90s timeout)
- Post-allDone calls (Quick Take, 5Q, Discovery, consistency validator) may not all complete
- The validator currently extracts the FIRST dollar match from P9, not necessarily the largest/most authoritative

---

## ROOT CAUSE 2: Enrichment feeds wrong data as "truth"

### Symptoms
- Marriott employees: ~190,000 (from free enrichment) displayed in fit score table
- Stripe HQ: Chicago Heights, IL (from free enrichment matching wrong company)
- Stripe employees: ~14,000 (from free enrichment matching wrong company)

### Why this happens
1. `/api/enrich-free` uses SEC EDGAR + Wikidata lookups by COMPANY NAME (not URL)
2. For ambiguous names (Stripe, Mercury, Apollo), it can match the wrong entity
3. The matched data gets stored in `member._enrichment.organization`
4. `firmographicsTruth` injects this as "ESTABLISHED FACTS... do NOT contradict"
5. Every downstream section (P1-P9) treats it as ground truth
6. Even when P1's web search finds the correct data, the enrichment value persists in the `member.employees` field that the UI displays

### Structural fix needed
**Enrichment data must be validated against P1 web search results before being trusted.** Options:
- A: After P1 resolves, compare P1's employee count against enrichment. If >2x difference, P1 wins.
- B: Don't inject enrichment as "ESTABLISHED FACTS" — inject as "UNVERIFIED HINTS"
- C: Validate enrichment at the source — `/api/enrich-free` should match on DOMAIN, not just company name
- **Best: Option A + C combined.** Fix the source AND add a post-merge reconciliation.

### Why the current approach fails
- We changed enrichment labeling from "ground truth" to "verify against web search" but the UI still displays `member.employees` (enrichment value) in the fit score table, regardless of what P1 found
- The scoring signal extraction asks the LLM to output `orgSize` but this value doesn't flow back to `member.employees` in the table display

---

## ROOT CAUSE 3: P3 makes claims it cannot verify

### Symptoms
- "8% RevPAR growth" (V0.10) — actual is 4.2% per P9
- "115 loyalty jobs" (Hyatt V0.1) — P6 found zero loyalty roles
- "180+ million members" (V0.10) — P9 says 271 million
- Various suspect statistics (63%, 2.3x, 70%, 40%) in solutions

### Why this happens
P3 (strategy) runs in Wave 1 PARALLEL with P1, P4, P5, P6, P9. It has:
- Its own web search (1 search)
- The seller proof pack
- KL injections
- But NO access to what P1, P5, P6, or P9 found

So P3 independently searches, finds different data points, and makes claims that other sections contradict. There's no way to verify P3's claims against P6's hiring data or P9's financials because they run simultaneously.

### Structural fix needed
**P3 must not cite specific financial metrics or hiring numbers.** These come from dedicated sections:
- Revenue/financial metrics → P9 (financial deep dive)
- Employee counts → P1 (overview)  
- Hiring data → P6 (open positions)
- Glassdoor ratings → P5 (live search)

P3's job is STRATEGY — the pitch, the angle, the emails. It should reference themes ("Marriott is focused on direct booking growth") not specific numbers ("8% RevPAR growth").

**Implementation:**
- Add to P3 prompt: "Do NOT cite specific revenue figures, employee counts, RevPAR percentages, member counts, or hiring numbers. These are provided by other sections. Use qualitative language: 'strong RevPAR growth' not '8% RevPAR growth'. 'Bonvoy's massive member base' not '180 million members'. Specific numbers in your section WILL be cross-checked against financial and hiring sections — if they disagree, yours gets stripped."
- Add post-merge validator: scan P3 fields for specific financial claims and cross-check against P9/P1 data

---

## ROOT CAUSE 4: No cross-section consistency enforcement

### Symptoms
- Bonvoy members: 180M (P3) vs 271M (P9) vs 228M (P9 earnings)
- Employees: 190,000 (P1) vs 160,000 (P4 solutions) vs 120,000 (P4 solutions) vs 414,000 (reality)
- Revenue: $6.7B (P1) vs $26.2B (P9)
- RevPAR: "8%" (P3) vs "4.2%" (P9)

### Why this happens
Each P1-P9 call runs independently with its own web search. They often find different data points from different sources at different times. The post-merge consistency validator (line ~8245) only checks:
- CEO name conflicts ✅
- Revenue mismatch (logs, recently upgraded to reconcile) ⚠️
- Placeholder stripping ✅
- Data confidence computation ✅
- Contact name corroboration ✅

It does NOT check:
- Employee count consistency across sections ❌
- Member count consistency ❌
- Financial metric consistency (RevPAR, growth rates) ❌
- Factual claims in P3 vs P9 data ❌

### Structural fix needed
**Expand the post-merge validator to enforce a SINGLE SOURCE OF TRUTH for key metrics:**

```
After allDone:
  revenue → P9 wins (SEC-sourced for public, most authoritative)
  employeeCount → P1 wins for public (annual report), reconcile with P9
  memberCount → P9 wins (earnings data)
  revPAR → P9 wins (earnings data)
  glassdoorRating → P5 wins (dedicated search)
  
  Scan P3 (elevatorPitch, strategicTheme, openingAngle, emails) for:
    - Specific dollar amounts → cross-check against P9
    - Specific percentages → cross-check against P9
    - Specific headcounts → cross-check against P1
    - Specific member counts → cross-check against P9
  
  If P3 cites a number that contradicts P9/P1 by >20%, STRIP IT and replace
  with qualitative language.
```

---

## ROOT CAUSE 5: Suspect statistics in solutions and teaching insights

### Symptoms
- "63% of travelers prefer prepaid cards" — no citation
- "Members acquired via gift card have 2.3x higher LTV" — presented as BHN data, may be fabricated
- "70% of hospitality brands lack infrastructure" — round number, no source
- "40% more frequently" — no citation
- "12-15% lower voluntary turnover" — no citation
- "18-24% increase in redemption rates" — no citation

### Why this happens
P4 (solutions) is instructed to provide "teaching insights" and "risk removers" with specific, quantified claims. The model fabricates plausible-sounding statistics from training knowledge because:
1. The proof pack has no specific metrics (BHN hasn't provided case study data)
2. The prompt says "quantified when possible" which encourages invention
3. There's no validation that cited statistics actually exist

### Structural fix needed
**Every statistic must be tagged with its source:**
- `[from proof pack]` — verified, can cite to a prospect
- `[industry benchmark]` — general knowledge, cite as "industry data shows"
- `[estimated]` — model inference, must be disclosed
- `[unsupported]` — no source, must be removed or flagged

**Implementation:**
- Add to P4 prompt: "For every statistic or percentage you cite, tag it: [proof pack], [web search], [industry benchmark], or [estimated]. If you cannot identify a source, write the insight without a specific number. 'Companies with structured recognition see measurably lower turnover' is better than fabricating '12-15% lower turnover' without evidence."
- Post-merge: strip any teaching insight stat that isn't tagged

---

## ROOT CAUSE 6: Pipeline timing cuts off post-merge validators

### Symptoms
- Revenue reconciliation doesn't fire (pipeline took 71s)
- Post-allDone calls (Quick Take, 5Q, consistency validator) may be interrupted
- 90s hard timeout clears loading states but doesn't guarantee validators ran

### Why this happens
The pipeline takes 45-75 seconds for a full build:
- Wave 1 (0s): P1, P3, P4 → 10-20s
- Wave 2 (5s): P5, P6 → 10-15s
- Wave 3 (12s): P7, P8, P9 → 15-25s
- allDone resolves at ~35-50s
- Post-allDone: Quick Take (3s), 5Q (3s), Discovery (3s), consistency validator (1s) → 10-15s
- Total: 45-65s typical, up to 75s with retries

The 90s hard timeout CLEARS loading states but doesn't guarantee the post-allDone calls (including the consistency validator) have completed. If allDone resolves at 70s, there's only 20s for all post-allDone work.

### Structural fix needed
**The consistency validator must run BEFORE the brief is marked as complete, not as a fire-and-forget post-allDone task.**

Options:
- A: Make the validator synchronous — it runs inside allDone.then() before setBriefLoading(false)
- B: Increase the hard timeout to 120s to give more headroom
- C: Run the validator in mergeDeepIntel (the last merger to fire) instead of post-allDone

**Best: Option A.** The validator is fast (pure JS, no API calls) — it should take <100ms. There's no reason for it to be asynchronous.

---

## PRIORITY ORDER

| # | Root Cause | Impact | Effort | Fix |
|---|-----------|--------|--------|-----|
| 1 | **P3 cites unverified metrics** | RevPAR hallucination, member count mismatch | Low | Add prompt guard + post-merge scan |
| 2 | **No cross-section consistency** | 4+ conflicting numbers per brief | Medium | Expand validator, enforce single source of truth |
| 3 | **Pipeline timing** | Validator doesn't fire | Low | Make validator synchronous |
| 4 | **P1 revenue wrong for public companies** | $6.7B instead of $25.1B | Medium | JS-side revenue selector (largest figure from P9) |
| 5 | **Enrichment feeds wrong data** | ~190,000 employees | Medium | Validate enrichment against P1, fix enrich-free domain matching |
| 6 | **Suspect statistics** | Fabricated percentages in solutions | Low | Require source tags, strip untagged stats |

---

## RELATIONSHIP TO ROADMAP

These fixes are within Stage 1 scope:
- Root causes 1, 2, 4, 5 directly improve Option C signal quality (better signals → better scores)
- Root cause 3 prevents hallucination (Stage 4 grounding guard, but the P3 guard can be done now)
- Root cause 6 is infrastructure (ensures validators actually run)
- Root cause 6 relates to Stage 1's golden set (validators must fire for golden set to be meaningful)

None of these are new features or ad hoc work — they're structural fixes to the brief pipeline that directly serve the roadmap.
