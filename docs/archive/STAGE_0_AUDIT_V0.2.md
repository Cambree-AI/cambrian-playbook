# STAGE 0 — AUDIT V0.2
## Changes since V0.1 audit run
## June 8, 2026

---

## Context

V0.1 audit ran 10 targets with Blackhawk Network as seller. Result: **FAIL** — 4 blocking issues. Fixes deployed. V0.1.1 re-ran Marriott post-fix: strategy and financial loaded (P3→Sonnet and P9 identity anchor working), but P2 (executives) and P4 (solutions) dropped — rotating failure from 9 concurrent API calls.

V0.2 adds wave staggering to eliminate rotating failures entirely.

---

## Commits since V0.1 audit

| Commit | Change |
|--------|--------|
| `88b03ec` | **Stage 0 critical fixes** — P3→Sonnet, P9 identity anchor, sentiment template, P6 multi-pass |
| `2e42e6e` | **Wave stagger** — 3 waves of 3 calls instead of 9 simultaneous |

---

## Fix 1: P3 Strategy → Sonnet (commit `88b03ec`)

**Problem:** P3 used Opus. Failed 8/10 runs in V0.1 audit due to rate limiting under concurrent load.

**Change:** Switched from `OPUS` to `SONNET`. Opus retained only for ICP build pass 1 (fires in isolation, no concurrency issue).

**V0.1.1 result:** Strategy section loaded successfully (elevator pitch, strategic analysis, opening angle, outreach emails all present). **Fix confirmed.**

---

## Fix 2: P9 Identity Anchor (commit `88b03ec`)

**Problem:** Stripe's financial section was entirely about an adhesives & sealants manufacturer. `deepIntelIdentity` (used by P7/P8/P9) didn't enforce `site:URL` search like P1's identity anchor.

**Change:** `deepIntelIdentity` now matches P1's strength — enforces `site:URL` in search queries, explicit contamination warning, per-fact verification against target URL.

**V0.1.1 result:** Not re-tested on Stripe yet. Marriott (unambiguous name) was clean. Stripe re-test needed in V0.2.

---

## Fix 3: Sentiment Template (commit `88b03ec`)

**Problem:** Hardcoded "common for private companies with fewer than 50 employees" showing for Marriott (414K, public), Boeing (170K), Chipotle (130K), etc.

**Change:** Dynamic text using `brief.employeeCount` and `brief.publicPrivate`:
- Public or >1K employees: "despite being a publicly traded company / {size}-employee organization"
- 51-1K employees: "common for mid-sized companies"
- ≤50 employees: "common for smaller private companies" (original text, now only for appropriate companies)

**V0.1.1 result:** Marriott showed NPS/loyalty signal data instead of the empty state — sentiment section had actual content. **Fix confirmed.**

---

## Fix 4: P6 Open Positions Multi-Pass (commit `88b03ec`)

**Problem:** "No open positions found" for Marriott (414K employees). Single-pass web search missed JS-heavy careers pages.

**Change:** Three-phase approach:
- Phase 1: Company careers site + LinkedIn/Indeed (existing)
- Phase 2: Secondary sources — Indeed, LinkedIn Jobs, Glassdoor, BuiltIn, ZipRecruiter (new)
- Phase 3: Size-aware honest empty (>5K employees → "roles likely on internal ATS portal")

**V0.1.1 result:** Marriott showed 3 real roles (Front Desk Agent, Housekeeper, Room Attendant). **Fix confirmed.**

---

## Fix 5: Wave Stagger (commit `2e42e6e`)

**Problem:** V0.1.1 showed P3 fix worked but P2 (executives) and P4 (solutions) dropped instead — the rotating failure just moved to different sections. Root cause: 9 API calls + 15 web searches firing simultaneously exceed rate limits.

**Change:** Calls now fire in 3 priority waves:

```
Wave 1 (0s):   P1 overview, P3 strategy, P5 live search
               What the user sees first. P1/P5 may be pre-cached from step 4.

Wave 2 (+3s):  P2 executives, P4 solutions, P6 open positions
               Company intelligence + products. P2 naturally waits for P1.

Wave 3 (+6s):  P7 competitive, P8 board, P9 financial
               Deep intel — user scrolls to see these.
```

**Max concurrent calls:** 3 at any point (was 9)
**Hard timeout:** 90s (was 60s) to accommodate the stagger
**Trade-off:** Brief builds ~6s slower, but every section should load

**V0.2 result:** Pending — Marriott re-run will validate.

---

## What V0.2 re-run should validate

### Marriott (priority — worst case from V0.1)
- [ ] Zero "sections incomplete" banner
- [ ] Strategy section loaded (elevator pitch, emails, angle)
- [ ] Executives loaded (real names — should be 4-6 for Marriott)
- [ ] Solutions/products mapped (was 0 in both prior runs)
- [ ] Financial loaded with SEC data
- [ ] Open positions found (was 3 roles in V0.1.1)
- [ ] Sentiment shows appropriate text for public company
- [ ] No contamination

### If Marriott passes, also re-test:
- [ ] Stripe — verify P9 contamination is fixed (no adhesives/sealants)
- [ ] Circle — verify 3-section failure resolved (strategy, competitive, financial all failed in V0.1)

---

## Tabled items (noted during audit, not in current stage)

| Item | Stage | Source |
|------|-------|--------|
| Fit score clustering at 39% (6/10 targets) | Stage 1 | V0.1 audit |
| Boeing scored 39% despite being known BHN customer | Stage 1 | V0.1 audit |
| Chipotle scored 73% should be ~85% | Stage 1 | V0.1 audit |
| Acme Widgets scored 39% for unfindable company | Stage 1 | V0.1 audit |
| Feeding America employee count discrepancy | Stage 2 | V0.1 audit |
| ICP build speed (slow for large sellers) | Stage 3 | V0.2 testing |
| UX: Group "5 Questions" with emails and angle | Stage 5 | Joe feedback |
| Brief build times 75-120s | Stage 3 | V0.1 audit |

---

## Pass criteria (unchanged from V0.1)

Stage 0 passes when:
1. Zero "sections incomplete" banners across all 10 runs
2. Zero contamination across all 10 runs
3. Revenue shows real figure or reasoned estimate for all 10
4. Tango Card identified as competitor
5. No KL injection 400 errors
6. Fit scores directionally correct (deferred to Stage 1 for structural fix)
7. No fabricated executives, URLs, or statistics
8. Console shows ≤1 Anthropic 500 error per brief
