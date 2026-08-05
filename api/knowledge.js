// api/knowledge.js
//
// Serves sensitive knowledge layer data (scoring heuristics, framework
// injections, industry benchmarks) to authenticated clients only.
// This keeps proprietary IP out of the client JS bundle — it's fetched
// at runtime behind JWT auth, never baked into the build artifact.
//
// The client calls this once on login and caches the result in memory.
// If the call fails (guest mode, offline), the app falls back to
// minimal inline heuristics that don't expose exact numbers.

export const config = { maxDuration: 120 };

// Import from the same data modules the app uses
import { FIT_SCORING_RULES } from "../src/data/prompts/fitScoring.js";
import { ALL_NEGOTIATION_INJECTIONS, FISHER_URY_INJECTION, GRAHAM_INJECTION } from "../src/data/prompts/negotiationInjections.js";
import { BUYING_SIGNALS } from "../src/data/prompts/briefGeneration.js";
import { JOLT_EFFECT, CHALLENGER_FRAMEWORK } from "../src/data/negotiationFrameworks.js";
import { NAICS_CATEGORY_MAP, CPV_CATEGORY_MAP } from "../src/data/rfpSources.js";
import { ICP_KNOWLEDGE_INJECTION, DISCOVERY_KNOWLEDGE_INJECTION, MURPHY_RWAS, FOUR_FORCES, SPICED, WBD_SCORECARD, DUNFORD_POSITIONING, DISQUALIFICATION, FINTECH_ICP, ICP_FAILURE_MODES, FITZPATRICK_MOM_TEST, MOORE_CHASM, SIXSENSE_ABM, LAJA_CXL, DISCOVERY_QUESTION_BANK } from "../src/data/icpFitKnowledge.js";
import { VERTICAL_PLAYBOOKS } from "../src/data/verticalPlaybooks.js";
import { COMPETITIVE_INJECTION, DISCOVERY_SCORECARD_INJECTION, OFFER_FIT_INJECTION, BATTLE_CARD_FRAMEWORK, DISCOVERY_SCORECARD, OFFER_FIT_FRAMEWORK, REP_ONBOARDING, QBR_FRAMEWORK, SOLUTION_FIT_CARDS, PRICING_NEGOTIATION, ARCHETYPE_BATTLE_CARDS, POST_SALE_EXPANSION, SALES_METHODOLOGY_FRAMEWORKS } from "../src/data/advancedKnowledge.js";
import { PAYMENTS_INDUSTRY_INJECTION, PAYMENTS_SCORING_CONTEXT, PAYMENTS_DISCOVERY_INJECTION } from "../src/data/paymentsKnowledge.js";
import { COMPLIANCE_FRAMEWORKS, COMPLIANCE_VERTICAL_MAP, COMPLIANCE_DISCLAIMER, HANDOFF_PROTOCOL } from "../src/data/complianceKnowledge.js";
import { REAL_ESTATE_INDUSTRY_INJECTION, REAL_ESTATE_SCORING_CONTEXT, REAL_ESTATE_DISCOVERY_INJECTION } from "../src/data/realEstateKnowledge.js";
import { BANKING_INDUSTRY_INJECTION, BANKING_SCORING_CONTEXT, BANKING_DISCOVERY_INJECTION } from "../src/data/bankingKnowledge.js";
import { ACCOUNTING_FINANCE_INJECTION, ACCOUNTING_FINANCE_SCORING, ACCOUNTING_FINANCE_DISCOVERY } from "../src/data/accountingFinanceKnowledge.js";
import { HEALTHCARE_SAAS_INJECTION, HEALTHCARE_SAAS_SCORING, HEALTHCARE_SAAS_DISCOVERY } from "../src/data/healthcareSaasKnowledge.js";
import { AI_ML_INJECTION, AI_ML_SCORING, AI_ML_DISCOVERY } from "../src/data/aiMlKnowledge.js";
import { FINTECH_DEEP_INJECTION, FINTECH_DEEP_SCORING, FINTECH_DEEP_DISCOVERY } from "../src/data/fintechKnowledge.js";
import { REWARDS_INCENTIVES_INJECTION, REWARDS_INCENTIVES_SCORING, REWARDS_INCENTIVES_DISCOVERY } from "../src/data/rewardsIncentivesKnowledge.js";
import { B2B_SALES_INJECTION, B2B_SALES_DISCOVERY } from "../src/data/b2bSalesKnowledge.js";
import { OKR_KPI_INJECTION, OKR_KPI_DISCOVERY } from "../src/data/okrKpiKnowledge.js";
import { QSR_INJECTION, QSR_SCORING, QSR_DISCOVERY } from "../src/data/qsrKnowledge.js";
import { INVESTOR_INTELLIGENCE_INJECTION, INVESTOR_INTELLIGENCE_DISCOVERY } from "../src/data/investorIntelligenceKnowledge.js";
import { BAAS_INJECTION, BAAS_SCORING, BAAS_DISCOVERY } from "../src/data/baasKnowledge.js";
import { CHARITABLE_GIVING_INJECTION, CHARITABLE_GIVING_SCORING, CHARITABLE_GIVING_DISCOVERY } from "../src/data/charitableGivingKnowledge.js";
import { MEDICAL_PAYMENTS_INJECTION, MEDICAL_PAYMENTS_SCORING, MEDICAL_PAYMENTS_DISCOVERY } from "../src/data/medicalPaymentsKnowledge.js";
import { SMB_MIDMARKET_INJECTION, SMB_MIDMARKET_SCORING, SMB_MIDMARKET_DISCOVERY } from "../src/data/smbMidmarketKnowledge.js";
import { INSURANCE_INDUSTRY_INJECTION, INSURANCE_SCORING_CONTEXT, INSURANCE_DISCOVERY_INJECTION, INSURANCE_PLAYBOOK } from "../src/data/insuranceKnowledge.js";
import { EXECUTIVE_PERSPECTIVES_INJECTION, EXECUTIVE_PERSPECTIVES_SCORING, EXECUTIVE_PERSPECTIVES_DISCOVERY } from "../src/data/executivePerspectivesKnowledge.js";
import { APPROVAL_GATES_INJECTION, APPROVAL_GATES_DISCOVERY, APPROVAL_GATES_SCORING } from "../src/data/approvalGatesKnowledge.js";
import { RETAIL_INDUSTRY_INJECTION, RETAIL_SCORING_CONTEXT, RETAIL_DISCOVERY_INJECTION } from "../src/data/retailKnowledge.js";
import { PROFESSIONAL_SERVICES_INJECTION, PROFESSIONAL_SERVICES_SCORING, PROFESSIONAL_SERVICES_DISCOVERY } from "../src/data/professionalServicesKnowledge.js";
import { MANUFACTURING_INJECTION, MANUFACTURING_SCORING, MANUFACTURING_DISCOVERY } from "../src/data/manufacturingKnowledge.js";
import { PE_HOLDCO_INJECTION, PE_HOLDCO_DISCOVERY, PE_HOLDCO_SCORING } from "../src/data/peHoldcoKnowledge.js";
import { DIGITAL_INCENTIVES_PLATFORMS_INJECTION, DIGITAL_INCENTIVES_PLATFORMS_DISCOVERY, DIGITAL_INCENTIVES_PLATFORMS_SCORING } from "../src/data/digitalIncentivesPlatformsKnowledge.js";
import { CANNABIS_PLAYBOOK } from "../src/data/cannabisKnowledge.js";
import { CRYPTO_STABLECOIN_PLAYBOOK } from "../src/data/cryptoStablecoinKnowledge.js";
import { GAMING_PLAYBOOK } from "../src/data/gamingKnowledge.js";
import { PREDICTION_MARKETS_PLAYBOOK } from "../src/data/predictionMarketsKnowledge.js";
import { CYBERSECURITY_INJECTION, CYBERSECURITY_SCORING, CYBERSECURITY_DISCOVERY } from "../src/data/cybersecurityKnowledge.js";
import { EDUCATION_INJECTION, EDUCATION_SCORING, EDUCATION_DISCOVERY } from "../src/data/educationKnowledge.js";
import { ENERGY_INJECTION, ENERGY_SCORING, ENERGY_DISCOVERY } from "../src/data/energyKnowledge.js";
import { HR_TECH_INJECTION, HR_TECH_SCORING, HR_TECH_DISCOVERY } from "../src/data/hrTechKnowledge.js";
import { GOVERNMENT_INJECTION, GOVERNMENT_SCORING, GOVERNMENT_DISCOVERY } from "../src/data/governmentKnowledge.js";
import { RFP_PROCUREMENT_INJECTION, RFP_SIGNAL_SCORING, RFP_SOURCE_TIERS, RFP_SEARCH_GUIDANCE } from "../src/data/rfpProcurementKnowledge.js";
import { PRE_RFP_SIGNAL_INJECTION, PRE_RFP_INTENT_KEYWORDS, PRE_RFP_SCORING_RUBRIC } from "../src/data/preRfpSignalKnowledge.js";
import { DISPLACEMENT_INJECTION, DISPLACEMENT_DISCOVERY } from "../src/data/displacementKnowledge.js";

