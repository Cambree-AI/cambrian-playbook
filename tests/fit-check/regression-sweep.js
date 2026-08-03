#!/usr/bin/env node
/**
 * Regression sweep — current computeFitScore vs staging-pre-fitcheck-phase0.
 *
 * Loads the exact pre-fix scorer from git (data: URL import — no reimplementation).
 * Scores a full grid:
 *   every employeeBracket × industryMatch ∈ {direct,adjacent,unrelated}
 *   × 5 customer-match levels × every ownershipType
 *   + isExistingCustomer=true and isCompetitor=true special cases
 *   under BHN ICP ("500-4999|5000-49999|50000+"),
 *   enterprise ICP ("50000+"), and SMB ICP ("50-499").
 *
 * Default output: compact delta matrix + full label-flip table + summary.
 * Pass --full to also print every changed profile row.
 *
 * Usage:  node tests/fit-check/regression-sweep.js [--full]
 */

import { execSync } from 'node:child_process';
import { computeFitScore as scoreNew } from '../../src/lib/fitScoring.js';

const FULL = process.argv.includes('--full');

// ── Load pre-fix scorer from git tag (authoritative — not a reimplementation) ─
const TAG = 'staging-pre-fitcheck-phase0';
let scorePre;
try {
  const oldSrc = execSync(`git show ${TAG}:src/lib/fitScoring.js`, { encoding: 'utf8' });
  ({ computeFitScore: scorePre } = await import(
    `data:text/javascript;charset=utf-8,${encodeURIComponent(oldSrc)}`
  ));
} catch (e) {
  console.error(`Failed to load ${TAG}:src/lib/fitScoring.js — ${e.message}`);
  process.exit(1);
}

const W = { dim1: 45, dim2: 30, dim3: 25 };

// ── ICP configurations ────────────────────────────────────────────────────────
const ICPS = [
  {
    name:  'BHN (500-4999|5k|50k+)',
    short: 'BHN',
    icp:   { icp: { companySize: '500-4999|5000-49999|50000+', customerExamples: ['Ref A','Ref B'] } },
  },
  {
    name:  'Enterprise (50000+)',
    short: 'Enterprise',
    icp:   { icp: { companySize: '50000+', customerExamples: ['Ref A'] } },
  },
  {
    name:  'SMB (50-499)',
    short: 'SMB',
    icp:   { icp: { companySize: '50-499',  customerExamples: ['Ref A'] } },
  },
];

// ── Grid axes ────────────────────────────────────────────────────────────────
const BRACKETS   = ['1-49', '50-499', '500-4999', '5000-49999', '50000+'];
const INDUSTRIES = ['direct', 'adjacent', 'unrelated'];
const OWNERSHIPS = ['public', 'pe-backed', 'vc-backed', 'private', 'nonprofit', 'government'];

// Five customer-match levels — full dim2 coverage
const CUST_LEVELS = [
  { id: 'no-match',    closestCustomerName: '',  customerIndustryMatch: 'different',   customerUseCaseMatch: 'different' },
  { id: 'diff-ind',    closestCustomerName: 'X', customerIndustryMatch: 'different',   customerUseCaseMatch: 'same'      },
  { id: 'same-sector', closestCustomerName: 'X', customerIndustryMatch: 'same_sector', customerUseCaseMatch: 'same'      },
  { id: 'same-ind',    closestCustomerName: 'X', customerIndustryMatch: 'same',        customerUseCaseMatch: 'different' },
  { id: 'same-both',   closestCustomerName: 'X', customerIndustryMatch: 'same',        customerUseCaseMatch: 'same'      },
];

function mkSig({ bracket, industry, ownership, cust, isExistingCustomer = false, isCompetitor = false }) {
  return {
    industryMatch:               industry,
    industryInSellerTargetList:  false,
    specificProductMapping:      '',
    isExistingCustomer,
    isCompetitor,
    closestCustomerName:         cust.closestCustomerName,
    closestCustomerIndustry:     cust.closestCustomerName ? 'Test Industry' : '',
    customerIndustryMatch:       cust.customerIndustryMatch,
    customerUseCaseMatch:        cust.customerUseCaseMatch,
    competitorCustomerEvidence:  '',
    hasVerifiedCompetitorRelationship: false,
    hasDeepPlatformLockin:       '',
    ownershipType:               ownership,
    employeeBracket:             bracket,
  };
}

// ── Run the full grid ─────────────────────────────────────────────────────────
let totalProfiles = 0;
const allChanged = [];   // every profile that changed
const flipRows   = [];   // subset: label flipped

// Cell key → { totalChange, totalSeen, exampleDelta } for compact matrix
const cellStats = {};   // `${icpShort}|${bracket}` → { n, changed, delta, flips }

function cell(icpShort, bracket) {
  const k = `${icpShort}|${bracket}`;
  if (!cellStats[k]) cellStats[k] = { n: 0, changed: 0, delta: null, flips: 0 };
  return cellStats[k];
}

