# OPTION C — Client-Side Deterministic Scoring
## Architecture Specification

---

## The Problem

Fit scores vary 21+ points across identical inputs (Brightpath: 62-83, Marriott: 59-85, Stripe: 39-59). The LLM computes dim1/dim2/dim3 using judgment, and that judgment varies between runs even at temperature=0 with top_k=1. Six of ten V0.1 audit targets scored exactly 39% — the model's default when uncertain.

## The Fix

Split scoring into two steps:
1. **LLM extracts structured signals** (facts about the company)
2. **JavaScript computes the score** from those signals using a fixed mathematical model

Same signals → same score. Every time.

---

## Step 1: LLM Signal Extraction

The LLM receives the same seller ICP context and company list, but instead of computing scores, it extracts factual signals per company.

### Signal Schema (per company)

```json
{
  "company": "Marriott International",
  "signals": {
    "industryMatch": "direct",
    "industryInSellerTargetList": true,
    "specificProductMapping": "Gift card distribution for Marriott Bonvoy loyalty program; employee recognition across 414K workforce; promotional incentives for franchise partners",
    "isExistingCustomer": false,
    "closestCustomerName": "Wyndham Hotels & Resorts",
    "closestCustomerIndustry": "Hospitality",
    "customerIndustryMatch": "same",
    "customerUseCaseMatch": "same",
    "isCompetitor": false,
    "competitorCustomerEvidence": "Marriott partners with multiple gift card distributors; no verified exclusive relationship with a BHN competitor",
    "hasVerifiedCompetitorRelationship": false,
    "hasDeepPlatformLockin": false,
    "ownershipType": "public",
    "employeeBracket": "50000+",
    "reason": "Global hospitality leader with 9,900+ properties and a massive loyalty program (Marriott Bonvoy, 160M members). Gift card distribution, employee recognition across 414K employees, and franchise partner incentives are all direct product-fit use cases for BHN.",
    "customerSimilarity": "Most similar to Wyndham Hotels & Resorts — same hospitality vertical, same loyalty/gift card use case, comparable global franchise model.",
    "incumbentRisk": "Marriott likely uses a combination of in-house solutions and legacy vendors for gift card and incentive programs across 30+ brands."
  }
}
```

### Signal Definitions

| Signal | Type | What the LLM determines | Used in |
|--------|------|------------------------|---------|
| `industryMatch` | `"direct"` \| `"adjacent"` \| `"unrelated"` | Does the seller's product directly solve a problem in this prospect's industry? | Dim1 Step A |
| `industryInSellerTargetList` | boolean | Is the prospect's industry explicitly listed in the seller's ICP target industries? | Dim1 Step A tiebreaker |
| `specificProductMapping` | string | Name the specific seller product(s) that map to specific prospect needs. Empty if none. | Dim1 Step A tiebreaker |
| `isExistingCustomer` | boolean | Is this prospect already a named customer of the seller? | Dim2 (auto-30) |
| `closestCustomerName` | string | Name of the seller's existing customer most similar to this prospect. Empty if none. | Dim2 |
| `closestCustomerIndustry` | string | Industry of that closest customer. | Dim2 |
| `customerIndustryMatch` | `"same"` \| `"same_sector"` \| `"different"` | How closely does the prospect's industry match the closest customer's? | Dim2 |
| `customerUseCaseMatch` | `"same"` \| `"different"` | Does the prospect have the same use case as the closest customer? | Dim2 |
| `isCompetitor` | boolean | Is this prospect a direct competitor of the seller? | Auto-zero |
| `competitorCustomerEvidence` | string | Evidence that this prospect uses a competitor's product. Empty if none. | Dim3 |
| `hasVerifiedCompetitorRelationship` | boolean | Can the LLM cite specific evidence (case study, press, 10-K)? | Dim3 |
| `hasDeepPlatformLockin` | boolean | Multi-year contract, enterprise-wide deployment documented? | Dim3 |
| `ownershipType` | `"public"` \| `"pe-backed"` \| `"vc-backed"` \| `"private"` \| `"bootstrapped"` \| `"nonprofit"` \| `"government"` | Ownership structure | Dim1 Step C |
| `employeeBracket` | `"1-49"` \| `"50-499"` \| `"500-4999"` \| `"5000-49999"` \| `"50000+"` | Employee count bracket | Dim1 Step B |
| `reason` | string | 2-3 sentence plain-language explanation for the salesperson | Display |
| `customerSimilarity` | string | Which existing customer is most similar and why | Display |
| `incumbentRisk` | string | What vendor they currently use (if known) | Display |

---

## Step 2: JavaScript Score Computation

### Dimension 1: Product/Service Fit (0-45 points)

