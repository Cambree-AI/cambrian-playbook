#!/usr/bin/env node
// scripts/export-inventory.mjs
// Exports the feature inventory + P&L model as a .xlsx file with two tabs.
// Output: docs/cambrian-catalyst-inventory.xlsx
//
// Usage: node scripts/export-inventory.mjs

import XLSX from "xlsx";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "docs", "cambrian-catalyst-inventory.xlsx");

// ── TAB 1: FEATURE INVENTORY ──────────────────────────────────────────────

const inventory = [];

// Header
inventory.push(["CAMBRIAN CATALYST — FEATURE INVENTORY", "", "", "", "v108-security-perf", "2026-04-20"]);
inventory.push([]);

// Platform summary
inventory.push(["PLATFORM SUMMARY"]);
inventory.push(["Metric", "Value"]);
inventory.push(["Stages", "10 (Steps 0-9)"]);
inventory.push(["Brief data fields", "25+"]);
inventory.push(["Hypothesis fields", "5 RIVER + JOLT (4) + Talk Tracks (5) + Challenger Insight"]);
inventory.push(["Frameworks integrated", "13"]);
inventory.push(["AI calls per full deal cycle", "~14"]);
inventory.push(["Variable cost per deal", "~$0.11"]);
inventory.push(["Gross margin at $99/seat", "97%"]);
inventory.push([]);

