// src/data/complianceKnowledge.js
//
// Version: 2.0.0
// Last verified: 2026-05-21
// Next review: 2026-08-21 (quarterly)
//
// Compliance LANDSCAPE awareness for sales enablement. NOT legal advice.
// Cambrian Catalyst does NOT provide compliance services — we help sellers
// understand the regulatory landscape their buyers operate in.
// Covers: GRC, SOC 2, ISO 27001, HIPAA, PCI DSS, GDPR, CCPA, FedRAMP,
// CMMC, and the compliance-as-sales-enabler dynamic.
// 13 frameworks across 4 verticals with discovery questions, talking
// points, objection handling, trigger phrases, and handoff protocols.
//
// SOURCES:
// - Gartner GRC Market Guide 2025
// - Forrester Wave: GRC Platforms Q2 2025
// - IDC Worldwide Security and Vulnerability Management Forecast 2025
// - AICPA SOC 2 Trust Services Criteria
// - NIST Cybersecurity Framework 2.0 (2024)
// - ISO/IEC 27001:2022
// - HHS HIPAA Enforcement Data (Q1 2026)
// - PCI SSC PCI DSS v4.0.1 (effective March 2025)
// - EU GDPR enforcement tracker (DPA decisions through Q1 2026)
// - IAPP State Privacy Law Tracker (15+ states as of May 2026)
// - FedRAMP Authorization Status (GSA, May 2026)
// - CMMC 2.0 Final Rule (effective December 2024)
// - Cambrian operator knowledge (compliance as sales enabler)
//
// Served via /api/knowledge.js (JWT-auth'd, not in client bundle).
// Source: compliance-knowledge-layer.json (schema v1.0.0)

// JSON import — static `with { type: "json" }` so every consumer can see it:
// Node ESM on Vercel (20.10+/22) supports the attribute natively, and esbuild
// inlines the JSON into the Lambda knowledge bundle (issue #87). The previous
// createRequire() form defeated esbuild's static analysis — the bundle
// shipped a runtime require() for a file that wasn't in the zip, crashing
// the knowledge Lambda at init.
import data from "./compliance-knowledge-layer.json" with { type: "json" };

// ── Framework lookups ───────────────────────────────────────────────────

export const getFrameworkById = (id) =>
  data.frameworks.find(f => f.id === id);

export const getFrameworksForVertical = (verticalId, tier = null) => {
  const v = data.vertical_map[verticalId];
  if (!v) return [];
  const ids = tier === "primary" ? v.primary_frameworks
    : tier === "secondary" ? v.secondary_frameworks
    : tier === "adjacent" ? (v.adjacent_frameworks || [])
    : [...v.primary_frameworks, ...v.secondary_frameworks, ...(v.adjacent_frameworks || [])];
  return ids.map(getFrameworkById).filter(Boolean);
};

// ── Trigger phrase detection ────────────────────────────────────────────
// Scans free text (discovery notes, prospect descriptions) for compliance
// trigger phrases and returns matching frameworks.

export const detectFrameworksFromText = (text) => {
  if (!text) return [];
  const matches = new Set();
  const low = text.toLowerCase();
  data.frameworks.forEach(f => {
    (f.trigger_phrases || []).forEach(phrase => {
      if (low.includes(phrase.toLowerCase())) matches.add(f.id);
    });
  });
  return Array.from(matches).map(getFrameworkById).filter(Boolean);
};

// ── Vertical compliance map ─────────────────────────────────────────────

export const COMPLIANCE_VERTICAL_MAP = data.vertical_map;

// ── Handoff protocol ────────────────────────────────────────────────────

export const HANDOFF_PROTOCOL = data.handoff_protocol;

// ── Prompt injection builder ────────────────────────────────────────────
// Builds a compliance context string for injection into scoring, brief,
// hypothesis, and discovery prompts. Matches frameworks based on the
// seller's vertical and the target's industry.

const VERTICAL_KEYWORDS = {
  fintech_payments: ["fintech", "payment", "banking", "financial", "lending", "neobank", "processor", "acquiring", "interchange", "payfac", "iso ", "card program"],
  digital_rewards_incentives: ["incentive", "reward", "gift card", "recognition", "promo", "loyalty", "merchandise", "stored-value"],
  health_wellness_b2b: ["health", "wellness", "clinical", "hipaa", "healthcare", "medical", "patient", "pharma", "biotech", "telehealth"],
  market_research: ["research", "survey", "panel", "respondent", "insights", "analytics"],
};

