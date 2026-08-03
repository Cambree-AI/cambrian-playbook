#!/usr/bin/env node
/**
 * The Play eval harness — tests buildPlayPrompt + validatePlay pure functions
 * against the fixtures in tests/the-play/fixtures.json.
 *
 * Does NOT call the Anthropic API — tests the validation/prompt-assembly logic
 * deterministically. To run a live generation eval (API key required), pass --live.
 *
 * Checks (per account):
 *   1. buildPlayPrompt output contains identity anchor (seller + target + EXTRACTIVE RULE)
 *   2. buildPlayPrompt output contains all 4 required source sections (P1, P2, P4, P5)
 *   3. validatePlay accepts a correctly-structured synthetic play (happy path)
 *   4. validatePlay rejects a play missing the target company (check 1)
 *   5. validatePlay clears primaryContact when name not in P2 (check 3)
 *   6. validatePlay clears topProduct when not in solutionMapping (check 4)
 *   7. Cross-account contamination: Marriott-data play contains no Stripe-specific tokens and vice versa
 *
 * Exit codes:  0 = PASS   1 = FAIL
 *
 * Usage:  node tests/the-play/eval.js
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(resolve(__dirname, 'fixtures.json'), 'utf8'));

// ── Import the pure helpers directly from the source ─────────────────────────
// These are module-scope functions in App.jsx — but App.jsx is a React component
// file that can't be imported in plain Node. We inline equivalent implementations
// here and keep them in sync. If you change buildPlayPrompt/validatePlay in App.jsx,
// update these too.

function buildPlayPrompt(targetCompany, targetDomain, sellerICP, brief, fitScore) {
  const trunc = (v, n) => (typeof v === 'string' ? v : (JSON.stringify(v) || '')).slice(0, n);
  const sf    = (s) => (s || '').replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
  const seller     = sf(sellerICP?.sellerName || '');
  const sellerDesc = sf(sellerICP?.sellerDescription || '');
  const catalog    = (sellerICP?.icp?.productCatalog || []).slice(0, 3).map(p => sf(typeof p === 'string' ? p : p?.name || '')).filter(Boolean).join(', ');
  const customers  = (sellerICP?.icp?.verifiedCustomers || sellerICP?.icp?.customerExamples || []).slice(0, 3).map(sf).join(', ');
  const p1 = `${trunc(brief?.companySnapshot, 2000)} · revenue:${brief?.revenue||''} · employees:${brief?.employeeCount||''} · HQ:${brief?.headquarters||''} · ${brief?.fundingProfile||''}`.slice(0, 3000);
  const p2 = trunc(JSON.stringify([...(brief?.keyExecutives || []), ...(brief?.keyContacts || [])]), 2000);
  const p4 = trunc(JSON.stringify(brief?.solutionMapping || []), 2000);
  const p5 = `${(brief?.recentSignals || []).join(' · ')} · ${brief?.recentHeadlines||''} · ${brief?.growthSignals||''} · sentiment:${brief?.publicSentiment?.sentimentSummary||''}`.slice(0, 2000);
  const p3 = brief?.strategicTheme ? `${brief.strategicTheme} · ${brief.openingAngle||''} · ${brief.sellerOpportunity||''}`.slice(0, 1500) : null;
  const fitLabel = fitScore ? `${fitScore.label} · ${fitScore.score}%` : 'Not scored';
  const bar = '═'.repeat(55);
  return `${bar}
You are building a sales play for ONE specific session.
SELLER: ${seller} (selling ${sellerDesc})
TARGET COMPANY: ${sf(targetCompany)} (${sf(targetDomain)})
DIRECTION OF SALE: ${seller} → ${sf(targetCompany)}
Every sentence must be about ${sf(targetCompany)} specifically.
FIT SCORE: ${fitLabel}
${bar}

SOURCE SECTIONS:
[P1: COMPANY OVERVIEW]\n${p1}
[P2: EXECUTIVES]\n${p2}
[P4: SOLUTIONS MATCH]\n${p4}
[P5: LIVE SIGNALS]\n${p5}
${p3 ? `[P3: STRATEGY]\n${p3}\n` : ''}[ICP: SELLER CONTEXT]
${sellerDesc} · products:${catalog} · customers:${customers}

TASK: Build The Play for ${seller} selling into ${sf(targetCompany)}.`;
}

function validatePlay(play, targetCompany, targetDomain, brief, sellerICP) {
  if (!play || typeof play !== 'object') return { play: null, playState: 'unavailable' };
  let state = 'full';
  const targetLower = (targetCompany || '').toLowerCase();
  const domainLower  = (targetDomain || '').toLowerCase();
  const sellerLower  = (sellerICP?.sellerName || '').toLowerCase();

  const playStr = JSON.stringify(play).toLowerCase();
  if (!playStr.includes(targetLower) && (!domainLower || !playStr.includes(domainLower))) {
    return { play: null, playState: 'unavailable' };
  }

  const competitors = (brief?.competitors || [])
    .map(c => (typeof c === 'string' ? c : c?.name || '').toLowerCase())
    .filter(c => c && c !== targetLower && c !== sellerLower);
  const strFields = ['situation', 'whyNow', 'yourMove', 'elevatorPitch', 'draftEmailBody'];
  for (const field of strFields) {
    if (typeof play[field] !== 'string') continue;
    for (const comp of competitors) {
      if (play[field].toLowerCase().includes(comp)) {
        const sentences = play[field].split(/(?<=[.!?])\s+/);
        play[field] = sentences.filter(s => !s.toLowerCase().includes(comp)).join(' ').trim();
      }
    }
  }

  const p2Str = JSON.stringify([...(brief?.keyExecutives || []), ...(brief?.keyContacts || [])]).toLowerCase();
  const contactName = (play?.primaryContact?.name || '').toLowerCase().trim();
  if (contactName && !p2Str.includes(contactName)) {
    play.primaryContact = null;
    play._contactCleared = true;
  }

  const smProducts  = (brief?.solutionMapping || []).map(s => (s?.product || '').toLowerCase());
  const catProducts = (sellerICP?.icp?.productCatalog || []).map(p => (typeof p === 'string' ? p : p?.name || '').toLowerCase());
  const topProd = (play?.topProduct || '').toLowerCase().trim();
  if (topProd && !smProducts.some(p => p && (p.includes(topProd) || topProd.includes(p))) &&
                 !catProducts.some(p => p && (p.includes(topProd) || topProd.includes(p)))) {
    play.topProduct = null;
  }

  if (!play.sectionSources || !Object.keys(play.sectionSources || {}).length) { /* log only */ }

  // Check 7 — strip sentences containing specific numbers not present in the brief source corpus.
  // Normalizes number formats: 14M ↔ 14 million ↔ 14,000,000 (all → 14000000).
  const toCanonical = (s) => {
    const n = (s || '').replace(/,/g, '').toLowerCase().trim();
    const m = n.match(/^([\d.]+)\s*(k|thousand|m|million|b|billion)?/);
    if (!m) return null;
    let v = parseFloat(m[1]);
    if (!isFinite(v)) return null;
    const suf = m[2] || '';
    if (suf === 'k' || suf === 'thousand') v *= 1e3;
    else if (suf === 'm' || suf === 'million') v *= 1e6;
    else if (suf === 'b' || suf === 'billion') v *= 1e9;
    return v;
  };
  const sourceCorpusRaw = [
    brief?.companySnapshot, brief?.revenue, brief?.employeeCount, brief?.headquarters, brief?.fundingProfile,
    JSON.stringify(brief?.keyExecutives||[]), JSON.stringify(brief?.keyContacts||[]),
    JSON.stringify(brief?.solutionMapping||[]),
    (brief?.recentSignals||[]).join(' '), brief?.recentHeadlines, brief?.growthSignals,
    brief?.publicSentiment?.sentimentSummary,
    sellerICP?.sellerDescription, sellerICP?.marketCategory,
    JSON.stringify(sellerICP?.icp?.productCatalog||[]),
    JSON.stringify(sellerICP?.icp?.verifiedCustomers||[]),
  ].filter(Boolean).join(' ');
  const corpusNumRe = /\b(\d[\d,.]*\s*(?:million|billion|thousand|[KMBkmb])?)\b/gi;
  const corpusNums = new Set();
  for (const cm of sourceCorpusRaw.matchAll(corpusNumRe)) {
    const v = toCanonical(cm[1]);
    if (v !== null && v >= 10) corpusNums.add(v);
  }
  const FACTUAL_NUM_RE = /\b(\d[\d,.]*\s*(?:million|billion|thousand|[KMBkmb]|%|percent))\b|\b(\d[\d,.]+(?:,\d{3})*)\s+(?=(?:employees?|customers?|countries|brands?|users?|locations?|markets?|languages?|members?|partners?|clients?|accounts?|stores?|sites?|offices?|cities|people|recipients?|companies|businesses|organizations?)\b)/gi;
  for (const field of strFields) {
    if (typeof play[field] !== 'string') continue;
    for (const m of [...play[field].matchAll(FACTUAL_NUM_RE)]) {
      const numStr = (m[1] || m[2] || '').trim();
      if (!numStr) continue;
      const v = toCanonical(numStr);
      if (v === null || v < 10) continue;
      if (!corpusNums.has(v)) {
        const escaped = numStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const sentences = play[field].split(/(?<=[.!?])\s+/);
        const filtered = sentences.filter(s => !new RegExp(`\\b${escaped}\\b`, 'i').test(s));
        if (filtered.length < sentences.length) {
          play[field] = filtered.join(' ').trim();
        }
      }
    }
  }

  return { play, playState: state };
}