// Stage-by-stage
const stages = [
  {
    step: 0, name: "Session Setup",
    features: [
      ["Seller URL input", "Required", "Auto-triggers ICP build + product scan on blur"],
      ["Scan Products button", "Manual fallback", "For mobile where onBlur doesn't fire"],
      ["LinkedIn profile input", "Optional", "Drives relationship signals on Brief"],
      ["Funding stage selector", "7 options", "Bootstrapped, Series A-D+, PE-Backed, Public with contextual tips"],
      ["Sales materials upload", "Up to 6 files", "PDF/DOCX/TXT/MD — primary source for solution context"],
      ["Proof points entry", "6 types", "Case Study, ROI Metric, Customer Win, Award, Partnership, Certification"],
      ["Product URL scanner", "Up to 5", "Auto-detect product pages + manual entry"],
      ["Products catalog", "Name + description", "Manual product/solution entries"],
    ]
  },
  {
    step: 1, name: "ICP & RFPs",
    features: [
      ["ICP Tab — Industries", "Array", "Target vertical markets"],
      ["ICP Tab — Buyer Personas", "Array", "Economic buyer, champion, evaluator roles"],
      ["ICP Tab — Company Size", "Anchored enum", "1-49 | 50-499 | 500-4,999 | 5,000-49,999 | 50,000+"],
      ["ICP Tab — Revenue Range", "Anchored enum", "<$10M | $10M-$100M | $100M-$1B | $1B-$10B | $10B+"],
      ["ICP Tab — Deal Size", "Anchored enum", "<$10K | $10K-$50K | $50K-$250K | $250K-$1M | $1M+"],
      ["ICP Tab — Sales Cycle", "Anchored enum", "<30 days | 30-60 | 60-90 | 90-180 | 180+"],
      ["ICP Tab — Adoption Profile", "Anchored enum", "Innovator | Early Adopter | Early Majority | Late Majority"],
      ["ICP Tab — Differentiators", "Array", "Unique selling propositions"],
      ["ICP Tab — Customer Examples", "Array", "Named customer logos"],
      ["ICP Tab — Disqualifiers", "Array", "Explicit non-fit criteria"],
      ["RFP Tab — Open RFPs", "Table", "Title, buyer, source, value, deadline, cohort, relevance score"],
      ["RFP Tab — Closed Awards", "Table", "Title, buyer, awarded vendor, value, date, cohort"],
      ["RFP Tab — Filter", "Toggle", "All / Private / Government with live counts"],
      ["RFP Tab — NAICS/CPV codes", "Auto-injected", "Enhances SAM.gov/TED search precision"],
      ["Regenerate ICP", "Button", "Force refresh from web_search"],
      ["PDF export", "Button", "Print current view"],
      ["JSON data download", "Button", "Structured data export"],
    ]
  },
  {
    step: 2, name: "Import Accounts",
    features: [
      ["CSV upload", "Drag/drop or browse", "Auto-maps columns to company/industry/URL"],
      ["Sample data", "100 accounts", "19 industries for quick demo"],
      ["Build My Target Accounts", "AI-generated", "20 ICP-matched real companies via web_search"],
      ["Industry selector", "Up to 3", "Chip picker + free-text, defaults to ICP"],
      ["Headcount dropdown", "8 bands", "1-49 through 50K+, defaults to ICP"],
      ["Revenue dropdown", "8 bands", "Under $1M through $10B+, defaults to ICP"],
    ]
  },
  {
    step: 3, name: "Accounts & Fit Scoring",
    features: [
      ["Cohort table", "Sortable", "Company, Industry, Org Size, Ownership, Fit Score"],
      ["3-dimension fit scoring", "Parallel batched", "ICP Alignment (40%) + Customer Similarity (30%) + Competitive Landscape (30%)"],
      ["Fit labels", "Score-derived", "Strong Fit (75-100), Potential Fit (55-74), Poor Fit (0-54)"],
      ["Pie charts", "2 charts", "Accounts by Vertical + Accounts by Cohort"],
      ["Multi-account queue", "Up to 5", "Select multiple accounts for sequential review"],
      ["Top-3 pre-cache", "Automatic", "Pre-fetches exec data for top 3 accounts after scoring"],
      ["PDF export", "Button", ""],
      ["JSON data download", "Button", ""],
    ]
  },
  {
    step: 4, name: "Account Review",
    features: [
      ["Account selector strip", "Horizontal scroll", "Chips with fit score badges"],
      ["Company logo", "Clearbit", "Initials fallback on 404"],
      ["Fit rationale card", "Conditional", "Score breakdown + customer similarity + incumbent risk"],
      ["ICP match grid", "4 columns", "Industry match, key buyers, trigger, watch-for"],
      ["Deal value dropdown", "8 options", "$0-$10K through $1M+"],
      ["Revenue classification", "6 options", "New logo, expansion, renewal, etc."],
      ["Target outcomes", "Multi-select (3 max)", "13 universal business imperatives"],
      ["Pre-cache trigger", "On account select", "Fires exec + overview + live search in background"],
      ["Build Brief CTA", "Button", ""],
    ]
  },
  {
    step: 5, name: "RIVER Brief",
    features: [
      ["Company Snapshot", "Editable", "3-4 sentences on what the company does"],
      ["Revenue", "Editable", "e.g. $2.4B (FY2024)"],
      ["Public/Private", "Editable", "e.g. Public (NYSE:MCD)"],
      ["Employee Count", "Editable", "e.g. ~200,000"],
      ["Headquarters + Founded", "Editable", "City, State + Year"],
      ["Website + LinkedIn", "Links", "Direct links to company"],
      ["Funding Profile", "Editable", "Ownership details with badges"],
      ["Key Executives", "Cards", "Name, title, background, mandate/perspective (2-3 sentences)"],
      ["Recent Headlines", "Cards", "Headline + growth signal + relevance"],
      ["Open Roles", "Cards", "Summary + 3+ roles with department + hiring signal"],
      ["Solution Mapping", "Cards", "Product, fit, proven customer, measurable outcome per solution"],
      ["Case Studies", "Cards", "Named customer parallels with quantified outcomes"],
      ["Key Contacts", "Cards", "Name, title, approach angle"],
      ["Competitors", "List", "Name + threat level"],
      ["Opening Angle", "Editable", "Challenger-style assumption reframe"],
      ["Strategic Theme", "Editable", "Current direction and priorities"],
      ["Seller Opportunity", "Editable", "Why-you-why-now positioning"],
      ["Public Sentiment", "Cards", "Online sentiment, standout review, sales angle"],
      ["Relationship Signals", "Post-brief", "LinkedIn-powered warm-path detection"],
      ["Watch-Outs", "Editable list", "Procurement risk, incumbent risk, stage credibility"],
      ["Recent Signals", "List", "Buying indicators"],
      ["Growth Signals", "List", "Expansion indicators"],
      ["Section collapse", "Toggle", "Heavy sections collapsible"],
      ["Skeleton loading", "Progressive", "Sections fill in as AI calls complete"],
      ["PDF export", "Button", ""],
      ["JSON data download", "Button", ""],
      ["Regenerate", "Button", ""],
    ]
  },
  {
    step: 6, name: "RIVER Hypothesis",
    features: [
      ["Solutions card", "Read-only", "From brief solution mapping"],
      ["Reality", "Editable", "Current-state problem + real signal"],
      ["Impact", "Editable", "Business cost — visceral, quantified"],
      ["Vision", "Editable", "Success in their words"],
      ["Entry Points", "Editable", "Mobilizer profile — who makes it happen"],
      ["Route", "Editable", "JOLT-structured next step"],
      ["Opening Angle", "Editable", "Challenger teaching angle"],
      ["Challenger Insight", "Dark card", "Industry assumption to disprove"],
      ["JOLT Plan — Judge", "Editable", "Name the FOMU"],
      ["JOLT Plan — Offer", "Editable", "Single recommendation"],
      ["JOLT Plan — Limit", "Editable", "Narrow scope"],
      ["JOLT Plan — Take Risk Off", "Editable", "Pilot, SLA, phased rollout"],
      ["Talk Track — Opening", "Editable", "Challenger insight + social proof"],
      ["Talk Track — Discovery", "Editable", "Mom Test past-behavior question"],
      ["Talk Track — Impact", "Editable", "Ellis must-have test"],
      ["Talk Track — Vision", "Editable", "Success in their words"],
      ["Talk Track — Route", "Editable", "Named customer path recommendation"],
      ["Streamed progressively", "Yes", "Talk tracks appear as they generate"],
      ["PDF export", "Button", ""],
      ["JSON data download", "Button", ""],
      ["Regenerate", "Button", ""],
    ]
  },
  {
    step: 7, name: "In-Call Navigator",
    features: [
      ["Confidence meter", "0-100%", "Calculated from gate answers + discovery data"],
      ["RIVER stage pills", "5 stages", "Click to navigate, filled indicators"],
      ["Gate questions", "Per stage", "Horizontal option buttons + notes textarea"],
      ["Static discovery prompts", "Per stage", "RIVER framework built-in questions"],
      ["AI sales discovery Qs", "2 per stage", "Mom Test, Voss, Cialdini, Fisher/Ury, Sun Tzu"],
      ["AI architecture Qs", "2 per stage", "Rajput, McSweeney, Richards/Ford, Fowler, DMAIC"],
      ["Talk tracks", "Per stage", "Dark card with stage-specific language"],
      ["Objection handling", "2 per stage", "Accordion with suggested responses"],
      ["Call notes", "Textarea", "Tab inserts timestamp"],
      ["Opening angle sidebar", "Reference", "From brief"],
      ["Solutions sidebar", "Reference", "Quick ref from solution mapping"],
      ["Watch-outs sidebar", "Reference", "From brief"],
      ["DMAIC stage indicator", "Conditional", "5-stage process maturity display"],
      ["Focus mode", "Auto", "Minimal chrome, larger type, calmer palette"],
      ["Lazy rep detection", "< 20% fields", "Milton nudge + synthesis warning"],
      ["PDF export", "Button", ""],
      ["JSON data download", "Button", ""],
      ["End Call", "Button", "Routes to post-call"],
    ]
  },
  {
    step: 8, name: "Post-Call Route",
    features: [
      ["Transcript upload", "Paste or file", ".txt, .vtt, .srt, .csv, .md"],
      ["Transcript analysis", "Full RIVER", "Proof pack + Fisher/Ury + Graham injected"],
      ["Deal Confidence", "Stat card", "Percentage"],
      ["Deal Route", "Color-coded", "Fast Track (green) / Nurture (amber) / Disqualify (red)"],
      ["Deal Risk", "Text", "Single biggest risk"],
      ["RIVER Scorecard", "5 cards", "Per-stage synthesis of what was learned"],
      ["Next Steps", "Numbered list", "Actionable with owner + date"],
      ["CRM Note", "Copy button", "4-5 sentence ready-to-paste"],
      ["Call Summary", "Copy button", "3-4 sentence narrative"],
      ["Follow-Up Email", "Copy button", "Subject + full body"],
      ["Customer-Ready Summary", "Download", "Clean version for customer"],
      ["Sparse data warning", "Conditional", "Injected when <30% discovery captured"],
      ["Streamed progressively", "Yes", "Deal route appears first"],
      ["PDF export", "Button", ""],
      ["JSON data download", "Button", ""],
      ["Regenerate", "Button", ""],
    ]
  },
  {
    step: 9, name: "Solution Architecture Review",
    features: [
      ["PMF Assessment", "4 metrics", "Target Customer Fit, Underserved Need, Value Prop Fit, Overall PMF Signal"],
      ["Adoption Profile", "Moore curve", "Innovator / Early Adopter / Early Majority / Late Majority"],
      ["DMAIC Stage", "Badge + rationale", "Define / Measure / Analyze / Improve / Control"],
      ["Entry Strategy", "Recommendation", "Quick Win Pilot / Diagnostic Workshop / Full Deploy / Expand"],
      ["Integration Complexity", "Badge", "Low / Medium / High with explanation"],
      ["Confirmed Solutions", "Per product", "Fit score, implementation phase, business alignment, architecture notes, risks"],
      ["Revised Solutions", "Per product", "Upgraded / Downgraded / Removed with reasons"],
      ["Architecture Gaps", "List", "Unaddressed needs + bridging recommendations"],
      ["Implementation Roadmap", "Text", "Phased approach tied to outcomes"],
      ["Success Metrics", "Numbered list", "3 measurable outcomes"],
      ["SA Recommendation", "Dark card", "Single most important proposal element"],
      ["Graham Margin of Safety", "Applied", "Value must be 3-5x price"],
      ["Streamed progressively", "Yes", "PMF assessment appears first"],
      ["PDF export", "Button", ""],
      ["JSON data download", "Button", ""],
      ["Regenerate", "Button", ""],
    ]
  },
];