import { checkRateLimit, isAllowedOrigin, checkGuestLimit, incrementGuestUsage, verifyJwt } from "./_guard.js";

export default async function handler(req, res) {
  if (req.method !== "GET") { res.status(405).end(); return; }

  // Origin check — only allow requests from known domains
  const origin = req.headers.origin || req.headers.referer || "";
  if (!isAllowedOrigin(origin)) {
    res.status(403).json({ error: "origin not allowed" });
    return;
  }

  // Rate limiting
  const xff = req.headers["x-forwarded-for"];
  const ip = req.headers["x-vercel-forwarded-for"]?.split(",")[0]?.trim()
           || (xff ? xff.split(",").pop().trim() : "")
           || req.headers["x-real-ip"]
           || req.socket?.remoteAddress || "unknown";
  if (!checkRateLimit(ip)) {
    res.status(429).json({ error: "rate limit exceeded" });
    return;
  }

  if (!await verifyJwt(req)) {
    res.status(401).json({ error: "authentication required" });
    return;
  }

  // Plan-based gating — look up user's org plan to determine knowledge tier
  let userPlan = "trial"; // default to trial (minimal knowledge)
  if (!req._isGuest) {
    try {
      const authToken = (req.headers.authorization || "").slice(7);
      const parts = authToken.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
        const userId = payload?.sub;
        if (userId) {
          const SB_URL = process.env.VITE_SUPABASE_URL;
          const SB_SVC = process.env.SUPABASE_SERVICE_KEY;
          if (SB_URL && SB_SVC) {
            const r = await fetch(`${SB_URL}/rest/v1/users?id=eq.${userId}&select=org_id`, {
              headers: { apikey: SB_SVC, Authorization: `Bearer ${SB_SVC}` },
            });
            const users = await r.json();
            const orgId = users?.[0]?.org_id;
            if (orgId) {
              const orgR = await fetch(`${SB_URL}/rest/v1/orgs?id=eq.${orgId}&select=plan`, {
                headers: { apikey: SB_SVC, Authorization: `Bearer ${SB_SVC}` },
              });
              const orgs = await orgR.json();
              userPlan = orgs?.[0]?.plan || "trial";
            }
          }
        }
      }
    } catch {} // fail open to trial tier — they get minimal knowledge, not nothing
  }

  // Guest limit — guests share the 3-call limit with Claude endpoints
  if (req._isGuest) {
    if (!checkGuestLimit(ip)) {
      return res.status(402).json({
        error: { type: "guest_limit_exceeded", message: "You've used your free tokens. Create a free account to continue." },
        guest_remaining: 0,
      });
    }
    incrementGuestUsage(ip);
  }

  // Cache for 5 minutes — short TTL so plan upgrades (trial→paid) take
  // effect quickly. Knowledge tier is plan-dependent; a 1-hour cache meant
  // upgraders could see stale trial-tier layers for up to an hour.
  res.setHeader("Cache-Control", "private, max-age=300");

  // ── Guest mode: return minimal stubs ──────────────────────────────────
  // Guests get just enough for the app to render without crashing, but
  // NO proprietary scoring rules, industry averages, framework injections,
  // negotiation playbooks, vertical heuristics, or battle cards.
  if (req._isGuest) {
    return res.status(200).json({
      _guest: true,
      fitScoringRules: {
        highFriction: { industries: [] },
        highFit: { industries: [] },
        stageThresholds: [],
        signals: { positive: [], negative: [] },
      },
      negotiations: "",
      fisherUry: "",
      graham: "",
      buyingSignals: { positive: [], negative: [] },
      joltEffect: { description: "", steps: [] },
      challenger: { teachingAngle: "", mobilizer: { definition: "", identify: "", notMobilizers: [] } },
      naicsCodes: {},
      cpvCodes: {},
      icpKnowledge: "",
      discoveryKnowledge: "",
      verticalPlaybooks: {},
      competitiveInjection: "",
      discoveryScorecardInjection: "",
      offerFitInjection: "",
    });
  }

  // ── Authenticated: knowledge tier based on plan ────────────────────────
  // Trial/free users get core frameworks only (ICP, B2B sales, basic scoring).
  // Paid users get everything including vertical knowledge, compliance, battle cards.
  const isPaid = userPlan === "paid" || userPlan === "enterprise" || userPlan === "promo";

  res.status(200).json({
    _plan: userPlan,
    fitScoringRules: FIT_SCORING_RULES,
    negotiations: ALL_NEGOTIATION_INJECTIONS,
    fisherUry: FISHER_URY_INJECTION,
    graham: GRAHAM_INJECTION,
    buyingSignals: BUYING_SIGNALS,
    joltEffect: {
      description: JOLT_EFFECT.description,
      steps: JOLT_EFFECT.steps,
    },
    challenger: {
      teachingAngle: CHALLENGER_FRAMEWORK.teachingAngle,
      mobilizer: CHALLENGER_FRAMEWORK.mobilizer,
    },
    naicsCodes: NAICS_CATEGORY_MAP,
    cpvCodes: CPV_CATEGORY_MAP,
    icpKnowledge: ICP_KNOWLEDGE_INJECTION,
    discoveryKnowledge: DISCOVERY_KNOWLEDGE_INJECTION,
    murphyRWAS: MURPHY_RWAS,
    fourForces: FOUR_FORCES,
    spiced: SPICED,
    wbdScorecard: WBD_SCORECARD,
    dunfordPositioning: DUNFORD_POSITIONING,
    disqualification: DISQUALIFICATION,
    fintechICP: FINTECH_ICP,
    icpFailureModes: ICP_FAILURE_MODES,
    verticalPlaybooks: VERTICAL_PLAYBOOKS,
    competitiveInjection: COMPETITIVE_INJECTION,
    discoveryScorecardInjection: DISCOVERY_SCORECARD_INJECTION,
    offerFitInjection: OFFER_FIT_INJECTION,
    battleCardFramework: BATTLE_CARD_FRAMEWORK,
    discoveryScorecard: DISCOVERY_SCORECARD,
    offerFitFramework: OFFER_FIT_FRAMEWORK,
    repOnboarding: REP_ONBOARDING,
    qbrFramework: QBR_FRAMEWORK,
    // ── PAID-ONLY: Vertical knowledge layers, compliance, battle cards ──
    // Trial users get core frameworks above. Vertical depth is the premium.
    ...(isPaid ? {
      // Advanced frameworks (paid only)
      pricingNegotiation: PRICING_NEGOTIATION,
      archetypeBattleCards: ARCHETYPE_BATTLE_CARDS,
      postSaleExpansion: POST_SALE_EXPANSION,
      solutionFitCards: SOLUTION_FIT_CARDS,
      // Payments deep knowledge layer
      paymentsIndustry: PAYMENTS_INDUSTRY_INJECTION,
      paymentsScoring: PAYMENTS_SCORING_CONTEXT,
      paymentsDiscovery: PAYMENTS_DISCOVERY_INJECTION,
      // Compliance awareness layer (13 frameworks × 4 verticals)
      complianceFrameworks: COMPLIANCE_FRAMEWORKS,
      complianceVerticalMap: COMPLIANCE_VERTICAL_MAP,
      complianceDisclaimer: COMPLIANCE_DISCLAIMER,
      complianceHandoff: HANDOFF_PROTOCOL,
      // Real estate & land development knowledge layer
      realEstateIndustry: REAL_ESTATE_INDUSTRY_INJECTION,
      realEstateScoring: REAL_ESTATE_SCORING_CONTEXT,
      realEstateDiscovery: REAL_ESTATE_DISCOVERY_INJECTION,
      // Banking & capital markets knowledge layer
      bankingIndustry: BANKING_INDUSTRY_INJECTION,
      bankingScoring: BANKING_SCORING_CONTEXT,
      bankingDiscovery: BANKING_DISCOVERY_INJECTION,
      // Accounting & financial management (cross-cutting)
      accountingFinance: ACCOUNTING_FINANCE_INJECTION,
      accountingFinanceScoring: ACCOUNTING_FINANCE_SCORING,
      accountingFinanceDiscovery: ACCOUNTING_FINANCE_DISCOVERY,
      // Healthcare SaaS deep knowledge
      healthcareSaas: HEALTHCARE_SAAS_INJECTION,
      healthcareSaasScoring: HEALTHCARE_SAAS_SCORING,
      healthcareSaasDiscovery: HEALTHCARE_SAAS_DISCOVERY,
      // AI/ML deep knowledge
      aiMl: AI_ML_INJECTION,
      aiMlScoring: AI_ML_SCORING,
      aiMlDiscovery: AI_ML_DISCOVERY,
      // Fintech deep knowledge
      fintechDeep: FINTECH_DEEP_INJECTION,
      fintechDeepScoring: FINTECH_DEEP_SCORING,
      fintechDeepDiscovery: FINTECH_DEEP_DISCOVERY,
      // Rewards & incentives deep knowledge (Cambrian's core domain)
      rewardsIncentives: REWARDS_INCENTIVES_INJECTION,
      rewardsIncentivesScoring: REWARDS_INCENTIVES_SCORING,
      rewardsIncentivesDiscovery: REWARDS_INCENTIVES_DISCOVERY,
      // QSR / restaurants
      qsr: QSR_INJECTION,
      qsrScoring: QSR_SCORING,
      qsrDiscovery: QSR_DISCOVERY,
      // Investor intelligence (cross-cutting)
      investorIntelligence: INVESTOR_INTELLIGENCE_INJECTION,
      investorIntelligenceDiscovery: INVESTOR_INTELLIGENCE_DISCOVERY,
      // BaaS / sponsor banking / embedded banking
      baas: BAAS_INJECTION,
      baasScoring: BAAS_SCORING,
      baasDiscovery: BAAS_DISCOVERY,
      // Charitable giving / DAFs / charity gift cards
      charitableGiving: CHARITABLE_GIVING_INJECTION,
      charitableGivingScoring: CHARITABLE_GIVING_SCORING,
      charitableGivingDiscovery: CHARITABLE_GIVING_DISCOVERY,
      // Medical & healthcare payments
      medicalPayments: MEDICAL_PAYMENTS_INJECTION,
      medicalPaymentsScoring: MEDICAL_PAYMENTS_SCORING,
      medicalPaymentsDiscovery: MEDICAL_PAYMENTS_DISCOVERY,
      // SMB & mid-market cross-cutting intelligence
      smbMidmarket: SMB_MIDMARKET_INJECTION,
      smbMidmarketScoring: SMB_MIDMARKET_SCORING,
      smbMidmarketDiscovery: SMB_MIDMARKET_DISCOVERY,
      // Insurance industry (carriers, MGAs, brokers, reinsurers, insurtech)
      insuranceIndustry: INSURANCE_INDUSTRY_INJECTION,
      insuranceScoring: INSURANCE_SCORING_CONTEXT,
      insuranceDiscovery: INSURANCE_DISCOVERY_INJECTION,
      insurancePlaybook: INSURANCE_PLAYBOOK,
      // Executive Perspectives — role-keyed C-suite intelligence
      executivePerspectives: EXECUTIVE_PERSPECTIVES_INJECTION,
      executivePerspectivesScoring: EXECUTIVE_PERSPECTIVES_SCORING,
      executivePerspectivesDiscovery: EXECUTIVE_PERSPECTIVES_DISCOVERY,
      // Approval Gates — steering committees, deal desk, procurement, gate mapping
      approvalGates: APPROVAL_GATES_INJECTION,
      approvalGatesDiscovery: APPROVAL_GATES_DISCOVERY,
      approvalGatesScoring: APPROVAL_GATES_SCORING,
      // Retail & E-commerce
      retailIndustry: RETAIL_INDUSTRY_INJECTION,
      retailScoring: RETAIL_SCORING_CONTEXT,
      retailDiscovery: RETAIL_DISCOVERY_INJECTION,
      // Professional Services
      professionalServices: PROFESSIONAL_SERVICES_INJECTION,
      professionalServicesScoring: PROFESSIONAL_SERVICES_SCORING,
      professionalServicesDiscovery: PROFESSIONAL_SERVICES_DISCOVERY,
      // Manufacturing
      manufacturing: MANUFACTURING_INJECTION,
      manufacturingScoring: MANUFACTURING_SCORING,
      manufacturingDiscovery: MANUFACTURING_DISCOVERY,
      // PE-Backed Holding Company & Post-Merger Commercial Integration
      peHoldco: PE_HOLDCO_INJECTION,
      peHoldcoScoring: PE_HOLDCO_SCORING,
      peHoldcoDiscovery: PE_HOLDCO_DISCOVERY,
      // Digital Incentives Platforms (deep market/economics layer)
      digitalIncentivesPlatforms: DIGITAL_INCENTIVES_PLATFORMS_INJECTION,
      digitalIncentivesPlatformsScoring: DIGITAL_INCENTIVES_PLATFORMS_SCORING,
      digitalIncentivesPlatformsDiscovery: DIGITAL_INCENTIVES_PLATFORMS_DISCOVERY,
      // High-risk / regulated industry verticals
      cannabisPlaybook: CANNABIS_PLAYBOOK,
      cryptoStablecoinPlaybook: CRYPTO_STABLECOIN_PLAYBOOK,
      gamingPlaybook: GAMING_PLAYBOOK,
      predictionMarketsPlaybook: PREDICTION_MARKETS_PLAYBOOK,
      // Cybersecurity & information security
      cybersecurity: CYBERSECURITY_INJECTION,
      cybersecurityScoring: CYBERSECURITY_SCORING,
      cybersecurityDiscovery: CYBERSECURITY_DISCOVERY,
      // Education technology & institutional learning
      education: EDUCATION_INJECTION,
      educationScoring: EDUCATION_SCORING,
      educationDiscovery: EDUCATION_DISCOVERY,
      // Energy & Utilities
      energy: ENERGY_INJECTION,
      energyScoring: ENERGY_SCORING,
      energyDiscovery: ENERGY_DISCOVERY,
      // HR Technology & Workforce Management
      hrTech: HR_TECH_INJECTION,
      hrTechScoring: HR_TECH_SCORING,
      hrTechDiscovery: HR_TECH_DISCOVERY,
      // Government & Public Sector
      government: GOVERNMENT_INJECTION,
      governmentScoring: GOVERNMENT_SCORING,
      governmentDiscovery: GOVERNMENT_DISCOVERY,
      // RFP & Procurement Intelligence (cross-cutting)
      rfpProcurement: RFP_PROCUREMENT_INJECTION,
      rfpSignalScoring: RFP_SIGNAL_SCORING,
      rfpSourceTiers: RFP_SOURCE_TIERS,
      rfpSearchGuidance: RFP_SEARCH_GUIDANCE,
      // Pre-RFP Signal Extraction Intelligence
      preRfpSignal: PRE_RFP_SIGNAL_INJECTION,
      preRfpIntentKeywords: PRE_RFP_INTENT_KEYWORDS,
      preRfpScoringRubric: PRE_RFP_SCORING_RUBRIC,
    } : {}),
    // Displacement playbook
    displacementInjection: DISPLACEMENT_INJECTION,
    displacementDiscovery: DISPLACEMENT_DISCOVERY,
    // Frameworks available to all tiers (trial + paid)
    b2bSales: B2B_SALES_INJECTION,
    b2bSalesDiscovery: B2B_SALES_DISCOVERY,
    okrKpi: OKR_KPI_INJECTION,
    okrKpiDiscovery: OKR_KPI_DISCOVERY,
    fitzpatrickMomTest: FITZPATRICK_MOM_TEST,
    mooreChasm: MOORE_CHASM,
    sixsenseAbm: SIXSENSE_ABM,
    lajaCxl: LAJA_CXL,
    discoveryQuestionBank: DISCOVERY_QUESTION_BANK,
    salesMethodologyFrameworks: SALES_METHODOLOGY_FRAMEWORKS,
  });
}
