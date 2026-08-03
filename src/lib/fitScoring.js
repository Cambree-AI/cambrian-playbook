// src/lib/fitScoring.js
//
// Option C — Client-side deterministic scoring engine.
// LLM extracts structured signals; this module computes the score.
// Same signals → same score. Every time.

// ── DIMENSION 1: Product/Service Fit (0-45) ─────────────────────────────
export function computeDim1(signals, sellerICP) {
  if (signals.isCompetitor) return 0;

  // Step A: Product-Industry Fit
  let stepA;
  const hasProductMapping = signals.specificProductMapping && signals.specificProductMapping.length > 5;

  if (signals.industryMatch === "direct") {
    stepA = 40;
  } else if (signals.industryMatch === "adjacent") {
    // Upgrade to 40 if seller has a specific product mapping AND industry is in target list
    stepA = (hasProductMapping && signals.industryInSellerTargetList) ? 40 : 32;
  } else if (signals.industryMatch === "unrelated") {
    // Upgrade to 32 if there's still a specific product mapping
    stepA = hasProductMapping ? 32 : 22;
  } else {
    stepA = 12;
  }

  // Step B: Size (tiebreaker only)
  const brackets = ["1-49", "50-499", "500-4999", "5000-49999", "50000+"];
  const sellerTarget = (sellerICP?.icp?.companySize || "").toLowerCase();
  // Find the lowest bracket in the seller's target range. Use exact bracket string
  // match only — the old String(low) form matched "50" in "50000+", making every
  // seller with a target above 50 employees look identical to a "50-499" target.
  const sellerIdx = brackets.findIndex(b => sellerTarget.includes(b));
  const targetIdx = brackets.indexOf(signals.employeeBracket);
  const distance = (sellerIdx >= 0 && targetIdx >= 0) ? Math.abs(sellerIdx - targetIdx) : 2;
  const stepB = distance === 0 ? 3 : distance === 1 ? 2 : 0;

  // Step C: Ownership
  const stepC = (signals.ownershipType === "pe-backed" || signals.ownershipType === "vc-backed") ? 2 : 0;

  return Math.min(45, stepA + stepB + stepC);
}

// ── DIMENSION 2: Customer Lookalike (0-30) ──────────────────────────────
export function computeDim2(signals, sellerICP) {
  if (signals.isCompetitor) return 0;
  if (signals.isExistingCustomer) return 30;

  const hasCustomers = (sellerICP?.icp?.customerExamples || []).filter(Boolean).length > 0;
  if (!hasCustomers) return 15; // neutral when no customer data

  if (!signals.closestCustomerName) return 3;

  // Same industry + same use case = strong match
  if (signals.customerIndustryMatch === "same" && signals.customerUseCaseMatch === "same") return 27;
  // Same industry, different use case = adjacency
  if (signals.customerIndustryMatch === "same") return 18;
  // Same broad sector
  if (signals.customerIndustryMatch === "same_sector") return 18;
  // Different industry but product transfers
  return 10;
}

// ── DIMENSION 3: Competitive Displacement (0-25) ────────────────────────
export function computeDim3(signals) {
  if (signals.isCompetitor) return 0;

  if (signals.hasVerifiedCompetitorRelationship) {
    // Deep lock-in = hard to displace
    if (signals.hasDeepPlatformLockin) return 5;
    // Verified but displaceable = gold
    return 25;
  }

  // Strong indirect signal
  if (signals.competitorCustomerEvidence && signals.competitorCustomerEvidence.length > 20) return 18;

  // Default — no competitive intel
  return 12;
}

// ── LABEL HELPER (single source of truth for all callers) ───────────────
// Used by computeFitScore and by any client-side override that re-labels
// after mutating a score (e.g. the known-customer dim2 boost in App.jsx).
// Accepts the full signals object OR a plain { isCompetitor } object.
export function labelForScore(score, signals = {}) {
  if (signals.isCompetitor) return "Competitor";
  return score >= 75 ? "Strong Fit" : score >= 55 ? "Potential Fit" : "Poor Fit";
}