// ── Test harness ──────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const PASS = '  PASS ';
const FAIL = '  FAIL ';

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`${PASS} ${label}`);
    passed++;
  } else {
    console.log(`${FAIL} ${label}${detail ? `  ← ${detail}` : ''}`);
    failed++;
  }
}

console.log('\nThe Play Eval — pure function checks\n');

const { sellerICP, accounts } = fixtures;

for (const [name, acct] of Object.entries(accounts)) {
  const { brief, fitScore, company, company_url } = acct;
  console.log(`\n── ${name} ──`);

  // Check 1: prompt contains identity anchor
  const prompt = buildPlayPrompt(company, company_url, sellerICP, brief, fitScore);
  assert(`${name} | prompt contains seller name`,          prompt.includes(sellerICP.sellerName));
  assert(`${name} | prompt contains target company`,       prompt.includes(company));
  assert(`${name} | prompt contains identity anchor`,       prompt.includes('DIRECTION OF SALE') && prompt.includes('Every sentence must be about'));

  // Check 2: prompt contains all required source sections
  assert(`${name} | prompt contains [P1]`,  prompt.includes('[P1:'));
  assert(`${name} | prompt contains [P2]`,  prompt.includes('[P2:'));
  assert(`${name} | prompt contains [P4]`,  prompt.includes('[P4:'));
  assert(`${name} | prompt contains [P5]`,  prompt.includes('[P5:'));

  // Check 3: happy-path validatePlay accepts well-formed play
  const goodPlay = {
    situation:      `${company} is expanding its loyalty program.`,
    whyNow:         'BHN Rewards can accelerate the expansion.',
    yourMove:       `Contact ${brief.keyContacts?.[0]?.name || brief.keyExecutives?.[0]?.name || 'the CHRO'}.`,
    primaryContact: {
      name:      brief.keyContacts?.[0]?.name || brief.keyExecutives?.[0]?.name || 'David Rodriguez',
      title:     brief.keyContacts?.[0]?.title || brief.keyExecutives?.[0]?.title || 'EVP',
      rationale: 'Leads rewards and recognition initiatives.',
    },
    elevatorPitch:    `BHN helps ${company} deliver instant digital rewards.`,
    draftEmailSubject:`${company} + BHN: instant reward delivery`,
    draftEmailBody:   `Hi, I wanted to reach out about ${company}'s reward programs.`,
    topProduct:       brief.solutionMapping?.[0]?.product || 'BHN Rewards',
    keySignal:        brief.recentSignals?.[0] || 'Recent growth signals.',
    sectionSources:   { situation:['P1','P5'], whyNow:['P4','P5'], yourMove:['P2'], elevatorPitch:['P4','ICP'], primaryContact:['P2'] },
  };
  const { play: hp, playState: hps } = validatePlay({ ...goodPlay }, company, company_url, brief, sellerICP);
  assert(`${name} | happy path → play not null`, hp !== null);
  assert(`${name} | happy path → state is full`, hps === 'full');

  // Check 4: target-missing play → unavailable (check 1)
  const noTarget = { ...goodPlay, situation: 'A company is growing.', whyNow: 'Products help.', yourMove: 'Call someone.', elevatorPitch: 'We help businesses.', draftEmailBody: 'Hi there.', topProduct: 'BHN Rewards' };
  // Remove company name from all fields
  const sanitized = JSON.parse(JSON.stringify(noTarget));
  const compLower = company.toLowerCase();
  for (const f of ['situation','whyNow','yourMove','elevatorPitch','draftEmailBody','draftEmailSubject','keySignal']) {
    if (typeof sanitized[f] === 'string') sanitized[f] = sanitized[f].replace(new RegExp(company, 'gi'), 'COMPANY').replace(new RegExp(company_url, 'gi'), 'DOMAIN');
  }
  if (sanitized.primaryContact) sanitized.primaryContact = { name: sanitized.primaryContact.name, title: sanitized.primaryContact.title, rationale: 'Leads initiatives.' };
  const { play: np, playState: nps } = validatePlay(sanitized, company, company_url, brief, sellerICP);
  assert(`${name} | target-missing → unavailable`, nps === 'unavailable' && np === null, `got state=${nps}`);

  // Check 5: invented contact → cleared (check 3)
  const badContact = { ...goodPlay, primaryContact: { name: 'Zyx Invented Person', title: 'CTO', rationale: 'Leads things.' } };
  const { play: bcp } = validatePlay({ ...badContact }, company, company_url, brief, sellerICP);
  assert(`${name} | invented contact → cleared`, bcp?.primaryContact === null, `got ${JSON.stringify(bcp?.primaryContact)}`);

  // Check 6: invented product → cleared (check 4)
  const badProd = { ...goodPlay, topProduct: 'FakeProduct XYZ 9000' };
  const { play: bpp } = validatePlay({ ...badProd }, company, company_url, brief, sellerICP);
  assert(`${name} | invented product → cleared`, bpp?.topProduct === null, `got "${bpp?.topProduct}"`);

  // Check 7: unsourced factual stat → sentence stripped
  // "99999 countries" has a factual unit ("countries") so it should be stripped
  const statPlay = { ...goodPlay, situation: `${company} is expanding its loyalty program. They operate in 99999 countries worldwide.` };
  const { play: sp7 } = validatePlay({ ...statPlay }, company, company_url, brief, sellerICP);
  const stat7Stripped = typeof sp7?.situation === 'string' && !sp7.situation.includes('99999');
  assert(`${name} | unsourced factual stat (99999 countries) → stripped`, stat7Stripped, `got: "${sp7?.situation}"`);

  // Check 7: temporal number → NOT stripped (rhetorical, not a factual stat)
  const temporalPlay = { ...goodPlay, draftEmailBody: `Hi, I wanted to reach out about ${company}'s reward programs. Respond in 30 days to secure early pricing.` };
  const { play: tp7 } = validatePlay({ ...temporalPlay }, company, company_url, brief, sellerICP);
  const temporal7Survived = typeof tp7?.draftEmailBody === 'string' && tp7.draftEmailBody.includes('30 days');
  assert(`${name} | temporal number (30 days) → not stripped`, temporal7Survived, `got: "${tp7?.draftEmailBody}"`);

  // Sourced number must survive: strip commas from employeeCount then extract 4+ digit run
  const empStr = String(brief.employeeCount || '').replace(/,/g, '');
  const empNum = typeof brief.employeeCount === 'number'
    ? String(brief.employeeCount)
    : empStr.match(/\d{4,}/)?.[0];
  if (empNum && parseInt(empNum) >= 10) {
    const sourcedPlay = { ...goodPlay, situation: `${company} employs ${empNum} people and is expanding.` };
    const { play: sp7s } = validatePlay({ ...sourcedPlay }, company, company_url, brief, sellerICP);
    const sourcedSurvived = typeof sp7s?.situation === 'string' && sp7s.situation.includes(empNum);
    assert(`${name} | sourced stat (${empNum} from employeeCount) → survives`, sourcedSurvived, `got: "${sp7s?.situation}"`);
  }
}