// Cross-stage features
const crossStage = [
  ["Milton (chat assistant)", "All stages", "Full knowledge layer, dry humor, anti-fabrication, never reveals methodology"],
  ["Cmd-K command palette", "All stages", "Fuzzy search across stages, actions, accounts"],
  ["Dark mode", "All stages", "Warm-dark palette toggle"],
  ["Focus mode", "Step 7", "Auto-enabled, minimal chrome"],
  ["Keyboard shortcuts", "All stages", "Cmd-K/S/P, arrows, 1-9"],
  ["PDF export", "Steps 1-9", "Print current view"],
  ["JSON data download", "Steps 1-9", "Stage-specific structured data"],
  ["Company logos", "Steps 4-6", "Clearbit with initials fallback"],
  ["Session save/load", "All stages", "Supabase-backed, per-user"],
];

// Security features
const security = [
  ["JWT auth on proxy", "All Claude API calls require Supabase JWT"],
  ["Rate limiting", "60 req/min per IP, sliding window"],
  ["Model allow-list", "Haiku + Sonnet fallback only"],
  ["Tool allow-list", "web_search only"],
  ["Input size caps", "120KB messages, 12KB system prompt"],
  ["max_tokens cap", "8000"],
  ["Origin allow-list", "cambrian-playbook.vercel.app + localhost"],
  ["Knowledge layer protection", "Served from /api/knowledge.js behind auth"],
  ["Anti-fabrication rules", "Every prompt has explicit no-invent rules"],
  ["Supabase RLS", "Row-level security on sessions table (verified)"],
  ["0 npm vulnerabilities", "Clerk removed (was critical CVE)"],
];