```javascript
function computeDim1(signals, sellerICP) {
  // Step A: Product-Industry Fit
  let stepA;
  if (signals.isCompetitor) return 0;
  
  if (signals.industryMatch === "direct") {
    stepA = 40;
  } else if (signals.industryMatch === "adjacent") {
    stepA = 32;
    // Upgrade to 40 if the seller has a specific product mapping
    if (signals.specificProductMapping && signals.industryInSellerTargetList) {
      stepA = 40;
    }
  } else if (signals.industryMatch === "unrelated") {
    stepA = 22;
    // Upgrade to 32 if there's still a specific product mapping
    if (signals.specificProductMapping) {
      stepA = 32;
    }
  } else {
    stepA = 12; // no connection
  }
  
  // Step B: Size (tiebreaker)
  const sellerTarget = sellerICP?.icp?.companySize || "";
  const targetBracket = signals.employeeBracket;
  const brackets = ["1-49", "50-499", "500-4999", "5000-49999", "50000+"];
  const sellerIdx = brackets.findIndex(b => sellerTarget.includes(b.split("-")[0]));
  const targetIdx = brackets.indexOf(targetBracket);
  const distance = sellerIdx >= 0 && targetIdx >= 0 ? Math.abs(sellerIdx - targetIdx) : 2;
  const stepB = distance === 0 ? 3 : distance === 1 ? 2 : 0;
  
  // Step C: Ownership
  const stepC = (signals.ownershipType === "pe-backed" || signals.ownershipType === "vc-backed") ? 2 : 0;
  
  return Math.min(45, stepA + stepB + stepC);
}
```

### Dimension 2: Customer Lookalike (0-30 points)

```javascript
function computeDim2(signals, sellerICP) {
  if (signals.isCompetitor) return 0;
  
  // Existing customer → max score
  if (signals.isExistingCustomer) return 30;
  
  const hasCustomers = (sellerICP?.icp?.customerExamples || []).filter(Boolean).length > 0;
  if (!hasCustomers) return 15; // neutral when no customer data
  
  if (!signals.closestCustomerName) return 3; // no similarity found
  
  // Same industry + same use case = strong match
  if (signals.customerIndustryMatch === "same" && signals.customerUseCaseMatch === "same") {
    return 27;
  }
  
  // Same industry, different use case = adjacency
  if (signals.customerIndustryMatch === "same") {
    return 18;
  }
  
  // Same broad sector
  if (signals.customerIndustryMatch === "same_sector") {
    return 18;
  }
  
  // Different industry but product transfers
  return 10;
}
```

### Dimension 3: Competitive Displacement (0-25 points)

```javascript
function computeDim3(signals) {
  if (signals.isCompetitor) return 0;
  
  // Verified competitor customer with cited evidence
  if (signals.hasVerifiedCompetitorRelationship) {
    // Deep lock-in = low score (hard to displace)
    if (signals.hasDeepPlatformLockin) return 5;
    // Verified but displaceble = gold
    return 25;
  }
  
  // Strong indirect signal (industry dominated by competitors)
  if (signals.competitorCustomerEvidence && signals.competitorCustomerEvidence.length > 20) {
    return 18;
  }
  
  // Default — no competitive intel
  return 12;
}
```

### Total Score

```javascript
function computeFitScore(signals, sellerICP, fitWeights = { dim1: 45, dim2: 30, dim3: 25 }) {
  if (signals.isCompetitor) {
    return { score: 0, label: "Competitor", dim1: 0, dim2: 0, dim3: 0 };
  }
  
  const rawDim1 = computeDim1(signals, sellerICP);
  const rawDim2 = computeDim2(signals, sellerICP);
  const rawDim3 = computeDim3(signals);
  
  // Apply user-adjustable weights (normalize to 0-1, scale by weight)
  const d1 = (rawDim1 / 45) * fitWeights.dim1;
  const d2 = (rawDim2 / 30) * fitWeights.dim2;
  const d3 = (rawDim3 / 25) * fitWeights.dim3;
  
  const score = Math.max(0, Math.min(100, Math.round(d1 + d2 + d3)));
  const label = score >= 75 ? "Strong Fit" : score >= 55 ? "Potential Fit" : "Poor Fit";
  
  return { score, label, dim1: rawDim1, dim2: rawDim2, dim3: rawDim3 };
}
```

---

## Accuracy Defense — Why This Model Is Correct

### Dim1: Product Fit (45 points, 45% weight)

The core question: "Does what the seller sells solve a real problem for this prospect?"

| Score | Meaning | Defense |
|-------|---------|--------|
| 40 | Direct product-industry match | The prospect's industry is in the seller's target list AND a specific product maps to a specific need. This is not a guess — it's a verified match between seller catalog and prospect industry. |
| 32 | Indirect/adjacent match | The seller COULD serve this prospect but needs to explain the connection. The product exists, the need is plausible, but it's not the seller's core market. |
| 22 | Unrelated industry, possible department fit | The prospect's industry isn't in the seller's wheelhouse, but a specific department might use the product. Weak signal. |
| 12 | No connection | The seller's products don't solve problems in this prospect's world. |
| +3/+2/+0 | Size tiebreaker | Same employee bracket as ICP target (+3), one away (+2), far away (+0). Size is a tiebreaker, never a gate. |
| +2/+0 | Ownership bonus | PE/VC backing signals investment mandate and budget availability. |

**Why 45 points max:** Product fit is the single strongest predictor of deal success. A perfectly matched product into the right industry with the right company size is nearly half the battle.