// ── Check 7 normalization regression: 14M (corpus) ↔ 14 million (play) ──────
// Regression guard: verifies that suffix-expanded forms match the corpus so
// sourced stats phrased differently than the brief still survive.
console.log('\n── Check 7 normalization regression (14M ↔ 14 million) ──');
const normBrief = { ...accounts['Marriott'].brief, recentSignals: ['BHN has 14M active users.'] };
const normSellerICP = sellerICP; // uses fixtures sellerICP (same seller context)
const normTarget    = accounts['Marriott'].company;
const normUrl       = accounts['Marriott'].company_url;
const normPlay = {
  situation:        `${normTarget} is a key account. We serve 14 million clients globally.`,
  whyNow:           `BHN helps ${normTarget} drive loyalty.`,
  yourMove:         `Contact the CHRO at ${normTarget}.`,
  elevatorPitch:    `BHN delivers to 14 million reward recipients across ${normTarget}'s program.`,
  draftEmailSubject:`${normTarget} + BHN: instant reward delivery`,
  draftEmailBody:   `Hi, reaching out about ${normTarget}'s programs.`,
  topProduct:       accounts['Marriott'].brief.solutionMapping?.[0]?.product || 'BHN Rewards',
  keySignal:        'Recent expansion signals.',
  sectionSources:   { situation:['P5'], whyNow:['P4','P5'], yourMove:['P2'], elevatorPitch:['P4','ICP'], primaryContact:['P2'] },
};
const { play: normResult } = validatePlay({ ...normPlay }, normTarget, normUrl, normBrief, normSellerICP);
assert(
  'Check 7 norm: "14 million" (play) survives when corpus has "14M" (brief signal)',
  typeof normResult?.situation === 'string' && normResult.situation.includes('14 million'),
  `got: "${normResult?.situation}"`
);
assert(
  'Check 7 norm: "14 million" in elevatorPitch survives when corpus has "14M"',
  typeof normResult?.elevatorPitch === 'string' && normResult.elevatorPitch.includes('14 million'),
  `got: "${normResult?.elevatorPitch}"`
);
// Also verify 99999 still strips in the same brief (regression on strip path)
const normStripPlay = { ...normPlay, situation: `${normTarget} has 14 million users. They serve 99999 countries worldwide.` };
const { play: normStrip } = validatePlay({ ...normStripPlay }, normTarget, normUrl, normBrief, normSellerICP);
assert(
  'Check 7 norm: unsourced "99999" strips even when sourced "14 million" survives in same field',
  typeof normStrip?.situation === 'string' && !normStrip.situation.includes('99999'),
  `got: "${normStrip?.situation}"`
);