// Disabled features
const disabled = [
  ["ICP preview on Step 0", "{false&&...}", "Moved to Step 1 ICP tab for better flow"],
  ["Glassdoor rating field", "{...&&false&&...}", "Data quality issues; sentiment still in publicSentiment"],
];

// Backlog
const backlog = [
  ["UX Phase 4 — expandable table rows, sidebar, tooltips", "Designed in docs/archive/ux-plan.md"],
  ["Export update for new brief fields", "publicSentiment, joltPlan, challengerInsight missing from export"],
  ["CSS extraction for faster first paint", "Not started"],
  ["Full HMAC JWT verification", "Needs SUPABASE_JWT_SECRET env var"],
  ["Stage extraction (S8, S6, S1, S5)", "S9 extracted; others pending"],
  ["Wire lib/api.js + lib/utils.js", "lib/supabase.js done; others stale"],
];

// Frameworks
const frameworks = [
  ["Voss", "Hypothesis, Discovery, In-Call", "Calibrated How/What questions, tactical empathy, mirroring"],
  ["Fisher/Ury", "Hypothesis, Post-Call, Transcript, SA", "Interests not positions, BATNA, objective criteria"],
  ["Cialdini", "Brief p3, Hypothesis", "Social proof, authority, scarcity"],
  ["Sun Tzu", "Fit Scoring, Hypothesis", "Know terrain, find underserved stakeholder"],
  ["JOLT Effect", "Hypothesis, Route stage", "Judge indecision, one recommendation, limit scope, remove risk"],
  ["Challenger Customer", "Brief p3, Hypothesis", "Mobilizer identification, teaching angle"],
  ["Graham", "Post-Call, SA Review, Transcript", "Margin of Safety — 3-5x value required"],
  ["Crucial Conversations", "Discovery, In-Call", "Safety signals, STATE method"],
  ["Mom Test", "Discovery, Talk Tracks", "Past behavior, never hypothetical"],
  ["Ellis 40% Rule", "Discovery, Fit Scoring", "Must-have test — disqualifying signal"],
  ["Dunford", "Brief p4, Solution Mapping", "Positioning, competitive alternatives"],
  ["Osterwalder VPC", "Brief p4, Solution Mapping", "Job-to-be-done, pain, gain"],
  ["DMAIC", "SA Review, In-Call, Hypothesis", "Define/Measure/Analyze/Improve/Control"],
];

// Build the sheet
inventory.push(["STAGE-BY-STAGE FEATURES"]);
inventory.push(["Step", "Stage", "Feature", "Type/Format", "Detail"]);

for (const stage of stages) {
  for (const [feature, type, detail] of stage.features) {
    inventory.push([stage.step, stage.name, feature, type, detail]);
  }
  inventory.push([]); // blank row between stages
}

inventory.push([]);
inventory.push(["CROSS-STAGE FEATURES"]);
inventory.push(["Feature", "Available", "Detail"]);
for (const row of crossStage) inventory.push(row);

inventory.push([]);
inventory.push(["SECURITY FEATURES"]);
inventory.push(["Feature", "Detail"]);
for (const row of security) inventory.push(row);

inventory.push([]);
inventory.push(["INTENTIONALLY DISABLED"]);
inventory.push(["Feature", "Location", "Reason"]);
for (const row of disabled) inventory.push(row);

inventory.push([]);
inventory.push(["BACKLOG (DISCUSSED, NOT BUILT)"]);
inventory.push(["Feature", "Status"]);
for (const row of backlog) inventory.push(row);

inventory.push([]);
inventory.push(["KNOWLEDGE LAYER — 13 FRAMEWORKS"]);
inventory.push(["Framework", "Used In", "Purpose"]);
for (const row of frameworks) inventory.push(row);

// ── TAB 2: P&L MODEL ──────────────────────────────────────────────────────

const pl = [];

pl.push(["CAMBRIAN CATALYST — P&L MODEL", "", "", "", "v108", "2026-04-20"]);
pl.push([]);

// Assumptions
pl.push(["API PRICING (per million tokens)"]);
pl.push(["Model", "Input $/MTok", "Output $/MTok"]);
pl.push(["Haiku 4.5 (primary)", 1.00, 5.00]);
pl.push(["Sonnet 4.5 (fallback)", 3.00, 15.00]);
pl.push(["web_search tool", "$0.01/search", ""]);
pl.push(["Sonnet fallback rate", "5%", ""]);
pl.push([]);

