#!/usr/bin/env node
/**
 * Golden-Set Deterministic Scoring Test. Plain Node ESM, no test framework.
 *
 * Uses locked per-account signals to assert computeFitScore produces scores
 * within the validated floor/ceiling for every golden account. No LLM, no network.
 * This is the fast offline regression that CI can run on every commit.
 *
 * Exit codes:
 *   0 = PASS  — all accounts land within their locked ranges
 *   1 = FAIL  — one or more accounts outside locked range (regression)
 *   2 = PENDING — signals fixture not populated (NOT a pass — same gate as noop.js)
 *
 * Usage:  node tests/fit-check/golden-scores.js
 *
 * Matches the style of tests/golden-set/run.js (plain Node, no Jest/Vitest).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { computeFitScore } from '../../src/lib/fitScoring.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(readFileSync(resolve(__dirname, p), 'utf8'));

// Pin default weights — same rationale as noop.js.
const DEFAULT_FIT_WEIGHTS = { dim1: 45, dim2: 30, dim3: 25 };

const isPopulated = (s) =>
  s && typeof s === 'object' && typeof s.industryMatch === 'string';

function main() {
  const golden  = read('golden-set.json');
  const fixture = read('signals-fixture.json');

  const sellerICP = fixture.sellerICP;
  const icpReady  = sellerICP?.icp?.companySize &&
    !String(sellerICP.icp.companySize).startsWith('FILL');

  const missing = golden.accounts
    .map((a) => a.name)
    .filter((name) => !isPopulated(fixture.accounts?.[name]));

  // ── PENDING gate — same logic as noop.js ───────────────────────────────────
  if (!icpReady || missing.length) {
    console.log('\nPENDING — Golden-scores test cannot run yet. This is NOT a pass.');
    console.log('Phase 2 is blocked until this script exits 0.\n');
    if (!icpReady)   console.log('  ✗  signals-fixture.json → sellerICP not populated');
    if (missing.length) console.log(`  ✗  signals not populated for: ${missing.join(', ')}`);
    console.log('\nPopulate signals-fixture.json from the Step 1 [scoreFit] run, then re-run.\n');
    process.exit(2);
  }

  // ── Score assertions ────────────────────────────────────────────────────────
  console.log(`\nGolden-Set Deterministic Scoring — ${golden.accounts.length} accounts (${fixture.seller})\n`);

  let failures = 0;
  for (const acct of golden.accounts) {
    const signals = fixture.accounts[acct.name];
    if (!signals) {
      console.log(`  SKIP  ${acct.name.padEnd(18)}  no signals in fixture`);
      continue;
    }

    const result = computeFitScore(signals, sellerICP, DEFAULT_FIT_WEIGHTS);

    const labelOk = result.label === acct.label;
    const floorOk = result.score >= acct.scoreFloor;
    const ceilOk  = result.score <= acct.scoreCeiling;
    const pass    = labelOk && floorOk && ceilOk;

    if (pass) {
      console.log(`  PASS  ${acct.name.padEnd(18)}  ${result.score}%  ${result.label}  (range [${acct.scoreFloor},${acct.scoreCeiling}])`);
    } else {
      failures++;
      const reasons = [];
      if (!labelOk) reasons.push(`label="${result.label}" want "${acct.label}"`);
      if (!floorOk) reasons.push(`score ${result.score} below floor ${acct.scoreFloor}`);
      if (!ceilOk)  reasons.push(`score ${result.score} above ceiling ${acct.scoreCeiling}`);
      console.log(`  FAIL  ${acct.name.padEnd(18)}  ${result.score}%  ${result.label}  → ${reasons.join(', ')}`);
      console.log(`        ${''.padEnd(18)}  dims [${result.rawDim1}/${result.rawDim2}/${result.rawDim3}]`);
    }
  }

  console.log(`\nResult: ${golden.accounts.length - failures}/${golden.accounts.length} accounts in range.\n`);

  if (failures) {
    console.log('FAIL — one or more accounts outside locked range.');
    console.log('Either the scorer regressed, or the locked ranges need re-validation.\n');
    process.exit(1);
  }

  console.log('PASS — all accounts within locked score ranges.\n');
  process.exit(0);
}

main();