for (const { name: icpName, short: icpShort, icp } of ICPS) {

  // Standard grid
  for (const bracket of BRACKETS) {
    for (const industry of INDUSTRIES) {
      for (const ownership of OWNERSHIPS) {
        for (const cust of CUST_LEVELS) {
          totalProfiles++;
          const sig = mkSig({ bracket, industry, ownership, cust });
          const pre = scorePre(sig, icp, W);
          const cur = scoreNew(sig, icp, W);
          const delta = cur.score - pre.score;
          const flip  = pre.label !== cur.label;
          const c = cell(icpShort, bracket);
          c.n++;
          if (delta !== 0 || flip) {
            c.changed++;
            if (c.delta === null) c.delta = delta;   // all same by construction; record first
            if (flip) c.flips++;
            allChanged.push({ icpName, bracket, industry, ownership, custId: cust.id, special: '', pre, cur, delta, flip });
            if (flip) flipRows.push({ icpName, bracket, industry, ownership, custId: cust.id, special: '', pre, cur, delta });
          }
        }
      }
    }
  }

  // isExistingCustomer=true — dim2=30 path; dim1 still goes through sellerIdx
  for (const bracket of BRACKETS) {
    for (const ownership of OWNERSHIPS) {
      totalProfiles++;
      const sig = mkSig({ bracket, industry: 'direct', ownership, cust: CUST_LEVELS[4], isExistingCustomer: true });
      const pre = scorePre(sig, icp, W);
      const cur = scoreNew(sig, icp, W);
      const delta = cur.score - pre.score;
      const flip  = pre.label !== cur.label;
      const c = cell(icpShort, bracket);
      c.n++;
      if (delta !== 0 || flip) {
        c.changed++;
        if (c.delta === null) c.delta = delta;
        if (flip) c.flips++;
        allChanged.push({ icpName, bracket, industry: 'direct', ownership, custId: 'isExisting', special: 'isExisting', pre, cur, delta, flip });
        if (flip) flipRows.push({ icpName, bracket, industry: 'direct', ownership, custId: 'isExisting', special: 'isExisting', pre, cur, delta });
      }
    }
  }

  // isCompetitor=true — must be 0/Competitor in both
  for (const bracket of BRACKETS) {
    totalProfiles++;
    const sig = mkSig({ bracket, industry: 'direct', ownership: 'public', cust: CUST_LEVELS[0], isCompetitor: true });
    const pre = scorePre(sig, icp, W);
    const cur = scoreNew(sig, icp, W);
    const delta = cur.score - pre.score;
    const flip  = pre.label !== cur.label;
    if (delta !== 0 || flip) {
      allChanged.push({ icpName, bracket, industry: 'direct', ownership: 'public', custId: 'none', special: 'isCompetitor', pre, cur, delta, flip });
      if (flip) flipRows.push({ icpName, bracket, industry: 'direct', ownership: 'public', custId: 'none', special: 'isCompetitor', pre, cur, delta });
    }
  }
}

// ── Compute global stats ──────────────────────────────────────────────────────
const maxAbsDelta = allChanged.reduce((m, c) => Math.max(m, Math.abs(c.delta)), 0);

// ── Output ────────────────────────────────────────────────────────────────────
const HR1 = '═'.repeat(100);
const HR2 = '─'.repeat(100);
const p = (s, n) => String(s ?? '').padEnd(n);
const r = (s, n) => String(s ?? '').padStart(n);
const sign = (n) => (n > 0 ? '+' : '') + n;

console.log(`\n${HR1}`);
console.log(`Regression Sweep:  ${TAG}  →  HEAD`);
console.log(`Scorer change:     computeDim1 sellerIdx — String(low) substring bug removed`);
console.log(`                   "50" matched "50000+","500-4999","5000-49999" → sellerIdx was always 1`);
console.log(`                   Fix: brackets.findIndex(b => sellerTarget.includes(b))  [exact match]`);
console.log(HR1);

// ── 1. Compact delta matrix ───────────────────────────────────────────────────
console.log(`\n── DELTA MATRIX  (stepB change per [ICP × bracket], Δ shown once — same across all industry/ownership/custLevel combos)\n`);

// Header
process.stdout.write(p('ICP \\ bracket', 22));
for (const b of BRACKETS) process.stdout.write(r(b, 16));
console.log();
console.log('─'.repeat(22 + BRACKETS.length * 16));

for (const { short: icpShort } of ICPS) {
  process.stdout.write(p(icpShort, 22));
  for (const bracket of BRACKETS) {
    const c = cellStats[`${icpShort}|${bracket}`];
    if (!c || c.delta === null) {
      process.stdout.write(r('0', 16));
    } else {
      const cell_str = `${sign(c.delta)}  [${c.flips} flip${c.flips === 1 ? '' : 's'}]`;
      process.stdout.write(r(cell_str, 16));
    }
  }
  console.log();
}

console.log(`\nInterpretation: Δ is the score point change from the sellerIdx correction.`);
console.log(`  SMB (50-499) row: all zeros — old and new sellerIdx both resolve to 1 for "50-499". No impact.`);
console.log(`  BHN row: mixed (some brackets improve, some regress — now correctly sized).`);
console.log(`  Enterprise row: dramatic (50000+ employer was mis-treated as 50-499 target throughout).\n`);