// Fixed costs
pl.push(["FIXED INFRASTRUCTURE (monthly)"]);
pl.push(["Item", "Cost/mo", "Notes"]);
pl.push(["Vercel Pro", 20, "Required at ~100K invocations"]);
pl.push(["Supabase Pro", 25, "Required for >500MB DB / >2GB egress"]);
pl.push(["Domain", 1, "Annualized"]);
pl.push(["Total Fixed", 46, ""]);
pl.push([]);

// Per-stage costs
pl.push(["PER-STAGE AI COSTS (measured from v107 harness)"]);
pl.push(["Stage", "Calls", "~Input tok", "~Output tok", "Cost/run"]);
pl.push(["ICP build (Phase 1 + Phase 2)", 2, 5000, 6000, 0.04]);
pl.push(["RFP intel (open + closed)", 2, 4000, 5000, 0.05]);
pl.push(["Brief (5 micro-calls)", 5, 8000, 10000, 0.06]);
pl.push(["Hypothesis (RIVER + JOLT + talks)", 1, 2000, 1500, 0.01]);
pl.push(["Discovery questions (sales + arch)", 1, 2000, 1500, 0.01]);
pl.push(["Fit-scoring (batch of 20)", 1, 1500, 2000, 0.012]);
pl.push(["Post-call routing", 1, 2500, 1500, 0.011]);
pl.push(["Solution Fit review", 1, 3000, 3000, 0.018]);
pl.push(["Find Targets (gen + scoring)", 2, 3000, 4000, 0.05]);
pl.push([]);
pl.push(["Cost per full deal cycle", "", "", "", 0.11]);
pl.push(["Cost per seller setup", "", "", "", 0.09]);
pl.push([]);

// Personas
pl.push(["VARIABLE COST PER PERSONA (monthly)"]);
pl.push(["Persona", "Deals/mo", "Accounts scored", "Cost/mo", "With 5% Sonnet fallback"]);
pl.push(["Light user", 5, 50, 0.57, 0.60]);
pl.push(["Medium user", 20, 200, 2.47, 2.59]);
pl.push(["Heavy user", 50, 500, 6.84, 7.18]);
pl.push(["Power user", "100+", 1000, 16.45, 17.27]);
pl.push([]);

// Pricing tiers
pl.push(["PRICING TIERS — GROSS MARGIN"]);
pl.push(["Plan", "Price/seat/mo", "COGS/seat", "Gross Profit", "Gross Margin"]);
pl.push(["Free trial (14 days)", 0, 0.62, -0.62, "n/a"]);
pl.push(["Starter", 39, 0.62, 38.38, "98%"]);
pl.push(["Pro", 99, 2.51, 96.49, "97%"]);
pl.push(["Team (3-seat min)", 79, 6.88, 72.12, "91%"]);
pl.push(["Enterprise", 299, 16.50, 282.50, "94%"]);
pl.push([]);

// Annual P&L
pl.push(["ANNUAL P&L — 1,000 USERS (mix-weighted)"]);
pl.push(["Segment", "Mix %", "Seats", "Monthly Rev", "Annual Rev"]);
pl.push(["Starter", "40%", 400, 15600, 187200]);
pl.push(["Pro", "40%", 400, 39600, 475200]);
pl.push(["Team", "15%", 150, 11850, 142200]);
pl.push(["Enterprise", "5%", 50, 14950, 179400]);
pl.push([]);
pl.push(["", "", "", "Annual Revenue", 984000]);
pl.push(["", "", "", "Annual Variable COGS", 37000]);
pl.push(["", "", "", "Annual Fixed COGS", 552]);
pl.push(["", "", "", "Annual Gross Profit", 946448]);
pl.push(["", "", "", "Gross Margin", "96%"]);
pl.push([]);

// 100-user scenario
pl.push(["ANNUAL P&L — 100 USERS"]);
pl.push(["", "", "", "Annual Revenue", 98400]);
pl.push(["", "", "", "Annual Variable COGS", 3700]);
pl.push(["", "", "", "Annual Fixed COGS", 552]);
pl.push(["", "", "", "Annual Gross Profit", 94148]);
pl.push(["", "", "", "Gross Margin", "96%"]);
pl.push([]);

// Sensitivity
pl.push(["SENSITIVITY ANALYSIS"]);
pl.push(["Scenario", "Light", "Medium", "Heavy", "Power"]);
pl.push(["Base cost/mo", 0.57, 2.47, 6.84, 16.45]);
pl.push(["15% Sonnet fallback (3x base)", 0.67, 2.95, 8.20, 19.73]);
pl.push(["Haiku +50% price increase", 0.85, 3.71, 10.26, 24.68]);
pl.push(["Worst case (both)", 1.01, 4.43, 12.30, 29.59]);
pl.push([]);
pl.push(["Conclusion", "Pricing driven by perceived value, not COGS. Margins hold above 85% even worst-case."]);

// ── BUILD WORKBOOK ─────────────────────────────────────────────────────────

