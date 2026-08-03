# PRODUCTION RELEASE — June 9, 2026
## v2.1.1-production-ready | 37 commits | Stage 0 validated

---

## RELEASE SUMMARY

37 commits merged from staging to production. This is the first production update since pre-June-3 code. Every fix from the June 3 stabilization audit, the June 8-9 Stage 0 validation, and the cache/contamination architecture work is now live at `cambriancatalyst.ai`.

**Tag:** `v2.1.1-production-ready`
**Prior production tag:** `v2.0.0-stable` (May 27 — rollback point if needed)
**Prior staging tag:** `v2.1.0-stage0-validated` (June 8 — intermediate checkpoint)

---

## VALIDATED RESULTS

### Marriott International (V0.7 — full rebuild)
- **18/19 sections loaded**, 9/9 web-verified, 19 pages
- Revenue: $6.7B (SEC data), HQ: Bethesda MD
- 3 products mapped, champion identified, 5 competitors with edges
- 4 real exec names (Capuano CEO)
- Financial: SEC data ($23.7B→$25.1B→$26.2B revenue trend)
- 5 grounded discovery questions
- Zero contamination

### Stripe (V0.11 — cache hit with backfill)
- **18/19 sections loaded**, 17 pages
- Revenue: $5.1B, HQ: San Francisco (contamination FIXED)
- 3 products mapped, 4 real exec names (Collison, Tomlinson, Hughes Johnson, Singleton)
- Financial: real Stripe data ($5.1B, 28% YoY, $1.9T TPV, $2.2B FCF)
- Competitive: PayPal/Braintree, Adyen, 4 edges filled, 19-22% market share
- Zero adhesive/sealant contamination
- Zero Chicago Heights references in display

### Only consistent gap: Case Studies (1/19 sections)
Case studies occasionally don't populate — the proof pack context is thin when the seller has few named customers. Not a blocking issue.

---

## WHAT CHANGED (37 commits)

### Hallucination & Accuracy (June 3 + June 8)
| Fix | Detail |
|-----|--------|
| P6 hallucinated job postings | Killed — honest empty when web search finds nothing |
| Exec stubs (CEO/CTO placeholders) | 4-phase extraction pipeline + actionable empty state |
| Training knowledge fallbacks | Gated by category — OK for universal truths, NEVER for company facts |
| Enrichment 501 crash | Graceful degradation (200 with null) |
| Revenue "Not found" | Backfilled from P9 financial estimates |
| Bad /about link | Links to root domain only — never guess URL paths |