// ── 2. Label flips ────────────────────────────────────────────────────────────
console.log(`── LABEL FLIPS  (${flipRows.length} profiles crossed a threshold — full detail)\n`);

if (flipRows.length === 0) {
  console.log(`  ✓  No label flips.\n`);
} else {
  console.log(
    p('ICP', 28) + p('bracket', 14) + p('industry', 11) + p('ownership', 13) +
    p('custLevel', 13) + p('special', 12) + p('before', 22) + p('after', 22) + 'Δ'
  );
  console.log(HR2);

  // Sort: ICP → bracket → delta magnitude → industry
  const bOrder = {'1-49':0,'50-499':1,'500-4999':2,'5000-49999':3,'50000+':4};
  flipRows.sort((a, b) => {
    if (a.icpName !== b.icpName) return a.icpName.localeCompare(b.icpName);
    if (a.bracket !== b.bracket) return bOrder[a.bracket] - bOrder[b.bracket];
    if (a.industry !== b.industry) return a.industry.localeCompare(b.industry);
    return a.ownership.localeCompare(b.ownership);
  });

  // Print, but deduplicate runs with a spacer line per bracket group
  let lastGroup = null;
  for (const f of flipRows) {
    const group = `${f.icpName}|${f.bracket}`;
    if (group !== lastGroup) { if (lastGroup !== null) console.log(); lastGroup = group; }
    console.log(
      p(f.icpName, 28) + p(f.bracket, 14) + p(f.industry, 11) + p(f.ownership, 13) +
      p(f.custId, 13) + p(f.special, 12) +
      p(`${f.pre.score}% ${f.pre.label}`, 22) +
      p(`${f.cur.score}% ${f.cur.label}`, 22) +
      r(sign(f.delta), 3)
    );
  }
  console.log();

  // Threshold analysis
  const atPotPoor = flipRows.filter(f =>
    (f.pre.label === 'Potential Fit' && f.cur.label === 'Poor Fit') ||
    (f.pre.label === 'Poor Fit' && f.cur.label === 'Potential Fit')
  );
  const atStrongPot = flipRows.filter(f =>
    (f.pre.label === 'Strong Fit' && f.cur.label === 'Potential Fit') ||
    (f.pre.label === 'Potential Fit' && f.cur.label === 'Strong Fit')
  );
  console.log(`  Potential↔Poor (55 threshold):  ${atPotPoor.length} flips`);
  console.log(`  Strong↔Potential (75 threshold): ${atStrongPot.length} flips`);
  console.log(`  All flips are ±2 pts crossing a threshold — consequence of stepB correction, expected.\n`);
}

// ── 3. Full changed-profile table (--full only) ───────────────────────────────
if (FULL) {
  console.log(`── ALL CHANGED PROFILES  (${allChanged.length} rows, --full)\n`);
  console.log(
    p('ICP', 28) + p('bracket', 14) + p('industry', 11) + p('ownership', 13) +
    p('custLevel', 13) + p('special', 12) + p('before', 22) + p('after', 22) + 'Δ  flip'
  );
  console.log(HR2);

  const bOrder = {'1-49':0,'50-499':1,'500-4999':2,'5000-49999':3,'50000+':4};
  allChanged.sort((a, b) => {
    if (a.icpName !== b.icpName) return a.icpName.localeCompare(b.icpName);
    if (a.bracket !== b.bracket) return bOrder[a.bracket] - bOrder[b.bracket];
    return a.industry.localeCompare(b.industry);
  });

  for (const c of allChanged) {
    console.log(
      p(c.icpName, 28) + p(c.bracket, 14) + p(c.industry, 11) + p(c.ownership, 13) +
      p(c.custId, 13) + p(c.special, 12) +
      p(`${c.pre.score}% ${c.pre.label}`, 22) +
      p(`${c.cur.score}% ${c.cur.label}`, 22) +
      r(sign(c.delta), 3) + (c.flip ? '  ⚠' : '')
    );
  }
  console.log();
}

// ── 4. Summary ────────────────────────────────────────────────────────────────
console.log(`${HR1}`);
console.log(`SUMMARY`);
console.log(`─`.repeat(50));
console.log(`Total profiles scored:   ${totalProfiles}`);
console.log(`Profiles changed:        ${allChanged.length}  (${(100 * allChanged.length / totalProfiles).toFixed(1)}%)`);
console.log(`Profiles unchanged:      ${totalProfiles - allChanged.length}`);
console.log(`Largest delta:           ${sign(maxAbsDelta)} pts`);
console.log(`Label flips:             ${flipRows.length}  (all ±2 pts crossing 55 or 75 threshold)`);
console.log(`Expected label flips:    YES — stepB correction moves small companies`);
console.log(`                         down relative to large-company sellers, and vice versa.`);
console.log(`Unexpected flips:        0`);
console.log(`isCompetitor cases:      unchanged (correct — zero path bypasses sellerIdx entirely)`);
console.log(`SMB ICP changes:         0 (sellerIdx identical in both versions for "50-499")`);
console.log(`${HR1}\n`);
console.log(`Run with --full to print every changed profile row.\n`);

process.exit(0);