const wb = XLSX.utils.book_new();

const ws1 = XLSX.utils.aoa_to_sheet(inventory);
// Set column widths
ws1["!cols"] = [
  { wch: 6 },   // Step
  { wch: 24 },  // Stage
  { wch: 40 },  // Feature
  { wch: 20 },  // Type
  { wch: 60 },  // Detail
];
XLSX.utils.book_append_sheet(wb, ws1, "Feature Inventory");

const ws2 = XLSX.utils.aoa_to_sheet(pl);
ws2["!cols"] = [
  { wch: 36 },  // Item
  { wch: 16 },  // Col B
  { wch: 16 },  // Col C
  { wch: 20 },  // Col D
  { wch: 16 },  // Col E
  { wch: 12 },  // Col F
];
XLSX.utils.book_append_sheet(wb, ws2, "P&L Model");

// ── TAB 3: KNOWLEDGE LAYER ────────────────────────────────────────────────

const kl = [];
kl.push(["CAMBRIAN CATALYST — KNOWLEDGE LAYER", "", "", "", "v108", "2026-04-20"]);
kl.push([]);

// Frameworks
kl.push(["NEGOTIATION & SALES FRAMEWORKS (13)"]);
kl.push(["Framework", "Stage Used", "Core Principle", "Prompt Injection Summary"]);
kl.push(["Voss (Never Split the Difference)", "In-Call, Discovery, Hypothesis", "Calibrated How/What questions, tactical empathy", "ALL questions How/What. Mirror last 3 words. Label emotions. Accusation Audit. No-oriented questions."]);
kl.push(["Fisher/Ury (Getting to Yes)", "Post-Call, Hypothesis, SA Review", "Interests not positions, BATNA", "Separate people from problem. Surface interests. Make status quo cost vivid. Objective criteria for price."]);
kl.push(["Cialdini (Influence)", "Brief p3, Hypothesis", "Social proof, authority, scarcity", "Reciprocity: give value first. Social Proof: name similar company. Authority: precise stat. Real scarcity only."]);
kl.push(["Sun Tzu (Art of War)", "Fit Scoring, Hypothesis", "Know terrain, adapt", "Know yourself and enemy. Make status quo untenable. Adapt to Moore profile. Find underserved stakeholder. Speed."]);
kl.push(["JOLT Effect (Dixon/McKenna)", "Hypothesis Route, Talk Tracks", "Indecision kills 40-60% of deals", "J=Judge FOMU. O=One recommendation (not options). L=Limit scope. T=Take risk off (pilot/SLA/phased)."]);
kl.push(["Challenger Customer (CEB/Gartner)", "Brief p3, Hypothesis", "Teach through the Mobilizer", "Only 13% are Mobilizers. They ask 'how do we make this happen?' Teaching angle challenges industry assumption."]);
kl.push(["Graham (Intelligent Investor)", "Post-Call, SA Review, Transcript", "Margin of Safety", "Value must be 3-5x price. Separate value from price. Position as compounding investment. Disqualify fast."]);
kl.push(["Crucial Conversations", "Discovery, In-Call", "Safety signals, STATE method", "Watch: long pauses, clipped answers, aggression. Restore safety. Share facts, Tell story, Ask their path."]);
kl.push(["Mom Test (Fitzpatrick)", "Discovery, Talk Tracks", "Past behavior, not hypotheticals", "Ask about what they DID, not what they WOULD do. Never mention your product in discovery questions."]);
kl.push(["Ellis 40% Rule", "Discovery, Fit Scoring", "Must-have test", "If <40% 'very disappointed' without it = nice-to-have. Critical disqualifier."]);
kl.push(["Dunford (Obviously Awesome)", "Brief p4, Solution Mapping", "Positioning", "Market Category + Competitive Alternatives + Unique Differentiators."]);
kl.push(["Osterwalder VPC", "Brief p4, Solution Mapping", "Job-to-be-done", "Functional/Emotional/Social Jobs → Pains → Gains."]);
kl.push(["DMAIC (Six Sigma)", "SA Review, In-Call, Hypothesis", "Process maturity", "Define→Measure→Analyze→Improve→Control. Maps to RIVER stages."]);
kl.push([]);