export function buildComplianceInjection(sellerICP, targetIndustry) {
  const text = [
    sellerICP?.marketCategory,
    sellerICP?.sellerDescription,
    ...(sellerICP?.icp?.industries || []),
    targetIndustry,
  ].filter(Boolean).join(" ").toLowerCase();
  if (!text) return "";

  // Find matching verticals
  const matchedVerticals = [];
  for (const [vId, keywords] of Object.entries(VERTICAL_KEYWORDS)) {
    const hits = keywords.filter(kw => text.includes(kw));
    if (hits.length >= 1) matchedVerticals.push(vId);
  }
  if (!matchedVerticals.length) return "";

  // Collect unique primary frameworks from matched verticals
  const seen = new Set();
  const frameworks = [];
  for (const vId of matchedVerticals) {
    const primary = getFrameworksForVertical(vId, "primary");
    for (const f of primary) {
      if (!seen.has(f.id)) {
        seen.add(f.id);
        frameworks.push(f);
      }
    }
  }
  if (!frameworks.length) return "";

  // Build compact injection (keep under ~500 tokens for prompt efficiency)
  const parts = ["\nCOMPLIANCE LANDSCAPE AWARENESS (Cambrian Catalyst does NOT provide compliance services — we help sellers understand the regulatory landscape their buyers operate in):"];
  for (const f of frameworks.slice(0, 5)) {
    parts.push(`- ${f.name}: ${f.talking_points.what_reps_should_know.split(".").slice(0, 2).join(".")}.`);
  }
  parts.push("IMPORTANT: Cambrian Catalyst is a GTM consultancy, not a compliance provider. We help sellers understand and navigate compliance topics in sales conversations — not implement, audit, or certify compliance programs. Always escalate to the prospect's compliance team or qualified counsel.");
  return parts.join("\n") + "\n";
}

// ── Compliance discovery questions ──────────────────────────────────────
// Returns relevant discovery questions for frameworks matching the context.

export function getComplianceDiscoveryQuestions(sellerICP, targetIndustry) {
  const text = [
    sellerICP?.marketCategory,
    sellerICP?.sellerDescription,
    ...(sellerICP?.icp?.industries || []),
    targetIndustry,
  ].filter(Boolean).join(" ").toLowerCase();
  if (!text) return "";

  const matchedVerticals = [];
  for (const [vId, keywords] of Object.entries(VERTICAL_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) matchedVerticals.push(vId);
  }
  if (!matchedVerticals.length) return "";

  const seen = new Set();
  const questions = [];
  for (const vId of matchedVerticals) {
    const primary = getFrameworksForVertical(vId, "primary");
    for (const f of primary) {
      if (!seen.has(f.id) && f.discovery_questions?.length) {
        seen.add(f.id);
        questions.push(`${f.name}: ${f.discovery_questions[0]}`);
      }
    }
  }
  if (!questions.length) return "";
  return `\nCOMPLIANCE DISCOVERY (ask when relevant):\n${questions.slice(0, 4).map(q => `- ${q}`).join("\n")}\n`;
}

// ── Full data export for knowledge API ──────────────────────────────────
export const COMPLIANCE_FRAMEWORKS = data.frameworks;
export const COMPLIANCE_DISCLAIMER = data.disclaimer;

// ── Expanded compliance knowledge layer injection ───────────────────────
// Full 12-section knowledge layer for compliance/GRC as a sales-relevant
// vertical. Follows gold-standard format (cannabis/gaming).