// ── TOTAL SCORE ─────────────────────────────────────────────────────────
export function computeFitScore(signals, sellerICP, fitWeights = { dim1: 45, dim2: 30, dim3: 25 }) {
  if (signals.isCompetitor) {
    return { score: 0, label: "Competitor", rawDim1: 0, rawDim2: 0, rawDim3: 0 };
  }

  const rawDim1 = computeDim1(signals, sellerICP);
  const rawDim2 = computeDim2(signals, sellerICP);
  const rawDim3 = computeDim3(signals);

  // Apply user-adjustable weights (normalize to 0-1, scale by weight)
  const d1 = (rawDim1 / 45) * fitWeights.dim1;
  const d2 = (rawDim2 / 30) * fitWeights.dim2;
  const d3 = (rawDim3 / 25) * fitWeights.dim3;

  const score = Math.max(0, Math.min(100, Math.round(d1 + d2 + d3)));
  const label = labelForScore(score, signals);

  return { score, label, rawDim1, rawDim2, rawDim3 };
}

// ── SIGNAL EXTRACTION PROMPT ────────────────────────────────────────────
// Returns the prompt text for the LLM to extract signals (not compute scores).
export function buildSignalExtractionPrompt(companies, sellerCtx, sellerICP, icpContext) {
  const customerList = (sellerICP?.icp?.customerExamples || []).filter(Boolean);
  const competitorList = (sellerICP?.icp?.competitiveAlternatives || []).filter(Boolean);
  const productCatalog = sellerICP?.icp?.productCatalog || [];

  return `You are a sales intelligence analyst. For each company below, extract STRUCTURED SIGNALS about their fit with the seller. Do NOT compute scores — just extract facts.\n\n` +

    `SELLER CONTEXT:\n${sellerCtx.slice(0, 500)}\n${icpContext}\n\n` +

    (productCatalog.length
      ? `SELLER'S PRODUCTS/SERVICES:\n${productCatalog.map(p => `  • ${p.name}: ${p.description} → for ${(p.industries || []).join(", ")}`).join("\n")}\n\n`
      : `Seller's target industries: [${(sellerICP?.icp?.industries || []).join(", ")}]\n\n`) +

    (customerList.length
      ? `SELLER'S EXISTING CUSTOMERS: ${customerList.join(", ")}\n\n`
      : `No named customers available.\n\n`) +

    (competitorList.length
      ? `SELLER'S COMPETITORS: ${competitorList.map(c => typeof c === "object" ? c.name : c).filter(Boolean).join(", ")}\n` +
        // Include competitor customer lists for verification
        (() => {
          const comps = (sellerICP?.icp?.competitiveAlternatives || []).filter(c => typeof c === "object" && c.theirCustomers?.length);
          if (!comps.length) return "";
          return `COMPETITOR CUSTOMERS (use to verify competitorCustomerEvidence):\n` +
            comps.map(c => {
              const custs = c.theirCustomers.map(tc => typeof tc === "object" ? `${tc.name} [${tc.evidence || "unverified"}]` : tc);
              return `  ${c.name}: ${custs.join(", ")}`;
            }).join("\n") + "\n";
        })() + "\n"
      : "") +

    `For EACH company, extract these signals:\n\n` +

    `SIGNAL DEFINITIONS:\n` +
    `- industryMatch: "direct" | "adjacent" | "unrelated". Use "direct" if the seller's product is USED BY this industry — even if they're in different verticals. Example: a gift card company selling to a hotel chain = "direct" because hotels BUY gift cards for loyalty programs. A payment processor selling to a retailer = "direct" because retailers BUY payment processing. CRITICAL: For employee recognition, rewards, gift card, incentive, or HR platforms — any large employer (5,000+ employees) is a DIRECT buyer regardless of their primary industry. Boeing, TikTok, Klarna, or any large enterprise buys these products for their own employees. The question is "would this prospect BUY what the seller sells?" not "are they in the same industry?"\n` +
    `- industryInSellerTargetList: true if the prospect's industry appears in the seller's target industry list above\n` +
    `- specificProductMapping: Name the SPECIFIC seller product(s) that map to SPECIFIC prospect needs. Be concrete: "Gift card distribution for Marriott Bonvoy loyalty program" not "gift cards for hospitality." Empty string if no specific mapping exists.\n` +
    `- isExistingCustomer: true if (a) this company appears in the seller's customer list above (fuzzy match: "Wyndham Hotels" matches "Wyndham"), OR (b) you have high-confidence knowledge from a press release, partnership announcement, case study, or public documentation that this company is a verified customer of the seller. Only set true if you can cite specific evidence — do not guess. Include the evidence source in customerSimilarity.\n` +
    `- closestCustomerName: Name of the seller's existing customer most similar to this prospect. Empty if none.\n` +
    `- closestCustomerIndustry: Industry of that closest customer.\n` +
    `- customerIndustryMatch: "same" (exact industry) | "same_sector" (same broad sector, different sub-industry) | "different"\n` +
    `- customerUseCaseMatch: "same" (prospect would use the product for the same reason as the named customer) | "different"\n` +
    `- isCompetitor: true ONLY if this prospect appears in the SELLER'S COMPETITORS list above OR is a subsidiary/brand of a named competitor. A company in an adjacent industry (e.g. payment processing vs gift card distribution) is NOT a competitor — they are a potential CUSTOMER. This field must be FALSE unless the prospect directly competes with the seller for the same buyers with a substitute product.\n` +
    `- competitorCustomerEvidence: Specific evidence that this prospect uses a competitor's product. Cite the source. Empty if none.\n` +
    `- hasVerifiedCompetitorRelationship: true ONLY if you can cite specific evidence (case study, press release, 10-K, partner page)\n` +
    `- hasDeepPlatformLockin: true if there's evidence of a multi-year contract or enterprise-wide deployment with a competitor\n` +
    `- ownershipType: "public" | "pe-backed" | "vc-backed" | "private" | "bootstrapped" | "nonprofit" | "government"\n` +
    `- employeeBracket: "1-49" | "50-499" | "500-4999" | "5000-49999" | "50000+". For PUBLIC companies, use the exact figure from their most recent annual report — do NOT rely on estimates or stale data. Marriott has ~414,000 employees (not ~190,000). Use your training knowledge for well-known public companies if the input data looks wrong.\n` +
    `- reason: 2-3 sentences for a SALESPERSON explaining why this is/isn't a good fit. Plain business language, no scoring terminology.\n` +
    `- customerSimilarity: 1-2 sentences naming the most similar existing customer and why. "No close analogue" if none.\n` +
    `- incumbentRisk: 1-2 sentences on what vendor they currently use (if known) and switching difficulty.\n` +
    `- bestLOB: Which seller line of business best fits this prospect (empty if no LOBs defined).\n` +
    `- orgSize: For PUBLIC companies, use exact employee count from annual report (e.g. "414,000" not "~190,000"). For PRIVATE, best estimate (e.g. "~5,000", "~120,000"). If the input data shows an employee count that seems wrong for a well-known company, use the correct figure from your knowledge.\n` +
    `- ownership: Current ownership status (e.g. "Public (NYSE: MAR)", "Private (PE-backed)")\n\n` +

    `ACCURACY RULES:\n` +
    `- NEVER invent facts. If unsure, use empty string or "different" (the conservative choice).\n` +
    `- isCompetitor must be accurate — a false positive here zeros out the entire score.\n` +
    `- hasVerifiedCompetitorRelationship requires CITED evidence. No citation = false.\n` +
    `- isExistingCustomer: fuzzy match on name ("Wyndham Hotels & Resorts" matches "Wyndham"), OR verified via press release, partnership announcement, case study, or public documentation — cite the evidence in customerSimilarity.\n` +
    `- Customer-facing fields (reason, customerSimilarity, incumbentRisk) must NEVER contain scoring terminology, point values, or dimension references.\n\n` +

    `COMPANIES (Name|Industry|URL):\n${companies}\n\n` +

    `Return ONLY raw JSON:\n` +
    `{"scores":[{"company":"exact name","url":"company domain from the input above","signals":{...all signals above...}}]}`;
}