// Fit scoring
kl.push(["FIT SCORING HEURISTICS"]);
kl.push([]);
kl.push(["HIGH-FRICTION INDUSTRIES (early-stage sellers score poorly)"]);
kl.push(["Industry", "Avg Fit %", "Reason"]);
kl.push(["Heavy Manufacturing / Automotive", 5.9, "Unionized workforce, entrenched ERP"]);
kl.push(["Aerospace & Defense Prime", 5.8, "ITAR, security clearance, FedRAMP required"]);
kl.push(["Telecom Incumbents", 6.1, "Unionized, 5-deep incumbent stack"]);
kl.push(["Energy — Oil & Gas", 11.3, "Culture mismatch, union risk"]);
kl.push(["Energy — Utilities", 13.4, "Unionized, regulatory lock-in"]);
kl.push(["Mass-Market Retail >100K employees", 13.6, "Hardened procurement, low novelty tolerance"]);
kl.push(["Top-5 US Banks", 12.6, "Deep incumbents, RFP-gated procurement"]);
kl.push([]);
kl.push(["HIGH-FIT SEGMENTS (underserved by startups)"]);
kl.push(["Industry", "Avg Fit %", "Examples"]);
kl.push(["Large Private Insurance/Finance", 65.2, "State Farm, TIAA, Nationwide"]);
kl.push(["Large Private Tech/Data/Media", 64.5, "Bloomberg, Valve, SAS"]);
kl.push(["Large Private Professional Services", 63.3, "Deloitte US, EY, KPMG"]);
kl.push(["Insurance (P&C / Life / Specialty)", 62.5, "Allstate, Progressive, Travelers"]);
kl.push(["CPG — Personal Care / Beauty", 61.9, "P&G, Kimberly-Clark, Estee Lauder"]);
kl.push(["Regional / Community Banks", 59.5, "85 Fortune-1000 targets, widely ignored"]);
kl.push(["Healthcare IT / Digital Health", 54.9, ""]);
kl.push([]);
kl.push(["SELLER STAGE THRESHOLDS"]);
kl.push(["Stage", "Avg Fit %", "Note"]);
kl.push(["Seed", 23.7, "Zero viable direct enterprise paths"]);
kl.push(["Series A", 33.6, "Niche targeting only"]);
kl.push(["Series B", 41.8, "Departmental landing only"]);
kl.push(["Series C", 49.0, "First real enterprise traction"]);
kl.push(["Series D+", 55.6, "Full enterprise motion viable"]);
kl.push([]);
kl.push(["BUYING SIGNALS"]);
kl.push(["Signal", "Impact", "Type"]);
kl.push(["Recent funding <12 months", "+8pts, 18-month buying window", "Positive"]);
kl.push(["PE acquisition <18 months", "Cost mandate + 60-90 day budget cycle", "Positive"]);
kl.push(["Private vs public equivalent", "+5-8pts", "Positive"]);
kl.push(["Hiring Digital Transformation", "Early Majority signal", "Positive"]);
kl.push(["Hiring Innovation/R&D", "Early Adopter signal", "Positive"]);
kl.push([">200K employees + Seed/Series A seller", "-15pts procurement barrier", "Negative"]);
kl.push([">50% union/hourly workforce", "-20pts", "Negative"]);
kl.push([]);
kl.push(["SCORING DIMENSIONS"]);
kl.push(["Dimension", "Weight", "Criteria"]);
kl.push(["ICP Alignment", "40%", "Industry match, size, ownership, stage compatibility"]);
kl.push(["Customer Similarity", "30%", "How similar to seller's named customers"]);
kl.push(["Competitive Landscape", "30%", "Incumbent vendor, switching cost, displacement opportunity"]);
kl.push([]);

// ICP Enums
kl.push(["ICP ANCHORED ENUMS (prevents drift between runs)"]);
kl.push(["Field", "Option 1", "Option 2", "Option 3", "Option 4", "Option 5"]);
kl.push(["Company Size", "1-49 employees", "50-499", "500-4,999", "5,000-49,999", "50,000+"]);
kl.push(["Revenue Range", "<$10M", "$10M-$100M", "$100M-$1B", "$1B-$10B", "$10B+"]);
kl.push(["Deal Size", "<$10K ACV", "$10K-$50K", "$50K-$250K", "$250K-$1M", "$1M+"]);
kl.push(["Sales Cycle", "<30 days", "30-60 days", "60-90 days", "90-180 days", "180+ days"]);
kl.push(["Adoption Profile", "Innovator", "Early Adopter", "Early Majority", "Late Majority", ""]);
kl.push(["Ownership", "VC-backed", "PE-backed", "Public", "Privately-held", "Bootstrapped"]);
kl.push(["Geography", "North America", "EMEA", "APAC", "LATAM", "Global"]);
kl.push([]);

// RFP sources
kl.push(["RFP INTELLIGENCE SOURCES"]);
kl.push(["Source", "Region", "URL", "Coverage", "Signal Value"]);
kl.push(["SAM.gov", "USA", "sam.gov", "All federal >$25K", "HIGH"]);
kl.push(["FPDS-NG", "USA", "fpds.gov", "Awarded federal contracts since 1993", "HIGH"]);
kl.push(["USASpending.gov", "USA", "usaspending.gov", "All federal spending", "HIGH"]);
kl.push(["DemandStar", "USA", "demandstar.com", "State/local/municipal — all 50 states", "MED"]);
kl.push(["TED Europa", "EU", "ted.europa.eu", "All EU+EEA — ~700 notices/day", "HIGH"]);
kl.push(["Find a Tender", "UK", "find-tender.service.gov.uk", "UK public sector", "HIGH"]);
kl.push(["AusTender", "APAC", "tenders.gov.au", "Australian federal", "HIGH"]);
kl.push(["GeBIZ", "APAC", "gebiz.gov.sg", "Singapore government", "HIGH"]);
kl.push(["MERX", "APAC", "merx.com", "Canadian federal + provincial", "HIGH"]);
kl.push(["World Bank", "Global", "projects.worldbank.org", "$50B+/year globally", "HIGH"]);
kl.push(["UNGM", "Global", "ungm.org", "All UN agency procurement", "HIGH"]);
kl.push([]);