export const COMPLIANCE_INJECTION = `
---
title: "Compliance & GRC — Knowledge Layer"
type: vertical_layer
parent: cambrian_catalyst_knowledge_layer
sister_layers:
  - cambrian_b2b_sales_knowledge.md
  - cambrian_smb_midmarket_knowledge.md
  - cambrian_investor_intelligence.md
  - cambrian_approval_gates_knowledge_layer.md
tags: [GRC, SOC-2, ISO-27001, HIPAA, PCI-DSS, GDPR, CCPA, FedRAMP, CMMC, compliance, audit, certification, procurement-gate, security-questionnaire]
last_updated: 2026-05-21
status: production
confidence: high (AICPA, NIST, HHS, PCI SSC, GDPR DPA tracker, FedRAMP GSA, CMMC Final Rule, Gartner, Forrester, Cambrian operator knowledge)
---

# Compliance & GRC — Knowledge Layer

> **Working thesis.** Compliance is not a cost center — it is a sales enabler. In B2B SaaS, the presence or absence of SOC 2, HIPAA, FedRAMP, or ISO 27001 certification determines whether a vendor can enter an enterprise procurement process at all. The $15B+ GRC (Governance, Risk, and Compliance) market [verified 05/2026, Gartner / Grand View Research] exists because compliance certifications have become the procurement gates that control access to the largest, most profitable customer segments. For Cambrian's seller-users, understanding compliance means understanding which doors are open and which are locked — and whether the prospect has the certifications that their buyers demand or is losing deals because they don't.

> **What makes this vertical distinct as a sales target.** Compliance has a unique buying dynamic: the purchase is driven by a deadline, an audit finding, or a lost deal — not by aspiration. Nobody buys GRC software because they want to; they buy it because they must. This makes compliance purchasing the most predictable and deadline-driven B2B buying motion. Audit cycles, certification renewal dates, regulatory effective dates, and lost-deal-to-compliance events are the trigger calendar. Sellers who align their outreach to these cycles convert at 2-3x the rate of evergreen outreach.

---

## Table of Contents

1. [Snapshot and market sizing](#1-snapshot-and-market-sizing)
2. [What makes this distinct as a sales target](#2-what-makes-this-distinct-as-a-sales-target)
3. [Sub-categorization](#3-sub-categorization)
4. [Major companies](#4-major-companies)
5. [Regulatory overlay](#5-regulatory-overlay)
6. [Technology stack](#6-technology-stack)
7. [ICP patterns](#7-icp-patterns)
8. [Buying committee](#8-buying-committee)
9. [Trigger events](#9-trigger-events)
10. [Common failure modes](#10-common-failure-modes)
11. [GTM implications](#11-gtm-implications)
12. [Cross-references](#12-cross-references)

---

## 1. Snapshot and market sizing

| Metric | Value |
|---|---|
| Global GRC market (2025) | ~$15.2B [verified 05/2026, Gartner GRC Market Guide 2025] |
| GRC market CAGR (2025-2030) | 13-15% [verified 05/2026, Grand View Research / Gartner] |
| Compliance automation (SOC 2/ISO tooling) | ~$2.8B sub-segment, growing 25%+ [verified 05/2026, Forrester] |
| Privacy management platforms | ~$2.1B [verified 05/2026, IAPP / Gartner] |
| Vulnerability management | ~$18B [verified 05/2026, IDC Worldwide Security and Vulnerability Management Forecast 2025] |
| FedRAMP authorized products | 370+ [verified 05/2026, FedRAMP Marketplace, GSA May 2026] |
| CMMC certified organizations (as of May 2026) | Early certifications underway; ~80,000 DIB companies will need certification [verified 05/2026, DoD CMMC Final Rule] |
| GDPR fines issued (cumulative through Q1 2026) | EUR 4.5B+ [verified 05/2026, GDPR Enforcement Tracker] |
| U.S. states with comprehensive privacy laws | 15+ (CA, VA, CO, CT, UT, TX, OR, MT, DE, NJ, NH, IA, TN, IN, FL) [verified 05/2026, IAPP State Privacy Law Tracker] |
| Average cost of SOC 2 Type II first audit | $50K-$200K (audit fees + tooling + remediation) [verified 05/2026, Cambrian operator knowledge / Vanta / Drata pricing data] |
| Average time to SOC 2 readiness (from scratch) | 3-9 months with automation; 6-18 months without [verified 05/2026, Vanta / Drata benchmark data] |

### Headline dynamics (use these in conversation)

- **SOC 2 is the new table stakes.** Enterprise procurement increasingly requires SOC 2 Type II before vendors can enter evaluation. What was optional in 2020 is mandatory in 2026 for any SaaS selling to mid-market or enterprise [verified 05/2026, Cambrian operator knowledge]
- **Compliance automation collapsed the timeline.** Vanta, Drata, and Secureframe reduced SOC 2 readiness from 12+ months to 3-6 months by automating evidence collection, policy generation, and auditor workflow [verified 05/2026, Vanta / Drata / Secureframe company data]
- **Privacy regulation is expanding state-by-state in the U.S.** 15+ states now have comprehensive privacy laws modeled on CCPA/GDPR. Every SaaS company selling nationally must track multi-state privacy compliance [verified 05/2026, IAPP State Privacy Law Tracker]
- **CMMC 2.0 is the next compliance wave.** The DoD CMMC Final Rule (effective December 2024) requires cybersecurity certification for ~80,000 Defense Industrial Base companies. This creates a massive new compliance spending cohort [verified 05/2026, DoD CMMC 2.0 Final Rule]
- **Compliance-as-a-Service is the dominant delivery model.** Buyers don't want to hire a compliance team; they want a platform that manages compliance for them with minimal internal resource commitment [verified 05/2026, Forrester Wave: GRC Platforms Q2 2025]

---

## 2. What makes this distinct as a sales target

Three dynamics shape every compliance-related sale:

**1. Compliance is deadline-driven, not aspiration-driven.** A company starts a SOC 2 program because they lost a $500K deal to a competitor who had it, because a customer required it in a vendor security questionnaire, or because their PE sponsor mandated it within 12 months of acquisition. The buying trigger is pain — a lost deal, an audit finding, a regulatory deadline — not a strategic vision. This makes compliance the most qualification-friendly B2B category: if the trigger exists, the deal is real.

**2. Certification is binary — you have it or you don't.** Unlike most B2B purchases where value is subjective, compliance certifications create a binary gate. Either the vendor has SOC 2 and can proceed in procurement, or they don't and are disqualified. This binary nature makes compliance the highest-stakes B2B purchasing decision for SaaS companies: the certification itself generates revenue by unlocking deals that were previously inaccessible.

**3. The audit cycle creates a recurring buying window.** SOC 2 audits are annual. ISO 27001 surveillance audits are annual. PCI DSS assessments are annual. HIPAA risk assessments are periodic. Each audit cycle creates a renewal decision — continue with the current tooling or switch. The audit cycle is the most predictable buying calendar in B2B.

---

## 3. Sub-categorization

The "compliance" market is actually 6 adjacent categories with different buyers, urgency profiles, and competitive dynamics:

| Sub-category | What it covers | Key frameworks | Buyer profile |
|---|---|---|---|
| **Security attestation / audit automation** | SOC 2, ISO 27001 readiness and audit management | SOC 2 Type II, ISO 27001:2022 | CISO, Head of Compliance, VP Engineering at SaaS companies |
| **Privacy management** | Data mapping, consent management, DSAR processing, privacy impact assessments | GDPR, CCPA, state privacy laws | DPO, Chief Privacy Officer, Legal |
| **Healthcare compliance** | Protected health information (PHI) safeguards, audit logging, business associate agreements | HIPAA, HITECH | CISO, Compliance Officer at healthcare organizations and vendors selling to healthcare |
| **Payment card security** | Cardholder data environment (CDE) protection, merchant and service provider validation | PCI DSS v4.0.1 | InfoSec, Payment Operations, Compliance at any company processing card payments |
| **Government / defense** | Federal cybersecurity standards for government contractors and cloud providers | FedRAMP, CMMC 2.0, NIST 800-171 | CISO, Government Contracts lead at companies selling to federal agencies or DoD |
| **Enterprise GRC platform** | Integrated risk management, policy management, third-party risk, audit management | Cross-framework | CISO, CRO (Chief Risk Officer), Internal Audit at large enterprises |

### The "compliance stack" vs. "compliance platform" debate

Two competing models:
- **Point solution stack:** Vanta for SOC 2 + OneTrust for privacy + Qualys for vulnerability scanning + custom for HIPAA = 4 vendors, deep capability in each domain, integration complexity
- **Unified GRC platform:** ServiceNow GRC or Archer for everything = one vendor, broader but shallower, enterprise-grade but expensive

The market is trending toward point solutions for SMB/mid-market (Vanta, Drata) and unified platforms for enterprise (ServiceNow, Archer). The mid-market gap is where the most competitive friction exists.

---

## 4. Major companies

### Compliance automation (SOC 2, ISO 27001, HIPAA, PCI DSS)

| Company | Position | Key facts |
|---|---|---|
| **Vanta** | Market leader in compliance automation | $2.5B+ valuation; 7,000+ customers; SOC 2, ISO 27001, HIPAA, PCI DSS, GDPR, SOX; "trust management platform" positioning; raised $150M Series C (2023) [verified 05/2026, Vanta company data / Crunchbase] |
| **Drata** | Close competitor to Vanta | $1.5B+ valuation; 5,000+ customers; continuous compliance monitoring; strong integration ecosystem; acquired Trustero for AI-powered questionnaire automation [verified 05/2026, Drata company data / Crunchbase] |
| **Secureframe** | Third major compliance automation player | SOC 2, ISO 27001, HIPAA, PCI DSS, GDPR; AI-powered policy generation; strong SMB adoption [verified 05/2026, Secureframe company data] |
| **Sprinto** | Growing challenger (India-origin) | Lower price point; strong in startups and SMB; SOC 2, ISO 27001, GDPR [verified 05/2026, Sprinto company data] |
| **Thoropass** (formerly Laika) | Audit-first approach | Combined platform + managed audit services; "compliance-as-a-service" model [verified 05/2026, Thoropass company data] |

### Privacy management

| Company | Position | Key facts |
|---|---|---|
| **OneTrust** | Dominant privacy platform | $4.5B valuation (down from $5.3B); 14,000+ customers; privacy, security, third-party risk; the enterprise standard [verified 05/2026, OneTrust company data / Forbes] |
| **TrustArc** | Enterprise privacy management | Long-established; privacy program management, assessments, certifications; now owned by Everest Group analysis scope [verified 05/2026, TrustArc company data] |
| **BigID** | Data intelligence + privacy | Data discovery, classification, and privacy; AI-powered data mapping; strong in regulated industries [verified 05/2026, BigID company data] |
| **Transcend** | Developer-first privacy infrastructure | Data mapping, consent, DSARs via infrastructure-layer approach; targets engineering teams [verified 05/2026, Transcend company data] |
| **Osano** | SMB-focused privacy platform | Consent management, vendor monitoring, DSAR processing; simpler and cheaper than OneTrust [verified 05/2026, Osano company data] |

### Vulnerability management and security operations

| Company | Position | Key facts |
|---|---|---|
| **Qualys** | Cloud-based vulnerability management pioneer | $1.9B+ market cap; 10,000+ customers; VMDR platform; long track record [verified 05/2026, Qualys 10-K 2025] |
| **Tenable** | Exposure management leader | $5B+ market cap; Nessus heritage; expanding from VM to full exposure management; 40K+ customers [verified 05/2026, Tenable 10-K 2025] |
| **CrowdStrike** | Endpoint + cloud security leader | $75B+ market cap; Falcon platform; dominant in endpoint detection and response (EDR); expanding into compliance via Falcon Compliance [verified 05/2026, CrowdStrike 10-K FY2025] |
| **Rapid7** | Unified security operations | MDR + VM + SIEM; InsightConnect SOAR; 11,000+ customers; acquired by Thoma Bravo rumored [verified 05/2026, Rapid7 10-K 2025] |
| **Wiz** | Cloud security leader | $12B+ valuation; CNAPP (Cloud-Native Application Protection Platform); fastest-growing security company; rejected Google's $23B acquisition offer (2024) [verified 05/2026, Wiz company data / Bloomberg] |

### Enterprise GRC platforms

| Company | Position | Key facts |
|---|---|---|
| **ServiceNow GRC** | Enterprise GRC within the ServiceNow platform | Integrated with IT service management; strong in large enterprises already using ServiceNow [verified 05/2026, ServiceNow company data] |
| **Archer (RSA)** | Legacy enterprise GRC leader | Long track record; deep regulatory framework support; complex implementation [verified 05/2026, Archer company data] |
| **LogicGate** | Modern GRC platform | Risk Cloud platform; more user-friendly than legacy alternatives; growing in mid-market [verified 05/2026, LogicGate company data] |
| **Hyperproof** | Compliance operations platform | Framework-centric; maps controls to multiple frameworks simultaneously; streamlines multi-framework compliance [verified 05/2026, Hyperproof company data] |

---

## 5. Regulatory overlay

### Major compliance frameworks (ranked by sales impact)

| Framework | What it is | Who needs it | Sales impact |
|---|---|---|---|
| **SOC 2 Type II** | AICPA attestation of security controls over a period | Any SaaS selling to enterprise | **Highest sales impact** — without it, enterprise deals don't start [verified 05/2026, AICPA] |
| **ISO 27001:2022** | International information security management standard | Companies selling internationally, especially EU | Required by many European enterprise buyers; increasingly required alongside SOC 2 [verified 05/2026, ISO/IEC 27001:2022] |
| **HIPAA** | U.S. healthcare data protection (PHI) | Any company handling protected health information | Hard gate for healthcare sales — BAAs required; technical safeguards audited [verified 05/2026, HHS] |
| **PCI DSS v4.0.1** | Payment card data security standard | Any company storing, processing, or transmitting card data | Mandatory for payments industry; v4.0.1 requirements fully effective March 2025 [verified 05/2026, PCI SSC] |
| **GDPR** | EU general data protection regulation | Any company processing EU personal data | EUR 4.5B+ in fines issued; max penalty 4% of global revenue [verified 05/2026, GDPR Enforcement Tracker] |
| **CCPA / CPRA** | California consumer privacy act (as amended) | Any business meeting CCPA thresholds serving CA residents | Template for 14+ other state privacy laws; CPPA actively enforcing [verified 05/2026, CPPA / IAPP] |
| **FedRAMP** | Federal Risk and Authorization Management Program | Cloud services selling to federal agencies | 370+ authorized products; process takes 6-18 months; unlocks ~$100B+ federal cloud market [verified 05/2026, FedRAMP Marketplace GSA] |
| **CMMC 2.0** | Cybersecurity Maturity Model Certification | DoD contractors and subcontractors (~80,000 companies) | Final Rule effective December 2024; phased implementation through 2026-2028; Level 2 requires third-party assessment [verified 05/2026, DoD CMMC 2.0 Final Rule] |
| **NIST CSF 2.0** | Cybersecurity framework (voluntary) | Any organization; required reference for federal contractors | Updated February 2024; added "Govern" function; the de facto risk language for U.S. organizations [verified 05/2026, NIST CSF 2.0] |
| **SOX (Section 404)** | Financial reporting internal controls | Public companies and pre-IPO companies | Drives IT general controls (ITGC) requirements; becomes urgent pre-IPO [verified 05/2026, SEC / PCAOB] |

### The compliance cascade (how frameworks compound)

A SaaS company's compliance journey typically follows this progression:
1. **SOC 2 Type II** — the first certification most SaaS companies pursue; unlocks enterprise procurement
2. **ISO 27001** — added when selling internationally or when enterprise customers require it alongside SOC 2
3. **HIPAA** — added when entering healthcare vertical; requires Business Associate Agreements and technical safeguards
4. **PCI DSS** — added when handling payment card data
5. **GDPR / state privacy** — added when processing personal data at scale; consent management and DSAR workflows
6. **FedRAMP / CMMC** — added when pursuing federal government or DoD contracts; significant investment ($500K-$2M+ for FedRAMP)

Each additional framework creates incremental tool purchases, audit costs, and headcount needs — the compliance cascade is a growth engine for GRC vendors.

---

## 6. Technology stack

### The modern compliance technology stack (2026)

| Layer | What it does | Leading tools |
|---|---|---|
| **Compliance automation** | Continuous control monitoring, evidence collection, audit management | Vanta, Drata, Secureframe, Sprinto |
| **Privacy management** | Data mapping, consent, DSARs, privacy impact assessments | OneTrust, BigID, TrustArc, Transcend |
| **Vulnerability management** | Asset discovery, vulnerability scanning, prioritization | Qualys, Tenable, Rapid7, Wiz |
| **Endpoint security** | EDR, device trust, configuration management | CrowdStrike, SentinelOne, Microsoft Defender |
| **Identity / access management** | SSO, MFA, privileged access, access reviews | Okta, Microsoft Entra ID, CyberArk |
| **Security questionnaire automation** | Vendor questionnaire response management | Conveyor, Whistic, Prevalent, Drata (Trustero) |
| **Penetration testing** | Application and infrastructure pen testing | Cobalt, HackerOne, Bugcrowd, Synack |
| **Enterprise GRC** | Integrated risk, policy, audit, and compliance management | ServiceNow GRC, Archer, LogicGate, Hyperproof |
| **Training / awareness** | Security awareness training, phishing simulations | KnowBe4, Proofpoint, Hoxhunt |

### Integration is critical

The compliance stack must integrate with the company's core infrastructure:
- **Cloud providers** (AWS, Azure, GCP) — for configuration monitoring and evidence collection
- **Identity provider** (Okta, Entra ID) — for access control evidence
- **HR system** (Gusto, Rippling, BambooHR) — for employee onboarding/offboarding compliance
- **Source control** (GitHub, GitLab) — for code review and change management evidence
- **SIEM / logging** (Datadog, Splunk, Sumo Logic) — for security event monitoring
- **Task management** (Jira, Linear, Asana) — for control remediation tracking

Vanta and Drata win largely because of integration depth — 200+ native integrations that automate evidence collection across the entire stack.

---

## 7. ICP patterns

### Best-fit Cambrian user-prospect: B2B SaaS company ($5M-$200M ARR) pursuing its first SOC 2 or expanding compliance portfolio

Why this segment:
- The compliance decision is driven by a sales event (lost deal, customer requirement) — making the pain immediate and quantifiable
- The buyer (Head of Security or Head of Compliance) is a newly created role in many of these companies — they're building their compliance function from scratch
- Budget is justified by the revenue at risk — "we can't close $2M in enterprise pipeline without SOC 2" is the most compelling internal business case in SaaS
- The compliance automation vendors (Vanta, Drata, Secureframe) are actively selling to this segment — Cambrian's seller-users who sell adjacent products (security, identity, GRC) benefit from the compliance buying window

### Segment-specific ICP patterns

| Segment | Compliance maturity | What they buy | Key pain |
|---|---|---|---|
| **Startup (pre-Series B)** | None or SOC 2 in progress | Compliance automation (Vanta/Drata), pen testing, cloud security basics | "We need SOC 2 to close our first enterprise deal" |
| **Scale-up (Series B-D, $10-100M ARR)** | SOC 2 achieved; adding ISO/HIPAA/PCI | Multi-framework automation, privacy management, vulnerability management | "We have SOC 2 but now healthcare customers want HIPAA and EU customers want ISO 27001" |
| **Mid-market ($100-500M ARR)** | Multi-framework; building GRC team | Enterprise GRC platform, security questionnaire automation, third-party risk management | "We're responding to 200 security questionnaires a year manually" |
| **Enterprise ($500M+ ARR)** | Mature compliance function | Enterprise GRC, SIEM/SOAR, advanced pen testing, FedRAMP | "We need to centralize risk management across 15 frameworks and 500 third-party vendors" |
| **PE portco (post-acquisition)** | Varies widely; often underinvested | Full compliance buildout per sponsor mandate | "Our sponsor wants SOC 2 within 12 months and we have no compliance team" |
| **Pre-IPO** | SOX readiness becomes urgent | SOX compliance (ITGC), financial controls, audit preparation | "We IPO in 18 months and our auditors flagged 12 material control deficiencies" |

---

## 8. Buying committee

| Role | What they care about | Their lens |
|---|---|---|
| **CISO / Head of Security** | Security posture, risk reduction, audit readiness, team efficiency | "Does this reduce our audit preparation time and improve our control posture?" |
| **Head of Compliance / GRC** | Framework coverage, evidence automation, auditor relationship | "Can I manage SOC 2 + ISO + HIPAA from one platform?" |
| **VP Engineering / CTO** | Engineering team impact, integration depth, developer experience | "Will this require my engineers to change workflows, or does it integrate silently?" |
| **CFO** | Cost of compliance, revenue unlocked by certification, audit fees | "What's the ROI? How many deals does SOC 2 unlock vs. what we're spending on the program?" |
| **VP Sales / CRO** | Sales cycle acceleration, competitive differentiation, trust page | "Will having SOC 2 help us win deals faster?" |
| **Legal / DPO** | Regulatory risk, privacy obligations, contractual requirements | "Does this help us meet our GDPR obligations and manage DPA inventory?" |
| **Internal Audit** (enterprise only) | Audit efficiency, control testing, evidence quality | "Can I use this platform for our internal audit program?" |

### Decision pattern

- **Startup:** CTO + CEO. Compliance automation purchased on credit card. 1-2 week decision. Vanta/Drata/Secureframe compete head-to-head.
- **Scale-up:** Head of Security + CFO + VP Engineering. 4-8 week decision. POC expected for enterprise GRC; compliance automation faster.
- **Mid-market:** CISO + CFO + Procurement + Legal. 2-4 month decision. RFP for GRC platform; competitive bake-off.
- **Enterprise:** CISO + CRO (Chief Risk Officer) + Internal Audit + Procurement + Legal + IT. 6-12 month decision. Formal RFP. Reference calls. Pilot.
- **PE-backed:** CFO + operating partner set the mandate; CISO (often newly hired) executes. 2-4 month decision driven by sponsor timeline.

**Critical insight:** The VP Sales or CRO is an underutilized champion for compliance purchases. They experience the pain directly — lost deals, stalled procurement, lengthy security reviews. Frame compliance tooling as a sales enabler ("this investment will accelerate $5M in stalled pipeline") and the VP Sales becomes an internal advocate.

---

## 9. Trigger events

| Trigger | What it signals | Sales implication |
|---|---|---|
| **Lost deal due to missing certification** | Immediate, quantifiable pain; internal business case writes itself | The highest-conversion compliance trigger; revenue-at-risk framing |
| **Enterprise customer security questionnaire** | Customer demanding compliance evidence; timeline-bound | Creates urgency for compliance automation or questionnaire tools |
| **PE acquisition / new investor** | Sponsor mandates compliance within 12-18 months | Budget allocated; timeline set; operating partner drives urgency |
| **SOC 2 audit renewal (annual)** | Re-evaluation of tooling, auditor, and process | Switching window for compliance automation vendors |
| **Regulatory effective date** | Mandatory compliance action by deadline | CMMC rollout, state privacy law effective dates, PCI DSS v4.0.1 milestones |
| **New CISO / Head of Compliance hire** | New leader evaluates and replaces incumbent tools | 60-90 day window to engage before decisions lock |
| **Data breach / security incident** | Board-level urgency for security and compliance investment | Budget unlocked; fast decision cycle; "never again" mandate |
| **IPO preparation** | SOX compliance, governance maturity, audit-ready controls | 12-24 month compliance buildout; large budget allocation |
| **Geographic expansion (especially EU)** | GDPR, ISO 27001 become requirements | Privacy management and ISO certification become urgent |
| **Healthcare or government market entry** | HIPAA, FedRAMP, CMMC become requirements | Vertical-specific compliance buildout; can take 6-18 months |
| **Board / investor compliance mandate** | Top-down requirement with executive sponsorship | Budget pre-approved; timeline defined; resistance minimal |
| **Annual audit cycle (Q4 audit prep)** | Busiest compliance buying season | Auditors, automation tools, and pen testing see peak demand Q3-Q4 |

---

## 10. Common failure modes

What goes wrong selling compliance-related products or selling into compliance-conscious buyers:

1. **Confusing "certified" with "attested."** SOC 2 is an attestation, not a certification. There is no pass/fail. The auditor's report describes the controls and any exceptions — the buyer evaluates whether exceptions are acceptable. Calling SOC 2 a "certification" signals ignorance to any compliance professional.

2. **Treating compliance as a checkbox.** "We're SOC 2 compliant" is not a meaningful statement. Which Trust Services Criteria? What observation period? Any exceptions? What scope? Compliance professionals evaluate specifics, not claims. Sellers who treat compliance as a checkbox rather than a nuanced conversation lose credibility.

3. **Selling compliance fear without empathy.** "You need SOC 2 or you'll lose enterprise deals" is true but comes across as fear-selling. Better: "Many companies in your stage find that SOC 2 unlocks a segment of buyers they can't reach today. We've seen customers recoup the investment within one enterprise deal." Same message, different delivery.

4. **Ignoring the audit cycle.** Compliance buying concentrates around audit cycles. SOC 2 audits typically cover Q1-Q4 or mid-year periods. Audit prep starts 2-3 months before the observation period begins. Selling compliance tooling in January for a Q1 audit start means the decision was made in October. Timing matters more in compliance than almost any other B2B category.

5. **Underestimating the FedRAMP investment.** FedRAMP authorization takes 6-18 months and costs $500K-$2M+ including third-party assessment, remediation, and ongoing monitoring. Companies that pursue FedRAMP without understanding the investment abandon the process mid-stream. Sellers of FedRAMP-related products must qualify the prospect's commitment level and timeline rigorously.

6. **Treating GDPR as "just EU."** GDPR applies to any company processing the personal data of EU residents, regardless of where the company is based. A U.S. SaaS company with EU customers is subject to GDPR. Sellers who dismiss GDPR as "EU-only" miss the extraterritorial scope.

7. **Overselling AI in compliance.** "AI-powered compliance automation" is a common claim. In practice, AI assists with questionnaire responses, policy generation, and evidence tagging — but the auditor still evaluates controls manually. The regulatory bodies (AICPA, ISO, PCI SSC) have not endorsed AI-generated compliance evidence. AI reduces effort but does not replace auditor judgment.

8. **Missing the revenue enablement frame.** Compliance is a cost in the P&L but a revenue enabler in practice. The CISO frames it as risk reduction; the CFO sees it as cost. The winning pitch reframes compliance as revenue: "This certification gives you access to $X of addressable market you can't reach today." The VP Sales is often the best internal champion for this frame.

---

## 11. GTM implications for Cambrian seller-users

### For sellers prospecting companies that need compliance

- **Lead with the lost deal.** "How many deals have you lost or seen stall because of compliance gaps?" is the most effective opening question in compliance sales. It quantifies the pain immediately.
- **Align outreach to audit cycles.** SOC 2 renewal prep happens 2-3 months before observation period start. ISO 27001 surveillance audits are annual. PCI DSS assessments are annual. Map outreach to these cycles for 2-3x conversion rates.
- **Frame compliance as revenue.** The CFO approves the budget; frame the investment as "this certification unlocks $X in enterprise pipeline." The CISO executes; frame the tooling as "this reduces audit prep from 6 months to 6 weeks."
- **Target PE portcos post-acquisition.** PE sponsors mandate SOC 2 within 12-18 months of acquisition for software portcos. This is a predictable, timeline-bound compliance buying event. Track PE acquisitions in your ICP verticals.
- **Reference the CMMC wave.** ~80,000 DoD contractors will need CMMC certification over the next 2-3 years. This is the largest forced-compliance migration since PCI DSS. Companies serving the defense industrial base are actively evaluating compliance tooling.

### For sellers who sell compliance-adjacent products (security, identity, GRC)

- **Position as a compliance control.** Every security product maps to compliance controls. CrowdStrike is an EDR (security) but also satisfies SOC 2 CC6.8 (malicious software prevention) and HIPAA 164.308(a)(5)(ii)(B) (protection from malicious software). Position your product as "this satisfies control X in framework Y" to align with the compliance buying motion.
- **Integrate with compliance automation platforms.** Vanta and Drata have 200+ integrations because compliance automation works by pulling evidence from security tools. If your product integrates with Vanta/Drata, it becomes part of the compliance evidence chain — making it harder to displace and easier to justify.
- **Target the "annual audit prep" buying window.** The 2-3 months before an audit observation period starts is when companies evaluate and purchase security tools to ensure they pass. Time your outreach to Q3-Q4 for calendar-year audits.

### Disclaimer (MUST include in all compliance-related outputs)

IMPORTANT: Cambrian Catalyst is a GTM consultancy, not a compliance provider. We help sellers understand and navigate compliance topics in sales conversations — not implement, audit, or certify compliance programs. Always escalate to the prospect's compliance team or qualified counsel for specific compliance guidance.

---

## 12. Cross-references to sister layers

| Layer | How it applies |
|---|---|
| \`cambrian_b2b_sales_knowledge.md\` | SOC 2 is the universal procurement gate in B2B SaaS; the sales tech layer describes how compliance impacts deal velocity and win rates |
| \`cambrian_smb_midmarket_knowledge.md\` | SMBs generally don't face compliance pressure until they sell to mid-market/enterprise; the compliance trigger often coincides with the company's growth from SMB to mid-market |
| \`cambrian_investor_intelligence.md\` | PE sponsors mandate compliance (SOC 2, ISO 27001) as part of value creation plans; compliance investment is a standard post-acquisition initiative |
| \`cambrian_approval_gates_knowledge_layer.md\` | Compliance certifications ARE approval gates — SOC 2, HIPAA, FedRAMP are procurement gates that determine vendor access to customer segments |

---

*End of layer. Update cadence: quarterly. Critical re-check triggers: CMMC 2.0 enforcement milestones, new state privacy law effective dates (check IAPP tracker), PCI DSS v4.0.1 requirement deadlines, GDPR landmark enforcement actions, FedRAMP marketplace updates, SOC 2 Trust Services Criteria updates.*
`;