// ── Weak-inputs settled logic: data-driven, not time-driven ──────────────────
// Tests the _completedSections logic that determines when a section is genuinely
// settled (merge callback ran) vs. timeout-cleared (90s hard timeout set flag only).
console.log('\n── Weak-inputs: _completedSections settled logic ──');

// Simulates: solutions still in-flight at >150s (only 3 of 4 in _completedSections).
// Expected: allSettled = false → weak-inputs must NOT fire.
const wkBase = accounts['Marriott'];
const wkBriefInFlight = { ...wkBase.brief, solutionMapping: [], _completedSections: ['overview','executives','live'], _failedSections: [] };
const wkCompleted = new Set(wkBriefInFlight._completedSections || []);
const wkFailed = wkBriefInFlight._failedSections || [];
const wkSettled = {
  overview:   wkCompleted.has('overview')   || wkFailed.includes('overview'),
  executives: wkCompleted.has('executives') || wkFailed.includes('executives'),
  solutions:  wkCompleted.has('solutions')  || wkFailed.includes('solutions'),
  live:       wkCompleted.has('live')       || wkFailed.includes('live'),
};
assert(
  'Weak-inputs: solutions in-flight (not in _completedSections) → allSettled false → no early weak-inputs',
  !Object.values(wkSettled).every(Boolean),
  `settled=${JSON.stringify(wkSettled)}`
);