// NAICS/CPV
kl.push(["NAICS CODES (USA — SAM.gov)"]);
kl.push(["Category", "Code 1", "Code 2", "Code 3", "Code 4"]);
kl.push(["Fintech/Payments", "522320", "522390", "523130", "523999"]);
kl.push(["SaaS/Software", "511210", "541511", "541512", "541519"]);
kl.push(["AI/ML", "541715", "541511", "541512", ""]);
kl.push(["Data Analytics", "541511", "541519", "518210", ""]);
kl.push(["Compliance/RegTech", "541611", "541690", "522320", ""]);
kl.push(["Digital Rewards", "541613", "541810", "454111", ""]);
kl.push(["Healthcare IT", "621111", "621610", "541512", ""]);
kl.push(["HR/Workforce", "561311", "541612", "561320", ""]);
kl.push([]);
kl.push(["CPV CODES (EU — TED)"]);
kl.push(["Category", "Code 1", "Code 2", "Code 3", "Code 4"]);
kl.push(["Fintech/Payments", "66000000", "66100000", "66110000", "72000000"]);
kl.push(["Digital Rewards", "79342200", "79342300", "72212000", ""]);
kl.push(["SaaS/Software", "72000000", "72200000", "72260000", "48000000"]);
kl.push(["AI/ML", "72212000", "72316000", "48311000", ""]);
kl.push(["Data Analytics", "72316000", "72300000", "72322000", ""]);
kl.push(["Compliance/RegTech", "79100000", "72316000", "66171000", ""]);
kl.push(["Healthcare IT", "72000000", "85000000", "72212000", ""]);
kl.push(["HR/Workforce", "79600000", "72512000", "79212000", ""]);
kl.push([]);

// Proof pack rules
kl.push(["PROOF PACK RULES (9 rules injected into every prompt)"]);
kl.push(["#", "Rule"]);
kl.push([1, "Cite SPECIFIC named customer when claiming 'we've done this before.' Never invent names."]);
kl.push([2, "Use unique differentiators to justify 'why us' — never generic capabilities."]);
kl.push([3, "Frame outcomes using success factors — concrete, measurable, customer's language."]);
kl.push([4, "Quote uploaded docs verbatim for relevant proof points."]);
kl.push([5, "Use ONLY products from the catalog — do NOT invent product names."]);
kl.push([6, "If ungrounded, flag as '[unsupported — verify with seller]'."]);
kl.push([7, "Customer should feel deeply understood — everyone wins with measurable outcomes."]);
kl.push([8, "NEVER INVENT STATISTICS ABOUT THE SELLER. No fabricated counts, revenue, market share."]);
kl.push([9, "NEVER INVENT FACTS ABOUT THE TARGET. Use empty string for genuinely unknown facts."]);
kl.push([]);

// Segment notes
kl.push(["SEGMENT-SPECIFIC SELLING NOTES"]);
kl.push(["Segment", "Key Selling Notes"]);
kl.push(["Private Insurance", "Relationship first, compliance confidence before features, reference check culture, no artificial urgency"]);
kl.push(["Regional Banks", "Regulatory fluency required (BSA/AML/OCC), pilot-friendly, IT+InfoSec are hidden veto players"]);
kl.push(["Private Professional Services", "They know selling — be precise, focus on making THEIR delivery better, partner-level buy-in"]);
kl.push(["Large Private Tech", "Technical depth expected, security posture upfront, fast decisions if champion is right level"]);
kl.push(["PE Seller + SMB", "Vertical SaaS PE + matched SMB = 95% fit. Healthcare + Insurance top verticals. MSP channel for <250 employees"]);
kl.push([]);

// Qualification signals
kl.push(["QUALIFICATION SIGNALS"]);
kl.push(["Signal", "Impact"]);
kl.push(["Referral/partner deals", "Close 30%+ higher"]);
kl.push(["Funding <12 months", "18-month buying window"]);
kl.push(["Single-threaded prospect", "3x churn risk"]);
kl.push(["SMB cycle", "30-45 days"]);
kl.push(["Mid-market cycle", "60-90 days"]);
kl.push(["Enterprise cycle", "90-180 days"]);
kl.push(["Ellis 40% must-have test", "Critical qualifier"]);
kl.push(["Gartner 17% rule", "Buyers spend only 17% of time with vendors"]);

const ws3 = XLSX.utils.aoa_to_sheet(kl);
ws3["!cols"] = [
  { wch: 40 },  // Col A
  { wch: 20 },  // Col B
  { wch: 24 },  // Col C
  { wch: 36 },  // Col D
  { wch: 16 },  // Col E
  { wch: 16 },  // Col F
];
XLSX.utils.book_append_sheet(wb, ws3, "Knowledge Layer");

XLSX.writeFile(wb, OUT);
console.log(`Exported to: ${OUT}`);