### Dim2: Customer Lookalike (30 points, 30% weight)

The core question: "Does this prospect look like companies the seller has already won?"

| Score | Meaning | Defense |
|-------|---------|--------|
| 30 | IS an existing customer | Known customer = maximum score. The seller has already won this company. |
| 27 | Same industry + same use case as a named customer | This prospect is a near-clone of a proven win. The seller has evidence that this type of company buys. |
| 18 | Same industry OR same sector, different use case | Adjacency — the seller operates in this space but the specific use case differs. |
| 10 | Different industry, product could transfer | Weak signal — the seller's value proposition might apply but there's no proven parallel. |
| 3 | No similarity | The seller has never won anything like this prospect. |
| 15 | No customer data available | Neutral — we can't score similarity without baseline customers. |

**Why 30 points max:** Past success is the second strongest predictor. A company that looks like your best customers is more likely to buy than one that doesn't — but product fit still matters more.

### Dim3: Competitive Displacement (25 points, 25% weight)

The core question: "Is there evidence this prospect already buys what the seller offers — from someone else?"

| Score | Meaning | Defense |
|-------|---------|--------|
| 25 | Verified competitor customer with cited evidence | This prospect has budget, use case, and procurement path. The seller's job is displacement, not education. Highest-value signal. |
| 18 | Strong indirect signal | The prospect's industry is dominated by the seller's competitors, but no specific verified relationship. |
| 12 | No competitive intelligence | Default. Unknown incumbent. Neutral, not negative. |
| 5 | Deep platform lock-in | Verified multi-year contract, enterprise-wide deployment. High switching cost makes displacement very difficult. |

**Why 25 points max:** Competitive displacement is a strong signal but less reliable than product fit or customer similarity because it depends on external intelligence that may be incomplete.

---

## Weight Justification

| Dimension | Default Weight | Rationale |
|-----------|---------------|-----------|
| Dim1: Product Fit | 45% | A company where the product doesn't fit is NEVER a good target, regardless of other signals |
| Dim2: Customer Lookalike | 30% | Past wins are the best predictor of future wins, but a new market can still be a fit |
| Dim3: Competitive Displacement | 25% | Displacement opportunities are gold but the absence of competitive intel doesn't mean bad fit |

Users can adjust these weights. The math stays deterministic regardless of weight distribution.

---

## Expected Score Ranges (for BHN)

Using this model, the expected scores for the Stage 0 targets:

| Target | Dim1 | Dim2 | Dim3 | Total | Label | Rationale |
|--------|------|------|------|-------|-------|-----------|
| **Marriott** | 40+3+0=43 | 27 (Wyndham = same industry+use case) | 12 (no verified competitor) | **82** | Strong Fit | Direct gift card/loyalty fit, hospitality customer exists |
| **Chipotle** | 40+3+0=43 | 27 (similar QSR loyalty) | 12 | **82** | Strong Fit | QSR gift cards = core BHN business |
| **Stripe** | 32+2+0=34 | 10 (different industry, product transfers) | 12 | **56** | Potential Fit | Indirect — payments platform, not end consumer |
| **Boeing** | 40+3+0=43 | 27 (large enterprise = similar to known customers) | 18 (likely uses competitors in employee rewards) | **88** | Strong Fit | Known BHN customer, massive employee rewards |
| **Polymarket** | 22+0+0=22 | 3 (no similarity) | 12 | **37** | Poor Fit | Prediction market, no product overlap |
| **Kalshi** | 22+0+0=22 | 3 | 12 | **37** | Poor Fit | Regulated prediction exchange |
| **Acme Widgets** | 12+0+0=12 | 3 | 12 | **27** | Poor Fit | Can't be found, no industry match |
| **Feeding America** | 32+2+0=34 | 10 (nonprofits in customer base?) | 12 | **56** | Potential Fit | Donor engagement gift cards |
| **Tango Card** | 0 | 0 | 0 | **0** | Competitor | Direct competitor (acquired by BHN) |
| **Circle** | 22+2+2=26 | 10 | 12 | **48** | Poor Fit | Crypto, indirect employee rewards fit |

**Key calibration checks:**
- Marriott (82) > Chipotle (82) > Boeing (88) — all Strong Fit, all make sense for BHN
- Boeing (88) highest because known customer + competitor displacement signal
- Stripe (56) = Potential Fit — correct, indirect relationship
- Polymarket (37) and Kalshi (37) = Poor Fit — correct, no product overlap
- Tango Card (0) = Competitor — correct
- Acme Widgets (27) = Poor Fit — correct, unfindable

---

## Implementation Plan

1. **New LLM prompt** — replaces the current scoring prompt. Asks for signals, not scores.
2. **New JS scoring engine** — `computeFitScore(signals, sellerICP, fitWeights)` in a separate module.
3. **Wire into existing UI** — same fit score table, same labels, same colors. User sees no UX change.
4. **Existing snap() removed** — no longer needed, scores are computed not snapped.
5. **Existing canonicalLabel() stays** — still maps score to Strong/Potential/Poor.
6. **Test** — run the same 10 Stage 0 targets. Scores should be deterministic and directionally correct.