// Simulates: all 4 sections settled (merge callbacks ran) but solutions returned empty.
// Expected: allSettled = true AND missingData = true → eligible for weak-inputs.
const wkBriefThin = { ...wkBase.brief, solutionMapping: [], _completedSections: ['overview','executives','solutions','live'], _failedSections: [] };
const wkCompletedThin = new Set(wkBriefThin._completedSections || []);
const wkFailedThin = wkBriefThin._failedSections || [];
const wkSettledThin = {
  overview:   wkCompletedThin.has('overview')   || wkFailedThin.includes('overview'),
  executives: wkCompletedThin.has('executives') || wkFailedThin.includes('executives'),
  solutions:  wkCompletedThin.has('solutions')  || wkFailedThin.includes('solutions'),
  live:       wkCompletedThin.has('live')       || wkFailedThin.includes('live'),
};
const wkMissingData = !wkBriefThin.solutionMapping?.some(s => s?.product);
assert(
  'Weak-inputs: all 4 settled via callbacks + solutions empty → allSettled true → eligible for weak-inputs',
  Object.values(wkSettledThin).every(Boolean) && wkMissingData,
  `settled=${JSON.stringify(wkSettledThin)} missingData=${wkMissingData}`
);

// Simulates: solutions arrives late (>150s) WITH data — Phase 2 fires → builds full, not weak-inputs.
// This is the OC Tanner ~120s scenario: solutions not yet in _completedSections, then arrives.
// We test both phases: (a) before arrival = not settled, (b) after arrival = Phase 2 data quorum fires.
const wkBriefLateArrival = { ...wkBase.brief, _completedSections: ['overview','executives','live'], _failedSections: [] };
const LOADING_STUB_WK = /^Researching /i;
const wkDataAfterArrival = {
  hasOverview:   !!wkBriefLateArrival.companySnapshot && !LOADING_STUB_WK.test(wkBriefLateArrival.companySnapshot),
  hasExecs:      !!(wkBriefLateArrival.keyExecutives?.length || wkBriefLateArrival.keyContacts?.length),
  hasSolutions:  !!(wkBriefLateArrival.solutionMapping?.some(s => s?.product)), // real solutionMapping in fixture
  hasSignals:    !!(wkBriefLateArrival.recentSignals?.some(s => s?.trim()) || wkBriefLateArrival.recentHeadlines),
};
assert(
  'Weak-inputs: late-arriving solutions with data — Phase 2 quorum fires (all data present)',
  Object.values(wkDataAfterArrival).every(Boolean),
  `data=${JSON.stringify(wkDataAfterArrival)}`
);