export const COMPLIANCE_DISCOVERY = `
COMPLIANCE DISCOVERY (use when prospect's compliance posture is relevant):

FOR COMPANIES SELLING TO ENTERPRISE (compliance as sales enabler):
- "How many deals have you lost or seen stall because of a missing certification or failed vendor security review?"
- "What compliance certifications do your target customers require before you can enter their procurement process?"
- "What's your current SOC 2 / ISO 27001 / HIPAA posture, and when is your next audit cycle?"
- "If you had SOC 2 today, how much pipeline would it unlock?"
- "Who owns vendor security reviews in your target accounts, and what do they typically ask for?"

FOR COMPANIES IN REGULATED INDUSTRIES (compliance as operational requirement):
- "Which regulatory frameworks create the most operational burden for your team right now?"
- "How do you manage compliance evidence collection — is it manual or automated?"
- "What's the cost of a compliance failure in your industry — regulatory fine, lost contract, or both?"
- "How is CMMC 2.0 affecting your DoD pipeline and compliance roadmap?"
- "What's your biggest gap between current controls and your next audit?"

FOR PE-BACKED / INVESTOR-OWNED COMPANIES (compliance as value creation):
- "Has your sponsor set a compliance timeline — SOC 2 within 12 months, for example?"
- "How does compliance certification factor into your exit preparation?"
- "Are there portfolio-wide compliance standards your sponsor is driving?"
`;