### Contamination Defense (June 8-9)
| Fix | Detail |
|-----|--------|
| P1 identity anchor | Forces site:URL search, contamination warning, per-fact verification |
| P5 headline filter | Strips wrong-entity headlines (base-name suffix detection) |
| P7/P8/P9 relaxed identity | External sources for competitive/board/financial (not company's own site) |
| Cross-field consistency check | HQ mismatch detection (snapshot vs field), employee count 3x mismatch |
| Competitive industry filter | Strips competitors referencing wrong industries |
| Enrichment labeling | Trust-but-verify (not "ground truth" without Apollo) |

### Section Reliability (June 8-9)
| Fix | Detail |
|-----|--------|
| P3 Strategy: Opus → Sonnet | 80% failure rate → loads consistently |
| Wave stagger | 3 waves (0s/5s/12s) instead of 9 simultaneous calls |
| P4 token cap: 4500 → 7500 | Room for complex seller product schemas |
| P4 moved to Wave 1 | Most important section gets first API access |
| gateMap → lazy generation | Fires on "Prep for the Call" (step 6), not during brief |
| Hard timeout: 45s → 90s | Accommodates wave stagger + post-allDone calls |

### Cache Architecture (June 8-9)
| Fix | Detail |
|-----|--------|
| Cache validation: requires solutionMapping | Rejects incomplete cached briefs |
| Cache HQ contamination check | Detects city mismatch, overrides with snapshot value |
| Cache backfill: 6 sections | Financial, Competitive, Board, Quick Take, 5 Questions, Case Studies |
| Cache loading flags reset | No phantom spinners on cache hit |
| "Live data refreshing" text | Clears when refresh completes (driven by _loadingSections.live) |
| 30s safety timeout | Clears all loading flags if calls hang |
| 45s auto-rebuild | Full rebuild triggered if gaps remain after backfill |

### Console Error Fixes
| Fix | Detail |
|-----|--------|
| CSP: Vercel Live script | Added to script-src, connect-src, frame-src |
| account_outputs 409 | PATCH old is_latest before POST |
| competitor_intel 400 | Fixed column names (industry→market_category) |
| Exec pre-cache crash | Skip for Quick Brief, reject stub-only cache |

### UI/UX Improvements
| Fix | Detail |
|-----|--------|
| Exec empty state | Actionable: links to root domain + LinkedIn search |
| Sentiment template | Dynamic text based on company size/ownership |
| P6 open positions | 3-phase: company site → job boards → size-aware empty |
| Competitor edges | Prompt requires filling, fallback text for blanks |
| Displacement angle | Correctly targets seller's displacement of status quo |

---

## KNOWN ISSUES (not blocking, tracked for later stages)

### Stage 1 — Deterministic Scoring (next)
- Fit score variance: 21-point spread on identical inputs
- 6/10 V0.1 targets scored exactly 39% — model defaults when uncertain
- Boeing (known BHN customer) scored 39%
- Option C: LLM extracts facts, JS computes score deterministically
- Input-signature cache: same inputs → same outputs
- Golden set repair

### Stage 2 — Completeness
- Transient Anthropic 500 errors (2-4 per session, not our code)
- Brief build time 60-90s for fresh builds
- Token-budget-aware scheduler (structural fix for rate limiting)

### Stage 3 — Cost
- Daily API cost unmeasured
- ICP build slow for large sellers (Opus)
- Chunked KL retrieval (pgvector)
- Product page limit ~4 max for seller ICP

### Stage 5 — UX
- Quick Take renders last (should render first)
- Group "5 Questions" with emails/angle
- Brief section count (19) — consolidation candidates identified
- No loading indicator for late-firing sections
- Case Studies consistently thin

---

## ROLLBACK PLAN

If production issues emerge:
```bash
git checkout main
git reset --hard v2.0.0-stable
git push origin main --force
```

This rolls back to May 27 code. All June 3-9 fixes would be lost.

Less aggressive: roll back to the pre-merge state:
```bash
git checkout main
git reset --hard a17da2e
git push origin main --force
```

---

## DEPLOYMENT VERIFICATION

After Vercel deploys (auto-triggered by push to main):
1. Navigate to `https://cambriancatalyst.ai`
2. Build a brief for any known company
3. Verify: no "sections incomplete" banner, no console 409 spam, no CSP errors
4. Check: strategy section loads (was Opus, now Sonnet)
5. Check: displacement angle targets status quo (not the prospect)

---

## STAGING BRANCH STATUS

Staging and main are now in sync at commit `7165541`. The standing flow going forward:
- All development on staging branch
- Validate on staging preview URL
- Merge to main in small batches (not 37-commit drops)
- Tag before each merge

---

## FILES IN THIS RELEASE

### Documentation (project root)
| File | Purpose |
|------|---------|
| `PRODUCTION_RELEASE_2026-06-09.md` | **This file** — release notes |
| `ARCHITECTURE.md` | Comprehensive codebase audit |
| `MERGED-ROADMAP.md` (Desktop) | Master plan — Stages 0-5 |
| `STAGE_0_AUDIT_PLAN.md` | 10-target test matrix + V0.1 results |
| `STAGE_0_POST_AUDIT_FIXES.md` | V0.1→V0.2 fix summary |
| `STAGE_0_AUDIT_V0.2.md` | V0.2 changes |
| `STAGE_0_STATUS.md` | Pre-merge status |
| `STAGE_0_FINAL_STATUS.md` | End-of-day-1 status |
| `SESSION_SUMMARY_2026-06-08.md` | Day 1 full session log |
| `SESSION_AUDIT_2026-06-08.md` | Day 1 audit results |

### Source changes
| File | Lines changed |
|------|--------------|
| `src/App.jsx` | +523 / -103 |
| `vercel.json` | +1 / -1 (CSP update) |
| `api/_guard.js` | +3 / -1 (origin guard, June 3) |
| `api/enrich.js` | +2 / -1 (501→200, June 3) |

---

## NEXT: STAGE 1

Per MERGED-ROADMAP.md:
1. **Option C — client-side deterministic scoring** (Task #9)
2. **Input-signature result cache**
3. **Repair the golden set**

These are the recurrence-stoppers. They make the product structurally reliable rather than relying on prompt-level patches.
