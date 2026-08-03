# OPTION C — TEST PLAN
## Client-Side Deterministic Scoring Validation

---

## Test Objective

Verify that the new scoring system:
1. **Produces scores** — every company gets a numeric score, not "Needs Review"
2. **Scores are directionally correct** — strong fits score high, bad fits score low, competitors score 0
3. **Scores are deterministic** — same company scored twice produces the SAME score
4. **Console shows signal breakdown** — the `[scoreFit]` log shows dim1/dim2/dim3 and signals

---

## Test 1: Quick Validation (Stripe, BHN seller)

**Setup:** Hard-refresh staging, use BHN as seller, score Stripe.

**Check the console for:**
```
[scoreFit] Stripe: dim1=34 dim2=10 dim3=12 = 56% (Potential Fit) | industry=adjacent customer=none competitor=false
```

**Expected:** Score in the 48-60 range (Potential Fit). NOT 39%.

**What to verify:**
- [ ] Score appears in the fit check table
- [ ] Console shows the `[scoreFit]` line with signal breakdown
- [ ] `industryMatch` is "adjacent" (payments → payments, but BHN sells gift cards, Stripe sells payments infrastructure)
- [ ] `isCompetitor` is false
- [ ] Label shows "Potential Fit" or "Poor Fit" (not "Needs Review")

---

## Test 2: Determinism Check (run Stripe twice)

**Setup:** Score Stripe, note the score. Clear fit scores (switch tabs or refresh). Score Stripe again.

**Expected:** Both scores are IDENTICAL (0-point variance).

**What to verify:**
- [ ] Run 1 score: ___
- [ ] Run 2 score: ___
- [ ] Difference: ___ (must be 0)

---

## Test 3: Competitor Detection (Tango Card)

**Setup:** Score Tango Card with BHN as seller.

**Expected:** Score = 0, label = "Competitor"

**What to verify:**
- [ ] Score is 0
- [ ] `isCompetitor` = true in console
- [ ] Label shows "Competitor" (not "Poor Fit")

---

## Test 4: Strong Fit (Marriott)

**Setup:** Score Marriott with BHN as seller.

**Expected:** Score 75-88 (Strong Fit). Direct product fit (gift cards → loyalty), customer similarity (Wyndham → same industry).

**What to verify:**
- [ ] Score ≥ 75
- [ ] Label is "Strong Fit"
- [ ] Console shows `industryMatch=direct`
- [ ] Console shows `closestCustomerName` with a real customer

---

## Test 5: Bad Fit (Polymarket)

**Setup:** Score Polymarket with BHN as seller.

**Expected:** Score 30-45 (Poor Fit). Prediction markets have no product overlap with gift cards.

**What to verify:**
- [ ] Score < 55
- [ ] Label is "Poor Fit"
- [ ] Console shows `industryMatch=unrelated`

---

## Test 6: Full Batch (10 targets from Stage 0)

**Setup:** Import or enter all 10 Stage 0 targets. Score the full batch.

**Expected score ranges (from OPTION_C_SCORING_SPEC.md):**

| Target | Expected | Label |
|--------|----------|-------|
| Marriott | 75-88 | Strong Fit |
| Chipotle | 75-88 | Strong Fit |
| Boeing | 75-90 | Strong Fit (known customer) |
| Stripe | 48-60 | Potential Fit |
| Feeding America | 48-60 | Potential Fit |
| Circle | 40-55 | Poor Fit |
| Polymarket | 30-45 | Poor Fit |
| Kalshi | 30-45 | Poor Fit |
| Acme Widgets | 20-35 | Poor Fit |
| Tango Card | 0 | Competitor |

**What to verify:**
- [ ] All 10 targets scored (no "Needs Review")
- [ ] Strong Fits score above Potential Fits
- [ ] Potential Fits score above Poor Fits
- [ ] Tango Card = 0

---

## Test 7: Re-run Determinism (full batch twice)

**Setup:** Score the full batch, record all 10 scores. Clear. Score again.

**What to verify:**
- [ ] All 10 scores are identical between runs
- [ ] Zero variance across the board

---

## Pass Criteria

Option C passes when:
1. All 10 targets produce scores (no failures)
2. Scores are directionally correct (strong > potential > poor > competitor)
3. Two consecutive runs produce identical scores (0 variance)
4. Console shows signal breakdowns for every company
5. No "Needs Review" labels on recognizable companies

## After Option C Passes

1. Push to production
2. Proceed to input-signature cache (Stage 1.2)
3. Repair golden set (Stage 1.3)