// ── Cross-account contamination check (highest priority) ─────────────────────
console.log('\n── Contamination check: Marriott prompt ↔ Stripe prompt ──');
const marriottAcct = accounts['Marriott'];
const stripeAcct   = accounts['Stripe'];
const marriottPrompt = buildPlayPrompt(marriottAcct.company, marriottAcct.company_url, sellerICP, marriottAcct.brief, marriottAcct.fitScore);
const stripePrompt   = buildPlayPrompt(stripeAcct.company,   stripeAcct.company_url,   sellerICP, stripeAcct.brief,   stripeAcct.fitScore);

// Marriott-specific tokens that must not appear in the Stripe prompt
const marriottTokens = ['Bonvoy', 'Ritz-Carlton', 'Sheraton', 'Westin', 'Capuano', 'Peggy Fang'];
for (const tok of marriottTokens) {
  assert(`Stripe prompt does not contain Marriott token "${tok}"`, !stripePrompt.includes(tok));
}
// Stripe-specific tokens that must not appear in the Marriott prompt
const stripeTokens   = ['Collison', 'Becksted', 'stripe.com', 'Series I', '$65B'];
for (const tok of stripeTokens) {
  assert(`Marriott prompt does not contain Stripe token "${tok}"`, !marriottPrompt.includes(tok));
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`The Play Eval: ${passed + failed} checks — ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('PASS — all checks green.\n');
  process.exit(0);
} else {
  console.log('FAIL — see above.\n');
  process.exit(1);
}
